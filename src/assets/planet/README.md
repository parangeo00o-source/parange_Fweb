# PARANGE PLANET sky assets

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
