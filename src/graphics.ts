import {
	ButtonGraphicsDecorationType,
	ButtonGraphicsShowStatusIcons,
	type CompanionFeedbackDefinitions,
	type CompanionPresetDefinitions,
	type CompanionPresetSection,
} from '@companion-module/base'
import type { ModuleInstance, ModuleTypes } from './main.js'

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
			definitions[id] = {
				type: 'layered',
				name: `${camera.name} · ${control.name ?? control.id}`,
				feedbacks: [],
				localVariables: [
					{
						variableType: 'feedback',
						variableName: 'level',
						feedbackId: 'control_value',
						options: { camera: camera.uuid, property: control.id },
					},
				],
				elements: [
					{
						type: 'text',
						text: `${camera.name}\n${control.name ?? control.id}`,
						x: 0,
						y: 0,
						width: 100,
						height: 45,
						fontsize: 32,
						fontsizeAllowShrink: true,
						color: 0xffffff,
					},
					{
						type: 'gauge',
						x: 5,
						y: 52,
						width: 90,
						height: 20,
						min: control.min,
						max: control.max,
						origin: control.min,
						value: { isExpression: true, value: '$(local:level) ?? 0' },
						enabled: { isExpression: true, value: '$(local:level) !== null' },
						orientation: 'horizontal',
						trackStyle: 'dimmed',
						stops: [{ value: control.min, color: 0x30bfff, gradient: false }],
					},
					{
						type: 'text',
						x: 0,
						y: 76,
						width: 100,
						height: 24,
						text: {
							isExpression: true,
							value: '$(local:level) === null ? "Offline" : "" + $(local:level)',
						},
						fontsize: 60,
						fontsizeAllowShrink: true,
						color: 0xffffff,
					},
				],
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
			}
		}
	for (const source of self.videoSources) {
		const id = `video_${source.id}`
		video.push(id)
		definitions[id] = {
			type: 'layered',
			name: `Live · ${source.name ?? source.id}`,
			feedbacks: [],
			steps: [{ down: [], up: [] }],
			canvas: { decoration: ButtonGraphicsDecorationType.None, showStatusIcons: ButtonGraphicsShowStatusIcons.None },
			localVariables: [
				{
					variableType: 'feedback',
					variableName: 'image',
					feedbackId: 'live_image',
					options: { source: source.id, width: 160, height: 90, fps: 10, quality: 65 },
				},
			],
			elements: [
				{
					type: 'text',
					text: 'Waiting for video',
					x: 0,
					y: 21.875,
					width: 100,
					height: 56.25,
					color: 0x999999,
					fontsize: 32,
					fontsizeAllowShrink: true,
				},
				{
					type: 'image',
					base64Image: { isExpression: true, value: '$(local:image)' },
					x: 0,
					y: 21.875,
					width: 100,
					height: 56.25,
					fillMode: 'fit',
				},
				{
					type: 'text',
					text: source.name ?? source.id,
					x: 0,
					y: 80,
					width: 100,
					height: 20,
					color: 0xffffff,
					fontsize: 60,
					fontsizeAllowShrink: true,
				},
			],
		}
	}
	if (gauges.length) sections.push({ id: 'control-gauges', name: 'Control gauges', definitions: gauges })
	if (video.length) sections.push({ id: 'live-video', name: 'Live video · 16:9', definitions: video })
}
