/**
 * src/data/brand.ts
 *
 * ★ BRAND PRESET — the answers to the /new-project intake quiz ★
 *
 * This is the single, inspectable record of a project's brand identity: its
 * name, description, the colors it chose (drawn from the DS palette), and its
 * radius personality. A new designer never has to hunt through config files —
 * they run the `/new-project` skill, answer a short quiz, and this file is
 * (re)written from their answers.
 *
 * TWO KINDS OF FIELD, TWO BEHAVIORS — read this before editing by hand:
 *
 *   • `identity` is LIVE. Screens import it (e.g. the header reads
 *     `brand.identity.name`), so editing it here changes the app immediately —
 *     it is the real source of truth for the product's name/description/copy.
 *     This is the dataset-driven pattern (see CLAUDE.md): a screen is a pure
 *     view over data, so a rename is one edit here, not a find-and-replace.
 *
 *   • `colors`, `radius` and `typography` are a RECORD of what was chosen. The
 *     values that actually style the app live in the design control panel:
 *         colors  → src/plugins/vuetify.ts   (theme.themes.light/dark.colors)
 *         radius  → src/styles/_tokens.scss   (the five $radius-* values; they
 *                                              feed BOTH the $rounded scale and
 *                                              $border-radius-root)
 *         font    → src/styles/settings.scss  ($body-font-family) — plus the
 *                                              @fontsource/* dependency in
 *                                              package.json and the matching
 *                                              entry in vite.config.mts's Fonts
 *                                              plugin. All three must agree or
 *                                              the app silently falls back to
 *                                              system sans-serif.
 *     Editing them HERE does nothing on its own. To change the look, re-run
 *     `/new-project` (or ask Claude to "apply the brand preset") — the skill
 *     propagates these into the two control-panel files and keeps them in sync.
 *     They live here so the choices are inspectable and a future project can
 *     start from this preset instead of re-answering the quiz.
 */

/** A brand color choice: a human label + the hex the skill writes into the theme. */
export interface BrandColor {
  /** Designer-facing name, e.g. "Brand Blue". Shown in the quiz. */
  label: string
  /** The value written to the matching `theme.colors` token in vuetify.ts. */
  hex: string
}

/** Radius personality — maps to how round the `$radius-*` scale is set in _tokens.scss. */
export type RadiusStyle = 'sharp' | 'soft' | 'round'

export interface BrandConfig {
  /** LIVE — consumed by screens. The product's identity. */
  identity: {
    /** Full product name, e.g. "Acme Health". Used in titles, the header, meta. */
    name: string
    /** Short name / wordmark fallback where space is tight. */
    shortName: string
    /** One-line description of what the product is (for meta tags, empty states). */
    description: string
    /** Optional marketing tagline shown on sign-in / marketing surfaces. */
    tagline?: string
  }

  /**
   * RECORD — the color choices the skill applies to vuetify.ts. Keys mirror the
   * theme tokens exactly so the mapping is one-to-one and obvious. Only the
   * brand-carrying tokens live here; the full stock Vuetify palette (surfaces,
   * emphasis, state opacities) stays in vuetify.ts untouched unless a choice
   * below overrides it.
   */
  colors: {
    /** theme.colors.primary — the main brand color (CTAs, active states). */
    primary: BrandColor
    /** theme.colors.secondary — the supporting accent. */
    secondary: BrandColor
    /**
     * theme.colors['on-surface'] — the app-wide default text/icon color.
     * Vuetify normally derives this by contrast (black on a light surface); the
     * theme declares it explicitly so a brand ink can replace that default.
     */
    onSurface: BrandColor
    /** Semantic status colors — only overridden if the quiz's "exceptions" branch was taken. */
    success: BrandColor
    error: BrandColor
    warning: BrandColor
    info: BrandColor
  }

  /** RECORD — the radius personality the skill applies to _tokens.scss. */
  radius: {
    style: RadiusStyle
    /** Human note on what this personality means, kept for the preset's readability. */
    note: string
  }

  /** RECORD — the app fonts. The body family covers everything except section
   *  headings, and charts read the body font off the rendered page. */
  typography: {
    /** Display name, exactly as written in $body-font-family and vite.config.mts. */
    family: string
    /** Fontsource package slug — `@fontsource/<slug>`. Empty if self-hosted. */
    fontsourceSlug: string
    /** Weights registered with the Fonts plugin; the family must actually ship them. */
    weights: number[]
    /**
     * Optional second family for section headings ($heading-font-family). Omit it
     * and headings inherit the body font — which is the cheaper default, since
     * every registered family is another download on first paint.
     */
    heading?: {
      family: string
      fontsourceSlug: string
      weights: number[]
    }
  }
}

/** The current preset. */
export const brand: BrandConfig = {
  identity: {
    name: 'Robodog',
    shortName: 'Robodog',
    description:
      'A factory operations management platform for monitoring and coordinating production in real time — autonomous vehicles, production lines, equipment and missions on a single live view of the floor.',
    tagline: 'The whole floor, live.',
  },

  colors: {
    // Mirrors vuetify.ts → theme.themes.DARK.colors, which is the app's default
    // theme and the one carrying the brand. (The `light` theme is still on
    // placeholder values, so there is nothing truthful to record from it yet.)
    primary: { label: 'Robodog Blue', hex: '#4C8AE8' },
    secondary: { label: 'Signal Mint', hex: '#62EBCD' },
    onSurface: { label: 'White', hex: '#FFFFFF' },
    success: { label: 'Muted Green', hex: '#6EB185' },
    error: { label: 'Muted Rose', hex: '#D87894' },
    warning: { label: 'Amber', hex: '#DD9933' },
    info: { label: 'Sky Blue', hex: '#68BEFF' },
  },

  radius: {
    // Current scale: sm=4 · md=8 · lg=12 · xl=16 · 2xl=24. See src/styles/_tokens.scss.
    style: 'soft',
    note: 'Soft — 4/8/12/16/24 scale; 8px default tier (cards, buttons, inputs, dialogs, menus), 12px select popups, 24px section panels.',
  },

  typography: {
    // Mirrors $body-font-family in src/styles/settings.scss and the matching
    // entry in vite.config.mts. Changing it here does nothing on its own.
    family: 'Inter',
    fontsourceSlug: 'inter',
    weights: [400, 500, 600, 700],
    // Section headings run in Archivo per the Figma type ramp ($heading-font-family).
    heading: {
      family: 'Archivo',
      fontsourceSlug: 'archivo',
      weights: [400, 500, 600, 700],
    },
  },
}
