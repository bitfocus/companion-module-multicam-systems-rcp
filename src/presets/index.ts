/**
 * Companion 4 presets: classic buttons (text, colours and boolean feedbacks), the same
 * sections as the Companion 5 line's layered tiles. A value shows as a variable in the
 * button text; a numeric control's value button is also its rotary encoder.
 */
import type {
	CompanionButtonPresetDefinition,
	CompanionFeedbackDefinitions,
	CompanionPresetAction,
	CompanionPresetDefinitions,
	CompanionPresetFeedback,
	CompanionTextPresetDefinition,
} from '@companion-module/base'
import type { ModuleInstance } from '../instance.js'
import { INK, TALLY, applyPresentation, channelAccent, tone } from '../palette.js'
import {
	GROUP_ORDER,
	cameraDisplayNames,
	describeControl,
	formatPropertyName,
	getCameraDisplayName,
} from '../preset-model.js'

/** The connection label presets are written with; Companion swaps in the connection's own. */
const variable = (name: string): string => `$(multicam-rcp:${name})`
const DIM = 0x2c3440

interface Button {
	category: string
	name: string
	text: string
	color?: number
	bgcolor?: number
	size?: CompanionButtonPresetDefinition['style']['size']
	down?: CompanionPresetAction[]
	rotate?: { left: CompanionPresetAction[]; right: CompanionPresetAction[] }
	feedbacks?: CompanionPresetFeedback[]
	alignment?: CompanionButtonPresetDefinition['style']['alignment']
}

function button(b: Button): CompanionButtonPresetDefinition {
	return {
		type: 'button',
		category: b.category,
		name: b.name,
		style: {
			text: b.text,
			size: b.size ?? 'auto',
			color: b.color ?? INK.text,
			bgcolor: b.bgcolor ?? INK.bg,
			...(b.alignment ? { alignment: b.alignment } : {}),
		},
		options: b.rotate ? { rotaryActions: true } : undefined,
		feedbacks: b.feedbacks ?? [],
		steps: [
			{
				down: b.down ?? [],
				up: [],
				...(b.rotate ? { rotate_left: b.rotate.left, rotate_right: b.rotate.right } : {}),
			},
		],
	}
}

function header(category: string, text: string): CompanionTextPresetDefinition {
	return { type: 'text', category, name: text, text: '' }
}

