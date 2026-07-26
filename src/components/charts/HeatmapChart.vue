<!--
  src/components/charts/HeatmapChart.vue

  A themed heatmap — intensity of one metric across two categorical
  dimensions (e.g. adherence by weekday × week). This is the preset that uses the
  SEQUENTIAL palette from chartTheme.ts (low→high), re-stepped per light/dark.

  Dataset-driven: pass rows + the x/y/value keys; holds no numbers itself.
-->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { baseChartOption, categoryAxis } from './baseOption'
import { useChartTheme } from './useChartTheme'

const props = withDefaults(defineProps<{
  /** Rows to plot; each is one cell. */
  data: readonly unknown[]
  /** Row key for the horizontal category. */
  x: string
  /** Row key for the vertical category. */
  y: string
  /** Row key for the cell's value (drives the color intensity). */
  value: string
  xLabel?: string
  yLabel?: string
  title: string
  height?: number
}>(), {
  height: 280,
})

const th = useChartTheme()

const option = computed<EChartsOption>(() => {
  const t = th.value
  const rows = props.data as readonly Record<string, unknown>[]
  const xs = [...new Set(rows.map(r => String(r[props.x])))]
  const ys = [...new Set(rows.map(r => String(r[props.y])))]
  const values = rows.map(r => r[props.value] as number)
  const min = Math.min(...values)
  const max = Math.max(...values)

  return {
    ...baseChartOption(t),
    grid: { left: 8, right: 16, top: 24, bottom: 56, containLabel: true },
    tooltip: { ...(baseChartOption(t).tooltip as object), trigger: 'item' },
    legend: { show: false },
    xAxis: { ...categoryAxis(t, props.xLabel, true), data: xs, splitArea: { show: true } },
    yAxis: { ...categoryAxis(t, props.yLabel, true), type: 'category', data: ys, splitArea: { show: true } },
    visualMap: {
      min,
      max,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 12,
      inRange: { color: [...t.sequential] },
      textStyle: { color: t.axis, fontSize: t.type.legendLabel, fontFamily: t.fontFamily },
    },
    series: [{
      type: 'heatmap',
      data: rows.map(r => [String(r[props.x]), String(r[props.y]), r[props.value] as number]),
      itemStyle: { borderColor: t.surface, borderWidth: t.marks.surfaceGap, borderRadius: 2 },
      emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } },
    }],
  } as EChartsOption
})
</script>

<template>
  <BaseChart :option="option" :height="height" :title="title" />
</template>
