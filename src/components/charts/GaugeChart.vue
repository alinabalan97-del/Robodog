<!--
  src/components/charts/GaugeChart.vue

  A themed gauge — a single KPI/score against a range (health score,
  adherence %, a risk index). Rich, glanceable, dashboard-friendly.

  Dataset-driven: pass the value + optional range/label; holds no number itself.
-->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { baseChartOption, withAlpha } from './baseOption'
import { useChartTheme } from './useChartTheme'

const props = withDefaults(defineProps<{
  /** The value to display. */
  value: number
  /** Range bounds (defaults 0–100). */
  min?: number
  max?: number
  /** Unit shown after the value, e.g. '%' or 'pts'. */
  unit?: string
  /** Caption under the number. */
  label?: string
  title: string
  height?: number
}>(), {
  min: 0,
  max: 100,
  unit: '',
  height: 260,
})

const th = useChartTheme()

const option = computed<EChartsOption>(() => {
  const t = th.value
  const accent = t.categorical[0]

  return {
    ...baseChartOption(t),
    tooltip: { show: false },
    legend: { show: false },
    series: [{
      type: 'gauge',
      min: props.min,
      max: props.max,
      startAngle: 210,
      endAngle: -30,
      radius: '92%',
      center: ['50%', '58%'],
      progress: { show: true, width: 14, roundCap: true, itemStyle: { color: accent } },
      axisLine: { lineStyle: { width: 14, color: [[1, withAlpha(t.ink, t.isDark ? 0.16 : 0.1)]] } },
      pointer: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      anchor: { show: false },
      title: {
        offsetCenter: [0, '28%'],
        color: t.axis,
        fontSize: t.type.legendLabel,
        fontFamily: t.fontFamily,
      },
      detail: {
        valueAnimation: true,
        offsetCenter: [0, '-8%'],
        formatter: (v: number) => `${Math.round(v)}${props.unit}`,
        color: t.ink,
        fontSize: 34,
        fontWeight: 'bolder',
        fontFamily: t.fontFamily,
      },
      data: [{ value: props.value, name: props.label ?? '' }],
    }],
  } as EChartsOption
})
</script>

<template>
  <BaseChart :option="option" :height="height" :title="title" />
</template>
