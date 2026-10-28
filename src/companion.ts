/**
 * The Companion module API this line builds on: module API 1.13, Companion 4.1 and later
 * (Companion 5 runs it too, but takes the 2.x line from main when it can).
 *
 * Every file directly in src/ is shared with the Companion 5 line (main), so those files
 * take Companion's types and helpers from here, never from @companion-module/base. This file
 * maps the names they use onto module API 1.13. Only this file, main.ts and src/presets/
 * differ between the lines; tools/sync-core.sh copies the rest across.
 */
import { InstanceBase, type CompanionActionDefinitions, type CompanionVariableDefinition } from '@companion-module/base'
import type { ModuleConfig, ModuleSecrets } from './config.js'

/** The action table UpdateActions builds. */
export type ActionDefinitions = CompanionActionDefinitions

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

// Fields the shared code sets for module API 2 that 1.13 does not know; Companion 4 ignores
// them. `disableAutoExpression` only matters where options can be expressions, and
// `affectedProperties` only narrows the style overrides Companion 5 offers.
declare module '@companion-module/base/dist/module-api/input.js' {
	interface CompanionInputFieldBase {
		disableAutoExpression?: boolean
	}
}
declare module '@companion-module/base/dist/module-api/feedback.js' {
	interface CompanionAdvancedFeedbackDefinition {
		affectedProperties?: unknown
	}
}

export abstract class ModuleBase extends InstanceBase<ModuleConfig, ModuleSecrets> {
	/** Variable definitions as a list (module API 1 takes the list as it is). */
	defineVariables(variables: (CompanionVariableDefinition & { variableId: string })[]): void {
		this.setVariableDefinitions(variables)
	}
	/** Module API 2 splits this out; on 1.x checkFeedbacks() without ids checks them all. */
	checkAllFeedbacks(): void {
		this.checkFeedbacks()
	}
}
