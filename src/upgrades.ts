import type {
	CompanionStaticUpgradeScript,
	CompanionUpgradeContext,
	CompanionStaticUpgradeProps,
} from '@companion-module/base'
import type { ModuleConfig } from './config.js'

/**
 * Upgrade scripts for migrating from older versions of the module
 */
export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = [
	// v0.x to v1.0.0 - Major rewrite for Companion v4
	// Old configs will be reset as the module structure has completely changed
	function v0_to_v1(
		_context: CompanionUpgradeContext<ModuleConfig>,
		props: CompanionStaticUpgradeProps<ModuleConfig>,
	): ReturnType<CompanionStaticUpgradeScript<ModuleConfig>> {
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
]
