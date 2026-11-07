# Rating digits

`rating-digits-extrabold.ttf` is a digits-only static subset of **Roboto ExtraBold (800, width 100)**. Its internal family name is `Maimai Rating Digits` to distinguish this modified distribution. It is licensed under the SIL Open Font License 1.1; the original copyright and full license are in [`../licenses/Roboto-OFL.txt`](../licenses/Roboto-OFL.txt).

Source: https://github.com/google/fonts/blob/main/ofl/roboto/Roboto%5Bwdth,wght%5D.ttf
License: https://github.com/google/fonts/blob/main/ofl/roboto/OFL.txt

The choice is a visual approximation of the user's Rating reference: upright, heavy numerals, a footless `1`, and a triangular counter in `4`. It is **not** an identification of SEGA's original typeface or an exact replica of the game's digit textures. For example, Roboto's `1` has a straighter diagonal flag than the reference.

A public maicard implementation uses individual `UI_NUM_Drating_{digit}.png` images instead of a text font: https://github.com/HoshinoStarry/maicard/blob/master/generate_img.py . That repository does not contain the source digit images, and its external resource package was inaccessible when checked on 2026-11-07. Neither those sprites' original resolution nor their redistribution rights could be verified. No unverified digit sprites or proprietary fonts have been added by this change.

The subset was built using FontTools: instantiate `wght=800`, `wdth=100`; retain Unicode `0`–`9`; preserve copyright and license name records; rename the family to `Maimai Rating Digits`; save as TrueType. It is served locally so preview and export do not depend on an additional font CDN.
