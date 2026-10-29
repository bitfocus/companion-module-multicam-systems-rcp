import type { SomeCompanionConfigField } from './companion.js'

export type ModuleSecrets = { token?: string; cloudClientSecret?: string }

export type ModuleConfig = {
	connection?: string
	cloudUrl?: string
	cloudClientId?: string
	cloudProjectId?: string
	cloudInstanceId?: string
	tls?: boolean
	/** A discovered RCP as `ip:port`, or null/undefined for Manual (host and port). */
	bonjourHost?: string | null
	host: string
	port: number
	reconnect: boolean
	debug_messages: boolean
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'dropdown',
			id: 'connection',
			label: 'Connection',
			width: 12,
			default: 'local',
			choices: [
				{ id: 'local', label: 'Local RCP' },
				{ id: 'cloud', label: 'Multicam Cloud (preview)' },
			],
		},
		{
			type: 'textinput',
			id: 'cloudUrl',
			label: 'Cloud API URL',
			width: 12,
			default: 'https://api.cloud.multicam.systems',
		},
		{ type: 'textinput', id: 'cloudClientId', label: 'Cloud integration client ID', width: 12 },
		{ type: 'secret-text', id: 'cloudClientSecret', label: 'Cloud integration client secret', width: 12 },
		{ type: 'textinput', id: 'cloudProjectId', label: 'Cloud project ID', width: 6 },
		{ type: 'textinput', id: 'cloudInstanceId', label: 'Target instance ID', width: 6 },

		{
			type: 'secret-text',
			id: 'token',
			label: 'Integration API token',
			width: 12,
			tooltip:
				'Leave empty when RCP runs on this computer. Otherwise create one in RCP under Production Toolbox → Companion → Access, on the computer that runs RCP.',
		},
		{
			type: 'checkbox',
			id: 'tls',
			label: 'Use HTTPS / WSS',
			width: 6,
			isVisibleExpression: `!$(options:bonjourHost)`,
			default: false,
		},
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Information',
			value:
				'<strong>Multicam RCP</strong> - Remote Control Panel for broadcast camera control. Configure the connection to your Multicam RCP server below.',
		},
		{
			type: 'bonjour-device',
			id: 'bonjourHost',
			label: 'Multicam RCP on this network',
			tooltip:
				'RCP servers announcing themselves on the local network. Choose Manual to type the address, or to use HTTPS.',
			width: 12,
			isVisibleExpression: `$(options:connection) != 'cloud'`,
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			tooltip: 'The IP address of the Multicam RCP server',
			width: 6,
			isVisibleExpression: `!$(options:bonjourHost)`,
			default: '127.0.0.1',
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			tooltip: 'The port of the Multicam RCP server (default: 5994)',
			width: 6,
			isVisibleExpression: `!$(options:bonjourHost)`,
			min: 1,
			max: 65535,
			default: 5994,
		},
		{
			type: 'checkbox',
			id: 'reconnect',
			label: 'Auto Reconnect',
			tooltip: 'Automatically reconnect on connection loss (after 5 seconds)',
			width: 6,
			default: true,
		},
		{
			type: 'checkbox',
			id: 'debug_messages',
			label: 'Debug Messages',
			tooltip: 'Log incoming and outgoing WebSocket messages',
			width: 6,
			default: false,
		},
	]
}

/**
 * The local RCP's base URL. A discovered RCP announces its HTTP port (`_multicam-rcp._tcp`),
 * so it is reached over HTTP there; Manual uses the typed host, port and HTTPS choice.
 */
export function localUrl(config: Pick<ModuleConfig, 'bonjourHost' | 'host' | 'port' | 'tls'>): string {
	const discovered = config.bonjourHost?.trim()
	if (discovered) {
		const colon = discovered.lastIndexOf(':')
		const host = discovered.slice(0, colon)
		const port = Number(discovered.slice(colon + 1))
		if (colon > 0 && Number.isInteger(port) && port > 0 && port < 65536) return `http://${host}:${port}`
		throw Error(`Discovered address ${discovered} is not host:port`)
	}
	if (!config.host || !config.port) throw Error('Host and port are required')
	return `${config.tls ? 'https' : 'http'}://${config.host}:${config.port}`
}
