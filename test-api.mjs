import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { WebSocketServer } from 'ws'
import { IntegrationApi, ImageFeeds, reduceState, controlText, knownValue, stepLabel } from './dist/api.js'
import { GetConfigFields, localUrl } from './dist/config.js'

async function until(predicate, timeout = 3000) {
	const deadline = Date.now() + timeout
	while (!predicate()) {
		if (Date.now() > deadline) throw Error('Timed out')
		await new Promise((r) => setTimeout(r, 10))
	}
}

test('state reducer rejects revision gaps and replaces deleted collections on resync', () => {
	const initial = reduceState({}, 0, {
		apiVersion: '1.0-preview',
		type: 'snapshot',
		revision: 1,
		replace: { cameras: [{ uuid: 'a' }], users: [] },
	})
	assert.equal(initial.state.cameras[0].uuid, 'a')
	assert.equal(
		reduceState(initial.state, 1, {
			apiVersion: '1.0-preview',
			type: 'update',
			revision: 3,
			baseRevision: 2,
			replace: { cameras: [] },
		}),
		null,
	)
	const resync = reduceState(initial.state, 1, {
		apiVersion: '1.0-preview',
		type: 'snapshot',
		revision: 9,
		replace: { cameras: [] },
	})
	assert.deepEqual(resync.state, { cameras: [] })
	assert.equal(reduceState({}, 0, { apiVersion: '2.0', type: 'snapshot', revision: 1, replace: {} }), null)
})

test('image feedbacks share a rendition and release it after the final consumer', async () => {
	const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
	await once(server, 'listening')
	let connections = 0,
		closed = 0,
		authorized = false
	server.on('connection', (socket, request) => {
		connections++
		authorized = request.headers.authorization === 'Bearer test-token'
		socket.on('close', () => closed++)
		socket.on('message', () =>
			socket.send(
				JSON.stringify({
					type: 'frame',
					sourceId: 'test',
					capturedAtMs: Date.now(),
					image: 'data:image/jpeg;base64,/9j/2Q==',
				}),
			),
		)
	})
	const api = new IntegrationApi(
		`http://127.0.0.1:${server.address().port}`,
		'test-token',
		() => {},
		() => {},
	)
	const feeds = new ImageFeeds(
		() => api,
		() => {},
	)
	const profile = { sourceId: 'test', width: 160, height: 90, maxFps: 10, jpegQuality: 65 }
	try {
		assert.equal(feeds.value('one', profile), null)
		feeds.value('two', profile)
		await until(() => feeds.value('one', profile) !== null)
		assert.equal(connections, 1)
		assert.equal(authorized, true)
		for (const socket of server.clients)
			socket.send(
				JSON.stringify({
					type: 'frame',
					sourceId: 'test',
					capturedAtMs: Date.now() - 5000,
					image: 'data:image/jpeg;base64,/9j/2Q==',
				}),
			)
		await until(() => feeds.value('one', profile) === null)
		for (const socket of server.clients)
			socket.send(
				JSON.stringify({
					type: 'frame',
					sourceId: 'test',
					capturedAtMs: Date.now(),
					image: 'data:image/jpeg;base64,/9j/2Q==',
				}),
			)
		await until(() => feeds.value('one', profile) !== null)
		feeds.remove('one')
		assert.equal(closed, 0)
		assert.match(feeds.value('two', profile), /^data:image/)
		feeds.disconnect()
		assert.equal(feeds.value('two', profile), null)
		feeds.remove('two')
		await until(() => closed === 1)
	} finally {
		feeds.close()
		api.close()
		for (const client of server.clients) client.terminate()
		await new Promise((resolve) => server.close(resolve))
	}
})

