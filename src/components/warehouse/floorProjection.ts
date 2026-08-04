/**
 * src/components/warehouse/floorProjection.ts
 *
 * ── THE BRIDGE BETWEEN THE 2D AND 3D MAPS ────────────────────────────────────
 *
 * Both views render the SAME dataset (`src/data/floorOps.ts`). That dataset
 * expresses every position — racks, nodes, vehicles, route waypoints — in the
 * floor plan's own abstract user-space (`map.viewBox`), which is a 2D box with
 * y running DOWN the page.
 *
 * The GLB knows nothing about that space. It has its own units, its own origin,
 * and y runs UP. So exactly one thing has to convert between them, and this is
 * it. Nothing else in the 3D stack is allowed to know about viewBox coordinates,
 * and nothing in the 2D stack ever sees world units — which is what stops the
 * two views from growing separate copies of the same layout logic.
 *
 * ⚠️ CALIBRATION IS NOT AUTOMATIC. This fits the plan's viewBox onto the loaded
 * model's horizontal bounding box, uniformly and centred. That is correct only
 * if the GLB's footprint actually corresponds to the plan's extents. For an
 * arbitrary model — one whose walls sit inside a larger ground plane, or that is
 * rotated relative to the plan — pass an explicit `calibration` to correct it.
 * Until that is verified against the real model, anything positioned through
 * this projection (routes, robots) is placed approximately, which is why the
 * viewer does not draw them by default.
 */

import { Vector3 } from 'three'
import type { Box3 } from 'three'

export interface FloorViewBox {
  x: number
  y: number
  width: number
  height: number
}

export interface FloorCalibration {
  /** Extra uniform scale applied after the fit. 1 = the model's own footprint. */
  scale?: number
  /** Rotation about the vertical axis, in radians, if the GLB faces another way. */
  rotationY?: number
  /** World-space nudge applied last — useful when the model's origin is off-centre. */
  offset?: { x?: number; y?: number; z?: number }
  /**
   * How many world units make a metre in the loaded model. See
   * `FloorProjection.worldPerMetre` for why the default is 1.
   */
  worldPerMetre?: number
}

export interface FloorProjection {
  /**
   * Plan coordinates → world. `planY` runs down the page and becomes world Z.
   * `height` lifts the result off the floor (route ribbons, robot origins).
   */
  toWorld: (planX: number, planY: number, height?: number) => Vector3
  /** World units per plan unit — for sizing anything authored in plan space. */
  readonly unitScale: number
  /** The floor height everything is placed on. */
  readonly floorY: number
  /**
   * The calibration rotation, republished so HEADINGS can be corrected by the
   * same amount POSITIONS are.
   *
   * ⚠️ This is not decoration. Rotating the plan onto the model moves every
   * coordinate but does nothing to the facings that were computed in plan space,
   * so anything that turns — a robot, a lift, a charging dock — must add it back
   * or it ends up placed correctly and pointing the wrong way. With the current
   * quarter-turn calibration that is a robot driving sideways down every aisle,
   * which reads as a broken model rather than as a missing term.
   *
   * A plan heading of `h` becomes a Three yaw of `-(h + rotationY)`.
   */
  readonly rotationY: number
  /**
   * World units per METRE — the bridge for SIZES, as `toWorld` is for positions.
   *
   * ⚠️ SIZE AND POSITION DO NOT SHARE A SCALE HERE, and conflating them was the
   * bug this exists to prevent. `unitScale` converts plan units, and the plan is
   * a drawing squeezed onto a building it was not drawn for — so a robot sized
   * through `unitScale` comes out at whatever fraction the squeeze happens to
   * be, which is how the fleet ended up around a third of its proper size. A
   * machine's size is a physical fact and has to come from metres.
   *
   * It is 1 because the warehouse GLB is authored in metres: it measures
   * 17.32 × 31.32 with a 5.089 clear height and racking at 3.69, which are
   * ordinary metre figures for a distribution hall and absurd in any other unit.
   * A model authored in centimetres would set this to 100.
   */
  readonly worldPerMetre: number
}

export function createFloorProjection (
  viewBox: FloorViewBox,
  modelBounds: Box3,
  calibration: FloorCalibration = {},
): FloorProjection {
  const size = modelBounds.getSize(new Vector3())
  const centre = modelBounds.getCenter(new Vector3())

  const rotation = calibration.rotationY ?? 0
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  // ⚠️ THE FIT IS MEASURED AFTER THE ROTATION, not before.
  //
  // A quarter turn swaps which plan axis lands on which world axis, so fitting
  // the plan's width against the model's x — as this did — measures the plan
  // against the wrong wall. On this building (portrait shell, landscape plan)
  // that under-scaled the whole operational layer to 63 %: it sat as an island
  // in the middle of the hall, the perimeter racking down both long walls was
  // outside it entirely, and every robot was drawn a third too small. The plan
  // looked plausible, which is what made it survive — nothing about a centred,
  // uniformly-scaled floor says "wrong size" unless you know the hall.
  //
  // Rotating the plan's box first and fitting THAT is correct for any angle and
  // collapses to the old expression at zero rotation.
  const spanX = viewBox.width * Math.abs(cos) + viewBox.height * Math.abs(sin)
  const spanZ = viewBox.width * Math.abs(sin) + viewBox.height * Math.abs(cos)
  const fit = Math.min(size.x / spanX, size.z / spanZ)
  const unitScale = fit * (calibration.scale ?? 1)

  const offset = calibration.offset ?? {}
  const offsetX = offset.x ?? 0
  const offsetY = offset.y ?? 0
  const offsetZ = offset.z ?? 0

  const floorY = modelBounds.min.y + offsetY

  return {
    unitScale,
    floorY,
    rotationY: rotation,
    worldPerMetre: calibration.worldPerMetre ?? 1,
    toWorld (planX, planY, height = 0) {
      // Plan-space offset from the viewBox centre, so the plan lands centred on
      // the model rather than hanging off its origin corner.
      const dx = (planX - (viewBox.x + viewBox.width / 2)) * unitScale
      const dz = (planY - (viewBox.y + viewBox.height / 2)) * unitScale

      return new Vector3(
        centre.x + dx * cos - dz * sin + offsetX,
        floorY + height,
        centre.z + dx * sin + dz * cos + offsetZ,
      )
    },
  }
}
