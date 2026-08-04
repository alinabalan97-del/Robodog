/**
 * src/data/asrs.ts
 *
 * ── THE ASRS STACKER CRANES, MEASURED OFF THE BUILDING ───────────────────────
 *
 * Four rail-guided stacker cranes, each bolted into one storage aisle and unable
 * to leave it. This file says where the rails are, how long they are, which rack
 * bays and levels each crane can address, and how big the machine is — all of it
 * derived from `warehouseStructure.ts`, which is generated from the GLB.
 *
 * ⚠️ THIS REPLACED A FIXTURE THAT WAS DRAWN, NOT MEASURED. The ASRS used to be a
 * single GLB standing at a hand-picked coordinate with one degree of freedom (the
 * whole machine rose 0.44 m and sank again). Three things were wrong with it and
 * all three are geometry, not styling:
 *
 *   1. IT LAY ACROSS THE AISLE. The asset is 2.03 m on its long axis and 1.58 m
 *      across; with `headingRad: π` and no yaw offset the LONG axis pointed down
 *      plan-y — across a 2.62 m aisle. The machine occupied 77 % of the gap it
 *      was supposed to run down.
 *   2. IT WAS NOT IN THE AISLE'S CENTRE. It stood at plan y 180 / y 725, so its
 *      box crossed the rack faces at y 151 / y 757 and it rendered inside the
 *      shelving.
 *   3. IT COULD NOT HAVE A CARRIAGE. The GLB is one unrigged mesh, so "the lift
 *      moved" could only ever mean the entire machine — chassis, mast and all —
 *      floating off the floor. See `warehouse/asrsLayer.ts` for what replaced it.
 *
 * ── HOW WIDE IS AN AISLE, REALLY ─────────────────────────────────────────────
 *
 * Measured off the nav grid (`warehouseNav.ts`, the 0.25–1.9 m obstacle band),
 * in the plan space this app draws in:
 *
 *   north aisle (rack runs A | B)   free y 151…276   2.62 m   uniform x 120→470
 *   south aisle (rack runs C | D)   free y 626…757   2.75 m   uniform x 120→470
 *
 * `CRANE_AISLE_FRACTION` is applied to the NARROWER of the two, so one machine
 * size clears both. Everything else about the crane follows from that number.
 *
 * ⚠️ THE AISLES ARE SHARED WITH THE FLEET, and that is a real constraint rather
 * than an oversight. The north lane runs at y 230 and the south at y 675, so a
 * forklift 1.21 m wide occupies 1.21 m of the same gap the crane runs down. A
 * crane at 65 % of the full aisle (1.70 m) plus a forklift (1.21 m) is 2.91 m in
 * a 2.62 m aisle: they cannot both be there. So the crane is sized to the strip
 * it actually owns — the aisle MINUS the traffic lane's envelope — which is what
 * "clearance on both sides for safe operation" has to mean in this building. The
 * fraction is applied to that strip and the resulting clearances are asserted
 * below rather than assumed.
 *
 * ── ⚠️ TWO PLAN SPACES, AND THE ADAPTER BETWEEN THEM ─────────────────────────
 *
 * `warehouseStructure.ts` is generated in its own plan box (0,0 → 1440.72 ×
 * 796.904, 50 units/m). The app currently draws in `floorOps.map.viewBox`
 * (−67,70 → 1374 × 760, 47.684 units/m). Both boxes are fitted to the SAME
 * building interior, so the map between them is a single uniform scale plus an
 * offset — `PLAN_FROM_STRUCTURE` below computes it from the two boxes rather
 * than hard-coding a factor.
 *
 * A network refactor now in flight moves the app onto the structure box. When it
 * lands the two boxes coincide, `PLAN_FROM_STRUCTURE` becomes the identity on
 * its own, and this adapter can be deleted without touching a coordinate.
 */

import { aisles, planScale, planViewBox, rackRuns } from './warehouseStructure'
import { floorOps } from './floorOps'

// ─── The adapter between the generated plan box and the drawn one ─────────────

const target = floorOps.map.viewBox

/**
 * Structure plan units → the plan units every renderer here draws in.
 *
 * Uniform by construction: both boxes are the building's interior, so the two
 * axes produce the same scale. If they ever stop agreeing the boxes describe
 * different buildings, which is worth an error rather than a silent stretch.
 */
