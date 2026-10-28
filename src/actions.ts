import { controllerActions } from './controllers.js'
import { deckActions } from './deck.js'
import type { ActionDefinitions } from './companion.js'
import type { ModuleInstance } from './instance.js'
import type { FollowZoom } from './api.js'

export function UpdateActions(self: ModuleInstance): void {
	const actions: ActionDefinitions = {}

	// Get current choices
	const cameraChoices = self.cameraChoices.length > 0 ? self.cameraChoices : [{ id: '', label: 'No cameras available' }]

	const userChoices = self.userChoices.length > 0 ? self.userChoices : [{ id: '', label: 'No users available' }]

	const booleanPropertyChoices =
		self.booleanPropertyChoices.length > 0
			? self.booleanPropertyChoices
			: [{ id: '', label: 'No boolean properties available' }]

	const floatPropertyChoices =
		self.floatPropertyChoices.length > 0
			? self.floatPropertyChoices
			: [{ id: '', label: 'No numeric properties available' }]

	const enumPropertyChoices =
		self.enumPropertyChoices.length > 0 ? self.enumPropertyChoices : [{ id: '', label: 'No enum properties available' }]

	const moduleChoices = self.moduleChoices.length > 0 ? self.moduleChoices : [{ id: '', label: 'No modules available' }]

	// ===================
	// Boolean Property Actions
	// ===================

	actions['bool_set'] = {
		name: 'Boolean: Set Property',
		description: 'Set a boolean property to on or off',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'property',
				type: 'dropdown',
				label: 'Property',
				choices: booleanPropertyChoices,
				default: booleanPropertyChoices[0]?.id || '',
			},
			{
				id: 'value',
				type: 'checkbox',
				label: 'Enabled',
				default: true,
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			const property = action.options.property as string
			const value = action.options.value as boolean
			self.setProperty(cameraUuid, property, value)
		},
	}

	actions['bool_toggle'] = {
		name: 'Boolean: Toggle Property',
		description: 'Toggle a boolean property on/off',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'property',
				type: 'dropdown',
				label: 'Property',
				choices: booleanPropertyChoices,
				default: booleanPropertyChoices[0]?.id || '',
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			const property = action.options.property as string
			const cameraIndex = self.cameras.findIndex((c) => c.uuid === cameraUuid)
			const currentValue = self.propertyValues.get(`camera_${cameraIndex}_${property}`)

			// Determine current boolean state from various formats
			let isCurrentlyOn = false
			if (typeof currentValue === 'boolean') {
				isCurrentlyOn = currentValue
			} else if (typeof currentValue === 'string') {
				isCurrentlyOn =
					currentValue === 'true' || currentValue === 'On' || currentValue === 'on' || currentValue === '1'
			} else if (typeof currentValue === 'number') {
				isCurrentlyOn = currentValue === 1
			} else if (typeof currentValue === 'object' && currentValue && 'value' in currentValue) {
				const v = currentValue.value
				isCurrentlyOn = v === 'true' || v === 'On' || v === 'on' || v === 1 || String(v) === 'true'
			}

			self.setProperty(cameraUuid, property, !isCurrentlyOn)
		},
	}

	// ===================
	// Float/Number Property Actions
	// ===================

	actions['float_set'] = {
		name: 'Float: Set Property (Absolute)',
		description: 'Set a numeric property to an absolute value',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'property',
				type: 'dropdown',
				label: 'Property',
				choices: floatPropertyChoices,
				default: floatPropertyChoices[0]?.id || '',
			},
			{
				id: 'value',
				type: 'number',
				label: 'Value',
				default: 0.5,
				min: -10000,
				max: 10000,
				step: 0.001,
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			const property = action.options.property as string
			const value = action.options.value as number
			self.setProperty(cameraUuid, property, value)
		},
	}

	actions['float_adjust'] = {
		name: 'Float: Adjust Property (Relative)',
		description: 'Add or subtract from a numeric property',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'property',
				type: 'dropdown',
				label: 'Property',
				choices: floatPropertyChoices,
				default: floatPropertyChoices[0]?.id || '',
			},
			{
				id: 'adjustment',
				type: 'number',
				label: 'Adjustment (+/-)',
				default: 0.01,
				min: -1000,
				max: 1000,
				step: 0.001,
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			const property = action.options.property as string
			const adjustment = action.options.adjustment as number
			const cameraIndex = self.cameras.findIndex((c) => c.uuid === cameraUuid)
			const varKey = `camera_${cameraIndex}_${property}`
			const currentValue = self.propertyValues.get(varKey)

			let newValue: number
			if (typeof currentValue === 'number') {
				newValue = currentValue + adjustment
			} else if (typeof currentValue === 'object' && currentValue && 'value' in currentValue) {
				newValue = (currentValue.value as number) + adjustment
			} else {
				newValue = adjustment
			}

			self.setProperty(cameraUuid, property, newValue)
		},
	}

	actions['float_increase'] = {
		name: 'Float: Increase Property',
		description: 'Increase a numeric property using server-side step logic',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'property',
				type: 'dropdown',
				label: 'Property',
				choices: floatPropertyChoices,
				default: floatPropertyChoices[0]?.id || '',
			},
			{
				id: 'step_size',
				type: 'dropdown',
				label: 'Step Size',
				choices: [
					{ id: 'user_setting', label: 'Use User Setting' },
					{ id: 'big', label: 'Big' },
					{ id: 'normal', label: 'Normal' },
					{ id: 'small', label: 'Small' },
				],
				default: 'normal',
			},
			{
				id: 'user',
				type: 'dropdown',
				label: 'User (for user setting)',
				choices: userChoices,
				default: userChoices[0]?.id || '',
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			const property = action.options.property as string
			let stepSize = action.options.step_size as string

			// Resolve user setting to actual step size
			if (stepSize === 'user_setting') {
				const userUuid = action.options.user as string
				stepSize = userUuid ? self.getUserStepSize(userUuid) : 'normal'
			}

			const substep = stepSize === 'small'
			const bigstep = stepSize === 'big'
			self.increaseProperty(cameraUuid, property, substep, bigstep)
		},
	}

	actions['float_decrease'] = {
		name: 'Float: Decrease Property',
		description: 'Decrease a numeric property using server-side step logic',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'property',
				type: 'dropdown',
				label: 'Property',
				choices: floatPropertyChoices,
				default: floatPropertyChoices[0]?.id || '',
			},
			{
				id: 'step_size',
				type: 'dropdown',
				label: 'Step Size',
				choices: [
					{ id: 'user_setting', label: 'Use User Setting' },
					{ id: 'big', label: 'Big' },
					{ id: 'normal', label: 'Normal' },
					{ id: 'small', label: 'Small' },
				],
				default: 'normal',
			},
			{
				id: 'user',
				type: 'dropdown',
				label: 'User (for user setting)',
				choices: userChoices,
				default: userChoices[0]?.id || '',
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			const property = action.options.property as string
			let stepSize = action.options.step_size as string

			// Resolve user setting to actual step size
			if (stepSize === 'user_setting') {
				const userUuid = action.options.user as string
				stepSize = userUuid ? self.getUserStepSize(userUuid) : 'normal'
			}

			const substep = stepSize === 'small'
			const bigstep = stepSize === 'big'
			self.decreaseProperty(cameraUuid, property, substep, bigstep)
		},
	}

	// ===================
	// Enum Property Actions
	// ===================

	actions['enum_set'] = {
		name: 'Enum: Set Property by Index',
		description: 'Set an enum property to a specific index value',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'property',
				type: 'dropdown',
				label: 'Property',
				choices: enumPropertyChoices,
				default: enumPropertyChoices[0]?.id || '',
			},
			{
				id: 'index',
				type: 'number',
				label: 'Enum Index',
				default: 0,
				min: 0,
				max: 1000,
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			const property = action.options.property as string
			const index = action.options.index as number
			// Send as enum format
			self.setProperty(cameraUuid, property, { index, value: index })
		},
	}

	actions['enum_next'] = {
		name: 'Enum: Next Value',
		description: 'Cycle to the next enum value',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'property',
				type: 'dropdown',
				label: 'Property',
				choices: enumPropertyChoices,
				default: enumPropertyChoices[0]?.id || '',
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			const property = action.options.property as string
			// Use increase to cycle to next enum value
			self.increaseProperty(cameraUuid, property, false, false)
		},
	}

	actions['enum_prev'] = {
		name: 'Enum: Previous Value',
		description: 'Cycle to the previous enum value',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'property',
				type: 'dropdown',
				label: 'Property',
				choices: enumPropertyChoices,
				default: enumPropertyChoices[0]?.id || '',
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			const property = action.options.property as string
			// Use decrease to cycle to prev enum value
			self.decreaseProperty(cameraUuid, property, false, false)
		},
	}

	// ===================
	// PTZ Preset Actions
	// ===================

	actions['recall_preset'] = {
		name: 'PTZ: Recall Preset',
		description: 'Recall a PTZ preset on a camera',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'preset',
				type: 'number',
				label: 'Preset Number',
				default: 1,
				min: 0,
				max: 1000,
			},
			{
				id: 'mode',
				type: 'dropdown',
				label: 'Mode',
				choices: [
					{ id: 'user_setting', label: 'Use User Setting' },
					{ id: 'normal', label: 'Normal' },
					{ id: 'tracing', label: 'Tracing' },
					{ id: 'scene', label: 'Scene' },
				],
				default: 'normal',
			},
			{
				id: 'user',
				type: 'dropdown',
				label: 'User (for user setting)',
				choices: userChoices,
				default: userChoices[0]?.id || '',
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			const preset = action.options.preset as number
			let mode = action.options.mode as string

			// Resolve user setting to actual mode
			if (mode === 'user_setting') {
				const userUuid = action.options.user as string
				mode = userUuid ? self.getUserPtzMode(userUuid) : 'normal'
			}

			// Send preset with mode suffix (e.g., recall_preset_tracing)
			const property = mode === 'normal' ? 'recall_preset' : `recall_preset_${mode}`
			self.setProperty(cameraUuid, property, preset)
		},
	}

	actions['store_preset'] = {
		name: 'PTZ: Store Preset',
		description: 'Store current camera position as a PTZ preset',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'preset',
				type: 'number',
				label: 'Preset Number',
				default: 1,
				min: 0,
				max: 1000,
			},
			{
				id: 'mode',
				type: 'dropdown',
				label: 'Mode',
				choices: [
					{ id: 'user_setting', label: 'Use User Setting' },
					{ id: 'normal', label: 'Normal' },
					{ id: 'tracing', label: 'Tracing' },
					{ id: 'scene', label: 'Scene' },
				],
				default: 'normal',
			},
			{
				id: 'user',
				type: 'dropdown',
				label: 'User (for user setting)',
				choices: userChoices,
				default: userChoices[0]?.id || '',
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			const preset = action.options.preset as number
			let mode = action.options.mode as string

			// Resolve user setting to actual mode
			if (mode === 'user_setting') {
				const userUuid = action.options.user as string
				mode = userUuid ? self.getUserPtzMode(userUuid) : 'normal'
			}

			// Send preset with mode suffix
			const property = mode === 'normal' ? 'store_preset' : `store_preset_${mode}`
			self.setProperty(cameraUuid, property, preset)
		},
	}

	// Combined PTZ preset action with action and mode dropdowns
	actions['ptz_preset'] = {
		name: 'PTZ: Preset (with mode)',
		description: 'Execute a PTZ preset with configurable action and mode',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'preset',
				type: 'number',
				label: 'Preset Number',
				default: 1,
				min: 0,
				max: 1000,
			},
			{
				id: 'action',
				type: 'dropdown',
				label: 'Action',
				choices: [
					{ id: 'user_setting', label: 'Use User Setting' },
					{ id: 'recall', label: 'Recall' },
					{ id: 'store', label: 'Store' },
				],
				default: 'recall',
			},
			{
				id: 'mode',
				type: 'dropdown',
				label: 'Mode',
				choices: [
					{ id: 'user_setting', label: 'Use User Setting' },
					{ id: 'normal', label: 'Normal' },
					{ id: 'tracing', label: 'Tracing' },
					{ id: 'scene', label: 'Scene' },
				],
				default: 'normal',
			},
			{
				id: 'user',
				type: 'dropdown',
				label: 'User (for user settings)',
				choices: userChoices,
				default: userChoices[0]?.id || '',
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			const preset = action.options.preset as number
			let ptzAction = action.options.action as string
			let mode = action.options.mode as string
			const userUuid = action.options.user as string

			// Resolve user settings
			if (ptzAction === 'user_setting') {
				ptzAction = userUuid ? self.getUserPtzAction(userUuid) : 'recall'
			}
			if (mode === 'user_setting') {
				mode = userUuid ? self.getUserPtzMode(userUuid) : 'normal'
			}

			// Build property name
			const baseProperty = ptzAction === 'store' ? 'store_preset' : 'recall_preset'
			const property = mode === 'normal' ? baseProperty : `${baseProperty}_${mode}`
			self.setProperty(cameraUuid, property, preset)
		},
	}

	actions['tracing_stop'] = {
		name: 'Tracing: Stop',
		description:
			"End the camera's tracing playback and stop the head where it is. Start one with PTZ: Recall Preset in Tracing mode (it plays the path from its start; speed comes from the camera's Tracing speed control, 0 waits at the start).",
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			self.tracingStop(cameraUuid)
		},
	}

	actions['tracing_speed'] = {
		name: 'Tracing: Speed (Several Cameras)',
		description:
			'One tracing speed on every chosen camera in one pass, so cameras that play in step take it on the same tick (1 = as recorded, 0 holds the head). Up/Down step from the first camera’s speed; put them on a rotary encoder for a speed lever.',
		options: [
			{
				id: 'cameras',
				type: 'multidropdown',
				label: 'Cameras',
				choices: cameraChoices,
				default: cameraChoices[0] ? [cameraChoices[0].id] : [],
			},
			{
				id: 'mode',
				type: 'dropdown',
				label: 'Mode',
				choices: [
					{ id: 'set', label: 'Set' },
					{ id: 'up', label: 'Up by step' },
					{ id: 'down', label: 'Down by step' },
				],
				default: 'set',
				disableAutoExpression: true,
			},
			{
				id: 'speed',
				type: 'number',
				label: 'Speed',
				default: 1,
				min: 0,
				max: 10,
				step: 0.05,
				isVisibleExpression: `$(options:mode) == 'set'`,
			},
			{
				id: 'step',
				type: 'number',
				label: 'Step',
				default: 0.1,
				min: 0.01,
				max: 10,
				step: 0.01,
				isVisibleExpression: `$(options:mode) != 'set'`,
			},
		],
		callback: async (action) => {
			const cameras = ((action.options.cameras as string[]) ?? []).filter((c) => self.getTargetCameraUuid(c))
			if (!cameras.length) {
				self.log('warn', 'No target camera available')
				return
			}
			const mode = action.options.mode as string
			if (mode === 'set') {
				self.tracingSpeed(cameras, Number(action.options.speed))
				return
			}
			const current = self.getTracingSpeed(cameras[0])
			if (current === null) {
				self.log('warn', 'Tracing speed of the first camera is not known yet')
				return
			}
			// Round to the step so repeated turns land on clean values (0.1, 0.2, …), not 0.30000000000000004.
			const step = Number(action.options.step) || 0.1
			const next = Math.round((current + (mode === 'up' ? step : -step)) / step) * step
			self.tracingSpeed(cameras, Number(next.toFixed(4)))
		},
	}

	const zoomChoices = [
		{ id: 'off', label: 'Leave to the operator' },
		{ id: 'frameWidth', label: 'Keep a frame width at the target' },
		{ id: 'matchLeader', label: "Match the leader's picture" },
	]
	actions['follow_start'] = {
		name: 'Follow: Start',
		description:
			"The camera points where the leader's centre of picture meets a surface of the 3D Tracing site (or the ground at a height). Both cameras need a position on the site. Starting again changes the follow; any other move of the camera ends it.",
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Follower',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'leader',
				type: 'dropdown',
				label: 'Leader',
				choices: cameraChoices,
				default: cameraChoices[1]?.id || cameraChoices[0]?.id || '',
			},
			{
				id: 'surface',
				type: 'textinput',
				label: 'Site surface ID (empty: the ground at a height)',
				default: '',
			},
			{
				id: 'height',
				type: 'number',
				label: 'Ground height (m)',
				default: 0,
				min: -1000,
				max: 1000,
				step: 0.1,
			},
			{
				id: 'zoom',
				type: 'dropdown',
				label: 'Zoom',
				choices: zoomChoices,
				default: 'off',
				disableAutoExpression: true,
			},
			{
				id: 'frame_width',
				type: 'number',
				label: 'Frame width at the target (m)',
				default: 30,
				min: 0.1,
				max: 10000,
				step: 0.1,
				isVisibleExpression: `$(options:zoom) == 'frameWidth'`,
			},
		],
		callback: async (action) => {
			const camera = self.getTargetCameraUuid(action.options.camera as string)
			const leader = self.getTargetCameraUuid(action.options.leader as string)
			if (!camera || !leader) {
				self.log('warn', 'Choose a follower and a leader camera')
				return
			}
			if (camera === leader) {
				self.log('warn', 'A camera cannot follow itself')
				return
			}
			const surfaceId = typeof action.options.surface === 'string' ? action.options.surface.trim() : ''
			const mode = action.options.zoom as string
			const zoom: FollowZoom =
				mode === 'frameWidth'
					? { mode, frameWidthM: Number(action.options.frame_width) || 30 }
					: mode === 'matchLeader'
						? { mode }
						: { mode: 'off' }
			self.followStart(
				camera,
				leader,
				surfaceId ? { surfaceId } : { heightM: Number(action.options.height) || 0 },
				zoom,
			)
		},
	}

	actions['follow_stop'] = {
		name: 'Follow: Stop',
		description: 'End the camera’s Follow and stop the head where it is.',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
		],
		callback: async (action) => {
			const camera = self.getTargetCameraUuid(action.options.camera as string)
			if (!camera) {
				self.log('warn', 'No target camera available')
				return
			}
			self.followStop(camera)
		},
	}

	actions['clear_preset'] = {
		name: 'PTZ: Clear Preset',
		description: 'Clear a PTZ preset on a camera',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'preset',
				type: 'number',
				label: 'Preset Number',
				default: 1,
				min: 0,
				max: 1000,
			},
		],
		callback: async (action) => {
			const cameraUuid = self.getTargetCameraUuid(action.options.camera as string)
			if (!cameraUuid) {
				self.log('warn', 'No target camera available')
				return
			}
			const preset = action.options.preset as number
			self.setProperty(cameraUuid, 'clear_preset', preset)
		},
	}

	// ===================
	// User Actions
	// ===================

	Object.assign(actions, controllerActions(self), deckActions(self))

	actions['set_user_step_size'] = {
		name: 'User: Set Step Size',
		description: "Set a user's default step size for property adjustments",
		options: [
			{
				id: 'user',
				type: 'dropdown',
				label: 'User',
				choices: userChoices,
				default: userChoices[0]?.id || '',
			},
			{
				id: 'step_size',
				type: 'dropdown',
				label: 'Step Size',
				choices: [
					{ id: 'big', label: 'Big' },
					{ id: 'normal', label: 'Normal' },
					{ id: 'small', label: 'Small' },
				],
				default: 'normal',
			},
		],
		callback: async (action) => {
			const userUuid = action.options.user as string
			const stepSize = action.options.step_size as 'big' | 'normal' | 'small'
			if (!userUuid) {
				self.log('warn', 'No user selected')
				return
			}
			self.setUserStepSize(userUuid, stepSize)
		},
	}

	actions['set_user_ptz_mode'] = {
		name: 'User: Set PTZ Mode',
		description: "Set a user's default PTZ preset mode",
		options: [
			{
				id: 'user',
				type: 'dropdown',
				label: 'User',
				choices: userChoices,
				default: userChoices[0]?.id || '',
			},
			{
				id: 'ptz_mode',
				type: 'dropdown',
				label: 'PTZ Mode',
				choices: [
					{ id: 'normal', label: 'Normal' },
					{ id: 'tracing', label: 'Tracing' },
					{ id: 'scene', label: 'Scene' },
				],
				default: 'normal',
			},
		],
		callback: async (action) => {
			const userUuid = action.options.user as string
			const ptzMode = action.options.ptz_mode as 'normal' | 'tracing' | 'scene'
			if (!userUuid) {
				self.log('warn', 'No user selected')
				return
			}
			self.setUserPtzMode(userUuid, ptzMode)
		},
	}

	actions['set_user_ptz_action'] = {
		name: 'User: Set PTZ Action',
		description: "Set a user's default PTZ preset action (recall/store)",
		options: [
			{
				id: 'user',
				type: 'dropdown',
				label: 'User',
				choices: userChoices,
				default: userChoices[0]?.id || '',
			},
			{
				id: 'ptz_action',
				type: 'dropdown',
				label: 'PTZ Action',
				choices: [
					{ id: 'recall', label: 'Recall' },
					{ id: 'store', label: 'Store' },
				],
				default: 'recall',
			},
		],
		callback: async (action) => {
			const userUuid = action.options.user as string
			const ptzAction = action.options.ptz_action as 'recall' | 'store'
			if (!userUuid) {
				self.log('warn', 'No user selected')
				return
			}
			self.setUserPtzAction(userUuid, ptzAction)
		},
	}

	// ===================
	// Routing Actions
	// ===================

	actions['set_route'] = {
		name: 'Routing: Set Video Route',
		description: 'Route a video source to a destination on a module/router',
		options: [
			{
				id: 'module',
				type: 'dropdown',
				label: 'Module/Router',
				choices: moduleChoices,
				default: moduleChoices[0]?.id || '',
			},
			{
				id: 'source',
				type: 'number',
				label: 'Source Input',
				default: 0,
				min: 0,
				max: 999,
			},
			{
				id: 'destination',
				type: 'number',
				label: 'Destination Output',
				default: 0,
				min: 0,
				max: 999,
			},
		],
		callback: async (action) => {
			const moduleUuid = action.options.module as string
			const source = action.options.source as number
			const destination = action.options.destination as number
			if (!moduleUuid) {
				self.log('warn', 'No module selected')
				return
			}
			self.setRoute(moduleUuid, source, destination)
		},
	}

	// ===================
	// User Routing Actions (select module, select destination, then click source)
	// ===================

	actions['route_select_module'] = {
		name: 'User Routing: Select Module',
		description: 'Select which router/module to use for routing',
		options: [
			{
				id: 'user',
				type: 'dropdown',
				label: 'User',
				choices: userChoices,
				default: userChoices[0]?.id || '',
			},
			{
				id: 'module',
				type: 'dropdown',
				label: 'Module/Router',
				choices: moduleChoices,
				default: moduleChoices[0]?.id || '',
			},
		],
		callback: async (action) => {
			const userUuid = action.options.user as string
			const moduleUuid = action.options.module as string
			if (!userUuid || !moduleUuid) return
			self.setUserSelectedModule(userUuid, moduleUuid)
		},
	}

	actions['route_select_destination'] = {
		name: 'User Routing: Select Destination',
		description: 'Select which output to route to',
		options: [
			{
				id: 'user',
				type: 'dropdown',
				label: 'User',
				choices: userChoices,
				default: userChoices[0]?.id || '',
			},
			{
				id: 'output',
				type: 'number',
				label: 'Output Index',
				default: 0,
				min: 0,
				max: 999,
			},
		],
		callback: async (action) => {
			const userUuid = action.options.user as string
			const output = action.options.output as number
			if (!userUuid) return
			self.setUserSelectedOutput(userUuid, output)
		},
	}

	actions['route_source_to_selected'] = {
		name: 'User Routing: Route Source',
		description: "Route this source to the user's selected destination",
		options: [
			{
				id: 'user',
				type: 'dropdown',
				label: 'User',
				choices: userChoices,
				default: userChoices[0]?.id || '',
			},
			{
				id: 'source',
				type: 'number',
				label: 'Source Input Index',
				default: 0,
				min: 0,
				max: 999,
			},
		],
		callback: async (action) => {
			const userUuid = action.options.user as string
			const source = action.options.source as number
			if (!userUuid) return
			self.routeToUserDestination(userUuid, source)
		},
	}

	// ===================
	// Static Module Routing Actions (module pre-selected per folder)
	// ===================

	actions['route_select_destination_static'] = {
		name: 'Static Router: Select Destination',
		description: 'Select which output to route to (for per-module folders)',
		options: [
			{
				id: 'module',
				type: 'dropdown',
				label: 'Module/Router',
				choices: moduleChoices,
				default: moduleChoices[0]?.id || '',
			},
			{
				id: 'output',
				type: 'number',
				label: 'Output Index',
				default: 0,
				min: 0,
				max: 999,
			},
		],
		callback: async (action) => {
			const moduleUuid = action.options.module as string
			const output = action.options.output as number
			if (!moduleUuid) return
			self.setStaticSelectedOutput(moduleUuid, output)
		},
	}

	actions['route_source_to_static'] = {
		name: 'Static Router: Route Source',
		description: "Route this source to the module's selected destination",
		options: [
			{
				id: 'module',
				type: 'dropdown',
				label: 'Module/Router',
				choices: moduleChoices,
				default: moduleChoices[0]?.id || '',
			},
			{
				id: 'source',
				type: 'number',
				label: 'Source Input Index',
				default: 0,
				min: 0,
				max: 999,
			},
		],
		callback: async (action) => {
			const moduleUuid = action.options.module as string
			const source = action.options.source as number
			if (!moduleUuid) return
			self.routeToStaticDestination(moduleUuid, source)
		},
	}

	self.setActionDefinitions(actions)
}
