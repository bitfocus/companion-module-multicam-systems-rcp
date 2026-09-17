#!/usr/bin/env tsx
/**
 * Design gallery: renders every preset this module publishes, through the
 * running Companion's own renderer, into one HTML page.
 *
 * Companion draws presets with live variables and feedbacks from the connected
 * RCP, so the page shows exactly what an operator gets on a Stream Deck. Run
 * Companion (`yarn dev` in the Companion checkout, admin on port 8000) with this
 * module loaded and connected, then:
 *
 *   yarn design:gallery                 # writes tools/design-gallery/out/index.html
 *   yarn design:gallery --label iris-0  # a named pass, e.g. after changing a value
 *   yarn design:gallery --filter rotary # only presets whose id or name matches
 *   yarn design:gallery --mode preset   # Companion's preset preview instead of a real button
 *
 * The default mode places each preset on a scratch page (added at the end and
 * removed afterwards) and renders that button, so local variables and
 * feedbacks behave exactly as on a placed button. Passes with different labels
 * are listed side by side, so a control can be compared at several live
 * states (set the value on the RCP between passes).
 */
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type PresetDefinition = { id: string; order: number; label: string }
type PresetGroup =
	| { type: 'simple'; id: string; name: string; order: number; presets: Record<string, PresetDefinition> }
	| {
			type: 'template'
			id: string
			name: string
			order: number
			definition: PresetDefinition
			templateVariableName: string
			templateValues: { label: string | null; value?: unknown }[]
			commonVariableValues: Record<string, unknown> | null
	  }
type PresetSection = { id: string; name: string; order: number; definitions: Record<string, PresetGroup> }
type PresetSections = { supportsReferences: boolean; sections: Record<string, PresetSection> }
type Location = { pageNumber: number; row: number; column: number }

interface Rendered {
	id: string
	presetId: string
	section: string
	group: string
	label: string
	variableValues: Record<string, unknown> | null
	image: string | null
	error?: string
}

const args = process.argv.slice(2)
const option = (name: string, fallback: string): string => {
	const index = args.indexOf(`--${name}`)
	return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const url = option('url', 'ws://127.0.0.1:8000/trpc')
const label = option('label', 'live')
const mode = option('mode', 'location') as 'location' | 'preset'
const filter = args.includes('--filter') ? new RegExp(option('filter', '.'), 'i') : null
const templateSamples = Number(option('template-samples', '3'))
const workers = Number(option('workers', '4'))
const size = 288
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'design-gallery', 'out')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client: any = createTRPCClient({ links: [wsLink({ client: createWSClient({ url }) })] })

/** Collects frames from a subscription until they stop arriving, then returns the last one. */
function settled<T>(
	subscribe: (onData: (value: T) => void, onError: (error: unknown) => void) => { unsubscribe(): void },
	accept: (value: T) => boolean,
	quietMs: number,
	timeoutMs: number,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let done = false
		let last: T | undefined
		let quiet: NodeJS.Timeout | null = null
		const finish = (fn: () => void) => {
			if (done) return
			done = true
			clearTimeout(timer)
			if (quiet) clearTimeout(quiet)
			setTimeout(() => sub.unsubscribe(), 0)
			fn()
		}
		const timer = setTimeout(() => finish(() => (last !== undefined ? resolve(last) : reject(new Error(`timed out after ${timeoutMs} ms`)))), timeoutMs)
		const sub = subscribe(
			(value) => {
				if (!accept(value)) return
				last = value
				if (quiet) clearTimeout(quiet)
				quiet = setTimeout(() => finish(() => resolve(last as T)), quietMs)
			},
			(error) => finish(() => reject(error instanceof Error ? error : new Error(String(error)))),
		)
	})
}

async function presetSections(): Promise<Record<string, PresetSections>> {
	const init = await settled<{ type: string; definitions?: Record<string, PresetSections> }>(
		(onData, onError) => client.instances.definitions.presets.subscribe(undefined, { onData, onError }),
		(update) => update.type === 'init',
		0,
		10_000,
	)
	return init.definitions ?? {}
}

async function pageCount(): Promise<number> {
	const init = await settled<{ type: string; order?: string[] }>(
		(onData, onError) => client.pages.watch.subscribe(undefined, { onData, onError }),
		(update) => update.type === 'init',
		0,
		10_000,
	)
	return init.order?.length ?? 1
}

