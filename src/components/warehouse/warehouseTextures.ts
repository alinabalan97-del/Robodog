/**
 * src/components/warehouse/warehouseTextures.ts
 *
 * ── SURFACES FOR A BUILDING THAT HAS NONE ────────────────────────────────────
 *
 * The warehouse GLB arrives with ONE material and no semantics: every node is
 * `Node0…Node28`, every mesh is `Mesh0`, and the whole building shares a single
 * flat surface. That is why the hall reads as clay — there is nothing in the
 * asset to tell a floor slab from a rack upright, so nothing can be shaded
 * differently from anything else.
 *
 * ⚠️ THE SPLIT IS THEREFORE GEOMETRIC, NOT NAME-BASED — the same technique
 * `WarehouseScene`'s interior clip already uses, and for the same reason. A
 * surface is FLOOR when it is horizontal and low; everything else is STRUCTURE.
 * Nothing here parses a name, because there are no names to parse.
 *
 * ⚠️ AND NOTHING HERE GENERATES WAREHOUSE STRUCTURE. CLAUDE.md is explicit that
 * the 3D scene draws no racking, shelving or walls; the GLB already contains
 * them. This module only re-SURFACES geometry that is already there. If you find
 * yourself adding a mesh in this file, it belongs somewhere else or nowhere.
 *
 * ── WHY PROCEDURAL RATHER THAN IMAGE FILES ───────────────────────────────────
 *
 * The project already ships ~380 MB of GLBs and the first paint is the known
 * bottleneck. A concrete albedo/roughness/normal set at any useful resolution is
 * several megabytes more per surface. These are drawn once into canvases at
 * load, cost tens of kilobytes of memory each, tile seamlessly, and re-generate
 * at whatever resolution a future display needs. They are also deterministic:
 * the noise is seeded, so the same hall renders the same way every session
 * rather than shimmering differently on each reload.
 */

import {
  CanvasTexture,
  Color,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
} from 'three'
import type { Texture } from 'three'

