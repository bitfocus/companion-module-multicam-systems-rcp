import { combineRgb, type CompanionFeedbackDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import type { PropertyValue } from './types.js'

/**
 * Generate a border indicator as a raw RGBA buffer
 * This can be overlaid on top of tally colors to show user selection
 */
function generateBorderIndicator(
	width: number,
	height: number,
	borderWidth: number,
	color: { r: number; g: number; b: number },
): Buffer {
	const buffer = Buffer.alloc(width * height * 4, 0) // RGBA, transparent by default

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			// Check if pixel is on the border
			const onBorder = x < borderWidth || x >= width - borderWidth || y < borderWidth || y >= height - borderWidth

			if (onBorder) {
				const idx = (y * width + x) * 4
				buffer[idx] = color.r // R
				buffer[idx + 1] = color.g // G
				buffer[idx + 2] = color.b // B
				buffer[idx + 3] = 255 // A (fully opaque)
			}
		}
	}

	return buffer
}

/**
 * Helper to check if a value is truthy (handles various formats)
 */
function isTruthyValue(value: PropertyValue | undefined): boolean {
	if (value === undefined || value === null) return false
	if (value === true || value === 'true' || value === 1 || value === 'On' || value === 'on') return true
	// Handle enum format
	if (typeof value === 'object' && 'value' in value) {
		const v = value.value
		return v === 'true' || v === 1 || v === 'On' || v === 'on'
	}
	return false
}

// Color constants for tally
const TALLY_COLORS = {
	red: combineRgb(255, 0, 0),
	green: combineRgb(0, 255, 0),
	blue: combineRgb(0, 0, 255),
	yellow: combineRgb(255, 255, 0),
	purple: combineRgb(128, 0, 128),
	off: combineRgb(0, 0, 0),
}