/** Greys a control's buttons while the camera does not take it (knee on Auto). */
const unavailable = (camera: string, property: string): CompanionPresetFeedback => ({
	feedbackId: 'control_unavailable',
	options: { camera, property },
	style: { color: INK.dim, bgcolor: INK.bg },
})

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions = {}
	const presentation = applyPresentation(self.presentation)
	const hiddenCameras = new Set(presentation.hiddenCameras)
	const hiddenModules = new Set(presentation.hiddenModules)
	const defaultUser = self.users[0]?.uuid ?? ''
	const displayNames = cameraDisplayNames(self)
	const visibleCameras = self.cameras
		.map((camera, index) => ({ camera, camNum: index + 1 }))
		.filter(({ camera }) => !hiddenCameras.has(camera.uuid))

	// ===================
	// CAMERA SETTINGS: one category per camera, a header per control group
	// ===================
	for (const { camera, camNum } of visibleCameras) {
		const cameraUuid = camera.uuid
		const camId = cameraUuid.substring(0, 8)
		const name = displayNames.get(cameraUuid) ?? getCameraDisplayName(camera, self.users, camNum)
		const assignedUser = self.users.find((u) => u.attachedVirtualCameraUuid === cameraUuid)
		const category = assignedUser ? `User selected camera settings: ${name}` : `Camera settings: ${name}`
		const properties = camera.assignedModuleControlProperties || []
		const grouped: Record<string, string[]> = {}
		for (const prop of properties) (grouped[describeControl(self, cameraUuid, prop).group] ||= []).push(prop)
		const groups = Object.keys(grouped).sort((a, b) => (GROUP_ORDER[a]?.order || 99) - (GROUP_ORDER[b]?.order || 99))

		for (const group of groups) {
			presets[`cam_${camId}_group_${group}`] = header(
				category,
				GROUP_ORDER[group]?.displayName ?? formatPropertyName(group),
			)
			for (const prop of grouped[group].sort()) {
				const info = describeControl(self, cameraUuid, prop)
				if (info.movement) continue
				const id = `cam_${camId}_${prop.substring(0, 16)}`
				const accent = channelAccent(prop, info.group)
				const shown = info.namedSteps
					? variable(`camera_${camNum}_${prop}_text`)
					: `${variable(`camera_${camNum}_${prop}`)}${info.unit ? ' ' + info.unit : ''}`
				const grey = unavailable(cameraUuid, prop)
				if (info.kind === 'float') {
					const options = assignedUser
						? { camera: cameraUuid, property: prop, step_size: 'user_setting', user: assignedUser.uuid }
						: { camera: cameraUuid, property: prop, step_size: 'normal', user: defaultUser }
					const up = [{ actionId: 'float_increase', options }]
					const down = [{ actionId: 'float_decrease', options }]
					presets[`${id}_inc`] = button({
						category,
						name: `${info.label} +`,
						text: `${info.label}\\n▲`,
						down: up,
						feedbacks: [grey],
					})
					presets[`${id}_val`] = button({
						category,
						name: `${info.label} · value / rotary`,
						text: `${info.label}\\n${shown}`,
						color: accent,
						rotate: { left: down, right: up },
						feedbacks: [grey],
					})
					presets[`${id}_dec`] = button({
						category,
						name: `${info.label} -`,
						text: `${info.label}\\n▼`,
						down,
						feedbacks: [grey],
					})
				} else if (info.kind === 'boolean') {
					const on = { feedbackId: 'property_bool', options: { camera: cameraUuid, property: prop } }
					presets[`${id}_toggle`] = button({
						category,
						name: `${info.label} Toggle`,
						text: `${info.label}\\n${shown}`,
						down: [{ actionId: 'bool_toggle', options: { camera: cameraUuid, property: prop } }],
						feedbacks: [{ ...on, style: { bgcolor: TALLY.green, color: INK.black } }, grey],
					})
					presets[`${id}_on`] = button({
						category,
						name: `${info.label} On`,
						text: `${info.label}\\nON`,
						down: [{ actionId: 'bool_set', options: { camera: cameraUuid, property: prop, value: true } }],
						feedbacks: [{ ...on, style: { bgcolor: TALLY.green, color: INK.black } }, grey],
					})
					presets[`${id}_off`] = button({
						category,
						name: `${info.label} Off`,
						text: `${info.label}\\nOFF`,
						down: [{ actionId: 'bool_set', options: { camera: cameraUuid, property: prop, value: false } }],
						feedbacks: [{ ...on, isInverted: true, style: { bgcolor: DIM } }, grey],
					})
				} else {
					const next = [{ actionId: 'enum_next', options: { camera: cameraUuid, property: prop } }]
					const prev = [{ actionId: 'enum_prev', options: { camera: cameraUuid, property: prop } }]
					presets[`${id}_next`] = button({
						category,
						name: `${info.label} ›`,
						text: `${info.label}\\n›`,
						down: next,
						feedbacks: [grey],
					})
					presets[`${id}_val`] = button({
						category,
						name: `${info.label} · value / rotary`,
						text: `${info.label}\\n${shown}`,
						color: accent,
						rotate: { left: prev, right: next },
						feedbacks: [grey],
					})
					presets[`${id}_prev`] = button({
						category,
						name: `${info.label} ‹`,
						text: `${info.label}\\n‹`,
						down: prev,
						feedbacks: [grey],
					})
				}
			}
		}

		// PTZ presets, tracing and Follow
		presets[`cam_${camId}_group_ptz_presets`] = header(category, 'PTZ presets')
		for (let preset = 1; preset <= 20; preset++) {
			const options = assignedUser
				? { camera: cameraUuid, preset, action: 'user_setting', mode: 'user_setting', user: assignedUser.uuid }
				: { camera: cameraUuid, preset, action: 'recall', mode: 'normal', user: defaultUser }
			presets[`cam_${camId}_ptz_${preset}`] = button({
				category,
				name: `PTZ Preset ${preset}`,
				text: `PTZ\\n${preset}`,
				size: '18',
				color: tone('ptz'),
				down: [{ actionId: 'ptz_preset', options }],
				feedbacks: [
					{
						feedbackId: 'tracing_state',
						options: { camera: cameraUuid, state: 'playing', preset },
						style: { bgcolor: 0xfbbf24, color: INK.black },
					},
				],
			})
		}
		presets[`cam_${camId}_group_tracing`] = header(category, 'Tracing and Follow')
		presets[`cam_${camId}_tracing_status`] = button({
			category,
			name: 'Tracing status · stop',
			text: `${name}\\n${variable(`camera_${camNum}_tracing_status`)}\\n${variable(`camera_${camNum}_tracing_progress`)}`,
			size: '14',
			down: [{ actionId: 'tracing_stop', options: { camera: cameraUuid } }],
			feedbacks: [
				{
					feedbackId: 'tracing_state',
					options: { camera: cameraUuid, state: 'recording', preset: 0 },
					style: { bgcolor: TALLY.red },
				},
				{
					feedbackId: 'tracing_state',
					options: { camera: cameraUuid, state: 'playing', preset: 0 },
					style: { bgcolor: 0xfbbf24, color: INK.black },
				},
			],
		})
		if (self.control(cameraUuid, 'tracing_speed'))
			presets[`cam_${camId}_tracing_speed`] = button({
				category,
				name: 'Tracing speed · rotary',
				text: `SPEED\\n${variable(`camera_${camNum}_tracing_speed`)}x`,
				down: [{ actionId: 'tracing_speed', options: { cameras: [cameraUuid], mode: 'set', speed: 1, step: 0.1 } }],
				rotate: {
					left: [{ actionId: 'tracing_speed', options: { cameras: [cameraUuid], mode: 'down', speed: 1, step: 0.1 } }],
					right: [{ actionId: 'tracing_speed', options: { cameras: [cameraUuid], mode: 'up', speed: 1, step: 0.1 } }],
				},
			})
		presets[`cam_${camId}_follow`] = button({
			category,
			name: 'Follow status · stop',
			text: `FOLLOW\\n${variable(`camera_${camNum}_follow_status`)}\\n${variable(`camera_${camNum}_follow_leader`)}`,
			size: '14',
			down: [{ actionId: 'follow_stop', options: { camera: cameraUuid } }],
			feedbacks: [
				{
					feedbackId: 'follow_state',
					options: { camera: cameraUuid, state: 'following', leader: '' },
					style: { bgcolor: 0x38bdf8, color: INK.black },
				},
			],
		})
		presets[`cam_${camId}_tally`] = button({
			category,
			name: 'Camera name · tally',
			text: name,
			feedbacks: [
				{ feedbackId: 'camera_tally_preview', options: { camera: cameraUuid }, style: { bgcolor: TALLY.green } },
				{ feedbackId: 'camera_tally_program', options: { camera: cameraUuid }, style: { bgcolor: TALLY.red } },
			],
		})
	}

	// One speed lever for every visible camera: cameras recorded together stay in step.
	const tracing = visibleCameras.filter(({ camera }) => self.control(camera.uuid, 'tracing_speed'))
	if (tracing.length > 1) {
		const cameras = tracing.map(({ camera }) => camera.uuid)
		presets.tracing_speed_all = button({
			category: 'Tracing',
			name: 'Speed lever · all cameras',
			text: `SPEED\\nALL\\n${variable(`camera_${tracing[0].camNum}_tracing_speed`)}x`,
			down: [{ actionId: 'tracing_speed', options: { cameras, mode: 'set', speed: 1, step: 0.1 } }],
			rotate: {
				left: [{ actionId: 'tracing_speed', options: { cameras, mode: 'down', speed: 1, step: 0.1 } }],
				right: [{ actionId: 'tracing_speed', options: { cameras, mode: 'up', speed: 1, step: 0.1 } }],
			},
		})
		presets.tracing_hold_all = button({
			category: 'Tracing',
			name: 'Hold all (speed 0)',
			text: 'HOLD\\nALL',
			bgcolor: TALLY.red,
			down: [{ actionId: 'tracing_speed', options: { cameras, mode: 'set', speed: 0, step: 0.1 } }],
		})
	}

	// ===================
	// CONTROLLER CHOICES and USER CONTROLS
	// ===================
	for (const switcher of self.controllerSwitchers?.switchers ?? []) {
		for (const choice of switcher.choices) {
			const key = JSON.stringify([switcher.id, choice.id])
			presets[`controller_${Buffer.from(key).toString('base64url')}`] = button({
				category: `Controller choices: ${switcher.name}`,
				name: `Select ${choice.name}`,
				text: `${choice.name}\\n${switcher.name}`,
				size: '14',
				down: [{ actionId: 'controller_select', options: { choice: key } }],
				feedbacks: [
					{
						feedbackId: 'controller_selected',
						options: { choice: key },
						style: { bgcolor: tone('controller'), color: INK.black },
					},
				],
			})
		}
	}
	self.users.forEach((user, index) => {
		const userNum = index + 1
		const userId = user.uuid.substring(0, 8)
		const category = `User controls: ${user.name || `User ${userNum}`}`
		const pills: [string, string, string, string, { id: string; label: string }[]][] = [
			[
				'stepsize',
				'set_user_step_size',
				'user_step_size',
				'step_size',
				[
					{ id: 'big', label: 'Big' },
					{ id: 'normal', label: 'Normal' },
					{ id: 'small', label: 'Small' },
				],
			],
			[
				'ptzmode',
				'set_user_ptz_mode',
				'user_ptz_mode',
				'ptz_mode',
				[
					{ id: 'normal', label: 'Normal' },
					{ id: 'tracing', label: 'Tracing' },
					{ id: 'scene', label: 'Scene' },
				],
			],
			[
				'ptzaction',
				'set_user_ptz_action',
				'user_ptz_action',
				'ptz_action',
				[
					{ id: 'recall', label: 'Recall' },
					{ id: 'store', label: 'Store' },
				],
			],
		]
		for (const [kind, actionId, feedbackId, option, choices] of pills)
			for (const choice of choices)
				presets[`user_${userId}_${kind}_${choice.id}`] = button({
					category,
					name: `${formatPropertyName(option)}: ${choice.label}`,
					text: `${formatPropertyName(option).toUpperCase()}\\n${choice.label}`,
					size: '14',
					down: [{ actionId, options: { user: user.uuid, [option]: choice.id } }],
					feedbacks: [
						{
							feedbackId,
							options: { user: user.uuid, [option]: choice.id },
							style: { bgcolor: tone('user'), color: INK.black },
						},
					],
				})
		presets[`user_${userId}_info`] = button({
			category,
			name: 'Info',
			text: `${variable(`user_${userNum}_name`)}\\n${variable(`user_${userNum}_preview_camera`)}`,
			size: '14',
		})
	})

	// ===================
	// ROUTERS: static outputs and inputs per routable bus, then per-user routing
	// ===================
	const routableBuses = self.tally.filter(
		(bus) =>
			!hiddenModules.has(bus.uuid) && Object.keys(bus.inputs || {}).length && Object.keys(bus.outputs || {}).length,
	)
	const busName = (bus: (typeof self.tally)[number]) =>
		bus.name || self.modules.find((m) => m.moduleUuid === bus.uuid)?.customName || `Router ${bus.uuid.substring(0, 8)}`
	const sourceLabel = (bus: (typeof self.tally)[number], index: number): string => {
		const input = bus.inputs?.[index]
		if (!input) return `Input ${index + 1}`
		if (input.routedFrom?.type === 'camera') {
			const camera = self.cameras.find((c) => c.uuid === input.routedFrom?.uuid)
			if (camera) return camera.name || input.customName || input.name
		}
		return input.customName || input.name || `Input ${index + 1}`
	}
	for (const bus of routableBuses) {
		const category = `Router: ${busName(bus)}`
		const busId = bus.uuid.substring(0, 8)
		for (const key of Object.keys(bus.outputs || {})) {
			const output = bus.outputs[Number(key)]
			if (!output?.routable) continue
			presets[`router_${busId}_out_${key}`] = button({
				category,
				name: `Output: ${output.customName || output.name}`,
				text: `OUT\\n${output.customName || output.name || `Out ${Number(key) + 1}`}`,
				size: '14',
				down: [{ actionId: 'route_select_destination_static', options: { module: bus.uuid, output: Number(key) } }],
				feedbacks: [
					{
						feedbackId: 'route_destination_selected_static',
						options: { module: bus.uuid, output: Number(key) },
						style: { bgcolor: 0x5a3d0a },
					},
				],
			})
		}
		for (const key of Object.keys(bus.inputs || {})) {
			if (!bus.inputs[Number(key)]?.routable) continue
			presets[`router_${busId}_in_${key}`] = button({
				category,
				name: `Input: ${sourceLabel(bus, Number(key))}`,
				text: sourceLabel(bus, Number(key)),
				size: '14',
				down: [{ actionId: 'route_source_to_static', options: { module: bus.uuid, source: Number(key) } }],
				feedbacks: [
					{
						feedbackId: 'route_source_active_static',
						options: { module: bus.uuid, source: Number(key) },
						style: { bgcolor: TALLY.green, color: INK.black },
					},
				],
			})
		}
	}
	const MAX_ROUTER_BUTTONS = 40
	for (const user of self.users) {
		const userId = user.uuid.substring(0, 8)
		const category = `User route: ${user.name}`
		for (const bus of routableBuses)
			presets[`user_route_${userId}_module_${bus.uuid.substring(0, 8)}`] = button({
				category,
				name: `Select ${busName(bus)}`,
				text: busName(bus),
				size: '14',
				down: [{ actionId: 'route_select_module', options: { user: user.uuid, module: bus.uuid } }],
				feedbacks: [
					{
						feedbackId: 'route_module_selected',
						options: { user: user.uuid, module: bus.uuid },
						style: { bgcolor: 0x1e3a5f },
					},
				],
			})
		for (let index = 0; index < MAX_ROUTER_BUTTONS; index++) {
			presets[`user_route_${userId}_out_${index}`] = button({
				category,
				name: `Output ${index + 1}`,
				text: variable(`user_${userId}_route_out_${index}_name`),
				size: '14',
				down: [{ actionId: 'route_select_destination', options: { user: user.uuid, output: index } }],
				feedbacks: [
					{
						feedbackId: 'route_destination_selected_user',
						options: { user: user.uuid, output: index },
						style: { bgcolor: 0x5a3d0a },
					},
				],
			})
			presets[`user_route_${userId}_in_${index}`] = button({
				category,
				name: `Input ${index + 1}`,
				text: variable(`user_${userId}_route_in_${index}_name`),
				size: '14',
				down: [{ actionId: 'route_source_to_selected', options: { user: user.uuid, source: index } }],
				feedbacks: [
					{
						feedbackId: 'route_source_active_for_user',
						options: { user: user.uuid, source: index },
						style: { bgcolor: TALLY.green, color: INK.black },
					},
				],
			})
		}
	}

	// ===================
	// LIVE VIDEO: one button per source, the picture drawn by an image feedback
	// ===================
	for (const source of self.videoSources)
		presets[`video_${source.id}`] = button({
			category: 'Live video',
			name: `Live · ${source.name ?? source.id}`,
			text: source.name ?? source.id,
			size: '7',
			alignment: 'center:bottom',
			feedbacks: [
				{
					feedbackId: 'live_image_button',
					options: { source: source.id, width: 160, height: 90, fps: 10, quality: 65 },
				},
			],
		})

	self.setPresetDefinitions(presets)
}

