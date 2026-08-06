/**
 * src/components/warehouse/robotLivery.ts
 *
 * ── ONE MANUFACTURER, FIVE MODELS ────────────────────────────────────────────
 *
 * Repaints a loaded robot GLB into the fleet's house livery, so five separately
 * authored models read as one product family instead of five robots from five
 * companies that happen to share a building.
 *
 * WHAT IS AND IS NOT CHANGED. Base colour, roughness and metalness are replaced;
 * normal, ambient-occlusion and emissive MAPS are kept. That split is the whole
 * technique: the maps carry panel lines, bolts, vents and wear — the things that
 * make a model read as machinery — while the flat colours are what make it read
 * as someone else's machinery. Repaint the colour, keep the detail, and the
 * models come out looking like a product line rather than like clip art.
 *
 * HOW A PART IS CLASSIFIED. There is no shared naming convention across five
 * unrelated GLBs, so the only reliable signal is the material the author already
 * chose. Three buckets, by the original colour:
 *
 *   dark        → TRIM     tyres, mast, undercarriage, rubber, shadowed panels
 *   saturated   → ACCENT   lamps, warning stripes, decals, indicator surfaces
 *   everything  → BODY     the hull
 *
 * It is a heuristic and it is meant to be: it holds because authors light dark
 * parts dark and mark warning parts in saturated colour more or less regardless
 * of style. When it misreads a part the result is a differently-painted panel,
 * never a broken mesh — so it degrades into "slightly off livery" rather than
 * into a robot that cannot be drawn.
 *
 * ⚠️ MATERIALS ARE CLONED, NEVER MUTATED IN PLACE. Instances of a chassis share
 * their source materials with the cached GLB, so editing one would repaint every
 * other instance — and the next type to load from the same cache entry.
 */

import { Color, Mesh, MeshStandardMaterial } from 'three'
import type { Material, Object3D } from 'three'

export interface Livery {
  /** Resolved CSS colours — the viewer converts theme tokens before calling in. */
  body: string
  trim: string
  accent: string
  /** Hull finish. Omit to take the house matte paint — see `FINISH`. */
  roughness?: number
  metalness?: number
  /**
   * The unit's own tone — its number decal, its hull marking and its LED strip.
   *
   * Per-unit where `body`/`trim`/`accent` are per-fleet, so five machines off one
   * production line stay tellable apart. Falls back to `accent`.
   */
  rim?: string
  /**
   * The colour the machine's own edges glow — nothing else uses it.
   *
   * Per-FLEET, never per-unit, and never a state; see `robotLivery.glow` in
   * `src/data/fleet.ts` for both reasons. Omit and a chassis is painted but not
   * lit, which is what the schematic markers do on purpose.
   */
  glow?: string
}

/**
 * ── THE GLOW IS ON THE MODEL, AND ONLY ON THE MODEL ──────────────────────────
 *
 * The fleet reads as holographic without any of the machine being holographic,
 * and without anything being added to the scene around it. Two parts, both of
 * them properties of the chassis's own surfaces:
 *
 *   HULL + TRIM   solid, opaque, matte, emitting NOTHING head-on — plus a
 *                 Fresnel rim, which pays out only where the surface turns
 *                 edge-on to the camera. That traces every upright, mast, wheel
 *                 arch and fork in light while the panels facing you stay dark.
 *   DETAIL        the parts the source models authored in saturated colour —
 *                 lamps, indicator strips, light bars — carrying a small
 *                 emissive of their own. The lit details, nothing more.
 *
 * ⚠️ NOTHING IS DRAWN AROUND THE MACHINE, AND THAT IS A REQUIREMENT RATHER THAN
 * AN OMISSION. There is no ground aura, no halo shell, no floor disc, no
 * projected light and no ring of any kind. One was built here and REMOVED: an
 * additive ellipsoid around each chassis, intended as soft light in the air. On
 * a floor seen from above it did not read as atmosphere at all — it read as a
 * circle on the ground under each robot, which on an operations display is the
 * vocabulary of a selection ring or a safety radius. This view already has real
 * rings that mean something (`trafficLayer.ts` draws safety rings and
 * destination marks), so a decorative one is not merely redundant, it is a
 * false reading of the floor. ⚠️ Do not reintroduce a shell, sprite, decal or
 * light to "soften" the rim. The glow belongs to the model's surfaces.
 *
 * ⚠️ A HOLOGRAPHIC MODE ALSO USED TO LIVE HERE AND IS DELETED, NOT DISABLED: it
 * made the hull semi-transparent with `depthWrite: false` and emissive across
 * its whole surface. It was wrong for this product for one reason — these are
 * vehicles on an operations display that an operator reads at distance to
 * decide where machinery IS, and a chassis you can see through stops holding its
 * silhouette against the racking behind it. The rim answers that objection
 * instead of dodging it: it puts light exactly ON the silhouette, so the outline
 * is drawn twice, once by paint against the hall and once by light along its
 * edge. A projection dissolves its own outline; this sharpens it.
 *
 * ⚠️ AND IT IS A LOOK, NOT A STATE. Every unit glows identically whatever it is
 * doing. The moment the rim moves with battery, fault, selection or staleness it
 * becomes status carried by brightness alone, which the domain rules forbid —
 * each of those already owns a word, an icon and a status token.
 */
