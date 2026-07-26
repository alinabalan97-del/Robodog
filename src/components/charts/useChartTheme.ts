/**
 * src/components/charts/useChartTheme.ts
 *
 * Resolves the static data-viz DS (`src/data/chartTheme.ts`) against the LIVE
 * Vuetify theme and returns a single flat, reactive object the charts consume.
 *
 * The split it enforces:
 *   • Series colors (categorical / sequential / diverging) come from chartTheme —
 *     the viz-specific palette a designer owns there.
 *   • Everything a chart shares with the app (text ink, gridlines, surface, and
 *     the reserved status colors) is read from the current Vuetify theme, so a
 *     light/dark switch or a rebrand flows into every chart with zero chart edits.
 *
 * It's a computed ref, so any chart using it re-renders automatically when the
 * theme changes (BaseChart re-renders the chart when this ref updates).
 */
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { chartPalette } from '@/data/chartTheme'

/** '#0974FB' + alpha → 'rgba(9,116,251,0.6)'. Used for recessive axis/grid ink. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** The fully-resolved theme a chart draws with, at the current mode. */
export interface ResolvedChartTheme {
  isDark: boolean
  /** Categorical mark colors, fixed order — feed straight to a `color.range`. */
  categorical: string[]
  /** Magnitude ramp for the current mode (light→dark). */
  sequential: string[]
  /** Polarity poles + neutral midpoint for the current mode. */
  diverging: { negative: string, positive: string, neutral: string }
  /** Reserved state colors, resolved from the theme's status tokens. */
  status: { good: string, warning: string, critical: string, info: string }
  /** Primary text ink (titles, values) — pulled from the theme's on-surface. */
  ink: string
  /** Recessive ink for axis labels/ticks. */
  axis: string
  /** Even more recessive ink for gridlines. */
  grid: string
  /** The chart surface — tooltip background, gap ring between touching marks. */
  surface: string
  /**
   * The app font stack. ECharts renders to canvas, which can't inherit CSS fonts
   * like SVG can — so we read the app's computed font and hand it to the chart,
   * keeping chart text in the same family as the UI.
   */
  fontFamily: string
  /** Passthrough type + mark geometry from chartTheme. */
  type: typeof chartPalette.type
  marks: typeof chartPalette.marks
}

export function useChartTheme() {
  const theme = useTheme()

  return computed<ResolvedChartTheme>(() => {
    const t = theme.current.value
    // Vuetify types colors as a broad union; at runtime these are resolved hex strings.
    const c = t.colors as Record<string, string>
    const isDark = t.dark
    const onSurface = c['on-surface'] ?? (isDark ? '#FFFFFF' : '#000000')

    return {
      isDark,
      categorical: chartPalette.categorical.map(s => s.hex),
      sequential: [...(isDark ? chartPalette.sequential.dark : chartPalette.sequential.light)],
      diverging: {
        negative: chartPalette.diverging.negative,
        positive: chartPalette.diverging.positive,
        neutral: isDark ? chartPalette.diverging.neutral.dark : chartPalette.diverging.neutral.light,
      },
      status: {
        good: c[chartPalette.status.good] ?? onSurface,
        warning: c[chartPalette.status.warning] ?? onSurface,
        critical: c[chartPalette.status.critical] ?? onSurface,
        info: c[chartPalette.status.info] ?? onSurface,
      },
      ink: onSurface,
      // Recessive inks: same hue as body text, stepped down so data leads, chrome recedes.
      axis: hexToRgba(onSurface, isDark ? 0.7 : 0.6),
      grid: hexToRgba(onSurface, isDark ? 0.16 : 0.1),
      surface: c.surface ?? (isDark ? '#0B1E33' : '#FFFFFF'),
      fontFamily: typeof document !== 'undefined'
        ? (getComputedStyle(document.body).fontFamily || 'Inter, sans-serif')
        : 'Inter, sans-serif',
      type: chartPalette.type,
      marks: chartPalette.marks,
    }
  })
}