async function renderPresetPreview(connectionId: string, presetId: string, variableValues: Record<string, unknown> | null): Promise<string> {
	return settled<string | null>(
		(onData, onError) => client.preview.graphics.preset.subscribe({ connectionId, presetId, variableValues }, { onData, onError }),
		(image) => !!image,
		500,
		3_000,
	).then((image) => image as string)
}

async function renderAtLocation(connectionId: string, presetId: string, variableValues: Record<string, unknown> | null, location: Location): Promise<string> {
	// The reset's deletion lands asynchronously; the import refuses an occupied location, so retry briefly.
	let placed: unknown = null
	for (let attempt = 0; attempt < 20 && !placed; attempt++) {
		await client.controls.resetControls.mutate({ locations: [location], newType: null })
		await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 20 : 100))
		placed = await client.controls.importPreset.mutate({ connectionId, presetId, location, variableValues, mode: 'copy' })
	}
	if (!placed) throw new Error('import failed')
	try {
		const frame = await settled<{ image?: string | null; isUsed?: boolean }>(
			(onData, onError) => client.preview.graphics.location.subscribe({ location, size: { width: size, height: size } }, { onData, onError }),
			(wrapped) => !!wrapped?.image,
			500,
			3_000,
		)
		return frame.image as string
	} finally {
		await client.controls.resetControls.mutate({ locations: [location], newType: null })
	}
}

async function main(): Promise<void> {
	const all = await presetSections()
	const jobs: { connectionId: string; section: string; group: string; presetId: string; label: string; variableValues: Record<string, unknown> | null }[] = []
	for (const [connectionId, sections] of Object.entries(all)) {
		for (const section of Object.values(sections.sections).sort((a, b) => a.order - b.order)) {
			for (const group of Object.values(section.definitions).sort((a, b) => a.order - b.order)) {
				if (group.type === 'simple') {
					for (const preset of Object.values(group.presets).sort((a, b) => a.order - b.order))
						jobs.push({ connectionId, section: section.name, group: group.name, presetId: preset.id, label: preset.label, variableValues: null })
				} else {
					for (const sample of group.templateValues.slice(0, templateSamples))
						jobs.push({
							connectionId,
							section: section.name,
							group: group.name,
							presetId: group.definition.id,
							label: `${group.definition.label} · ${sample.label ?? String(sample.value)}`,
							variableValues: { ...(group.commonVariableValues ?? {}), [group.templateVariableName]: sample.value },
						})
				}
			}
		}
	}
	const selected = filter ? jobs.filter((job) => filter.test(job.presetId) || filter.test(job.label) || filter.test(job.group)) : jobs
	console.log(`${selected.length} of ${jobs.length} presets from ${Object.keys(all).length} connection(s); pass "${label}", mode ${mode}`)

	let scratchPage: number | null = null
	if (mode === 'location') {
		scratchPage = (await pageCount()) + 1
		await client.pages.insert.mutate({ asPageNumber: scratchPage, pageNames: ['Design gallery (temporary)'] })
	}
	const rendered: Rendered[] = []
	let done = 0
	let next = 0
	const worker = async (slot: number) => {
		while (next < selected.length) {
			const job = selected[next++]
			const id = `${job.presetId}${job.variableValues ? ':' + JSON.stringify(job.variableValues) : ''}`
			const base = { id, presetId: job.presetId, section: job.section, group: job.group, label: job.label, variableValues: job.variableValues }
			try {
				const image =
					mode === 'location'
						? await renderAtLocation(job.connectionId, job.presetId, job.variableValues, { pageNumber: scratchPage!, row: 2, column: 2 + slot })
						: await renderPresetPreview(job.connectionId, job.presetId, job.variableValues)
				rendered.push({ ...base, image })
			} catch (error) {
				rendered.push({ ...base, image: null, error: String(error) })
			}
			done += 1
			if (done % 50 === 0) console.log(`  ${done}/${selected.length}`)
		}
	}
	try {
		await Promise.all(Array.from({ length: Math.max(1, workers) }, (_, slot) => worker(slot)))
	} finally {
		if (scratchPage) await client.pages.remove.mutate({ pageNumber: scratchPage })
	}
	rendered.sort((a, b) => selected.findIndex((j) => j.presetId === a.presetId) - selected.findIndex((j) => j.presetId === b.presetId))

	await mkdir(outDir, { recursive: true })
	const passesPath = path.join(outDir, 'passes.json')
	const passes: Record<string, Rendered[]> = existsSync(passesPath) ? JSON.parse(await readFile(passesPath, 'utf8')) : {}
	passes[label] = rendered
	await writeFile(passesPath, JSON.stringify(passes))
	await writeFile(path.join(outDir, 'index.html'), page(passes))
	const failed = rendered.filter((r) => !r.image).length
	console.log(`wrote ${path.join(outDir, 'index.html')} (${rendered.length} rendered, ${failed} failed)`)
	process.exit(0)
}

