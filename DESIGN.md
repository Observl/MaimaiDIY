# MaimaiDIY UI

Reference: https://www.figma.com/design/ieYT6SbMmvPRd1I1GHFcDg?node-id=6-40

Keep the original Circle/MAGiCAL backgrounds and artwork colors. The editor uses
white surfaces, #171821 primary actions, #6c5ce7 selection, and #efecff material
actions. Reuse the semantic variables in styles.css; components.css applies the
editor component layer without changing the renderer or purchase page.

Controls are at least 44 px high; numeric and phone inputs use 16 px text.
Spacing follows 4/8/12/16/24 px. Control radii are 12–14 px; panel radii are 24 px.
Focus remains visible. Disabled actions remain recognizable, with their native
disabled behavior. Switch motion respects reduced motion and forced colors.

Companion rows group identity, settings, and material selection on desktop.
Below 760 px, identity and selection share the first row; settings move below a
divider. Keep select, level, awakening, remove, swap, and keyboard operations.
Empty slots show a plus and disable level/awakening. Long names retain a full
accessible title. Song fields use three columns on desktop and two plus a
full-width achievement field on phones.

First-visit examples, user drafts, template import/export, image export, material
filters, and preview hit targets must keep working. UI changes do not tint
artwork, introduce placeholder character assets, or change design composition.
