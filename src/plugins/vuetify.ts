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
    defaultTheme: 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          background: '#020D20', // app page background — behind every screen
          surface: '#162032', // default component surface — cards, sheets, menus, dialogs 
          // Built from #7F8692 at ~12% opacity over the app background.
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
          'on-surface': '#FFFFFF', // default text/icon color across the app
          'surface-bright': '#23406B', // brightest surface — raised panels & header chrome
          'surface-light': '#141C2C', // off-white body — section-panel backgrounds on most screens
          'surface-variant': '#334563', // tonal accent fills (meters, timeline dots)
          'on-surface-variant': '#BFC3C9', // fg on surface-variant; also Vuetify chips, tooltips, snackbars
          'on-surface-weak': '#9FA4AD', // Figma `Neutral/text-weak` — placeholders, secondary labels
          'outline-variant': '#2E3849', // Figma `Neutral/border` — hairline outline on inputs & icon buttons
          'outline-medium': '#5F6877', // Figma `Neutral/border-medium` / grey-300 — stronger hairline + dim icons
          primary: '#4C8AE8', // main brand color — CTAs, links, active states & branded controls  // Used as the gradient start color: // linear-gradient(135deg, #4C8AE8 0%, #9579FE 100%)
          'primary-darken-1': '#3662A5', // darker primary — hover/pressed of primary
          'primary-bright': '#47B0FF', // the CTA blue used by the Figma header button — see note in FloorOps.vue
          'primary-medium': '#457ED3', // Figma `foundation/blue/blue-600` — checked/assigned control fills
          'tertiary-bright': '#9ECBAD', // Figma `foundation/green/green-300` — the ring around the you-are-here pip
          'primary-violet': '#9579FE', // END of the brand gradient that starts at `primary` — see the note on it above
          'primary-accent': '#9D6EFF', // assistant gradient START (Figma: rgb(157,110,255))
          'primary-deep': '#6674D9', // 2D/3D active-segment gradient END (Figma: rgb(102,116,217))
          secondary: '#62EBCD', // supporting accent
          'secondary-darken-1': '#40E6C2', // darker secondary — hover/pressed of secondary
          'secondary-accent': '#4DFDE0', // assistant gradient END (Figma: rgb(77,253,224))
          'secondary-deep': '#2DA38A', // Figma `data viz/color 2/2` — the location-selector teal
          tertiary: '#64A179', // muted brand green — identity surfaces (avatars). NOT a status color
          error: '#D87894', // error & validation states, destructive actions
          info: '#68BEFF', // informational states & badges
          success: '#6EB185', // success states & positive metrics
          warning: '#DD9933', // warning states & alerts
        },
        // theme variables — opacities & border used app-wide
        variables: {
          'border-color': '#525D70',
          'border-opacity': 1,
          'high-emphasis-opacity': 1,
          'medium-emphasis-opacity': 0.72,
          'disabled-opacity': 0.38,
          'idle-opacity': 0.04,
          'hover-opacity': 0.04,
          'focus-opacity': 0.16,
          'selected-opacity': 0.16,
          'activated-opacity': 0.20,
          'pressed-opacity': 0.24,
          'dragged-opacity': 0.16,
        },
      },
      light: {
        dark: false,
        colors: {
          // Each token plays the SAME role as in dark (see the dark theme for where each is used).
          // ⚠️ PLACEHOLDER PALETTE — these are still Vuetify's stock DARK values, not a light
          // counterpart to the brand palette above. The light theme is wired up and selectable,
          // but it will not read as "light" until these are replaced.
          background: '#121212', // app page background
          surface: '#212121', // cards, sheets, menus, dialogs
          // The light counterpart of the dark theme's `on-surface` above — same
          // reasoning. Rebrand both together so text stays legible in each theme.
          // (Still the dark-theme value today; see the placeholder note above.)
          'on-surface': '#FFFFFF', // default text/icon color across the app
          'surface-bright': '#ccbfd6', // raised panels & the top bar
          'surface-light': '#424242', // section-panel backgrounds
          'surface-variant': '#c8c8c8', // tonal accent fills
          'on-surface-variant': '#000000', // fg on surface-variant; chips, tooltips, snackbars
          'on-surface-weak': '#9FA4AD', // Figma `Neutral/text-weak` — placeholders, secondary labels
          'outline-variant': '#2E3849', // Figma `Neutral/border` — hairline outline on inputs & icon buttons
          'outline-medium': '#5F6877', // Figma `Neutral/border-medium` — stronger hairline + dim icons
          'primary-bright': '#47B0FF', // the CTA blue used by the Figma header button
          'primary-medium': '#457ED3', // Figma `foundation/blue/blue-600` — checked/assigned control fills
          'tertiary-bright': '#9ECBAD', // Figma `foundation/green/green-300` — the ring around the you-are-here pip
          'primary-violet': '#9579FE', // END of the brand gradient that starts at `primary` — see the note on it above
          'primary-accent': '#9D6EFF', // assistant gradient START
          'primary-deep': '#6674D9', // 2D/3D active-segment gradient END
          'secondary-accent': '#4DFDE0', // assistant gradient END
          'secondary-deep': '#2DA38A', // the location-selector teal
          tertiary: '#64A179', // muted brand green — identity surfaces (avatars). NOT a status color
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
    // Button SHAPE is left to Vuetify, which derives it from
    // $border-radius-root — bound to the `md` step in _tokens.scss, so buttons
    // land on the same tier as cards with no prop here. Set `rounded` below only
    // to make buttons deliberately differ from that tier (e.g. 'pill').
    // Color stays per-instance because it carries meaning (primary CTA vs
    // secondary vs destructive). variant: 'flat' — the platform never uses button
    // shadows, so default to flat instead of Vuetify's stock 'elevated'.
    VBtn: {
      variant: 'flat',       // 'elevated' | 'flat' | 'tonal' | 'outlined' | 'text' | 'plain'
      // rounded: —,         // 0 | 'sm' | 'lg' | 'xl' | 'pill' | 'circle' | true
      // size: 'default',    // 'x-small' | 'small' | 'default' | 'large' | 'x-large'
      // density: 'default', // 'default' | 'comfortable' | 'compact'
      // color: 'primary',   // any theme token
      // elevation: 0,       // 0–24
      // border: false,
      // tile: false,
      // ripple: true,
    },

    // VTab: {
    //   rounded: —,   // stock $tab-border-radius is already 0 (Material tabs use a
    //                 // flat baseline + line indicator). Only set this if VBtn above
    //                 // gets a shape default — VTab is built on VBtn and inherits it.
    // },

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

    // Canonical input style: outlined box, comfortable density (~48px tall — one
    // step tighter than the spacious default). Outlined has a full border and no
    // bottom line, so all corners round equally. Density is scoped to inputs
    // here, so only fields tighten — buttons/lists keep the default density.
    // (Screens may override per-instance, e.g. a search box.)
    //
    // SHAPE is intentionally unset: Vuetify derives it from $border-radius-root
    // (= the `md` step), so fields sit on the card tier automatically. Setting
    // `rounded` here also makes Vuetify widen the outline caps to
    // calc(control-height / 2 + 2px) — which pushes the floating label ~18px
    // right of the typed text. Leaving it unset keeps label and value on one
    // left edge for free; a deliberate `rounded="…"` reintroduces the indent.
    VTextField: {
      variant: 'outlined',   // 'filled' | 'outlined' | 'solo' | 'solo-filled' | 'solo-inverted' | 'underlined' | 'plain'
      density: 'comfortable',
      // rounded: —,
      // color: —,
      // flat: false,
      // tile: false,
    },

    VTextarea: {
      variant: 'outlined',
      density: 'comfortable',
    },

    VFileInput: {
      variant: 'outlined',
      density: 'comfortable',
    },

    VNumberInput: {
      variant: 'outlined',
      density: 'comfortable',
    },

    // VSelect / VCombobox / VAutocomplete generate their OWN dropdown popup (a
    // v-menu > v-list the screen never sees). `listProps: { density: 'compact' }`
    // styles that inner list to match the app's canonical dropdown: plain
    // full-bleed rows (NO `nav`, so no per-item radius or gaps) at compact
    // density, default 16px title. Popup radius + shadow come from settings.scss
    // ($select-content-*: the `lg` step, elevation 3) — deliberately one tier
    // ROUNDER than the field itself, which sits on `md` like every other input.
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
      listProps: { density: 'compact' },
    },

    VAutocomplete: {
      variant: 'outlined',
      density: 'comfortable',
      listProps: { density: 'compact' },
    },

    VCombobox: {
      variant: 'outlined',
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

    // Card SHAPE default: 8px (`md`) corners app-wide, instead of Vuetify's
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

    // Match the content-card radius tier (md = 8px) so alerts read as part of
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
