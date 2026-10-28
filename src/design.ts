/**
 * The button design system: every preset is composed from a handful of tiles
 * built with Companion 5 layered graphics, so the whole surface reads as one
 * family. Coordinates are percentages of the drawable area (Companion keeps
 * its top bar above it when the user has one).
 *
 * Tiles: banner (a group header), value (ring gauge + value, also the display
 * above a rotary), step (+ / −), toggle (on/off/toggle with a state lamp), pill
 * (a selectable option), number (PTZ preset), rotary (the encoder itself) and
 * live (video).
 */
import {
	type ButtonGraphicsGaugeElement,
	type ButtonGraphicsTextElement,
	type CompanionLayeredButtonPresetDefinition,
	type CompanionPresetFeedbackStyleOverride,
	type SomeButtonGraphicsElement,
	ButtonGraphicsDecorationType,
	ButtonGraphicsShowStatusIcons,
} from '@companion-module/base'
import type { ModuleTypes } from './main.js'
import type { Presentation } from './api.js'

export type Layered = CompanionLayeredButtonPresetDefinition<ModuleTypes>
type Feedbacks = Layered['feedbacks']
type Feedback = Feedbacks[number]
type Steps = Layered['steps']
type Options = Record<string, unknown>

/** A boolean feedback entry that overrides element properties while true. */
function override(
	feedbackId: string,
	options: Options,
	styleOverrides: CompanionPresetFeedbackStyleOverride[],
	isInverted?: boolean,
): Feedback {
	return { feedbackId, options, styleOverrides, isInverted } as unknown as Feedback
}
type LocalVariables = NonNullable<Layered['localVariables']>
type Expr = { isExpression: true; value: string }

export const expr = (value: string): Expr => ({ isExpression: true, value })

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

/** Designed tiles own the whole face unless the RCP asks for Companion's top bar. */
function canvas() {
	return {
		decoration: presentation.topBar ? ButtonGraphicsDecorationType.TopBar : ButtonGraphicsDecorationType.None,
		showStatusIcons: ButtonGraphicsShowStatusIcons.FollowDefault,
	}
}

/**
 * A text element. `fontsize` is given as a percentage of the whole tile height (Companion
 * measures it against the element's own height, which makes short label boxes hard to reason
 * about), so a 12 here is the same size on every tile regardless of the box it sits in.
 */
function text(
	partial: Omit<ButtonGraphicsTextElement, 'type'> & { height: number; fontsize: number },
): ButtonGraphicsTextElement {
	const scale = Number.isFinite(presentation.textScale) ? Math.min(1.6, Math.max(0.7, presentation.textScale)) : 1
	// The RCP's text scale is for the property text (labels, captions, hints), not the value.
	// Companion sizes text by its box, so the box grows around its centre with the scale.
	const scaled = ['label', 'caption', 'subtitle', 'step', 'waiting'].includes(partial.id ?? '')
	let y = typeof partial.y === 'number' ? partial.y : 0
	let height = partial.height
	if (scaled && scale !== 1) {
		const grown = Math.min(height * scale, 60)
		y = Math.max(0, Math.min(100 - grown, y - (grown - height) / 2))
		height = grown
	}
	const fontsize = Math.min(200, Math.max(3, Math.round((partial.fontsize / partial.height) * 100)))
	return {
		type: 'text',
		color: INK.text,
		halign: 'center',
		valign: 'center',
		fontsizeAllowShrink: true,
		...partial,
		y,
		height,
		fontsize,
	}
}
function box(
	id: string,
	x: number,
	y: number,
	width: number,
	height: number,
	color: number,
	cornerRadius = 0,
): SomeButtonGraphicsElement {
	return { type: 'box', id, x, y, width, height, color, cornerRadius }
}
/** The tile background with a coloured accent stripe down the left edge. */
function surface(accent: number, bg = INK.bg): SomeButtonGraphicsElement[] {
	return [box('bg', 0, 0, 100, 100, bg), box('accent', 0, 0, 5, 100, accent)]
}
function ring(
	id: string,
	valueExpr: string,
	min: number,
	max: number,
	accent: number,
	x: number,
	y: number,
	width: number,
	height: number,
): ButtonGraphicsGaugeElement {
	return {
		type: 'gauge',
		id,
		x,
		y,
		width,
		height,
		orientation: 'ring',
		// Open at the bottom: sweep clockwise from 7 o'clock round to 5 o'clock.
		startAngle: 225,
		endAngle: 135,
		ringWidth: 16,
		roundedEnds: true,
		min,
		max,
		origin: min,
		value: expr(`$(local:${valueExpr}) ?? ${min}`),
		enabled: expr(`$(local:${valueExpr}) !== undefined && $(local:${valueExpr}) !== null`),
		trackStyle: 'dimmed',
		multiColour: false,
		stops: [{ value: min, color: accent, gradient: false }],
	}
}
function bar(
	id: string,
	valueExpr: string,
	min: number,
	max: number,
	accent: number,
	y: number,
	height: number,
): ButtonGraphicsGaugeElement {
	return {
		type: 'gauge',
		id,
		x: 12,
		y,
		width: 82,
		height,
		orientation: 'horizontal',
		min,
		max,
		origin: min,
		value: expr(`$(local:${valueExpr}) ?? ${min}`),
		enabled: expr(`$(local:${valueExpr}) !== undefined && $(local:${valueExpr}) !== null`),
		trackStyle: 'dimmed',
		multiColour: false,
		stops: [{ value: min, color: accent, gradient: false }],
	}
}