/** Deterministic value noise — a seeded mulberry32, as the simulation uses. */
function makeRng (seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas (size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement('canvas')
  el.width = size
  el.height = size
  const ctx = el.getContext('2d')
  if (!ctx) throw new Error('warehouseTextures: 2D canvas context unavailable')
  return [el, ctx]
}

function finish (el: HTMLCanvasElement, repeat: number, srgb: boolean): CanvasTexture {
  const tex = new CanvasTexture(el)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.anisotropy = 8
  tex.minFilter = LinearMipmapLinearFilter
  // ⚠️ COLOUR MAPS ARE sRGB, DATA MAPS ARE NOT. A roughness or normal map tagged
  // sRGB is silently gamma-decoded and the surface comes out wrong in a way that
  // looks like a lighting problem rather than a texture one.
  if (srgb) tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export interface WarehouseTextureSet {
  floorMap: Texture
  floorRoughness: Texture
  floorNormal: Texture
  structureMap: Texture
  structureRoughness: Texture
  /**
   * Relief for the racking: the brushed grain and the section seams.
   *
   * ⚠️ THIS IS WHAT MAKES PAINTED STEEL READ AS STEEL rather than as a grey
   * surface with a picture of steel on it. Painted metal is nearly dielectric,
   * so it has no strong reflection to carry the form — almost all of its
   * apparent texture is the light catching relief, and without a normal map the
   * uprights shade as flat prisms however good the albedo is.
   */
  structureNormal: Texture
  dispose: () => void
}

/**
 * A worn concrete slab: aggregate speckle, pour variation, scuffing, and the
 * tyre tracks a working floor actually carries.
 *
 * Drawn in three passes because that is how the surface reads: the base tone is
 * the pour, the speckle is the aggregate in it, and the wear sits ON TOP of both
 * — a floor whose dirt is mixed into its base colour looks tinted rather than
 * used.
 */
function concrete (base: string, size = 512): { colour: HTMLCanvasElement; rough: HTMLCanvasElement } {
  const [colourEl, c] = canvas(size)
  const [roughEl, r] = canvas(size)
  const rng = makeRng(0x5EED)

  c.fillStyle = base
  c.fillRect(0, 0, size, size)
  // Roughness starts high: bare concrete is matte, and the polish comes later
  // only where traffic has burnished it.
  r.fillStyle = '#c8c8c8'
  r.fillRect(0, 0, size, size)

  // 1 · Pour variation — broad, soft patches. A slab is poured in bays and they
  //     never quite match.
  for (let i = 0; i < 26; i++) {
    const x = rng() * size
    const y = rng() * size
    const rad = size * (0.08 + rng() * 0.2)
    const shade = Math.round(6 + rng() * 10)
    const g = c.createRadialGradient(x, y, 0, x, y, rad)
    // ⚠️ ALL BUT GONE FROM THE ALBEDO. Pour variation is drawn as low-alpha
    // WHITE over the base, so it survives however black the tint is set — it was
    // the last thing keeping the slab off pure black. The pours are still there,
    // in the ROUGHNESS map below, where they vary the reflection instead of the
    // colour. See the header note on where this floor's surface now comes from.
    g.addColorStop(0, `rgba(255,255,255,${0.002 + rng() * 0.004})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g
    c.beginPath()
    c.arc(x, y, rad, 0, Math.PI * 2)
    c.fill()
    void shade
  }

  // 2 · Aggregate — fine speckle, both lighter and darker than the pour.
  for (let i = 0; i < size * 34; i++) {
    const x = rng() * size
    const y = rng() * size
    const light = rng() > 0.5
    // ⚠️ THE WHITE HALF IS ALL BUT REMOVED, AND IT WAS THE FLOOR'S FLOOR. These
    // specks are drawn OVER the base colour, so at alpha 0.09 they landed near
    // #171717 no matter how black the tint went — which is why the slab kept
    // reading as dark grey through several rounds of darkening the token. The
    // dark half is kept at full strength: subtracting from black costs nothing
    // and it still breaks up the surface.
    const a = light ? 0.004 + rng() * 0.008 : 0.02 + rng() * 0.07
    c.fillStyle = light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`
    c.fillRect(x, y, 1, 1)
    // ⚠️ THE ROUGHNESS SPECKLE IS UNTOUCHED, AND IT IS NOW THE WHOLE TEXTURE.
    // Aggregate is what makes concrete non-uniformly rough, and roughness varies
    // the REFLECTION rather than the colour — so it survives a pure-black albedo
    // intact. This is what stops the floor being a flat void: the sheen moves
    // across it even though the colour does not.
    const rr = 190 + Math.round(rng() * 60)
    r.fillStyle = `rgba(${rr},${rr},${rr},0.5)`
    r.fillRect(x, y, 1, 1)
  }

  // 3 · Wear — scuffs, and the tyre tracks a lane carries. Tracks BURNISH the
  //     slab, so they are darker in colour AND smoother in roughness; that
  //     contrast is most of what makes a floor read as driven-on rather than
  //     merely dirty.
  for (let i = 0; i < 9; i++) {
    const y = rng() * size
    const h = 3 + rng() * 7
    c.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.06})`
    c.fillRect(0, y, size, h)
    r.fillStyle = `rgba(90,90,90,${0.45 + rng() * 0.3})`
    r.fillRect(0, y, size, h)
  }
  for (let i = 0; i < 40; i++) {
    const x = rng() * size
    const y = rng() * size
    const w = 8 + rng() * 60
    const h = 1 + rng() * 2
    c.save()
    c.translate(x, y)
    c.rotate((rng() - 0.5) * 0.6)
    c.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.05})`
    c.fillRect(-w / 2, -h / 2, w, h)
    c.restore()
  }

  // 4 · Tile seams — the grid.
  //
  // ⚠️ DRAWN MOSTLY INTO ROUGHNESS, NOT COLOUR, which is what lets a grid exist
  // on a pure-black floor at all. A grid painted into the albedo has to be
  // LIGHTER than the surface to be seen, so on black it is the one thing
  // guaranteed to lift the floor off black — the exact problem several rounds
  // of darkening were spent chasing. A seam is physically a change of FINISH,
  // not of colour: grout and the poured edge of a bay are rougher than the
  // burnished field either side, so they break the reflection and read as lines
  // without adding any brightness of their own.
  //
  // One line per tile edge. The map repeats 24× across a ~29 m hall, so a cell
  // lands near 1.2 m — a real slab bay, and close to the reference's pitch.
  const seam = 2
  // A whisper in the albedo so the grid still reads where nothing is reflected.
  // Cool-neutral rather than blue: the reference's grid looks blue because the
  // room is, and tinting it here would put a cast on the floor itself.
  c.fillStyle = 'rgba(190,198,206,0.035)'
  c.fillRect(0, 0, size, seam)
  c.fillRect(0, 0, seam, size)
  // The real signal. Near-white in a roughness map is very rough, so the seam
  // scatters where the field reflects — a matte line across a glossy floor.
  r.fillStyle = 'rgba(240,240,240,0.85)'
  r.fillRect(0, 0, size, seam)
  r.fillRect(0, 0, seam, size)

  return { colour: colourEl, rough: roughEl }
}

/**
 * A normal map derived from a greyscale source by Sobel gradient.
 *
 * ⚠️ DERIVED FROM THE ROUGHNESS, NOT DRAWN SEPARATELY, and that is deliberate:
 * the bumps on a concrete floor ARE its aggregate and its scuffing, so a normal
 * map drawn independently would light a surface whose relief disagreed with its
 * shading. One source keeps them consistent.
 */
function normalFrom (source: HTMLCanvasElement, strength = 2.2): HTMLCanvasElement {
  const size = source.width
  const src = source.getContext('2d')!.getImageData(0, 0, size, size)
  const [el, ctx] = canvas(size)
  const out = ctx.createImageData(size, size)
  const at = (x: number, y: number) => {
    const xi = ((x % size) + size) % size
    const yi = ((y % size) + size) % size
    return src.data[(yi * size + xi) * 4]! / 255
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      out.data[i] = ((dx / len) * 0.5 + 0.5) * 255
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      out.data[i + 3] = 255
    }
  }
  ctx.putImageData(out, 0, 0)
  return el
}

