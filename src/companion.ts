/**
 * The Companion module API this line builds on: module API 2.1, Companion 5.1 and later.
 *
 * Every file directly in src/ is shared with the Companion 4 line (branch companion-4), so
 * those files take Companion's types and helpers from here, never from
 * @companion-module/base. That line's companion.ts maps the same names onto module API 1.13.
 * Only this file, main.ts and src/presets/ differ between the lines.
 */
import { InstanceBase, type CompanionVariableDefinition, type InstanceTypes } from '@companion-module/base'
import type { ModuleConfig, ModuleSecrets } from './config.js'

export { InstanceStatus, combineRgb } from '@companion-module/base'
export type {
	CompanionActionDefinitions,
	CompanionFeedbackDefinitions,
	CompanionStaticUpgradeProps,
	CompanionStaticUpgradeScript,
	CompanionUpgradeContext,
	CompanionVariableDefinition,
	CompanionVariableValues,
	DropdownChoice,
	SomeCompanionConfigField,
} from '@companion-module/base'

export type ModuleTypes = InstanceTypes & { config: ModuleConfig; secrets: ModuleSecrets }

export abstract class ModuleBase extends InstanceBase<ModuleTypes> {
	/** Variable definitions as a list (module API 2 takes an object keyed by id). */
	defineVariables(variables: (CompanionVariableDefinition & { variableId: string })[]): void {
		this.setVariableDefinitions(
			Object.fromEntries(variables.map(({ variableId, ...definition }) => [variableId, definition])),
		)
	}
}
