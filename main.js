const { InstanceBase, runEntrypoint, Regex, InstanceStatus } = require('@companion-module/base')
const objectPath = require('object-path')
const io = require('socket.io-client')


class WebsocketInstance extends InstanceBase {
	isInitialized = false

	subscriptions = new Map()

	async init(config) {

		this.cameras;

		this.config = config

		this.initWebSocket()
		this.isInitialized = true



		// this.updateVariables()
		// this.initActions()
		this.initFeedbacks()
		this.subscribeFeedbacks()
	}


	async destroy() {
		this.isInitialized = false
		if (this.reconnect_timer) {
			clearTimeout(this.reconnect_timer)
			this.reconnect_timer = null
		}
		if (this.socket) {
			this.socket.close(1000)
			delete this.socket
		}
	}

	async configUpdated(config) {
		this.config = config
		this.initWebSocket()
	}

	updateVariables(callerId = null) {
		let variables = new Set()
		let defaultValues = {}
		this.subscriptions.forEach((subscription, subscriptionId) => {
			if (!subscription.variableName.match(/^[-a-zA-Z0-9_]+$/)) {
				return
			}
			variables.add(subscription.variableName)
			if (callerId === null || callerId === subscriptionId) {
				defaultValues[subscription.variableName] = ''
			}
		})
		let variableDefinitions = []
		variables.forEach((variable) => {
			variableDefinitions.push({
				name: variable,
				variableId: variable,
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
		this.socket.on('close', (code) => {
			this.log('debug', `Connection closed with code ${code}`)
			this.updateStatus(InstanceStatus.Disconnected, `Connection closed with code ${code}`)
			this.maybeReconnect()
		})

		this.socket.on('message', (data) =>{
			this.log('debug', data)

		})

		this.socket.on('error', (data) => {
			this.log('error', `WebSocket error: ${data}`)
		})
		this.setVariableDefinitions([
			{ variableId: 'camera1_iris', name: 'My first variable' },
			{ variableId: 'camera2_iris', name: 'My first variable' },
		])


		this.once = true;
		this.socket.on(`cameras`, (data) => {
			if(this.once){
				this.log('debug', `Running once`)
				this.cameras = data;
				var newVariables = [];
				var cameraDropdownChoices = [];
				var settingDropdownChoices = [];
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
						this.socket.on(`node::${camera.uuid}::${control_property}`, (data) => {
							var variableObject = {};
							variableObject[ "camera" + index + control_property] = data
							this.setVariableValues(variableObject)
							if(this.cameras["model_descriptor"]){
							}
							else{
								this.cameras["model_descriptor"] = {}
								
							}
							if(this.cameras["model_descriptor"]["control_properties"]){
							}
							else{
								this.cameras["model_descriptor"]["control_properties"] = {}
							}
							if(this.cameras["model_descriptor"]["control_properties"][control_property]){
							}
							else{
								this.cameras["model_descriptor"]["control_properties"][control_property] = {}
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
							},
							{
								id: 'setting',
								type: 'dropdown',
								label: 'Select setting',
								choices: settingDropdownChoices,
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
						callback: async (action, context) => {
							try {
								var selectedCamera = this.cameras.filter(obj => {
									return obj.uuid === action.options.cameraUuid
								})[0]
								var oldValue = Math.floor((+selectedCamera["model_descriptor"]["control_properties"][action.options.setting].value)*1000)/1000
								console.log(oldValue)
								var string = "node-update::" + action.options.cameraUuid + "::" + action.options.setting + " " + (+action.options.value + +oldValue)
								this.log('debug', string);
								console.log(+action.options.value)
								console.log(+oldValue)
								this.socket.emit("node-update", [action.options.cameraUuid, action.options.setting, (Math.floor((+action.options.value*1000)) / 1000 + +oldValue)])
								
							} catch (error) {
								this.log('error', error.message)
							}



						},
					},
				})
				this.once = false
			}

		})

	}

	messageReceivedFromWebSocket(data) {
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
				let value = objectPath.get(msgValue, subscription.subpath)
				this.setVariable({
					[subscription.variableName]: typeof value === 'object' ? JSON.stringify(value) : value,
				})
			}
		})
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Information',
				value:
					"<strong>PLEASE READ THIS!</strong> Generic modules is only for use with custom applications. If you use this module to control a device or software on the market that more than you are using, <strong>PLEASE let us know</strong> about this software, so we can make a proper module for it. If we already support this and you use this to trigger a feature our module doesn't support, please let us know. We want companion to be as easy as possible to use for anyone.",
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

runEntrypoint(WebsocketInstance, [])