import type {
	CompanionFeedbackDefinitions,
	CompanionPresetDefinitions,
	CompanionPresetSection,
} from '@companion-module/base'
import type { ModuleInstance, ModuleTypes } from './main.js'
import { ACCENT, channelAccent, controlSource, liveTile, valueTile } from './design.js'

/** Value feedbacks: read as local variables by the layered tiles. */
export function graphicsFeedbacks(self: ModuleInstance): CompanionFeedbackDefinitions {
	return {
		control_value: {
			type: 'value',
			name: 'Control numeric value',
			description: 'Cached/project value. Hardware readback is separately exposed by the API.',
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
				const raw = control?.value
				const value =
					typeof raw === 'number' ? raw : raw && typeof raw === 'object' && 'value' in raw ? raw.value : null
				return typeof value === 'number' && Number.isFinite(value) ? value : null
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
	sections: CompanionPresetSection<ModuleTypes>[],
): void {
	const gauges: string[] = []
	const video: string[] = []
	for (const camera of self.apiCameras)
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
			gauges.push(id)
			const group = (control as { group?: string }).group ?? 'system'
			const accent = channelAccent(control.id, ACCENT[group] ?? ACCENT.system)
			definitions[id] = valueTile({
				name: `${camera.name} · ${control.name ?? control.id}`,
				label: control.name ?? control.id,
				accent,
				source: controlSource(
					camera.uuid,
					control.id,
					control.min,
					control.max,
					(control as { unit?: string | null }).unit,
				),
				steps: [
					{
						down: [],
						up: [],
						rotate_left: control.writable
							? [
									{
										actionId: 'float_decrease',
										options: { camera: camera.uuid, property: control.id, step_size: 'normal', user: '' },
									},
								]
							: [],
						rotate_right: control.writable
							? [
									{
										actionId: 'float_increase',
										options: { camera: camera.uuid, property: control.id, step_size: 'normal', user: '' },
									},
								]
							: [],
					},
				],
			})
		}
	for (const source of self.videoSources) {
		const id = `video_${source.id}`
		video.push(id)
		definitions[id] = liveTile({
			name: `Live · ${source.name ?? source.id}`,
			sourceName: source.name ?? source.id,
			accent: ACCENT.monitor,
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
	if (gauges.length) sections.push({ id: 'control-gauges', name: 'Control gauges', definitions: gauges })
	if (video.length) sections.push({ id: 'live-video', name: 'Live video · 16:9', definitions: video })
}
