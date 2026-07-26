<!--
  src/components/charts/ScatterChart.vue

  A themed scatter plot — correlation between two measures (e.g. two
  biomarkers). Both axes are value axes. Optional `series` groups points into
  colored cohorts with a legend.

  Dataset-driven: pass rows + the x/y keys; holds no numbers itself.
-->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { baseChartOption, valueAxis } from './baseOption'
import { useChartTheme } from './useChartTheme'

const props = withDefaults(defineProps<{
  /** Rows to plot; each is one point. */
  data: readonly unknown[]
  /** Row key for the horizontal value. */
  x: string
  /** Row key for the vertical value. */
  y: string
  /** Optional row key that groups points into colored series. */
  series?: string
  xLabel?: string
  yLabel?: string
  title: string
  height?: number
}>(), {
  height: 260,
})

const th = useChartTheme()

const option = computed<EChartsOption>(() => {
  const t = th.value
  const single = !props.series
  const rows = props.data as readonly Record<string, unknown>[]

  const groups = single
    ? [{ name: props.y, rows }]
    : [...new Set(rows.map(r => String(r[props.series!])))].map(name => ({
        name,
        rows: rows.filter(r => String(r[props.series!]) === name),
      }))

  return {
    ...baseChartOption(t),
    tooltip: { ...(baseChartOption(t).tooltip as object), trigger: 'item' },
    legend: { ...(baseChartOption(t).legend as object), show: !single },
    xAxis: { ...valueAxis(t, props.xLabel), splitLine: { show: false } },
    yAxis: valueAxis(t, props.yLabel),
    series: groups.map(g => ({
      name: g.name,
      type: 'scatter',
      symbolSize: t.marks.markerRadius * 2.5,
      itemStyle: { opacity: 0.85, borderColor: t.surface, borderWidth: 1 },
      emphasis: { focus: 'series' },
      data: g.rows.map(row => [row[props.x] as number, row[props.y] as number]),
    })),
  } as EChartsOption
})
</script>

<template>
  <BaseChart :option="option" :height="height" :title="title" />
</template>
