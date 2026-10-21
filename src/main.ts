import { cloudConnection } from './cloud.js'
import {
	InstanceBase,
	type InstanceTypes,
	InstanceStatus,
	type SomeCompanionConfigField,
	type DropdownChoice,
} from '@companion-module/base'
import { type ModuleConfig, type ModuleSecrets, GetConfigFields } from './config.js'
import { UpdateVariableDefinitions, UpdateVariableValues } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import {
	IntegrationApi,
	ImageFeeds,
	type State as ApiState,
	type Camera as ApiCamera,
	type VideoSource,
	type Control,
	type ControllerState,
	type Tracing,
	Presentation,
} from './api.js'
import type { BankId } from './deck.js'
import type {
	WebsocketCamerasOutput,
	User,
	IModuleTallyBuses,
	WebsocketModulesSend,
	TallyColor,
	PropertyValue,
} from './types.js'

export type ModuleTypes = InstanceTypes & { config: ModuleConfig; secrets: ModuleSecrets }

export class ModuleInstance extends InstanceBase<ModuleTypes> {
	variableIds: string[] = []
	config!: ModuleConfig
	secrets: ModuleSecrets = {}

	// WebSocket connection
	api: IntegrationApi | null = null
	connected = false
	apiCameras: ApiCamera[] = []
	presentation: Partial<Presentation> | undefined
	controllerSwitchers: ControllerState | undefined
	videoSources: VideoSource[] = []
	images = new ImageFeeds(
		() => (this.connected && this.config.connection !== 'cloud' ? this.api : null),
		() => this.checkFeedbacks('live_image'),
	)
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
	/** Stream Deck + control bank per user (see deck.ts). */
	userBanks: Map<string, BankId> = new Map()

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

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets || {}
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