export const PLAN_FROM_STRUCTURE = {
  scale: target.width / planViewBox.width,
  fromX: planViewBox.x,
  fromY: planViewBox.y,
  toX: target.x,
  toY: target.y,
} as const

{
  const scaleY = target.height / planViewBox.height
  if (Math.abs(scaleY - PLAN_FROM_STRUCTURE.scale) > 1e-4) {
    console.error(
      '[asrs] The drawn plan box and the generated one disagree about the building\'s '
      + `proportions (x ${PLAN_FROM_STRUCTURE.scale.toFixed(5)} vs y ${scaleY.toFixed(5)}). `
      + 'One of them is a crop rather than the interior — see floorOps.map.viewBox.',
    )
  }
}

const px = (structureX: number) =>
  (structureX - PLAN_FROM_STRUCTURE.fromX) * PLAN_FROM_STRUCTURE.scale + PLAN_FROM_STRUCTURE.toX
const py = (structureY: number) =>
  (structureY - PLAN_FROM_STRUCTURE.fromY) * PLAN_FROM_STRUCTURE.scale + PLAN_FROM_STRUCTURE.toY

/** Plan units per metre in the space this file emits. */
export const ASRS_PLAN_UNITS_PER_METRE = planScale.unitsPerMetre * PLAN_FROM_STRUCTURE.scale
const toPlan = (metres: number) => metres * ASRS_PLAN_UNITS_PER_METRE
const toMetres = (units: number) => units / ASRS_PLAN_UNITS_PER_METRE

// ─── The aisles a crane can be put in ─────────────────────────────────────────

/**
 * A storage aisle with racking on BOTH sides — the only kind a stacker crane can
 * work, because it picks left and right off the same mast.
 *
 * `runs` are the two rack runs that flank it; `bayRuns` the spans of plan-x
 * where BOTH of them are solid, which is where a bay exists on either hand. A
 * crane parked where only one side has racking would be picking into thin air on
 * the other, so those spans are the whole of what makes a rail legal.
 */
export interface AsrsAisle {
  /** The two rack runs either side, north first. */
  runs: [string, string]
  /** Clear span across the aisle, in the drawn plan space. */
  band: readonly [number, number]
  /** Centre line of that span — where the rail is laid. */
  centreY: number
  /** Clear width, metres. */
  widthM: number
  /** Spans of plan-x with racking on both hands, longest first. */
  bayRuns: Array<readonly [number, number]>
}

/** Overlap of two spans, or null when they do not meet. */
function overlap (
  a: readonly [number, number],
  b: readonly [number, number],
): [number, number] | null {
  const lo = Math.max(a[0], b[0])
  const hi = Math.min(a[1], b[1])
  return hi > lo ? [lo, hi] : null
}

/**
 * Pair the rack runs up into the aisles between them.
 *
 * The building is four runs — one against each long wall and one either side of
 * the centre — so consecutive runs bound an aisle. The gap between two runs'
 * bands IS the aisle, measured; nothing here picks a y.
 */
function buildAisles (): AsrsAisle[] {
  const ordered = [...rackRuns].sort((a, b) => a.band[0] - b.band[0])
  const out: AsrsAisle[] = []

  for (let i = 0; i < ordered.length - 1; i++) {
    const north = ordered[i]!
    const south = ordered[i + 1]!
    const band: [number, number] = [py(north.band[1]), py(south.band[0])]

    const bayRuns: Array<[number, number]> = []
    for (const a of north.solid) {
      for (const b of south.solid) {
        const shared = overlap(a, b)
        if (shared) bayRuns.push([px(shared[0]), px(shared[1])])
      }
    }
    bayRuns.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))

    out.push({
      runs: [north.code, south.code],
      band,
      centreY: (band[0] + band[1]) / 2,
      widthM: toMetres(band[1] - band[0]),
      bayRuns,
    })
  }
  return out
}

export const asrsAisles: AsrsAisle[] = buildAisles()

// ─── How big the machine is ───────────────────────────────────────────────────

/**
 * The widest thing that drives, as DRAWN rather than as declared.
 *
 * `scripts/measure-models.mjs`: the forklift GLB fits its 2.05 m height at a
 * uniform 1.367, which makes it 1.21 m across. A margin measured against the
 * declared 1.0 m would be a margin against a number nobody can see.
 */
