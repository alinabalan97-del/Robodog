/**
 * src/components/charts/baseOption.ts
 *
 * THE COMPILED ECHARTS THEME. This turns the resolved data-viz tokens
 * (useChartTheme → src/data/chartTheme.ts) into ECharts' config shape ONCE, in
 * one place. Every preset chart spreads `baseChartOption(t)` and adds only its
 * own series — so a change to a token flows into all charts, and the shared
 * "chrome" (grid, axes, legend, tooltip) is defined here a single time instead
 * of per chart.
 *
 * The axis/legend/tooltip helpers below are the reusable BASES: the house
 * equivalent of building a grid or legend component once and composing it into
 * every chart. In ECharts they're config, not drawing code.
 */
import type { ResolvedChartTheme } from './useChartTheme'

/** '#0974FB' + alpha → 'rgba(9,116,251,0.16)'. For gradient area fills. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** A thin VERTICAL line — the tooltip series marker, instead of ECharts' round dot. */
export function tooltipSwatch(color: string): string {
  return `<span style="display:inline-block;width:0;height:12px;border-left:3px solid ${color};border-radius:2px;vertical-align:middle;margin-right:8px;"></span>`
}

/** One tooltip row: vertical swatch + label (left) + value (right). */
function row(color: string, label: string, value: unknown): string {
  return '<div style="display:flex;align-items:center;margin:3px 0;">'
    + tooltipSwatch(color)
    + `<span style="flex:1;margin-right:24px;">${label}</span>`
    + `<span style="font-weight:600;">${value ?? '—'}</span></div>`
}

/**
 * ONE tooltip formatter for the whole kit — a vertical-line marker on every chart.
 * It reads each param's `seriesType` so each chart keeps its meaningful value:
 *   axis (line/bar/area) → category header + value per series
 *   pie   → slice name + value + percent
 *   scatter → "x, y"
 *   heatmap → the two categories + value
 * (Radar passes its own formatter — it lists every indicator — but reuses the swatch.)
 */
export function seriesTooltip() {
  return (params: unknown): string => {
    const list = (Array.isArray(params) ? params : [params]) as Record<string, unknown>[]
    const first = list[0] ?? {}
    const header = (first.axisValueLabel as string) ?? ''
    const rows = list.map((p) => {
      const color = p.color as string
      const v = p.value
      switch (p.seriesType) {
        case 'pie': {
          const pct = p.percent != null ? ` · ${p.percent as number}%` : ''
          return row(color, String(p.name ?? ''), `${v as number}${pct}`)
        }
        case 'scatter':
          return row(color, String(p.seriesName ?? p.name ?? ''), Array.isArray(v) ? `${v[0]}, ${v[1]}` : v)
        case 'heatmap':
          return row(color, Array.isArray(v) ? `${v[0]} · ${v[1]}` : String(p.name ?? ''), Array.isArray(v) ? v[2] : v)
        default:
          return row(color, String(p.seriesName ?? p.name ?? ''), Array.isArray(v) ? v[v.length - 1] : v)
      }
    }).join('')
    return (header ? `<div style="font-weight:600;margin-bottom:2px;">${header}</div>` : '') + rows
  }
}

/** The global look shared by every chart: palette, font, animation, tooltip, legend. */
export function baseChartOption(t: ResolvedChartTheme): Record<string, unknown> {
  return {
    color: t.categorical, // series colors, in fixed validated order
    backgroundColor: 'transparent',
    textStyle: { fontFamily: t.fontFamily, color: t.ink, fontSize: t.type.tickLabel },
    // Rich-by-default: a short eased entrance animation.
    animation: true,
    animationDuration: 600,
    animationEasing: 'cubicOut',
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: t.surface,
      borderColor: t.grid,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t.ink, fontSize: t.type.tickLabel, fontFamily: t.fontFamily },
      // Series marker is a vertical line, not a dot — one formatter, every chart.
      formatter: seriesTooltip(),
      // z: 1 keeps the dashed crosshair BELOW the series (default z 2), so the
      // line and its hover dot render on top of it instead of the dashed line
      // cutting across the marker.
      axisPointer: { type: 'line', z: 1, lineStyle: { color: t.axis, width: 1, type: 'dashed' } },
    },
    legend: {
      type: 'scroll',
      top: 0,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 16,
      textStyle: { color: t.axis, fontSize: t.type.legendLabel, fontFamily: t.fontFamily },
    },
    // ECharts' built-in screen-reader description (set per chart via `title`).
    aria: { enabled: true },
  }
}

/** Reusable category axis (the x axis for time/labels). */
export function categoryAxis(t: ResolvedChartTheme, name?: string, boundaryGap = true): Record<string, unknown> {
  return {
    type: 'category',
    boundaryGap,
    name: name ?? undefined,
    nameLocation: 'middle',
    nameGap: 28,
    nameTextStyle: { color: t.axis, fontSize: t.type.axisTitle },
    axisLine: { lineStyle: { color: t.grid } },
    axisTick: { show: false },
    axisLabel: { color: t.axis, fontSize: t.type.tickLabel, fontFamily: t.fontFamily },
  }
}

/** Reusable value axis (the y axis for measured values), with recessive gridlines. */
export function valueAxis(t: ResolvedChartTheme, name?: string): Record<string, unknown> {
  return {
    type: 'value',
    name: name ?? undefined,
    nameTextStyle: { color: t.axis, fontSize: t.type.axisTitle, align: 'left' },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: t.axis, fontSize: t.type.tickLabel, fontFamily: t.fontFamily },
    splitLine: { lineStyle: { color: t.grid, width: 1 } },
  }
}

/**
 * Pivot flat rows into ECharts' category-axis shape.
 *   rows + x + y            → one series aligned to the x categories
 *   rows + x + y + series   → one series per distinct `series` value
 * Missing (category, series) combinations become null (a gap), never 0.
 */
export function pivot(
  data: readonly unknown[],
  xKey: string,
  yKey: string,
  seriesKey?: string,
): { categories: unknown[], series: { name: string, values: (number | null)[] }[] } {
  const rows = data as readonly Record<string, unknown>[]
  const categories = [...new Set(rows.map(r => r[xKey]))]

  if (!seriesKey) {
    const byX = new Map(rows.map(r => [r[xKey], r[yKey] as number]))
    return {
      categories,
      series: [{ name: yKey, values: categories.map(c => byX.get(c) ?? null) }],
    }
  }

  const names = [...new Set(rows.map(r => String(r[seriesKey])))]
  const series = names.map(name => {
    const byX = new Map(
      rows.filter(r => String(r[seriesKey]) === name).map(r => [r[xKey], r[yKey] as number]),
    )
    return { name, values: categories.map(c => byX.get(c) ?? null) }
  })
  return { categories, series }
}