/** "42%" for unit ranges, otherwise one decimal, or the named step's label; a dash while offline. */
export function valueText(local: string, min: number, max: number, unit?: string | null, labelLocal?: string): Expr {
	const v = `$(local:${local})`
	const percent = min === 0 && max === 1
	const shown = labelLocal
		? `$(local:${labelLocal})`
		: percent
			? `\`\${toFixed(${v} * 100, 0)}%\``
			: `\`\${toFixed(${v}, ${Number.isInteger(min) && Number.isInteger(max) && max - min >= 10 ? 0 : 2})}${unit ? ' ' + unit : ''}\``
	return expr(`(${v} === undefined || ${v} === null) ? '—' : ${shown}`)
}

export interface ValueSource {
	local: string
	min: number
	max: number
	unit?: string | null
	/** A local variable holding the value as text (a named step's label), shown instead of the number. */
	labelLocal?: string
	localVariables: LocalVariables
}
/**
 * A numeric control read as a local variable through the control_value feedback; a control
 * with named steps (gain in dB, shutter speeds) also reads its label through control_text.
 */
export function controlSource(
	camera: string,
	property: string,
	min: number,
	max: number,
	unit?: string | null,
	namedSteps = false,
): ValueSource {
	return {
		local: 'level',
		min,
		max,
		unit,
		labelLocal: namedSteps ? 'label' : undefined,
		localVariables: [
			{ variableType: 'feedback', variableName: 'level', feedbackId: 'control_value', options: { camera, property } },
			...(namedSteps
				? [
						{
							variableType: 'feedback' as const,
							variableName: 'label',
							feedbackId: 'control_text',
							options: { camera, property },
						},
					]
				: []),
		],
	}
}

export interface TileBase {
	name: string
	accent: number
	steps: Steps
	feedbacks?: Feedbacks
}

/** Group header: a solid accent block with the group name. */
export function banner(name: string, title: string, accent: number): Layered {
	return {
		type: 'layered',
		name,
		canvas: canvas(),
		elements: [
			box('bg', 0, 0, 100, 100, accent, 8),
			text({
				id: 'title',
				text: title.toUpperCase(),
				x: 6,
				y: 20,
				width: 88,
				height: 60,
				fontsize: 20,
				weight: 'bold',
				color: INK.black,
			}),
		],
		feedbacks: [],
		steps: [{ down: [], up: [] }],
	}
}

