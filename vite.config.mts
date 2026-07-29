import { fileURLToPath, URL } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import Fonts from 'unplugin-fonts/vite'
import { defineConfig } from 'vite'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    Vue({
      template: { transformAssetUrls },
    }),
    // https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
    Vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/styles/settings.scss',
      },
    }),
    Fonts({
      fontsource: {
        families: [
          {
            // Body font (see $body-font-family in src/styles/settings.scss). Load the
            // full weight range so MD3 utility classes (font-weight-medium = 500, etc.)
            // actually render — without this the app falls back to system sans-serif
            // where 400/500 are visually indistinguishable.
            name: 'Inter',
            weights: [400, 500, 600, 700],
            styles: ['normal'],
          },
          {
            // Heading font (see $heading-font-family in src/styles/settings.scss).
            // The Figma type ramp uses Archivo SemiBold for section headings; the
            // body stays Inter. Only 600 is referenced today — 400/500/700 are
            // loaded so the scale has room without a second wiring pass.
            name: 'Archivo',
            weights: [400, 500, 600, 700],
            styles: ['normal'],
          },
          {
            // Vuetify's own default family and the last-resort fallback — keep it
            // registered even though $body-font-family names Inter.
            name: 'Roboto',
            weights: [100, 300, 400, 500, 700, 900],
            styles: ['normal', 'italic'],
          },
        ],
      },
    }),
  ],
  define: { 'process.env': {} },
  // Pre-bundle every Vuetify component + the ECharts kit the app uses, so Vite's
  // dependency optimizer discovers them ALL at server start rather than on first
  // navigation to a lazy screen. Previously, hitting a screen that used a not-yet-
  // seen component made Vite re-optimize and FULL-PAGE-RELOAD mid-navigation —
  // which (pre-auth) dropped you back on Sign-in instead of the page you clicked.
  // Regenerate if screens adopt new components: grep `<v-…>` tags → map to modules.
  optimizeDeps: {
    include: [
      'vuetify/components/VAlert',
      'vuetify/components/VApp',
      'vuetify/components/VAppBar',
      'vuetify/components/VAutocomplete',
      'vuetify/components/VAvatar',
      'vuetify/components/VBadge',
      'vuetify/components/VBottomNavigation',
      'vuetify/components/VBreadcrumbs',
      'vuetify/components/VBtn',
      'vuetify/components/VBtnToggle',
      'vuetify/components/VCard',
      'vuetify/components/VCarousel',
      'vuetify/components/VCheckbox',
      'vuetify/components/VChip',
      'vuetify/components/VChipGroup',
      'vuetify/components/VCombobox',
      'vuetify/components/VDataTable',
      'vuetify/components/VDateInput',
      'vuetify/components/VDatePicker',
      'vuetify/components/VDefaultsProvider',
      'vuetify/components/VDialog',
      'vuetify/components/VDivider',
      'vuetify/components/VExpansionPanel',
      'vuetify/components/VFab',
      'vuetify/components/VFileInput',
      'vuetify/components/VFileUpload',
      'vuetify/components/VForm',
      'vuetify/components/VGrid',
      'vuetify/components/VIcon',
      'vuetify/components/VImg',
      'vuetify/components/VKbd',
      'vuetify/components/VLayout',
      'vuetify/components/VList',
      'vuetify/components/VMain',
      'vuetify/components/VMenu',
      'vuetify/components/VNumberInput',
      'vuetify/components/VOtpInput',
      'vuetify/components/VPagination',
      'vuetify/components/VProgressCircular',
      'vuetify/components/VProgressLinear',
      'vuetify/components/VRadio',
      'vuetify/components/VRadioGroup',
      'vuetify/components/VRangeSlider',
      'vuetify/components/VRating',
      'vuetify/components/VSelect',
      'vuetify/components/VSheet',
      'vuetify/components/VSkeletonLoader',
      'vuetify/components/VSlideGroup',
      'vuetify/components/VSlider',
      'vuetify/components/VSnackbar',
      'vuetify/components/VStepper',
      'vuetify/components/VStepperVertical',
      'vuetify/components/VSwitch',
      'vuetify/components/VTable',
      'vuetify/components/VTabs',
      'vuetify/components/VTextField',
      'vuetify/components/VTextarea',
      'vuetify/components/VTimePicker',
      'vuetify/components/VTimeline',
      'vuetify/components/VTooltip',
      'vuetify/components/VWindow',
      'echarts/core',
      'echarts/charts',
      'echarts/components',
      'echarts/renderers',
      'vue-echarts',
    ],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
    extensions: [
      '.js',
      '.json',
      '.jsx',
      '.mjs',
      '.ts',
      '.tsx',
      '.vue',
    ],
  },
  server: {
    port: 3000,
  },
})
