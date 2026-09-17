/**
 * Stream Deck + surface: one page that follows the operator.
 *
 * The top row selects the camera (the user's controller switcher choices), the second row
 * picks a control bank (gain, gamma, lift, exposure), the LCD strip shows one gauge per
 * bank slot and the encoder under each gauge adjusts it. Pushing an encoder cycles the
 * user's step size, which the gauge above shows. Bank and step size live in this module,
 * per RCP user; the camera selection and the values come from the RCP.
 */
import type {
	CompanionActionDefinitions,
	CompanionFeedbackDefinitions,
	CompanionPresetDefinitions,
} from '@companion-module/base'
import type { ModuleInstance, ModuleTypes } from './main.js'
import type { Control } from './api.js'
import { addToSection, type PresetSections } from './graphics.js'
import { channelAccent, liveTile, pillTile, slotTile, tone, type Layered } from './design.js'

export type BankId = 'gain' | 'gamma' | 'lift' | 'exposure'
export const BANKS: { id: BankId; name: string; group: string; slots: string[][] }[] = [
	{
		id: 'gain',
		name: 'Gain',
		group: 'color',
		slots: [
			['red_gain', 'r_gain'],
			['green_gain', 'g_gain'],
			['blue_gain', 'b_gain'],
			['luma_gain', 'master_gain', 'gain', 'contrast'],
		],
	},
	{
		id: 'gamma',
		name: 'Gamma',
		group: 'color',
		slots: [
			['red_gamma', 'r_gamma'],
			['green_gamma', 'g_gamma'],
			['blue_gamma', 'b_gamma'],
			['luma_gamma', 'master_gamma', 'gamma'],
		],
	},
	{
		id: 'lift',
		name: 'Lift',
		group: 'color',
		slots: [
			['red_lift', 'r_lift', 'red_pedestal'],
			['green_lift', 'g_lift', 'green_pedestal'],
			['blue_lift', 'b_lift', 'blue_pedestal'],
			['luma_lift', 'master_black', 'master_black_pedestal', 'pedestal', 'master_pedestal', 'brightness'],
		],
	},
	{
		id: 'exposure',
		name: 'Exposure',
		group: 'lens',
		slots: [
			['iris_absolute', 'iris', 'aperture'],
			['shutter_speed', 'shutter', 'shutter_absolute', 'exposure_time'],
			['iso', 'sensitivity', 'master_gain', 'gain'],
			['exposure', 'exposure_compensation', 'ev', 'saturation', 'hue'],
		],
	},
]
const SLOTS = [1, 2, 3, 4] as const
const STEP_ORDER: ('small' | 'normal' | 'big')[] = ['small', 'normal', 'big']
export const STEP_LABEL = { small: 'FINE', normal: 'NORMAL', big: 'COARSE' } as const

const userId = (value: unknown): string => (typeof value === 'string' ? value : '')

function isNumeric(control: Control): boolean {
	return (control.type === 'float' || control.type === 'integer') && typeof control.min === 'number'
}

/** The control a bank slot maps to on a camera: first candidate the camera has, else nothing. */
export function resolveSlot(controls: Control[], bank: BankId, slot: number): Control | undefined {
	const candidates = BANKS.find((b) => b.id === bank)?.slots[slot - 1] ?? []
	for (const id of candidates) {
		const control = controls.find((c) => c.id === id && isNumeric(c))
		if (control) return control
	}
	return undefined
}

function slotContext(self: ModuleInstance, options: Record<string, unknown>) {
	const userUuid = userId(options.user)
	const slot = Number(options.slot ?? 1)
	const cameraUuid = self.userSelectedCameraUuid(userUuid)
	const camera = cameraUuid ? self.apiCameras.find((c) => c.uuid === cameraUuid) : undefined
	const control = camera ? resolveSlot(camera.controls, self.getUserBank(userUuid), slot) : undefined
	return { userUuid, slot, cameraUuid, camera, control }
}