const TEXT_COLORS = {
	light: combineRgb(255, 255, 255),
	dark: combineRgb(0, 0, 0),
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const feedbacks: CompanionFeedbackDefinitions = {}

	// Get camera choices directly from cameras
	const cameraChoices =
		self.cameras.length > 0
			? self.cameras.map((camera, index) => ({
					id: camera.uuid,
					label: camera.name || `Camera ${index + 1}`,
				}))
			: [{ id: '', label: 'No cameras available' }]

	const userChoices = self.userChoices.length > 0 ? self.userChoices : [{ id: '', label: 'No users available' }]

	// ===================
	// Tally Feedbacks
	// ===================

	feedbacks['camera_tally_program'] = {
		type: 'boolean',
		name: 'Camera Tally: Program (Red)',
		description: 'Change style when camera is on program (red tally)',
		defaultStyle: {
			bgcolor: TALLY_COLORS.red,
			color: TEXT_COLORS.light,
		},
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
		],
		callback: (feedback) => {
			const cameraUuid = feedback.options.camera as string
			if (!cameraUuid) return false
			const tallyColor = self.getCameraTallyColor(cameraUuid)
			return tallyColor === 'red'
		},
	}

	feedbacks['camera_tally_preview'] = {
		type: 'boolean',
		name: 'Camera Tally: Preview (Green)',
		description: 'Change style when camera is on preview (green tally)',
		defaultStyle: {
			bgcolor: TALLY_COLORS.green,
			color: TEXT_COLORS.dark,
		},
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
		],
		callback: (feedback) => {
			const cameraUuid = feedback.options.camera as string
			if (!cameraUuid) return false
			const tallyColor = self.getCameraTallyColor(cameraUuid)
			return tallyColor === 'green'
		},
	}

	feedbacks['camera_tally_color'] = {
		type: 'advanced',
		name: 'Camera Tally: Dynamic Color',
		description:
			'Dynamically set background color based on camera tally state. Does not change style when tally is off (allows other feedbacks to show through).',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'set_off_color',
				type: 'checkbox',
				label: 'Set color when tally is off',
				default: false,
			},
			{
				id: 'off_color',
				type: 'colorpicker',
				label: 'Off Color (if enabled above)',
				default: combineRgb(40, 40, 40),
				isVisible: (options) => options.set_off_color === true,
			},
		],
		callback: (feedback) => {
			const cameraUuid = feedback.options.camera as string
			if (!cameraUuid) return {}

			const tallyColor = self.getCameraTallyColor(cameraUuid)
			const setOffColor = feedback.options.set_off_color as boolean
			const offColor = feedback.options.off_color as number

			if (tallyColor === 'off') {
				// Only set bgcolor when off if explicitly enabled
				return setOffColor ? { bgcolor: offColor } : {}
			}

			const bgcolor = TALLY_COLORS[tallyColor] || offColor
			const textColor = tallyColor === 'green' || tallyColor === 'yellow' ? TEXT_COLORS.dark : TEXT_COLORS.light

			return {
				bgcolor,
				color: textColor,
			}
		},
	}

	// ===================
	// User Feedbacks
	// ===================

	feedbacks['user_previewing_camera'] = {
		type: 'boolean',
		name: 'User Previewing Camera',
		description: 'Change style when a specific user is previewing a specific camera',
		defaultStyle: {
			bgcolor: combineRgb(0, 128, 255),
			color: TEXT_COLORS.light,
		},
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
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
		],
		callback: (feedback) => {
			const userUuid = feedback.options.user as string
			const cameraUuid = feedback.options.camera as string
			if (!userUuid || !cameraUuid) return false

			const user = self.users.find((u) => u.uuid === userUuid)
			return user?.previewedCameraUuid === cameraUuid
		},
	}

	feedbacks['any_user_previewing_camera'] = {
		type: 'boolean',
		name: 'Any User Previewing Camera',
		description: 'Change style when any user is previewing a specific camera',
		defaultStyle: {
			bgcolor: combineRgb(0, 100, 200),
			color: TEXT_COLORS.light,
		},
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
		],
		callback: (feedback) => {
			const cameraUuid = feedback.options.camera as string
			if (!cameraUuid) return false

			const isAnyUserPreviewing = self.users.some((u) => u.previewedCameraUuid === cameraUuid)
			return isAnyUserPreviewing
		},
	}

	// User preview border indicator - can be combined with tally feedbacks
	feedbacks['user_preview_indicator'] = {
		type: 'advanced',
		name: 'User Preview Border Indicator',
		description:
			'Shows a colored border around the button when a user is previewing. Can be combined with tally feedbacks.',
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
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'border_width',
				type: 'number',
				label: 'Border Width (pixels)',
				default: 4,
				min: 2,
				max: 10,
			},
			{
				id: 'indicator_color',
				type: 'colorpicker',
				label: 'Border Color',
				default: combineRgb(255, 255, 255), // White border stands out on any color
			},
		],
		callback: (feedback) => {
			const userUuid = feedback.options.user as string
			const cameraUuid = feedback.options.camera as string
			if (!userUuid || !cameraUuid) return {}

			const user = self.users.find((u) => u.uuid === userUuid)
			if (!user || user.previewedCameraUuid !== cameraUuid) return {}

			const borderWidth = (feedback.options.border_width as number) || 4
			const colorNum = feedback.options.indicator_color as number

			// Extract RGB from combined color
			const r = (colorNum >> 16) & 0xff
			const g = (colorNum >> 8) & 0xff
			const b = colorNum & 0xff

			// Button size: 72x72, but topbar takes ~14px, so visible area is 72x58
			const buttonWidth = 72
			const buttonHeight = 58 // Account for topbar
			const borderBuffer = generateBorderIndicator(buttonWidth, buttonHeight, borderWidth, { r, g, b })

			return {
				imageBuffer: borderBuffer,
				imageBufferPosition: { x: 0, y: 0, width: buttonWidth, height: buttonHeight },
				imageBufferEncoding: { pixelFormat: 'RGBA' },
			}
		},
	}

	// ===================
	// Combined Status Feedback (Tally + User Selection)
	// ===================

	feedbacks['camera_status'] = {
		type: 'advanced',
		name: 'Camera Status (Tally + Users)',
		description: 'Shows tally color as background, or user preview color when no tally but user is previewing',
		options: [
			{
				id: 'camera',
				type: 'dropdown',
				label: 'Camera',
				choices: cameraChoices,
				default: cameraChoices[0]?.id || '',
			},
			{
				id: 'off_color',
				type: 'colorpicker',
				label: 'Off Color (no tally, no user preview)',
				default: combineRgb(40, 40, 40),
			},
			{
				id: 'user_preview_color',
				type: 'colorpicker',
				label: 'User Preview Color (no tally, but user previewing)',
				default: combineRgb(0, 80, 160),
			},
		],
		callback: (feedback) => {
			const cameraUuid = feedback.options.camera as string
			if (!cameraUuid) return {}

			const tallyColor = self.getCameraTallyColor(cameraUuid)
			const offColor = feedback.options.off_color as number
			const userPreviewColor = feedback.options.user_preview_color as number

			// Find users previewing this camera
			const usersPreviewingThis = self.users.filter((u) => u.previewedCameraUuid === cameraUuid)

			// Determine background color
			let bgcolor: number
			let textColor: number = TEXT_COLORS.light

			if (tallyColor === 'red') {
				bgcolor = TALLY_COLORS.red
				textColor = TEXT_COLORS.light
			} else if (tallyColor === 'green') {
				bgcolor = TALLY_COLORS.green
				textColor = TEXT_COLORS.dark
			} else if (tallyColor === 'yellow') {
				bgcolor = TALLY_COLORS.yellow
				textColor = TEXT_COLORS.dark
			} else if (usersPreviewingThis.length > 0) {
				// No tally but users are previewing - use user preview color
				bgcolor = userPreviewColor
				textColor = TEXT_COLORS.light
			} else {
				bgcolor = offColor
			}

			return {
				bgcolor,
				color: textColor,
			}
		},
	}

	// ===================
	// Connection Feedbacks
	// ===================

	feedbacks['connected'] = {
		type: 'boolean',
		name: 'Connected to Server',
		description: 'Change style when connected to Multicam RCP server',
		defaultStyle: {
			bgcolor: combineRgb(0, 200, 0),
			color: TEXT_COLORS.dark,
		},
		options: [],
		callback: () => {
			return self.socket?.connected || false
		},
	}

	// ===================
	// Property Feedbacks
	// ===================

	feedbacks['property_equals'] = {
		type: 'boolean',
		name: 'Property Equals Value',
		description: 'Change style when a camera property equals a specific value',
		defaultStyle: {
			bgcolor: combineRgb(255, 200, 0),
			color: TEXT_COLORS.dark,
		},
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
				choices: self.propertyChoices.length > 0 ? self.propertyChoices : [{ id: '', label: 'No properties' }],
				default: self.propertyChoices[0]?.id || '',
			},
			{
				id: 'value',
				type: 'textinput',
				label: 'Value',
				default: '',
			},
		],
		callback: (feedback) => {
			const cameraUuid = feedback.options.camera as string
			const property = feedback.options.property as string
			const targetValue = feedback.options.value as string
			if (!cameraUuid || !property) return false

			const cameraIndex = self.cameras.findIndex((c) => c.uuid === cameraUuid)
			if (cameraIndex === -1) return false

			const varKey = `camera_${cameraIndex}_${property}`
			const currentValue = self.propertyValues.get(varKey)

			if (currentValue === undefined || currentValue === null) return false

			// Handle enum values
			if (typeof currentValue === 'object' && 'value' in currentValue) {
				return String(currentValue.value) === targetValue
			}

			return String(currentValue) === targetValue
		},
	}

	feedbacks['property_greater_than'] = {
		type: 'boolean',
		name: 'Property Greater Than',
		description: 'Change style when a camera property is greater than a specific value',
		defaultStyle: {
			bgcolor: combineRgb(200, 200, 0),
			color: TEXT_COLORS.dark,
		},
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
				choices: self.propertyChoices.length > 0 ? self.propertyChoices : [{ id: '', label: 'No properties' }],
				default: self.propertyChoices[0]?.id || '',
			},
			{
				id: 'value',
				type: 'number',
				label: 'Value',
				default: 0.5,
				min: -1000,
				max: 1000,
				step: 0.01,
			},
		],
		callback: (feedback) => {
			const cameraUuid = feedback.options.camera as string
			const property = feedback.options.property as string
			const targetValue = feedback.options.value as number
			if (!cameraUuid || !property) return false

			const cameraIndex = self.cameras.findIndex((c) => c.uuid === cameraUuid)
			if (cameraIndex === -1) return false

			const varKey = `camera_${cameraIndex}_${property}`
			const currentValue = self.propertyValues.get(varKey)

			if (currentValue === undefined || currentValue === null) return false

			let numValue: number
			if (typeof currentValue === 'number') {
				numValue = currentValue
			} else if (typeof currentValue === 'object' && 'value' in currentValue) {
				numValue = Number(currentValue.value)
			} else {
				numValue = Number(currentValue)
			}

			return !isNaN(numValue) && numValue > targetValue
		},
	}

	// Boolean property choices
	const booleanPropertyChoices =
		self.booleanPropertyChoices.length > 0 ? self.booleanPropertyChoices : [{ id: '', label: 'No boolean properties' }]

	// Generic boolean property feedback - works with any boolean property
	feedbacks['property_bool'] = {
		type: 'boolean',
		name: 'Property: Boolean State',
		description: 'Change style when a boolean property is true/enabled',
		defaultStyle: {
			bgcolor: combineRgb(0, 150, 255),
			color: TEXT_COLORS.light,
		},
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
		callback: (feedback) => {
			const cameraUuid = feedback.options.camera as string
			const property = feedback.options.property as string
			if (!cameraUuid || !property) return false

			const cameraIndex = self.cameras.findIndex((c) => c.uuid === cameraUuid)
			if (cameraIndex === -1) return false

			const value = self.propertyValues.get(`camera_${cameraIndex}_${property}`)
			return isTruthyValue(value)
		},
	}

	// User step size feedback
	feedbacks['user_step_size'] = {
		type: 'boolean',
		name: 'User: Step Size Active',
		description: 'True when the specified step size is active for a user',
		defaultStyle: {
			bgcolor: combineRgb(0, 150, 0),
			color: combineRgb(255, 255, 255),
		},
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
		callback: (feedback) => {
			const userUuid = feedback.options.user as string
			const stepSize = feedback.options.step_size as string
			if (!userUuid) return false
			return self.getUserStepSize(userUuid) === stepSize
		},
	}

	// User PTZ mode feedback
	feedbacks['user_ptz_mode'] = {
		type: 'boolean',
		name: 'User: PTZ Mode Active',
		description: 'True when the specified PTZ mode is active for a user',
		defaultStyle: {
			bgcolor: combineRgb(0, 150, 0),
			color: combineRgb(255, 255, 255),
		},
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
		callback: (feedback) => {
			const userUuid = feedback.options.user as string
			const ptzMode = feedback.options.ptz_mode as string
			if (!userUuid) return false
			return self.getUserPtzMode(userUuid) === ptzMode
		},
	}

	// User PTZ action feedback
	feedbacks['user_ptz_action'] = {
		type: 'boolean',
		name: 'User: PTZ Action Active',
		description: 'True when the specified PTZ action is active for a user',
		defaultStyle: {
			bgcolor: combineRgb(0, 150, 0),
			color: combineRgb(255, 255, 255),
		},
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
		callback: (feedback) => {
			const userUuid = feedback.options.user as string
			const ptzAction = feedback.options.ptz_action as string
			if (!userUuid) return false
			return self.getUserPtzAction(userUuid) === ptzAction
		},
	}

	// ===================
	// Router Feedbacks
	// ===================

	// Get module choices for router
	const moduleChoices = self.moduleChoices.length > 0 ? self.moduleChoices : [{ id: '', label: 'No modules available' }]

	feedbacks['route_active'] = {
		type: 'boolean',
		name: 'Router: Route Active',
		description: 'True when a specific input is routed to a specific output',
		defaultStyle: {
			bgcolor: combineRgb(0, 100, 0),
			color: combineRgb(255, 255, 255),
		},
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
		callback: (feedback) => {
			const moduleUuid = feedback.options.module as string
			const sourceIdx = feedback.options.source as number
			const destIdx = feedback.options.destination as number
			if (!moduleUuid) return false

			// Find the tally bus for this module
			const tallyBus = self.tally.find((t) => t.uuid === moduleUuid)
			if (!tallyBus) return false

			// Check if the output has this input routed
			const output = tallyBus.outputs?.[destIdx]
			if (!output) return false

			return output.routedInput?.number === sourceIdx
		},
	}

	// Route tally color feedback - shows the output's tally color
	feedbacks['route_tally_color'] = {
		type: 'advanced',
		name: 'Router: Output Tally Color',
		description: 'Shows the tally color of a router output',
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
				label: 'Output',
				default: 0,
				min: 0,
				max: 999,
			},
		],
		callback: (feedback) => {
			const moduleUuid = feedback.options.module as string
			const outputIdx = feedback.options.output as number
			if (!moduleUuid) return {}

			// Find the tally bus for this module
			const tallyBus = self.tally.find((t) => t.uuid === moduleUuid)
			if (!tallyBus) return {}

			const output = tallyBus.outputs?.[outputIdx]
			if (!output || !output.tallyColor) return {}

			const bgColor = TALLY_COLORS[output.tallyColor as keyof typeof TALLY_COLORS] ?? TALLY_COLORS.off
			const textColor =
				output.tallyColor === 'green' || output.tallyColor === 'yellow' ? TEXT_COLORS.dark : TEXT_COLORS.light

			return {
				bgcolor: bgColor,
				color: textColor,
			}
		},
	}

	// ===================
	// User Routing Feedbacks
	// ===================

	feedbacks['route_module_selected'] = {
		type: 'boolean',
		name: 'User Routing: Module Selected',
		description: 'True when this module is selected for a user',
		defaultStyle: {
			bgcolor: combineRgb(0, 100, 150),
			color: combineRgb(255, 255, 255),
		},
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
		callback: (feedback) => {
			const userUuid = feedback.options.user as string
			const moduleUuid = feedback.options.module as string
			if (!userUuid || !moduleUuid) return false
			return self.getUserSelectedModule(userUuid) === moduleUuid
		},
	}

	feedbacks['route_destination_selected'] = {
		type: 'boolean',
		name: 'User Routing: Destination Selected',
		description: 'True when this output is selected as destination for a user',
		defaultStyle: {
			bgcolor: combineRgb(150, 100, 0),
			color: combineRgb(255, 255, 255),
		},
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
			{
				id: 'output',
				type: 'number',
				label: 'Output Index',
				default: 0,
				min: 0,
				max: 999,
			},
		],
		callback: (feedback) => {
			const userUuid = feedback.options.user as string
			const moduleUuid = feedback.options.module as string
			const outputIdx = feedback.options.output as number
			if (!userUuid || !moduleUuid) return false
			// Check if user has this module and output selected
			return self.getUserSelectedModule(userUuid) === moduleUuid && self.getUserSelectedOutput(userUuid) === outputIdx
		},
	}

	// Show which source is currently routed (for the selected output)
	feedbacks['route_source_active_for_user'] = {
		type: 'boolean',
		name: 'User Routing: Source Active',
		description: "True when this source is currently routed to the user's selected destination",
		defaultStyle: {
			bgcolor: combineRgb(0, 120, 0),
			color: combineRgb(255, 255, 255),
		},
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
		callback: (feedback) => {
			const userUuid = feedback.options.user as string
			const sourceIdx = feedback.options.source as number
			if (!userUuid) return false

			const moduleUuid = self.getUserSelectedModule(userUuid)
			const outputIdx = self.getUserSelectedOutput(userUuid)
			if (!moduleUuid || outputIdx === undefined) return false

			// Find the tally bus and check if this source is routed to the selected output
			const tallyBus = self.tally.find((t) => t.uuid === moduleUuid)
			if (!tallyBus) return false

			const output = tallyBus.outputs?.[outputIdx]
			return output?.routedInput?.number === sourceIdx
		},
	}

	// User destination selected (checks user's selected module)
	feedbacks['route_destination_selected_user'] = {
		type: 'boolean',
		name: 'User Routing: Output Selected',
		description: 'True when this output is selected for the user (on their selected module)',
		defaultStyle: {
			bgcolor: combineRgb(150, 100, 0),
			color: combineRgb(255, 255, 255),
		},
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
		callback: (feedback) => {
			const userUuid = feedback.options.user as string
			const outputIdx = feedback.options.output as number
			if (!userUuid) return false
			return self.getUserSelectedOutput(userUuid) === outputIdx
		},
	}

	// User's selected module output tally color
	feedbacks['route_tally_color_user'] = {
		type: 'advanced',
		name: 'User Routing: Output Tally Color',
		description: "Shows the tally color of the output on user's selected module",
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
				label: 'Output',
				default: 0,
				min: 0,
				max: 999,
			},
		],
		callback: (feedback) => {
			const userUuid = feedback.options.user as string
			const outputIdx = feedback.options.output as number
			if (!userUuid) return {}

			const moduleUuid = self.getUserSelectedModule(userUuid)
			if (!moduleUuid) return {}

			const tallyBus = self.tally.find((t) => t.uuid === moduleUuid)
			if (!tallyBus) return {}

			const output = tallyBus.outputs?.[outputIdx]
			if (!output || !output.tallyColor) return {}

			const bgColor = TALLY_COLORS[output.tallyColor as keyof typeof TALLY_COLORS] ?? TALLY_COLORS.off
			const textColor =
				output.tallyColor === 'green' || output.tallyColor === 'yellow' ? TEXT_COLORS.dark : TEXT_COLORS.light

			return {
				bgcolor: bgColor,
				color: textColor,
			}
		},
	}

	// ===================
	// Static Module Routing Feedbacks (per-module folders)
	// ===================

	feedbacks['route_destination_selected_static'] = {
		type: 'boolean',
		name: 'Static Router: Destination Selected',
		description: 'True when this output is selected for routing on the module',
		defaultStyle: {
			bgcolor: combineRgb(150, 100, 0),
			color: combineRgb(255, 255, 255),
		},
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
		callback: (feedback) => {
			const moduleUuid = feedback.options.module as string
			const outputIdx = feedback.options.output as number
			if (!moduleUuid) return false
			return self.getStaticSelectedOutput(moduleUuid) === outputIdx
		},
	}

	feedbacks['route_source_active_static'] = {
		type: 'boolean',
		name: 'Static Router: Source Active',
		description: "True when this source is routed to the module's selected destination",
		defaultStyle: {
			bgcolor: combineRgb(0, 120, 0),
			color: combineRgb(255, 255, 255),
		},
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
		callback: (feedback) => {
			const moduleUuid = feedback.options.module as string
			const sourceIdx = feedback.options.source as number
			if (!moduleUuid) return false

			const outputIdx = self.getStaticSelectedOutput(moduleUuid)
			if (outputIdx === undefined) return false

			const tallyBus = self.tally.find((t) => t.uuid === moduleUuid)
			if (!tallyBus) return false

			const output = tallyBus.outputs?.[outputIdx]
			return output?.routedInput?.number === sourceIdx
		},
	}

	self.setFeedbackDefinitions(feedbacks)
}
