# PARANGE PLANET sky assets

## Neon residents: shared original models, material-only finish (active)

The design authority is `residents-16.png`, NOT the earlier simplified vectors
or generated plush redesigns. `tools/bake-neon-residents.mjs` renders the exact
`createResidentRig` geometry, masks, garments and palette used in Sunlight and
Moonlight Walk. `resident-neon-finish.ts` changes only surface response: matte
pigment, directional fine fibers and soft warm illumination. Glossy oval eyes
retain their original material. No geometry or facial details are re-authored.

`neon-original-rigs/*-v1.webp` contains 16 native-rendered atlases, each 3840×480,
eight 480×480 directions. `manifest.json` records source, camera, byte sizes and
zero silhouette-alpha changes during front-view material comparisons. The baker
also rejects any direction touching an atlas-cell edge. These are deterministic
native renders, not AI-generated replacements. Re-run the baker after rig edits.

`neon-rig-sprites.ts` loads only populated species on Neon intent/entry (about
2.2 MB for the entire roster), loads new arrivals before revealing them, shares
assets across world/reveal/portraits and animates a continuous lower
mesh while keeping faces rigid. Signed yaw selects the real eight-direction view.
No in-game baking, additional WebGL pass, new animation loop or day/night model
change. Neon entry waits for loading, avoiding a temporary redesigned character.
The older vector painter remains an emergency/programmatic fallback only.

### Rejected replacement designs (archive only)

The generated sheets below changed the character designs and are NOT used or
loaded by the application. `neon-resident-art.ts` is retained as an unimported
archive of that approach. Each transparent PNG is 1448×1086:

- [neon-residents-01-v1.png](neon-residents-01-v1.png): fox, bear, rabbit, cat.
- [neon-residents-02-v2.png](neon-residents-02-v2.png): penguin, koala, frog, elephant; corrected koala rear anatomy.
- [neon-residents-03-v1.png](neon-residents-03-v1.png): raccoon, deer, dog, duck.
- [neon-residents-04-v2.png](neon-residents-04-v2.png): sheep, mouse, otter, capybara; corrected capybara rear anatomy.
- [neon-resident-prompts.json](neon-resident-prompts.json): exact final prompt set.

The earlier `02-v1` and `04-v1` source drafts remain archived and are not imported.

## Neon edition: animated illustration garden (active)

Original transparent illustrations generated with the built-in image_gen tool,
using the user's patterned-fish and pastel music-graphic references as style
guidance. No CLI fallback, reference photography, or reference lettering.

- [neon-fish-atlas-v2.png](neon-fish-atlas-v2.png): 1254×1254, four individually patterned fish.
- [neon-motifs-atlas-v2.png](neon-motifs-atlas-v2.png): 1254×1254, flower, musical notes, pearl star, music player.
- [neon-bird-rig-v2.png](neon-bird-rig-v2.png): 1774×887, separate blue bird body and articulated wing.
- [neon-pearl-wing-v1.png](neon-pearl-wing-v1.png): 1536×1024, a full feather fan used as a compact mirrored pair behind the planet. Created with the built-in image_gen tool, actual alpha preserved; no CLI fallback.
- [neon-garden-prompts.json](neon-garden-prompts.json): exact final prompts and output filenames.
- [neon-wing-prompt.json](neon-wing-prompt.json): exact final prompt for the new pearl wing.

All original alpha channels and pixel dimensions are preserved. Explicit atlas
gutters prevent adjacent artwork leaking into sprite draws. Fish use a 28-strip
travelling tail wave, birds rotate separate wings around measured roots, bubbles
rise, notes bounce, flowers rotate slowly and stars shimmer. Motion derives only
from the shared scene clock. No additional animation loop or WebGL pass.
Background paper and soap-film tiles are cached; artwork loads once on entry to
Neon. Reduced motion caches a still composition, invalidated on resize/load.
The background stays behind the island and never intercepts pointer events.
The earlier chromatic plates below remain archived but are not imported/fetched.

