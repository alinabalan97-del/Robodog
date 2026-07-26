<!--
  src/components/charts/RadarChart.vue

  A themed radar — a multi-dimensional profile across shared axes
  (e.g. a patient's body-system scores, or comparing two profiles). Each profile
  is a validated categorical color; a legend names them.

  Dataset-driven: pass the axis `indicators` and one entry per profile in `series`.
-->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { baseChartOption, tooltipSwatch, withAlpha } from './baseOption'
import { useChartTheme } from './useChartTheme'

const props = withDefaults(defineProps<{
  /** The axes of the radar: a name + its max value, in order. */
  indicators: readonly { name: string, max: number }[]
  /** One entry per profile: a name + values aligned to `indicators`. */
  series: readonly { name: string, values: number[] }[]
  title: string
  height?: number
}>(), {
  height: 280,
})

const th = useChartTheme()

const option = computed<EChartsOption>(() => {
  const t = th.value
  const single = props.series.length <= 1

  return {
    ...baseChartOption(t),
    tooltip: {
      ...(baseChartOption(t).tooltip as object),
      trigger: 'item',
      // Radar lists every indicator; header carries the vertical swatch for consistency.
      formatter: (p: unknown) => {
        const param = p as { color: string, name?: string, value?: number[] }
        const vals = param.value ?? []
        const head = `<div style="display:flex;align-items:center;font-weight:600;margin-bottom:2px;">${tooltipSwatch(param.color)}${param.name ?? ''}</div>`
        const rows = props.indicators.map((ind, idx) =>
          `<div style="display:flex;margin:2px 0 2px 20px;"><span style="flex:1;margin-right:24px;">${ind.name}</span><span style="font-weight:600;">${vals[idx] ?? '—'}</span></div>`,
        ).join('')
        return head + rows
      },
    },
    legend: { ...(baseChartOption(t).legend as object), show: !single },
    radar: {
      indicator: props.indicators.map(i => ({ name: i.name, max: i.max })),
      center: ['50%', '54%'],
      radius: '66%',
      axisName: { color: t.axis, fontSize: t.type.tickLabel, fontFamily: t.fontFamily },
      axisLine: { lineStyle: { color: t.grid } },
      splitLine: { lineStyle: { color: t.grid } },
      splitArea: { areaStyle: { color: [withAlpha(t.ink, 0.02), 'transparent'] } },
    },
    series: [{
      type: 'radar',
      emphasis: { focus: 'series' },
      data: props.series.map((s, i) => ({
        name: s.name,
        value: s.values,
        lineStyle: { width: t.marks.lineWidth },
        areaStyle: { color: withAlpha(t.categorical[i % t.categorical.length], 0.15) },
        symbolSize: t.marks.markerRadius,
      })),
    }],
  } as EChartsOption
})
</script>

<template>
  <BaseChart :option="option" :height="height" :title="title" />
</template>
