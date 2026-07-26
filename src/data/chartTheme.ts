/**
 * src/data/chartTheme.ts
 *
 * ★ THE DATA-VIZ DESIGN SYSTEM ★
 *
 * This is to charts what `plugins/vuetify.ts` is to components: the ONE place a
 * designer changes how every chart in the app looks. A chart never
 * hardcodes a color, font size, or mark dimension — it reads them from here (via
 * the `useChartTheme` composable). Change a value in this file and every chart
 * updates at once.
 *
 * WHY A SEPARATE FILE INSTEAD OF THE VUETIFY THEME
 *   The Vuetify theme has no concept of "series 4" or "a light→dark magnitude
 *   ramp" — those are genuinely new dimensions that charts need and components
 *   don't. So the *series* colors (categorical / sequential / diverging) live
 *   here. Everything a chart shares with the rest of the app — status colors,
 *   text ink, surfaces, gridlines — is NOT duplicated here; the composable pulls
 *   those live from the Vuetify theme so charts stay in lockstep with the app in
 *   both light and dark. This file owns only what's viz-specific.
 *
 * WHY THESE EXACT HEXES (don't retune by eye)
 *   Every palette below was validated against the real app surfaces —
 *   #FFFFFF (light card) and #0B1E33 (dark card). The checks: lightness band,
 *   chroma floor, colorblind (CVD) adjacent-pair separation, normal-vision
 *   separation, and contrast vs surface. The categorical ORDER is load-bearing:
 *   adjacent pairs were sequenced so no two neighbors collide under deuteranopia
 *   /protanopia/tritanopia.
 *
 *   ⚠️ NO VALIDATOR SCRIPT SHIPS IN THIS REPO. If you add or reorder a color,
 *   re-validate before shipping — load the `dataviz` skill, which carries the
 *   method and a runnable checker. Do not eyeball it.
 *
 * THE NON-NEGOTIABLES (from the data-viz method)
 *   • Categorical hues are assigned in fixed order, never cycled. A 7th series
 *     folds into "Other" / small multiples — it is never a generated hue.
 *   • Sequential = one hue, light→dark. Diverging = two hues + neutral gray mid.
 *   • Status colors (success/warning/error) are RESERVED for state meaning and
 *     are never reused as a series color — they always ship with an icon+label.
 *   • Text (labels, values, legends) wears text tokens, never the series color.
 */

/** A named categorical color: the hex + a human label used in legends/docs. */
export interface ChartSeriesColor {
  /** Designer-facing name, e.g. "Azure". Shown in the Storybook legend demo. */
  label: string
  /** The mark color. Validated for CVD separation in the order listed. */
  hex: string
}

/** A six-step magnitude ramp, light end → dark end. */
export type ChartRamp = readonly [string, string, string, string, string, string]

export interface ChartPalette {
  /**
   * CATEGORICAL — identity encoding (one color per series/category). Fixed order:
   * series 1 gets index 0, series 2 index 1, and so on — never cycled. Same hexes
   * in light and dark (validated against both surfaces), so a series keeps its
   * identity across a theme switch.
   */
  categorical: ChartSeriesColor[]

  /**
   * SEQUENTIAL — magnitude encoding (low→high of ONE metric: heatmap cells, a
   * choropleth, an intensity fill). One hue (brand blue), light→dark. Two variants
   * because a magnitude ramp must be re-stepped per surface — the dark ramp is NOT
   * an auto-flip of the light one; each was validated on its own surface.
   */
  sequential: { light: ChartRamp, dark: ChartRamp }

  /**
   * DIVERGING — polarity encoding (below/above a meaningful midpoint: change vs
   * baseline, over/under target). Two poles + a NEUTRAL GRAY midpoint (never a hue
   * at the middle). Poles are the validated rose/teal categorical hues so the whole
   * system reads as one family. The neutral tracks the surface tone per theme.
   */
  diverging: {
    negative: string
    positive: string
    neutral: { light: string, dark: string }
  }

  /**
   * STATUS — state encoding, by Vuetify THEME-TOKEN NAME (not hex). The composable
   * resolves these against the live theme, so they match the rest of the app and
   * flip correctly in dark mode. Reserved: never used for a data series.
   */
  status: {
    good: string      // -> theme 'success'
    warning: string   // -> theme 'warning'
    critical: string  // -> theme 'error'
    info: string      // -> theme 'info'
  }

  /**
   * TYPE — chart text sizes in px. Derived from the app's MD3 scale (body-small 12,
   * label-small 11) so chart text sits in the same rhythm as the UI. Font FAMILY is
   * never set here — charts inherit the app font (`fontFamily: 'inherit'`).
   */
  type: {
    axisTitle: number   // axis names ("Week", "Adherence %")
    tickLabel: number   // the numbers/dates on the ticks
    legendLabel: number // series names in the legend
    annotation: number  // direct labels on marks
  }

  /**
   * MARKS — geometry constants from the data-viz mark spec. Thin marks, rounded
   * data-ends, generous hit targets. Applied uniformly by the preset charts.
   */
  marks: {
    lineWidth: number       // stroke width for line/area outlines (2px)
    barCornerRadius: number // rounded data-end on bars (4px)
    markerRadius: number    // dot radius on line points / scatter (>= 8px target)
    surfaceGap: number      // gap between adjacent/stacked fills (2px)
  }
}

/**
 * THE PALETTE. Values are the data-viz DS config (not placeholder data) — but the
 * numbers a *chart* plots always come from a typed dataset in `src/data/`, never
 * from here. This file colors and sizes the marks; the dataset supplies the values.
 */
export const chartPalette: ChartPalette = {
  categorical: [
    { label: 'Azure', hex: '#0974FB' },  // series 1 — brand primary
    { label: 'Gold', hex: '#C77D0E' },   // series 2
    { label: 'Violet', hex: '#7C4DFF' }, // series 3
    { label: 'Teal', hex: '#0E9488' },   // series 4
    { label: 'Indigo', hex: '#3B4CCA' }, // series 5
    { label: 'Rose', hex: '#DB2777' },   // series 6
  ],

  sequential: {
    // light card (#FFFFFF): palest step clears the 2:1 mark floor
    light: ['#93B7EE', '#6BA0E8', '#4788E0', '#2A71D4', '#1153B0', '#0A3A80'],
    // dark card (#0B1E33): bright→mid; the dark end still clears the navy surface
    dark: ['#D4E6FF', '#ABCCFF', '#83B0FF', '#5B93F5', '#3D77DB', '#2A61BC'],
  },

  diverging: {
    negative: '#DB2777',                        // rose pole
    positive: '#0E9488',                        // teal pole
    neutral: { light: '#E4E6EA', dark: '#33404F' }, // low-chroma, tracks the surface
  },

  status: {
    good: 'success',
    warning: 'warning',
    critical: 'error',
    info: 'info',
  },

  type: {
    axisTitle: 12,
    tickLabel: 12,
    legendLabel: 12,
    annotation: 11,
  },

  marks: {
    lineWidth: 2,
    barCornerRadius: 4,
    markerRadius: 4, // Plot's `r` is a radius; 4 → an 8px-diameter dot (spec: >= 8px)
    surfaceGap: 2,
  },
}
