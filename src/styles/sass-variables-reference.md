# Vuetify SASS Variables — project reference

> Auto-generated from the installed **vuetify 4.1.2** package. These are BUILD-TIME tokens.
> Set them in `src/styles/settings.scss` inside the `@use 'vuetify/settings' with (...)` block.
> **Restart the dev server after changing any of these** (unlike theme.colors, which hot-reload).
> Values shown are Vuetify's defaults. Scoped to globals + the components in the Storybook (src/screens/Storybook.vue).

## Global variables (cascade into everything)

### Global  (38 vars)

| Variable | Default |
|---|---|
| `$color-pack` | `true` |
| `$reset` | `true` |
| `$misc` | `()` |
| `$body-font-family` | `var(--v-font-body, 'Roboto', sans-serif)` |
| `$font-size-root` | `1rem` |
| `$line-height-root` | `1.5` |
| `$border-color-root` | `rgba(var(--v-border-color), var(--v-border-opacity))` |
| `$border-radius-root` | `4px` |
| `$border-style-root` | `solid` |
| `$border-width-root` | `thin` |
| `$transition-duration-root` | `0.3s` |
| `$transition-move-duration-root` | `0.5s` |
| `$borders` | `()` |
| `$border-opacities` | `()` |
| `$opacities` | `()` |
| `$states` | `()` |
| `$rounded` | `()` |
| `$spacer` | `4px` |
| `$spacers-steps` | `16` |
| `$spacers` | `()` |
| `$negative-spacers` | `()` |
| `$grid-breakpoints` | `()` |
| `$grid-gutter` | `$spacer * 6` |
| `$grid-density` | `('default': 0, 'comfortable': -1, 'compact': -2)` |
| `$grid-columns` | `12` |
| `$container-padding-x` | `$spacer * 4` |
| `$container-max-widths` | `()` |
| `$display-breakpoints` | `()` |
| `$font-weights` | `()` |
| `$heading-font-family` | `var(--v-font-heading, #{$body-font-family})` |
| `$typography` | `()` |
| `$flat-typography` | `()` |
| `$standard-easing` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `$decelerated-easing` | `cubic-bezier(0.0, 0, 0.2, 1)` — Entering |
| `$accelerated-easing` | `cubic-bezier(0.4, 0, 1, 1)` — Leaving |
| `$blockquote-font-size` | `18px` |
| `$blockquote-font-weight` | `300` |
| `$size-scale` | `$spacer * 2` |

## Per-component variables (Storybook components)

### VBtn  (52 vars)

| Variable | Default |
|---|---|
| `$button-colored-disabled` | `true` |
| `$button-background` | `rgb(var(--v-theme-surface))` |
| `$button-color` | `tools.theme-color('on-surface', var(--v-high-emphasis-opacity))` |
| `$button-banner-actions-padding` | `0 8px` — @deprecated |
| `$button-pagination-active-overlay-opacity` | `var(--v-border-opacity)` |
| `$button-pagination-border-radius` | `settings.$border-radius-root` |
| `$button-pagination-padding-inline` | `5px` |
| `$button-pagination-rounded-border-radius` | `map.get(settings.$rounded, 'circle')` |
| `$button-border-color` | `settings.$border-color-root` |
| `$button-border-radius` | `settings.$border-radius-root` |
| `$button-border-style` | `settings.$border-style-root` |
| `$button-border-thin-width` | `thin` |
| `$button-border-width` | `0` |
| `$button-card-actions-padding` | `0 8px` — @deprecated |
| `$button-content-transition` | `transform, opacity .2s settings.$standard-easing` |
| `$button-disabled-opacity` | `0.26` |
| `$button-disabled-overlay` | `0.12` |
| `$button-elevation` | `('default': 1, 'hover': 2, 'active': 1)` |
| `$button-font-size` | `tools.map-deep-get(settings.$typography, 'label-large', 'size')` |
| `$button-font-weight` | `tools.map-deep-get(settings.$typography, 'label-large', 'weight')` |
| `$button-height` | `36px` |
| `$button-stacked-height` | `72px` |
| `$button-stacked-gap` | `4px` |
| `$button-icon-border-radius` | `map.get(settings.$rounded, 'circle')` |
| `$button-icon-font-size` | `1rem` |
| `$button-line-height` | `normal` |
| `$button-loader-size` | `1.5em` |
| `$button-stacked-line-height` | `1.25` |
| `$button-plain-opacity` | `.62` |
| `$button-padding-ratio` | `2.25` |
| `$button-stacked-padding-ratio` | `4.5` |
| `$button-margin-start-multiplier` | `-9` |
| `$button-margin-end-multiplier` | `4.5` |
| `$button-margin-start` | `calc(var(--v-btn-height) / #{$button-margin-start-multiplier})` |
| `$button-margin-end` | `calc(var(--v-btn-height) / #{$button-margin-end-multiplier})` |
| `$button-max-width` | `100%` |
| `$button-positions` | `absolute fixed` |
| `$button-text-letter-spacing` | `tools.map-deep-get(settings.$typography, 'label-large', 'letter-spa...` |
| `$button-text-transform` | `none` |
| `$button-transition-property` | `box-shadow, transform, opacity, background` |
| `$button-vertical-align` | `middle` |
| `$button-width-ratio` | `math.div(16, 9)` |
| `$button-snackbar-action-padding` | `0 8px` — @deprecated |
| `$button-slim-padding` | `0 8px` |
| `$button-stacked-width-ratio` | `1` |
| `$button-rounded-border-radius` | `map.get(settings.$rounded, 'xl')` |
| `$button-white-space` | `nowrap` |
| `$button-density` | `('default': 0, 'comfortable': -2, 'compact': -3)` |
| `$button-stacked-density` | `('default': 0, 'comfortable': -4, 'compact': -6)` |
| `$button-icon-density` | `('default': 3, 'comfortable': 0, 'compact': -2)` |
| `$button-sizes` | `()` |
| `$button-stacked-sizes` | `()` |

### VBtnGroup  (10 vars)

| Variable | Default |
|---|---|
| `$btn-group-background` | `transparent` |
| `$btn-group-border-color` | `settings.$border-color-root` |
| `$btn-group-border-radius` | `settings.$border-radius-root` |
| `$btn-group-border-style` | `settings.$border-style-root` |
| `$btn-group-border-thin-width` | `thin` |
| `$btn-group-border-width` | `0` |
| `$btn-group-color` | `tools.theme-color('on-surface', var(--v-high-emphasis-opacity))` |
| `$btn-group-height` | `48px` |
| `$btn-group-elevation` | `0` |
| `$btn-group-tile-border-radius` | `0` |

### VCheckbox  (3 vars)

