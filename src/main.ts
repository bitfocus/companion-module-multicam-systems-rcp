
import { InstanceBase, runEntrypoint, InstanceStatus, SomeCompanionConfigField, DropdownChoice, CompanionVariableDefinition } from '@companion-module/base'
import { type ModuleConfig, GetConfigFields} from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import * as objectPath from 'object-path'
import { io } from 'socket.io-client'

export interface cameraDataFromWebSocket {

	uuid: string;
	model_descriptor: {
		control_properties: {
			[key: string]: {
				value: number
			}
		}
	}	

}

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()
	isInitialized: boolean;
	subscriptions = new Map<string, {variableName: string, subpath: string}>()
	cameras: cameraDataFromWebSocket[];
	reconnect_timer: NodeJS.Timeout | null = null
	socket: any
	once: any


	constructor(internal: unknown) {
		super(internal)
		this.cameras = [];
		this.once = true;
		this.isInitialized = false

	}

	async init(config: ModuleConfig): Promise<void> {


		this.config = config


		this.updateStatus(InstanceStatus.Ok)

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.initWebSocket()
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	updateVariables(callerId?: string) {
		let variables = new Set<string>()
		let defaultValues: any = {}
		this.subscriptions.forEach((subscription, subscriptionId) => {
			if (!subscription.variableName.match(/^[-a-zA-Z0-9_]+$/)) {
				return
			}
			variables.add(subscription.variableName)
			if (callerId && callerId === subscriptionId) {
				defaultValues[subscription.variableName] = ''
			}
		})
		let variableDefinitions: CompanionVariableDefinition[] = []
		variables.forEach((variable) => {
			variableDefinitions.push({
				variableId: variable,
				name: variable,
			})
		})
		this.setVariableDefinitions(variableDefinitions)
		if (this.config.reset_variables) {
			this.setVariableValues(defaultValues)
		}
	}

	maybeReconnect() {
		if (this.isInitialized && this.config.reconnect) {
			if (this.reconnect_timer) {
				clearTimeout(this.reconnect_timer)
			}
			this.reconnect_timer = setTimeout(() => {
				this.initWebSocket()
			}, 5000)
		}
	}

	initWebSocket() {
		if (this.reconnect_timer) {
			clearTimeout(this.reconnect_timer)
			this.reconnect_timer = null
		}

		const ip = this.config.host
		const port = this.config.port
		if (!ip || !port) {
			this.updateStatus(InstanceStatus.BadConfig, `no host and/or port defined`)
			return
		}

		this.updateStatus(InstanceStatus.Connecting)	

		if (this.socket) {
			this.socket.close(1000)
			delete this.socket
		}
		
		this.socket = io(`ws://${ip}:${port}`);

		this.socket.on("connect", () => {
			this.updateStatus(InstanceStatus.Ok)
			this.log('debug', `socket Connection opened`)
		})

		this.socket.on('open', () => {
			this.log('debug', `Connection opened`)
			if (this.config.reset_variables) {
				this.updateVariables()
			}
		})
		this.socket.on('close', (code: any) => {
			this.log('debug', `Connection closed with code ${code}`)
			this.updateStatus(InstanceStatus.Disconnected, `Connection closed with code ${code}`)
			this.maybeReconnect()
		})

		this.socket.on('message', (data: any) =>{
			this.log('debug', data)

		})

		this.socket.on('error', (data: any) => {
			this.log('error', `WebSocket error: ${data}`)
		})
		this.setVariableDefinitions([
			{ variableId: 'camera1_iris', name: 'My first variable' },
			{ variableId: 'camera2_iris', name: 'My first variable' },
		])


		this.once = true;
		this.socket.on(`cameras`, (data: cameraDataFromWebSocket[]) => {
			if(this.once){
				this.log('debug', `Running once`)
				this.cameras = data;
				var newVariables: CompanionVariableDefinition[] = [];
				var cameraDropdownChoices: DropdownChoice[] = [];
				var settingDropdownChoices: DropdownChoice[] = [];
				Object.keys(this.cameras[0]["model_descriptor"]["control_properties"]).forEach(control_property => {
					settingDropdownChoices.push(
						{ id: control_property, label: control_property}
					)
				})
				this.cameras.forEach((camera, index) => {
					Object.keys(camera["model_descriptor"]["control_properties"]).forEach(control_property =>{
						newVariables.push(
							{
								variableId: "camera" + index + control_property,
								name: "camera" + index + control_property,
							}
						)
						this.socket.on(`node::${camera.uuid}::${control_property}`, (data: any) => {
							var variableObject: any = {};
							variableObject[ "camera" + index + control_property] = data
							this.setVariableValues(variableObject)
							if(this.cameras[index]["model_descriptor"]){
							}
							else{
								this.cameras[index]["model_descriptor"] = { "control_properties": {}}
								
							}
							if(this.cameras[index]["model_descriptor"]["control_properties"]){
							}
							else{
								this.cameras[index]["model_descriptor"]["control_properties"] = {}
							}
							if(this.cameras[index]["model_descriptor"]["control_properties"][control_property]){
							}
							else{
								this.cameras[index]["model_descriptor"]["control_properties"][control_property] = {value: 0}
							}
							this.cameras[index]["model_descriptor"]["control_properties"][control_property].value = data
						})
					})
					cameraDropdownChoices.push(
						{ id: camera.uuid, label: 'Camera' + (index + 1) }
					)
				});
				this.setVariableDefinitions(newVariables)
				this.setActionDefinitions({
					send_command: {
						name: 'Camera setting',
						options: [
							{
								id: 'cameraUuid',
								type: 'dropdown',
								label: 'Select camera',
								choices: cameraDropdownChoices,
								default: cameraDropdownChoices[0].id
							},
							{
								id: 'setting',
								type: 'dropdown',
								label: 'Select setting',
								choices: settingDropdownChoices,
								default: cameraDropdownChoices[0].id
							},
							{
								id: 'value',
								type: 'number',
								label: 'Value',
								default: 0,
								min: -100,
								max: 100
							}
						],
						callback: async (
							action, 
							// context
							) => {
							try {
								var selectedCamera = this.cameras.filter(obj => {
									return obj.uuid === action.options.cameraUuid
								})[0]
								if(typeof(action.options.setting) != "string"){return;}
								if(typeof(action.options.value) != "number"){return;}
								var oldValue = Math.floor((+selectedCamera["model_descriptor"]["control_properties"][action.options.setting].value)*1000)/1000
								console.log(oldValue)
								var string = "node-update::" + action.options.cameraUuid + "::" + action.options.setting + " " + (+action.options.value + +oldValue)
								this.log('debug', string);
								console.log(+action.options.value)
								console.log(+oldValue)
								this.socket.emit("node-update", [action.options.cameraUuid, action.options.setting, (Math.floor((+action.options.value*1000)) / 1000 + +oldValue)])
								
							} catch(e){
								if (typeof e === "string") {
									this.log('error', e)
								} else if (e instanceof Error) {
									this.log('error', e.message)
								}
							}



						},
					},
				})
				this.once = false
			}

		})

	}

	messageReceivedFromWebSocket(data: string) {
		if (this.config.debug_messages) {
			this.log('debug', `Message received: ${data}`)
		}

		let msgValue = null
		try {
			msgValue = JSON.parse(data)
		} catch (e) {
			msgValue = data
		}

		this.subscriptions.forEach((subscription) => {
			if (subscription.variableName === '') {
				return
			}
			if (subscription.subpath === '') {
				this.setVariableValues({
					[subscription.variableName]: typeof msgValue === 'object' ? JSON.stringify(msgValue) : msgValue,
				})
			} else if (typeof msgValue === 'object' && objectPath.has(msgValue, subscription.subpath)) {
				// let value = objectPath.get(msgValue, subscription.subpath)
				// this.setVariable({
				// 	[subscription.variableName]: typeof value === 'object' ? JSON.stringify(value) : value,
				// })
			}
		})
	}

	initFeedbacks() {
		this.setFeedbackDefinitions({
			websocket_variable: {
				type: 'advanced',
				name: 'Update variable with value from WebSocket message',
				description:
					'Receive messages from the WebSocket and set the value to a variable. Variables can be used on any button.',
				options: [
					{
						type: 'textinput',
						label: 'JSON Path (blank if not json)',
						id: 'subpath',
						default: '',
					},
					{
						type: 'textinput',
						label: 'Variable',
						id: 'variable',
						regex: '/^[-a-zA-Z0-9_]+$/',
						default: '',
					},
				],
				callback: () => {
					// Nothing to do, as this feeds a variable
					return {}
				},
				subscribe: (feedback) => {
					if (typeof(feedback.options.variable) !== 'string' || feedback.options.variable === '') {
						return
					}
					if (typeof(feedback.options.subpath) !== 'string') {
						feedback.options.subpath = ''
					}
					if(typeof(feedback.id) !== 'string'){
						return
					}

					this.subscriptions.set(feedback.id, {
						variableName: feedback.options.variable,
						subpath: feedback.options.subpath,
					})
					if (this.isInitialized) {
						this.updateVariables(feedback.id)
					}
				},
				unsubscribe: (feedback) => {
					this.subscriptions.delete(feedback.id)
				},
			},
		})
	}

	initActions() {
		this.setActionDefinitions({
			send_command: {
				name: 'Send generic command',
				options: [
					{
						type: 'textinput',
						label: 'data',
						id: 'data',
						default: '',
						useVariables: true,
					},
				],
				callback: async (action, context) => {
					if(typeof(action.options.data) !== 'string'){return;}
					const value = await context.parseVariablesInString(action.options.data)
					if (this.config.debug_messages) {
						this.log('debug', `Message sent: ${value}`)
					}
					this.socket.send(value + '\r\n')
				},
			},
		})
	}
	
}

runEntrypoint(ModuleInstance, UpgradeScripts)
