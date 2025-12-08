import type { CompanionVariableDefinition, CompanionVariableValues } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import type { PropertyValue } from './types.js'

/**
 * Update variable definitions based on current camera data
 */
export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const variables: CompanionVariableDefinition[] = []

	// Global variables
	variables.push({
		variableId: 'connected',
		name: 'Connection Status',
	})

	variables.push({
		variableId: 'camera_count',
		name: 'Number of Cameras',
	})

	variables.push({
		variableId: 'user_count',
		name: 'Number of Users',
	})

	// Per-camera variables (1-based for user readability)
	self.cameras.forEach((camera, index) => {
		const camNum = index + 1 // 1-based indexing
		const prefix = `camera_${camNum}`

		// Basic camera info
		variables.push({
			variableId: `${prefix}_name`,
			name: `Camera ${camNum} Name`,
		})

		variables.push({
			variableId: `${prefix}_id`,
			name: `Camera ${camNum} ID`,
		})

		variables.push({
			variableId: `${prefix}_uuid`,
			name: `Camera ${camNum} UUID`,
		})

		variables.push({
			variableId: `${prefix}_tally`,
			name: `Camera ${camNum} Tally State`,
		})

		variables.push({
			variableId: `${prefix}_tally_color`,
			name: `Camera ${camNum} Tally Color`,
		})

		// Dynamic properties from assignedModuleControlProperties
		const properties = camera.assignedModuleControlProperties || []
		properties.forEach((property) => {
			variables.push({
				variableId: `${prefix}_${property}`,
				name: `Camera ${camNum} ${formatPropertyName(property)}`,
			})
		})
	})

	// Per-user variables (1-based for user readability)
	self.users.forEach((user, index) => {
		const userNum = index + 1 // 1-based indexing
		const prefix = `user_${userNum}`

		variables.push({
			variableId: `${prefix}_name`,
			name: `User ${userNum} Name`,
		})

		variables.push({
			variableId: `${prefix}_uuid`,
			name: `User ${userNum} UUID`,
		})

		variables.push({
			variableId: `${prefix}_preview_camera`,
			name: `User ${userNum} Previewing Camera`,
		})

		variables.push({
			variableId: `${prefix}_preview_camera_uuid`,
			name: `User ${userNum} Previewing Camera UUID`,
		})

		// Add routing input/output label variables for this user
		const userIdShort = user.uuid.substring(0, 8)
		for (let i = 0; i < 40; i++) {
			variables.push({
				variableId: `user_${userIdShort}_route_in_${i}_name`,
				name: `User ${userNum} Route Input ${i} Label`,
			})
			variables.push({
				variableId: `user_${userIdShort}_route_out_${i}_name`,
				name: `User ${userNum} Route Output ${i} Label`,
			})
		}
	})

	self.setVariableDefinitions(variables)

	// Set initial values
	UpdateVariableValues(self)
}

/**
 * Update variable values with current state
 */
export function UpdateVariableValues(self: ModuleInstance): void {
	const values: CompanionVariableValues = {}

	// Global variables
	values['connected'] = self.socket?.connected ? 'Yes' : 'No'
	values['camera_count'] = self.cameras.length
	values['user_count'] = self.users.length

	// Per-camera variables (1-based for user readability)
	self.cameras.forEach((camera, index) => {
		const camNum = index + 1 // 1-based indexing
		const prefix = `camera_${camNum}`

		// Check for Virtual/User prefixes
		let displayName = camera.name || `Camera ${camNum}`
		const assignedUser = self.users.find((u) => u.attachedVirtualCameraUuid === camera.uuid)
		if (assignedUser) {
			displayName = `User selected: ${assignedUser.name}`
		} else if (camera.virtualCameraEnable) {
			displayName = `Virtual: ${displayName}`
		}

		values[`${prefix}_name`] = displayName
		values[`${prefix}_id`] = camera.id
		values[`${prefix}_uuid`] = camera.uuid

		// Get tally state
		const tallyColor = self.getCameraTallyColor(camera.uuid)
		values[`${prefix}_tally`] = tallyColor
		values[`${prefix}_tally_color`] = tallyColor

		// Dynamic properties from cached values (use 0-based index for internal lookup)
		const properties = camera.assignedModuleControlProperties || []
		properties.forEach((property) => {
			const internalKey = `camera_${index}_${property}` // Internal storage is 0-based
			const value = self.propertyValues.get(internalKey)
			values[`${prefix}_${property}`] = formatPropertyValue(value ?? null)
		})
	})

	// Per-user variables (1-based for user readability)
	self.users.forEach((user, index) => {
		const userNum = index + 1 // 1-based indexing
		const prefix = `user_${userNum}`

		values[`${prefix}_name`] = user.name || 'Unknown'
		values[`${prefix}_uuid`] = user.uuid || ''

		if (user.previewedCameraUuid) {
			const previewedCamera = self.cameras.find((c) => c.uuid === user.previewedCameraUuid)
			values[`${prefix}_preview_camera`] = previewedCamera?.name || 'Unknown'
			values[`${prefix}_preview_camera_uuid`] = user.previewedCameraUuid
		} else {
			values[`${prefix}_preview_camera`] = 'None'
			values[`${prefix}_preview_camera_uuid`] = ''
		}

		// Add routing input/output labels for this user (based on their selected module)
		const userIdShort = user.uuid.substring(0, 8)
		for (let i = 0; i < 40; i++) {
			values[`user_${userIdShort}_route_in_${i}_name`] = self.getUserRouteInputLabel(user.uuid, i) || `In ${i}`
			values[`user_${userIdShort}_route_out_${i}_name`] = self.getUserRouteOutputLabel(user.uuid, i) || `Out ${i}`
		}
	})

	self.setVariableValues(values)
}

/**
 * Format a property name for display
 */
function formatPropertyName(prop: string): string {
	return prop.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Format a property value for display as a variable
 */
function formatPropertyValue(value: PropertyValue): string | number | boolean {
	if (value === null || value === undefined) {
		return ''
	}

	// Handle enum values (new format with index and value)
	if (typeof value === 'object' && 'value' in value) {
		return String((value as { value: string | number }).value)
	}

	// Handle numbers - round to reasonable precision
	if (typeof value === 'number') {
		if (Number.isInteger(value)) {
			return value
		}
		return Math.round(value * 1000) / 1000
	}

	// Handle booleans
	if (typeof value === 'boolean') {
		return value ? 'On' : 'Off'
	}

	return String(value)
}