/**
 * A numeric control's level: ring with the value inside (rings), big value over a bar (bars)
 * or the value alone (plain). `stripe` adds the accent stripe used on button tiles; encoder
 * tiles leave it off so the LCD strip reads as one surface.
 */
function levelTile(t: TileBase & { label: string; source: ValueSource }, stripe: boolean): Layered {
	const { source } = t
	const value = valueText(source.local, source.min, source.max, source.unit, source.labelLocal)
	const base: SomeButtonGraphicsElement[] = stripe ? surface(t.accent) : [box('bg', 0, 0, 100, 100, INK.bg)]
	const elements: SomeButtonGraphicsElement[] =
		presentation.theme === 'rings'
			? [
					...base,
					text({ id: 'label', text: t.label, x: 6, y: 3, width: 88, height: 18, fontsize: 11, color: INK.muted }),
					ring('ring', source.local, source.min, source.max, t.accent, 18, 20, 64, 78),
					text({ id: 'value', text: value, x: 20, y: 38, width: 60, height: 40, fontsize: 22, weight: 'bold' }),
				]
			: [
					...base,
					text({ id: 'label', text: t.label, x: 8, y: 4, width: 90, height: 26, fontsize: 11, color: INK.muted }),
					text({ id: 'value', text: value, x: 8, y: 30, width: 90, height: 40, fontsize: 24, weight: 'bold' }),
					...(presentation.theme === 'bars'
						? [bar('bar', source.local, source.min, source.max, t.accent, 82, 10)]
						: []),
				]
	return {
		type: 'layered',
		name: t.name,
		canvas: canvas(),
		localVariables: source.localVariables,
		elements,
		feedbacks: t.feedbacks ?? [],
		steps: t.steps,
	}
}

/** A read-only or press-to-adjust level on a button. */
export function valueTile(t: TileBase & { label: string; source: ValueSource }): Layered {
	return levelTile(t, true)
}

/**
 * A numeric control on a Stream Deck + encoder: Companion draws this tile on the LCD strip
 * above the knob and runs its rotate actions when the knob turns.
 */
export function rotaryTile(t: TileBase & { label: string; source: ValueSource }): Layered {
	return levelTile(t, false)
}

/** Increase or decrease: the name, a big glyph and a thin position bar. */
export function stepTile(
	t: TileBase & { label: string; glyph: string; source?: ValueSource; showValue?: boolean; valueText?: string | Expr },
): Layered {
	const elements: SomeButtonGraphicsElement[] = [
		...surface(t.accent),
		text({ id: 'label', text: t.label, x: 8, y: 4, width: 90, height: 24, fontsize: 11, color: INK.muted }),
	]
	const shownValue =
		t.valueText ??
		(t.source ? valueText(t.source.local, t.source.min, t.source.max, t.source.unit, t.source.labelLocal) : undefined)
	if (t.showValue && shownValue !== undefined) {
		elements.push(
			text({
				id: 'glyph',
				text: t.glyph,
				x: 8,
				y: 26,
				width: 40,
				height: 50,
				fontsize: 34,
				weight: 'bold',
				color: t.accent,
			}),
			text({ id: 'value', text: shownValue, x: 46, y: 30, width: 52, height: 42, fontsize: 20, weight: 'bold' }),
		)
	} else {
		elements.push(
			text({
				id: 'glyph',
				text: t.glyph,
				x: 8,
				y: 26,
				width: 90,
				height: 50,
				fontsize: 40,
				weight: 'bold',
				color: t.accent,
			}),
		)
	}
	if (t.source && presentation.theme !== 'plain')
		elements.push(bar('bar', t.source.local, t.source.min, t.source.max, t.accent, 86, 8))
	return {
		type: 'layered',
		name: t.name,
		canvas: canvas(),
		localVariables: t.source?.localVariables,
		elements,
		feedbacks: t.feedbacks ?? [],
		steps: t.steps,
	}
}