| Variable | Default |
|---|---|
| `$checkbox-flex` | `0 1 auto` |
| `$checkbox-disabled-color` | `tools.theme-color('on-surface', var(--v-disabled-opacity))` |
| `$checkbox-error-color` | `rgb(var(--v-theme-error))` |

### VSelectionControl  (5 vars)

| Variable | Default |
|---|---|
| `$selection-control-disabled-color` | `tools.theme-color('on-surface', var(--v-disabled-opacity))` |
| `$selection-control-error-color` | `rgb(var(--v-theme-error))` |
| `$selection-control-density` | `('default': 0, 'comfortable': -1, 'compact': -3)` |
| `$selection-control-color` | `tools.theme-color('on-surface', var(--v-high-emphasis-opacity))` |
| `$selection-control-size` | `40px` |

### VSwitch  (49 vars)

| Variable | Default |
|---|---|
| `$switch-flex` | `0 1 auto` |
| `$switch-control-input-transition` | `.2s transform settings.$standard-easing` |
| `$switch-error-background-color` | `rgb(var(--v-theme-error))` |
| `$switch-error-color` | `rgb(var(--v-theme-on-error))` |
| `$switch-inset-thumb-height` | `24px` |
| `$switch-inset-thumb-width` | `24px` |
| `$switch-inset-thumb-off-height` | `16px` |
| `$switch-inset-thumb-off-width` | `16px` |
| `$switch-inset-thumb-off-scale` | `calc(#{$switch-inset-thumb-off-height} / #{$switch-inset-thumb-heig...` |
| `$switch-inset-thumb-pressed-scale` | `calc(28px / #{$switch-inset-thumb-height})` |
| `$switch-inset-track-border-radius` | `9999px` |
| `$switch-inset-track-height` | `32px` |
| `$switch-inset-track-width` | `52px` |
| `$switch-inset-track-opacity` | `1` |
| `$switch-inset-border-width` | `2px` |
| `$switch-inset-square-track-radius` | `6px` |
| `$switch-inset-square-thumb-radius` | `4px` |
| `$switch-inset-unselected-track-color` | `color-mix(in srgb, rgb(var(--v-theme-on-surface-variant)) 73%, #ccc)` |
| `$switch-inset-unselected-thumb-color` | `color-mix(in srgb, rgb(var(--v-theme-surface-variant)) 20%, #888)` |
| `$switch-inset-unselected-border-color` | `$switch-inset-unselected-thumb-color` |
| `$switch-inset-selected-track-color` | `color-mix(in srgb, rgb(var(--v-theme-surface-variant)) 90%, white)` |
| `$switch-inset-selected-thumb-color` | `color-mix(in srgb, rgb(var(--v-theme-on-surface-variant)) 80%, white)` |
| `$switch-focus-outline-color` | `rgb(var(--v-theme-surface-variant))` |
| `$switch-focus-outline-width` | `2px` |
| `$switch-focus-outline-offset` | `2px` |
| `$switch-inset-disabled-unselected-track-color` | `color-mix(in srgb, #{$switch-inset-unselected-track-color} 12%, tra...` |
| `$switch-inset-disabled-unselected-thumb-color` | `rgba(var(--v-theme-on-surface), .38)` |
| `$switch-inset-disabled-unselected-border-color` | `rgba(var(--v-theme-on-surface), .12)` |
| `$switch-inset-disabled-selected-track-color` | `rgba(var(--v-theme-on-surface), .12)` |
| `$switch-inset-disabled-selected-thumb-color` | `rgb(var(--v-theme-surface))` |
| `$switch-label-margin-inline-start` | `10px` |
| `$switch-loader-color` | `rgb(var(--v-theme-surface))` |
| `$switch-thumb-background` | `rgb(var(--v-theme-surface-bright))` |
| `$switch-thumb-color` | `rgb(var(--v-theme-on-surface-bright))` |
| `$switch-thumb-flat-background` | `rgb(var(--v-theme-surface-variant))` |
| `$switch-thumb-flat-color` | `rgb(var(--v-theme-on-surface-variant))` |
| `$switch-thumb-elevation` | `2` |
| `$switch-thumb-height` | `20px` |
| `$switch-thumb-width` | `20px` |
| `$switch-thumb-offset` | `2px` |
| `$switch-thumb-radius` | `50%` |
| `$switch-thumb-transition` | `.15s .05s transform settings.$decelerated-easing, .2s color setting...` |
| `$switch-thumb-vertical-transform` | `rotate(-90deg)` |
| `$switch-track-background` | `rgb(var(--v-theme-surface-variant))` |
| `$switch-track-radius` | `9999px` |
| `$switch-track-width` | `36px` |
| `$switch-track-height` | `14px` |
| `$switch-track-opacity` | `.6` |
| `$switch-track-transition` | `.2s background-color settings.$standard-easing` |

### VTextField  (7 vars)

| Variable | Default |
|---|---|
| `$text-field-affix-color` | `tools.theme-color('on-surface', var(--v-medium-emphasis-opacity))` |
| `$text-field-border-radius` | `settings.$border-radius-root` |
| `$text-field-disabled-affix-color` | `tools.theme-color('on-surface', var(--v-disabled-opacity))` |
| `$text-field-input-flex` | `1` |
| `$text-field-input-padding-end` | `0` |
| `$text-field-input-padding-start` | `6px` |
| `$text-field-input-transition` | `.15s opacity settings.$standard-easing` |

### VField  (40 vars)

| Variable | Default |
|---|---|
| `$field-border-radius` | `settings.$border-radius-root` |
| `$field-rounded-border-radius` | `map.get(settings.$rounded, 'xl')` |
| `$field-color` | `tools.theme-color('on-surface', var(--v-medium-emphasis-opacity))` |
| `$field-disabled-color` | `tools.theme-color('on-surface', var(--v-disabled-opacity))` |
| `$field-error-color` | `rgb(var(--v-theme-error))` |
| `$field-font-size` | `16px` |
| `$field-letter-spacing` | `.009375em` |
| `$field-max-width` | `100%` |
| `$field-transition-timing` | `.15s settings.$standard-easing` |
| `$field-subtle-transition-timing` | `250ms settings.$standard-easing` |
| `$field-underlined-margin-bottom` | `4px` |
| `$field-clearable-margin` | `4px` |
| `$field-clearable-transition` | `.15s opacity, .15s width settings.$standard-easing` |
| `$field-chip-height` | `24px` |
| `$field-control-solo-background` | `rgb(var(--v-theme-surface))` |
| `$field-control-solo-color` | `tools.theme-color('on-surface', var(--v-high-emphasis-opacity))` |
| `$field-control-solo-elevation` | `1` |
| `$field-control-solo-inverted-color` | `tools.theme-color('on-surface', var(--v-high-emphasis-opacity))` |
| `$field-control-solo-inverted-focused-color` | `rgb(var(--v-theme-on-surface-variant))` |
| `$field-control-filled-background` | `tools.theme-color('on-surface', var(--v-idle-opacity))` |
| `$field-control-padding-start` | `16px` |
| `$field-control-padding-end` | `16px` |
| `$field-control-padding-top` | `8px` |
| `$field-control-padding-bottom` | `4px` |
| `$field-control-affixed-padding` | `12px` |
| `$field-control-affixed-inner-padding` | `6px` |
| `$field-control-underlined-height` | `48px` |
| `$field-control-underlined-padding-bottom` | `2px` |
| `$field-control-height` | `56px` |
| `$field-input-opacity` | `var(--v-high-emphasis-opacity)` |
| `$field-input-padding-top` | `calc(var(--v-field-padding-top, $field-control-padding-top) + var(-...` |
| `$field-input-padding-bottom` | `var(--v-field-padding-bottom, $field-control-padding-bottom)` |
| `$field-input-column-gap` | `2px` |
| `$field-input-row-gap` | `8px` |
| `$field-label-floating-scale` | `.75` |
| `$field-outline-opacity` | `.38` |
| `$field-border-width` | `1px` |
| `$field-focused-border-width` | `2px` |
| `$field-overlay-filled-opacity` | `0.04` |
| `$field-overlay-focused-background-color` | `rgb(var(--v-theme-surface-variant))` |

