import { controllerPresets } from './controllers.js'
import { addGraphicsPresets } from './graphics.js'
import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { ModuleInstance, ModuleTypes } from './main.js'
import {
	ACCENT,
	INK,
	TALLY,
	banner,
	channelAccent,
	controlSource,
	displayTile,
	labelTile,
	numberTile,
	pillTile,
	rotaryTile,
	stepTile,
	tallyTile,
	toggleTile,
	valueTile,
	type Layered,
} from './design.js'

type Preset = Layered & { category: string }

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

export function UpdatePresets(self: ModuleInstance): void {
	const presets: Record<string, Preset> = {}
	if (self.config.debug_messages) {
		self.log('debug', `UpdatePresets: ${self.cameras.length} cameras, ${self.users.length} users`)
	}

	/** What the API knows about a control; falls back to name heuristics. */
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
		const accent = channelAccent(prop, ACCENT[group] ?? ACCENT.system)
		const movement = control?.behavior === 'movement'
		return { kind, group, label, min, max, unit, accent, movement }
	}

	// ===================
	// CAMERA SETTINGS FOLDERS: one folder per camera, controls grouped
	// ===================
	self.cameras.forEach((camera, cameraIndex) => {
		const camNum = cameraIndex + 1
		const cameraDisplayName = getCameraDisplayName(camera, self.users, camNum)
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
			const groupAccent = ACCENT[group] ?? ACCENT.system
			presets[`cam_${camIdShort}_group_${group}`] = {
				...banner(`[${displayName}]`, displayName, groupAccent),
				category: folderName,
			}

			for (const prop of grouped[group].sort()) {
				const info = describe(cameraUuid, prop)
				const propIdShort = prop.substring(0, 16)
				const variable = `$(multicam-rcp:camera_${camNum}_${prop})`
				if (info.kind === 'float') {
					const floatOptions = isUserCamera
						? { camera: cameraUuid, property: prop, step_size: 'user_setting', user: userUuid }
						: { camera: cameraUuid, property: prop, step_size: 'normal' }
					const source = controlSource(cameraUuid, prop, info.min, info.max, info.unit)
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
					}
					if (source) {
						presets[`cam_${camIdShort}_${propIdShort}_val`] = {
							...valueTile({
								name: `${info.label} Value`,
								label: info.label,
								accent: info.accent,
								source,
								steps: [{ down: [], up: [] }],
							}),
							category: folderName,
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
					presets[`cam_${camIdShort}_${propIdShort}_toggle`] = { ...toggle, category: folderName }
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
					}
				}
			}
		}

		presets[`cam_${camIdShort}_ptz_header`] = {
			...banner('[PTZ Presets]', 'PTZ presets', ACCENT.ptz),
			category: folderName,
		}
		for (let presetNum = 1; presetNum <= 20; presetNum++) {
			const ptzOptions = isUserCamera
				? { camera: cameraUuid, preset: presetNum, action: 'user_setting', mode: 'user_setting', user: userUuid }
				: { camera: cameraUuid, preset: presetNum, action: 'recall', mode: 'normal' }
			presets[`cam_${camIdShort}_ptz_${presetNum}`] = {
				...numberTile({
					name: `PTZ Preset ${presetNum}`,
					number: presetNum,
					caption: isUserCamera ? 'PTZ · user mode' : 'PTZ preset',
					accent: ACCENT.ptz,
					steps: [{ down: [{ actionId: 'ptz_preset', options: ptzOptions }], up: [] }],
				}),
				category: folderName,
			}
		}
	})

	// ===================
	// ROTARY FOLDERS: an encoder tile and the display above it, per numeric control
	// ===================
	self.cameras.forEach((camera, cameraIndex) => {
		const camNum = cameraIndex + 1
		const cameraDisplayName = getCameraDisplayName(camera, self.users, camNum)
		const cameraUuid = camera.uuid
		const camIdShort = cameraUuid.substring(0, 8)
		const assignedUser = self.users.find((u) => u.attachedVirtualCameraUuid === camera.uuid)
		const isUserCamera = !!assignedUser
		const userUuid = assignedUser?.uuid || ''
		const rotaryFolderName = isUserCamera
			? `Rotary: User selected: ${cameraDisplayName}`
			: `Rotary: ${cameraDisplayName}`
		const floatProperties = (camera.assignedModuleControlProperties || []).filter(
			(prop) => describe(cameraUuid, prop).kind === 'float',
		)
		if (floatProperties.length === 0) return

		for (const prop of floatProperties) {
			const info = describe(cameraUuid, prop)
			const propIdShort = prop.substring(0, 16)
			const floatOptions = isUserCamera
				? { camera: cameraUuid, property: prop, step_size: 'user_setting', user: userUuid }
				: { camera: cameraUuid, property: prop, step_size: 'normal' }
			const source = controlSource(cameraUuid, prop, info.min, info.max, info.unit)
			presets[`rotary_${camIdShort}_${propIdShort}`] = {
				...rotaryTile({
					name: `${info.label} · Rotary`,
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
				category: rotaryFolderName,
			}
			presets[`display_${camIdShort}_${propIdShort}`] = {
				...displayTile({
					name: `${info.label} · Display`,
					label: info.label,
					accent: info.accent,
					source,
					steps: [{ down: [], up: [] }],
				}),
				category: rotaryFolderName,
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

		presets[`user_${userIdShort}_stepsize_header`] = {
			...banner('[Adjust Step Size]', 'Step size', ACCENT.user),
			category: folderName,
		}
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
					accent: ACCENT.user,
					activeColor: size.activeColor,
					active: { feedbackId: 'user_step_size', options: { user: userUuid, step_size: size.id } },
					steps: [
						{ down: [{ actionId: 'set_user_step_size', options: { user: userUuid, step_size: size.id } }], up: [] },
					],
				}),
				category: folderName,
			}
		}

		presets[`user_${userIdShort}_ptzmode_header`] = {
			...banner('[PTZ Mode]', 'PTZ mode', ACCENT.ptz),
			category: folderName,
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
					accent: ACCENT.ptz,
					activeColor: mode.activeColor,
					active: { feedbackId: 'user_ptz_mode', options: { user: userUuid, ptz_mode: mode.id } },
					steps: [
						{ down: [{ actionId: 'set_user_ptz_mode', options: { user: userUuid, ptz_mode: mode.id } }], up: [] },
					],
				}),
				category: folderName,
			}
		}

		presets[`user_${userIdShort}_ptzaction_header`] = {
			...banner('[PTZ Action]', 'PTZ action', ACCENT.ptz),
			category: folderName,
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
					accent: ACCENT.ptz,
					activeColor: action.activeColor,
					active: { feedbackId: 'user_ptz_action', options: { user: userUuid, ptz_action: action.id } },
					steps: [
						{ down: [{ actionId: 'set_user_ptz_action', options: { user: userUuid, ptz_action: action.id } }], up: [] },
					],
				}),
				category: folderName,
			}
		}

		presets[`user_${userIdShort}_info`] = {
			...labelTile({
				name: `${userName} Info`,
				title: `$(multicam-rcp:user_${userNum}_name)`,
				subtitle: `$(multicam-rcp:user_${userNum}_preview_camera)`,
				accent: ACCENT.user,
				steps: [{ down: [], up: [] }],
			}),
			category: folderName,
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
		(bus) => Object.keys(bus.inputs || {}).length > 0 && Object.keys(bus.outputs || {}).length > 0,
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
					accent: ACCENT.route,
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
					accent: ACCENT.route,
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
					accent: ACCENT.route,
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
			}
		}
		for (let outputIdx = 0; outputIdx < MAX_ROUTER_BUTTONS; outputIdx++) {
			presets[`user_route_${userIdShort}_out_${outputIdx}`] = {
				...labelTile({
					name: `Output ${outputIdx + 1}`,
					title: `$(multicam-rcp:user_${userIdShort}_route_out_${outputIdx}_name)`,
					subtitle: `Output ${outputIdx + 1}`,
					accent: ACCENT.route,
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
			}
		}
		for (let inputIdx = 0; inputIdx < MAX_ROUTER_BUTTONS; inputIdx++) {
			presets[`user_route_${userIdShort}_in_${inputIdx}`] = {
				...labelTile({
					name: `Input ${inputIdx + 1}`,
					title: `$(multicam-rcp:user_${userIdShort}_route_in_${inputIdx}_name)`,
					subtitle: `Input ${inputIdx + 1}`,
					accent: ACCENT.route,
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
	const groups = new Map<string, string[]>()
	for (const [id, { category, ...preset }] of Object.entries(presets)) {
		definitions[id] = preset
		const ids = groups.get(category) || []
		ids.push(id)
		groups.set(category, ids)
	}
	const sections = Array.from(groups, ([name, ids]) => ({ id: name, name, definitions: ids }))
	addGraphicsPresets(self, definitions, sections)
	self.setPresetDefinitions(sections, definitions)
}
