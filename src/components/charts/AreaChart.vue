<!--
  src/components/charts/AreaChart.vue

  A themed area chart — a single metric over time, with a soft gradient
  fill under a crisp 2px edge. Best for one headline trend (adherence, a vital)
  where the filled area emphasises accumulation/volume.

  Single series → azure gradient fill + edge, no legend.
  Stacked       → pass `series`; areas stack with a categorical color each + legend.

  Dataset-driven: holds no numbers; renders the rows it's handed. (For many
  overlapping series, prefer LineChart — stacked areas get hard to read past ~4.)
-->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { baseChartOption, categoryAxis, pivot, valueAxis, withAlpha } from './baseOption'
import { useChartTheme } from './useChartTheme'

const props = withDefaults(defineProps<{
  data: readonly unknown[]
  x: string
  y: string
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

  return {
    ...baseChartOption(t),
    legend: { ...(baseChartOption(t).legend as object), show: !single },
    xAxis: { ...categoryAxis(t, props.xLabel, false), data: pv.categories },
    yAxis: valueAxis(t, props.yLabel),
    series: pv.series.map((s, i) => ({
      name: s.name,
      type: 'line',
      data: s.values,
      smooth: true,
      showSymbol: false,
      symbolSize: t.marks.markerRadius * 2,
      lineStyle: { width: t.marks.lineWidth },
      ...(single ? {} : { stack: 'total' }),
      areaStyle: single
        // single: a soft top→bottom gradient of the brand color
        ? {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(t.categorical[0], 0.35) },
                { offset: 1, color: withAlpha(t.categorical[0], 0.02) },
              ],
            },
          }
        // stacked: flat fills read the stack; per-series color comes from the palette
        : { color: withAlpha(t.categorical[i % t.categorical.length], 0.85) },
      emphasis: { focus: 'series' },
    })),
  } as EChartsOption
})
</script>

<template>
  <BaseChart :option="option" :height="height" :title="title" />
</template>
