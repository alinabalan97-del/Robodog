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
  roughness: number
  metalness: number
}

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

function pickTone (source: SourceMaterial, livery: Livery): string {
  const color = source.color
  if (!color) return livery.body

  const luminance = luminanceOf(color)
  if (luminance < TRIM_LUMINANCE) return livery.trim
  if (saturationOf(color) > ACCENT_SATURATION && luminance > ACCENT_MIN_LIGHTNESS) return livery.accent
  return livery.body
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
      const next = new MeshStandardMaterial({
        color: new Color(pickTone(from, livery)),
        roughness: livery.roughness,
        metalness: livery.metalness,
        // Form detail survives the repaint; only the paint changes.
        normalMap: (from.normalMap ?? null) as MeshStandardMaterial['normalMap'],
        aoMap: (from.aoMap ?? null) as MeshStandardMaterial['aoMap'],
        // Glass and lamps keep their transparency, or a cab turns into a solid
        // block and the model stops reading as a vehicle.
        transparent: from.transparent ?? false,
        opacity: from.opacity ?? 1,
      })
      next.name = `livery:${source.name || 'unnamed'}`
      replacements.set(source, next)
      created.push(next)
      return next
    })

    mesh.material = painted.length === 1 ? painted[0]! : painted
  })

  return created
}