### VInput  (17 vars)

| Variable | Default |
|---|---|
| `$input-density` | `('default': 0, 'comfortable': -2, 'compact': -4)` |
| `$input-control-height` | `56px` |
| `$input-flex` | `1 1 auto` |
| `$input-font-size` | `tools.map-deep-get(settings.$typography, 'body-large', 'size')` |
| `$input-font-weight` | `tools.map-deep-get(settings.$typography, 'body-large', 'weight')` |
| `$input-line-height` | `1.5` |
| `$input-chips-margin-top` | `null` |
| `$input-chips-margin-bottom` | `null` |
| `$input-details-font-size` | `.75rem` |
| `$input-details-font-weight` | `400` |
| `$input-details-letter-spacing` | `.0333333333em` |
| `$input-details-line-height` | `normal` |
| `$input-details-min-height` | `22px` |
| `$input-details-padding-above` | `6px` |
| `$input-details-padding-inline` | `16px` |
| `$input-details-transition` | `150ms settings.$standard-easing` |
| `$input-affix-margin-inside` | `16px` |

### VTextarea  (10 vars)

| Variable | Default |
|---|---|
| `$textarea-box-enclosed-prefix-margin-top` | `24px` |
| `$textarea-box-enclosed-single-outlined-label-top` | `18px` |
| `$textarea-box-enclosed-single-outlined-margin-top` | `10px` |
| `$textarea-dense-box-enclosed-single-outlined-margin-top` | `6px` |
| `$textarea-dense-append-prepend-margin-top` | `8px` |
| `$textarea-enclosed-text-slot-margin` | `-12px` |
| `$textarea-enclosed-text-slot-padding` | `12px` |
| `$textarea-prefix-padding-top` | `2px` |
| `$textarea-solo-append-padding` | `12px` |
| `$textarea-solo-append-prepend-margin-top` | `12px` |

### VFileInput  (3 vars)

| Variable | Default |
|---|---|
| `$file-input-chip-margin-inline-end` | `null` |
| `$file-input-chips-margin-top` | `null` |
| `$file-input-chips-margin-bottom` | `null` |

### VNumberInput  (1 vars)

| Variable | Default |
|---|---|
| `$number-input-inset-divider-size` | `55%` |

### VSelect  (7 vars)

| Variable | Default |
|---|---|
| `$select-content-border-radius` | `4px` |
| `$select-content-elevation` | `2` |
| `$select-line-height` | `1.75` |
| `$select-transition` | `.2s settings.$standard-easing` |
| `$select-chips-control-min-height` | `null` |
| `$select-chips-margin-top` | `null` |
| `$select-chips-margin-bottom` | `null` |

### VAutocomplete  (10 vars)

| Variable | Default |
|---|---|
| `$autocomplete-content-border-radius` | `4px` |
| `$autocomplete-content-elevation` | `2` |
| `$autocomplete-focused-input` | `64px` |
| `$autocomplete-input-buffer` | `2px` |
| `$autocomplete-line-height` | `1.75` |
| `$autocomplete-selection-gap` | `2px` |
| `$autocomplete-transition` | `.2s settings.$standard-easing` |
| `$autocomplete-chips-control-min-height` | `64px` |
| `$autocomplete-chips-margin-top` | `null` |
| `$autocomplete-chips-margin-bottom` | `null` |

### VCombobox  (10 vars)

| Variable | Default |
|---|---|
| `$combobox-content-border-radius` | `4px` |
| `$combobox-content-elevation` | `2` |
| `$combobox-focused-input` | `64px` |
| `$combobox-input-buffer` | `2px` |
| `$combobox-line-height` | `1.75` |
| `$combobox-selection-gap` | `2px` |
| `$combobox-transition` | `.2s settings.$standard-easing` |
| `$combobox-chips-control-min-height` | `null` |
| `$combobox-chips-margin-top` | `null` |
| `$combobox-chips-margin-bottom` | `null` |

### VSlider  (31 vars)

| Variable | Default |
|---|---|
| `$slider-horizontal-start` | `8px` |
| `$slider-horizontal-min-height` | `32px` |
| `$slider-horizontal-end` | `8px` |
| `$slider-label-margin-end` | `12px` |
| `$slider-label-margin-start` | `12px` |
| `$slider-state-track-background-opacity` | `0.4` |
| `$slider-thumb-hover-opacity` | `var(--v-hover-opacity)` |
| `$slider-thumb-focus-opacity` | `var(--v-focus-opacity)` |
| `$slider-thumb-pressed-opacity` | `var(--v-pressed-opacity)` |
| `$slider-thumb-border-radius` | `50%` |
| `$slider-thumb-focused-size-increase` | `24px` |
| `$slider-thumb-label-font-size` | `tools.map-deep-get(settings.$typography, 'label-small', 'size')` |
| `$slider-thumb-label-border-radius` | `4px` |
| `$slider-thumb-label-height` | `25px` |
| `$slider-thumb-label-min-width` | `35px` |
| `$slider-thumb-label-wedge-size` | `6px` |
| `$slider-thumb-label-offset` | `calc(var(--v-slider-thumb-size) / 2)` |
| `$slider-thumb-label-transition` | `.2s settings.$accelerated-easing` |
| `$slider-thumb-label-padding` | `6px` |
| `$slider-thumb-touch-size` | `42px` |
| `$slider-tick-background` | `rgb(var(--v-theme-surface-light))` |
| `$slider-tick-border-radius` | `2px` |
| `$slider-tick-label-margin-top` | `8px` |
| `$slider-tick-label-margin-start` | `12px` |
| `$slider-track-border-radius` | `6px` |
| `$slider-track-active-size-offset` | `2px` |
| `$slider-transition` | `.3s cubic-bezier(0.25, 0.8, 0.5, 1)` |
| `$slider-vertical-margin-bottom` | `12px` |
| `$slider-vertical-margin-top` | `12px` |
| `$slider-vertical-min-height` | `300px` |
| `$slider-track-active-size` | `calc(var(--v-slider-track-size) + #{$slider-track-active-size-offset})` |