The reference-scale composition is defined in `src/neon-sky-layout.ts`: patterned
fish, medium notes/player and small flower/star accents use different scales.
Fish now use 55% of the original reference composition size (a further 26.7%
reduction from 75%), without changing placement, animation or the wing pair.
Portrait has its own placements and sizes. Paired feather fans and fine-line
ghost notes/sparkles are painted only on asset load/resize, behind moving art.
Large paired pearlescent bubbles supplement the smaller rising bubbles; their
256px shared tile preserves detail without an extra rendering loop or filter.

## Earlier Neon edition: authored chromatic print (archived)

`neon-print-landscape-v1.jpg` (1536×1024) and `neon-print-portrait-v1.jpg`
(1024×1536) are the previous Neon background plates. Created with the built-in
image_gen tool using the user's white Metalwood Studio poster as a material/style
reference, not as an asset to paste into the game. No CLI fallback was used.
The first rough-paint draft was rejected; the selected revision uses softer
overexposed colour, organic white voids and fine screened edges. The portrait
edition was separately recomposed, not stretched. No reference typography,
border, UI or photographic subjects are included.

Both selected outputs are exported as JPEG quality 92 without resampling;
the app lazily loads the matching image and preserves its pixel aspect. Original
generation PNGs remain in the generation archive; runtime paths are project-local.
Exact final edit/recomposition prompts and provenance are in
`neon-print-prompts.json`.

## Active background: reference cleanup

`cloud-sky-reference.png` is the active background. It was edited with the built-in image_gen tool using the user's attached advertisement as the edit target. Foreground characters, tracks and type were removed; hidden areas were reconstructed. This is a reference-based inpaint, not a pixel-identical extraction of occluded clouds. No animation or added color overlay is applied in day mode.

Final edit prompt:

EDIT the attached user reference image (the 900x599 retro game advertisement), do not create a different sky. Asset type: clean background plate for a browser game. Remove ALL foreground items: monkey character and transparent ball, purple and blue racing tracks, the three small game screenshots, all typography, headlines, fine print, logos, rating boxes, badges, thin fold seam. Preserve the original visible sky and clouds as closely as possible: original cyan/teal-azure blue hue, the small soft white cloud cropped along the top near x=230, the little wisps around the middle, and the same low, hazy, blurry luminous white cloud bank that starts around 58 to 65 percent down the image and fills the bottom. Match this exact original cloud silhouette/placement in visible areas. Inpaint only the areas previously hidden by the removed objects with a seamless continuation of adjacent sky and clouds. Preserve the original soft low-resolution airbrush quality and subtle printed grain. IMPORTANT: not a sharp photographic cumulus sky, not a ring of clouds around the frame, no giant towering clouds, no deep royal-blue sky. Maintain the original approximately 3:2 aspect ratio, framing and original blue-to-white distribution. No new shapes, no text, no symbols, no ground or horizon. Output only the clean sky-background plate.

## Earlier background (not active)

`cloud-sky.png` was generated with the built-in image_gen tool for the cloud-background / retro console-game UI redesign. No CLI fallback was used. The user's attached game advertisement was a visual style reference, not an edit target; only the sky was generated. Typography and UI are live HTML/CSS.

## Final generation prompt

Use case: stylized-concept. Asset type: widescreen sky background texture for a playful 3D browser game, landscape 16:9. Primary request: vivid azure and cyan blue sky with soft fluffy white cumulus clouds, capturing the optimistic early-2000s Japanese console-game magazine advertisement aesthetic. Background ONLY. Composition: generous clear rich-blue sky through the central 65 percent for an interactive globe and readable UI, big soft cottony clouds framing lower corners and bottom quarter, a few smaller wispy clouds along upper edges. Clouds have delicate blue shaded undersides, luminous white sunlight, slightly airbrushed nostalgic printed-ad texture and very fine film grain. No horizon line or ground, viewer suspended high in sky. Keep upper middle mostly deep saturated azure, clouds irregular and natural, not vector puff icons. Constraints: no characters, no planet, no spheres, no objects, no race tracks, no text, no logos, no UI, no watermark. Fully opaque background.

## Fonts

Locally hosted Jua (Korean UI) and Lilita One (English display) from the Google Fonts repository. Original font files and their SIL Open Font License notices are in `fonts/`.

- https://github.com/google/fonts/tree/main/ofl/jua
- https://github.com/google/fonts/tree/main/ofl/lilitaone