const FLEET_WIDEST_M = 1.21

/**
 * Half the traffic lane's envelope, in plan units — the strip of an aisle a
 * crane may not stand in because a forklift will be driven through it.
 */
const laneHalfWidth = toPlan(FLEET_WIDEST_M / 2)

/**
 * How much of the strip it owns the crane fills.
 *
 * 0.66 is the middle of the 60–70 % a narrow-aisle machine is specified at: high
 * enough that the crane reads as filling its aisle rather than as a pole in it,
 * low enough to leave a real gap either side. The gap it actually produces is
 * computed per crane below and reported by `asrsSummary`, so this number is
 * never trusted on its own.
 */
export const CRANE_AISLE_FRACTION = 0.66

/**
 * Where a crane's rail sits inside its aisle, and how wide the machine may be.
 *
 * The rail is NOT the aisle's centre line when the aisle carries traffic: the
 * fleet's lane owns a strip of it, so the crane takes the strip on the far side
 * and is centred in THAT. This is the one thing about the placement that is a
 * judgement rather than a measurement, and it is the judgement that keeps a
 * forklift from being driven through a crane.
 */
function railInAisle (aisle: AsrsAisle, laneY: number | undefined) {
  if (laneY === undefined) {
    const usable = aisle.band[1] - aisle.band[0]
    return { railY: aisle.centreY, usablePlan: usable }
  }
  // The two strips the lane leaves. Take the larger — on a wall aisle that is
  // always the rack-wall side, which is also the side the high bay is on.
  const near: [number, number] = [aisle.band[0], laneY - laneHalfWidth]
  const far: [number, number] = [laneY + laneHalfWidth, aisle.band[1]]
  const strip = (near[1] - near[0]) >= (far[1] - far[0]) ? near : far
  return { railY: (strip[0] + strip[1]) / 2, usablePlan: strip[1] - strip[0] }
}

// ─── The four cranes ──────────────────────────────────────────────────────────

/**
 * ── WHERE A RAIL MAY BE LAID, AND WHY THERE ARE ONLY TWO ────────────────────
 *
 * A stacker crane picks left and right off one mast, so its rail has to run
 * between racking on BOTH hands for its whole length — the `bayRuns` above.
 * Measured, this building offers exactly three such stretches over 2 m, and one
 * of them is in the centre aisle, which carries the fleet's spine and its
 * charger and workstation spurs. That leaves two: the west/centre stretch of
 * each wall aisle, 7.50 m of racking each.
 *
 * ⚠️ THIS IS WHY THERE ARE TWO CRANES AND NOT FOUR. The four that were here
 * before stood at coordinates nothing measured — two of them on the eastern
 * stubs, which are 1.7 m long against a 1.6 m machine. A crane with 0.1 m of
 * travel is not a crane, and four machines that cannot travel is a worse account
 * of this building than two that can. `MIN_TRAVEL_M` is the rule that decided
 * it, so re-running the extractor on a different model re-decides it too:
 * a rail that can give a crane a real run gets one, and one that cannot is left
 * empty rather than filled with a machine that would never move.
 */
const MIN_TRAVEL_M = 3

/**
 * The measured traffic lanes running inside an aisle, in the drawn plan space.
 *
 * ⚠️ READ OFF `warehouseStructure.aisles`, NOT off the fleet's corridors. The
 * lanes are a measurement — the clearance ridges the extractor found — whereas
 * `corridors` in `src/data/fleet.ts` is policy laid over them, and that file is
 * being rewritten. Taking the measurement means this survives the refactor: when
 * the network is regenerated it will be regenerated from these same ridges.
 */
function lanesInside (band: readonly [number, number]): number[] {
  return aisles
    .map(aisle => py(aisle.py))
    .filter(laneY => laneY > band[0] && laneY < band[1])
    .sort((a, b) => a - b)
}

/**
 * ⚠️ AN AISLE WITH TWO LANES HAS NO ROOM FOR A CRANE, and that is measured
 * rather than decided. The wide centre aisle carries a lane each way plus every
 * charger and workstation spur, so the strip a crane would need is the strip the
 * fleet already works. A single-lane aisle leaves one usable strip beside its
 * lane, which is where a crane goes.
 */
const MAX_LANES_FOR_A_CRANE = 1

