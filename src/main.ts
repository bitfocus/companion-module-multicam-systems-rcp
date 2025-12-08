import {
	InstanceBase,
	runEntrypoint,
	InstanceStatus,
	type SomeCompanionConfigField,
	type DropdownChoice,
} from '@companion-module/base'
import { type ModuleConfig, GetConfigFields } from './config.js'
import { UpdateVariableDefinitions, UpdateVariableValues } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { io, type Socket } from 'socket.io-client'
import type {
	WebsocketCamerasOutput,
	User,
	IModuleTallyBuses,
	WebsocketModulesSend,
	TallyColor,
	PropertyValue,
} from './types.js'

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig

	// WebSocket connection
	socket: Socket | null = null
	reconnect_timer: NodeJS.Timeout | null = null
	isInitialized = false

	// State from server
	cameras: WebsocketCamerasOutput[] = []
	users: User[] = []
	tally: IModuleTallyBuses[] = []
	modules: WebsocketModulesSend[] = []

	// Cached values for variables
	propertyValues: Map<string, PropertyValue> = new Map()

	// Per-user step size preference (stored locally in Companion)
	userStepSizes: Map<string, 'big' | 'normal' | 'small'> = new Map()

	// Per-user PTZ preset mode preference (stored locally in Companion)
	userPtzModes: Map<string, 'normal' | 'tracing' | 'scene'> = new Map()

	// Per-user PTZ preset action preference (stored locally in Companion)
	userPtzActions: Map<string, 'recall' | 'store'> = new Map()

	// Per-user routing state (selected module and destination output)
	userSelectedModule: Map<string, string> = new Map()
	userSelectedOutput: Map<string, number> = new Map()

	// Per-module static routing state (for per-module folders without user context)
	staticSelectedOutput: Map<string, number> = new Map() // moduleUuid -> outputIndex

	// Dropdown choices (updated dynamically)
	cameraChoices: DropdownChoice[] = []
	userChoices: DropdownChoice[] = []
	moduleChoices: DropdownChoice[] = []
	propertyChoices: DropdownChoice[] = []
	booleanPropertyChoices: DropdownChoice[] = []
	floatPropertyChoices: DropdownChoice[] = []
	enumPropertyChoices: DropdownChoice[] = []

	// Debounce timers for performance
	private variableUpdateTimer: NodeJS.Timeout | null = null
	private uiRebuildTimer: NodeJS.Timeout | null = null
	private feedbackCheckTimer: NodeJS.Timeout | null = null
	private pendingFeedbacks: Set<string> = new Set()

	// Cached tally colors for performance
	private tallyColorCache: Map<string, TallyColor> = new Map()

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		this.isInitialized = true

		this.updateStatus(InstanceStatus.Disconnected)

		// Initialize with empty state
		this.updateActions()
		this.updateFeedbacks()
		this.updateVariableDefinitions()
		this.updatePresets()

		// Connect to server
		this.initWebSocket()
	}

	async destroy(): Promise<void> {
		this.log('debug', 'Destroying module instance')
		this.isInitialized = false

		// Clear all timers
		if (this.reconnect_timer) {
			clearTimeout(this.reconnect_timer)
			this.reconnect_timer = null
		}
		if (this.variableUpdateTimer) {
			clearTimeout(this.variableUpdateTimer)
			this.variableUpdateTimer = null
		}
		if (this.uiRebuildTimer) {
			clearTimeout(this.uiRebuildTimer)
			this.uiRebuildTimer = null
		}
		if (this.feedbackCheckTimer) {
			clearTimeout(this.feedbackCheckTimer)
			this.feedbackCheckTimer = null
		}

		if (this.socket) {
			this.socket.removeAllListeners()
			this.socket.disconnect()
			this.socket = null
		}
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		const hostChanged = this.config.host !== config.host
		const portChanged = this.config.port !== config.port

		this.config = config

		if (hostChanged || portChanged) {
			this.initWebSocket()
		}
	}

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

	updatePresets(): void {
		UpdatePresets(this)
	}

	/**
	 * Schedule a debounced variable update
	 * Batches multiple rapid updates into a single update
	 */
	scheduleVariableUpdate(): void {
		if (this.variableUpdateTimer) {
			clearTimeout(this.variableUpdateTimer)
		}
		this.variableUpdateTimer = setTimeout(() => {
			this.variableUpdateTimer = null
			UpdateVariableValues(this)
		}, 50) // 50ms debounce
	}

	/**
	 * Schedule a debounced UI rebuild (actions, feedbacks, presets)
	 * Used when cameras/users/modules change
	 */
	scheduleUiRebuild(): void {
		if (this.uiRebuildTimer) {
			clearTimeout(this.uiRebuildTimer)
		}
		this.uiRebuildTimer = setTimeout(() => {
			this.uiRebuildTimer = null
			this.updateActions()
			this.updateFeedbacks()
			this.updatePresets()
		}, 100) // 100ms debounce for heavier operations
	}

	/**
	 * Schedule a debounced feedback check
	 * Batches multiple feedback checks into one
	 */
	scheduleFeedbackCheck(...feedbackIds: string[]): void {
		feedbackIds.forEach((id) => this.pendingFeedbacks.add(id))

		if (this.feedbackCheckTimer) {
			clearTimeout(this.feedbackCheckTimer)
		}
		this.feedbackCheckTimer = setTimeout(() => {
			this.feedbackCheckTimer = null
			if (this.pendingFeedbacks.size > 0) {
				this.checkFeedbacks(...Array.from(this.pendingFeedbacks))
				this.pendingFeedbacks.clear()
			}
		}, 30) // 30ms debounce for feedbacks
	}

	/**
	 * Invalidate tally cache - call when tally data changes
	 */
	invalidateTallyCache(): void {
		this.tallyColorCache.clear()
	}

	/**
	 * Schedule a reconnection attempt
	 */
	maybeReconnect(): void {
		if (this.isInitialized && this.config.reconnect) {
			if (this.reconnect_timer) {
				clearTimeout(this.reconnect_timer)
			}
			this.reconnect_timer = setTimeout(() => {
				this.initWebSocket()
			}, 5000)
		}
	}

	/**
	 * Initialize WebSocket connection to Multicam RCP server
	 */
	initWebSocket(): void {
		if (this.reconnect_timer) {
			clearTimeout(this.reconnect_timer)
			this.reconnect_timer = null
		}

		const ip = this.config.host
		const port = this.config.port

		if (!ip || !port) {
			this.updateStatus(InstanceStatus.BadConfig, 'No host and/or port defined')
			return
		}

		this.updateStatus(InstanceStatus.Connecting)

		// Clean up existing socket
		if (this.socket) {
			this.socket.removeAllListeners()
			this.socket.disconnect()
			this.socket = null
		}

		// Connect with Socket.IO using the /ws-core path
		this.socket = io(`http://${ip}:${port}`, {
			path: '/ws-core',
			transports: ['websocket', 'polling'],
			reconnection: false, // We handle reconnection ourselves
		})

		this.socket.on('connect', () => {
			this.log('info', `Connected to Multicam RCP at ${ip}:${port}`)
			this.updateStatus(InstanceStatus.Ok)

			// Request initial data
			this.socket?.emit('getCameras')
			this.socket?.emit('getUsers')
			this.socket?.emit('getTally')
			this.socket?.emit('getModules')
		})

		this.socket.on('disconnect', (reason) => {
			this.log('warn', `Disconnected from server: ${reason}`)
			this.updateStatus(InstanceStatus.Disconnected, `Disconnected: ${reason}`)
			this.maybeReconnect()
		})

		this.socket.on('connect_error', (error) => {
			this.log('error', `Connection error: ${error.message}`)
			this.updateStatus(InstanceStatus.ConnectionFailure, error.message)
			this.maybeReconnect()
		})

		// Handle cameras data
		this.socket.on('cameras', (data: WebsocketCamerasOutput[]) => {
			if (this.config.debug_messages) {
				this.log('debug', `Received cameras: ${JSON.stringify(data).substring(0, 200)}...`)
			}
			this.cameras = data
			this.invalidateTallyCache() // Tally may have changed with camera updates
			this.updateCameraChoices()
			this.updatePropertyChoices()
			this.subscribeToPropertyUpdates()
			this.requestInitialPropertyValues() // Request current values for all cameras
			this.updateVariableDefinitions()
			this.scheduleUiRebuild() // Debounced UI rebuild
			this.scheduleFeedbackCheck('camera_tally_program', 'camera_tally_preview', 'camera_tally_color')
		})

		// Handle users data
		this.socket.on('users', (data: User[]) => {
			// Always log users for debugging category issues
			this.log('info', `Received ${data.length} users: ${data.map((u) => u.name).join(', ')}`)
			this.users = data
			// Update user choices for action dropdowns
			this.userChoices = this.users.map((user) => ({
				id: user.uuid,
				label: user.name || user.uuid,
			}))
			if (this.userChoices.length === 0) {
				this.userChoices = [{ id: '', label: 'No users available' }]
			}
			this.updateCameraChoices() // Re-update camera choices as user assignments may have changed
			this.updateVariableDefinitions() // Update variable definitions with new user variables
			this.scheduleUiRebuild() // Debounced UI rebuild
			this.scheduleVariableUpdate() // Debounced variable update
			this.scheduleFeedbackCheck(
				'user_previewing_camera',
				'any_user_previewing_camera',
				'camera_status',
				'user_preview_indicator',
			)
		})

		// Handle tally data
		this.socket.on('tally', (data: IModuleTallyBuses[]) => {
			if (this.config.debug_messages) {
				this.log('debug', `Received tally: ${JSON.stringify(data).substring(0, 200)}...`)
			}
			this.tally = data
			this.invalidateTallyCache() // Clear cache when tally changes
			this.scheduleVariableUpdate() // Update tally variables
			// Check all routing-related feedbacks when routes change
			this.scheduleFeedbackCheck(
				'camera_tally_program',
				'camera_tally_preview',
				'camera_tally_color',
				'route_active',
				'route_tally_color',
				'route_source_active_static',
				'route_destination_selected_static',
				'route_source_active_for_user',
				'route_destination_selected_user',
				'route_tally_color_user',
			)
			// Rebuild UI when router topology changes (new inputs/outputs)
			this.scheduleUiRebuild()
		})

		// Handle modules data
		this.socket.on('modules', (data: WebsocketModulesSend[]) => {
			if (this.config.debug_messages) {
				this.log('debug', `Received modules: ${JSON.stringify(data).substring(0, 200)}...`)
			}
			this.modules = data
			this.updateModuleChoices()
			this.scheduleUiRebuild() // Only rebuild UI, not feedbacks
		})
	}

	/**
	 * Request initial property values for all cameras
	 */
	requestInitialPropertyValues(): void {
		if (!this.socket) return

		this.cameras.forEach((camera) => {
			// Request basic properties
			;['name', 'id', 'tally'].forEach((property) => {
				this.socket?.emit('get-node', { uuid: camera.uuid, property })
			})

			// Request all assigned module properties
			const properties = camera.assignedModuleControlProperties || []
			properties.forEach((property) => {
				this.socket?.emit('get-node', { uuid: camera.uuid, property })
			})
		})
	}

	/**
	 * Subscribe to property update events for all cameras
	 */
	subscribeToPropertyUpdates(): void {
		if (!this.socket) return

		// Remove old listeners first
		this.cameras.forEach((camera) => {
			const properties = camera.assignedModuleControlProperties || []
			properties.forEach((property) => {
				this.socket?.off(`node::${camera.uuid}::${property}`)
			})
		})

		// Add new listeners
		this.cameras.forEach((camera, index) => {
			const properties = camera.assignedModuleControlProperties || []
			properties.forEach((property) => {
				this.socket?.on(`node::${camera.uuid}::${property}`, (value: PropertyValue) => {
					const varKey = `camera_${index}_${property}`
					this.propertyValues.set(varKey, value)
					this.scheduleVariableUpdate() // Debounced

					// Check property_bool feedback for all boolean-like properties
					if (this.isBooleanProperty(property)) {
						this.scheduleFeedbackCheck('property_bool')
					}
				})
			})

			// Also subscribe to basic camera properties
			;['name', 'id', 'tally'].forEach((property) => {
				this.socket?.on(`node::${camera.uuid}::${property}`, (value: PropertyValue) => {
					const varKey = `camera_${index}_${property}`
					this.propertyValues.set(varKey, value)
					this.scheduleVariableUpdate() // Debounced

					// If tally changed, recheck tally feedbacks
					if (property === 'tally') {
						this.invalidateTallyCache()
						this.scheduleFeedbackCheck('camera_tally_program', 'camera_tally_preview', 'camera_tally_color')
					}
				})
			})
		})
	}

	/**
	 * Update camera dropdown choices with Virtual/User prefixes
	 */
	updateCameraChoices(): void {
		this.cameraChoices = this.cameras.map((camera, index) => {
			let label = camera.name || `Camera ${index + 1}`

			// Check if this is a user-assigned virtual camera
			const assignedUser = this.users.find((u) => u.attachedVirtualCameraUuid === camera.uuid)
			if (assignedUser) {
				label = `User selected: ${assignedUser.name}`
			} else if (camera.virtualCameraEnable) {
				label = `Virtual: ${label}`
			}

			return {
				id: camera.uuid,
				label,
			}
		})
	}

	/**
	 * Update module dropdown choices for routing
	 */
	updateModuleChoices(): void {
		this.moduleChoices = this.modules
			.filter((m) => m.moduleType === 'standaloneComponent')
			.map((module) => ({
				id: module.moduleUuid,
				label: module.customName || module.friendlyname || module.name,
			}))

		// Also add tally buses from modules
		this.tally.forEach((tallyBus) => {
			if (!this.moduleChoices.find((m) => m.id === tallyBus.uuid)) {
				this.moduleChoices.push({
					id: tallyBus.uuid,
					label: tallyBus.name || `Bus ${tallyBus.uuid.substring(0, 8)}`,
				})
			}
		})
	}

	/**
	 * Update property dropdown choices based on available camera properties
	 */
	updatePropertyChoices(): void {
		const propertySet = new Set<string>()

		this.cameras.forEach((camera) => {
			const properties = camera.assignedModuleControlProperties || []
			properties.forEach((prop) => propertySet.add(prop))
		})

		this.propertyChoices = Array.from(propertySet)
			.sort()
			.map((prop) => ({
				id: prop,
				label: this.formatPropertyName(prop),
			}))

		// Also create type-filtered versions
		this.booleanPropertyChoices = this.propertyChoices.filter((prop) => this.isBooleanProperty(String(prop.id)))
		this.floatPropertyChoices = this.propertyChoices.filter(
			(prop) => !this.isBooleanProperty(String(prop.id)) && !this.isEnumProperty(String(prop.id)),
		)
		this.enumPropertyChoices = this.propertyChoices.filter((prop) => this.isEnumProperty(String(prop.id)))
	}

	/**
	 * Check if a property is likely a boolean based on naming convention
	 */
	isBooleanProperty(prop: string): boolean {
		const booleanPatterns = [
			'auto_',
			'enable',
			'show_',
			'hide_',
			'flip_',
			'mirror_',
			'color_bars',
			'osd_',
			'_on',
			'_off',
			'mute',
		]
		const lowerProp = prop.toLowerCase()
		return booleanPatterns.some((pattern) => lowerProp.includes(pattern))
	}

	/**
	 * Check if a property is likely an enum based on naming convention
	 */
	isEnumProperty(prop: string): boolean {
		const enumPatterns = [
			'_mode',
			'_format',
			'_preset',
			'_scene',
			'_matrix',
			'_balance',
			'nd_filter',
			'shutter_mode',
			'white_balance_mode',
			'tally',
		]
		const lowerProp = prop.toLowerCase()
		return enumPatterns.some((pattern) => lowerProp.includes(pattern))
	}

	/**
	 * Format a property name for display
	 */
	formatPropertyName(prop: string): string {
		return prop.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
	}

	/**
	 * Get the camera UUID to control
	 * Returns the provided UUID or null if empty/invalid
	 */
	getTargetCameraUuid(cameraUuid?: string): string | null {
		if (!cameraUuid) return null
		// Verify the camera exists
		const camera = this.cameras.find((c) => c.uuid === cameraUuid)
		return camera ? cameraUuid : null
	}

	/**
	 * Get tally color for a camera (with caching for performance)
	 */
	getCameraTallyColor(cameraUuid: string): TallyColor {
		// Check cache first
		const cached = this.tallyColorCache.get(cameraUuid)
		if (cached !== undefined) {
			return cached
		}

		let result: TallyColor = 'off'

		// First check the camera's own tally property from propertyValues
		const cameraIndex = this.cameras.findIndex((c) => c.uuid === cameraUuid)
		if (cameraIndex !== -1) {
			const tallyValue = this.propertyValues.get(`camera_${cameraIndex}_tally`)
			if (tallyValue) {
				// Handle various value formats
				if (typeof tallyValue === 'string') {
					if (['off', 'red', 'green', 'blue', 'yellow', 'purple'].includes(tallyValue)) {
						result = tallyValue as TallyColor
						this.tallyColorCache.set(cameraUuid, result)
						return result
					}
				} else if (typeof tallyValue === 'object' && 'value' in tallyValue) {
					const val = (tallyValue as { value: string | number }).value
					if (typeof val === 'string' && ['off', 'red', 'green', 'blue', 'yellow', 'purple'].includes(val)) {
						result = val as TallyColor
						this.tallyColorCache.set(cameraUuid, result)
						return result
					}
				}
			}
		}

		// Also look through tally buses to find camera tally
		for (const tallyBus of this.tally) {
			if (tallyBus.outputs) {
				for (const outputKey of Object.keys(tallyBus.outputs)) {
					const output = tallyBus.outputs[parseInt(outputKey)]
					if (output?.routedInput?.inputObject?.uuid === cameraUuid) {
						if (output.tallyColor) {
							result = output.tallyColor
							this.tallyColorCache.set(cameraUuid, result)
							return result
						}
					}
				}
			}
		}

		this.tallyColorCache.set(cameraUuid, result)
		return result
	}

	/**
	 * Send a node update to set a camera property
	 */
	setProperty(cameraUuid: string, property: string, value: PropertyValue): void {
		if (!this.socket) {
			this.log('error', 'Cannot set property: not connected')
			return
		}

		if (this.config.debug_messages) {
			this.log('debug', `Setting ${property} on ${cameraUuid} to ${JSON.stringify(value)}`)
		}

		this.socket.emit('node-update', [cameraUuid, property, value])
	}

	/**
	 * Increase a camera property value
	 */
	increaseProperty(cameraUuid: string, property: string, substep = false, bigstep = false): void {
		if (!this.socket) {
			this.log('error', 'Cannot increase property: not connected')
			return
		}

		this.socket.emit('increase-property', { uuid: cameraUuid, property, substep, bigstep })
	}

	/**
	 * Decrease a camera property value
	 */
	decreaseProperty(cameraUuid: string, property: string, substep = false, bigstep = false): void {
		if (!this.socket) {
			this.log('error', 'Cannot decrease property: not connected')
			return
		}

		this.socket.emit('decrease-property', { uuid: cameraUuid, property, substep, bigstep })
	}

	/**
	 * Set a route on a module
	 */
	setRoute(moduleUuid: string, sourceIndex: number, destinationIndex: number): void {
		if (!this.socket) {
			this.log('error', 'Cannot set route: not connected')
			return
		}

		if (this.config.debug_messages) {
			this.log('debug', `Setting route: ${sourceIndex} -> ${destinationIndex} on ${moduleUuid}`)
		}

		this.socket.emit('setRoute', {
			moduleUuid,
			sourceIndex,
			destinationIndex,
		})
	}

	/**
	 * Get user's step size preference (defaults to 'normal')
	 */
	getUserStepSize(userUuid: string): 'big' | 'normal' | 'small' {
		return this.userStepSizes.get(userUuid) || 'normal'
	}

	/**
	 * Set user's step size preference
	 */
	setUserStepSize(userUuid: string, stepSize: 'big' | 'normal' | 'small'): void {
		this.userStepSizes.set(userUuid, stepSize)
		this.log('info', `Set step size for user ${userUuid} to ${stepSize}`)
		this.checkFeedbacks('user_step_size')
	}

	/**
	 * Get user's PTZ mode preference (defaults to 'normal')
	 */
	getUserPtzMode(userUuid: string): 'normal' | 'tracing' | 'scene' {
		return this.userPtzModes.get(userUuid) || 'normal'
	}

	/**
	 * Set user's PTZ mode preference
	 */
	setUserPtzMode(userUuid: string, mode: 'normal' | 'tracing' | 'scene'): void {
		this.userPtzModes.set(userUuid, mode)
		this.log('info', `Set PTZ mode for user ${userUuid} to ${mode}`)
		this.checkFeedbacks('user_ptz_mode')
	}

	/**
	 * Get user's PTZ action preference (defaults to 'recall')
	 */
	getUserPtzAction(userUuid: string): 'recall' | 'store' {
		return this.userPtzActions.get(userUuid) || 'recall'
	}

	/**
	 * Set user's PTZ action preference
	 */
	setUserPtzAction(userUuid: string, action: 'recall' | 'store'): void {
		this.userPtzActions.set(userUuid, action)
		this.log('info', `Set PTZ action for user ${userUuid} to ${action}`)
		this.checkFeedbacks('user_ptz_action')
	}

	/**
	 * Trigger user preview button press (select camera for user)
	 */
	userPreviewCamera(userUuid: string, cameraUuid: string | null): void {
		if (!this.socket) {
			this.log('error', 'Cannot preview camera: not connected')
			return
		}

		if (this.config.debug_messages) {
			this.log('debug', `User ${userUuid} previewing camera ${cameraUuid}`)
		}

		this.socket.emit('camera_preview_down', {
			userUuid,
			cameraUuid,
		})
	}

	// ===== User Routing State =====

	/**
	 * Get user's selected module for routing
	 */
	getUserSelectedModule(userUuid: string): string | undefined {
		return this.userSelectedModule.get(userUuid)
	}

	/**
	 * Set user's selected module for routing
	 */
	setUserSelectedModule(userUuid: string, moduleUuid: string): void {
		this.userSelectedModule.set(userUuid, moduleUuid)
		this.log('debug', `User ${userUuid} selected router module ${moduleUuid}`)
		this.checkFeedbacks(
			'route_module_selected',
			'route_destination_selected_user',
			'route_source_active_for_user',
			'route_tally_color_user',
		)
		// Update variables so button labels change
		this.scheduleVariableUpdate()
	}

	/**
	 * Get user's selected output for routing
	 */
	getUserSelectedOutput(userUuid: string): number | undefined {
		return this.userSelectedOutput.get(userUuid)
	}

	/**
	 * Set user's selected output for routing
	 */
	setUserSelectedOutput(userUuid: string, outputIndex: number): void {
		this.userSelectedOutput.set(userUuid, outputIndex)
		this.log('debug', `User ${userUuid} selected output ${outputIndex}`)
		// Refresh both destination and source feedbacks immediately
		this.checkFeedbacks('route_destination_selected_user', 'route_source_active_for_user')
	}

	/**
	 * Route a source to user's selected destination
	 */
	routeToUserDestination(userUuid: string, sourceIndex: number): void {
		const moduleUuid = this.userSelectedModule.get(userUuid)
		const outputIndex = this.userSelectedOutput.get(userUuid)

		if (!moduleUuid) {
			this.log('warn', `User ${userUuid} has no module selected for routing`)
			return
		}
		if (outputIndex === undefined) {
			this.log('warn', `User ${userUuid} has no output selected for routing`)
			return
		}

		this.setRoute(moduleUuid, sourceIndex, outputIndex)
	}

	// ===== Static Module Routing State (per-module folders) =====

	/**
	 * Get static selected output for a module
	 */
	getStaticSelectedOutput(moduleUuid: string): number | undefined {
		return this.staticSelectedOutput.get(moduleUuid)
	}

	/**
	 * Set static selected output for a module
	 */
	setStaticSelectedOutput(moduleUuid: string, outputIndex: number): void {
		this.staticSelectedOutput.set(moduleUuid, outputIndex)
		this.log('debug', `Module ${moduleUuid} selected output ${outputIndex}`)
		// Refresh both destination and source feedbacks immediately
		this.checkFeedbacks('route_destination_selected_static', 'route_source_active_static')
	}

	/**
	 * Route a source to the module's static selected destination
	 */
	routeToStaticDestination(moduleUuid: string, sourceIndex: number): void {
		const outputIndex = this.staticSelectedOutput.get(moduleUuid)

		if (outputIndex === undefined) {
			this.log('warn', `Module ${moduleUuid} has no output selected for routing`)
			return
		}

		this.setRoute(moduleUuid, sourceIndex, outputIndex)
	}

	/**
	 * Get input label for a user's selected module
	 */
	getUserRouteInputLabel(userUuid: string, inputIndex: number): string {
		const moduleUuid = this.userSelectedModule.get(userUuid)
		if (!moduleUuid) return ''

		const tallyBus = this.tally.find((t) => t.uuid === moduleUuid)
		if (!tallyBus) return ''

		const input = tallyBus.inputs?.[inputIndex]
		if (!input) return ''

		// Check if routed from camera
		if (input.routedFrom?.type === 'camera') {
			const camera = this.cameras.find((c) => c.uuid === input.routedFrom?.uuid)
			if (camera) return camera.name || input.customName || input.name || ''
		}

		return input.customName || input.name || ''
	}

	/**
	 * Get output label for a user's selected module
	 */
	getUserRouteOutputLabel(userUuid: string, outputIndex: number): string {
		const moduleUuid = this.userSelectedModule.get(userUuid)
		if (!moduleUuid) return ''

		const tallyBus = this.tally.find((t) => t.uuid === moduleUuid)
		if (!tallyBus) return ''

		const output = tallyBus.outputs?.[outputIndex]
		if (!output) return ''

		return output.customName || output.name || ''
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
