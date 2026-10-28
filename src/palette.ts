/**
 * Colours shared by every button: neutral surfaces, one accent per control group, tally
 * colours, and the RCP's Setup → Companion buttons choices that pick among them.
 */
import type { Presentation } from './api.js'

/** Palette: neutral surfaces, one accent per property group, tally colours. */
export const INK = {
	bg: 0x14181d,
	panel: 0x1f252d,
	track: 0x2c3440,
	text: 0xf3f4f6,
	muted: 0x9aa4b2,
	dim: 0x5b6472,
	white: 0xffffff,
	black: 0x000000,
	/** Companion packs transparency in the top byte: 0xff = fully transparent. */
	clear: 0xff000000,
	shade: 0x60000000,
}
export const TALLY = {
	red: 0xe11d2e,
	green: 0x22c55e,
	blue: 0x3b82f6,
	yellow: 0xfacc15,
	purple: 0xa855f7,
	off: 0x2c3440,
}
export const ACCENT: Record<string, number> = {
	lens: 0x38bdf8,
	color: 0xf472b6,
	ptz: 0x34d399,
	sensor: 0xfbbf24,
	monitor: 0xa78bfa,
	audio: 0x22d3ee,
	system: 0x9ca3af,
	record: 0xf87171,
	matrix: 0xc084fc,
	user: 0x60a5fa,
	route: 0xf59e0b,
	controller: 0x2dd4bf,
}
export const DEFAULT_PRESENTATION: Presentation = {
	version: 1,
	theme: 'rings',
	accent: 'group',
	accentColor: '#38bdf8',
	topBar: false,
	textScale: 1,
	hiddenCameras: [],
	hiddenModules: [],
}
let presentation: Presentation = DEFAULT_PRESENTATION
/** Apply the RCP's Companion presentation settings before building presets. */
export function applyPresentation(next?: Partial<Presentation> | null): Presentation {
	presentation = { ...DEFAULT_PRESENTATION, ...(next ?? {}) }
	return presentation
}
export function currentPresentation(): Presentation {
	return presentation
}
function parseHex(color: string, fallback: number): number {
	const match = /^#?([0-9a-f]{6})$/i.exec(color.trim())
	return match ? parseInt(match[1], 16) : fallback
}
/** The accent for a control group under the current accent mode. */
export function tone(group: string): number {
	if (presentation.accent === 'single') return parseHex(presentation.accentColor, ACCENT.lens)
	if (presentation.accent === 'mono') return 0x9aa4b2
	return ACCENT[group] ?? ACCENT.system
}
/** Colour-grading channels keep their own hue whatever group they sit in. */
export function channelAccent(property: string, group: string): number {
	if (presentation.accent !== 'group') return tone(group)
	const p = property.toLowerCase()
	if (/(^|_)(red|r)_(gain|lift|gamma|pedestal|phase|saturation)/.test(p)) return 0xef4444
	if (/(^|_)(green|g)_(gain|lift|gamma|pedestal|phase|saturation)/.test(p)) return 0x22c55e
	if (/(^|_)(blue|b)_(gain|lift|gamma|pedestal|phase|saturation)/.test(p)) return 0x3b82f6
	return tone(group)
}