export interface AsrsBay {
  /** 1-based, counted from the crane's own delivery end. */
  index: number
  /** Plan-x of the bay's centre — where the crane stops to work it. */
  x: number
  /** Address an operator can read: "A-12". */
  address: string
}

export interface AsrsCraneSpec {
  id: string
  label: string
  /** The rack runs this crane works, for the label: "runs A and B". */
  runs: [string, string]
  /** Plan-y of the rail. Constant: a crane never leaves its rail. */
  railY: number
  /** Travel limits along the rail, in plan-x. The crane's centre stays inside. */
  railFrom: number
  railTo: number
  /** Where it hands cargo over — one end of its own rail, never off it. */
  transferX: number
  bays: AsrsBay[]
  /** Clear gap to the racking on each hand at the crane's widest, in metres. */
  clearanceM: number
}

/** Real-world size of one crane, in metres. */
export interface AsrsCraneSize {
  /** Across the aisle — the dimension the aisle constrains. */
  widthM: number
  /** Along the rail. A stacker crane is long and slim, not square. */
  lengthM: number
  /** Top of the mast. */
  heightM: number
}

/**
 * ── THE LEVELS ───────────────────────────────────────────────────────────────
 *
 * MEASURED, and this is the change the built rig buys. The old single-mesh
 * fixture could only travel 0.44 m, because what rose was the whole machine and
 * anything more put its roof through the building's. A carriage on a fixed mast
 * has the rack to itself: the racking in this model tops out at 3.69 m and its
 * roof structure begins at 3.33 m, so the mast stands 3.30 m and the carriage
 * runs from the floor to the top of it.
 */
export const asrsLevels = {
  /** Rack levels the carriage addresses, numbered from 1 at the bottom. */
  count: 5,
  /** Height of level 1's deck above the floor, metres. */
  firstM: 0.45,
  /** Rise from one level to the next, metres. */
  riseM: 0.62,
} as const

/** Deck height of a level, in metres above the floor. */
export const levelHeightM = (level: number) =>
  asrsLevels.firstM + (Math.max(1, Math.min(asrsLevels.count, level)) - 1) * asrsLevels.riseM

/** Mast height — the top level's deck plus the carriage's own headroom. */
export const CRANE_HEIGHT_M = levelHeightM(asrsLevels.count) + 0.38

/**
 * Rack-bay pitch along the aisle, metres.
 *
 * ⚠️ A REFERENCE FIGURE, not a measurement. Nothing in the GLB identifies an
 * individual bay — the racking is unnamed merged mesh — so bay POSITIONS cannot
 * be read off the model the way the runs and aisles can. 1.2 m is an ordinary
 * single-pallet pitch, and it is applied to a rail whose ends ARE measured, so
 * the count follows the building even though the spacing does not.
 */
const BAY_PITCH_M = 1.2

/**
 * Build the cranes from the measured aisles.
 *
 * The size falls out of the narrowest aisle a crane is placed in, so every
 * machine is the same size and every one of them clears its own aisle.
 */
