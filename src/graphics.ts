import type {
	CompanionFeedbackDefinitions,
	CompanionPresetDefinitions,
	CompanionPresetSection,
} from '@companion-module/base'

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
import type { ModuleInstance, ModuleTypes } from './main.js'
import { channelAccent, controlSource, currentPresentation, liveTile, tone, valueTile } from './design.js'
import { controlText, knownValue, numberOf } from './api.js'

/** Value feedbacks: read as local variables by the layered tiles. */
export function graphicsFeedbacks(self: ModuleInstance): CompanionFeedbackDefinitions {
	return {
		control_value: {
			type: 'value',
			name: 'Control numeric value',
			description: 'The current value; empty until a control the camera reports has reported.',
			options: [
				{
					type: 'dropdown',
					id: 'camera',
					label: 'Camera',
					choices: self.cameraChoices,
					default: self.cameraChoices[0]?.id ?? '',
				},
				{
					type: 'dropdown',
					id: 'property',
					label: 'Control',
					choices: self.floatPropertyChoices,
					default: self.floatPropertyChoices[0]?.id ?? '',
				},
			],
			callback: (feedback) => {
				if (!self.connected) return null
				const control = self.control(feedback.options.camera as string, feedback.options.property as string)
				return control ? numberOf(knownValue(control)) : null
			},
		},
		control_text: {
			type: 'value',
			name: 'Control value as text',
			description:
				"The value as the camera names it: a named step's label (6 dB, 1/50), otherwise the number with its unit. Empty while unknown.",
			options: [
				{
					type: 'dropdown',
					id: 'camera',
					label: 'Camera',
					choices: self.cameraChoices,
					default: self.cameraChoices[0]?.id ?? '',
				},
				{
					type: 'dropdown',
					id: 'property',
					label: 'Control',
					choices: self.floatPropertyChoices,
					default: self.floatPropertyChoices[0]?.id ?? '',
				},
			],
			callback: (feedback) => {
				if (!self.connected) return null
				const control = self.control(feedback.options.camera as string, feedback.options.property as string)
				return control ? controlText(control) : null
			},
		},
		camera_tally_state: {
			type: 'value',
			name: 'Camera tally state',
			description: 'The tally colour of a camera as text: red, green, yellow, blue, purple or off.',
			options: [
				{
					type: 'dropdown',
					id: 'camera',
					label: 'Camera',
					choices: self.cameraChoices,
					default: self.cameraChoices[0]?.id ?? '',
				},
			],
			callback: (feedback) => (self.connected ? self.getCameraTallyColor(feedback.options.camera as string) : 'off'),
		},
		route_tally_state: {
			type: 'value',
			name: 'Router output tally state',
			description: 'The tally colour of a router output as text: red, green, yellow, blue, purple or off.',
			options: [
				{
					type: 'dropdown',
					id: 'module',
					label: 'Module/Router',
					choices: self.moduleChoices,
					default: self.moduleChoices[0]?.id ?? '',
				},
				{ type: 'number', id: 'output', label: 'Output', default: 0, min: 0, max: 999 },
			],
			callback: (feedback) => {
				if (!self.connected) return 'off'
				const bus = self.tally.find((t) => t.uuid === feedback.options.module)
				return bus?.outputs?.[Number(feedback.options.output)]?.tallyColor ?? 'off'
			},
		},
		live_image: {
			type: 'value',
			name: 'Live video image',
			description: 'Shared low-resolution JPEG feed. Demand ends when the final feedback is disabled or removed.',
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
			callback: (feedback) =>
				self.images.value(feedback.id, {
					sourceId: feedback.options.source as string,
					width: Number(feedback.options.width),
					height: Number(feedback.options.height),
					maxFps: Number(feedback.options.fps),
					jpegQuality: Number(feedback.options.quality),
				}),
			unsubscribe: (feedback) => self.images.remove(feedback.id),
		},
	}
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