### VRating  (7 vars)

| Variable | Default |
|---|---|
| `$rating-item-focused-button-overlay-opacity` | `var(--v-hover-opacity)` |
| `$rating-item-align-items` | `center` |
| `$rating-item-button-opacity` | `1` |
| `$rating-item-button-transition-property` | `transform` |
| `$rating-item-icon-transform` | `scale(1.25)` |
| `$rating-item-transition-timing-function` | `settings.$decelerated-easing` |
| `$rating-white-space` | `nowrap` |

### VChip  (22 vars)

| Variable | Default |
|---|---|
| `$chip-background` | `rgb(var(--v-theme-surface-variant))` |
| `$chip-border-color` | `settings.$border-color-root` |
| `$chip-border-radius` | `map.get(settings.$rounded, "pill")` |
| `$chip-border-style` | `settings.$border-style-root` |
| `$chip-border-thin-width` | `thin` |
| `$chip-border-width` | `0` |
| `$chip-close-size` | `18px` |
| `$chip-color` | `rgb(var(--v-theme-on-surface-variant))` |
| `$chip-density` | `("default": 0, "comfortable": -1, "compact": -2)` |
| `$chip-disabled-opacity` | `0.3` |
| `$chip-elevation` | `1` |
| `$chip-font-size` | `tools.map-deep-get(settings.$typography, "label-large", "size")` |
| `$chip-font-weight` | `400` |
| `$chip-height` | `32px` |
| `$chip-icon-size-multiplier` | `calc(18/21)` |
| `$chip-label-border-radius` | `settings.$border-radius-root` |
| `$chip-max-width` | `100%` |
| `$chip-overflow` | `hidden` |
| `$chip-padding-ratio` | `2 + math.div(2, 3)` |
| `$chip-plain-opacity` | `.62` |
| `$chip-filter-transition` | `.15s settings.$standard-easing` |
| `$chip-white-space` | `nowrap` |

### VChipGroup  (3 vars)

| Variable | Default |
|---|---|
| `$chip-group-selected-opacity` | `var(--v-activated-opacity)` |
| `$chip-group-padding` | `4px 0` |
| `$chip-group-margin` | `4px 8px 4px 0` |

### VCard  (80 vars)

| Variable | Default |
|---|---|
| `$card-append-padding-inline-start` | `.5rem` |
| `$card-background` | `rgb(var(--v-theme-surface))` |
| `$card-border-color` | `settings.$border-color-root` |
| `$card-border-radius` | `settings.$border-radius-root` |
| `$card-border-style` | `settings.$border-style-root` |
| `$card-border-thin-width` | `thin` |
| `$card-border-width` | `0` |
| `$card-color` | `tools.theme-color('on-surface', var(--v-high-emphasis-opacity))` |
| `$card-disabled-opacity` | `0.6` |
| `$card-elevation` | `1` |
| `$card-loader-top` | `0` |
| `$card-loader-bottom` | `auto` |
| `$card-hover-elevation` | `3` |
| `$card-img-flex` | `1 1 auto` |
| `$card-item-align-items` | `center` |
| `$card-item-padding` | `.625rem 1rem` |
| `$card-overflow-wrap` | `break-word` |
| `$card-padding` | `0` |
| `$card-plain-opacity` | `.62` |
| `$card-positions` | `absolute fixed` |
| `$card-prepend-padding-inline-end` | `.5rem` |
| `$card-transition-duration` | `0.28s` |
| `$card-transition-property` | `box-shadow, opacity, background, --v-elevation-overlay` |
| `$card-transition-timing-function` | `settings.$standard-easing` |
| `$card-actions-flex` | `none` |
| `$card-actions-min-height` | `52px` |
| `$card-actions-padding` | `.5rem` |
| `$button-card-actions-margin` | `.5rem` — deprecated |
| `$card-actions-gap` | `$button-card-actions-margin` |
| `$card-header-flex` | `none` |
| `$card-title-comfortable-line-height` | `1.75rem` |
| `$card-title-compact-line-height` | `1.55rem` |
| `$card-title-flex` | `none` |
| `$card-title-font-size` | `tools.map-deep-get(settings.$typography, 'title-large', 'size')` |
| `$card-title-font-weight` | `tools.map-deep-get(settings.$typography, 'title-large', 'weight')` |
| `$card-title-header-padding` | `0` |
| `$card-title-hyphens` | `auto` |
| `$card-title-letter-spacing` | `tools.map-deep-get(settings.$typography, 'title-large', 'letter-spa...` |
| `$card-title-line-height` | `tools.map-deep-get(settings.$typography, 'title-large', 'line-height')` |
| `$card-title-overflow-wrap` | `normal` |
| `$card-title-overflow` | `hidden` |
| `$card-title-padding` | `.5rem 1rem` |
| `$card-title-text-overflow` | `ellipsis` |
| `$card-title-text-transform` | `none` |
| `$card-title-white-space` | `nowrap` |
| `$card-title-word-break` | `normal` |
| `$card-title-word-wrap` | `break-word` |
| `$card-subtitle-color` | `tools.theme-color('on-surface', var(--v-medium-emphasis-opacity))` |
| `$card-subtitle-comfortable-line-height` | `1.125rem` |
| `$card-subtitle-compact-line-height` | `1rem` |
| `$card-subtitle-flex` | `none` |
| `$card-subtitle-font-size` | `tools.map-deep-get(settings.$typography, 'body-medium', 'size')` |
| `$card-subtitle-font-weight` | `tools.map-deep-get(settings.$typography, 'body-medium', 'weight')` |
| `$card-subtitle-header-padding` | `0 0 .25rem` |
| `$card-subtitle-letter-spacing` | `tools.map-deep-get(settings.$typography, 'body-medium', 'letter-spa...` |
| `$card-subtitle-line-height` | `tools.map-deep-get(settings.$typography, 'body-medium', 'line-height')` |
| `$card-subtitle-opacity` | `var(--v-card-subtitle-opacity, var(--v-medium-emphasis-opacity))` |
| `$card-subtitle-overflow` | `hidden` |
| `$card-subtitle-padding` | `0 1rem` |
| `$card-subtitle-text-overflow` | `ellipsis` |
| `$card-subtitle-text-transform` | `none` |
| `$card-subtitle-white-space` | `nowrap` |
| `$card-text-comfortable-line-height` | `1.2rem` |
| `$card-text-compact-line-height` | `1.15rem` |
| `$card-text-flex` | `1 1 auto` |
| `$card-text-font-size` | `tools.map-deep-get(settings.$typography, 'body-medium', 'size')` |
| `$card-text-font-weight` | `tools.map-deep-get(settings.$typography, 'body-medium', 'weight')` |
| `$card-text-opacity` | `var(--v-card-text-opacity, 1)` |
| `$card-text-letter-spacing` | `tools.map-deep-get(settings.$typography, 'body-medium', 'letter-spa...` |
| `$card-text-line-height` | `tools.map-deep-get(settings.$typography, 'body-medium', 'line-height')` |
| `$card-text-padding` | `1rem` |
| `$card-text-text-transform` | `none` |
| `$card-title-densities` | `()` |
| `$card-subtitle-density-line-height` | `()` |
| `$card-text-density-line-height` | `()` |
| `$card-avatar-align-self` | `flex-start` |
| `$card-avatar-header-padding` | `0` |
| `$card-avatar-padding` | `.5rem 1rem` |
| `$card-title-padding-top` | `1rem` |
| `$card-text-padding-bottom` | `1rem` |

