# MaimaiDIY special-finish masks and factory handoff (proposal)

This is an engineering/vendor handoff specification, not a claim that physical production has been tested. Manufacturing and payment must remain disabled until rights and vendor sign-off.

## Product baseline and coordinate model

- Current editor canvas: 1080 x 452 px. Default acrylic body: 120 x 50 mm, 3 mm thick (ratio 2.4 vs canvas 2.389; decide crop/padding policy explicitly).
- The `slots` coordinate system in `src/config.js` provides layer placement but **does not** automatically provide fine-grained geometry for a material's colored border, title text, or Rating digits.
- Each versioned asset needs a manifest entry with a commercial-use permission and optionally an effect alpha mask. For sub-areas (`rating.frame` vs `rating.digits`, `title.text` vs `title.background`), explicitly author separate per-component masks in original asset pixel coordinates.
- Assign a finish per component or sub-area: `none`, `spot-varnish`, `glitter`, `holographic`. Unsupported combinations fail validation. Client selections are untrusted; server checks approved assets and factory capabilities.

## Mask contract

For all raster files use the **same dimensions**, pixel origin, orientation and effective physical print area. Use 8-bit grayscale, white 255 = finish applied, black 0 = none. Confirm anti-aliasing, minimum feature size, feathering and registration tolerances with actual vendor. Avoid encoding a finish by coloring the base RGB art.

Minimum proposed handoff for each order:
- `print-color.png`: flattened normal print image.
- `white-ink-mask.png`: area with backing white; transparent effects elsewhere.
- `spot-varnish-mask.png`: only UV gloss locations.
- `glitter-mask.png`: requested glitter-finish locations **only if factory process supports a digital per-order mask**.
- `holographic-mask.png`: requested rainbow reflection locations; **requires confirmation whether spot foil / transfer / coating is actually available**, because full-sheet holographic film cannot be locally masked via an ordinary UV printer alone.
- `cut-outline.svg`: fixed factory-approved 120 x 50 mm contour including radius/bleed, not generated from decorative shapes.
- `proof.png`: visual customer proof, deliberately not used as print separation.
- `production-spec.json`: item, quantity, geometry, material, color profile, coating side, layer order, versioned asset manifest, rights-review status and checksum of each file.

Some vendors require PSD/TIFF with named spot-color channels rather than separated PNGs. Implement a vendor-specific adapter instead of assuming generic black/white mask names are accepted.

## Registration, image ordering and quality

- Ask the factory whether printing is face or reverse; reverse printing may need mirroring and a different white/color order.
- Make sure sticker-like effects do not obscure small type/eyes. Consider per-asset protected exclusion masks (text, facial detail) and safety margins.
- For 120 x 50 mm at 300 DPI, roughly 1417 x 591 pixels is minimum output. Existing 2160 x 904 preview is sufficient in pixel count but its raster may not have proper bleeds/separations/quality.
- Define bleed, edge clearance, white-ink over/underprint and alignment tolerance per factory samples, **not as universal constants**.
- Check printed physical samples in diffuse light and directional light, with and without LED base. Use actual photography to calibrate on-screen finish preview. Test repeated reorders with different JSON templates.

## Vendor questions before software integration

1. Can you print CMYK+W+V (white/color/varnish) on 3mm acrylic and accept separate masks or Photoshop special channels?
2. Is selective holographic reflection implemented via partial transfer or only full-sheet foil? Is glitter a coating/ink or a base material? Which effects may coexist?
3. What files, spot-channel names, print profile, bleed, smallest printed detail and registration tolerances do you require?
4. Can each customer order use a different image and mask with MOQ=1 and without extra setup fees?
5. Will you accept production jobs by API, authenticated portal or CSV/file batch? How is receipt acknowledgement, failure, remake and tracking handled?
6. What are manufacturing costs and lead times for basic, varnish-only, glitter, holographic, plus separate card and LED base?
7. Can you ship directly with approved shipping labels and use necessary recipient data through an access-controlled system?

## Example per-asset config

```json
{
  "schemaVersion": 1,
  "designVersionId": "immutable-server-version-id",
  "finishAssignments": {
    "background": "none",
    "avatar": "none",
    "rating.frame": "holographic",
    "rating.digits": "none",
    "title.text": "spot-varnish",
    "rank": "glitter"
  }
}
```

## Rollout

1. One approved **original** design, no live sales, prepare mask samples.
2. Confirm with factory which of spot varnish, glitter and holographic is materially achievable; record factory capability schema.
3. Server-side deterministic mask renderer with asset sub-masks and separate print proofs.
4. Golden sample QA against factory proof; track mask SHA256 and accepted version.
5. Activate production routing only for assets with valid commercial rights and signed-off processes; never assume user-uploaded game imagery is licensed.
