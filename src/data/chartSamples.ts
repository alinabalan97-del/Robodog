/**
 * src/data/chartSamples.ts
 *
 * SYNTHETIC sample datasets for the chart kit's Storybook preview. Every value
 * here is placeholder content (CLAUDE.md house rule) — NOT clinical data. It
 * exists only so the pre-themed charts have something to render in the DS preview;
 * real screens produce their own typed datasets in src/data/ and pass them in.
 *
 * Shapes are deliberately generic (a row = an object with named keys) because the
 * chart presets are dataset-driven: they take `data` + the key names, so any
 * backend that produces rows of this shape drops straight in.
 */

/** A single-series time point: one metric per week. */
export interface WeeklyPoint {
  week: string
  value: number
}

/** A multi-series time point: one metric, split by cohort/label. */
export interface SeriesPoint {
  week: string
  value: number
  series: string
}

/** A category magnitude row (single or stacked). */
export interface CategoryRow {
  label: string
  value: number
  segment?: string
}

// ── Single-series trend — synthetic "adherence %" over 8 weeks ──
export const adherenceTrend: WeeklyPoint[] = [
  { week: 'W1', value: 62 },
  { week: 'W2', value: 68 },
  { week: 'W3', value: 65 },
  { week: 'W4', value: 74 },
  { week: 'W5', value: 79 },
  { week: 'W6', value: 83 },
  { week: 'W7', value: 81 },
  { week: 'W8', value: 88 },
]

// ── Multi-series trend — synthetic three-cohort comparison ──
export const cohortTrend: SeriesPoint[] = [
  { week: 'W1', value: 40, series: 'Cohort A' },
  { week: 'W2', value: 46, series: 'Cohort A' },
  { week: 'W3', value: 55, series: 'Cohort A' },
  { week: 'W4', value: 61, series: 'Cohort A' },
  { week: 'W1', value: 58, series: 'Cohort B' },
  { week: 'W2', value: 54, series: 'Cohort B' },
  { week: 'W3', value: 60, series: 'Cohort B' },
  { week: 'W4', value: 66, series: 'Cohort B' },
  { week: 'W1', value: 30, series: 'Cohort C' },
  { week: 'W2', value: 38, series: 'Cohort C' },
  { week: 'W3', value: 41, series: 'Cohort C' },
  { week: 'W4', value: 52, series: 'Cohort C' },
]

// ── Single-series bars — synthetic doses logged per day ──
export const dosesByDay: CategoryRow[] = [
  { label: 'Mon', value: 3 },
  { label: 'Tue', value: 4 },
  { label: 'Wed', value: 2 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 3 },
  { label: 'Sat', value: 1 },
  { label: 'Sun', value: 2 },
]

// ── Stacked bars — synthetic dose types per day ──
export const doseTypesByDay: CategoryRow[] = [
  { label: 'Mon', value: 2, segment: 'Morning' },
  { label: 'Mon', value: 1, segment: 'Evening' },
  { label: 'Tue', value: 2, segment: 'Morning' },
  { label: 'Tue', value: 2, segment: 'Evening' },
  { label: 'Wed', value: 1, segment: 'Morning' },
  { label: 'Wed', value: 1, segment: 'Evening' },
  { label: 'Thu', value: 3, segment: 'Morning' },
  { label: 'Thu', value: 1, segment: 'Evening' },
  { label: 'Fri', value: 2, segment: 'Morning' },
  { label: 'Fri', value: 1, segment: 'Evening' },
]

// ── Donut / pie — synthetic treatment-plan breakdown ──
export interface SliceRow { name: string, value: number }
export const planBreakdown: SliceRow[] = [
  { name: 'Supplements', value: 42 },
  { name: 'Lab tests', value: 18 },
  { name: 'Lifestyle', value: 27 },
  { name: 'Follow-ups', value: 13 },
]

// ── Gauge — a single synthetic health score (0–100) ──
export const healthScore = 78

// ── Scatter — synthetic biomarker correlation ──
export interface PointRow { x: number, y: number }
export const biomarkerScatter: PointRow[] = [
  { x: 22, y: 61 }, { x: 28, y: 66 }, { x: 31, y: 64 }, { x: 35, y: 72 },
  { x: 38, y: 70 }, { x: 41, y: 77 }, { x: 44, y: 74 }, { x: 47, y: 81 },
  { x: 52, y: 83 }, { x: 55, y: 79 }, { x: 58, y: 88 }, { x: 63, y: 90 },
]

// ── Radar — synthetic body-system profile (two profiles) ──
export interface RadarIndicator { name: string, max: number }
export const systemIndicators: RadarIndicator[] = [
  { name: 'Cardio', max: 100 },
  { name: 'Metabolic', max: 100 },
  { name: 'Sleep', max: 100 },
  { name: 'Stress', max: 100 },
  { name: 'Fitness', max: 100 },
  { name: 'Nutrition', max: 100 },
]
export const systemProfiles = [
  { name: 'Baseline', values: [62, 55, 48, 40, 58, 52] },
  { name: 'Current', values: [78, 70, 66, 61, 74, 69] },
]

// ── Heatmap — synthetic adherence intensity, weekday × week ──
export interface HeatCell { day: string, week: string, value: number }
export const adherenceHeat: HeatCell[] = (() => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const weeks = ['W1', 'W2', 'W3', 'W4']
  // Deterministic synthetic pattern (no RNG) — trends upward over weeks, dips on weekends.
  const cells: HeatCell[] = []
  weeks.forEach((week, wi) => {
    days.forEach((day, di) => {
      const weekend = di >= 5 ? 2 : 0
      cells.push({ day, week, value: Math.max(0, 3 + wi - weekend + (di % 2)) })
    })
  })
  return cells
})()
