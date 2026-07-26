<!--
  src/components/AppPictogram.vue

  Renders one IBM Carbon PICTOGRAM from the central map (src/icons/pictograms.ts)
  by SEMANTIC KEY — the pictogram counterpart to AppIcon.vue.

  Why a separate component from AppIcon:
    • Icons render at 1em on the text baseline and inherit font-size, because
      they're inline affordances. Pictograms are standalone ILLUSTRATIONS — they
      take an explicit pixel `size` (default 48), not the surrounding font-size.
    • @carbon/pictograms exports DESCRIPTOR objects, not Vue components, so there
      is nothing to `<component :is>`. We walk the `{ elem, attrs, content }` tree
      with h() and rebuild the <svg> ourselves.

  Colour: the descriptor carries fill="currentColor", and we keep it — so a
  `color="primary"` / text-color class tints a pictogram exactly like an icon.
  Sizing: we override the descriptor's shipped width/height (48/64) with `size`.

  Accessibility: decorative by DEFAULT (aria-hidden, focusable=false) — a
  pictogram next to a real heading/paragraph adds no information for a screen
  reader. Pass `label` to promote it to a meaningful image (role="img" + the
  accessible name) for the rare case it stands alone as content.

  Unknown key → renders nothing and warns in dev, never throws. A missing
  pictogram must never blank a screen on a medical app.
-->
<template>
  <component :is="rendered" v-if="descriptor" />
</template>

<script lang="ts" setup>
  import { computed, h, type VNode } from 'vue'
  import { pictograms, type PictogramName, type PictogramNode } from '@/icons/pictograms'

  const props = withDefaults(
    defineProps<{
      /** Semantic key from the pictogram map, e.g. 'onboardingWelcome', 'medication'. */
      name: PictogramName | (string & {})
      /** Rendered edge length in px (pictograms are square). Default 48. */
      size?: number | string
      /**
       * Accessible name. Omitted → decorative (aria-hidden). Provided → the
       * pictogram becomes a meaningful image (role="img", aria-label).
       */
      label?: string
    }>(),
    { size: 48 },
  )

  const descriptor = computed<PictogramNode | undefined>(() => {
    const found = pictograms[props.name as PictogramName]
    if (!found && import.meta.env.DEV) {
      console.warn(
        `[AppPictogram] unknown pictogram "${props.name}" — add it to src/icons/pictograms.ts`,
      )
    }
    return found
  })

  /** Walk a descriptor node into a VNode; children recurse. */
  function toVNode (node: PictogramNode): VNode {
    const children = node.content?.map(toVNode)
    return h(node.elem, { ...node.attrs }, children)
  }

  const rendered = computed<VNode | undefined>(() => {
    const root = descriptor.value
    if (!root) return undefined

    // Rebuild the root <svg>: keep its paths + fill="currentColor", but swap the
    // shipped 48/64 dimensions for `size` and set accessibility per `label`.
    const a11y = props.label
      ? { role: 'img', 'aria-label': props.label }
      : { 'aria-hidden': 'true', focusable: 'false' }

    return h(
      root.elem,
      {
        ...root.attrs,
        width: props.size,
        height: props.size,
        ...a11y,
      },
      root.content?.map(toVNode),
    )
  })
</script>