/** A boolean control: name, state word and a lamp that lights from a boolean feedback. */
export function toggleTile(
	t: TileBase & {
		label: string
		stateText: string
		lit: { feedbackId: string; options: Options; isInverted?: boolean }
		litColor?: number
	},
): Layered {
	const lit = t.litColor ?? t.accent
	const overrides: CompanionPresetFeedbackStyleOverride[] = [
		{ elementId: 'lamp', elementProperty: 'color', override: lit },
		{ elementId: 'state', elementProperty: 'color', override: INK.white },
		{ elementId: 'bg', elementProperty: 'color', override: INK.panel },
	]
	return {
		type: 'layered',
		name: t.name,
		canvas: canvas(),
		elements: [
			...surface(t.accent),
			text({ id: 'label', text: t.label, x: 8, y: 4, width: 90, height: 24, fontsize: 11, color: INK.muted }),
			{ type: 'circle', id: 'lamp', x: 39, y: 33, width: 22, height: 22, color: INK.track },
			text({
				id: 'state',
				text: t.stateText,
				x: 8,
				y: 66,
				width: 90,
				height: 30,
				fontsize: 15,
				weight: 'bold',
				color: INK.muted,
			}),
		],
		feedbacks: [override(t.lit.feedbackId, t.lit.options, overrides, t.lit.isInverted), ...(t.feedbacks ?? [])],
		steps: t.steps,
	}
}

/** One option of a set (step size, PTZ mode...): fills with its colour while active. */
export function pillTile(
	t: TileBase & {
		label: string
		caption?: string
		active: { feedbackId: string; options: Options }
		activeColor?: number
	},
): Layered {
	const active = t.activeColor ?? t.accent
	const overrides: CompanionPresetFeedbackStyleOverride[] = [
		{ elementId: 'fill', elementProperty: 'color', override: active },
		{ elementId: 'fill', elementProperty: 'borderColor', override: INK.white },
		{ elementId: 'fill', elementProperty: 'borderWidth', override: 4 },
		{ elementId: 'label', elementProperty: 'color', override: INK.black },
		{ elementId: 'caption', elementProperty: 'color', override: INK.black },
	]
	return {
		type: 'layered',
		name: t.name,
		canvas: canvas(),
		elements: [
			box('bg', 0, 0, 100, 100, INK.bg),
			{
				type: 'box',
				id: 'fill',
				x: 6,
				y: 10,
				width: 88,
				height: 80,
				color: INK.panel,
				cornerRadius: 12,
				borderWidth: 2,
				borderColor: t.accent,
				borderPosition: 'inside',
			},
			text({
				id: 'caption',
				text: t.caption ?? '',
				x: 10,
				y: 14,
				width: 80,
				height: 22,
				fontsize: 11,
				color: INK.muted,
			}),
			text({
				id: 'label',
				text: t.label,
				x: 10,
				y: t.caption ? 34 : 24,
				width: 80,
				height: t.caption ? 48 : 56,
				fontsize: 20,
				weight: 'bold',
			}),
		],
		feedbacks: [override(t.active.feedbackId, t.active.options, overrides), ...(t.feedbacks ?? [])],
		steps: t.steps,
	}
}

/** A numbered PTZ preset. */
export function numberTile(t: TileBase & { number: number; caption: string }): Layered {
	return {
		type: 'layered',
		name: t.name,
		canvas: canvas(),
		elements: [
			...surface(t.accent),
			text({ id: 'caption', text: t.caption, x: 8, y: 4, width: 90, height: 22, fontsize: 11, color: INK.muted }),
			text({ id: 'number', text: String(t.number), x: 8, y: 24, width: 90, height: 60, fontsize: 40, weight: 'bold' }),
		],
		feedbacks: t.feedbacks ?? [],
		steps: t.steps,
	}
}

