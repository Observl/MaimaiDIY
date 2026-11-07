# Fine-powder microrelief candidate

Base: main `89d9927974f36b9c669375917586248daf026c0b`.
This is an unpublished candidate responding to feedback that the previous draft
only looked brighter and still lacked visible grain and relief.

## Scope

Only the powder shader branch and its new helper are changed. The original mask,
source artwork, glitter, pearl, UV varnish, lighting and camera code are unchanged.
The prior unresolved-powder broad-luster addition is not used in this branch.

The validation harness uses the separate, already requested nameplate close-up
viewer from commit `518cbe2` on both sides. That camera change is not part of this
powder branch or its source diff.

## Model

- Every grain has an analytic cap height profile and its corresponding normal
  gradient. Two sides of a grain therefore receive different light, rather than
  sharing a single flat random normal.
- Shallow contact-rim shading and bounded colored micro-highlights reveal the
  cap profile. The powder can both darken and lighten pixels under fixed lighting;
  it is not a uniform brightness overlay.
- Three independently seeded fields stay fixed in physical print coordinates.
  Fine, middle and cluster levels crossfade after sampling their complete surface
  signals, avoiding a density threshold on an interpolated random seed.
- Coarser fields provide a visible aggregate surface when individual grains are
  subpixel. They are a display approximation, not measured manufacturing particle
  sizes. No actual mesh silhouette or product thickness is changed.
- Powder color continues to follow the source artwork. Text protection and finish
  coverage come from the original packed mask, which is not expanded.

## Validation

Unit tests check the cap derivatives against finite differences, bounded heights
and gradients, normalized level weights, and reversal of the grain's bright/dark
sides under opposite light directions. Lint, all 69 unit tests, and production
build pass. The browser isolation regression is included, with 31 browser tests
discovered; this does not mean the full browser suite was executed.

Native software-WebGL captures compare the rejected previous brightness draft
with the new shader at exactly the same template, camera and +15°/+60° lights.
Captures use 360px and 390px actual CSS widths plus 1440px output. Both whole-product
and nameplate close-up views are checked. Powder is disabled through the exact
shader uniform module's `lab_powderDensity=0`, not just its specular strength.

The first microrelief prototype was rejected because it was too weak in actual
360px images, despite having both bright and dark pixels. A stronger revision is
reviewed at original scale as well as in unsharpened, unenhanced 1440px crops.

## Limits

The actual 360px view still has very little area per powder-covered component.
It must be shown at original size in comparisons, rather than claiming that a
magnified crop represents normal phone viewing. No physical phone GPU or factory
sample was tested. These are simulated micro-surface lighting cues, not evidence
that the real manufacturing process has been reproduced. Physical calibration
requires a close reference image/video of the actual powder under fixed lighting.

## Selected revision and observed outcome

Revision v2 is selected. V1 was too weak. V3 was rejected because stronger shadows
produced black pepper-like dots in high-resolution nameplate details, with little
extra benefit at phone scale. The production files are restored to the exact v2
code tested in the native harness.

The v2 images show fine bright/dark granularity in the LEGEND badge and coated
letter edges, without replacing them with a uniformly pale sheet or large glitter
spots. The 1440px crops make this difference clear. At 360px original scale the
change remains local and subtle; the comparison explicitly shows that limitation.
The +15° and +60° comparisons preserve the same artwork, view and original masks.
The mask does not coat the complete design or every interior of a large glyph.

V2 native validation: 24 captures across 360/390/1440 CSS pixels, two light angles,
whole product/nameplate close-up, powder enabled/disabled; no shader errors.

### Isolation and capture-state check

The alternating on/off capture matrix initially showed small differences in some
powder-disabled header pixels. These were not dismissed as random GPU noise.
A controlled repeat sets density=0 once, fixes 1440px/+15°/close-up, and captures
three consecutive frames without toggling or resetting. All six old/new frames
are pixel-identical. Every compiled material reports actual/imported/controller
uniforms sharing the same object, with value zero. Source artwork and packed-mask
canvases are also pixel-identical. The prior discrepancies are capture-state
related; their exact internal cause was not established, and production code was
not changed to conceal them.

A source-level comparison also confirms that everything outside the powder branch,
new helper import and program-cache key remains byte-identical to main. Camera,
mask generators, quality settings and shared finish defaults remain unchanged.

Final production source matches native-tested v2 after normalizing build-version
query strings:

- acrylic-optics.js SHA-256: e03303fcc259e627faf295581c54cfc31c58f7d129c896c30801cab20cc2ac9e
- powder-microrelief.js SHA-256: 7b8ec07c500c09022ffd890bc831cabbe0d92213fa92f8cd2657e329ee11c6ce

This candidate is for user appearance review, not a physical-fidelity certification.
No branch was pushed, no PR opened and no deployment performed.
