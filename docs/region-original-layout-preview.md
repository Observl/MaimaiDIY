# Original-layout regional preview

This update extends the v1.2.4 editor. The original page cards, animation, compositor coordinates, existing rating boundaries, and ordering/payment flow remain unchanged.

## Implemented
- Region and screen-content selectors inside the original live-preview card.
- Pinned JP background, plate, icon and companion catalogs; regional SaltMeta song/level catalogs.
- The original material picker reused for all choices.
- Up to five companion selections, level, song, difficulty and four-decimal achievement configuration.
- Independent regional drafts and region/mode templates. Legacy browser storage stays readable and is not overwritten.

## Explicitly incomplete
- MAGiCAL/CiRCLE are website backgrounds. Archived MAGiCAL webpage layers are reused for JP, and existing CiRCLE layers for CN. They never become canvas background assets. Achievement masks are not yet available; the compositor stays at the original collection layout.
- New companion/song configuration is stored but is deliberately not painted into the canvas or PNG. No invented generic cards are presented as game UI.
- CN1.55 original art download returned 403. CN companion catalog is empty; existing CN collection sources remain available. JP art is not substituted for CN.
- JP asset browser snapshot is June 2026, before MAGiCAL. It is not a complete current MAGiCAL art set.
- Tomomai MAGiCAL logo/character match official SEGA website files, but its tall webpage landscape is not a game-display mask. Official new frame previews carry SAMPLE watermarks and are not used.

## Source snapshots
- https://github.com/realtvop/SaltMeta/tree/d327942662643b391b6883ba40dd0b89e9a1d169
- https://github.com/basilomorireal/maimai-asset-browser/tree/0ebcd319585af286bce5c31cc416fcf245e28428
- https://www.sega.co.jp/release/260917_4.html

## Clarification applied
- JP switches only the webpage decoration to the repository's archived official MAGiCAL layers. CN uses the existing CiRCLE page background. The user's upper-screen background remains a per-region design choice. The order page follows the saved region too; its pricing/payment logic is unchanged.
- Japanese frames, plates, icons and companions use source-backed groups. Direct genre metadata is distinguished from exact-name joins and type-based grouping; unknown art is explicitly unclassified. No release-version assignment is invented.
- Genuine Japanese dan/friend-battle art is not present in the selected repositories. These optional controls are unavailable and hidden on JP, and previously mixed CN badge fields are removed while preserving the rest of each draft.
- Japanese DX Rating is a separate concept: it now uses the pinned maidraw Japanese files with the four CiRCLE PLUS high-tier frames (including kiwami at 16000). Existing CN rating thresholds and frames are unchanged.

## Rebuilding the pinned metadata
Run `node tools/build-region-catalogs.mjs /path/to/verified-source-snapshot`, then `python tools/build-jp-classifications.py /path/to/verified-source-snapshot/maimai-asset-browser`. The first step normalizes regional SaltMeta charts and verifies asset-tree membership; the second restores names and source-backed classifications. Keep source commit pins synchronized with the explicit import allowlist before updating a snapshot.

## Validation status
- ESLint, 161 unit tests, and the public build pass.
- Native Chromium integrated browser checks cover regional drafts/templates, five companions and duplicate-swap preservation, songs/difficulty/four-decimal achievement, 2160×904 PNG export, legacy storage preservation and 390px layout.
- The clarified webpage-theme tests pass: MAGiCAL/CiRCLE toggle and reload, webpage-only theme does not change canvas pixels/card geometry/saved files, independent design backgrounds restore, categories are distinct, JP Rating is pinned, unverified JP dan/battle never render CN art, pause and reduced-motion preferences work.
- All 40 pre-existing browser cases were exercised across runs: 36 passed. Four failures reproduce identically on untouched main bf9a13b in the same environment: default-render golden text difference, light-dial drag (75° vs 15°), reverse-acrylic pixel limit (6489 vs <60), and powder variation (0.019416 vs >0.06). No unrelated 3D/payment changes were made to force these tests to pass.


## Versioned COS index migration

The regional release is isolated at `materials/regions/releases/20261108/`. Existing `materials/manifest.json`, title/badge manifests, CN collection images and old personal templates remain supported. No root manifest or existing object is overwritten by the new release.

- `index-v2.json` identifies the immutable release and the two regional indexes.
- `catalogs/v2/{region}/index.json` lists the five typed category shards, their counts, byte lengths and SHA-256 hashes.
- Each shard retains the original metadata, with `order`, `byId`, and source-backed `groups`; artwork paths are relative to the pinned release. Classification provenance and unknown-version markers are preserved.
- The browser verifies the referenced bytes, schema, region, type and safe path before registering a catalog. Invalid or cross-region metadata is rejected, not silently merged with older entries.
- Index caches are independent of the legacy service-worker image cache and keyed by release. Offline reuse must pass the same validation. A complete bundled v1 catalog is a visible compatibility fallback when the v2 service is unavailable; individual v1/v2 shards are never mixed.
- Existing pinned JP GitHub template addresses migrate to their exact COS equivalents. New regional asset paths cannot enter the broad legacy COS allowance. CN original defaults are not rewritten.
- The original picker consumes the category group index; companion/song lookup uses per-region ID maps. Search, pagination, selection history, original page layout and output dimensions stay unchanged.

Validation for this index change:
- ESLint, 161 unit tests and the 93-file public build pass.
- All 2,187 entries in the existing normalized CN collection manifest pass import validation, including the original filename with encoded spaces and parentheses. Both the manifest-source and older encodeURIComponent spellings round-trip unchanged.
- Independent review reproduced and verified the CN filename compatibility fix and rejection of malformed aliases before catalog registration. Every generated JSON matches the frozen upload artifact byte-for-byte.
- Final Chromium integration: six regional cases pass, covering 13 unique JSON requests, indexed group counts/pagination, same-release offline cache, corrupt digest/wrong-region rejection, old CN/pinned-JP template migration, mobile controls and PNG export. Seven legacy asset-failure cases plus six selected editor regressions also pass. The final regional repeat includes the clarified CN-original-library status label; the legacy 13 passed on the immediately preceding logic-identical build. Real scrolled mobile viewport captures confirm all fields render correctly; full-page capture waits for painting.
- All 14 public COS v2 files return HTTP 200 and match their frozen byte sizes and SHA-256 hashes. CORS allows the production website origin, and release/region/category schema relationships validate. A separate real-browser check uses the public COS files without response fixtures: both regions load through v2, JP artwork renders, source groups/search/pagination work, and old CN templates plus independent JP drafts/templates round-trip. A MASTER chart and achievement 100.1234 persist across region switches. PNG download completes without a cross-origin error; its dimensions are independently covered by the fixture test, not re-read from that live download. A normal 485px browser window has no horizontal overflow and all scrolled controls render; this is a narrow-window check, not touch-device emulation.

Rebuild the additional immutable indexes with:
`node tools/build-region-index.mjs --input /path/to/cos-v1-catalogs --output /path/to/separate-index-output`

The generator does not alter its input or copy images. Its local manifest records the exact destination keys, byte sizes and SHA-256 values. Upload category shards first, regional indexes next, and `index-v2.json` last; do not publish different bytes at an already published release. Keep the original v1 catalog files and old root manifests available.
