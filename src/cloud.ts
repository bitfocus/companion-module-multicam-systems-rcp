/** Cloud credentials remain in Companion secrets; short-lived tokens stay in memory. */
export function cloudConnection(
	origin: string,
	clientId: string,
	clientSecret: string,
	projectId: string,
	instanceId: string,
): { url: string; token: () => Promise<string> } {
	const base = new URL(origin)
	if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/')
		throw Error('Cloud API URL must be an HTTPS origin')
	if (![clientId, clientSecret, projectId, instanceId].every((value) => value.trim()))
		throw Error('Cloud client credentials, project and instance are required')
	let current: { value: string; expiresAt: number } | null = null
	let pending: Promise<string> | null = null
	const token = async (): Promise<string> => {
		if (current && current.expiresAt > Date.now() + 10000) return current.value
		if (pending) return pending
		pending = (async () => {
			const response = await fetch(new URL('/control/v1/oauth/token', base), {
				method: 'POST',
				redirect: 'error',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
				signal: AbortSignal.timeout(5000),
			})
			if (!response.ok) throw Error(`Cloud authentication failed (${response.status})`)
			const body = (await response.json()) as { access_token?: string; expires_in?: number }
			if (!body.access_token || !Number.isFinite(body.expires_in) || body.expires_in! <= 0)
				throw Error('Invalid cloud token response')
			current = { value: body.access_token, expiresAt: Date.now() + body.expires_in! * 1000 }
			return current.value
		})().finally(() => {
			pending = null
		})
		return pending
	}
	return {
		url: `${base.origin}/control/v1/productions/${encodeURIComponent(projectId)}/instances/${encodeURIComponent(instanceId)}`,
		token,
	}
}