### VSheet  (10 vars)

| Variable | Default |
|---|---|
| `$sheet-background` | `rgb(var(--v-theme-surface))` |
| `$sheet-border-color` | `settings.$border-color-root` |
| `$sheet-border-radius` | `0` |
| `$sheet-border-style` | `settings.$border-style-root` |
| `$sheet-border-thin-width` | `thin` |
| `$sheet-border-width` | `0` |
| `$sheet-color` | `tools.theme-color('on-surface', var(--v-high-emphasis-opacity))` |
| `$sheet-elevation` | `0` |
| `$sheet-positions` | `absolute fixed relative sticky` |
| `$sheet-rounded-border-radius` | `settings.$border-radius-root` |

### VExpansionPanel  (17 vars)

| Variable | Default |
|---|---|
| `$expansion-panel-active-margin` | `16px` |
| `$expansion-panel-background-color` | `rgb(var(--v-theme-surface))` |
| `$expansion-panel-border-color` | `rgba(var(--v-border-color), var(--v-border-opacity))` |
| `$expansion-panel-border-radius` | `settings.$border-radius-root` |
| `$expansion-panel-color` | `tools.theme-color('on-surface', var(--v-high-emphasis-opacity))` |
| `$expansion-panel-disabled-opacity` | `0.26` |
| `$expansion-panel-disabled-color` | `tools.theme-color('on-surface', $expansion-panel-disabled-opacity)` |
| `$expansion-panel-disabled-overlay` | `0.12` |
| `$expansion-panel-inset-active-max-width` | `calc(100% - #{$expansion-panel-active-margin * 2})` |
| `$expansion-panel-inset-max-width` | `100%` |
| `$expansion-panel-popout-active-max-width` | `calc(100% + #{$expansion-panel-active-margin})` |
| `$expansion-panel-popout-max-width` | `calc(100% - #{$expansion-panel-active-margin * 2})` |
| `$expansion-panel-active-title-min-height` | `64px` |
| `$expansion-panel-title-font-size` | `0.9375rem` |
| `$expansion-panel-title-min-height` | `48px` |
| `$expansion-panel-title-padding` | `16px 24px` |
| `$expansion-panel-text-padding` | `8px 24px 16px` |

### VList  (91 vars)

| Variable | Default |
|---|---|
| `$list-background` | `rgba(var(--v-theme-surface))` |
| `$list-border-color` | `settings.$border-color-root` |
| `$list-border-radius` | `0` |
| `$list-border-style` | `settings.$border-style-root` |
| `$list-border-thin-width` | `thin` |
| `$list-border-width` | `0` |
| `$list-color` | `tools.theme-color('on-surface', var(--v-high-emphasis-opacity))` |
| `$list-disabled-opacity` | `0.6` |
| `$list-elevation` | `0` |
| `$list-padding` | `8px 0` |
| `$list-rounded-border-radius` | `map.get(settings.$rounded, null)` |
| `$list-indent-size` | `16px` |
| `$list-nav-padding` | `8px` |
| `$list-nav-subheader-font-size` | `.75rem` |
| `$list-subheader-color` | `tools.theme-color('on-surface', var(--v-medium-emphasis-opacity))` |
| `$list-subheader-font-size` | `.875rem` |
| `$list-subheader-font-weight` | `400` |
| `$list-subheader-inset-padding-start` | `56px` |
| `$list-subheader-line-height` | `1.375rem` |
| `$list-subheader-min-height` | `40px` |
| `$list-subheader-padding-end` | `16px` |
| `$list-subheader-padding-top` | `0` |
| `$list-subheader-min-height-multiplier` | `1` |
| `$list-subheader-transition` | `0.2s min-height settings.$standard-easing` |
| `$list-item-border-color` | `settings.$border-color-root` |
| `$list-item-border-radius` | `0` |
| `$list-item-border-style` | `settings.$border-style-root` |
| `$list-item-border-width` | `0` |
| `$list-item-border-thin-width` | `thin` |
| `$list-item-content-min-width` | `40px` |
| `$list-item-elevation` | `1` |
| `$list-item-icon-opacity` | `var(--v-medium-emphasis-opacity)` |
| `$list-item-icon-active-opacity` | `1` |
| `$list-item-min-height` | `40px` |
| `$list-item-padding` | `4px 16px` |
| `$list-item-prepend-size` | `40px` |
| `$list-item-slim-prepend-size` | `28px` |
| `$list-item-plain-opacity` | `.62` |
| `$list-item-rounded-border-radius` | `map.get(settings.$rounded, null)` |
| `$list-item-one-line-min-height` | `48px` |
| `$list-item-two-line-min-height` | `64px` |
| `$list-item-two-line-padding` | `12px 16px` |
| `$list-item-three-line-min-height` | `88px` |
| `$list-item-three-line-padding` | `16px 16px` |
| `$list-item-action-spacer-width` | `16px` |
| `$list-item-slim-action-spacer-width` | `4px` |
| `$list-item-avatar-margin-end` | `16px` |
| `$list-item-avatar-margin-start` | `16px` |
| `$list-item-slim-spacer-width` | `20px` |
| `$list-item-slim-avatar-spacer-width` | `4px` |
| `$list-item-action-margin-end` | `8px` |
| `$list-item-action-margin-start` | `8px` |
| `$list-item-icon-margin-end` | `32px` |
| `$list-item-icon-margin-start` | `32px` |
| `$list-item-media-margin-bottom` | `0` |
| `$list-item-media-margin-end` | `16px` |
| `$list-item-media-margin-start` | `16px` |
| `$list-item-media-margin-top` | `0` |
| `$list-item-media-two-line-margin-bottom` | `-4px` |
| `$list-item-media-two-line-margin-top` | `-4px` |
| `$list-item-media-three-line-margin-bottom` | `0` |
| `$list-item-media-three-line-margin-top` | `0` |
| `$list-item-nav-margin-top` | `4px` |
| `$list-item-nav-title-font-size` | `.8125rem` |
| `$list-item-nav-title-font-weight` | `500` |
| `$list-item-nav-title-letter-spacing` | `normal` |
| `$list-item-nav-title-line-height` | `1rem` |
| `$list-item-nav-subtitle-font-size` | `.75rem` |
| `$list-item-nav-subtitle-font-weight` | `tools.map-deep-get(settings.$typography, 'body-medium', 'weight')` |
| `$list-item-nav-subtitle-letter-spacing` | `tools.map-deep-get(settings.$typography, 'body-medium', 'letter-spa...` |
| `$list-item-nav-subtitle-line-height` | `1rem` |
| `$list-item-subtitle-opacity` | `var(--v-list-item-subtitle-opacity, var(--v-medium-emphasis-opacity))` |
| `$list-item-subtitle-font-size` | `tools.map-deep-get(settings.$typography, 'body-medium', 'size')` |
| `$list-item-subtitle-font-weight` | `tools.map-deep-get(settings.$typography, 'body-medium', 'weight')` |
| `$list-item-subtitle-letter-spacing` | `tools.map-deep-get(settings.$typography, 'body-medium', 'letter-spa...` |
| `$list-item-subtitle-line-height` | `1rem` |
| `$list-item-subtitle-padding` | `0` |
| `$list-item-subtitle-text-transform` | `none` |
| `$list-item-subtitle-overflow-wrap` | `break-word` |
| `$list-item-subtitle-word-break` | `initial` |
| `$list-item-title-font-size` | `tools.map-deep-get(settings.$typography, 'body-large', 'size')` |
| `$list-item-title-font-weight` | `tools.map-deep-get(settings.$typography, 'body-large', 'weight')` |
| `$list-item-title-hyphens` | `auto` |
| `$list-item-title-letter-spacing` | `tools.map-deep-get(settings.$typography, 'body-large', 'letter-spac...` |
| `$list-item-title-line-height` | `tools.map-deep-get(settings.$typography, 'body-large', 'line-height')` |
| `$list-item-title-overflow-wrap` | `normal` |
| `$list-item-title-padding` | `0` |
| `$list-item-title-text-transform` | `none` |
| `$list-item-title-word-break` | `normal` |
| `$list-item-title-word-wrap` | `break-word` |
| `$list-density` | `('default': 0, 'comfortable': -1, 'compact': -2)` |

