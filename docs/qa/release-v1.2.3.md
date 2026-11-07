# v1.2.3 release verification

## Scope

- Integrates both local fine-powder candidates `34d2bf7` and `b33d85a` on top of `89d9927`.
  The powder implementation is unchanged from the selected, visually reviewed
  candidate. See `powder-microrelief.md` and `powder-view-relief.md` for the original
  native Chromium render matrix, isolation checks and physical-fidelity limits.
- The name interval remains 184px, from the name-board left edge to the rank.
  Half a blank cell and eight full-width cells fill it: each fixed cell is
  `184 / 8.5` (about 21.647px), and the leading inset is about 10.824px.
  Short names use the same positions; input text is not padded or rewritten.
- Package metadata, page title, version link and README all use `1.2.3`.
- The separate close-up/export candidate `518cbe23` is not included.
  Camera framing, order-page controls and export controls are unchanged from main.

## Checks

- `npm run check`: passed ESLint, all 72 unit tests and production build.
- `git diff --check`: passed.
- Version consistency checks: package and both lockfile versions, README,
  page version link and built page title agree.
- Supplementary actual-font Canvas check using `@napi-rs/canvas` / Skia:
  24 samples at 2x/4x rendering, including empty, short, eight-character,
  mixed-script, punctuation and combined-character names. All ink remained in
  the allocated cells, and English prefixes stayed pixel-identical for different
  name lengths. Four names were exported through a 2160x904 PNG round trip;
  text-protection and component-coverage masks matched alpha exactly.
  This is a geometry/Canvas check, not browser or physical-device validation;
  unsupported font glyphs can use fallback boxes in this environment.
- Targeted Playwright invocation attempted name, Rating and powder-isolation
  regressions. It stopped before running browser assertions because configured
  Google Chrome was missing at `/opt/google/chrome/chrome`; the other three
  tests did not run. The full browser suite is therefore not reported as passed.

## Publication

The version PR body is the update announcement. The existing release workflow
creates the GitHub tag/release when the version PR is merged into `main`; a
feature-branch push alone neither publishes the release nor deploys the site.
Browser regression is manual-only, and Pages/release workflows run on `main`,
so no automatic feature-branch CI result is expected from this repository setup.
