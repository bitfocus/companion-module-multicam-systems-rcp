import WebSocket, { type RawData } from 'ws'
import { randomUUID } from 'node:crypto'

function text(data: RawData): string {
	return (Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)).toString('utf8')
}

export interface Control {
	id: string
	name?: string
	type: string
	group?: string
	min?: number
	max?: number
	step?: number
	choices?: unknown[]
	/** Named steps of a numeric control, ascending: the camera takes the step nearest a written value. */
	steps?: { value: number; label: string }[]
	enumType?: string
	allowCustomValue?: boolean
	unit?: string | null
	/** `setup`: the control configures the device rather than the picture. */
	class?: string
	/** The device reports this control: until `actual` holds a value, the value is not known. */
	readback?: boolean
	/** Why the device does not take the control now; not writable while present. */
	unavailable?: string
	desired?: { behavior: string; value: unknown } | null
	writable: boolean
	behavior: string
	resolvedCameraId: string | null
	value: unknown
	actual: { value: unknown; reportedAtMs: number } | null
}

/** The value to show: null while a control the device reports has not reported yet. */
export function knownValue(control: Control): unknown {
	return control.readback && !control.actual ? null : control.value
}

/** A control's number, from a plain number or an `{ index, value }` enum entry. */
export function numberOf(raw: unknown): number | null {
	const value = typeof raw === 'number' ? raw : raw && typeof raw === 'object' && 'value' in raw ? raw.value : null
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The label of the named step nearest a value, when the control has named steps. */
export function stepLabel(control: Control, value: number): string | undefined {
	let best: { value: number; label: string } | undefined
	for (const step of control.steps ?? [])
		if (!best || Math.abs(step.value - value) < Math.abs(best.value - value)) best = step
	return best?.label
}

/**
 * The value as an operator reads it: a named step's label, an enum entry's value, percent
 * for 0–1 numbers, otherwise the number with its unit. Null while unknown.
 */
export function controlText(control: Control): string | null {
	const raw = knownValue(control)
	if (raw === null || raw === undefined) return null
	if (typeof raw === 'boolean') return raw ? 'On' : 'Off'
	if (typeof raw === 'object' && 'value' in raw) return String(raw.value)
	const value = numberOf(raw)
	if (value === null) return typeof raw === 'string' ? raw : null
	const label = stepLabel(control, value)
	if (label !== undefined) return label
	const min = control.min ?? 0
	const max = control.max ?? 1
	if (min === 0 && max === 1) return `${Math.round(value * 100)}%`
	const decimals = Number.isInteger(min) && Number.isInteger(max) && max - min >= 10 ? 0 : 2
	return `${value.toFixed(decimals)}${control.unit ? ' ' + control.unit : ''}`
}
export interface Camera {
	uuid: string
	name: string
	id: number
	displayName: string
	virtualCameraEnable: boolean
	controllerSwitcherSlot?: { switcherId: string; slotId: string }
	/** The video engine source that shows this camera, when the RCP links one. */
	videoSourceId?: string | null
	controls: Control[]
	tally: unknown
	presets: { kind: string; number: number; name: string | null }[]
	/** The camera's tracing (recorded PTZ path) activity; absent on older RCPs. */
	tracing?: Tracing
	/** 3D Tracing Follow: the camera points where a leader's centre of picture meets a surface. */
	follow?: Follow
}
export type FollowZoom = { mode: 'frameWidth'; frameWidthM: number } | { mode: 'matchLeader' } | { mode: 'off' }
export interface Follow {
	status: 'idle' | 'following'
	leaderId?: string
	/** Null: the level ground at a height. */
	surfaceId?: string | null
	zoom?: FollowZoom
	/** False while the leader looks past the surface and the last range is kept. */
	onSurface?: boolean | null
}
export interface Tracing {
	status: 'idle' | 'recording' | 'playing' | 'calibrating' | 'scanning'
	presetNumber: number | null
	/** While playing: the head is still on its way to the path's start. */
	arriving?: boolean
	paused?: boolean
	progressMode?: 'timed' | 'operator'
	/** While playing: 0–1 along the path. */
	progress?: number
	remainingMs?: number
}
export interface VideoSource {
	id: string
	name?: string
	type: string
}
export type ControlKind = 'camera' | 'vision' | 'audio' | 'companion'
export type ControlTarget =
	| { type: 'camera'; cameraId: string }
	| { type: 'vision'; moduleId: string; busId: string; programOutput: number; previewOutput: number }
	| { type: 'audio'; moduleId: string; busId: string }
	| { type: 'companion'; moduleId: string }
	| { type: 'switcher'; switcherId: string; slotId: string; choiceId?: string }
export interface ControllerState {
	generation: number
	switchers: {
		id: string
		name: string
		ownerUserId?: string
		virtualCameraMode: boolean
		embedded: boolean
		slots: { id: string; name: string; kind: ControlKind; optional: boolean; controllerModuleIds: string[] }[]
		choices: { id: string; name: string; targets: Record<string, ControlTarget | null> }[]
		selectedChoiceId: string
	}[]
	assignments: {
		switcherId: string
		slotId: string
		effectiveChoiceId: string
		kind: ControlKind
		generation: number
		target: ControlTarget | null
		path: string[]
		controllerModuleIds: string[]
		optional: boolean
		readiness: { assigned: boolean; controllers: { id: string; status: string | null }[] }
	}[]
}
export interface State {
	controllerSwitchers?: ControllerState
	cameras?: Camera[]
	users?: unknown[]
	routing?: unknown[]
	videoSources?: VideoSource[]
	/** Setup → Companion buttons on the RCP: preset style and what to offer. */
	presentation?: Partial<Presentation>
}
export interface Presentation {
	version: 1
	theme: 'rings' | 'bars' | 'plain'
	accent: 'group' | 'single' | 'mono'
	accentColor: string
	topBar: boolean
	/** Multiplier for every text size on the tiles (0.7–1.6). */
	textScale: number
	hiddenCameras: string[]
	hiddenModules: string[]
}
export interface ImageProfile {
	sourceId: string
	width: number
	height: number
	maxFps: number
	jpegQuality: number
}
export interface Frame {
	type: 'frame'
	sourceId: string
	sourceRevision: string
	sequence: number
	capturedAtMs: number
	width: number
	height: number
	image: string
}

export function reduceState(
	current: State,
	revision: number,
	message: unknown,
): { state: State; revision: number } | null {
	if (!message || typeof message !== 'object') return null
	const m = message as { apiVersion?: string; type?: string; revision?: number; baseRevision?: number; replace?: State }
	if (m.apiVersion !== '1.0-preview' || !m.replace || !Number.isSafeInteger(m.revision)) return null
	if (m.type !== 'snapshot' && (m.type !== 'update' || m.baseRevision !== revision)) return null
	return { state: { ...(m.type === 'snapshot' ? {} : current), ...m.replace }, revision: m.revision! }
}

export class IntegrationApi {
	private socket: WebSocket | null = null
	private revision = 0
	private state: State = {}
	private closed = false
	private heartbeat: NodeJS.Timeout | null = null
	private requests = new Set<AbortController>()
	constructor(
		readonly url: string,
		private token: string | (() => Promise<string>),
		private onState: (state: State) => void,
		private onClose: () => void,
	) {}
	private currentToken = ''
	private async accessToken(): Promise<string> {
		return typeof this.token === 'string' ? this.token : this.token()
	}
	connect(): void {
		void this.open().catch(() => {
			if (!this.closed) this.onClose()
		})
	}
	private async open(): Promise<void> {
		this.currentToken = await this.accessToken()
		if (this.closed) return
		this.socket = this.webSocket('/api/v1/events')
		const socket = this.socket
		let lastPong = Date.now()
		socket.on('pong', () => {
			lastPong = Date.now()
		})
		socket.on('open', () => {
			lastPong = Date.now()
			this.heartbeat = setInterval(() => {
				if (Date.now() - lastPong > 4000) {
					socket.terminate()
					return
				}
				if (socket.readyState === WebSocket.OPEN) socket.ping()
			}, 1000)
		})
		this.socket.on('message', (data) => {
			try {
				const next = reduceState(this.state, this.revision, JSON.parse(text(data)))
				if (!next) {
					this.socket?.send(JSON.stringify({ type: 'resync' }))
					return
				}
				this.state = next.state
				this.revision = next.revision
				this.onState(this.state)
			} catch {
				this.socket?.close()
			}
		})
		this.socket.on('error', () => this.socket?.close())
		this.socket.on('close', () => {
			if (this.heartbeat) clearInterval(this.heartbeat)
			this.heartbeat = null
			if (!this.closed) this.onClose()
		})
	}
	private authHeaders(token: string): Record<string, string> {
		return token ? { Authorization: `Bearer ${token}` } : {}
	}
	webSocket(path: string): WebSocket {
		const token = this.currentToken || (typeof this.token === 'string' ? this.token : '')
		return new WebSocket(new URL(this.url.replace(/^http/, 'ws').replace(/\/$/, '') + path), {
			headers: this.authHeaders(token),
			maxPayload: 4 * 1024 * 1024,
			handshakeTimeout: 5000,
		})
	}
	async command(operation: Record<string, unknown>): Promise<void> {
		const abort = new AbortController()
		this.requests.add(abort)
		const timeout = setTimeout(() => abort.abort(), 3000)
		try {
			const token = await this.accessToken()
			if (this.closed) throw Error('Connection closed')
			const response = await fetch(new URL(this.url.replace(/\/$/, '') + '/api/v1/commands'), {
				method: 'POST',
				headers: { ...this.authHeaders(token), 'Content-Type': 'application/json' },
				body: JSON.stringify({ requestId: randomUUID(), sentAtMs: Date.now(), ttlMs: 2000, operation }),
				signal: abort.signal,
			})
			const result = (await response.json()) as { status?: string; error?: { message?: string }; errorCode?: string }
			if (!response.ok || result.status === 'rejected')
				throw new Error(result.error?.message || result.errorCode || `Command rejected (${response.status})`)
		} finally {
			clearTimeout(timeout)
			this.requests.delete(abort)
		}
	}
	close(): void {
		this.closed = true
		if (this.heartbeat) clearInterval(this.heartbeat)
		this.heartbeat = null
		this.socket?.terminate()
		this.socket = null
		for (const request of this.requests) request.abort()
		this.requests.clear()
	}
}

/** Latest-frame cache with one socket per rendition, released by the final feedback. */
export class ImageFeeds {
	private feeds = new Map<
		string,
		{
			profile: ImageProfile
			socket?: WebSocket
			image: string | null
			lastFrame: number
			retryAt: number
			refs: Set<string>
		}
	>()
	private subscriptions = new Map<string, string>()
	private timer: NodeJS.Timeout
	constructor(
		private api: () => IntegrationApi | null,
		private changed: () => void,
	) {
		this.timer = setInterval(() => {
			for (const feed of this.feeds.values()) {
				if (feed.image && Date.now() - feed.lastFrame > 2000) {
					feed.image = null
					this.changed()
				}
				if (feed.socket && Date.now() - feed.lastFrame > 15000) feed.socket.terminate()
				if (!feed.socket && Date.now() >= feed.retryAt) this.start(feed)
			}
		}, 500)
	}
	value(id: string, profile: ImageProfile): string | null {
		const key = JSON.stringify(profile)
		if (this.subscriptions.get(id) !== key) {
			this.remove(id)
			this.subscriptions.set(id, key)
			let feed = this.feeds.get(key)
			if (!feed) {
				feed = { profile, image: null, lastFrame: 0, retryAt: 0, refs: new Set() }
				this.feeds.set(key, feed)
			}
			feed.refs.add(id)
			this.start(feed)
		}
		return this.feeds.get(key)?.image ?? null
	}
	private start(feed: {
		profile: ImageProfile
		socket?: WebSocket
		image: string | null
		lastFrame: number
		retryAt: number
		refs: Set<string>
	}): void {
		const api = this.api()
		if (!api || feed.socket || Date.now() < feed.retryAt) return
		const socket = api.webSocket('/api/v1/images/live')
		feed.socket = socket
		feed.lastFrame = Date.now()
		socket.on('open', () => socket.send(JSON.stringify(feed.profile)))
		socket.on('message', (data) => {
			if (feed.socket !== socket) return
			try {
				const frame = JSON.parse(text(data)) as Frame
				if (
					frame.type !== 'frame' ||
					frame.sourceId !== feed.profile.sourceId ||
					!frame.image.startsWith('data:image/jpeg;base64,')
				) {
					socket.close()
					return
				}
				if (
					!Number.isFinite(frame.capturedAtMs) ||
					Date.now() - frame.capturedAtMs > 2000 ||
					frame.capturedAtMs > Date.now() + 1000
				) {
					feed.image = null
					this.changed()
					return
				}
				feed.image = frame.image
				feed.lastFrame = Date.now()
				this.changed()
			} catch {
				socket.close()
			}
		})
		socket.on('error', () => socket.close())
		socket.on('close', () => {
			if (feed.socket !== socket) return
			feed.socket = undefined
			feed.image = null
			feed.retryAt = Date.now() + 5000
			this.changed()
		})
	}
	remove(id: string): void {
		const key = this.subscriptions.get(id)
		if (!key) return
		this.subscriptions.delete(id)
		const feed = this.feeds.get(key)
		if (!feed) return
		feed.refs.delete(id)
		if (feed.refs.size === 0) {
			this.feeds.delete(key)
			feed.socket?.terminate()
			feed.socket = undefined
		}
	}
	disconnect(): void {
		for (const feed of this.feeds.values()) {
			const socket = feed.socket
			feed.socket = undefined
			socket?.terminate()
			feed.image = null
			feed.retryAt = 0
		}
		this.changed()
	}
	close(): void {
		clearInterval(this.timer)
		this.disconnect()
		this.feeds.clear()
		this.subscriptions.clear()
	}
}
