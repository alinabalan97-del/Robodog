/**
 * src/types/carbon-icons-vue.d.ts
 *
 * @carbon/icons-vue ships NO type declarations (no bundled .d.ts, no
 * @types package), so importing it lands as an implicit `any` under this
 * project's strict config and vue-tsc fails the build.
 *
 * Rather than blanket-declaring the module (which would silently accept a
 * misspelled icon and fail at RUNTIME as a blank glyph), this declares exactly
 * the icons src/icons/carbon.ts imports. A typo or a name that doesn't exist in
 * the package is then a compile error, not a missing icon in the UI.
 *
 * Regenerate alongside the icon map when icons are added.
 */
declare module '@carbon/icons-vue' {
  import type { DefineComponent, SVGAttributes } from 'vue'

  /** A Carbon icon: renders an <svg> and passes through width/height/aria-*. */
  export type CarbonIcon = DefineComponent<SVGAttributes>

  export const Activity24: CarbonIcon
  export const Add24: CarbonIcon
  export const AddAlt24: CarbonIcon
  export const Ai24: CarbonIcon
  export const Apps24: CarbonIcon
  export const ArrowDown24: CarbonIcon
  export const ArrowDownRight24: CarbonIcon
  export const ArrowLeft24: CarbonIcon
  export const ArrowRight24: CarbonIcon
  export const ArrowUp24: CarbonIcon
  export const ArrowUpRight24: CarbonIcon
  export const ArrowsVertical24: CarbonIcon
  export const At24: CarbonIcon
  export const Attachment24: CarbonIcon
  export const Calendar24: CarbonIcon
  export const CalendarHeatMap24: CarbonIcon
  export const CalendarTools24: CarbonIcon
  export const Camera24: CarbonIcon
  export const CaretDown24: CarbonIcon
  export const CaretRight24: CarbonIcon
  export const ChartLine24: CarbonIcon
  export const ChartLineData24: CarbonIcon
  export const Chat24: CarbonIcon
  export const Checkbox24: CarbonIcon
  export const CheckboxCheckedFilled24: CarbonIcon
  export const CheckboxIndeterminateFilled24: CarbonIcon
  export const Checkmark24: CarbonIcon
  export const CheckmarkFilled24: CarbonIcon
  export const CheckmarkOutline24: CarbonIcon
  export const Chemistry24: CarbonIcon
  export const ChevronDown24: CarbonIcon
  export const ChevronLeft24: CarbonIcon
  export const ChevronRight24: CarbonIcon
  export const ChevronSort24: CarbonIcon
  export const ChevronUp24: CarbonIcon
  export const CircleDash24: CarbonIcon
  export const CircleFilled24: CarbonIcon
  export const Close24: CarbonIcon
  export const CloseFilled24: CarbonIcon
  export const CloudUpload24: CarbonIcon
  export const ColorPalette24: CarbonIcon
  export const Dashboard24: CarbonIcon
  export const DeliveryTruck24: CarbonIcon
  export const Document24: CarbonIcon
  export const DocumentBlank24: CarbonIcon
  export const DocumentTasks24: CarbonIcon
  export const Download24: CarbonIcon
  export const Edit24: CarbonIcon
  export const Email24: CarbonIcon
  export const EventSchedule24: CarbonIcon
  export const Eyedropper24: CarbonIcon
  export const FaceSatisfied24: CarbonIcon
  export const FavoriteFilled24: CarbonIcon
  export const Filter24: CarbonIcon
  export const Flag24: CarbonIcon
  export const Folder24: CarbonIcon
  export const Group24: CarbonIcon
  export const Growth24: CarbonIcon
  export const HealthCross24: CarbonIcon
  export const Home24: CarbonIcon
  export const Hospital24: CarbonIcon
  export const Idea24: CarbonIcon
  export const Identification24: CarbonIcon
  export const Information24: CarbonIcon
  export const Keyboard24: CarbonIcon
  export const Launch24: CarbonIcon
  export const ListChecked24: CarbonIcon
  export const Locked24: CarbonIcon
  export const Logout24: CarbonIcon
  export const MacCommand24: CarbonIcon
  export const MacOption24: CarbonIcon
  export const MacShift24: CarbonIcon
  export const Maximize24: CarbonIcon
  export const Medication24: CarbonIcon
  export const Menu24: CarbonIcon
  export const MeterAlt24: CarbonIcon
  export const Microphone24: CarbonIcon
  export const Minimize24: CarbonIcon
  export const Misuse24: CarbonIcon
  export const Moon24: CarbonIcon
  export const Notification24: CarbonIcon
  export const NotificationFilled24: CarbonIcon
  export const NotificationNew24: CarbonIcon
  export const OverflowMenuHorizontal24: CarbonIcon
  export const Package24: CarbonIcon
  export const PageFirst24: CarbonIcon
  export const PageLast24: CarbonIcon
  export const Pause24: CarbonIcon
  export const Phone24: CarbonIcon
  export const Pills24: CarbonIcon
  export const Play24: CarbonIcon
  export const PlayFilled24: CarbonIcon
  export const ProgressBarRound24: CarbonIcon
  export const RadioButton24: CarbonIcon
  export const RadioButtonChecked24: CarbonIcon
  export const RainDrop24: CarbonIcon
  export const RecentlyViewed24: CarbonIcon
  export const Renew24: CarbonIcon
  export const Repeat24: CarbonIcon
  export const ReportData24: CarbonIcon
  export const Restaurant24: CarbonIcon
  export const Return24: CarbonIcon
  export const Rocket24: CarbonIcon
  export const Ruler24: CarbonIcon
  export const Save24: CarbonIcon
  export const Scales24: CarbonIcon
  export const Search24: CarbonIcon
  export const Security24: CarbonIcon
  export const Send24: CarbonIcon
  export const Settings24: CarbonIcon
  export const SettingsAdjust24: CarbonIcon
  export const ShoppingCart24: CarbonIcon
  export const SkillLevelAdvanced24: CarbonIcon
  export const SkillLevelBasic24: CarbonIcon
  export const SkillLevelIntermediate24: CarbonIcon
  export const Star24: CarbonIcon
  export const StarFilled24: CarbonIcon
  export const StarHalf24: CarbonIcon
  export const Stethoscope24: CarbonIcon
  export const Store24: CarbonIcon
  export const Subtract24: CarbonIcon
  export const Sun24: CarbonIcon
  export const Tag24: CarbonIcon
  export const TextFont24: CarbonIcon
  export const Time24: CarbonIcon
  export const TimeFilled24: CarbonIcon
  export const Timer24: CarbonIcon
  export const Translate24: CarbonIcon
  export const Undo24: CarbonIcon
  export const UpToTop24: CarbonIcon
  export const User24: CarbonIcon
  export const UserFollow24: CarbonIcon
  export const UserMultiple24: CarbonIcon
  export const Video24: CarbonIcon
  export const View24: CarbonIcon
  export const ViewOff24: CarbonIcon
  export const VolumeDown24: CarbonIcon
  export const VolumeMute24: CarbonIcon
  export const VolumeUp24: CarbonIcon
  export const Wallet24: CarbonIcon
  export const Warning24: CarbonIcon
  export const WarningFilled24: CarbonIcon
}