function numericValue(control: Control | undefined): number | null {
	const raw = control?.value
	const value = typeof raw === 'number' ? raw : raw && typeof raw === 'object' && 'value' in raw ? raw.value : null
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function userOptions(self: ModuleInstance) {
	const choices = self.userChoices.length ? self.userChoices : [{ id: '', label: 'No users available' }]
	return { id: 'user', type: 'dropdown' as const, label: 'User', choices, default: choices[0]?.id ?? '' }
}
const slotOption = {
	id: 'slot',
	type: 'dropdown' as const,
	label: 'Encoder / display slot',
	choices: SLOTS.map((n) => ({ id: n, label: `Slot ${n}` })),
	default: 1,
}
const bankOption = {
	id: 'bank',
	type: 'dropdown' as const,
	label: 'Bank',
	choices: BANKS.map((b) => ({ id: b.id, label: b.name })),
	default: 'gain',
}

export function deckActions(self: ModuleInstance): CompanionActionDefinitions {
	return {
		deck_bank_select: {
			name: 'Deck: Select control bank',
			description: 'Choose which four controls the deck displays and encoders follow for a user.',
			options: [userOptions(self), bankOption],
			callback: async (action) => self.setUserBank(userId(action.options.user), action.options.bank as BankId),
		},
		deck_slot_increase: {
			name: 'Deck: Increase slot control',
			description: 'Raise the control in a bank slot of the user’s selected camera by the user’s step size.',
			options: [userOptions(self), slotOption],
			callback: async (action) => adjustSlot(self, action.options, +1),
		},
		deck_slot_decrease: {
			name: 'Deck: Decrease slot control',
			description: 'Lower the control in a bank slot of the user’s selected camera by the user’s step size.',
			options: [userOptions(self), slotOption],
			callback: async (action) => adjustSlot(self, action.options, -1),
		},
		deck_step_cycle: {
			name: 'Deck: Cycle step size',
			description: 'Fine → normal → coarse → fine. The gauges show the active step size.',
			options: [userOptions(self)],
			callback: async (action) => {
				const userUuid = userId(action.options.user)
				if (!userUuid) return
				const current = self.getUserStepSize(userUuid)
				const next = STEP_ORDER[(STEP_ORDER.indexOf(current) + 1) % STEP_ORDER.length]
				self.setUserStepSize(userUuid, next)
				self.checkFeedbacks('deck_step_label')
			},
		},
	}
}

function adjustSlot(self: ModuleInstance, options: Record<string, unknown>, direction: 1 | -1): void {
	const { userUuid, cameraUuid, control } = slotContext(self, options)
	if (!cameraUuid || !control) {
		self.log('debug', 'Deck slot has no control on the selected camera')
		return
	}
	const step = self.getUserStepSize(userUuid)
	if (direction > 0) self.increaseProperty(cameraUuid, control.id, step === 'small', step === 'big')
	else self.decreaseProperty(cameraUuid, control.id, step === 'small', step === 'big')
}

export function deckFeedbacks(self: ModuleInstance): CompanionFeedbackDefinitions {
	return {
		deck_bank_active: {
			type: 'boolean',
			name: 'Deck: Bank is active',
			description: 'True while the user’s deck shows this bank.',
			defaultStyle: {},
			options: [userOptions(self), bankOption],
			callback: (feedback) => self.getUserBank(userId(feedback.options.user)) === feedback.options.bank,
		},
		deck_slot_value: {
			type: 'value',
			name: 'Deck: Slot value',
			description: 'The numeric value of the control in a bank slot, or null when the slot is empty.',
			options: [userOptions(self), slotOption],
			callback: (feedback) => numericValue(slotContext(self, feedback.options).control),
		},
		deck_slot_min: {
			type: 'value',
			name: 'Deck: Slot minimum',
			options: [userOptions(self), slotOption],
			callback: (feedback) => slotContext(self, feedback.options).control?.min ?? 0,
		},
		deck_slot_max: {
			type: 'value',
			name: 'Deck: Slot maximum',
			options: [userOptions(self), slotOption],
			callback: (feedback) => slotContext(self, feedback.options).control?.max ?? 1,
		},
		deck_slot_name: {
			type: 'value',
			name: 'Deck: Slot control name',
			options: [userOptions(self), slotOption],
			callback: (feedback) => {
				const { control } = slotContext(self, feedback.options)
				return control ? (control.name ?? control.id) : '—'
			},
		},
		deck_slot_text: {
			type: 'value',
			name: 'Deck: Slot value as text',
			description: 'Percent for 0–1 controls, otherwise the number with its unit.',
			options: [userOptions(self), slotOption],
			callback: (feedback) => {
				const { control } = slotContext(self, feedback.options)
				const value = numericValue(control)
				if (!control || value === null) return '—'
				const min = control.min ?? 0
				const max = control.max ?? 1
				if (min === 0 && max === 1) return `${Math.round(value * 100)}%`
				const decimals = Number.isInteger(min) && Number.isInteger(max) && max - min >= 10 ? 0 : 2
				const unit = (control as { unit?: string | null }).unit
				return `${value.toFixed(decimals)}${unit ? ' ' + unit : ''}`
			},
		},
		deck_slot_accent: {
			type: 'value',
			name: 'Deck: Slot colour',
			description: 'The colour of the control in a bank slot (red gain is red), as a Companion colour number.',
			options: [userOptions(self), slotOption],
			callback: (feedback) => {
				const { control } = slotContext(self, feedback.options)
				if (!control) return tone('system')
				return channelAccent(control.id, (control as { group?: string }).group ?? 'system')
			},
		},
		deck_step_label: {
			type: 'value',
			name: 'Deck: Step size label',
			options: [userOptions(self)],
			callback: (feedback) => STEP_LABEL[self.getUserStepSize(userId(feedback.options.user))],
		},
	}
}

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
