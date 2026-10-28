/** Stream Deck + presets: the page that follows the operator (see ../deck.ts). */
import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { ModuleTypes } from '../companion.js'
import type { ModuleInstance } from '../instance.js'
import { BANKS, SLOTS } from '../deck.js'
import { addToSection, type PresetSections } from './graphics.js'
import { liveTile, pillTile, slotTile, tone, type Layered } from './design.js'

/** Everything a deck needs for one user, in four groups. */
export function addDeckPresets(
	self: ModuleInstance,
	definitions: CompanionPresetDefinitions<ModuleTypes>,
	sections: PresetSections,
): void {
	for (const user of self.users) {
		const userIdShort = user.uuid.substring(0, 8)
		const section = `Stream Deck +: ${user.name}`
		const add = (id: string, group: string, preset: Layered) => {
			definitions[id] = preset
			addToSection(sections, section, group, id)
		}

		// Row 1: the camera choices of the switcher that feeds this user's virtual camera.
		const switcher = self.userSwitcher(user.uuid)
		if (switcher) {
			for (const choice of switcher.choices) {
				const key = JSON.stringify([switcher.id, choice.id])
				const target = choice.targets?.[Object.keys(choice.targets ?? {})[0]]
				const cameraUuid = target && target.type === 'camera' ? target.cameraId : undefined
				const sourceId = cameraUuid ? self.videoSourceForCamera(cameraUuid) : undefined
				const steps = [{ down: [{ actionId: 'controller_select', options: { choice: key } }], up: [] }]
				const active = { feedbackId: 'controller_selected', options: { choice: key } }
				const id = `deck_${userIdShort}_camera_${choice.id}`
				if (sourceId) {
					const source = self.videoSources.find((s) => s.id === sourceId)
					add(
						id,
						'Cameras',
						liveTile({
							name: `Select ${choice.name} (live)`,
							sourceName: choice.name,
							accent: tone('controller'),
							selected: active,
							steps,
							localVariables: [
								{
									variableType: 'feedback',
									variableName: 'image',
									feedbackId: 'live_image',
									options: { source: source?.id ?? sourceId, width: 160, height: 90, fps: 10, quality: 65 },
								},
							],
						}),
					)
				} else {
					add(
						id,
						'Cameras',
						pillTile({
							name: `Select ${choice.name}`,
							label: choice.name,
							caption: switcher.name,
							accent: tone('controller'),
							active,
							steps,
						}),
					)
				}
			}
		}

		// Row 2: banks.
		for (const bank of BANKS) {
			add(
				`deck_${userIdShort}_bank_${bank.id}`,
				'Banks',
				pillTile({
					name: `Bank: ${bank.name}`,
					label: bank.name,
					caption: user.name,
					accent: tone(bank.group),
					active: { feedbackId: 'deck_bank_active', options: { user: user.uuid, bank: bank.id } },
					steps: [{ down: [{ actionId: 'deck_bank_select', options: { user: user.uuid, bank: bank.id } }], up: [] }],
				}),
			)
		}

		// LCD strip and encoders: one slot each.
		for (const slot of SLOTS) {
			const options = { user: user.uuid, slot }
			const locals = [
				{ variableType: 'feedback' as const, variableName: 'level', feedbackId: 'deck_slot_value', options },
				{ variableType: 'feedback' as const, variableName: 'min', feedbackId: 'deck_slot_min', options },
				{ variableType: 'feedback' as const, variableName: 'max', feedbackId: 'deck_slot_max', options },
				{ variableType: 'feedback' as const, variableName: 'name', feedbackId: 'deck_slot_name', options },
				{ variableType: 'feedback' as const, variableName: 'text', feedbackId: 'deck_slot_text', options },
				{ variableType: 'feedback' as const, variableName: 'accent', feedbackId: 'deck_slot_accent', options },
				{
					variableType: 'feedback' as const,
					variableName: 'step',
					feedbackId: 'deck_step_label',
					options: { user: user.uuid },
				},
			]
			add(
				`deck_${userIdShort}_display_${slot}`,
				'Displays',
				slotTile({
					name: `Display ${slot}`,
					accent: tone('lens'),
					localVariables: locals,
					steps: [{ down: [{ actionId: 'deck_step_cycle', options: { user: user.uuid } }], up: [] }],
				}),
			)
			add(
				`deck_${userIdShort}_encoder_${slot}`,
				'Encoders',
				slotTile({
					name: `Encoder ${slot}`,
					accent: tone('lens'),
					localVariables: locals,
					steps: [
						{
							down: [{ actionId: 'deck_step_cycle', options: { user: user.uuid } }],
							up: [],
							rotate_left: [{ actionId: 'deck_slot_decrease', options }],
							rotate_right: [{ actionId: 'deck_slot_increase', options }],
						},
					],
				}),
			)
		}
	}
}