function buildCranes (): { cranes: AsrsCraneSpec[]; size: AsrsCraneSize } {
  const placed = asrsAisles.flatMap(aisle => {
    const lanes = lanesInside(aisle.band)
    if (lanes.length > MAX_LANES_FOR_A_CRANE) return []
    return [{ aisle, rail: railInAisle(aisle, lanes[0]) }]
  })

  // ONE size for every crane, taken from the tightest strip any of them runs in.
  // A per-aisle size would put two different machines in one hall, and the hall
  // is what a viewer reads scale from.
  const tightest = Math.min(...placed.map(entry => entry.rail.usablePlan))
  const widthM = toMetres(tightest) * CRANE_AISLE_FRACTION

  const size: AsrsCraneSize = {
    widthM,
    // 2.2 : 1. A stacker crane is a mast on a long sled — it needs the wheelbase
    // to stay upright under a load five levels up, and a square one would read as
    // a box rather than as a machine.
    lengthM: widthM * 2.2,
    heightM: CRANE_HEIGHT_M,
  }

  const halfLength = toPlan(size.lengthM / 2)
  const cranes: AsrsCraneSpec[] = []
  let serial = 0

  for (const { aisle, rail } of placed) {
    for (const run of aisle.bayRuns) {
      // The crane's CENTRE cannot reach the very end of its rail — half a machine
      // always overhangs the last bay — so the limits are inset by half its length.
      const railFrom = run[0] + halfLength
      const railTo = run[1] - halfLength
      if (toMetres(railTo - railFrom) < MIN_TRAVEL_M) continue

      serial += 1
      // Delivery at the WEST end of every rail: that is the end each wall aisle
      // opens onto the cross-over the fleet reaches it by, so a load left on the
      // P&D deck is left where a mobile unit can actually come for it.
      const transferX = railFrom

      const bayCount = Math.max(2, Math.floor((railTo - railFrom) / toPlan(BAY_PITCH_M)) + 1)
      const bays: AsrsBay[] = []
      for (let i = 0; i < bayCount; i++) {
        // Counted FROM the delivery end, the way a crane's own bay numbering runs.
        const x = railFrom + (i / (bayCount - 1)) * (railTo - railFrom)
        bays.push({
          index: i + 1,
          x,
          address: `${aisle.runs.join('')}-${String(i + 1).padStart(2, '0')}`,
        })
      }

      cranes.push({
        id: `asrs-${serial}`,
        label: `ASRS crane ${aisle.runs.join('')}`,
        runs: aisle.runs,
        railY: rail.railY,
        railFrom,
        railTo,
        transferX,
        bays,
        clearanceM: toMetres(rail.usablePlan - toPlan(size.widthM)) / 2,
      })
    }
  }

  return { cranes, size }
}

const built = buildCranes()

/** One size for every crane in the building. See `buildCranes`. */
export const asrsCraneSize: AsrsCraneSize = built.size

/** The cranes, in aisle order. Each one is welded to exactly one rail. */
export const asrsCranes: AsrsCraneSpec[] = built.cranes

/**
 * ── HOW THE MACHINE MOVES ────────────────────────────────────────────────────
 *
 * Ordinary figures for a narrow-aisle stacker crane, and deliberately NOT equal
 * on the two axes: a crane runs its rail fast and hoists slowly, which is what
 * makes the two motions read as two motions rather than as one diagonal.
 *
 * ⚠️ THE AXES ARE SEQUENCED, NOT BLENDED. A real crane indexes to the bay, then
 * hoists; running both at full speed together is what a machine does when it has
 * no load and no safety case. `crossoverFraction` is the only overlap allowed —
 * the hoist may start once the travel is nearly done, which takes the mechanical
 * stiffness out of the motion without letting the two run as one.
 */
export const asrsMotion = {
  /** Rail travel, metres per second. */
  travelMps: 1.4,
  travelAccelMps2: 0.7,
  /** Hoist, metres per second. Slower than travel, as on a real machine. */
  hoistMps: 0.55,
  hoistAccelMps2: 0.45,
  /** How close to the target bay the travel must be before the hoist may start. */
  crossoverFraction: 0.85,
  /** Seconds the forks take to pull a load out of a bay or push one in. */
  transferSeconds: 3.2,
  /** Seconds the load sits on the P&D deck waiting to be collected. */
  handoverSeconds: 5,
  /** Seconds a crane waits at its delivery end between cycles. */
  idleSeconds: 4,
} as const

/**
 * What the crane geometry came out as, for the console and the soak.
 *
 * Printed rather than asserted on purpose: these are consequences of the model,
 * so a number that looks wrong here means the BUILDING changed, and that wants a
 * human reading it rather than a thrown error at boot.
 */
export const asrsSummary = {
  aisles: asrsAisles.map(a => ({
    runs: a.runs.join(' | '),
    widthM: Math.round(a.widthM * 100) / 100,
    bayRunsM: a.bayRuns.map(r => Math.round(toMetres(r[1] - r[0]) * 10) / 10),
  })),
  craneM: {
    width: Math.round(asrsCraneSize.widthM * 100) / 100,
    length: Math.round(asrsCraneSize.lengthM * 100) / 100,
    height: Math.round(asrsCraneSize.heightM * 100) / 100,
  },
  cranes: asrsCranes.map(c => ({
    id: c.id,
    railY: Math.round(c.railY),
    travelM: Math.round(toMetres(c.railTo - c.railFrom) * 10) / 10,
    bays: c.bays.length,
    clearanceM: Math.round(c.clearanceM * 100) / 100,
  })),
  levels: asrsLevels.count,
  topLevelM: levelHeightM(asrsLevels.count),
}