/**
 * Brushed structural metal for everything that is not floor — uprights, beams,
 * shelving, workstation frames, cladding.
 *
 * ⚠️ THIS REPLACED A PAINTED-AND-WEATHERED STEEL, and the difference is the
 * brief rather than a tweak. The old surface carried rust blooms, impact chips
 * and a grime gradient up every upright: excellent for a working hall that has
 * been used for twenty years, wrong for the high-tech warehouse this product is
 * meant to show. Wear is what dates a surface, so there is none here — what is
 * left is the honest structure of rolled metal: a fine directional grain, the
 * mill's own tonal drift, and the horizontal seams where sections meet.
 *
 * ⚠️ AND IT IS STILL A TEXTURE, NOT A GLOSS SETTING. A flat grey at high
 * metalness reads as plastic; it is the grain that makes the reflection break up
 * across a surface, which is the entire difference between "metal" and "shiny".
 */
function paintedSteel (base: string, size = 512): { colour: HTMLCanvasElement; rough: HTMLCanvasElement } {
  const [colourEl, c] = canvas(size)
  const [roughEl, r] = canvas(size)
  const rng = makeRng(0xB0B)

  c.fillStyle = base
  c.fillRect(0, 0, size, size)
  // Mid roughness as the base: structural metal is satin, neither mirror nor
  // matte, and the grain below varies it rather than replacing it.
  r.fillStyle = '#9a9a9a'
  r.fillRect(0, 0, size, size)

  // 1 · Brushed grain, vertical — the mill direction. Finer and lower-contrast
  //     than the painted version's: a brushed finish is a texture you read in
  //     the REFLECTION, so most of the variation belongs in roughness rather
  //     than in colour, where it would just look like dirty stripes.
  for (let x = 0; x < size; x++) {
    const a = 0.010 + rng() * 0.022
    c.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`
    c.fillRect(x, 0, 1, size)

    const rr = 138 + Math.round(rng() * 74)
    r.fillStyle = `rgba(${rr},${rr},${rr},0.55)`
    r.fillRect(x, 0, 1, size)
  }

  // 2 · Broad tonal drift across the sheet. Rolled metal is never one flat tone,
  //     and without this the surface reads as a solid fill at any distance.
  for (let i = 0; i < 14; i++) {
    const x = rng() * size
    const y = rng() * size
    const rad = size * (0.12 + rng() * 0.26)
    const g = c.createRadialGradient(x, y, 0, x, y, rad)
    const light = rng() > 0.5
    g.addColorStop(0, `rgba(${light ? '255,255,255' : '0,0,0'},${0.014 + rng() * 0.022})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g
    c.beginPath()
    c.arc(x, y, rad, 0, Math.PI * 2)
    c.fill()
  }

  // 3 · Section seams, horizontal — where one rolled length meets the next.
  //     Two-tone: a dark line with a lighter lip under it, which is what a
  //     shadowed joint plus its catch of light actually looks like. These are
  //     the only hard edges on the surface and they are what give racking its
  //     sense of being assembled from parts rather than extruded whole.
  for (let i = 0; i < 5; i++) {
    const y = Math.floor(rng() * size)
    c.fillStyle = 'rgba(0,0,0,0.13)'
    c.fillRect(0, y, size, 1)
    c.fillStyle = 'rgba(255,255,255,0.055)'
    c.fillRect(0, y + 1, size, 1)
    // A joint is slightly rougher than the sheet either side of it.
    r.fillStyle = 'rgba(205,205,205,0.6)'
    r.fillRect(0, y, size, 2)
  }

  return { colour: colourEl, rough: roughEl }
}