const FINISH = {
  /**
   * ⚠️ MATTE, AND HIGH ENOUGH TO STAY MATTE UNDER AN ENVIRONMENT MAP. The scene
   * carries a reflection probe for the building's metal (see `addEnvironment`),
   * and a hull below ~0.5 picks it up as a gloss coat that reads as wet plastic.
   */
  bodyRoughness: 0.62,
  /** Painted aluminium, not chrome: enough to catch a highlight, not to mirror. */
  bodyMetalness: 0.12,
  /**
   * ⚠️ ZERO, AND IT IS A DELIBERATE CHOICE RATHER THAN A LEFTOVER. The hull
   * surface emits nothing head-on; every photon the fleet gives off comes from
   * the rim below or from the indicator faces.
   *
   * This was briefly non-zero — a fraction of the paint added uniformly across
   * the whole hull, on the reasoning that a deep-aqua machine in a near-black
   * hall otherwise falls to one flat tone. It does fix the flatness, and it is
   * still the wrong instrument: raising the WHOLE surface makes the machine
   * brighter everywhere at once, which flattens it in the other direction —
   * ambient occlusion, the key's falloff and the contact shadow all wash out
   * together, and the chassis becomes a lit shape instead of a lit object.
   *
   * The rim does the same job with the opposite mechanism. It adds light only
   * where the surface curves away, so the amount varies with the geometry
   * instead of ignoring it — the machine gains form rather than exposure, and
   * the panels facing the camera stay as dark as the reference asks. ⚠️ If this
   * is ever raised again, understand it works AGAINST the rim rather than with
   * it: the rim is only visible as the difference between a lit edge and a dark
   * flank, so lifting the flank is spending the effect to pay for itself.
   */
  bodyEmissive: 0,
  /**
   * ── THE SILHOUETTE RIM ─────────────────────────────────────────────────────
   *
   * A Fresnel term added to the hull's emissive: `pow(1 - facing, rimPower)`,
   * so it is at full strength exactly where the surface turns edge-on to the
   * camera and at zero on the faces pointing straight at it. That is what
   * traces a thin line of light around every upright, mast, wheel arch and
   * fork on the machine while leaving the bodywork dark.
   *
   * ⚠️ THE STRENGTH IS A MULTIPLIER ON `Livery.glow`, NOT A BRIGHTNESS. Against
   * `primary-bright` this lands well short of the white it would blow out to at
   * 1 — a rim that clips to white stops reading as coloured light and starts
   * reading as an aliasing artefact on the silhouette.
   *
   * ⚠️ CUT FROM 0.6, WHICH READ AS A HARD BRIGHT OUTLINE RATHER THAN AS A GLOW.
   * At that level the edge was the brightest thing on the machine and it landed
   * in a band a few pixels wide, so the effect was concentrated exactly where a
   * glow should be weakest — at its boundary. Lowering the peak is what makes it
   * subtle; `rimPower` below is what makes it soft. Both were needed, and it is
   * the pair that lets the band widen without the hull getting brighter: at this
   * strength the mid-flank contribution is roughly HALF what it was at 0.6/2.4,
   * even though the falloff is now much gentler.
   */
  rimStrength: 0.22,
  /**
   * How tightly the rim hugs the silhouette. Higher is thinner and crisper;
   * lower is a wider, softer gradient into the dark of the flank.
   *
   * ⚠️ THE SOFTNESS OF THE WHOLE EFFECT LIVES HERE, NOT IN `rimStrength`. This
   * is the knob to reach for when the glow reads as too hard or too clinical —
   * widening the band diffuses it while leaving the peak exactly where it is,
   * whereas raising the strength makes it brighter and no softer at all, which
   * is the opposite of what "make it subtler" usually means.
   *
   * ⚠️ THE "BELOW ~2 THE RIM STOPS BEING A RIM" LIMIT WAS WRITTEN AGAINST A
   * STRENGTH OF 0.6, AND IT DOES NOT SURVIVE THE CUT TO 0.22. That warning is
   * about the FLANK getting lifted until the effect is `bodyEmissive` by an
   * expensive route — and the flank's brightness is `strength × pow(…)`, so the
   * two knobs trade against each other rather than being independent. Working it
   * through at the surface half-turned away from the camera:
   *
   *   0.60 × pow(0.5, 2.4) = 0.114     ← the hard version
   *   0.22 × pow(0.5, 1.8) = 0.063     ← this one
   *
   * The band is far wider and the flank is still nearly half as bright, so the
   * hull gets darker and the gradient gets gentler at the same time. What must
   * not happen is widening the band while LEAVING the strength high; that is the
   * failure the original note describes, and it is still true.
   */
  rimPower: 1.8,
  /** Trim is rubber, cable and shadowed structure — rougher and deader than paint. */
  trimRoughness: 0.78,
  trimMetalness: 0.05,
  /**
   * ── THE ILLUMINATED DETAILS ────────────────────────────────────────────────
   *
   * The only SURFACE emissive on the machine, and the second half of the look:
   * the rim draws the outline, these are the lit parts inside it. Lamps,
   * indicator strips and light bars are exactly the parts the source models
   * already authored in saturated colour, so the accent bucket IS the lit-detail
   * bucket — no per-model annotation needed, and no guessing which face is a
   * lamp.
   *
   * ⚠️ THIS EMITS AGAIN AFTER BEING ZEROED, AND WHAT MADE IT WRONG IS GONE. Any
   * emissive here used to bloom into a floating orb with a curved streak beside
   * it, which read as an effect hovering over the robot rather than as part of
   * it. That was the BLOOM PASS selecting on brightness, and the pass has since
   * been deleted (`warehouseScene.ts` → "THE BLOOM PASS IS GONE"). Without it a
   * lamp is simply a lamp: a small self-lit face on the machine, with no spread
   * beyond its own pixels.
   *
   * Kept well below the level of an alarm. These are status surfaces on a
   * working vehicle, and anything the hall raises as genuinely urgent has to
   * stay the brightest thing on the floor. ⚠️ If a bloom pass is ever restored,
   * this and `rimStrength` are the two values its threshold must clear.
   */
  ledEmissive: 0.28,
  ledRoughness: 0.34,
  ledMetalness: 0,
} as const

