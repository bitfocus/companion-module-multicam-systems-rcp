import { combineRgb, type CompanionPresetDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

// Style constants
const COLORS = {
	white: combineRgb(255, 255, 255),
	black: combineRgb(0, 0, 0),
	darkGray: combineRgb(40, 40, 40),
	mediumGray: combineRgb(80, 80, 80),
	red: combineRgb(255, 0, 0),
	green: combineRgb(0, 255, 0),
	blue: combineRgb(0, 100, 255),
	yellow: combineRgb(255, 200, 0),
	orange: combineRgb(255, 128, 0),
	purple: combineRgb(128, 0, 200),
}

// Group configuration with distinct colors
const GROUP_CONFIG: Record<string, { color: number; order: number; displayName: string }> = {
	lens: { color: combineRgb(100, 150, 255), order: 1, displayName: 'Lens' },
	color: { color: combineRgb(255, 150, 100), order: 2, displayName: 'Color' },
	ptz: { color: combineRgb(100, 255, 150), order: 3, displayName: 'PTZ' },
	sensor: { color: combineRgb(255, 200, 100), order: 4, displayName: 'Sensor' },
	monitor: { color: combineRgb(150, 100, 255), order: 5, displayName: 'Monitor' },
	audio: { color: combineRgb(100, 200, 255), order: 6, displayName: 'Audio' },
	system: { color: combineRgb(200, 200, 200), order: 7, displayName: 'System' },
	record: { color: combineRgb(255, 100, 100), order: 8, displayName: 'Record' },
	matrix: { color: combineRgb(200, 150, 255), order: 9, displayName: 'Matrix' },
}

// Property type detection based on naming conventions
function getPropertyType(prop: string): 'boolean' | 'float' | 'enum' {
	const lowerProp = prop.toLowerCase()

	// Boolean patterns
	const booleanPatterns = ['auto_', 'enable', 'show_', 'hide_', 'flip_', 'mirror_', 'color_bars', 'mute', '_on', '_off']
	if (booleanPatterns.some((pattern) => lowerProp.includes(pattern))) {
		return 'boolean'
	}

	// Enum patterns
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
	if (enumPatterns.some((pattern) => lowerProp.includes(pattern))) {
		return 'enum'
	}

	return 'float'
}

// Property group detection based on naming conventions
function getPropertyGroup(prop: string): string {
	const lowerProp = prop.toLowerCase()

	if (
		lowerProp.includes('iris') ||
		lowerProp.includes('focus') ||
		lowerProp.includes('zoom') ||
		lowerProp.includes('nd_filter') ||
		lowerProp.includes('detail')
	) {
		return 'lens'
	}
	if (
		lowerProp.includes('pan') ||
		lowerProp.includes('tilt') ||
		lowerProp.includes('preset') ||
		lowerProp.includes('ptz') ||
		lowerProp.includes('speed')
	) {
		return 'ptz'
	}
	if (
		lowerProp.includes('gain') ||
		lowerProp.includes('lift') ||
		lowerProp.includes('gamma') ||
		lowerProp.includes('hue') ||
		lowerProp.includes('saturation') ||
		lowerProp.includes('contrast') ||
		lowerProp.includes('brightness') ||
		lowerProp.includes('pedestal') ||
		lowerProp.includes('color') ||
		lowerProp.includes('red') ||
		lowerProp.includes('blue') ||
		lowerProp.includes('green') ||
		lowerProp.includes('white_balance')
	) {
		return 'color'
	}
	if (lowerProp.includes('shutter') || lowerProp.includes('exposure') || lowerProp.includes('iso')) {
		return 'sensor'
	}
	if (lowerProp.includes('osd') || lowerProp.includes('monitor') || lowerProp.includes('display')) {
		return 'monitor'
	}
	if (lowerProp.includes('audio') || lowerProp.includes('volume') || lowerProp.includes('mute')) {
		return 'audio'
	}
	if (lowerProp.includes('record') || lowerProp.includes('codec') || lowerProp.includes('storage')) {
		return 'record'
	}
	if (lowerProp.includes('matrix')) {
		return 'matrix'
	}

	return 'system'
}

// Format property name for display
function formatPropertyName(prop: string): string {
	return prop.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Get display name for a camera (uses user name for user-assigned virtual cameras)
function getCameraDisplayName(
	camera: { uuid: string; name: string; virtualCameraEnable?: boolean },
	users: { uuid: string; name: string; attachedVirtualCameraUuid?: string }[],
	fallbackIndex: number,
): string {
	const assignedUser = users.find((u) => u.attachedVirtualCameraUuid === camera.uuid)
	if (assignedUser) {
		return assignedUser.name || `User ${fallbackIndex}`
	}
	if (camera.virtualCameraEnable) {
		return `Virtual: ${camera.name || `CAM ${fallbackIndex}`}`
	}
	return camera.name || `CAM ${fallbackIndex}`
}

// Get subtle color coding for specific color-grading properties
function getPropertyColor(prop: string): number {
	const lowerProp = prop.toLowerCase()

	// Only color-code specific color grading properties, not any property with "red" etc.
	const redProps = ['red_gain', 'red_lift', 'red_gamma', 'red_pedestal', 'r_gain', 'r_lift', 'r_phase', 'r_saturation']
	const greenProps = [
		'green_gain',
		'green_lift',
		'green_gamma',
		'green_pedestal',
		'g_gain',
		'g_lift',
		'g_phase',
		'g_saturation',
	]
	const blueProps = [
		'blue_gain',
		'blue_lift',
		'blue_gamma',
		'blue_pedestal',
		'b_gain',
		'b_lift',
		'b_phase',
		'b_saturation',
	]

	if (redProps.some((p) => lowerProp.includes(p))) {
		return combineRgb(80, 40, 40) // Subtle red
	}
	if (greenProps.some((p) => lowerProp.includes(p))) {
		return combineRgb(40, 70, 40) // Subtle green
	}
	if (blueProps.some((p) => lowerProp.includes(p))) {
		return combineRgb(40, 40, 80) // Subtle blue
	}

	return COLORS.darkGray
}

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions = {}

	// Debug logging
	if (self.config.debug_messages) {
		self.log('debug', `UpdatePresets: ${self.cameras.length} cameras, ${self.users.length} users`)
	}

	// ===================
	// CAMERA SETTINGS FOLDERS
	// One folder per camera with all controls grouped
	// ===================

	self.cameras.forEach((camera, cameraIndex) => {
		const camNum = cameraIndex + 1
		const cameraDisplayName = getCameraDisplayName(camera, self.users, camNum)
		const cameraUuid = camera.uuid
		const camIdShort = cameraUuid.substring(0, 8)

		// Check if this is a user-assigned virtual camera
		const assignedUser = self.users.find((u) => u.attachedVirtualCameraUuid === camera.uuid)
		const isUserCamera = !!assignedUser
		const userUuid = assignedUser?.uuid || ''

		// Folder name differs for user-assigned cameras
		const folderName = isUserCamera
			? `User selected camera settings: ${cameraDisplayName}`
			: `Camera settings: ${cameraDisplayName}`

		// Get all properties for this camera
		const properties = camera.assignedModuleControlProperties || []
		if (properties.length === 0) return

		// Group properties by their group
		const groupedProps: Record<string, string[]> = {}
		properties.forEach((prop) => {
			const group = getPropertyGroup(prop)
			if (!groupedProps[group]) groupedProps[group] = []
			groupedProps[group].push(prop)
		})

		// Sort groups by order
		const sortedGroups = Object.keys(groupedProps).sort((a, b) => {
			return (GROUP_CONFIG[a]?.order || 99) - (GROUP_CONFIG[b]?.order || 99)
		})

		// Generate presets for each group
		sortedGroups.forEach((group) => {
			const groupConfig = GROUP_CONFIG[group] || { color: COLORS.darkGray, displayName: group }
			const groupProps = groupedProps[group].sort()

			// Group header button (placeholder/separator)
			presets[`cam_${camIdShort}_group_${group}`] = {
				type: 'button',
				category: folderName,
				name: `[${groupConfig.displayName}]`,
				style: {
					text: `━━━━━━━━\\n${groupConfig.displayName.toUpperCase()}\\n━━━━━━━━`,
					size: 'auto',
					color: COLORS.white,
					bgcolor: groupConfig.color,
				},
				steps: [{ down: [], up: [] }],
				feedbacks: [],
			}

			// Generate buttons for each property in the group
			groupProps.forEach((prop) => {
				const propType = getPropertyType(prop)
				const propDisplayName = formatPropertyName(prop)
				const propIdShort = prop.substring(0, 16)

				if (propType === 'float') {
					// Float property: +, + with value, value, -
					// For user cameras: use user_setting with user pre-selected
					// For regular cameras: use normal
					const floatOptions = isUserCamera
						? { camera: cameraUuid, property: prop, step_size: 'user_setting', user: userUuid }
						: { camera: cameraUuid, property: prop, step_size: 'normal' }

					// Get color coding for color-related properties
					const propBgColor = getPropertyColor(prop)
					const propBgColorLight =
						getPropertyColor(prop) === COLORS.darkGray ? COLORS.mediumGray : getPropertyColor(prop)

					// Increase button (for 3-button setup)
					presets[`cam_${camIdShort}_${propIdShort}_inc`] = {
						type: 'button',
						category: folderName,
						name: `${propDisplayName} +`,
						style: {
							text: `${propDisplayName}\\n▲`,
							size: 'auto',
							color: COLORS.white,
							bgcolor: propBgColor,
						},
						steps: [
							{
								down: [
									{
										actionId: 'float_increase',
										options: floatOptions,
									},
								],
								up: [],
							},
						],
						feedbacks: [],
					}

					// Increase with value button (for 2-button setup)
					presets[`cam_${camIdShort}_${propIdShort}_inc_val`] = {
						type: 'button',
						category: folderName,
						name: `${propDisplayName} + (value)`,
						style: {
							text: `${propDisplayName}\\n$(multicam-rcp:camera_${camNum}_${prop})\\n▲`,
							size: 'auto',
							color: COLORS.white,
							bgcolor: propBgColor,
						},
						steps: [
							{
								down: [
									{
										actionId: 'float_increase',
										options: floatOptions,
									},
								],
								up: [],
							},
						],
						feedbacks: [],
					}

					// Value only button (for 3-button setup)
					presets[`cam_${camIdShort}_${propIdShort}_val`] = {
						type: 'button',
						category: folderName,
						name: `${propDisplayName} Value`,
						style: {
							text: `${propDisplayName}\\n$(multicam-rcp:camera_${camNum}_${prop})`,
							size: 'auto',
							color: COLORS.white,
							bgcolor: propBgColorLight,
						},
						steps: [{ down: [], up: [] }],
						feedbacks: [],
					}

					// Decrease button
					presets[`cam_${camIdShort}_${propIdShort}_dec`] = {
						type: 'button',
						category: folderName,
						name: `${propDisplayName} -`,
						style: {
							text: `${propDisplayName}\\n▼`,
							size: 'auto',
							color: COLORS.white,
							bgcolor: propBgColor,
						},
						steps: [
							{
								down: [
									{
										actionId: 'float_decrease',
										options: floatOptions,
									},
								],
								up: [],
							},
						],
						feedbacks: [],
					}
				} else if (propType === 'boolean') {
					// Boolean property: On, Off, Toggle

					// On button (with feedback when on)
					presets[`cam_${camIdShort}_${propIdShort}_on`] = {
						type: 'button',
						category: folderName,
						name: `${propDisplayName} On`,
						style: {
							text: `${propDisplayName}\\nON`,
							size: 'auto',
							color: COLORS.white,
							bgcolor: COLORS.darkGray,
						},
						steps: [
							{
								down: [
									{
										actionId: 'bool_set',
										options: { camera: cameraUuid, property: prop, value: true },
									},
								],
								up: [],
							},
						],
						feedbacks: [
							{
								feedbackId: 'property_bool',
								options: { camera: cameraUuid, property: prop },
								style: { bgcolor: combineRgb(0, 150, 0) },
							},
						],
					}

					// Off button (with feedback when off)
					presets[`cam_${camIdShort}_${propIdShort}_off`] = {
						type: 'button',
						category: folderName,
						name: `${propDisplayName} Off`,
						style: {
							text: `${propDisplayName}\\nOFF`,
							size: 'auto',
							color: COLORS.white,
							bgcolor: COLORS.darkGray,
						},
						steps: [
							{
								down: [
									{
										actionId: 'bool_set',
										options: { camera: cameraUuid, property: prop, value: false },
									},
								],
								up: [],
							},
						],
						feedbacks: [
							{
								feedbackId: 'property_bool',
								options: { camera: cameraUuid, property: prop },
								style: { bgcolor: COLORS.darkGray },
								isInverted: true,
							},
						],
					}

					// Toggle button (with feedback when on)
					presets[`cam_${camIdShort}_${propIdShort}_toggle`] = {
						type: 'button',
						category: folderName,
						name: `${propDisplayName} Toggle`,
						style: {
							text: `${propDisplayName}\\nTOGGLE`,
							size: 'auto',
							color: COLORS.white,
							bgcolor: COLORS.darkGray,
						},
						steps: [
							{
								down: [
									{
										actionId: 'bool_toggle',
										options: { camera: cameraUuid, property: prop },
									},
								],
								up: [],
							},
						],
						feedbacks: [
							{
								feedbackId: 'property_bool',
								options: { camera: cameraUuid, property: prop },
								style: { bgcolor: combineRgb(0, 150, 0) },
							},
						],
					}
				} else if (propType === 'enum') {
					// Enum property: +, + with value, value, -

					// Next button (for 3-button setup)
					presets[`cam_${camIdShort}_${propIdShort}_next`] = {
						type: 'button',
						category: folderName,
						name: `${propDisplayName} +`,
						style: {
							text: `${propDisplayName}\\n▲`,
							size: 'auto',
							color: COLORS.white,
							bgcolor: COLORS.darkGray,
						},
						steps: [
							{
								down: [
									{
										actionId: 'enum_next',
										options: { camera: cameraUuid, property: prop },
									},
								],
								up: [],
							},
						],
						feedbacks: [],
					}

					// Next with value button (for 2-button setup)
					presets[`cam_${camIdShort}_${propIdShort}_next_val`] = {
						type: 'button',
						category: folderName,
						name: `${propDisplayName} + (value)`,
						style: {
							text: `${propDisplayName}\\n$(multicam-rcp:camera_${camNum}_${prop})\\n▲`,
							size: 'auto',
							color: COLORS.white,
							bgcolor: COLORS.darkGray,
						},
						steps: [
							{
								down: [
									{
										actionId: 'enum_next',
										options: { camera: cameraUuid, property: prop },
									},
								],
								up: [],
							},
						],
						feedbacks: [],
					}

					// Value only button (for 3-button setup)
					presets[`cam_${camIdShort}_${propIdShort}_val`] = {
						type: 'button',
						category: folderName,
						name: `${propDisplayName} Value`,
						style: {
							text: `${propDisplayName}\\n$(multicam-rcp:camera_${camNum}_${prop})`,
							size: 'auto',
							color: COLORS.white,
							bgcolor: COLORS.mediumGray,
						},
						steps: [{ down: [], up: [] }],
						feedbacks: [],
					}

					// Previous button
					presets[`cam_${camIdShort}_${propIdShort}_prev`] = {
						type: 'button',
						category: folderName,
						name: `${propDisplayName} -`,
						style: {
							text: `${propDisplayName}\\n▼`,
							size: 'auto',
							color: COLORS.white,
							bgcolor: COLORS.darkGray,
						},
						steps: [
							{
								down: [
									{
										actionId: 'enum_prev',
										options: { camera: cameraUuid, property: prop },
									},
								],
								up: [],
							},
						],
						feedbacks: [],
					}
				}
			})
		})

		// ===================
		// PTZ Presets at bottom of camera settings (20 presets)
		// For user cameras: use user_setting with user pre-selected
		// For regular cameras: use normal defaults
		// ===================

		// PTZ Preset header
		presets[`cam_${camIdShort}_ptz_header`] = {
			type: 'button',
			category: folderName,
			name: '[PTZ Presets]',
			style: {
				text: `━━━━━━━━\\nPTZ PRESETS\\n━━━━━━━━`,
				size: 'auto',
				color: COLORS.white,
				bgcolor: combineRgb(80, 120, 80),
			},
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		}

		// Generate 20 PTZ preset buttons
		for (let presetNum = 1; presetNum <= 20; presetNum++) {
			const ptzOptions = isUserCamera
				? {
						camera: cameraUuid,
						preset: presetNum,
						action: 'user_setting',
						mode: 'user_setting',
						user: userUuid,
					}
				: {
						camera: cameraUuid,
						preset: presetNum,
						action: 'recall',
						mode: 'normal',
					}

			presets[`cam_${camIdShort}_ptz_${presetNum}`] = {
				type: 'button',
				category: folderName,
				name: `PTZ Preset ${presetNum}`,
				style: {
					text: `P${presetNum}`,
					size: 'auto',
					color: COLORS.white,
					bgcolor: COLORS.darkGray,
				},
				steps: [
					{
						down: [
							{
								actionId: 'ptz_preset',
								options: ptzOptions,
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			}
		}
	})

	// ===================
	// ROTARY PRESETS FOR STREAM DECK+ (per camera)
	// One button per property with name+value, rotary for adjust
	// ===================

	self.cameras.forEach((camera, cameraIndex) => {
		const camNum = cameraIndex + 1
		const cameraDisplayName = getCameraDisplayName(camera, self.users, camNum)
		const cameraUuid = camera.uuid
		const camIdShort = cameraUuid.substring(0, 8)

		// Check if this is a user-assigned virtual camera
		const assignedUser = self.users.find((u) => u.attachedVirtualCameraUuid === camera.uuid)
		const isUserCamera = !!assignedUser
		const userUuid = assignedUser?.uuid || ''

		// Folder name for rotary presets
		const rotaryFolderName = isUserCamera
			? `Rotary: User selected: ${cameraDisplayName}`
			: `Rotary: ${cameraDisplayName}`

		// Get all float properties for this camera (rotary makes most sense for float values)
		const properties = camera.assignedModuleControlProperties || []
		const floatProperties = properties.filter((prop) => {
			const lowerProp = prop.toLowerCase()
			// Exclude boolean and enum patterns
			const booleanPatterns = [
				'auto_',
				'enable',
				'show_',
				'hide_',
				'flip_',
				'mirror_',
				'color_bars',
				'mute',
				'_on',
				'_off',
			]
			const enumPatterns = ['_mode', '_format', 'shutter_speed', 'nd_filter', 'white_balance', 'scene_file', 'tally']
			const isBoolean = booleanPatterns.some((pattern) => lowerProp.includes(pattern))
			const isEnum = enumPatterns.some((pattern) => lowerProp.includes(pattern))
			return !isBoolean && !isEnum
		})

		if (floatProperties.length === 0) return

		// Generate rotary preset for each float property
		floatProperties.forEach((prop) => {
			const propDisplayName = formatPropertyName(prop)
			const propIdShort = prop.substring(0, 16)
			const propBgColor = getPropertyColor(prop)

			// Action options
			const floatOptions = isUserCamera
				? { camera: cameraUuid, property: prop, step_size: 'user_setting', user: userUuid }
				: { camera: cameraUuid, property: prop, step_size: 'normal' }

			presets[`rotary_${camIdShort}_${propIdShort}`] = {
				type: 'button',
				category: rotaryFolderName,
				name: `${propDisplayName} (Rotary)`,
				style: {
					text: `${propDisplayName}\\n$(multicam-rcp:camera_${camNum}_${prop})`,
					size: 'auto',
					color: COLORS.white,
					bgcolor: propBgColor,
				},
				options: {
					rotaryActions: true,
				},
				steps: [
					{
						down: [],
						up: [],
						rotate_left: [
							{
								actionId: 'float_decrease',
								options: floatOptions,
							},
						],
						rotate_right: [
							{
								actionId: 'float_increase',
								options: floatOptions,
							},
						],
					},
				],
				feedbacks: [],
			}
		})
	})

	// ===================
	// USER CAMERA SELECT FOLDERS
	// One folder per user with camera selection, step size, and PTZ modes
	// ===================

	const physicalCameras = self.cameras.filter((camera) => !camera.virtualCameraEnable)

	self.users.forEach((user, userIndex) => {
		const userNum = userIndex + 1
		const userName = user.name || `User ${userNum}`
		const userUuid = user.uuid
		const userIdShort = userUuid.substring(0, 8)
		const folderName = `User camera select: ${userName}`

		// ===================
		// Camera Selection Buttons
		// ===================

		physicalCameras.forEach((camera, physicalIndex) => {
			const originalIndex = self.cameras.findIndex((c) => c.uuid === camera.uuid)
			const camNum = originalIndex + 1
			const cameraName = camera.name || `CAM ${physicalIndex + 1}`
			const cameraUuid = camera.uuid
			const camIdShort = cameraUuid.substring(0, 8)

			presets[`user_${userIdShort}_cam_${camIdShort}`] = {
				type: 'button',
				category: folderName,
				name: `Select ${cameraName}`,
				style: {
					text: `$(multicam-rcp:camera_${camNum}_name)`,
					size: 'auto',
					color: COLORS.white,
					bgcolor: COLORS.darkGray,
				},
				steps: [
					{
						down: [
							{
								actionId: 'select_user_preview',
								options: { user: userUuid, camera: cameraUuid },
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'camera_tally_color',
						options: { camera: cameraUuid, set_off_color: false },
					},
					{
						feedbackId: 'user_preview_indicator',
						options: {
							user: userUuid,
							camera: cameraUuid,
							border_width: 4,
							indicator_color: COLORS.white,
						},
					},
				],
			}
		})

		// ===================
		// Step Size Selector
		// ===================

		presets[`user_${userIdShort}_stepsize_header`] = {
			type: 'button',
			category: folderName,
			name: '[Adjust Step Size]',
			style: {
				text: `━━━━━━━━\\nSTEP SIZE\\n━━━━━━━━`,
				size: 'auto',
				color: COLORS.white,
				bgcolor: combineRgb(100, 100, 150),
			},
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		}

		// Step size buttons with feedback
		const stepSizes = [
			{ id: 'big', label: 'BIG', activeColor: combineRgb(150, 80, 80) },
			{ id: 'normal', label: 'NORMAL', activeColor: combineRgb(80, 150, 80) },
			{ id: 'small', label: 'SMALL', activeColor: combineRgb(80, 80, 150) },
		]

		stepSizes.forEach((size) => {
			presets[`user_${userIdShort}_stepsize_${size.id}`] = {
				type: 'button',
				category: folderName,
				name: `Step Size: ${size.label}`,
				style: {
					text: size.label,
					size: 'auto',
					color: COLORS.white,
					bgcolor: COLORS.darkGray,
				},
				steps: [
					{
						down: [
							{
								actionId: 'set_user_step_size',
								options: { user: userUuid, step_size: size.id },
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'user_step_size',
						options: { user: userUuid, step_size: size.id },
						style: { bgcolor: size.activeColor },
					},
				],
			}
		})

		// ===================
		// PTZ Mode Selector
		// ===================

		presets[`user_${userIdShort}_ptzmode_header`] = {
			type: 'button',
			category: folderName,
			name: '[PTZ Mode]',
			style: {
				text: `━━━━━━━━\\nPTZ MODE\\n━━━━━━━━`,
				size: 'auto',
				color: COLORS.white,
				bgcolor: combineRgb(100, 150, 100),
			},
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		}

		// PTZ mode buttons with feedback
		const ptzModes = [
			{ id: 'normal', label: 'NORMAL', activeColor: combineRgb(80, 150, 80) },
			{ id: 'tracing', label: 'TRACING', activeColor: combineRgb(150, 150, 80) },
			{ id: 'scene', label: 'SCENE', activeColor: combineRgb(80, 80, 150) },
		]

		ptzModes.forEach((mode) => {
			presets[`user_${userIdShort}_ptzmode_${mode.id}`] = {
				type: 'button',
				category: folderName,
				name: `PTZ Mode: ${mode.label}`,
				style: {
					text: mode.label,
					size: 'auto',
					color: COLORS.white,
					bgcolor: COLORS.darkGray,
				},
				steps: [
					{
						down: [
							{
								actionId: 'set_user_ptz_mode',
								options: { user: userUuid, ptz_mode: mode.id },
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'user_ptz_mode',
						options: { user: userUuid, ptz_mode: mode.id },
						style: { bgcolor: mode.activeColor },
					},
				],
			}
		})

		// ===================
		// PTZ Action Selector
		// ===================

		presets[`user_${userIdShort}_ptzaction_header`] = {
			type: 'button',
			category: folderName,
			name: '[PTZ Action]',
			style: {
				text: `━━━━━━━━\\nPTZ ACTION\\n━━━━━━━━`,
				size: 'auto',
				color: COLORS.white,
				bgcolor: combineRgb(150, 100, 100),
			},
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		}

		// PTZ action buttons with feedback
		const ptzActions = [
			{ id: 'recall', label: 'RECALL', activeColor: combineRgb(80, 150, 80) },
			{ id: 'store', label: 'STORE', activeColor: combineRgb(150, 80, 80) },
		]

		ptzActions.forEach((action) => {
			presets[`user_${userIdShort}_ptzaction_${action.id}`] = {
				type: 'button',
				category: folderName,
				name: `PTZ Action: ${action.label}`,
				style: {
					text: action.label,
					size: 'auto',
					color: COLORS.white,
					bgcolor: COLORS.darkGray,
				},
				steps: [
					{
						down: [
							{
								actionId: 'set_user_ptz_action',
								options: { user: userUuid, ptz_action: action.id },
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'user_ptz_action',
						options: { user: userUuid, ptz_action: action.id },
						style: { bgcolor: action.activeColor },
					},
				],
			}
		})

		// ===================
		// User Info Display
		// ===================

		presets[`user_${userIdShort}_info`] = {
			type: 'button',
			category: folderName,
			name: `${userName} Info`,
			style: {
				text: `$(multicam-rcp:user_${userNum}_name)\\n$(multicam-rcp:user_${userNum}_preview_camera)`,
				size: 'auto',
				color: COLORS.white,
				bgcolor: COLORS.darkGray,
			},
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		}
	})

	// ===================
	// STATIC ROUTER FOLDERS (per module, no user state needed)
	// ===================

	// Helper to get source name from input
	const getSourceLabel = (tallyBus: (typeof self.tally)[number], inputIdx: number) => {
		const input = tallyBus.inputs?.[inputIdx]
		if (!input) return `Input ${inputIdx}`
		if (input.routedFrom?.type === 'camera') {
			const camera = self.cameras.find((c) => c.uuid === input.routedFrom?.uuid)
			if (camera) return camera.name || input.customName || input.name
		}
		return input.customName || input.name || `Input ${inputIdx}`
	}

	// Get routable modules/tally buses
	const routableBuses = self.tally.filter((bus) => {
		const inputKeys = Object.keys(bus.inputs || {})
		const outputKeys = Object.keys(bus.outputs || {})
		return inputKeys.length > 0 && outputKeys.length > 0
	})

	// Create per-module folders with static routing (module hardcoded)
	routableBuses.forEach((tallyBus) => {
		const moduleName =
			tallyBus.name ||
			self.modules.find((m) => m.moduleUuid === tallyBus.uuid)?.customName ||
			self.modules.find((m) => m.moduleUuid === tallyBus.uuid)?.friendlyname ||
			`Router ${tallyBus.uuid.substring(0, 8)}`

		const folderName = `Router: ${moduleName}`
		const busIdShort = tallyBus.uuid.substring(0, 8)

		const inputKeys = Object.keys(tallyBus.inputs || {}).map((k) => parseInt(k))
		const outputKeys = Object.keys(tallyBus.outputs || {}).map((k) => parseInt(k))

		// Create output (destination) buttons
		outputKeys.forEach((outputIdx) => {
			const output = tallyBus.outputs[outputIdx]
			if (!output || !output.routable) return

			const outputName = output.customName || output.name || `Out ${outputIdx}`

			presets[`router_${busIdShort}_out_${outputIdx}`] = {
				type: 'button',
				category: folderName,
				name: `Output: ${outputName}`,
				style: {
					text: `${outputName}`,
					size: 'auto',
					color: COLORS.white,
					bgcolor: combineRgb(60, 60, 40),
				},
				steps: [
					{
						down: [
							{
								actionId: 'route_select_destination_static',
								options: {
									module: tallyBus.uuid,
									output: outputIdx,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'route_destination_selected_static',
						options: {
							module: tallyBus.uuid,
							output: outputIdx,
						},
						style: {
							bgcolor: combineRgb(150, 100, 0),
						},
					},
					{
						feedbackId: 'route_tally_color',
						options: {
							module: tallyBus.uuid,
							output: outputIdx,
						},
					},
				],
			}
		})

		// Create input (source) buttons
		inputKeys.forEach((inputIdx) => {
			const input = tallyBus.inputs[inputIdx]
			if (!input || !input.routable) return

			const sourceLabel = getSourceLabel(tallyBus, inputIdx)

			presets[`router_${busIdShort}_in_${inputIdx}`] = {
				type: 'button',
				category: folderName,
				name: `Input: ${sourceLabel}`,
				style: {
					text: `${sourceLabel}`,
					size: 'auto',
					color: COLORS.white,
					bgcolor: COLORS.darkGray,
				},
				steps: [
					{
						down: [
							{
								actionId: 'route_source_to_static',
								options: {
									module: tallyBus.uuid,
									source: inputIdx,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'route_source_active_static',
						options: {
							module: tallyBus.uuid,
							source: inputIdx,
						},
						style: {
							bgcolor: combineRgb(0, 120, 0),
						},
					},
				],
			}
		})
	})

	// ===================
	// USER ROUTE FOLDERS
	// Generic buttons with dynamic labels from selected module
	// ===================

	const MAX_ROUTER_BUTTONS = 40

	self.users.forEach((user) => {
		const userIdShort = user.uuid.substring(0, 8)
		const folderName = `User route: ${user.name}`

		// Module selection buttons
		routableBuses.forEach((tallyBus) => {
			const moduleName =
				tallyBus.name ||
				self.modules.find((m) => m.moduleUuid === tallyBus.uuid)?.customName ||
				self.modules.find((m) => m.moduleUuid === tallyBus.uuid)?.friendlyname ||
				`Router ${tallyBus.uuid.substring(0, 8)}`

			presets[`user_route_${userIdShort}_module_${tallyBus.uuid.substring(0, 8)}`] = {
				type: 'button',
				category: folderName,
				name: `Select ${moduleName}`,
				style: {
					text: `🔌\\n${moduleName}`,
					size: 'auto',
					color: COLORS.white,
					bgcolor: combineRgb(50, 50, 80),
				},
				steps: [
					{
						down: [
							{
								actionId: 'route_select_module',
								options: {
									user: user.uuid,
									module: tallyBus.uuid,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'route_module_selected',
						options: {
							user: user.uuid,
							module: tallyBus.uuid,
						},
						style: {
							bgcolor: combineRgb(0, 100, 150),
						},
					},
				],
			}
		})

		// Generic output buttons (40 slots)
		for (let outputIdx = 0; outputIdx < MAX_ROUTER_BUTTONS; outputIdx++) {
			presets[`user_route_${userIdShort}_out_${outputIdx}`] = {
				type: 'button',
				category: folderName,
				name: `Output ${outputIdx}`,
				style: {
					text: `$(multicam-rcp:user_${userIdShort}_route_out_${outputIdx}_name)`,
					size: 'auto',
					color: COLORS.white,
					bgcolor: combineRgb(60, 60, 40),
				},
				steps: [
					{
						down: [
							{
								actionId: 'route_select_destination',
								options: {
									user: user.uuid,
									output: outputIdx,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'route_destination_selected_user',
						options: {
							user: user.uuid,
							output: outputIdx,
						},
						style: {
							bgcolor: combineRgb(150, 100, 0),
						},
					},
				],
			}
		}

		// Generic input buttons (40 slots)
		for (let inputIdx = 0; inputIdx < MAX_ROUTER_BUTTONS; inputIdx++) {
			presets[`user_route_${userIdShort}_in_${inputIdx}`] = {
				type: 'button',
				category: folderName,
				name: `Input ${inputIdx}`,
				style: {
					text: `$(multicam-rcp:user_${userIdShort}_route_in_${inputIdx}_name)`,
					size: 'auto',
					color: COLORS.white,
					bgcolor: COLORS.darkGray,
				},
				steps: [
					{
						down: [
							{
								actionId: 'route_source_to_selected',
								options: {
									user: user.uuid,
									source: inputIdx,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'route_source_active_for_user',
						options: {
							user: user.uuid,
							source: inputIdx,
						},
						style: {
							bgcolor: combineRgb(0, 120, 0),
						},
					},
				],
			}
		}
	})

	// Log preset count and categories for debugging
	const categories = new Set(
		Object.values(presets)
			.map((p) => p?.category)
			.filter(Boolean),
	)
	self.log('info', `Setting ${Object.keys(presets).length} presets in categories: ${Array.from(categories).join(', ')}`)

	self.setPresetDefinitions(presets)
}