/** The live picture on a classic button: Companion 4 draws an image feedback's png64 (JPEG too). */
export function lineFeedbacks(self: ModuleInstance): CompanionFeedbackDefinitions {
	return {
		live_image_button: {
			type: 'advanced',
			name: 'Live video image on the button',
			description: 'Shared low-resolution JPEG feed drawn on the button. Demand ends when the last one goes.',
			options: [
				{
					type: 'dropdown',
					id: 'source',
					label: 'Video source',
					choices: self.videoSources.map((s) => ({ id: s.id, label: s.name ?? s.id })),
					default: self.videoSources[0]?.id ?? '',
				},
				{ type: 'number', id: 'width', label: 'Width', min: 16, max: 640, default: 160 },
				{ type: 'number', id: 'height', label: 'Height', min: 16, max: 360, default: 90 },
				{ type: 'number', id: 'fps', label: 'Maximum fps', min: 1, max: 15, default: 10 },
				{ type: 'number', id: 'quality', label: 'JPEG quality', min: 20, max: 90, default: 65 },
			],
			callback: (feedback) => {
				const image = self.images.value(feedback.id, {
					sourceId: feedback.options.source as string,
					width: Number(feedback.options.width),
					height: Number(feedback.options.height),
					maxFps: Number(feedback.options.fps),
					jpegQuality: Number(feedback.options.quality),
				})
				return image ? { png64: image.slice(image.indexOf(',') + 1), pngalignment: 'center:center' } : {}
			},
			unsubscribe: (feedback) => self.images.remove(feedback.id),
		},
	}
}
