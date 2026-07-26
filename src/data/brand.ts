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
 *   • `colors` and `radius` are a RECORD of what was chosen. The values that
 *     actually style the app live in the design control panel:
 *         colors  → src/plugins/vuetify.ts   (theme.themes.light/dark.colors)
 *         radius  → src/styles/settings.scss  ($rounded map + $border-radius-root)
 *     Editing them HERE does nothing on its own. To change the look, re-run
 *     `/new-project` (or ask Claude to "apply the brand preset") — the skill
 *     propagates these into the two control-panel files and keeps them in sync.
 *     They live here so the choices are inspectable and a future project can
 *     start from this preset instead of re-answering the quiz.
 *
 * TEMPLATE-ONLY:start — /new-project deletes this paragraph when it configures
 * the repo, because it describes the UNCONFIGURED state and would be misleading
 * once a real brand is in place.
 *
 *   PLACEHOLDER TOKENS — this repo ships as an unconfigured template. Every
 *   value below that is not yet a real choice is written as a `{{TOKEN}}`
 *   placeholder. Running `/new-project` replaces them (here and in the files
 *   that cannot import this module — index.html, storybook.html, package.json,
 *   README.md, CLAUDE.md). Anything still reading `{{…}}` at runtime means the
 *   project has not been configured yet; that is intentional and visible on
 *   purpose, so an unconfigured template is never mistaken for a finished brand.
 *
 *   The color and radius values below are Vuetify's own stock palette — a
 *   working default, not a brand. The app runs and looks coherent before the
 *   quiz is ever run.
 *
 * TEMPLATE-ONLY:end
 */

/** A brand color choice: a human label + the hex the skill writes into the theme. */
export interface BrandColor {
  /** Designer-facing name, e.g. "Brand Blue". Shown in the quiz. */
  label: string
  /** The value written to the matching `theme.colors` token in vuetify.ts. */
  hex: string
}

/** Radius personality — maps to how round the `$rounded` scale is set in settings.scss. */
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

  /** RECORD — the radius personality the skill applies to settings.scss. */
  radius: {
    style: RadiusStyle
    /** Human note on what this personality means, kept for the preset's readability. */
    note: string
  }
}

/**
 * The current preset.
 *
 * TEMPLATE-ONLY:start
 * `identity` is UNCONFIGURED — the `{{…}}` tokens are filled in by `/new-project`.
 * TEMPLATE-ONLY:end
 */
export const brand: BrandConfig = {
  identity: {
    name: '{{PROJECT_NAME}}',
    shortName: '{{PROJECT_SHORT_NAME}}',
    description: '{{PROJECT_DESCRIPTION}}',
    tagline: '{{PROJECT_TAGLINE}}',
  },

  colors: {
    // Sourced from vuetify.ts light theme — labels match the comments there.
    // TEMPLATE-ONLY:start
    // These are Vuetify's own stock palette, not a brand — a working default.
    // TEMPLATE-ONLY:end
    primary: { label: 'Vuetify Blue', hex: '#1867C0' },
    secondary: { label: 'Teal', hex: '#48A9A6' },
    onSurface: { label: 'Black', hex: '#000000' },
    success: { label: 'Green', hex: '#4CAF50' },
    error: { label: 'Red', hex: '#B00020' },
    warning: { label: 'Orange', hex: '#FB8C00' },
    info: { label: 'Blue', hex: '#2196F3' },
  },

  radius: {
    // Current scale is round: md=16, cards xl=48, buttons pill. See settings.scss $rounded.
    style: 'round',
    note: 'Round — soft 16px content cards, extra-round panels, pill buttons.',
  },
}
