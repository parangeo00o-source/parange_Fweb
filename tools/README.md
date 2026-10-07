# Resident model review

Run `npm run dev` and open `/tools/resident-preview.html` on the local Vite server.
The preview has all 16 residents, front/side/back controls, orbiting, walking and
an all-resident view. It calls the same `createResidentRig` factory as move-in;
camera access and face detection are not needed for model review. This development
page is not part of the production entry point.

`src/resident-designs.ts` contains species, palettes and head dimensions.
`src/resident-sculpt.ts` contains 16 individually authored head cross-sections,
front/back depth, cheek volume, garment dimensions, eye sizes, limb and footwear
proportions. `src/resident-model.ts` constructs closed geometry and joint groups.
Face, ear and garment markings are opaque procedural UV colour masks; tails use
vertex colours. These are mathematical patterns, not projections of a reference
image. No character image or turnaround is placed on a mesh. Image assets are only
used for reference and the resident's portrait.

The fox's projecting cheek/muzzle is part of its continuous head surface. Other
species have authored ear cups, muzzles, trunks, bills, antlers and wool volumes.
Garment scales do not affect joint parents, so rotating the head no longer squashes
it. Boots use rounded toe/heel volumes with attached shafts, cuffs and soles.

These are reference-based, authored approximations, not recovered original meshes.
The source illustration and generated turnarounds disagree in some details (for
example the duck's fur and the sheep's ears). The original illustration takes
priority for palette and identity; turnarounds inform hidden volume and clothing.
Shoulder, elbow, hip, knee, ankle, neck, ear and tail pivots drive rigid toy-style
animation. This is not a scanned surface or a production skinned character rig.

## Geometry and animation regression check

With Vite running and Playwright/Chrome available, run `node tools/check-residents.mjs`.
For an external Playwright installation, set `PLAYWRIGHT_MODULE` to its `index.mjs`.
`REVIEW_URL` defaults to `https://localhost:5173`; `CHROME_CHANNEL` defaults to `chrome`.
The check uses all 16 production model factories and verifies finite geometry,
opaque procedural masks (no image cards), depth, neutral ground contact, separated
boots, joint attachment, walking/held/meeting transforms, non-squashing head turns,
preservation of village placement and disposal of meshes/materials/textures.
Visual fidelity still requires reviewing front, side, rear and moving views in
the lab; these structural checks do not assert that a model is identical to art.

## Village interactions

`src/planet-village.ts` owns selection, follow-camera orbit, press/drag/drop and
meeting state. It operates in planet-local surface normals; camera positions are
converted into scene coordinates only when following a resident. A 450 ms hold
picks up a resident, while a movement beyond 7 px cancels a pending hold and
starts orbiting. Pointer cancellation restores the previous position. Invalid
drop locations resolve to nearby dry, unoccupied ground or the original position.

The world reserves a clearing before generating trees and rocks. Meeting slots
have a minimum normal-space separation of 0.105; residents use a short travel hop
to cross scenery, land in separate slots, then face the centre with idle gestures.
Dismissal resumes wandering, including when a meeting is cancelled mid-travel.

The move-in studio uses the home page's Planet Lilita font and English strings.
The home slogan is hidden for the full capture/build/arrival lifecycle and shown
again on cancellation or landing.
