<!--
  src/components/charts/BarChart.vue

  A themed bar chart — magnitude across categories. Rounded 4px data-end,
  recessive grid, per-bar hover tooltip, entrance animation — all from the DS.

  Single series → azure bars, no legend.
  Stacked       → pass `series`; segments stack with a validated categorical color
                  each, a surface-colored gap between them, and a legend.

  Dataset-driven: holds no numbers; renders the rows it's handed.
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
  /** Row key for the category axis. */
  x: string
  /** Row key for the measured value. */
  y: string
  /** Optional row key that stacks the bars into colored segments. */
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
  const pv = pivot(props.data, props.x, props.y, props.series)
  const r = t.marks.barCornerRadius

  return {
    ...baseChartOption(t),
    legend: { ...(baseChartOption(t).legend as object), show: !single },
    tooltip: { ...(baseChartOption(t).tooltip as object), trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { ...categoryAxis(t, props.xLabel, true), data: pv.categories },
    yAxis: valueAxis(t, props.yLabel),
    series: pv.series.map(s => ({
      name: s.name,
      type: 'bar',
      data: s.values,
      barMaxWidth: 36,
      ...(single ? {} : { stack: 'total' }),
      itemStyle: single
        // single: round the top (data-end) only
        ? { borderRadius: [r, r, 0, 0] }
        // stacked: a 2px surface-colored border fakes the gap between segments
        : { borderColor: t.surface, borderWidth: t.marks.surfaceGap, borderRadius: [r, r, r, r] },
      emphasis: { focus: 'series' },
    })),
  } as EChartsOption
})
</script>

<template>
  <BaseChart :option="option" :height="height" :title="title" />
</template>
