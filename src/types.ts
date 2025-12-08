/**
 * Types for Multicam RCP Companion Module
 * Matching the websocket data structures from multicam-rcp
 */

// User type from server-user-handler.ts
export interface User {
	name: string
	uuid: string
	previewState: 'up' | 'down'
	previewedCameraUuid: string | null
	previewedSourceName: string | null
	excludedCameras?: string[]
	assignedCameras?: string[]
	hideNameTags?: boolean
	attachedVirtualCameraUuid?: string
	showVirtualCameraInMainView?: boolean
}

// Module settings format
export interface ModuleSettingsFormat {
	name: string
	type: string
	value: unknown
	options?: unknown[]
	default?: unknown
}

// Module status type
export type ModuleStatus = 'connected' | 'disconnected' | 'error' | 'connecting' | 'warning'

// Module type
export type ModuleType = 'cameraComponent' | 'standaloneComponent' | 'proxy' | 'helper' | 'api'

// Encoder/Recorder/Player types
export interface DeckOrEncoder {
	uuid: string
	name: string
	type: 'encoder' | 'recorder' | 'player'
	status: string
}

// Debug status
export interface DebugStatus {
	name: string
	value: string | number | boolean
}

// Log entry
export interface LogEntry {
	level: string
	message: string
	timestamp: string
}

// Controls remapping
export interface ControlsReMapping {
	[key: string]: string
}

// Multiviewer layout
export interface MultiviewerLayout {
	[key: string]: unknown
}

// Websocket modules send structure
export interface WebsocketModulesSend {
	name: string
	cameraUuid: string
	moduleUuid: string
	friendlyname: string
	settings: ModuleSettingsFormat[]
	status: ModuleStatus
	customName: string | null
	debugStatuses: DebugStatus[]
	globalUuid: string | null
	moduleType: ModuleType
	log: LogEntry[]
	initialized: boolean
	controlsReMapping: ControlsReMapping
	decksAndEncoders: DeckOrEncoder[]
	multiviewers: MultiviewerLayout
}

// Camera model properties
export interface CameraModelProperties {
	uuid: string
	controls: string[]
	controlProperties: Record<string, ControlProperty>
}

// Control property types
export interface ControlProperty {
	type: 'float' | 'string' | 'enum' | 'boolean' | 'integer'
	group: string
	display_name: string
	min?: number
	max?: number
	precision?: number
	default?: unknown
	values?: EnumValue[]
	control_type?: string
	boolean_type?: 'toggle' | 'trigger'
}

// Enum value structure (new format with value.index and value.value)
export interface EnumValue {
	index: number
	value: string | number
}

// Virtual OSD state
export interface VirtualOSDState {
	enabled: boolean
	[key: string]: unknown
}

// Websocket cameras output structure
export interface WebsocketCamerasOutput {
	uuid: string
	modules: {
		outputs: { property: string; module: string }[]
	}
	assignedModules: {
		name: string
		cameraUuid: string
		moduleUuid: string
		friendlyname: string
		settings: ModuleSettingsFormat[]
		status: ModuleStatus
		globalUuid: string | null
		moduleType: ModuleType
		decksAndEncoders: DeckOrEncoder[]
	}[]
	model_descriptor: CameraModelProperties
	name: string
	id: number
	virtualCameraEnable: boolean
	virtualCameraUUID: string
	liveCameraFeed?: string
	assignedModuleControlProperties: string[]
	cameraControlProperties: Record<string, ControlProperty>
	virtualOSDState: VirtualOSDState
}

// Tally structures from tally-controller.ts
export interface IRoutedFrom {
	type: 'camera' | 'module' | 'label' | 'virtualBus' | 'userFallback'
	uuid: string | null
	outputOnOtherModule: number
}

export interface IModuleTallyBusGroup {
	name: string
	priority?: number
	color?: string
}

export interface IModuleTallyBusInput {
	routedFrom: IRoutedFrom | null
	name: string
	customName?: string
	prefix?: string
	routable: boolean
	autoRename?: boolean
	uuid?: string
	groups?: IModuleTallyBusGroup[]
	hasUMD: boolean
}

export interface IModuleTallyBusOutput {
	name: string
	customName?: string
	routedInput: {
		inputObject: IModuleTallyBusInput
		number: number
	} | null
	tallyColor: TallyColor | null
	tallyPriority: number
	multiInput?: {
		multiInputSources?: number[]
		multiInputMapping?: Record<number, number>
	}
	internal?: boolean
	active: boolean
	routable: boolean
	linkedToOtherOutputs: {
		uuid: string
		outputOnOtherModule: number
	}[]
	extraData?: unknown
	groups?: IModuleTallyBusGroup[]
}

export interface IModuleTallyBuses {
	name?: string
	type: 'module' | 'user' | 'virtualCamera' | 'virtualBus'
	uuid: string
	inputs: Record<number, IModuleTallyBusInput>
	outputs: Record<number, IModuleTallyBusOutput>
	extraData: unknown
	subBuses?: Record<string, IModuleTallyBuses>
}

// Tally color type
export type TallyColor = 'off' | 'red' | 'green' | 'blue' | 'yellow' | 'purple'

// Camera tally object structure
export interface CameraTallyState {
	[cameraUuid: string]: {
		color: TallyColor
		priority: number
	}
}

// Property value can be various types
export type PropertyValue = number | string | boolean | EnumValue | null
