/**
 * plugins/vuetify.ts
 *
 * ★ DESIGN CONTROL PANEL ★
 * THE single place to change how the whole app looks. Everything here applies
 * globally — to every page at once, and to the Storybook.
 *
 *   theme.colors  — the brand palette (light + dark). Edit a hex and every
 *                   component using that token updates. HOT-RELOADS, no restart.
 *   defaults      — the default look of each component (variant, shape, size,
 *                   density…). ONE block per component: a block that's
 *                   uncommented with a real value is a live app-wide override;
 *                   a fully-commented block uses Vuetify stock and its lines are
 *                   the menu of knobs to turn on. HOT-RELOADS, no restart.
 *
 * ABOUT THE `defaults` LIST BELOW
 *  - Each common component has one block, listing its STYLING props. Uncomment a
 *    prop and give it a value to make it a live default; leave it commented to
 *    keep Vuetify's stock value. Each component appears exactly once.
 *  - `—` means the prop has no fixed default (supply your own value if you
 *    uncomment it).
 *  - This is the runtime catalog you can change from here. The OTHER catalog —
 *    the ~764 build-time SASS variables (global + per-component) — physically
 *    cannot live in this .ts file; they're Sass. Those stay in:
 *        src/styles/settings.scss            (the 2-3 you actively set)
 *        src/styles/sass-variables-reference.md (the full list, for reference)
 *
 * Rule of thumb: if it's a prop (variant, rounded, size, density, color), set it
 * HERE. Only reach for settings.scss for raw dimensions a prop can't express.
 *
 * Framework docs: https://vuetifyjs.com
 */

// Composables
import { h } from 'vue'
import { createVuetify } from 'vuetify'
import type { IconProps, IconSet } from 'vuetify'
import AppIcon from '@/components/AppIcon.vue'
import { vuetifyAliases } from '@/icons/carbon'
// Styles
import 'vuetify/styles'

// ── ICONS: IBM Carbon, via components (no icon webfont) ────────────────────
// Vuetify 4 ships its own `carbon` iconset, but it resolves glyphs through
// UnoCSS classes (`i-carbon:*`) and this project has no UnoCSS — so we register
// an equivalent set that renders @carbon/icons-vue components through AppIcon.
// Every icon STRING in the app (`icon`, `prepend-icon`, `append-icon`,
// `prepend-inner-icon`, `append-inner-icon`, `<v-icon>content</v-icon>`) is
// routed here, which is why the migration off MDI needed no markup changes —
// only the icon names themselves.
const carbon: IconSet = {
  component: (props: IconProps) => h(AppIcon, { name: props.icon as string }),
}

// Vuetify's internal slots ($collapse, $checkboxOn, $prev…). AppIcon resolves
// these from the same map, so each alias just forwards its own name.
const aliases = Object.fromEntries(
  Object.keys(vuetifyAliases).map(name => [name, name]),
) as Record<string, string>