/** Below this luminance a part is structure rather than bodywork. */
const TRIM_LUMINANCE = 0.22
/** Above this saturation a part is a marking rather than bodywork. */
const ACCENT_SATURATION = 0.45
/** …but only if it is bright enough to be a marking rather than a dark plastic. */
const ACCENT_MIN_LIGHTNESS = 0.25

type SourceMaterial = Material & {
  color?: Color
  map?: unknown
  normalMap?: unknown
  aoMap?: unknown
  emissiveMap?: unknown
  transparent?: boolean
  opacity?: number
}

/** Perceived brightness. Weighted for human vision, not a plain average. */
function luminanceOf (color: Color): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
}

function saturationOf (color: Color): number {
  const max = Math.max(color.r, color.g, color.b)
  const min = Math.min(color.r, color.g, color.b)
  if (max === 0) return 0
  return (max - min) / max
}

type Bucket = 'trim' | 'accent' | 'body'

function pickBucket (source: SourceMaterial): Bucket {
  const color = source.color
  if (!color) return 'body'

  const luminance = luminanceOf(color)
  if (luminance < TRIM_LUMINANCE) return 'trim'
  if (saturationOf(color) > ACCENT_SATURATION && luminance > ACCENT_MIN_LIGHTNESS) return 'accent'
  return 'body'
}