/**
 * Build the whole set once.
 *
 * `floorTint` and `structureTint` are resolved THEME COLOURS, passed in by the
 * viewer — the same rule the livery follows. No hex belongs in this file: the
 * hall re-surfaces with the app's theme instead of drifting from it.
 */
export function createWarehouseTextures (
  floorTint: string,
  structureTint: string,
): WarehouseTextureSet {
  // Tints are darkened slightly before they become a base coat: a surface map at
  // full theme luminance leaves nothing for the lighting to add, which is a
  // large part of why the untextured hall looked flat.
  const dim = (css: string, factor: number) =>
    `#${new Color(css).multiplyScalar(factor).getHexString()}`
  /** Same operation, clamped — a scale above 1 can otherwise overflow a channel. */
  const lift = (css: string, factor: number) => {
    const c = new Color(css).multiplyScalar(factor)
    return `#${new Color(Math.min(c.r, 1), Math.min(c.g, 1), Math.min(c.b, 1)).getHexString()}`
  }

  // ⚠️ BARELY LIFTED. The tint is the app's darkest token and the floor is meant
  // to read as deep matte black, so this stays as close to it as the texture
  // allows. A small lift remains because the wear, aggregate and tyre tracks are
  // drawn INTO the albedo: at zero headroom every one of them clamps to black
  // and the slab becomes a flat void. Note that most of the floor's visible
  // character now comes from the ROUGHNESS map instead, which varies the
  // reflection independently of the albedo and therefore survives on a black
  // surface — that is what makes a black floor read as concrete rather than as
  // a hole in the scene.
  // ⚠️ NO LIFT LEFT. The slab is meant to read as black, so the base coat is the
  // token unchanged. What remains visible on it is the aggregate speckle, which
  // `concrete()` draws as low-alpha WHITE over the base and therefore survives
  // any albedo — that speckle is now the entire albedo texture, and it is the
  // thing to reach for if the floor ever needs to be blacker still.
  const floor = concrete(lift(floorTint, 1))
  const floorN = normalFrom(floor.rough, 2.4)
  // The tint is already the dark graphite the racking is painted, so it is taken
  // almost as authored — the texture's own drift and grime supply the variation
  // that a dim factor used to. Dimming a dark albedo further only crushes the
  // grain and the seams into black.
  const steel = paintedSteel(dim(structureTint, 0.95))

  // Repeats are chosen against the building, which measures ~28.8 × 15.9 m: 24
  // tiles puts a concrete tile at roughly 1.2 m, about the size of a real slab
  // bay, and 8 keeps the steel grain fine enough not to read as stripes.
  const floorMap = finish(floor.colour, 24, true)
  const floorRoughness = finish(floor.rough, 24, false)
  const floorNormal = finish(floorN, 24, false)
  // 14 rather than 8: the seams and the grain both want to land at a plausible
  // physical size, and at 8 a "section joint" spanned nearly two metres of
  // upright. Higher also keeps the brushed grain from reading as wide stripes.
  const structureMap = finish(steel.colour, 14, true)
  const structureRoughness = finish(steel.rough, 14, false)
  // Derived from the roughness for the same reason the floor's is: the relief on
  // a rolled section IS its grain and its seams, so a normal map drawn
  // independently would light a surface whose bumps disagreed with its shading.
  const structureNormal = finish(normalFrom(steel.rough, 1.5), 14, false)

  const all = [
    floorMap, floorRoughness, floorNormal,
    structureMap, structureRoughness, structureNormal,
  ]
  return {
    floorMap,
    floorRoughness,
    floorNormal,
    structureMap,
    structureRoughness,
    structureNormal,
    dispose: () => { for (const t of all) t.dispose() },
  }
}

/** Normal-map strength, exported so the scene can tune relief in one place. */
export const FLOOR_NORMAL_SCALE = new Vector2(0.6, 0.6)

/**
 * Relief strength for the racking.
 *
 * Stronger than the floor's: a slab's bumps are aggregate a millimetre across
 * and read as noise if they are pushed, whereas a rolled section's grain and
 * seams are the form itself and are what stop an upright shading as a flat
 * prism.
 *
 * ⚠️ PULLED WAY DOWN FOR THE GLASS RACKING. It ran as high as 1.15 while the
 * structure was opaque PAINT, where heavy relief is what stopped an upright
 * shading as a flat prism. Glass is smooth: the same relief on a translucent
 * member breaks up the clean specular rim that draws its edges, which is the
 * one thing carrying the structure now. Enough is left to keep the surface from
 * being perfectly optical, and no more.
 */
export const STRUCTURE_NORMAL_SCALE = new Vector2(0.45, 0.45)
