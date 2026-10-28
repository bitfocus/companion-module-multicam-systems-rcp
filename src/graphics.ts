import type { CompanionFeedbackDefinitions } from './companion.js'
import type { ModuleInstance } from './instance.js'
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