/** A plain labelled tile (name + optional second line) with the accent stripe. */
export function labelTile(
	t: TileBase & {
		title: string | Expr
		subtitle?: string | Expr
		feedbackOverrides?: Feedbacks
		localVariables?: LocalVariables
	},
): Layered {
	return {
		type: 'layered',
		name: t.name,
		canvas: canvas(),
		localVariables: t.localVariables,
		elements: [
			...surface(t.accent),
			text({
				id: 'title',
				text: t.title,
				x: 8,
				y: t.subtitle ? 10 : 20,
				width: 90,
				height: t.subtitle ? 44 : 60,
				fontsize: 20,
				weight: 'bold',
			}),
			...(t.subtitle
				? [
						text({
							id: 'subtitle',
							text: t.subtitle,
							x: 8,
							y: 54,
							width: 90,
							height: 36,
							fontsize: 12,
							color: INK.muted,
						}),
					]
				: []),
		],
		feedbacks: [...(t.feedbackOverrides ?? []), ...(t.feedbacks ?? [])],
		steps: t.steps,
	}
}

/** Router input/output tiles: the background follows a tally state local variable. */
export function tallyTile(
	t: TileBase & {
		title: string | Expr
		caption: string
		tallyLocal: string
		localVariables: LocalVariables
		selected?: { feedbackId: string; options: Options }
	},
): Layered {
	const tally = `$(local:${t.tallyLocal})`
	const bg = expr(
		`${tally} === 'red' ? ${TALLY.red} : ${tally} === 'green' ? ${TALLY.green} : ${tally} === 'yellow' ? ${TALLY.yellow} : ${tally} === 'blue' ? ${TALLY.blue} : ${tally} === 'purple' ? ${TALLY.purple} : ${INK.bg}`,
	)
	const ink = expr(`(${tally} === 'green' || ${tally} === 'yellow') ? ${INK.black} : ${INK.text}`)
	const selected: Feedbacks = t.selected
		? [
				override(t.selected.feedbackId, t.selected.options, [
					{ elementId: 'frame', elementProperty: 'borderColor', override: t.accent },
					{ elementId: 'frame', elementProperty: 'borderWidth', override: 3 },
				]),
			]
		: []
	return {
		type: 'layered',
		name: t.name,
		canvas: canvas(),
		localVariables: t.localVariables,
		elements: [
			{ type: 'box', id: 'bg', x: 0, y: 0, width: 100, height: 100, color: bg },
			{
				type: 'box',
				id: 'frame',
				x: 2,
				y: 2,
				width: 96,
				height: 96,
				color: INK.clear,
				cornerRadius: 10,
				borderWidth: 0,
				borderColor: t.accent,
				borderPosition: 'inside',
			},
			text({ id: 'caption', text: t.caption, x: 8, y: 4, width: 90, height: 22, fontsize: 11, color: ink }),
			text({
				id: 'title',
				text: t.title,
				x: 8,
				y: 26,
				width: 90,
				height: 60,
				fontsize: 20,
				weight: 'bold',
				color: ink,
			}),
		],
		feedbacks: [...selected, ...(t.feedbacks ?? [])],
		steps: t.steps,
	}
}

/** Live video with the source name; the image fills the tile once frames arrive. */
export function liveTile(
	t: TileBase & {
		sourceName: string
		localVariables: LocalVariables
		selected?: { feedbackId: string; options: Options }
	},
): Layered {
	const selected: Feedbacks = t.selected
		? [
				override(t.selected.feedbackId, t.selected.options, [
					{ elementId: 'frame', elementProperty: 'borderColor', override: t.accent },
					{ elementId: 'frame', elementProperty: 'borderWidth', override: 7 },
					{ elementId: 'shade', elementProperty: 'color', override: t.accent },
					{ elementId: 'label', elementProperty: 'color', override: INK.black },
				]),
			]
		: []
	return {
		type: 'layered',
		name: t.name,
		canvas: canvas(),
		localVariables: t.localVariables,
		elements: [
			box('bg', 0, 0, 100, 100, INK.black),
			text({ id: 'waiting', text: 'No video', x: 0, y: 30, width: 100, height: 40, fontsize: 13, color: INK.dim }),
			{
				type: 'image',
				id: 'frame',
				base64Image: expr('$(local:image)'),
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				fillMode: 'fit',
			},
			box('shade', 0, 80, 100, 20, INK.shade),
			text({ id: 'label', text: t.sourceName, x: 4, y: 80, width: 92, height: 20, fontsize: 10, color: INK.text }),
			{
				type: 'box',
				id: 'frame',
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				color: INK.clear,
				cornerRadius: 6,
				borderWidth: 0,
				borderColor: t.accent,
				borderPosition: 'inside',
			},
		],
		feedbacks: [...selected, ...(t.feedbacks ?? [])],
		steps: t.steps,
	}
}

