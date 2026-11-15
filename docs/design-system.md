# MaimaiDIY UI components

Source: [Figma component library](https://www.figma.com/design/mFjIK1JaSrAZc6AxE2TJBX).

## One component per role

Keep the semantic CSS classes consumed by the JavaScript. Existing and dynamically
created controls share the primitives in `styles.css`; do not introduce another
button or field skin for a new feature.

| Family | Existing component adapters | Variants |
| --- | --- | --- |
| Button | `.button`, `.upload-button`, `.library-button`, `.history-button`, `.icon-button`, `.background-motion`, `.order-back` | Regular 48 px, compact 40 px, icon; primary, secondary, accent |
| Field | Name, Rating, search, filter, template, song percentage, companion level and quick-edit fields | Text, number, select; 40 / 44 / 48 px as layout requires |
| Switch | `.switch`, `.newcomer-switch` | 42 × 24 px visual track; larger label hit area on mobile |
| Status | `.status` and loading/offline modifiers | Semantic success, progress and unavailable states |
| AssetItem | `.asset-item` | Default, selected, unavailable; actual artwork keeps its original aspect ratio |
| ControlRow | `.control-row` | Responsive content and actions slots, no duplicate per-material skin |
| Panel | `.card`, `.component-panel`, `.asset-picker`, quick-edit dialogs | White surface; 24 px outer / 12 px inner radius |

The order configurator aliases its legacy `--store-*` names to shared semantic
colors. Configuration cards retain their special layout and selected/disabled
states; pricing, discounts, export and checkout behavior are unchanged.

## Foundations

- Ink `#171821`, accent `#6c5ce7`, accent surface `#efecff`, white surface.
- Use `--border`, `--secondary`, `--accent-text`, `--focus-ring` rather than
  repeating those literals in feature-specific selectors.
- Spacing scale: 4, 8, 12, 16, 24 px.
- Labels: 14 px / 22 px, weight 500. Captions: 12 px / 20 px.
- Editing labels: 16 px / 26 px; section headings: 18 px / 28 px.
- Mobile fields use at least 16 px text to avoid iOS focus zoom; compact controls
  use 44 px minimum touch height. Preserve `min-width:0`, wrapping and overflow
  behavior for narrow layouts and long material names.
- `ui-motion.css` owns shared hover, press, focus and reduced-motion behavior.

## Do not normalize the artwork

Interface text is separate from the game's exported name, Rating, score digits,
icons and artwork. Keep the CN/JP layouts, score sprite proportions and B equal
cells, image ratios and drawing coordinates unchanged.

## Maintenance

Run `npm run check` before publishing. `ui-system.test.mjs` checks CSS parsing,
foundation coverage, shared store palette, mobile safeguards and functional
visibility contracts. Browser inspection is still necessary for visual and
interaction regressions; static tests are not a substitute.
