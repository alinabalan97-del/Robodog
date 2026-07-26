<!--
  src/components/charts/DonutChart.vue

  A themed donut (or pie) — part-to-whole. Each slice takes a validated
  categorical color, with a surface-colored gap between slices and a legend.

  Use for composition ("what share of X is each category"). Keep it to ~5-6 slices;
  past that a bar chart reads more accurately (an intentional DS guardrail).

  Dataset-driven: pass rows + the name/value keys; holds no numbers itself.
-->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { baseChartOption } from './baseOption'
import { useChartTheme } from './useChartTheme'

const props = withDefaults(defineProps<{
  /** Rows to plot; each contributes one slice. */
  data: readonly unknown[]
  /** Row key for the slice label. */
  name: string
  /** Row key for the slice value. */
  value: string
  /** 'donut' (default, has a hole) or 'pie' (solid). */
  variant?: 'donut' | 'pie'
  title: string
  height?: number
}>(), {
  variant: 'donut',
  height: 260,
})

const th = useChartTheme()

const option = computed<EChartsOption>(() => {
  const t = th.value
  const rows = props.data as readonly Record<string, unknown>[]
  const r = t.marks.barCornerRadius

  return {
    ...baseChartOption(t),
    tooltip: { ...(baseChartOption(t).tooltip as object), trigger: 'item' },
    legend: { ...(baseChartOption(t).legend as object), show: true, top: undefined, left: 0, orient: 'vertical' },
    series: [{
      type: 'pie',
      radius: props.variant === 'donut' ? ['55%', '80%'] : ['0%', '80%'],
      center: ['62%', '52%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: t.surface, borderWidth: t.marks.surfaceGap, borderRadius: r },
      label: { color: t.ink, fontSize: t.type.tickLabel, fontFamily: t.fontFamily },
      labelLine: { lineStyle: { color: t.axis } },
      emphasis: { scaleSize: 6 },
      data: rows.map(row => ({ name: String(row[props.name]), value: row[props.value] as number })),
    }],
  } as EChartsOption
})
</script>

<template>
  <BaseChart :option="option" :height="height" :title="title" />
</template>
