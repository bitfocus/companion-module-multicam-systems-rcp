import type { SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	host: string
	port: number
	reconnect: boolean
	debug_messages: boolean
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
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
			tooltip: 'The port of the Multicam RCP server (default: 3000)',
			width: 6,
			min: 1,
			max: 65535,
			default: 3000,
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
