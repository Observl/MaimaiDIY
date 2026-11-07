# Directional and view-dependent fine-powder candidate

Base candidate: `34d2bf7` (unpublished fine-powder microrelief v2).
Only `src/acrylic-optics.js`'s powder block and `src/powder-microrelief.js` change
production behavior. Original finish masks, shared material defaults, glitter,
pearl, UV varnish, camera, light controls and default light angle stay unchanged.

## Changes

1. Correct the coordinate-frame chain rule: the sampling field is rotated, so
   its height gradient must be transformed back by the transpose before applying
   it to the print's tangent/bitangent. This keeps the lit side aligned with the
   actual light rather than with a rotated field axis.
2. Add mildly elliptical, independently oriented caps. Their shape and orientation
   remain fixed in print space and do not depend on time or screen-space noise.
3. Add two bounded ray/height iterations using the actual refracted viewing
   direction at the print plane. The resulting shallow parallax is capped at
   0.18 field cells; artwork and finish-mask coordinates do not move.
4. Replace the fixed dark contact ring with a small local horizon-shadow term,
   sampled along the actual light directions. A light behind the opaque print
   plane no longer illuminates a powder facet through that plane.
5. Keep the diffuse contrast below the rejected pepper-noise draft, while making
   localized micro-highlights depend on the new normals and half-vectors.

The existing multiscale fields are a display approximation for unresolved powder
clusters, not a claim about measured factory grain size or physical relief depth.
The model's actual mesh silhouette and product thickness are unchanged.

## Validation requirements

- Two light angles (+15°, +60°) and two actual camera azimuths (+25°, -25°), at
  360px/390px narrow widths and 1440px detailed output.
- Compare old/new using the same QA-only camera setter, preserving target,
  distance, elevation and FOV. Do not change the production camera code.
- Record real renderer frames for fixed-view light motion and fixed-light camera
  motion. No image warping, generated transition or AI interpolation.
- Verify stable powder-disabled outputs after setting density=0 once and taking
  consecutive frames. Alternating on/off captures previously showed state-related
  transients, so they are not evidence by themselves of other material changes.
- Inspect for pepper-like black dots, broad white wash, sliding screen-space grain
  and overstatement of what is visible at actual phone scale.

Unit checks additionally cover bounded view-parallax offsets, correct gradient
coordinate transforms, and directional self-shadow. Lint, 72 unit tests and the
production build pass. Native captures and real-device limits are recorded below
once complete.

## Native render results

Native Chromium using SwiftShader rendered both candidates at 360, 390 and 1440
pixels, with +15°/+60° light angles and +25°/-25° camera azimuths. All 24 matrix
captures completed without shader errors. A further matched -25° raking-light
pair was inspected; it did not show a compelling additional relief improvement.

Two comparison animations use seven actual 1440px WebGL captures per version:
fixed-view +15° to +60° lighting, and fixed-light +25° to -25° camera rotation.
The seven samples are played forwards and backwards as 12 frames, with a shared
GIF palette. Their 500×320px crops are native source pixels, with no sharpening,
warping, generated intermediate frames or particle overlays. Large moving
acrylic reflections already exist in both versions and are not evidence that
the powder improvement is stronger.

Visual findings:

- The grain lighting responds to light and viewing direction, and the fixed dark
  rims of v2 are reduced. No new pepper-like black patches or broad white wash
  were observed in this test matrix.
- The detailed LEGEND and lettering crops look cleaner and finer, but a strong
  increase in perceived local convexity is **not established**. At actual 360px
  phone width, the improvement is still subtle. Crops must not be presented as
  the ordinary phone view.
- These are software-rendered viewport tests, not physical-phone GPU/touch tests,
  measurements of factory grain dimensions, or comparisons against a product
  sample. No claim of calibrated physical fidelity is made.

Isolation was rechecked after renderer quality initialization, setting powder
`density=0` once and retaining the same light/view for three consecutive frames.
Old/new frame pairs 0 and 2 matched exactly. Pair 1 differed in only three color
channels by 1/255, which must not be reported as an exact match. Earlier automatic
captures made before asynchronous quality setup settled were discarded from
isolation evidence. Source review confirms that no behavior outside the powder
block or its program-cache key changed; the mask, glitter and pearl source is
unchanged. The final source and captured source are equivalent after removing
build cache queries and the final comment-only wording correction.

Artifacts retained with the local QA deliverables:

- `powder-direction-v1-light.gif` and `powder-direction-v1-view.gif`.
- `powder-direction-v1-view-25.png` and `powder-direction-v1-view--25.png`, with
  actual 360px views plus native 1440px crops at both light angles.
- `powder-direction-v1-isolation.json` and
  `powder-direction-v1-source-hashes.json`.

Final `npm run check` passed: lint, 72 unit tests and the production build.
The Playwright suite was not executed in this environment. This candidate remains
unpublished and requires visual review; it is not marked as a proven solution to
stronger phone-scale relief.