### VDataTable  (15 vars)

| Variable | Default |
|---|---|
| `$data-table-header-sort-badge-size` | `20px` |
| `$data-table-header-sort-badge-color` | `rgba(var(--v-border-color), var(--v-border-opacity))` |
| `$data-table-header-sort-icon-default-opacity` | `.0` |
| `$data-table-header-sort-icon-hover-opacity` | `.5` |
| `$data-table-header-sort-icon-margin-inline` | `0px` |
| `$data-table-header-select-all-margin-inline` | `16px -4px` |
| `$data-table-loading-opacity` | `var(--v-disabled-opacity)` |
| `$data-table-footer-info-min-width` | `116px` |
| `$data-table-footer-info-padding` | `0 16px` |
| `$data-table-footer-padding` | `8px 4px` |
| `$data-table-footer-pagination-margin-inline-start` | `16px` |
| `$data-table-footer-select-width` | `90px` |
| `$data-table-footer-items-per-page-padding` | `8px` |
| `$data-table-header-mobile-chip-icon-color` | `tools.theme-color('on-surface', var(--v-disabled-opacity))` |
| `$data-table-header-mobile-chip-icon-color-active` | `rgba(var(--v-theme-on-surface))` |

### VTabs  (10 vars)

| Variable | Default |
|---|---|
| `$tabs-density` | `( 'default': 0, 'comfortable' : -1, 'compact': -3)` |
| `$tabs-height` | `48px` |
| `$tabs-stacked-height` | `72px` |
| `$tab-align-tabs-title-margin` | `42px` |
| `$tab-border-radius` | `0` |
| `$tab-max-width` | `360px` |
| `$tab-min-width` | `90px` |
| `$tab-slider-size` | `2px` |
| `$tab-inset-radius` | `settings.$border-radius-root` |
| `$tab-inset-padding` | `4px` |

### VBreadcrumbs  (13 vars)

| Variable | Default |
|---|---|
| `$breadcrumbs-density` | `('default': 0, 'comfortable': -1, 'compact': -2)` |
| `$breadcrumbs-divider-padding` | `0 8px` |
| `$breadcrumbs-item-disabled-opacity` | `var(--v-disabled-opacity)` |
| `$breadcrumbs-item-icon-font-size` | `tools.map-deep-get(settings.$typography, 'body-large', 'size')` |
| `$breadcrumbs-item-icon-margin-inline-end` | `2px` |
| `$breadcrumbs-item-icon-margin-inline-start` | `-4px` |
| `$breadcrumbs-item-link-text-decoration` | `underline` |
| `$breadcrumbs-item-padding` | `0 4px` |
| `$breadcrumbs-line-height` | `tools.map-deep-get(settings.$typography, 'body-large', 'line-height')` |
| `$breadcrumbs-padding-y` | `16px` |
| `$breadcrumbs-padding-x` | `12px` |
| `$breadcrumbs-rounded-border-radius` | `settings.$border-radius-root` |
| `$breadcrumbs-vertical-align` | `middle` |

### VPagination  (1 vars)

| Variable | Default |
|---|---|
| `$pagination-item-margin` | `.3rem` |

### VAlert  (28 vars)