function escape(text: string): string {
	return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

function page(passes: Record<string, Rendered[]>): string {
	const passNames = Object.keys(passes)
	const byId = new Map<string, Rendered>()
	for (const name of passNames) for (const r of passes[name]) byId.set(r.id, r)
	const order = [...byId.values()]
	const sections = new Map<string, Map<string, Rendered[]>>()
	for (const r of order) {
		const groups = sections.get(r.section) ?? new Map<string, Rendered[]>()
		sections.set(r.section, groups)
		groups.set(r.group, [...(groups.get(r.group) ?? []), r])
	}
	const cell = (r: Rendered) => {
		const images = passNames
			.map((name) => passes[name].find((x) => x.id === r.id))
			.map((hit, index) =>
				hit?.image
					? `<figure><img src="${hit.image}" alt="" width="72" height="72" title="${escape(passNames[index])}"><figcaption>${escape(passNames[index])}</figcaption></figure>`
					: `<figure class="missing" title="${escape(hit?.error ?? 'not rendered in this pass')}"><div></div><figcaption>${escape(passNames[index])}</figcaption></figure>`,
			)
			.join('')
		return `<div class="preset"><div class="images">${images}</div><div class="label">${escape(r.label)}</div><div class="id">${escape(r.presetId)}</div></div>`
	}
	const body = [...sections.entries()]
		.map(
			([section, groups]) =>
				`<section><h2>${escape(section)}</h2>${[...groups.entries()]
					.map(([group, items]) => `<h3>${escape(group)} <span class="count">${items.length}</span></h3><div class="grid">${items.map(cell).join('')}</div>`)
					.join('')}</section>`,
		)
		.join('')
	return `<!doctype html><html><head><meta charset="utf-8"><title>Multicam RCP · Companion button gallery</title>
<style>
:root{color-scheme:dark}body{margin:0;padding:24px 32px;background:#121417;color:#e6e8eb;font:14px/1.45 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
h1{font-size:20px;margin:0 0 4px}.sub{opacity:.6;margin-bottom:24px}h2{font-size:16px;margin:32px 0 8px;padding-top:16px;border-top:1px solid #2a2e35}
h3{font-size:13px;font-weight:600;margin:16px 0 8px;opacity:.85}.count{opacity:.5;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
.preset{background:#1a1d22;border:1px solid #262a31;border-radius:8px;padding:8px}
.images{display:flex;gap:8px;flex-wrap:wrap}figure{margin:0;text-align:center}figure img{display:block;border-radius:6px;image-rendering:auto;background:#000}
figure img:hover{transform:scale(2.5);transform-origin:top left;position:relative;z-index:2;box-shadow:0 6px 24px rgba(0,0,0,.6)}
figure.missing div{width:72px;height:72px;border-radius:6px;background:repeating-linear-gradient(45deg,#2a2e35,#2a2e35 6px,#1a1d22 6px,#1a1d22 12px)}
figcaption{font-size:10px;opacity:.5;margin-top:2px}.label{margin-top:6px;font-size:12px}.id{font-size:10px;opacity:.4;word-break:break-all}
.toolbar{position:sticky;top:0;background:#121417;padding:8px 0;z-index:3}input{background:#1a1d22;color:inherit;border:1px solid #2a2e35;border-radius:6px;padding:6px 10px;width:320px}
</style></head><body>
<h1>Multicam RCP · Companion button gallery</h1><div class="sub">${order.length} presets rendered by Companion at ${size} px, shown at 72 px (hover to zoom). Passes: ${passNames.map(escape).join(', ')}</div>
<div class="toolbar"><input id="q" placeholder="Filter by name, id, section…"></div>
${body}
<script>const q=document.getElementById('q');q.addEventListener('input',()=>{const v=q.value.toLowerCase();for(const p of document.querySelectorAll('.preset')){p.style.display=p.textContent.toLowerCase().includes(v)?'':'none'}for(const s of document.querySelectorAll('section')){s.style.display=[...s.querySelectorAll('.preset')].some(p=>p.style.display!=='none')?'':'none'}})</script>
</body></html>`
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
