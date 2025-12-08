import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

export function UpdateActions(self: ModuleInstance): void {
	const actions: CompanionActionDefinitions = {}

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

	// Filter out virtual cameras for user preview selection
	const physicalCameraChoices = self.cameras
		.filter((camera) => !camera.virtualCameraEnable)
		.map((camera) => ({
			id: camera.uuid,
			label: camera.name || `Camera`,
		}))
	if (physicalCameraChoices.length === 0) {
		physicalCameraChoices.push({ id: '', label: 'No cameras available' })
	}

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
				isVisible: (options) => options.step_size === 'user_setting',
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
				isVisible: (options) => options.step_size === 'user_setting',
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
				isVisible: (options) => options.mode === 'user_setting',
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
				isVisible: (options) => options.mode === 'user_setting',
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
				isVisible: (options) => options.action === 'user_setting' || options.mode === 'user_setting',
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

	actions['select_user_preview'] = {
		name: 'User: Select Camera',
		description: 'Set which camera a user is previewing/controlling',
		options: [
			{
				id: 'user',
				type: 'dropdown',
				label: 'User',
				choices: userChoices,
				default: userChoices[0]?.id || '',
			},
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: physicalCameraChoices,
				default: physicalCameraChoices[0]?.id || '',
			},
		],
		callback: async (action) => {
			const userUuid = action.options.user as string
			const cameraUuid = action.options.camera as string
			if (!userUuid) {
				self.log('warn', 'No user selected')
				return
			}
			self.userPreviewCamera(userUuid, cameraUuid || null)
		},
	}

	actions['clear_user_preview'] = {
		name: 'User: Clear Camera Selection',
		description: "Clear a user's camera preview selection",
		options: [
			{
				id: 'user',
				type: 'dropdown',
				label: 'User',
				choices: userChoices,
				default: userChoices[0]?.id || '',
			},
		],
		callback: async (action) => {
			const userUuid = action.options.user as string
			if (!userUuid) {
				self.log('warn', 'No user selected')
				return
			}
			self.userPreviewCamera(userUuid, null)
		},
	}

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