export default createVuetify({
  icons: {
    defaultSet: 'carbon',
    aliases,
    sets: { carbon },
  },

  // ── COLOR VARIABLES (full Vuetify default set — no custom tokens) ──
  // Every GENERAL color token + theme variable Vuetify ships, at its stock
  // value. Edit any hex/number to rebrand; all components using a token update
  // instantly (hot-reloads, no restart). Add custom tokens later if you need them.
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          background: '#FFFFFF', // app page background — behind every screen
          surface: '#FFFFFF', // default component surface — cards, sheets, menus, dialogs
          // ── DEFAULT TEXT COLOR ──
          // Vuetify does NOT ship `on-surface` in its stock palette: it DERIVES one
          // per theme by contrast (see genOnColors in vuetify/lib/composables/theme.js),
          // which for a white `surface` resolves to pure black. Declaring it here
          // pins that same stock value explicitly — nothing changes visually, but the
          // app's default text/icon color becomes a knob you can edit instead of a
          // number Vuetify picks for you. Set it to a brand ink and every unstyled
          // label, heading and body line across the app follows.
          // The same trick works for any token: `on-background`, `on-primary`, … —
          // declare the `on-` pair and it overrides Vuetify's auto-contrast choice.
          'on-surface': '#000000', // default text/icon color across the app
          'surface-bright': '#FFFFFF', // brightest surface — raised panels & header chrome
          'surface-light': '#EEEEEE', // off-white body — section-panel backgrounds on most screens
          'surface-variant': '#424242', // tonal accent fills (meters, timeline dots)
          'on-surface-variant': '#EEEEEE', // fg on surface-variant; also Vuetify chips, tooltips, snackbars
          primary: '#1867C0', // main brand color — CTAs, links, active states & branded controls
          'primary-darken-1': '#1F5592', // darker primary — hover/pressed of primary
          secondary: '#48A9A6', // supporting accent
          'secondary-darken-1': '#018786', // darker secondary — hover/pressed of secondary
          error: '#B00020', // error & validation states, destructive actions
          info: '#2196F3', // informational states & badges
          success: '#4CAF50', // success states & positive metrics
          warning: '#FB8C00', // warning states & alerts
        },
        // theme variables — opacities & border used app-wide
        variables: {
          'border-color': '#2F2F2E',
          'border-opacity': 0.08,
          'high-emphasis-opacity': 0.87,
          'medium-emphasis-opacity': 0.60,
          'disabled-opacity': 0.38,
          'idle-opacity': 0.04,
          'hover-opacity': 0.04,
          'focus-opacity': 0.12,
          'selected-opacity': 0.08,
          'activated-opacity': 0.12,
          'pressed-opacity': 0.12,
          'dragged-opacity': 0.08,
        },
      },
      dark: {
        dark: true,
        colors: {
          // Each token plays the SAME role as in light (see the light theme for where each is used).
          background: '#121212', // app page background
          surface: '#212121', // cards, sheets, menus, dialogs
          // The dark counterpart of the light theme's `on-surface` above — same
          // reasoning, and this is the value Vuetify would derive for a #212121
          // surface anyway. Rebrand both together so text stays legible in each theme.
          'on-surface': '#FFFFFF', // default text/icon color across the app
          'surface-bright': '#ccbfd6', // raised panels & the top bar
          'surface-light': '#424242', // section-panel backgrounds
          'surface-variant': '#c8c8c8', // tonal accent fills
          'on-surface-variant': '#000000', // fg on surface-variant; chips, tooltips, snackbars
          primary: '#2196F3', // main brand color lifted for legibility on dark — CTAs, links, active states
          'primary-darken-1': '#277CC1', // hover/pressed of primary
          secondary: '#54B6B2', // supporting accents
          'secondary-darken-1': '#48A9A6', // hover/pressed of secondary
          error: '#CF6679', // error & validation states, destructive actions
          info: '#2196F3', // informational states & badges
          success: '#4CAF50', // success states & positive metrics
          warning: '#FB8C00', // warning states & alerts
        },
        variables: {
          'border-color': '#FFFFFF',
          'border-opacity': 0.12,
          'high-emphasis-opacity': 1,
          'medium-emphasis-opacity': 0.70,
          'disabled-opacity': 0.50,
          'idle-opacity': 0.10,
          'hover-opacity': 0.04,
          'focus-opacity': 0.12,
          'selected-opacity': 0.08,
          'activated-opacity': 0.12,
          'pressed-opacity': 0.16,
          'dragged-opacity': 0.08,
        },
      },
    },
  },

  // ── COMPONENT DEFAULTS ─────────────────────────────────
  // ONE block per component, in a single list (alphabetical-ish, grouped by
  // family). A block that is UNCOMMENTED with a real value overrides Vuetify's
  // stock look for that component app-wide; a block that is still fully
  // commented uses Vuetify's default, and its commented lines show the knobs
  // available to turn on. To customize a component: find its block, uncomment
  // the prop, set a value. All of this hot-reloads. (The radius / spacing /
  // type *scales* these tokens point at live in settings.scss and need a
  // dev-server restart — here you only pick which token a component uses.)
  //
  // `—` in a commented line means "no fixed default; supply your own value."
  defaults: {
    // Button SHAPE is uniform brand styling → pill-shaped app-wide (matches the
    // design). Color stays per-instance because it carries meaning (primary CTA
    // vs secondary vs destructive). variant: 'flat' — the platform never uses button
    // shadows, so default to flat instead of Vuetify's stock 'elevated'.
    VBtn: {
      variant: 'flat',       // 'elevated' | 'flat' | 'tonal' | 'outlined' | 'text' | 'plain'
      rounded: 'pill',       // 0 | 'sm' | 'lg' | 'xl' | 'pill' | 'circle' | true
      // size: 'default',    // 'x-small' | 'small' | 'default' | 'large' | 'x-large'
      // density: 'default', // 'default' | 'comfortable' | 'compact'
      // color: 'primary',   // any theme token
      // elevation: 0,       // 0–24
      // border: false,
      // tile: false,
      // ripple: true,
    },

    // VTab is built on VBtn, so it inherits VBtn's pill default (above) — undo it
    // so tab hover/selected overlays are square (Material tabs use a flat
    // baseline + line indicator, not pills).
    VTab: {
      rounded: 0,
    },

    // VBtnToggle: {
    //   variant: 'elevated',
    //   density: 'default',
    //   rounded: —,
    //   color: —,
    //   elevation: —,
    //   border: false,
    //   tile: false,
    // },

    // Selection controls default to the brand color app-wide. Defining
    // theme.colors.primary only NAMES the color; assigning it here as the
    // default is what makes every checkbox/radio/switch primary without a
    // per-instance `color` prop.
    VCheckbox: {
      color: 'primary',
      // density: 'default',
      // ripple: true,
    },

    VRadioGroup: {
      color: 'primary',
      // density: 'default',
      // height: 'auto',
      // ripple: true,
    },

    VSwitch: {
      color: 'primary',
      // size: 'default',
      // density: 'default',
      // flat: false,
      // ripple: true,
    },

    // Canonical input style: outlined box, `lg` corners, comfortable density
    // (~48px tall — one step tighter than the spacious default). Outlined has a
    // full border and no bottom line, so all corners round equally. Density is
    // scoped to inputs here, so only fields tighten — buttons/lists keep the
    // default density. (Screens may override per-instance, e.g. Home's search box.)
    VTextField: {
      variant: 'outlined',   // 'filled' | 'outlined' | 'solo' | 'solo-filled' | 'solo-inverted' | 'underlined' | 'plain'
      rounded: 'lg',
      density: 'comfortable',
      // color: —,
      // flat: false,
      // tile: false,
    },

    VTextarea: {
      variant: 'outlined',
      rounded: 'lg',
      density: 'comfortable',
    },

    VFileInput: {
      variant: 'outlined',
      rounded: 'lg',
      density: 'comfortable',
    },

    VNumberInput: {
      variant: 'outlined',
      rounded: 'lg',
      density: 'comfortable',
    },

    // VSelect / VCombobox / VAutocomplete generate their OWN dropdown popup (a
    // v-menu > v-list the screen never sees). `listProps: { density: 'compact' }`
    // styles that inner list to match the app's canonical dropdown: plain
    // full-bleed rows (NO `nav`, so no per-item radius or gaps) at compact
    // density, default 16px title. Popup radius + shadow come from settings.scss
    // ($select-content-*: 8px, elevation 3).
    VSelect: {
      variant: 'outlined',
      rounded: 'lg',
      density: 'comfortable',
      listProps: { density: 'compact' },
    },

    VAutocomplete: {
      variant: 'outlined',
      rounded: 'lg',
      density: 'comfortable',
      listProps: { density: 'compact' },
    },

    VCombobox: {
      variant: 'outlined',
      rounded: 'lg',
      density: 'comfortable',
      listProps: { density: 'compact' },
    },

    // VSlider: {
    //   density: 'default',
    //   color: —,
    //   rounded: —,
    //   width: —,
    //   elevation: 1,
    //   tile: false,
    //   ripple: true,
    //   glow: false,
    // },

    // VRangeSlider: {
    //   density: 'default',
    //   color: —,
    //   rounded: —,
    //   width: —,
    //   elevation: 1,
    //   tile: false,
    //   ripple: true,
    //   glow: false,
    // },

    // VRating: {
    //   size: 'default',
    //   density: 'default',
    //   color: —,
    //   ripple: false,
    // },

    // VChip: {
    //   variant: 'tonal',
    //   size: 'default',
    //   density: 'default',
    //   rounded: —,
    //   color: —,
    //   elevation: —,
    //   border: false,
    //   tile: false,
    //   ripple: true,
    // },

    // VChipGroup: {
    //   variant: 'tonal',
    //   color: —,
    // },

    // Card SHAPE default: 16px (`md`) corners app-wide, instead of Vuetify's
    // stock 4px ($border-radius-root). Set as a prop default here (single source,
    // hot-reload) rather than a Sass card var. Instance `rounded="…"` still
    // overrides (e.g. a pill promo or a flush panel).
    VCard: {
      rounded: 'md',
      // variant: 'elevated',  // 'elevated' | 'flat' | 'tonal' | 'outlined' | 'text' | 'plain'
      // density: 'default',
      // color: —,
      // elevation: —,
      // border: false,
      // tile: false,
      // ripple: true,
    },

    // Card titles default to the MD3 `title-medium` token (16px) instead of
    // VCardTitle's built-in `title-large` (22px), which reads too big for cards.
    // Done as a default `class` (the text-title-medium utility is unlayered, so
    // it wins over the component's font-size). Weight is unchanged — screens that
    // add `font-weight-bold` keep it; drop that class to get title-medium's 500.
    VCardTitle: {
      class: 'text-title-medium',
    },

    // VSheet: {
    //   rounded: —,
    //   color: —,
    //   elevation: —,
    //   height: —,
    //   width: —,
    //   border: false,
    //   tile: false,
    // },

    // VExpansionPanels: {
    //   variant: 'default',    // 'default' | 'accordion' | 'inset' | 'popout'
    //   rounded: false,
    //   color: —,
    //   elevation: —,
    //   flat: false,
    //   tile: false,
    //   ripple: false,
    // },

    // VList: {
    //   variant: 'text',
    //   density: 'default',
    //   rounded: —,
    //   color: —,
    //   elevation: —,
    //   height: —,
    //   width: —,
    //   slim: false,
    //   border: false,
    //   tile: false,
    // },

    // VListItem: {
    //   variant: 'text',
    //   density: 'default',
    //   rounded: —,
    //   color: —,
    //   elevation: —,
    //   height: —,
    //   width: —,
    //   slim: false,
    //   border: false,
    //   tile: false,
    //   ripple: true,
    // },

    // VDataTable: {
    //   density: 'default',
    //   color: —,
    //   height: —,
    //   width: —,
    // },

    // VTabs: {
    //   density: 'default',
    //   color: —,
    //   height: —,
    //   stacked: false,
    // },

    // VBreadcrumbs: {
    //   density: 'default',
    //   rounded: —,
    //   color: —,
    //   tile: false,
    // },

    // VPagination: {
    //   variant: 'text',
    //   size: 'default',
    //   density: 'default',
    //   rounded: —,
    //   color: —,
    //   elevation: —,
    //   border: false,
    //   tile: false,
    // },

    // Match the content-card radius tier (md = 16px) so alerts read as part of
    // the same surface family instead of Vuetify's stock square corners.
    VAlert: {
      rounded: 'md',
    },

    // VProgressLinear: {
    //   height: 4,
    //   rounded: —,
    //   color: —,
    //   tile: false,
    // },

    // VProgressCircular: {
    //   size: 'default',
    //   width: 4,
    //   color: —,
    //   rounded: false,
    // },

    // VSkeletonLoader: {
    //   color: —,
    //   elevation: —,
    //   height: —,
    //   width: —,
    // },

    // VBadge: {
    //   rounded: —,
    //   color: —,
    //   height: —,
    //   width: —,
    //   tile: false,
    // },

    // Detach every dropdown/menu overlay 8px from its activator instead of
    // rendering flush against it. `offset` is a VOverlay location-strategy prop
    // (main-axis px), so it covers standalone VMenu *and* the menus that
    // VSelect/VCombobox/VAutocomplete render internally (they pass no offset of
    // their own, so this single default reaches all of them).
    VMenu: {
      offset: 8,
    },

    // VTooltip: {
    //   color: —,
    //   height: —,
    //   width: —,
    // },

    // VSnackbar: {
    //   variant: 'elevated',
    //   rounded: —,
    //   color: —,
    //   height: —,
    //   width: —,
    //   tile: false,
    // },

    // VDialog: {
    //   height: —,
    //   width: —,
    // },

    // VAvatar: {
    //   variant: 'flat',
    //   size: 'default',
    //   density: 'default',
    //   rounded: —,
    //   color: —,
    //   border: false,
    //   tile: false,
    // },

    // VDivider: {
    //   variant: 'solid',      // 'solid' | 'dashed' | 'dotted' | 'double'
    //   color: —,
    // },

    // VFab: {
    //   variant: 'elevated',
    //   size: 'default',
    //   density: 'default',
    //   rounded: —,
    //   color: —,
    //   elevation: —,
    //   height: —,
    //   width: —,
    //   flat: false,
    //   border: false,
    //   tile: false,
    //   slim: false,
    //   stacked: false,
    //   ripple: true,
    // },

    // VNavigationDrawer: {
    //   width: 256,
    //   rounded: —,
    //   color: —,
    //   elevation: —,
    //   border: false,
    //   tile: false,
    //   rail: null,
    // },
  },
})