function toneFor (bucket: Bucket, livery: Livery): string {
  return bucket === 'trim' ? livery.trim : bucket === 'accent' ? livery.accent : livery.body
}

/** Where the rim's uniforms are declared, and where its light is added. */
const RIM_UNIFORM_ANCHOR = '#include <common>'
const RIM_EMISSIVE_ANCHOR = '#include <emissivemap_fragment>'

const RIM_UNIFORMS = /* glsl */`
#include <common>
uniform vec3 rimColor;
uniform float rimStrength;
uniform float rimPower;
`

/**
 * ⚠️ THE TWO INPUTS ARE BOTH GUARANTEED AT THIS POINT IN THE SHADER, AND THAT
 * IS WHY THE INJECTION GOES HERE RATHER THAN ANYWHERE ELSE. `normal` is the
 * view-space, normal-mapped surface normal, produced by <normal_fragment_begin>
 * a few lines above — so the rim follows the panel detail in the GLB's normal
 * map instead of the raw silhouette of the mesh. `vViewPosition` is declared
 * unconditionally in the standard material's fragment shader and points from
 * the fragment to the camera. And `totalEmissiveRadiance` is already in scope,
 * so the rim is added to the same channel the LEDs use rather than to a
 * parallel one the tone mapper would treat differently.
 */
const RIM_EMISSIVE = /* glsl */`
#include <emissivemap_fragment>
float rimFacing = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
totalEmissiveRadiance += rimColor * rimStrength * pow( 1.0 - rimFacing, rimPower );
`

/** One warning per session, not one per material — see `applyRim`. */
let rimAnchorReported = false

/**
 * ── THE RIM IS INJECTED, NOT CONFIGURED ──────────────────────────────────────
 *
 * `MeshStandardMaterial` has no Fresnel term, so the only way to have one and
 * keep everything else the standard material gives us — image-based lighting,
 * shadows, the GLB's own normal and AO maps, tone mapping — is to splice four
 * lines into its compiled shader.
 *
 * ⚠️ IT DEGRADES TO NO RIM, NEVER TO A BROKEN MATERIAL. `String.replace` with a
 * missing needle returns the string untouched, so if a future Three renames
 * either chunk the material still compiles and the fleet renders as plain
 * painted machinery with its indicator faces still lit. That is a far better
 * failure than a shader link error, which takes the whole 3D view down — but it
 * is also a SILENT one, since a slightly flatter robot looks like a lighting
 * choice rather than a break. The console line below is how anyone finds out.
 *
 * ⚠️ `customProgramCacheKey` IS NOT OPTIONAL. Three caches compiled programs by
 * the material's defines and does NOT look at `onBeforeCompile`, so without a
 * distinguishing key a rimmed hull and an unrimmed indicator face — same
 * material class, same defines — can be handed each other's program. The
 * symptom is glowing lamps and dark hulls, or the reverse, depending on which
 * compiled first.
 */
function applyRim (material: MeshStandardMaterial, glow: string): void {
  const rimColor = new Color(glow)

  material.onBeforeCompile = shader => {
    if (!shader.fragmentShader.includes(RIM_EMISSIVE_ANCHOR)) {
      if (!rimAnchorReported) {
        rimAnchorReported = true
        console.warn(
          '[warehouse] the fleet rim could not be injected — this build of Three no longer emits',
          `"${RIM_EMISSIVE_ANCHOR}". Robots render without their silhouette glow; their indicator`,
          'faces still light. Re-point RIM_EMISSIVE_ANCHOR in robotLivery.ts at the renamed chunk.',
        )
      }
      return
    }

    shader.uniforms.rimColor = { value: rimColor }
    shader.uniforms.rimStrength = { value: FINISH.rimStrength }
    shader.uniforms.rimPower = { value: FINISH.rimPower }
    shader.fragmentShader = shader.fragmentShader
      .replace(RIM_UNIFORM_ANCHOR, RIM_UNIFORMS)
      .replace(RIM_EMISSIVE_ANCHOR, RIM_EMISSIVE)
  }

  material.customProgramCacheKey = () => `fleet-rim:${glow}`
}