/**
 * A deck slot: gauge for whatever control the user's bank puts here. Name, level, range and
 * value text come from local variables (`name`, `level`, `min`, `max`, `text`) and the step
 * size caption from `step`, so the same tile serves the LCD strip and the encoder below it.
 */
export function slotTile(t: TileBase & { localVariables: LocalVariables }): Layered {
	// The colour of whatever control sits in the slot (a local variable from deck_slot_accent).
	const accent = expr(`$(local:accent) ?? ${t.accent}`)
	const gauge = (orientation: 'ring' | 'horizontal', x: number, y: number, width: number, height: number) =>
		({
			type: 'gauge' as const,
			id: orientation === 'ring' ? 'ring' : 'bar',
			x,
			y,
			width,
			height,
			orientation,
			startAngle: 225,
			endAngle: 135,
			ringWidth: 16,
			roundedEnds: true,
			min: expr('$(local:min) ?? 0'),
			max: expr('$(local:max) ?? 1'),
			origin: expr('$(local:min) ?? 0'),
			value: expr('$(local:level) ?? ($(local:min) ?? 0)'),
			enabled: expr('$(local:level) !== undefined && $(local:level) !== null'),
			trackStyle: 'dimmed' as const,
			multiColour: false,
			stops: [{ value: 0, color: accent, gradient: false }],
		}) as ButtonGraphicsGaugeElement
	const elements: SomeButtonGraphicsElement[] =
		presentation.theme === 'rings'
			? [
					box('bg', 0, 0, 100, 100, INK.bg),
					text({
						id: 'label',
						text: '$(local:name)',
						x: 6,
						y: 3,
						width: 88,
						height: 18,
						fontsize: 11,
						color: INK.muted,
					}),
					gauge('ring', 18, 20, 64, 66),
					text({
						id: 'value',
						text: '$(local:text)',
						x: 20,
						y: 36,
						width: 60,
						height: 36,
						fontsize: 20,
						weight: 'bold',
					}),
					text({ id: 'step', text: '$(local:step)', x: 10, y: 86, width: 80, height: 12, fontsize: 8, color: INK.dim }),
				]
			: [
					box('bg', 0, 0, 100, 100, INK.bg),
					{ type: 'box', id: 'accent', x: 0, y: 0, width: 5, height: 100, color: accent, cornerRadius: 0 },
					text({
						id: 'label',
						text: '$(local:name)',
						x: 8,
						y: 4,
						width: 90,
						height: 24,
						fontsize: 11,
						color: INK.muted,
					}),
					text({
						id: 'value',
						text: '$(local:text)',
						x: 8,
						y: 28,
						width: 90,
						height: 40,
						fontsize: 24,
						weight: 'bold',
					}),
					...(presentation.theme === 'bars' ? [gauge('horizontal', 12, 72, 82, 10)] : []),
					text({ id: 'step', text: '$(local:step)', x: 8, y: 86, width: 90, height: 12, fontsize: 8, color: INK.dim }),
				]
	return {
		type: 'layered',
		name: t.name,
		canvas: canvas(),
		localVariables: t.localVariables,
		elements,
		feedbacks: t.feedbacks ?? [],
		steps: t.steps,
	}
}
