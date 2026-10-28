import { controllerPresets } from './controllers.js'
import { addDeckPresets } from './deck.js'
import {
	addGraphicsPresets,
	addToSection,
	normalizeStyleOverrides,
	sectionsToStructure,
	type PresetSections,
} from './graphics.js'
import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../instance.js'
import type { ModuleTypes } from '../companion.js'
import {
	INK,
	TALLY,
	channelAccent,
	applyPresentation,
	tone,
	controlSource,
	labelTile,
	numberTile,
	pillTile,
	stepTile,
	tallyTile,
	toggleTile,
	valueTile,
	type Layered,
} from './design.js'

type Preset = Layered & { category: string; group?: string }

const GROUP_ORDER: Record<string, { order: number; displayName: string }> = {
	lens: { order: 1, displayName: 'Lens' },
	color: { order: 2, displayName: 'Color' },
	ptz: { order: 3, displayName: 'PTZ' },
	sensor: { order: 4, displayName: 'Sensor' },
	monitor: { order: 5, displayName: 'Monitor' },
	audio: { order: 6, displayName: 'Audio' },
	system: { order: 7, displayName: 'System' },
	record: { order: 8, displayName: 'Record' },
	matrix: { order: 9, displayName: 'Matrix' },
}

/** Property type from naming, used only when the API did not type the control. */
function getPropertyType(prop: string): 'boolean' | 'float' | 'enum' {
	const lowerProp = prop.toLowerCase()
	const booleanPatterns = ['auto_', 'enable', 'show_', 'hide_', 'flip_', 'mirror_', 'color_bars', 'mute', '_on', '_off']
	if (booleanPatterns.some((pattern) => lowerProp.includes(pattern))) return 'boolean'
	const enumPatterns = [
		'_mode',
		'_format',
		'shutter_speed',
		'nd_filter',
		'white_balance',
		'scene_file',
		'tally',
		'mounting_orientation',
	]
	if (enumPatterns.some((pattern) => lowerProp.includes(pattern))) return 'enum'
	return 'float'
}

/** Property group from naming, used only when the API did not group the control. */
function getPropertyGroup(prop: string): string {
	const p = prop.toLowerCase()
	if (['iris', 'focus', 'zoom', 'nd_filter', 'detail'].some((k) => p.includes(k))) return 'lens'
	if (['pan', 'tilt', 'preset', 'ptz', 'speed'].some((k) => p.includes(k))) return 'ptz'
	if (
		[
			'gain',
			'lift',
			'gamma',
			'hue',
			'saturation',
			'contrast',
			'brightness',
			'pedestal',
			'color',
			'red',
			'blue',
			'green',
			'white_balance',
		].some((k) => p.includes(k))
	)
		return 'color'
	if (['shutter', 'exposure', 'iso'].some((k) => p.includes(k))) return 'sensor'
	if (['osd', 'monitor', 'display'].some((k) => p.includes(k))) return 'monitor'
	if (['audio', 'volume', 'mute'].some((k) => p.includes(k))) return 'audio'
	if (['record', 'codec', 'storage'].some((k) => p.includes(k))) return 'record'
	if (p.includes('matrix')) return 'matrix'
	return 'system'
}

