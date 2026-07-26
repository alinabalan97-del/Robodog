/**
 * src/icons/pictograms.ts
 *
 * ── THE PICTOGRAM MAP ──────────────────────────────────────────────────────
 * Single source of truth for every IBM Carbon PICTOGRAM in the app, addressed by
 * SEMANTIC KEY ('emptyRecords', 'onboardingWelcome'), never a vendor name — same
 * discipline as the icon map in ./carbon.ts, so re-pointing or swapping the art
 * is a one-line change here.
 *
 * ── PICTOGRAMS ARE NOT ICONS ───────────────────────────────────────────────
 * Kept in a SEPARATE map (and rendered by a separate component, AppPictogram.vue)
 * on purpose. Icons (carbon.ts) are small UI affordances that sit on the text
 * baseline at 1em and feed Vuetify's internal slots (checkbox, pagination…).
 * Pictograms are large (viewBox 0 0 32 32, shipped at 48–64px) thin-stroke line
 * ILLUSTRATIONS for empty states, onboarding, section headers and feature/upsell
 * surfaces. Merging them would blur that line and let a 48px illustration leak
 * into a component slot that expects a glyph.
 *
 * ── CLINICAL-SAFETY NOTE ───────────────────────────────────────────────────
 * Pictograms are DECORATIVE. Never let a pictogram be the only signal for a
 * clinical state (dose overdue, error, warning) — those stay on the semantic
 * status icons + text. Pictograms illustrate; they don't inform of state.
 *
 * ── HOW THEY'RE CONSUMED ───────────────────────────────────────────────────
 * @carbon/pictograms exports descriptor objects (not Vue components) under
 * `es/<name>`: `{ elem:'svg', attrs:{ viewBox, fill:'currentColor', … }, content }`.
 * AppPictogram.vue turns a descriptor into an <svg> at render time, overriding
 * width/height to the requested size while KEEPING fill="currentColor" — so
 * `color`/text-color classes tint a pictogram exactly like an icon. Vendor names
 * use `--` for compound words (heart--health); our semantic keys stay camelCase.
 */

import care from '@carbon/pictograms/es/care'
import health from '@carbon/pictograms/es/health'
import healthcare from '@carbon/pictograms/es/healthcare'
import doctor from '@carbon/pictograms/es/doctor'
import doctorPatient from '@carbon/pictograms/es/doctor-patient'
import medicalStaff from '@carbon/pictograms/es/medical--staff'
import medicalCharts from '@carbon/pictograms/es/medical--charts'
import stethoscope from '@carbon/pictograms/es/stethoscope'
import prescription from '@carbon/pictograms/es/prescription'
import pills from '@carbon/pictograms/es/pills'
import pillBottle from '@carbon/pictograms/es/pill--bottle--01'
import heart from '@carbon/pictograms/es/heart'
import heartHealth from '@carbon/pictograms/es/heart--health'
import dna from '@carbon/pictograms/es/dna'
import hospital from '@carbon/pictograms/es/hospital'
import telemedicine from '@carbon/pictograms/es/telemedicine'
import telemedicineMobile from '@carbon/pictograms/es/telemedicine--mobile'
import calendar from '@carbon/pictograms/es/calendar'
import calendarEvent from '@carbon/pictograms/es/calendar--event'
import notifications from '@carbon/pictograms/es/notifications'
import report from '@carbon/pictograms/es/report'
import documentation from '@carbon/pictograms/es/documentation'
import secureData from '@carbon/pictograms/es/secure--data'
import secureProfile from '@carbon/pictograms/es/secure--profile'
import userProfile from '@carbon/pictograms/es/user--profile'
import growth from '@carbon/pictograms/es/growth'
import growthMindset from '@carbon/pictograms/es/growth--mindset'
import goals from '@carbon/pictograms/es/goals'
import idea from '@carbon/pictograms/es/idea'
import rocket from '@carbon/pictograms/es/rocket'
import globe from '@carbon/pictograms/es/globe'
import analyze from '@carbon/pictograms/es/analyze'
import dashboard from '@carbon/pictograms/es/dashboard'

/**
 * A Carbon pictogram descriptor node: an element name, its SVG attributes, and
 * optional children. The whole tree is plain data — AppPictogram walks it with h().
 */
export interface PictogramNode {
  elem: string
  attrs: Record<string, string | number>
  content?: PictogramNode[]
  /** Present on the root descriptor only. */
  name?: string
}

/**
 * The app's pictogram vocabulary. Keys are semantic (what it's FOR), not the
 * Carbon art name. Grouped: clinical · patient/records · engagement/empty-states.
 */
export const pictograms = {
  // Clinical & care
  care,
  health,
  healthcare,
  doctor,
  doctorPatient,
  medicalStaff,
  medicalCharts,
  stethoscope,
  prescription,
  medication: pills,
  pillBottle,
  heart,
  heartHealth,
  dna,
  hospital,
  telemedicine,
  telemedicineMobile,

  // Records, scheduling & security
  appointments: calendar,
  appointment: calendarEvent,
  notifications,
  records: report,
  documentation,
  dataPrivacy: secureData,
  accountSecurity: secureProfile,
  profile: userProfile,

  // Engagement, onboarding & empty states
  progress: growth,
  mindset: growthMindset,
  goals,
  tip: idea,
  onboardingWelcome: rocket,
  worldwide: globe,
  insights: analyze,
  overview: dashboard,
} as const satisfies Record<string, PictogramNode>

/** Valid `name` for <app-pictogram>. */
export type PictogramName = keyof typeof pictograms
