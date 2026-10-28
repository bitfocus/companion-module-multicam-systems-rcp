import type { CompanionPresetDefinitions, CompanionPresetSection } from '@companion-module/base'
import type { ModuleTypes } from '../companion.js'
import type { ModuleInstance } from '../instance.js'
import { channelAccent, controlSource, currentPresentation, liveTile, tone, valueTile } from './design.js'

/** Section name → group name → preset ids, in insertion order. */
export type PresetSections = Map<string, Map<string, string[]>>
export function addToSection(sections: PresetSections, section: string, group: string, id: string): void {
	let groups = sections.get(section)
	if (!groups) sections.set(section, (groups = new Map()))
	let ids = groups.get(group)
	if (!ids) groups.set(group, (ids = []))
	ids.push(id)
}
/**
 * Companion keeps a style override only when its value is wrapped as an expression-or-value
 * (`{ isExpression: false, value }`) and drops a feedback whose overrides all fall away, so
 * every plain override value is wrapped here before the presets are published.
 */
export function normalizeStyleOverrides(definitions: CompanionPresetDefinitions<ModuleTypes>): void {
	for (const preset of Object.values(definitions)) {
		if (!preset || preset.type !== 'layered') continue
		for (const feedback of preset.feedbacks ?? []) {
			const overrides = (feedback as { styleOverrides?: { override: unknown }[] }).styleOverrides
			for (const entry of overrides ?? []) {
				const value = entry.override
				const wrapped = typeof value === 'object' && value !== null && 'isExpression' in value
				if (!wrapped) entry.override = { isExpression: false, value }
			}
		}
	}
}

export function sectionsToStructure(sections: PresetSections): CompanionPresetSection<ModuleTypes>[] {
	return Array.from(sections, ([name, groups]) => ({
		id: name,
		name,
		definitions: Array.from(groups, ([groupName, presets]) => ({
			type: 'simple' as const,
			id: `${name} / ${groupName}`,
			name: groupName,
			presets,
		})),
	}))
}
/** Read-only gauges for every numeric control, and live video tiles. */
export function addGraphicsPresets(
	self: ModuleInstance,
	definitions: CompanionPresetDefinitions<ModuleTypes>,
	sections: PresetSections,
): void {
	const defaultUser = self.users[0]?.uuid ?? ''
	const hiddenCameras = new Set(currentPresentation().hiddenCameras)
	for (const camera of self.apiCameras.filter((camera) => !hiddenCameras.has(camera.uuid)))
		for (const control of camera.controls) {
			if (
				!['float', 'integer'].includes(control.type) ||
				control.min === undefined ||
				control.max === undefined ||
				control.max <= control.min ||
				control.behavior === 'movement'
			)
				continue
			const id = `gauge_${camera.uuid}_${control.id}`
			// A control the camera turns away only for now (knee on Auto) keeps its encoder actions.
			const writable = control.writable || control.unavailable !== undefined
			addToSection(sections, 'Control gauges', camera.name, id)
			const group = control.group ?? 'system'
			const accent = channelAccent(control.id, group)
			definitions[id] = valueTile({
				name: `${camera.name} · ${control.name ?? control.id} · Gauge / rotary`,
				label: control.name ?? control.id,
				accent,
				source: controlSource(camera.uuid, control.id, control.min, control.max, control.unit, !!control.steps?.length),
				steps: [
					{
						down: [],
						up: [],
						rotate_left: writable
							? [
									{
										actionId: 'float_decrease',
										options: { camera: camera.uuid, property: control.id, step_size: 'normal', user: defaultUser },
									},
								]
							: [],
						rotate_right: writable
							? [
									{
										actionId: 'float_increase',
										options: { camera: camera.uuid, property: control.id, step_size: 'normal', user: defaultUser },
									},
								]
							: [],
					},
				],
			})
		}
	for (const source of self.videoSources) {
		const id = `video_${source.id}`
		addToSection(sections, 'Live video · 16:9', 'Sources', id)
		definitions[id] = liveTile({
			name: `Live · ${source.name ?? source.id}`,
			sourceName: source.name ?? source.id,
			accent: tone('monitor'),
			steps: [{ down: [], up: [] }],
			localVariables: [
				{
					variableType: 'feedback',
					variableName: 'image',
					feedbackId: 'live_image',
					options: { source: source.id, width: 160, height: 90, fps: 10, quality: 65 },
				},
			],
		})
	}
}
