/**
 * src/components/charts/index.ts
 *
 * The chart kit — one import point for every pre-themed chart.
 * Components must be imported explicitly (this project has no auto-import for
 * local components), e.g.:
 *
 *     import { LineChart, BarChart, AreaChart } from '@/components/charts'
 *
 * All three are pure views over a typed dataset and inherit the data-viz DS from
 * src/data/chartTheme.ts (compiled to an ECharts theme in baseOption.ts) via
 * useChartTheme — a designer never touches the default ECharts look.
 */
export { default as LineChart } from './LineChart.vue'
export { default as BarChart } from './BarChart.vue'
export { default as AreaChart } from './AreaChart.vue'
export { default as DonutChart } from './DonutChart.vue'
export { default as GaugeChart } from './GaugeChart.vue'
export { default as ScatterChart } from './ScatterChart.vue'
export { default as RadarChart } from './RadarChart.vue'
export { default as HeatmapChart } from './HeatmapChart.vue'
export { default as BaseChart } from './BaseChart.vue'
export { useChartTheme } from './useChartTheme'
export type { ResolvedChartTheme } from './useChartTheme'
export { baseChartOption, categoryAxis, valueAxis, pivot, withAlpha } from './baseOption'
