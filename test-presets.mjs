// Presets of this line (Companion 5 layered buttons); test-api.mjs covers the shared core.
import test from 'node:test'
import assert from 'node:assert/strict'

test('controller presets offer every discovered choice and select it', async () => {
	const { controllerPresets } = await import('./dist/presets/controllers.js')
	const host = {
		connected: true,
		controllerSwitchers: {
			generation: 8,
			switchers: [
				{
					id: 'operator',
					name: 'Operator',
					selectedChoiceId: 'a',
					choices: [
						{ id: 'a', name: 'Studio A' },
						{ id: 'b', name: 'Studio B' },
					],
				},
			],
			assignments: [],
		},
		command: () => {},
		log: () => {},
	}
	const presets = controllerPresets(host)
	assert.equal(Object.keys(presets).length, 2)
	const preset = Object.values(presets).find((p) => p.name === 'Select Studio B')
	assert.equal(preset.steps[0].down[0].actionId, 'controller_select')
	assert.deepEqual(preset.steps[0].down[0].options, { choice: JSON.stringify(['operator', 'b']) })
})