test('a silent state connection loses readiness when heartbeat replies stop', async () => {
	const server = new WebSocketServer({ port: 0, host: '127.0.0.1', autoPong: false })
	await once(server, 'listening')
	let closed = false
	const api = new IntegrationApi(
		`http://127.0.0.1:${server.address().port}`,
		'fixture-token',
		() => {},
		() => {
			closed = true
		},
	)
	try {
		api.connect()
		await until(() => closed, 6500)
	} finally {
		api.close()
		for (const socket of server.clients) socket.terminate()
		await new Promise((r) => server.close(r))
	}
})

test('cloud credentials are cached and requests retain the project/instance prefix', async () => {
	const { cloudConnection } = await import('./dist/cloud.js')
	const originalFetch = globalThis.fetch
	const calls = []
	globalThis.fetch = async (url, options) => {
		calls.push({ url: String(url), body: JSON.parse(options.body) })
		return new Response(JSON.stringify({ access_token: 'temporary-token', expires_in: 300 }), { status: 200 })
	}
	try {
		const connection = cloudConnection('https://api.example.test', 'client', 'private-secret', 'project', 'instance')
		assert.deepEqual(await Promise.all([connection.token(), connection.token()]), [
			'temporary-token',
			'temporary-token',
		])
		assert.equal(calls.length, 1)
		assert.equal(calls[0].url, 'https://api.example.test/control/v1/oauth/token')
		assert.equal(await connection.token(), 'temporary-token')
		assert.equal(calls.length, 1)
		assert.throws(() => cloudConnection('http://api.example.test', 'a', 'b', 'c', 'd'), /HTTPS/)
		assert.equal(connection.url, 'https://api.example.test/control/v1/productions/project/instances/instance')
	} finally {
		globalThis.fetch = originalFetch
	}
	const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
	await once(server, 'listening')
	const incoming = once(server, 'connection')
	const prefix = '/control/v1/productions/project/instances/instance'
	const api = new IntegrationApi(
		`http://127.0.0.1:${server.address().port}${prefix}`,
		async () => 'temporary-token',
		() => {},
		() => {},
	)
	api.connect()
	const [socket, request] = await incoming
	assert.equal(request.url, prefix + '/api/v1/events')
	assert.equal(request.headers.authorization, 'Bearer temporary-token')
	api.close()
	socket.terminate()
	await new Promise((resolve) => server.close(resolve))
})

test('controller choices select at the current generation and show effective parent choices', async () => {
	const { controllerActions, controllerFeedbacks, controllerSelection } = await import('./dist/controllers.js')
	const state = {
		generation: 8,
		switchers: [
			{
				id: 'operator',
				name: 'Operator',
				selectedChoiceId: 'a',
				choices: [
					{ id: 'a', name: 'Studio A' },
					{ id: 'b', name: 'Studio B' },
				],
			},
		],
		assignments: [{ switcherId: 'operator', slotId: 'camera', effectiveChoiceId: 'b' }],
	}
	const key = JSON.stringify(['operator', 'b'])
	const sent = [],
		warnings = []
	const host = {
		connected: true,
		controllerSwitchers: state,
		command: (op) => sent.push(op),
		log: (_level, message) => warnings.push(message),
	}
	const actions = controllerActions(host),
		feedbacks = controllerFeedbacks(host)
	await actions.controller_select.callback({ options: { choice: key } })
	assert.deepEqual(sent[0], { type: 'controllerSelect', switcherId: 'operator', choiceId: 'b', expectedGeneration: 8 })
	assert.equal(feedbacks.controller_selected.callback({ options: { choice: key } }), true)
	assert.equal(
		feedbacks.controller_selected.callback({ options: { choice: JSON.stringify(['operator', 'a']) } }),
		false,
	)
	state.generation = 9
	await actions.controller_select.callback({ options: { choice: key } })
	assert.equal(sent[1].expectedGeneration, 9)
	host.connected = false
	assert.equal(feedbacks.controller_selected.callback({ options: { choice: key } }), false)
	await actions.controller_select.callback({ options: { choice: key } })
	assert.equal(sent.length, 2)
	for (const invalid of ['', 'bad-json', JSON.stringify(['operator', 'removed']), JSON.stringify(['operator']), 42])
		assert.equal(controllerSelection(state, invalid), null)
	assert.equal(controllerSelection(undefined, key), null)
	assert.equal(warnings.length, 1)
})

