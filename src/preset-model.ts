/**
 * What both lines' presets know about cameras and controls: a control's kind, group, label
 * and range from the API (falling back to its name), and camera display names.
 */
import type { ModuleInstance } from './instance.js'

export const GROUP_ORDER: Record<string, { order: number; displayName: string }> = {
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
export function getPropertyType(prop: string): 'boolean' | 'float' | 'enum' {
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
export function getPropertyGroup(prop: string): string {
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

export function formatPropertyName(prop: string): string {
	return prop.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function getCameraDisplayName(
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
export function cameraDisplayNames(self: ModuleInstance): Map<string, string> {
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

export interface ControlInfo {
	kind: 'boolean' | 'enum' | 'float'
	group: string
	label: string
	min: number
	max: number
	unit: string | null
	movement: boolean
	namedSteps: boolean
}

/** What the API knows about a control; falls back to name heuristics. */
export function describeControl(self: ModuleInstance, cameraUuid: string, prop: string): ControlInfo {
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
	const group = control?.group ?? getPropertyGroup(prop)
	const label = control?.name ?? formatPropertyName(prop)
	const min = typeof control?.min === 'number' ? control.min : 0
	const max = typeof control?.max === 'number' && control.max > min ? control.max : min + 1
	const unit = control?.unit ?? null
	const movement = control?.behavior === 'movement'
	const namedSteps = !!control?.steps?.length
	return { kind, group, label, min, max, unit, movement, namedSteps }
}
