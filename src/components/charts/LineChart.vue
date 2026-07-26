<!--
  src/components/charts/LineChart.vue

  A themed line/trend chart — change over time. A designer passes typed
  data and the key names; the house look (colors, 2px marks, recessive grid,
  hover tooltip, legend, entrance animation) is baked in via baseChartOption.

  Single series → one azure line, no legend (the title names it).
  Multi series  → one validated categorical color per series + a legend.

  Dataset-driven: holds NO figures — renders whatever rows it's handed (seed them
  from a typed dataset in src/data/, per the house rules).
-->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { baseChartOption, categoryAxis, pivot, valueAxis } from './baseOption'
import { useChartTheme } from './useChartTheme'

const props = withDefaults(defineProps<{
  /** The rows to plot (any array of row objects; seed from a typed src/data dataset). */
  data: readonly unknown[]
  /** Row key for the horizontal axis (time/category). */
  x: string
  /** Row key for the vertical axis (the measured value). */
  y: string
  /** Optional row key that splits the data into colored series. */
  series?: string
  /** Axis titles. */
  xLabel?: string
  yLabel?: string
  /** Accessible + on-figure name for the chart. */
  title: string
  height?: number
}>(), {
  height: 260,
})

const th = useChartTheme()

const option = computed<EChartsOption>(() => {
  const t = th.value
  const single = !props.series
  const pv = pivot(props.data, props.x, props.y, props.series)

  return {
    ...baseChartOption(t),
    legend: { ...(baseChartOption(t).legend as object), show: !single },
    xAxis: { ...categoryAxis(t, props.xLabel, false), data: pv.categories },
    yAxis: valueAxis(t, props.yLabel),
    series: pv.series.map(s => ({
      name: s.name,
      type: 'line',
      data: s.values,
      smooth: true,
      showSymbol: false,          // clean line; a symbol appears on hover
      symbolSize: t.marks.markerRadius * 2,
      lineStyle: { width: t.marks.lineWidth },
      emphasis: { focus: 'series' },
      connectNulls: false,
    })),
  } as EChartsOption
})
</script>

<template>
  <BaseChart :option="option" :height="height" :title="title" />
</template>