test('preset commands carry the current controller generation and fail closed without it', async () => {
	const { ModuleInstance } = await import('./dist/instance.js')
	const sent = [],
		warnings = []
	const host = {
		controllerSwitchers: { generation: 12 },
		command: (op) => sent.push(op),
		log: (_level, message) => warnings.push(message),
	}
	for (const operation of ['recall', 'store', 'clear']) {
		ModuleInstance.prototype.setProperty.call(host, 'logical-slot', `${operation}_preset`, 3)
		assert.deepEqual(sent.at(-1), {
			type: `preset${operation[0].toUpperCase() + operation.slice(1)}`,
			cameraId: 'logical-slot',
			kind: 'ptz',
			number: 3,
			expectedGeneration: 12,
		})
	}
	host.controllerSwitchers = undefined
	ModuleInstance.prototype.setProperty.call(host, 'logical-slot', 'recall_preset', 3)
	assert.equal(sent.length, 3)
	assert.equal(warnings.length, 1)
})

test('control text follows the camera definition: unknown readback, named steps, enums, units', () => {
	const base = { id: 'x', writable: true, behavior: 'absolute', resolvedCameraId: 'a', desired: null, unit: null }
	const gain = {
		...base,
		type: 'float',
		min: 0,
		max: 1,
		value: 0.41,
		actual: null,
		steps: [
			{ value: 0, label: '0 dB' },
			{ value: 0.4, label: '6 dB' },
			{ value: 1, label: '12 dB' },
		],
	}
	assert.equal(stepLabel(gain, 0.41), '6 dB')
	assert.equal(controlText(gain), '6 dB')
	// A control the device reports is unknown until it has reported, whatever the cache holds.
	const reported = { ...gain, readback: true }
	assert.equal(knownValue(reported), null)
	assert.equal(controlText(reported), null)
	assert.equal(controlText({ ...reported, actual: { value: 1, reportedAtMs: 1 }, value: 1 }), '12 dB')
	assert.equal(controlText({ ...base, type: 'float', min: 0, max: 1, value: 0.5, actual: null }), '50%')
	assert.equal(
		controlText({ ...base, type: 'float', min: 2000, max: 9000, value: 5600, actual: null, unit: 'K' }),
		'5600 K',
	)
	assert.equal(controlText({ ...base, type: 'enum', value: { index: 3, value: 'Auto' }, actual: null }), 'Auto')
	assert.equal(controlText({ ...base, type: 'boolean', value: true, actual: null }), 'On')
})

test('a discovered RCP is reached at its announced address, Manual at the typed one', () => {
	const manual = { host: '10.0.0.5', port: 5994, tls: true }
	assert.equal(localUrl({ ...manual, bonjourHost: '192.168.0.103:5995' }), 'http://192.168.0.103:5995')
	assert.equal(localUrl({ ...manual, bonjourHost: null }), 'https://10.0.0.5:5994')
	assert.equal(localUrl({ ...manual, tls: false }), 'http://10.0.0.5:5994')
	assert.throws(() => localUrl({ ...manual, bonjourHost: '192.168.0.103' }), /not host:port/)
	assert.throws(() => localUrl({ host: '', port: 5994 }), /Host and port are required/)

	const fields = GetConfigFields()
	const ids = fields.map((field) => field.id)
	assert.equal(fields.find((field) => field.id === 'bonjourHost')?.type, 'bonjour-device')
	assert.ok(ids.indexOf('bonjourHost') < ids.indexOf('host'), 'the picker comes before the manual address')
	for (const id of ['host', 'port', 'tls']) {
		assert.equal(fields.find((field) => field.id === id)?.isVisibleExpression, '!$(options:bonjourHost)')
	}
})