/**
 * Build one bucket's material: matte paint, dark structure, or an LED.
 *
 * ⚠️ THE NORMAL AND AO MAPS SURVIVE THE REPAINT, which is the whole technique
 * (see the header). They carry the panel lines, bolts, vents and cast-in wear
 * that make a model read as machinery; the flat colour is the only part that
 * made it read as SOMEBODY ELSE'S machinery.
 *
 * ⚠️ TRANSPARENCY IS INHERITED, NEVER INVENTED. A cab window or a lamp lens that
 * the author made transparent stays transparent — turn that off and a cab
 * becomes a solid block. Nothing here makes an opaque part see-through.
 */
function paintedMaterial (
  bucket: Bucket,
  from: SourceMaterial,
  livery: Livery,
): MeshStandardMaterial {
  const led = bucket === 'accent'
  const tone = led ? (livery.rim ?? livery.accent) : toneFor(bucket, livery)

  const material = new MeshStandardMaterial({
    color: new Color(tone),
    roughness: led
      ? FINISH.ledRoughness
      : bucket === 'trim' ? FINISH.trimRoughness : (livery.roughness ?? FINISH.bodyRoughness),
    metalness: led
      ? FINISH.ledMetalness
      : bucket === 'trim' ? FINISH.trimMetalness : (livery.metalness ?? FINISH.bodyMetalness),
    // ⚠️ ONLY THE INDICATOR FACES CARRY A FLAT SURFACE EMISSIVE. Hull and trim
    // are both zero here: the machine is a dark painted object whose light
    // comes from the rim added below, which pays out at grazing angles only.
    // `bodyEmissive` is 0 and the note on it says why.
    emissive: led ? new Color(tone) : new Color(0x000000),
    emissiveIntensity: led ? FINISH.ledEmissive : 0,
    normalMap: (from.normalMap ?? null) as MeshStandardMaterial['normalMap'],
    aoMap: (from.aoMap ?? null) as MeshStandardMaterial['aoMap'],
    transparent: from.transparent ?? false,
    opacity: from.opacity ?? 1,
  })

  // ⚠️ THE RIM TRACES THE WHOLE MACHINE, STRUCTURE INCLUDED. Wheels, mast and
  // forks are as much of a forklift's outline as its bodywork is, so the trim
  // bucket is rimmed too — skip it and the machine is a glowing hull sitting on
  // an invisible undercarriage. Both surfaces stay dark head-on regardless;
  // Fresnel only pays out at grazing angles, which is the point.
  //
  // ⚠️ AND IT IS KEPT OFF THE INDICATOR FACES. Those already carry the UNIT'S
  // own accent — the one channel that says which of two identical forklifts
  // this is — and washing the fleet's single glow colour over them would blur
  // exactly the distinction they exist to make.
  if (livery.glow && !led) applyRim(material, livery.glow)

  return material
}

/**
 * Repaint every mesh under `root`.
 *
 * Safe to call on a fresh clone only — see the warning above about shared
 * materials. Returns the materials it created so the caller can dispose them;
 * they are per-instance and nothing else will free them.
 */
export function applyLivery (root: Object3D, livery: Livery): MeshStandardMaterial[] {
  const created: MeshStandardMaterial[] = []
  // One replacement per SOURCE material, reused across every mesh that shared
  // it — a model with 400 meshes over 6 materials should end up with 6 new
  // materials, not 400, or the draw-call count goes up with the repaint.
  const replacements = new Map<Material, MeshStandardMaterial>()

  root.traverse(child => {
    const mesh = child as Mesh & { isMesh?: boolean }
    if (!mesh.isMesh || !mesh.material) return

    const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const painted = sources.map(source => {
      const existing = replacements.get(source)
      if (existing) return existing

      const from = source as SourceMaterial
      const next = paintedMaterial(pickBucket(from), from, livery)
      next.name = `livery:${source.name || 'unnamed'}`
      replacements.set(source, next)
      created.push(next)
      return next
    })

    mesh.material = painted.length === 1 ? painted[0]! : painted
  })

  return created
}