| Variable | Default |
|---|---|
| `$alert-background` | `rgb(var(--v-theme-surface-light))` |
| `$alert-border-color` | `currentColor` |
| `$alert-border-opacity` | `.38` |
| `$alert-border-radius` | `settings.$border-radius-root` |
| `$alert-border-style` | `settings.$border-style-root` |
| `$alert-border-thin-width` | `8px` |
| `$alert-border-width` | `0` |
| `$alert-color` | `tools.theme-color('on-surface-light', var(--v-high-emphasis-opacity))` |
| `$alert-density` | `('default': 0, 'comfortable': -1, 'compact': -2)` |
| `$alert-elevation` | `1` |
| `$alert-padding` | `16px` |
| `$alert-plain-opacity` | `.62` |
| `$alert-plain-transition` | `.2s opacity settings.$standard-easing` |
| `$alert-positions` | `absolute fixed sticky` |
| `$alert-prepend-margin-inline-end` | `16px` |
| `$alert-prepend-icon-size` | `1.75rem` |
| `$alert-append-margin-inline-start` | `16px` |
| `$alert-append-close-margin-inline-start` | `16px` |
| `$alert-title-font-size` | `tools.map-deep-get(settings.$typography, 'headline-small', 'size')` |
| `$alert-title-font-weight` | `tools.map-deep-get(settings.$typography, 'headline-small', 'weight')` |
| `$alert-title-hyphens` | `auto` |
| `$alert-title-letter-spacing` | `tools.map-deep-get(settings.$typography, 'headline-small', 'letter-...` |
| `$alert-title-line-height` | `1.75rem` |
| `$alert-title-overflow-wrap` | `normal` |
| `$alert-title-text-transform` | `none` |
| `$alert-title-word-break` | `normal` |
| `$alert-title-word-wrap` | `break-word` |
| `$alert-text-line-height` | `1.35` |

### VProgressLinear  (12 vars)

| Variable | Default |
|---|---|
| `$progress-linear-background` | `currentColor` |
| `$progress-linear-background-background` | `$progress-linear-background` |
| `$progress-linear-background-opacity` | `var(--v-border-opacity)` |
| `$progress-linear-border-radius` | `map.get(settings.$rounded, 'pill')` |
| `$progress-linear-stream-opacity` | `0.3` |
| `$progress-linear-stripe-background-size` | `40px 40px` |
| `$progress-linear-stream-border-width` | `4px` |
| `$progress-linear-indeterminate-animation-duration` | `2.2s` |
| `$progress-linear-stream-animation` | `stream .25s infinite linear` |
| `$progress-linear-striped-animation` | `progress-linear-stripes 1s infinite linear` |
| `$progress-linear-striped-size` | `var(--v-progress-linear-height)` |
| `$progress-linear-transition` | `.2s settings.$standard-easing` |

### VProgressCircular  (7 vars)

| Variable | Default |
|---|---|
| `$progress-circular-intermediate-svg-transition` | `all 0.2s ease-in-out` |
| `$progress-circular-overlay-transition` | `all 0.2s ease-in-out, stroke-width 0s` |
| `$progress-circular-overlay-transform` | `rotate(calc(-90deg))` |
| `$progress-circular-rotate-animation` | `progress-circular-rotate 1.4s linear infinite` |
| `$progress-circular-rotate-dash` | `progress-circular-dash 1.4s ease-in-out infinite` |
| `$progress-circular-size` | `32px` |
| `$progress-circular-underlay-color` | `rgba(var(--v-border-color), var(--v-border-opacity))` |

### VSkeletonLoader  (41 vars)

| Variable | Default |
|---|---|
| `$skeleton-loader-actions-button-margin` | `12px` |
| `$skeleton-loader-actions-padding` | `16px 16px 8px` |
| `$skeleton-loader-avatar-height` | `48px` |
| `$skeleton-loader-avatar-margin` | `8px 16px` |
| `$skeleton-loader-avatar-width` | `48px` |
| `$skeleton-loader-background` | `rgb(var(--v-theme-surface))` |
| `$skeleton-loader-bone-background` | `linear-gradient(90deg, tools.theme-color('surface', 0), tools.theme...` |
| `$skeleton-loader-border-radius` | `settings.$border-radius-root` |
| `$skeleton-loader-button-border-radius` | `settings.$border-radius-root` |
| `$skeleton-loader-button-height` | `36px` |
| `$skeleton-loader-button-width` | `64px` |
| `$skeleton-loader-chip-border-radius` | `16px` |
| `$skeleton-loader-chip-height` | `32px` |
| `$skeleton-loader-chip-width` | `96px` |
| `$skeleton-loader-date-picker-border-radius` | `inherit` |
| `$skeleton-loader-date-picker-days-margin` | `4px` |
| `$skeleton-loader-date-picker-heading-max-width` | `256px` |
| `$skeleton-loader-date-picker-heading-width` | `40%` |
| `$skeleton-loader-date-picker-text-max-width` | `88px` |
| `$skeleton-loader-date-picker-text-width` | `20%` |
| `$skeleton-loader-divider-border-radius` | `1px` |
| `$skeleton-loader-divider-height` | `2px` |
| `$skeleton-loader-gutter` | `16px` |
| `$skeleton-loader-heading-border-radius` | `12px` |
| `$skeleton-loader-heading-height` | `24px` |
| `$skeleton-loader-image-height` | `150px` |
| `$skeleton-loader-loading-animation` | `loading 1.5s infinite` |
| `$skeleton-loader-loading-transform` | `translateX(-100%)` |
| `$skeleton-loader-subtitle-max-width` | `70%` |
| `$skeleton-loader-subtitle-text-border-radius` | `8px` |
| `$skeleton-loader-subtitle-text-height` | `16px` |
| `$skeleton-loader-table-cell-height` | `48px` |
| `$skeleton-loader-table-cell-width` | `88px` |
| `$skeleton-loader-table-row-margin` | `0 8px` |
| `$skeleton-loader-table-row-text-margin` | `8px` |
| `$skeleton-loader-text-background` | `tools.theme-color('on-surface', var(--v-border-opacity))` |
| `$skeleton-loader-text-border-radius` | `6px` |
| `$skeleton-loader-text-height` | `12px` |
| `$skeleton-loader-text-three-text-max-width` | `70%` |
| `$skeleton-loader-text-two-text-margin-top` | `-8px` |
| `$skeleton-loader-text-two-text-max-width` | `50%` |

### VBadge  (23 vars)

| Variable | Default |
|---|---|
| `$badge-background` | `rgb(var(--v-theme-surface-variant))` |
| `$badge-color` | `tools.theme-color('on-surface-variant', var(--v-high-emphasis-opaci...` |
| `$badge-border-color` | `rgb(var(--v-theme-background))` |
| `$badge-border-radius` | `10px` |
| `$badge-border-style` | `solid` |
| `$badge-border-transform` | `scale(1.05)` |
| `$badge-border-width` | `2px` |
| `$badge-dot-border-radius` | `50%` |
| `$badge-dot-border-width` | `1.5px` |
| `$badge-dot-height` | `9px` |
| `$badge-dot-width` | `9px` |
| `$badge-font-family` | `settings.$body-font-family` |
| `$badge-font-size` | `.75rem` |
| `$badge-font-weight` | `500` |
| `$badge-height` | `1.25rem` |
| `$badge-icon-margin` | `0 -2px` |
| `$badge-icon-padding` | `4px 6px` |
| `$badge-inline-vertical-align` | `middle` |
| `$badge-line-height` | `1` |
| `$badge-min-width` | `20px` |
| `$badge-padding` | `4px 6px` |
| `$badge-transition` | `.225s settings.$standard-easing` |
| `$badge-wrapper-margin` | `0 4px` |

