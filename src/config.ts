import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	host: string
	port: number
	reconnect: boolean
	debug_messages: boolean
	reset_variables: boolean

}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Information',
			value:
				"<strong>abcPLEASE READ THIS!</strong> Generic modules is only for use with custom applications. If you use this module to control a device or software on the market that more than you are using, <strong>PLEASE let us know</strong> about this software, so we can make a proper module for it. If we already support this and you use this to trigger a feature our module doesn't support, please let us know. We want companion to be as easy as possible to use for anyone.",
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Target host',
			tooltip: 'The host of the WebSocket server',
			width: 6,
		},
		{
			type: 'textinput',
			id: 'port',
			label: 'Port',
			tooltip: 'The port of the WebSocket server',
			width: 6,
			regex: Regex.NUMBER,
		},
		{
			type: 'checkbox',
			id: 'reconnect',
			label: 'Reconnect',
			tooltip: 'Reconnect on WebSocket error (after 5 secs)',
			width: 6,
			default: true,
		},
		{
			type: 'checkbox',
			id: 'debug_messages',
			label: 'Debug messages',
			tooltip: 'Log incomming and outcomming messages',
			width: 6,
			default: false,
		},
		{
			type: 'checkbox',
			id: 'reset_variables',
			label: 'Reset variables',
			tooltip: 'Reset variables on init and on connect',
			width: 6,
			default: true,
		},
	]
}
