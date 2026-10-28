import type { CompanionStaticUpgradeScript, CompanionUpgradeContext, CompanionStaticUpgradeProps } from './companion.js'
import type { ModuleConfig, ModuleSecrets } from './config.js'

/**
 * Upgrade scripts for migrating from older versions of the module
 */
export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig, ModuleSecrets>[] = [
	// v0.x to v1.0.0 - Major rewrite for Companion v4
	// Old configs will be reset as the module structure has completely changed
	function v0_to_v1(
		_context: CompanionUpgradeContext<ModuleConfig>,
		props: CompanionStaticUpgradeProps<ModuleConfig, ModuleSecrets>,
	): ReturnType<CompanionStaticUpgradeScript<ModuleConfig, ModuleSecrets>> {
		const result = {
			updatedConfig: null as ModuleConfig | null,
			updatedActions: [],
			updatedFeedbacks: [],
		}

		// If old config exists, migrate what we can
		if (props.config) {
			const oldConfig = props.config as unknown as Record<string, unknown>

			// Migrate host and port if they exist
			const newConfig: ModuleConfig = {
				host: (oldConfig.host as string) || '127.0.0.1',
				port: Number(oldConfig.port) || 3000,
				reconnect: oldConfig.reconnect !== false,
				debug_messages: oldConfig.debug_messages === true,
			}

			result.updatedConfig = newConfig
		}

		return result
	},
	function v1_to_v2(
		_context: CompanionUpgradeContext<ModuleConfig>,
		props: CompanionStaticUpgradeProps<ModuleConfig, ModuleSecrets>,
	): ReturnType<CompanionStaticUpgradeScript<ModuleConfig, ModuleSecrets>> {
		// Keep saved host/port/action IDs. Authentication is newly required.
		return {
			updatedConfig: props.config ? { ...props.config, tls: props.config.tls ?? false } : null,
			updatedActions: [],
			updatedFeedbacks: [],
		}
	},
]