### VTooltip  (9 vars)

| Variable | Default |
|---|---|
| `$tooltip-background-color` | `rgb(var(--v-theme-surface-variant))` |
| `$tooltip-text-color` | `rgb(var(--v-theme-on-surface-variant))` |
| `$tooltip-border-radius` | `settings.$border-radius-root` |
| `$tooltip-font-size` | `.875rem` |
| `$tooltip-line-height` | `1.6` |
| `$tooltip-transition-enter-duration` | `150ms` |
| `$tooltip-transition-leave-duration` | `75ms` |
| `$tooltip-padding` | `5px 16px` |
| `$tooltip-overflow-wrap` | `break-word` |

### VSnackbar  (24 vars)

| Variable | Default |
|---|---|
| `$snackbar-absolute-z-index` | `1` |
| `$snackbar-action-margin` | `8px` |
| `$snackbar-border-radius` | `settings.$border-radius-root` |
| `$snackbar-plain-opacity` | `.62` |
| `$snackbar-btn-padding` | `0 8px` |
| `$snackbar-background` | `rgb(var(--v-theme-surface-variant))` |
| `$snackbar-fallback-background` | `rgb(var(--v-theme-surface))` |
| `$snackbar-color` | `rgb(var(--v-theme-on-surface-variant))` |
| `$snackbar-font-size` | `tools.map-deep-get(settings.$typography, 'body-medium', 'size')` |
| `$snackbar-font-weight` | `tools.map-deep-get(settings.$typography, 'body-medium', 'weight')` |
| `$snackbar-letter-spacing` | `tools.map-deep-get(settings.$typography, 'body-medium', 'letter-spa...` |
| `$snackbar-line-height` | `tools.map-deep-get(settings.$typography, 'body-medium', 'line-height')` |
| `$snackbar-title-font-weight` | `700` |
| `$snackbar-content-padding` | `14px 16px` |
| `$snackbar-prepend-margin-inline` | `16px 12px` |
| `$snackbar-elevation` | `2` |
| `$snackbar-transition-scale` | `.8` |
| `$snackbar-vertical-action-margin-bottom` | `8px` |
| `$snackbar-wrapper-margin` | `8px` |
| `$snackbar-wrapper-max-width` | `672px` |
| `$snackbar-wrapper-min-height` | `48px` |
| `$snackbar-wrapper-min-width` | `344px` |
| `$snackbar-wrapper-padding` | `0` |
| `$snackbar-z-index` | `10000` |

### VDialog  (8 vars)

| Variable | Default |
|---|---|
| `$dialog-elevation` | `5` |
| `$dialog-border-radius` | `settings.$border-radius-root` |
| `$dialog-margin` | `24px` |
| `$dialog-card-actions-justify` | `flex-end` |
| `$dialog-card-header-padding` | `16px 24px` |
| `$dialog-card-header-text-padding-top` | `0` |
| `$dialog-card-text-padding` | `16px 24px 24px` |
| `$dialog-card-text-letter-spacing` | `tools.map-deep-get(settings.$typography, 'body-large', 'letter-spac...` |

### VAvatar  (19 vars)

| Variable | Default |
|---|---|
| `$avatar-background` | `rgb(var(--v-theme-surface))` |
| `$avatar-border-radius` | `map.get(variables.$rounded, 'circle')` |
| `$avatar-border-color` | `settings.$border-color-root` |
| `$avatar-border-radius` | `map.get(settings.$rounded, 0)` |
| `$avatar-border-style` | `settings.$border-style-root` |
| `$avatar-border-thin-width` | `thin` |
| `$avatar-border-width` | `0` |
| `$avatar-color` | `functions.theme-color('on-surface', var(--v-medium-emphasis-opacity))` |
| `$avatar-density` | `('default': 0, 'comfortable': -1, 'compact': -2)` |
| `$avatar-elevation` | `1` |
| `$avatar-height` | `40px` |
| `$avatar-line-height` | `normal` |
| `$avatar-plain-opacity` | `.62` |
| `$avatar-rounded-border-radius` | `variables.$border-radius-root` |
| `$avatar-vertical-align` | `middle` |
| `$avatar-width` | `40px` |
| `$avatar-margin-end` | `8px` |
| `$avatar-margin-start` | `8px` |
| `$avatar-sizes` | `()` |

### VDivider  (17 vars)

| Variable | Default |
|---|---|
| `$divider-border-color` | `null` |
| `$divider-border-style` | `settings.$border-style-root` |
| `$divider-border-width` | `thin 0 0 0` |
| `$divider-content-padding` | `0 16px` |
| `$divider-content-vertical-padding` | `4px 0` |
| `$divider-flex` | `1 1 100%` |
| `$divider-gradient-mask` | `linear-gradient(90deg, transparent, #000, transparent)` |
| `$divider-inset-margin` | `72px` |
| `$divider-inset-max-width` | `calc(100% - #{$divider-inset-margin})` |
| `$divider-margin` | `8px` |
| `$divider-opacity` | `var(--v-border-opacity)` |
| `$divider-vertical-border-width` | `0 thin 0 0` |
| `$divider-vertical-inset-margin-bottom` | `$divider-margin` |
| `$divider-vertical-inset-margin-top` | `$divider-margin` |
| `$divider-vertical-inset-max-height` | `calc(100% - #{$divider-margin * 2})` |
| `$divider-vertical-gradient-mask` | `linear-gradient(0deg, transparent, #000, transparent)` |
| `$divider-vertical-margin-left` | `-1px` |

### VFab  (12 vars)

| Variable | Default |
|---|---|
| `$fab-border-radius` | `map.get(settings.$rounded, 'circle')` |
| `$fab-border-radius-multiplier` | `0` — 2.4 for MD3 |
| `$fab-height` | `56px` |
| `$fab-font-size` | `tools.map-deep-get(settings.$typography, 'label-large', 'size')` |
| `$fab-font-weight` | `tools.map-deep-get(settings.$typography, 'label-large', 'weight')` |
| `$fab-transition-duration` | `0.2s` |
| `$fab-transition-timing-function` | `settings.$standard-easing` |
| `$fab-width-ratio` | `math.div(16, 9)` |
| `$fab-padding-ratio` | `2.25` |
| `$fab-elevation` | `3` |
| `$fab-hover-elevation` | `4` |
| `$fab-sizes` | `()` |

### VOverlay  (2 vars)

| Variable | Default |
|---|---|
| `$overlay-opacity` | `0.32` |
| `$overlay-scrim-background` | `#000` |
