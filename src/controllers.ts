import { combineRgb, type CompanionActionDefinitions, type CompanionFeedbackDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import type { ControllerState } from './api.js'
import { ACCENT, pillTile, type Layered } from './design.js'

type Host = Pick<ModuleInstance, 'connected' | 'controllerSwitchers' | 'command' | 'log'>

export function controllerSelection(
	state: ControllerState | undefined,
	encoded: unknown,
): Record<string, unknown> | null {
	if (!state || !Number.isSafeInteger(state.generation) || typeof encoded !== 'string') return null
	let ids: unknown
	try {
		ids = JSON.parse(encoded)
	} catch {
		return null
	}
	if (!Array.isArray(ids) || ids.length !== 2 || !ids.every((id) => typeof id === 'string')) return null
	const switcher = state.switchers.find((s) => s.id === ids[0])
	if (!switcher?.choices.some((choice) => choice.id === ids[1])) return null
	return { type: 'controllerSelect', switcherId: ids[0], choiceId: ids[1], expectedGeneration: state.generation }
}

function options(self: Host) {
	const choices =
		self.controllerSwitchers?.switchers.flatMap((switcher) =>
			switcher.choices.map((choice) => ({
				id: JSON.stringify([switcher.id, choice.id]),
				label: `${switcher.name}: ${choice.name}`,
			})),
		) ?? []
	return [
		{
			id: 'choice',
			type: 'dropdown' as const,
			label: 'Controller switcher / choice',
			choices: choices.length ? choices : [{ id: '', label: 'No configured controller choices' }],
			default: choices[0]?.id ?? '',
		},
	]
}

export function controllerActions(self: Host): CompanionActionDefinitions {
	return {
		controller_select: {
			name: 'Controller: Select Choice',
			description: 'Select a configured camera, vision, audio or Companion assignment. Changes controls only.',
			options: options(self),
			callback: async (action) => {
				const operation = controllerSelection(self.controllerSwitchers, action.options.choice)
				if (!self.connected || !operation) {
					self.log('warn', 'Controller choice unavailable; refresh the connection and configuration')
					return
				}
				self.command(operation)
			},
		},
	}
}

export function controllerFeedbacks(self: Host): CompanionFeedbackDefinitions {
	return {
		controller_selected: {
			type: 'boolean',
			name: 'Controller: Choice Is Effective',
			description: 'Includes choices imposed by a parent studio switcher.',
			defaultStyle: { bgcolor: combineRgb(0, 100, 180), color: combineRgb(255, 255, 255) },
			options: options(self),
			callback: (feedback) => {
				const operation = controllerSelection(self.controllerSwitchers, feedback.options.choice)
				return !!(
					self.connected &&
					operation &&
					self.controllerSwitchers?.assignments.some(
						(assignment) =>
							assignment.switcherId === operation.switcherId && assignment.effectiveChoiceId === operation.choiceId,
					)
				)
			},
		},
	}
}

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
					accent: ACCENT.controller,
					active: { feedbackId: 'controller_selected', options: { choice: key } },
					steps: [{ down: [{ actionId: 'controller_select', options: { choice: key } }], up: [] }],
				}),
				category: `Controller choices: ${switcher.name}`,
			}
		}
	}
	return presets
}
