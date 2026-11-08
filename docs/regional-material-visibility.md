# Regional material visibility

The material picker now applies a separate, dated visibility policy after reading a regional or legacy catalog. The policy does not rewrite COS indexes, replace images, or change the saved-template import rules.

## Evidence and limits

- CN frames, nameplates, icons and titles require an explicit LXNS distribution date on or before 2026-11-08. The public LXNS documentation warns that its lists also contain unreleased collectibles. A missing record/date is therefore treated as unknown, not as proof of JP exclusivity.
- JP collection choices require a name in the pinned source XML or a direct character-to-genre record. Basic companions without a genre-map entry remain available. Four directly mapped companions without XML names also remain available.
- The JP source does not provide an official server-availability or release-version statement. These are identified source entries, not an exhaustive official JP list. This limitation is visible in the picker; no exclusive-region label is inferred from a repository name, Japanese text, file number or missing entry.
- Matching IDs can remain selectable in both regional lists. Each region keeps its own original image URL; matching IDs do not establish byte-identical artwork.
- The JP title picker does not fall back to the CN title collection. This prevents CN WEC and annual 舞萌DX titles from being offered as JP titles. Existing saved or imported title text remains readable.
- SaltMeta's existing regional song/chart filtering is unchanged. JP dan/friend-battle controls remain unavailable rather than using CN artwork.

Sources and exact response SHA-256 values are recorded in `data/regions/visibility-20261108.json`. Primary documentation: https://maimai.lxns.net/docs/api/maimai. The source XML and genre map are pinned to `basilomorireal/maimai-asset-browser@0ebcd319585af286bce5c31cc416fcf245e28428`.

## Selectable counts in the current catalogs

- CN: 347 backgrounds, 395 nameplates, 1,046 icons and 2,766 titles. Another 61 backgrounds, 62 nameplates, 276 icons and six titles have insufficient distribution evidence and are hidden from new choices.
- JP: 425 backgrounds, 422 nameplates, 1,192 icons and 1,082 companions. Another 149 backgrounds, 117 nameplates, 439 icons and 354 companions lack identifying source records and are hidden from new choices.
- These counts describe the currently indexed images and evidence snapshot, not the full current playable/unlockable collection.

## Compatibility and asynchronous state

- Visibility affects new choices only. Old designs, including the CN `450001` nameplate with encoded spaces and parentheses, remain importable without rewriting the saved URL.
- Filtered groups and pagination are derived from the visible items. Cached searches and selections belong to the region in which the picker opened.
- Delayed image, catalog, filter and close callbacks cannot update another region. While switching regions, new picker opens are blocked, and any remaining picker closes before the new regional state is committed.
- Recommendation designs also have a region boundary. Pre-region recommendations keep their legacy CN meaning, and the existing JP recommendation button remains disabled.
- An unavailable visibility policy never silently exposes the unfiltered collection. Empty categories, already regional song lists and existing CN badge categories do not acquire an unnecessary policy-fetch dependency.

## Validation

- ESLint, all 188 unit tests, and the 95-file public build pass.
- Focused tests cover cross-region callback races, shared IDs, unknown and future evidence, CN WEC/undated titles, basic JP companions, conflicting IDs, non-padded original filenames, and legacy encoded template compatibility.
- The updated browser regression specification loads successfully. Its automated fixture run was not executed because the complete original fixture directory is unavailable; this is separate from the real-browser checks against public COS.
- Real-browser final verification is recorded separately with the tested build revision.

Rebuild the policy from inspected evidence with:

`node tools/build-material-visibility.mjs evidence.json data/regions/visibility-20261108.json chara_genre_map.json`

Review the evidence and snapshot date before changing an allowlist. Never fill gaps by treating source membership or missing records as proof of exclusivity.
