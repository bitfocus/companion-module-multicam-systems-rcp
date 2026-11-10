// Presets of this line (Companion 4 classic buttons); test-api.mjs covers the shared core.
import test from 'node:test'
import assert from 'node:assert/strict'

const control = (id, extra) => ({
	id,
	writable: true,
	behavior: 'property',
	resolvedCameraId: 'cam-a',
	desired: null,
	actual: null,
	unit: null,
	value: 0.5,
	...extra,
})

function host() {
	const camera = {
		uuid: 'cam-a',
		id: 1,
		name: 'Cam A',
		virtualCameraEnable: false,
		controls: [
			control('gain', { type: 'float', group: 'exposure', min: 0, max: 1, steps: [{ value: 0.5, label: '6 dB' }] }),
			control('iris_absolute', { type: 'float', group: 'lens', min: 0, max: 1 }),
			control('color_bars', { type: 'boolean', group: 'system', value: false }),
		],
	}
	const self = {
		presets: null,
		presentation: undefined,
		users: [],
		tally: [],
		modules: [],
		videoSources: [{ id: 'src-1', name: 'Program' }],
		apiCameras: [camera],
		cameras: [{ ...camera, assignedModuleControlProperties: camera.controls.map((c) => c.id) }],
		controllerSwitchers: {
			generation: 3,
			switchers: [{ id: 'op', name: 'Operator', choices: [{ id: 'a', name: 'Studio A' }] }],
			assignments: [],
		},
		control: (cameraId, id) => (cameraId === 'cam-a' ? camera.controls.find((c) => c.id === id) : undefined),
		setPresetDefinitions(presets) {
			this.presets = presets
		},
		images: { value: () => 'data:image/jpeg;base64,QUJD', remove: () => {} },
	}
	return self
}

test('classic presets: values from variables, named steps as text, encoders, controller choices, live video', async () => {
	const { UpdatePresets } = await import('./dist/presets/index.js')
	const self = host()
	UpdatePresets(self)
	const presets = self.presets
	const gain = presets['cam_cam-a_gain_val']
	assert.equal(gain.type, 'button')
	assert.equal(gain.style.text, 'Gain\\n$(multicam-rcp:camera_1_gain_text)')
	assert.equal(gain.options.rotaryActions, true)
	assert.equal(gain.steps[0].rotate_right[0].actionId, 'float_increase')
	assert.equal(gain.feedbacks.at(-1).feedbackId, 'control_unavailable')
	assert.equal(
		presets['cam_cam-a_iris_absolute_val'].style.text,
		'Iris Absolute\\n$(multicam-rcp:camera_1_iris_absolute)',
	)
	assert.equal(presets['cam_cam-a_color_bars_toggle'].steps[0].down[0].actionId, 'bool_toggle')
	const choice = Object.entries(presets).find(([id]) => id.startsWith('controller_'))[1]
	assert.deepEqual(choice.steps[0].down[0].options, { choice: JSON.stringify(['op', 'a']) })
	assert.equal(presets['video_src-1'].feedbacks[0].feedbackId, 'live_image_button')
	// Every preset is a classic button or a text header: nothing Companion 4 cannot draw.
	for (const preset of Object.values(presets)) assert.ok(['button', 'text'].includes(preset.type))
})

test('the live image feedback hands Companion 4 the JPEG without its data URI prefix', async () => {
	const { lineFeedbacks } = await import('./dist/presets/index.js')
	const feedback = lineFeedbacks(host()).live_image_button
	const result = feedback.callback({
		id: 'fb',
		options: { source: 'src-1', width: 160, height: 90, fps: 10, quality: 65 },
	})
	assert.equal(result.png64, 'QUJD')
})

test('Companion 4 gets no module API 2 fields', async () => {
	const { withoutApi2Fields } = await import('./dist/companion.js')
	const { feedback, action } = withoutApi2Fields({
		feedback: {
			type: 'advanced',
			affectedProperties: ['text'],
			options: [{ id: 'mode', disableAutoExpression: true }],
		},
		action: { name: 'x', options: [{ id: 'user', isVisibleExpression: '$(options:mode)' }] },
	})
	assert.equal('affectedProperties' in feedback, false)
	assert.deepEqual(feedback.options, [{ id: 'mode' }])
	assert.deepEqual(action.options, [{ id: 'user', isVisibleExpression: '$(options:mode)' }])
})
