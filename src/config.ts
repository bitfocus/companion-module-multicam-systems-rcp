import type { SomeCompanionConfigField } from './companion.js'

export type ModuleSecrets = { token?: string; cloudClientSecret?: string }

export type ModuleConfig = {
	connection?: string
	cloudUrl?: string
	cloudClientId?: string
	cloudProjectId?: string
	cloudInstanceId?: string
	tls?: boolean
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
				'Optional for a local RCP on this machine unless token enforcement is switched on there. Otherwise create a project-scoped token with monitor, control, routing and images access.',
		},
		{ type: 'checkbox', id: 'tls', label: 'Use HTTPS / WSS', width: 6, default: false },
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Information',
			value:
				'<strong>Multicam RCP</strong> - Remote Control Panel for broadcast camera control. Configure the connection to your Multicam RCP server below.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			tooltip: 'The IP address of the Multicam RCP server',
			width: 6,
			default: '127.0.0.1',
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			tooltip: 'The port of the Multicam RCP server (default: 5994)',
			width: 6,
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