function formatPropertyName(prop: string): string {
	return prop.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getCameraDisplayName(
	camera: { uuid: string; name: string; virtualCameraEnable?: boolean },
	users: { uuid: string; name: string; attachedVirtualCameraUuid?: string }[],
	fallbackIndex: number,
): string {
	const assignedUser = users.find((u) => u.attachedVirtualCameraUuid === camera.uuid)
	if (assignedUser) return assignedUser.name || `User ${fallbackIndex}`
	if (camera.virtualCameraEnable) return `Virtual: ${camera.name || `CAM ${fallbackIndex}`}`
	return camera.name || `CAM ${fallbackIndex}`
}

/** Display names, with a number appended wherever two cameras share one, so sections stay apart. */
function cameraDisplayNames(self: ModuleInstance): Map<string, string> {
	const names = new Map<string, string>()
	const counts = new Map<string, number>()
	self.cameras.forEach((camera, index) => {
		const name = getCameraDisplayName(camera, self.users, index + 1)
		counts.set(name, (counts.get(name) ?? 0) + 1)
	})
	self.cameras.forEach((camera, index) => {
		const name = getCameraDisplayName(camera, self.users, index + 1)
		names.set(camera.uuid, (counts.get(name) ?? 0) > 1 ? `${name} ${index + 1}` : name)
	})
	return names
}

export function UpdatePresets(self: ModuleInstance): void {
	const presets: Record<string, Preset> = {}
	if (self.config.debug_messages) {
		self.log('debug', `UpdatePresets: ${self.cameras.length} cameras, ${self.users.length} users`)
	}

	/** What the API knows about a control; falls back to name heuristics. */
	const presentation = applyPresentation(self.presentation)
	const hiddenCameras = new Set(presentation.hiddenCameras)
	const hiddenModules = new Set(presentation.hiddenModules)
	const visibleCameras = self.cameras.filter((camera) => !hiddenCameras.has(camera.uuid))
	const defaultUser = self.users[0]?.uuid ?? ''
	const displayNames = cameraDisplayNames(self)
	const describe = (cameraUuid: string, prop: string) => {
		const control = self.control(cameraUuid, prop)
		const apiType = control?.type
		const kind: 'boolean' | 'enum' | 'float' =
			apiType === 'boolean'
				? 'boolean'
				: apiType === 'enum'
					? 'enum'
					: apiType === 'float' || apiType === 'integer'
						? 'float'
						: getPropertyType(prop)
		const group = (control as { group?: string } | undefined)?.group ?? getPropertyGroup(prop)
		const label = control?.name ?? formatPropertyName(prop)
		const min = typeof control?.min === 'number' ? control.min : 0
		const max = typeof control?.max === 'number' && control.max > min ? control.max : min + 1
		const unit = (control as { unit?: string | null } | undefined)?.unit ?? null
		const accent = channelAccent(prop, group)
		const movement = control?.behavior === 'movement'
		const namedSteps = !!control?.steps?.length
		return { kind, group, label, min, max, unit, accent, movement, namedSteps }
	}

	// ===================
	// CAMERA SETTINGS FOLDERS: one folder per camera, controls grouped
	// ===================
	visibleCameras.forEach((camera, cameraIndex) => {
		const camNum = cameraIndex + 1
		const cameraDisplayName = displayNames.get(camera.uuid) ?? getCameraDisplayName(camera, self.users, camNum)
		const cameraUuid = camera.uuid
		const camIdShort = cameraUuid.substring(0, 8)
		const assignedUser = self.users.find((u) => u.attachedVirtualCameraUuid === camera.uuid)
		const isUserCamera = !!assignedUser
		const userUuid = assignedUser?.uuid || ''
		const folderName = isUserCamera
			? `User selected camera settings: ${cameraDisplayName}`
			: `Camera settings: ${cameraDisplayName}`
		const properties = camera.assignedModuleControlProperties || []
		if (properties.length === 0) return

		const grouped: Record<string, string[]> = {}
		for (const prop of properties) {
			const group = describe(cameraUuid, prop).group
			;(grouped[group] ||= []).push(prop)
		}
		const sortedGroups = Object.keys(grouped).sort(
			(a, b) => (GROUP_ORDER[a]?.order || 99) - (GROUP_ORDER[b]?.order || 99),
		)

		for (const group of sortedGroups) {
			const displayName = GROUP_ORDER[group]?.displayName ?? formatPropertyName(group)

			for (const prop of grouped[group].sort()) {
				const info = describe(cameraUuid, prop)
				const propIdShort = prop.substring(0, 16)
				const variable = `$(multicam-rcp:camera_${camNum}_${prop})`
				if (info.kind === 'float') {
					// Companion 5 rejects an action whose options are missing or not among the dropdown choices,
					// so every option is always set to a valid value.
					const floatOptions = isUserCamera
						? { camera: cameraUuid, property: prop, step_size: 'user_setting', user: userUuid }
						: { camera: cameraUuid, property: prop, step_size: 'normal', user: defaultUser }
					const source = controlSource(cameraUuid, prop, info.min, info.max, info.unit, info.namedSteps)
					const up = [{ actionId: 'float_increase' as const, options: floatOptions }]
					const down = [{ actionId: 'float_decrease' as const, options: floatOptions }]
					presets[`cam_${camIdShort}_${propIdShort}_inc`] = {
						...stepTile({
							name: `${info.label} +`,
							label: info.label,
							glyph: '+',
							accent: info.accent,
							source,
							steps: [{ down: up, up: [] }],
						}),
						category: folderName,
						group: displayName,
					}
					presets[`cam_${camIdShort}_${propIdShort}_inc_val`] = {
						...stepTile({
							name: `${info.label} + (value)`,
							label: info.label,
							glyph: '+',
							accent: info.accent,
							source,
							showValue: true,
							steps: [{ down: up, up: [] }],
						}),
						category: folderName,
						group: displayName,
					}
					if (source) {
						presets[`cam_${camIdShort}_${propIdShort}_val`] = {
							...valueTile({
								name: `${info.label} · Gauge / rotary`,
								label: info.label,
								accent: info.accent,
								source,
								steps: [
									{
										down: [],
										up: [],
										rotate_left: [{ actionId: 'float_decrease', options: floatOptions }],
										rotate_right: [{ actionId: 'float_increase', options: floatOptions }],
									},
								],
							}),
							category: folderName,
							group: displayName,
						}
					} else {
						presets[`cam_${camIdShort}_${propIdShort}_val`] = {
							...labelTile({
								name: `${info.label} Value`,
								title: variable,
								subtitle: info.label,
								accent: info.accent,
								steps: [{ down: [], up: [] }],
							}),
							category: folderName,
							group: displayName,
						}
					}
					presets[`cam_${camIdShort}_${propIdShort}_dec`] = {
						...stepTile({
							name: `${info.label} -`,
							label: info.label,
							glyph: '−',
							accent: info.accent,
							source,
							steps: [{ down, up: [] }],
						}),
						category: folderName,
						group: displayName,
					}
				} else if (info.kind === 'boolean') {
					const lit = { feedbackId: 'property_bool', options: { camera: cameraUuid, property: prop } }
					presets[`cam_${camIdShort}_${propIdShort}_on`] = {
						...toggleTile({
							name: `${info.label} On`,
							label: info.label,
							stateText: 'ON',
							accent: info.accent,
							lit,
							litColor: TALLY.green,
							steps: [
								{
									down: [{ actionId: 'bool_set', options: { camera: cameraUuid, property: prop, value: true } }],
									up: [],
								},
							],
						}),
						category: folderName,
						group: displayName,
					}
					presets[`cam_${camIdShort}_${propIdShort}_off`] = {
						...toggleTile({
							name: `${info.label} Off`,
							label: info.label,
							stateText: 'OFF',
							accent: info.accent,
							lit: { ...lit, isInverted: true },
							litColor: INK.muted,
							steps: [
								{
									down: [{ actionId: 'bool_set', options: { camera: cameraUuid, property: prop, value: false } }],
									up: [],
								},
							],
						}),
						category: folderName,
						group: displayName,
					}
					const toggle = toggleTile({
						name: `${info.label} Toggle`,
						label: info.label,
						stateText: 'OFF',
						accent: info.accent,
						lit,
						litColor: TALLY.green,
						steps: [{ down: [{ actionId: 'bool_toggle', options: { camera: cameraUuid, property: prop } }], up: [] }],
					})
					// The toggle reads its state word from the same feedback.
					;(
						toggle.feedbacks[0] as {
							styleOverrides: { elementId: string; elementProperty: string; override: unknown }[]
						}
					).styleOverrides.push({ elementId: 'state', elementProperty: 'text', override: 'ON' })
					presets[`cam_${camIdShort}_${propIdShort}_toggle`] = { ...toggle, category: folderName, group: displayName }
				} else {
					const next = [{ actionId: 'enum_next' as const, options: { camera: cameraUuid, property: prop } }]
					const prev = [{ actionId: 'enum_prev' as const, options: { camera: cameraUuid, property: prop } }]
					const current = variable
					presets[`cam_${camIdShort}_${propIdShort}_next`] = {
						...stepTile({
							name: `${info.label} +`,
							label: info.label,
							glyph: '›',
							accent: info.accent,
							steps: [{ down: next, up: [] }],
						}),
						category: folderName,
						group: displayName,
					}
					presets[`cam_${camIdShort}_${propIdShort}_next_val`] = {
						...stepTile({
							name: `${info.label} + (value)`,
							label: info.label,
							glyph: '›',
							accent: info.accent,
							showValue: true,
							valueText: current,
							steps: [{ down: next, up: [] }],
						}),
						category: folderName,
						group: displayName,
					}
					presets[`cam_${camIdShort}_${propIdShort}_val`] = {
						...labelTile({
							name: `${info.label} Value`,
							title: current,
							subtitle: info.label,
							accent: info.accent,
							steps: [{ down: [], up: [] }],
						}),
						category: folderName,
						group: displayName,
					}
					presets[`cam_${camIdShort}_${propIdShort}_prev`] = {
						...stepTile({
							name: `${info.label} -`,
							label: info.label,
							glyph: '‹',
							accent: info.accent,
							steps: [{ down: prev, up: [] }],
						}),
						category: folderName,
						group: displayName,
					}
				}
			}
		}

		for (let presetNum = 1; presetNum <= 20; presetNum++) {
			const ptzOptions = isUserCamera
				? { camera: cameraUuid, preset: presetNum, action: 'user_setting', mode: 'user_setting', user: userUuid }
				: { camera: cameraUuid, preset: presetNum, action: 'recall', mode: 'normal', user: defaultUser }
			presets[`cam_${camIdShort}_ptz_${presetNum}`] = {
				...numberTile({
					name: `PTZ Preset ${presetNum}`,
					number: presetNum,
					caption: isUserCamera ? 'PTZ · user mode' : 'PTZ preset',
					accent: tone('ptz'),
					steps: [{ down: [{ actionId: 'ptz_preset', options: ptzOptions }], up: [] }],
				}),
				category: folderName,
				group: 'PTZ presets',
			}
		}
	})

	// ===================
	// CONTROLLER CHOICES and USER CONTROLS
	// ===================
	Object.assign(presets, controllerPresets(self))

	self.users.forEach((user, userIndex) => {
		const userNum = userIndex + 1
		const userName = user.name || `User ${userNum}`
		const userUuid = user.uuid
		const userIdShort = userUuid.substring(0, 8)
		const folderName = `User controls: ${userName}`

		for (const size of [
			{ id: 'big', label: 'Big', activeColor: 0xf87171 },
			{ id: 'normal', label: 'Normal', activeColor: 0x34d399 },
			{ id: 'small', label: 'Small', activeColor: 0x60a5fa },
		]) {
			presets[`user_${userIdShort}_stepsize_${size.id}`] = {
				...pillTile({
					name: `Step Size: ${size.label.toUpperCase()}`,
					label: size.label,
					caption: 'Step size',
					accent: tone('user'),
					activeColor: size.activeColor,
					active: { feedbackId: 'user_step_size', options: { user: userUuid, step_size: size.id } },
					steps: [
						{ down: [{ actionId: 'set_user_step_size', options: { user: userUuid, step_size: size.id } }], up: [] },
					],
				}),
				category: folderName,
				group: 'Step size',
			}
		}

		for (const mode of [
			{ id: 'normal', label: 'Normal', activeColor: 0x34d399 },
			{ id: 'tracing', label: 'Tracing', activeColor: 0xfbbf24 },
			{ id: 'scene', label: 'Scene', activeColor: 0x60a5fa },
		]) {
			presets[`user_${userIdShort}_ptzmode_${mode.id}`] = {
				...pillTile({
					name: `PTZ Mode: ${mode.label.toUpperCase()}`,
					label: mode.label,
					caption: 'PTZ mode',
					accent: tone('ptz'),
					activeColor: mode.activeColor,
					active: { feedbackId: 'user_ptz_mode', options: { user: userUuid, ptz_mode: mode.id } },
					steps: [
						{ down: [{ actionId: 'set_user_ptz_mode', options: { user: userUuid, ptz_mode: mode.id } }], up: [] },
					],
				}),
				category: folderName,
				group: 'PTZ mode',
			}
		}

		for (const action of [
			{ id: 'recall', label: 'Recall', activeColor: 0x34d399 },
			{ id: 'store', label: 'Store', activeColor: 0xf87171 },
		]) {
			presets[`user_${userIdShort}_ptzaction_${action.id}`] = {
				...pillTile({
					name: `PTZ Action: ${action.label.toUpperCase()}`,
					label: action.label,
					caption: 'PTZ action',
					accent: tone('ptz'),
					activeColor: action.activeColor,
					active: { feedbackId: 'user_ptz_action', options: { user: userUuid, ptz_action: action.id } },
					steps: [
						{ down: [{ actionId: 'set_user_ptz_action', options: { user: userUuid, ptz_action: action.id } }], up: [] },
					],
				}),
				category: folderName,
				group: 'PTZ action',
			}
		}

		presets[`user_${userIdShort}_info`] = {
			...labelTile({
				name: `${userName} Info`,
				title: `$(multicam-rcp:user_${userNum}_name)`,
				subtitle: `$(multicam-rcp:user_${userNum}_preview_camera)`,
				accent: tone('user'),
				steps: [{ down: [], up: [] }],
			}),
			category: folderName,
			group: 'Info',
		}
	})

	// ===================
	// ROUTERS: static output/input tiles per routable bus
	// ===================
	const sourceLabel = (tallyBus: (typeof self.tally)[number], inputIdx: number) => {
		const input = tallyBus.inputs?.[inputIdx]
		if (!input) return `Input ${inputIdx + 1}`
		if (input.routedFrom?.type === 'camera') {
			const camera = self.cameras.find((c) => c.uuid === input.routedFrom?.uuid)
			if (camera) return camera.name || input.customName || input.name
		}
		return input.customName || input.name || `Input ${inputIdx + 1}`
	}
	const routableBuses = self.tally.filter(
		(bus) =>
			!hiddenModules.has(bus.uuid) &&
			Object.keys(bus.inputs || {}).length > 0 &&
			Object.keys(bus.outputs || {}).length > 0,
	)
	const busName = (tallyBus: (typeof self.tally)[number]) =>
		tallyBus.name ||
		self.modules.find((m) => m.moduleUuid === tallyBus.uuid)?.customName ||
		self.modules.find((m) => m.moduleUuid === tallyBus.uuid)?.friendlyname ||
		`Router ${tallyBus.uuid.substring(0, 8)}`

	for (const tallyBus of routableBuses) {
		const moduleName = busName(tallyBus)
		const folderName = `Router: ${moduleName}`
		const busIdShort = tallyBus.uuid.substring(0, 8)
		for (const key of Object.keys(tallyBus.outputs || {})) {
			const outputIdx = parseInt(key)
			const output = tallyBus.outputs[outputIdx]
			if (!output || !output.routable) continue
			const outputName = output.customName || output.name || `Out ${outputIdx + 1}`
			presets[`router_${busIdShort}_out_${outputIdx}`] = {
				...tallyTile({
					name: `Output: ${outputName}`,
					title: outputName,
					caption: moduleName,
					accent: tone('route'),
					tallyLocal: 'tally',
					localVariables: [
						{
							variableType: 'feedback',
							variableName: 'tally',
							feedbackId: 'route_tally_state',
							options: { module: tallyBus.uuid, output: outputIdx },
						},
					],
					selected: {
						feedbackId: 'route_destination_selected_static',
						options: { module: tallyBus.uuid, output: outputIdx },
					},
					steps: [
						{
							down: [
								{ actionId: 'route_select_destination_static', options: { module: tallyBus.uuid, output: outputIdx } },
							],
							up: [],
						},
					],
				}),
				category: folderName,
				group: 'Outputs',
			}
		}
		for (const key of Object.keys(tallyBus.inputs || {})) {
			const inputIdx = parseInt(key)
			const input = tallyBus.inputs[inputIdx]
			if (!input || !input.routable) continue
			presets[`router_${busIdShort}_in_${inputIdx}`] = {
				...labelTile({
					name: `Input: ${sourceLabel(tallyBus, inputIdx)}`,
					title: sourceLabel(tallyBus, inputIdx),
					subtitle: `Input ${inputIdx + 1}`,
					accent: tone('route'),
					feedbackOverrides: [
						{
							feedbackId: 'route_source_active_static',
							options: { module: tallyBus.uuid, source: inputIdx },
							styleOverrides: [
								{ elementId: 'bg', elementProperty: 'color', override: 0x1f4d2b },
								{ elementId: 'accent', elementProperty: 'color', override: TALLY.green },
							],
						},
					],
					steps: [
						{
							down: [{ actionId: 'route_source_to_static', options: { module: tallyBus.uuid, source: inputIdx } }],
							up: [],
						},
					],
				}),
				category: folderName,
				group: 'Inputs',
			}
		}
	}

	// ===================
	// USER ROUTE: module select, then outputs and inputs that follow the user's selection
	// ===================
	const MAX_ROUTER_BUTTONS = 40
	for (const user of self.users) {
		const userIdShort = user.uuid.substring(0, 8)
		const folderName = `User route: ${user.name}`
		for (const tallyBus of routableBuses) {
			const moduleName = busName(tallyBus)
			presets[`user_route_${userIdShort}_module_${tallyBus.uuid.substring(0, 8)}`] = {
				...labelTile({
					name: `Select ${moduleName}`,
					title: moduleName,
					subtitle: 'Router',
					accent: tone('route'),
					feedbackOverrides: [
						{
							feedbackId: 'route_module_selected',
							options: { user: user.uuid, module: tallyBus.uuid },
							styleOverrides: [{ elementId: 'bg', elementProperty: 'color', override: 0x1e3a5f }],
						},
					],
					steps: [
						{
							down: [{ actionId: 'route_select_module', options: { user: user.uuid, module: tallyBus.uuid } }],
							up: [],
						},
					],
				}),
				category: folderName,
				group: 'Router',
			}
		}
		for (let outputIdx = 0; outputIdx < MAX_ROUTER_BUTTONS; outputIdx++) {
			presets[`user_route_${userIdShort}_out_${outputIdx}`] = {
				...labelTile({
					name: `Output ${outputIdx + 1}`,
					title: `$(multicam-rcp:user_${userIdShort}_route_out_${outputIdx}_name)`,
					subtitle: `Output ${outputIdx + 1}`,
					accent: tone('route'),
					feedbackOverrides: [
						{
							feedbackId: 'route_destination_selected_user',
							options: { user: user.uuid, output: outputIdx },
							styleOverrides: [{ elementId: 'bg', elementProperty: 'color', override: 0x5a3d0a }],
						},
					],
					steps: [
						{
							down: [{ actionId: 'route_select_destination', options: { user: user.uuid, output: outputIdx } }],
							up: [],
						},
					],
				}),
				category: folderName,
				group: 'Outputs',
			}
		}
		for (let inputIdx = 0; inputIdx < MAX_ROUTER_BUTTONS; inputIdx++) {
			presets[`user_route_${userIdShort}_in_${inputIdx}`] = {
				...labelTile({
					name: `Input ${inputIdx + 1}`,
					title: `$(multicam-rcp:user_${userIdShort}_route_in_${inputIdx}_name)`,
					subtitle: `Input ${inputIdx + 1}`,
					accent: tone('route'),
					feedbackOverrides: [
						{
							feedbackId: 'route_source_active_for_user',
							options: { user: user.uuid, source: inputIdx },
							styleOverrides: [
								{ elementId: 'bg', elementProperty: 'color', override: 0x1f4d2b },
								{ elementId: 'accent', elementProperty: 'color', override: TALLY.green },
							],
						},
					],
					steps: [
						{
							down: [{ actionId: 'route_source_to_selected', options: { user: user.uuid, source: inputIdx } }],
							up: [],
						},
					],
				}),
				category: folderName,
				group: 'Inputs',
			}
		}
	}

	const categories = new Set(
		Object.values(presets)
			.map((p) => p?.category)
			.filter(Boolean),
	)
	self.log('info', `Setting ${Object.keys(presets).length} presets in categories: ${Array.from(categories).join(', ')}`)
	const definitions: CompanionPresetDefinitions<ModuleTypes> = {}
	// Companion 5 shows two levels: sections, each holding groups of presets.
	const sections: PresetSections = new Map()
	for (const [id, { category, group, ...preset }] of Object.entries(presets)) {
		definitions[id] = preset
		addToSection(sections, category, group ?? 'General', id)
	}
	addGraphicsPresets(self, definitions, sections)
	addDeckPresets(self, definitions, sections)
	normalizeStyleOverrides(definitions)
	self.setPresetDefinitions(sectionsToStructure(sections), definitions)
}
