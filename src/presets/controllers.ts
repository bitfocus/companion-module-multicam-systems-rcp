import type { Host } from '../controllers.js'
import { pillTile, tone, type Layered } from './design.js'

export function controllerPresets(self: Host): Record<string, Layered & { category: string }> {
	const presets: Record<string, Layered & { category: string }> = {}
	for (const switcher of self.controllerSwitchers?.switchers ?? []) {
		for (const choice of switcher.choices) {
			const key = JSON.stringify([switcher.id, choice.id])
			presets[`controller_${Buffer.from(key).toString('base64url')}`] = {
				...pillTile({
					name: `Select ${choice.name}`,
					label: choice.name,
					caption: switcher.name,
					accent: tone('controller'),
					active: { feedbackId: 'controller_selected', options: { choice: key } },
					steps: [{ down: [{ actionId: 'controller_select', options: { choice: key } }], up: [] }],
				}),
				category: `Controller choices: ${switcher.name}`,
			}
		}
	}
	return presets
}