		this.api?.close()
		this.images.close()
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets || {}
		this.initWebSocket()
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
				this.checkFeedbacks(Array.from(this.pendingFeedbacks)[0], ...Array.from(this.pendingFeedbacks).slice(1))
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
		if (this.reconnect_timer) clearTimeout(this.reconnect_timer)
		this.api?.close()
		this.api = null
		this.connected = false
		this.images.disconnect()
		this.setVariableValues(Object.fromEntries(this.variableIds.map((id) => [id, null])))
		this.propertyValues.clear()
		this.apiCameras = []
		this.controllerSwitchers = undefined
		this.cameras = []
		this.videoSources = []
		this.users = []
		this.tally = []
		this.checkAllFeedbacks()
		this.scheduleVariableUpdate()
		let url: string
		let token: string | (() => Promise<string>)
		try {
			if (this.config.connection === 'cloud') {
				const cloud = cloudConnection(
					this.config.cloudUrl || 'https://api.cloud.multicam.systems',
					this.config.cloudClientId || '',
					this.secrets.cloudClientSecret || '',
					this.config.cloudProjectId || '',
					this.config.cloudInstanceId || '',
				)
				url = cloud.url
				token = cloud.token
			} else {
				// A local RCP accepts callers on its own machine without a token unless
				// token enforcement was switched on there; the token is optional here.
				if (!this.config.host || !this.config.port) throw Error('Host and port are required')
				url = `${this.config.tls ? 'https' : 'http'}://${this.config.host}:${this.config.port}`
				token = this.secrets.token ?? ''
			}
		} catch (error) {
			this.updateStatus(
				InstanceStatus.BadConfig,
				error instanceof Error ? error.message : 'Invalid connection settings',
			)
			return
		}
		this.updateStatus(InstanceStatus.Connecting)
		const api = new IntegrationApi(
			url,
			token,
			(state) => {
				if (this.api === api) this.applyApiState(state)
			},
			() => {
				if (this.api !== api) return
				this.connected = false
				this.images.disconnect()
				this.propertyValues.clear()
				this.invalidateTallyCache()
				this.checkAllFeedbacks()
				this.scheduleVariableUpdate()
				this.updateStatus(InstanceStatus.ConnectionFailure, 'API disconnected; verify host, token and project access')
				this.maybeReconnect()
			},
		)
		this.api = api
		api.connect()
	}

	applyApiState(state: ApiState): void {
		// Only structure goes into the hash. A camera switch changes which camera a virtual
		// camera resolves to, what a user previews and a source's status; none of that changes
		// the presets, and a rebuild makes Companion re-ingest and re-render every preset.
		const topology = JSON.stringify([
			state.cameras?.map((c) => [
				c.uuid,
				c.name,
				c.videoSourceId ?? null,
				c.controls.map(
					({ value: _value, actual: _actual, desired: _desired, resolvedCameraId: _resolved, ...control }) => control,
				),
			]),
			(state.users as { uuid: string; name: string; attachedVirtualCameraUuid?: string }[] | undefined)?.map((u) => [
				u.uuid,
				u.name,
				u.attachedVirtualCameraUuid ?? null,
			]),
			state.routing?.map((bus) => {
				const b = bus as IModuleTallyBuses
				return [
					b.uuid,
					b.name,
					Object.entries(b.inputs ?? {}).map(([id, p]) => [id, p.name, p.customName]),
					Object.entries(b.outputs ?? {}).map(([id, p]) => [id, p.name, p.customName]),
				]
			}),
			state.videoSources?.map((v) => [v.id, v.name ?? null, v.type]),
			state.presentation,
			state.controllerSwitchers?.switchers.map(({ selectedChoiceId: _selection, ...definition }) => definition),
		])
		const changed = this.lastTopology !== topology
		this.lastTopology = topology
		this.connected = true
		this.updateStatus(InstanceStatus.Ok)
		this.apiCameras = state.cameras ?? []
		this.presentation = state.presentation
		this.controllerSwitchers = state.controllerSwitchers
		this.videoSources = this.config.connection === 'cloud' ? [] : (state.videoSources ?? [])
		this.cameras = this.apiCameras.map((camera) => ({
			...camera,
			assignedModuleControlProperties: camera.controls.map((c) => c.id),
		})) as unknown as WebsocketCamerasOutput[]
		this.users = (state.users ?? []) as User[]
		this.tally = (state.routing ?? []) as IModuleTallyBuses[]
		this.propertyValues.clear()
		this.apiCameras.forEach((camera, index) => {
			for (const control of camera.controls)
				this.propertyValues.set(`camera_${index}_${control.id}`, control.value as PropertyValue)
			this.propertyValues.set(`camera_${index}_tally`, camera.tally as PropertyValue)
		})
		this.invalidateTallyCache()
		this.scheduleVariableUpdate()
		this.checkAllFeedbacks()
		if (changed) {
			this.updateCameraChoices()
			this.updatePropertyChoices()
			this.updateModuleChoices()
			this.userChoices = this.users.map((u) => ({ id: u.uuid, label: u.name }))
			this.updateVariableDefinitions()
			this.scheduleUiRebuild()
		}
	}
	private lastTopology = ''
	control(cameraId: string, controlId: string): Control | undefined {
		return this.apiCameras.find((c) => c.uuid === cameraId)?.controls.find((c) => c.id === controlId)
	}
	command(operation: Record<string, unknown>): void {
		if (!this.connected || !this.api) {
			this.log('warn', 'Not connected')
			return
		}
		void this.api
			.command(operation)
			.catch((error) => this.log('warn', error instanceof Error ? error.message : 'Command failed'))
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
		return this.apiCameras.some((c) => c.controls.some((v) => v.id === prop && v.type === 'boolean'))
	}

	/**
	 * Check if a property is likely an enum based on naming convention
	 */
	isEnumProperty(prop: string): boolean {
		return this.apiCameras.some((c) => c.controls.some((v) => v.id === prop && v.type === 'enum'))
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
		const preset = /^(recall|store|clear)_preset(?:_(scene|tracing))?$/.exec(property)
		if (preset) {
			const expectedGeneration = this.controllerSwitchers?.generation
			if (!Number.isSafeInteger(expectedGeneration)) {
				this.log('warn', 'Controller assignment state unavailable')
				return
			}
			this.command({
				expectedGeneration,
				type: ({ recall: 'presetRecall', store: 'presetStore', clear: 'presetClear' } as Record<string, string>)[
					preset[1]
				],
				cameraId: cameraUuid,
				kind: preset[2] || 'ptz',
				// The RCP's own preset numbers: its "Preset 1" is number 1.
				number: Number(value),
			})
			return
		}
		const control = this.control(cameraUuid, property)
		if (!control?.writable || !control.resolvedCameraId) {
			this.log('warn', 'Control unavailable')
			return
		}
		this.command({
			type: 'controlSet',
			cameraId: cameraUuid,
			controlId: property,
			value,
			expectedCameraId: control.resolvedCameraId,
		})
	}
	/** Ends the camera's tracing playback (or calibration/scan) and stops the head. */
	tracingStop(cameraUuid: string): void {
		this.command({ type: 'tracingStop', cameraId: cameraUuid })
	}

	/** The camera's tracing activity as the RCP last reported it. */
	getCameraTracing(cameraUuid: string): Tracing | undefined {
		return this.apiCameras.find((c) => c.uuid === cameraUuid)?.tracing
	}

	private stepProperty(
		cameraUuid: string,
		property: string,
		direction: number,
		substep: boolean,
		bigstep: boolean,
	): void {
		const control = this.control(cameraUuid, property)
		if (!control?.writable || !control.resolvedCameraId) {
			this.log('warn', 'Control unavailable')
			return
		}
		this.command({
			type: 'controlAdjust',
			cameraId: cameraUuid,
			controlId: property,
			direction,
			step: substep ? 'small' : bigstep ? 'big' : 'normal',
			expectedCameraId: control.resolvedCameraId,
		})
	}
	increaseProperty(cameraUuid: string, property: string, substep = false, bigstep = false): void {
		this.stepProperty(cameraUuid, property, 1, substep, bigstep)
	}
	decreaseProperty(cameraUuid: string, property: string, substep = false, bigstep = false): void {
		this.stepProperty(cameraUuid, property, -1, substep, bigstep)
	}
	setRoute(moduleUuid: string, sourceIndex: number, destinationIndex: number): void {
		this.command({ type: 'routeSet', busId: moduleUuid, input: sourceIndex, output: destinationIndex })
	}

	/**
	 * Get user's step size preference (defaults to 'normal')
	 */
	getUserBank(userUuid: string): BankId {
		return this.userBanks.get(userUuid) ?? 'gain'
	}
	setUserBank(userUuid: string, bank: BankId): void {
		if (!userUuid) return
		this.userBanks.set(userUuid, bank)
		this.checkFeedbacks(
			'deck_bank_active',
			'deck_slot_value',
			'deck_slot_min',
			'deck_slot_max',
			'deck_slot_name',
			'deck_slot_text',
		)
	}
	/** The switcher feeding a user's virtual camera, whose choices are the user's cameras. */
	userSwitcher(userUuid: string): ControllerState['switchers'][number] | undefined {
		const user = this.users.find((u) => u.uuid === userUuid)
		const virtualCamera = user?.attachedVirtualCameraUuid
			? this.apiCameras.find((c) => c.uuid === user.attachedVirtualCameraUuid)
			: undefined
		const slot = virtualCamera?.controllerSwitcherSlot
		if (slot) return this.controllerSwitchers?.switchers.find((s) => s.id === slot.switcherId)
		return this.controllerSwitchers?.switchers.find((s) => s.ownerUserId === userUuid)
	}
	/** The real camera a user is on right now: the switcher's effective choice, else the preview. */
	userSelectedCameraUuid(userUuid: string): string | undefined {
		const user = this.users.find((u) => u.uuid === userUuid)
		const virtualCamera = user?.attachedVirtualCameraUuid
			? this.apiCameras.find((c) => c.uuid === user.attachedVirtualCameraUuid)
			: undefined
		const slot = virtualCamera?.controllerSwitcherSlot
		if (slot) {
			const assignment = this.controllerSwitchers?.assignments.find(
				(a) => a.switcherId === slot.switcherId && a.slotId === slot.slotId,
			)
			if (assignment?.target?.type === 'camera') return assignment.target.cameraId
		}
		const previewed = (user as { previewedCameraUuid?: string } | undefined)?.previewedCameraUuid
		return previewed || user?.attachedVirtualCameraUuid || undefined
	}
	/** The video source that shows a camera, when the RCP links one. */
	videoSourceForCamera(cameraUuid: string): string | undefined {
		return this.apiCameras.find((c) => c.uuid === cameraUuid)?.videoSourceId || undefined
	}
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

export default ModuleInstance
export { UpgradeScripts }
