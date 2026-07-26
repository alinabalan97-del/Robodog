<!--
  src/components/charts/BaseChart.vue

  THE BRIDGE between ECharts and Vue — built once, then never touched by a
  designer again. The preset charts (LineChart, BarChart, AreaChart) build a
  fully-themed ECharts `option` and hand it here; this component:

    1. Registers the ECharts modules the kit uses (tree-shaken — only what we
       need is bundled), so `vue-echarts` can render.
    2. Renders responsively (`autoresize`) inside a sized box.
    3. Re-renders on theme flip. Because the preset's `option` is reactive to
       useChartTheme, a light↔dark switch rebuilds the option and we pass
       `{ notMerge: true }` so no stale styling lingers.

  All look (colors, fonts, gridlines, tooltip, animation) is baked into `option`
  via baseChartOption — this file owns none of it.
-->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { use } from 'echarts/core'
import {
  BarChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
} from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

// Register once, at module load. Tree-shaken: only these charts/components ship.
use([
  CanvasRenderer,
  // cartesian
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  // non-cartesian
  PieChart,
  GaugeChart,
  RadarChart,
  // components
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
])

withDefaults(defineProps<{
  /** A fully-themed ECharts option, built by the preset chart. */
  option: EChartsOption
  /** Chart height in px (width is responsive). */
  height?: number
  /** Accessible name for the figure — feeds ECharts' aria description too. */
  title: string
}>(), {
  height: 260,
})
</script>

<template>
  <v-chart
    class="cly-chart"
    role="img"
    :aria-label="title"
    :option="option"
    :update-options="{ notMerge: true }"
    :style="{ height: `${height}px` }"
    autoresize
  />
</template>

<style scoped>
.cly-chart {
  width: 100%;
}
</style>
