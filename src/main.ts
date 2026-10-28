// Companion 4 (module API 1.x) starts the module through runEntrypoint.
import { runEntrypoint } from '@companion-module/base'
import { ModuleInstance } from './instance.js'
import { UpgradeScripts } from './upgrades.js'

runEntrypoint(ModuleInstance, UpgradeScripts)
