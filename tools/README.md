# Resident model review

### Console material / resolution review

The island now uses one shared, filtered HDR sky/softbox probe, with warm sun and
cool sky fill. Matte turf/stone, lacquered props, resident fur, clothing and eyes
have distinct roughness and reflection responses. Fine pigment fades with pixel
footprint to avoid distant glitter. Leaf veins stay on the closed leaf volumes;
root/building contact shading is baked into terrain colours (no extra render pass).
Lagoon caustics form moving intersecting cells while retaining the no-flare water,
fish silhouettes, physical swell and night-only turquoise coastal emission.
Roof seams follow the curved cap with sufficient radial samples to prevent
surface intersections at oblique angles. Placement and interaction geometry stay
unchanged. Retina rendering supports up to 2×, with a four-million-pixel budget
recalculated on resize. This does not guarantee a frame rate or thermal behaviour
on every device; physical-device profiling is still required before release.

`node tools/check-art-direction.mjs` checks production HDR/material settings,
opaque 16-species residents, baked contacts, retina buffer limits and exact daytime
lighting restoration, and captures desktop/mobile day/night views. Use the same
`PLAYWRIGHT_MODULE` and `REVIEW_URL` overrides as the other checks. Garden detail
captures regenerate PMREM for their separate WebGL context so material review
does not accidentally use an empty reflection texture.

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
The capybara has an elongated barrel-shaped head with a rounded muzzle colour cap,
not a separate spherical nose. Coincident sculpt vertices share shading normals
without merging their UV coordinates, avoiding a visible seam while rotating.
Garment scales do not affect joint parents, so rotating the head no longer squashes
it. Boots now use one continuous closed toe/heel/ankle volume, with inset colour
bands instead of intersecting shafts, cuffs or sole discs. Penguin paddles are
continuous volumes attached to the shoulders, rather than sleeves and mittens;
its belly also covers the pelvis without a separate exposed hip ring. The
elephant trunk follows a finer, smooth curl with a rounded tip. Capybara eyes sit
farther to the sides of a narrower, deeper snout, with smaller ears.

Rotation stability: heads now use a single smooth Bernstein deformation envelope
over a closed ellipsoid, instead of separately interpolated horizontal rings.
Angular cheek/jaw deformation vanishes at both poles, preventing pinched chins and
crown folds; the rear hemisphere stays rounded. Face attachments query the exact
sculpt surface. Species limb proportions are baked into meshes
and joint offsets before animation; rotating shoulders, elbows, hips and knees
have unit scale, preventing inherited non-uniform scale from shearing hands and
boots. Tests check rear-skull curvature and orthonormal joint transforms through
normal, held and meeting motions. Original-roster details include wider koala
ears with scalloped inner fur, larger mouse ears, rounded deer antler tips, the
offset calico blaze and the capybara's green rear pack and straps.

The 360-degree volume pass also replaces garment spline overshoot with a clamped
cubic B-spline shared by geometry and painted trim, deepens jacket sections, and
rounds shoe insteps/heels without separate ankle shafts. Pointed-ear front and
rear surfaces meet continuously; round/rabbit ears have actual recessed bowls.
Swept appendages close with rounded end envelopes. Frog throat and otter cheeks
belong to their head surface rather than overlapping flattened ellipsoids.
Noses seat against the actual muzzle surface and whisker roots follow the face,
preventing fixed-depth attachments from floating in side views.
Sheep fleece uses one continuous lobed rear cap plus the original large forehead
curls (35 fewer meshes). Elephant trunk curvature is gentler through the curl.
Palette/costume authority remains the first roster, not the alternate uniforms.

`check-resident-volumes.mjs` checks all 16 heads for outward normals, pole
convergence, matching seam normals, curvature continuity, attached eyes and
non-flat/non-folding garment profiles. `check-residents.mjs` additionally checks
all animated joints, original-design parts, ground contact and disposal. The
development preview's **4면 비교** button shows front/side/back/three-quarter
views together. `capture-residents.mjs` saves eight full-roster views and both
single-angle and four-view reference comparisons for every species.

The source-roster refinement rounds each species' crown/jaw sections, seats oval
eyes on the actual face normal, thickens/recesses ear cups, and replaces raised
boot rings with inset opaque stripes. It restores the rabbit skirt hem, elephant
cream sleeves, duck sleeve/wing/bill construction, deer antler tines, sheep
forehead curls, mouse muzzle, otter cheeks and capybara abdomen. Fox/cat/raccoon
tails have fuller volumes. Fine local-space pigment grain and quieter fur/eye
reflections distinguish fur from gloves and boots. All saved residents use this
same revised factory on reload; their IDs/species and original portraits stay intact.

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

`node tools/capture-residents.mjs` saves eight roster directions (45° steps) and 16
individual views to a fresh temporary directory and prints that directory.
`node tools/check-village.mjs` exercises the real globe scene with all 16 models:
meeting spacing, follow/orbit, repeat-click return, press/drag/drop, invalid-drop
restoration, dismissal and studio typography. It bypasses webcam capture solely
to seed the test village; it does not test face recognition or camera permissions.
Both commands use the same environment variables as the geometry check.

## Village interactions

Building scale is authored in `landmarkScale` and shared by architecture,
approach paths and selection targets: home .68, market .70, observatory .72,
castle .77 and lighthouse .82. Most roofs sit around .52–.61 above ground,
alongside the shortened trees; castle/lighthouse accents remain .79–.84. Porch
lights and ground-conforming light pools follow the new dimensions. Home doors
are wider relative to the body, with small window flower boxes. Roofs are closed
rounded caps with rolled eaves and shallow joints, not wire grids. Painted parts
use a softer glossy enamel finish; masonry remains relatively matte.

Play equipment uses bevelled boards, smoother poles and painted pigment detail.
The slide is .72 scale with a closed curved chute and continuous tubular rails;
swings are .84 and the sign .80, while low benches/sandbox stay resident-sized.
Meeting clearances and conservative obstacle footprints are preserved.
`check-garden.mjs` verifies the building height hierarchy, path contact and hit
targets and includes a production-scale resident in its building close-ups.

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

## Names, dialogue and permanent release

The studio has an optional 24-code-point name field. Camera capture starts only
after READY is pressed, allowing time to enter the name. Unnamed residents receive
`주민 1`, `주민 2`, etc. Stable UUIDs, not display names, identify residents, so two
neighbors can share a name without sharing follow/dialogue/deletion state.

New arrivals select from species missing from the current village (including
restored residents). `resident-selection.ts` keeps the face-derived/random pick
within that missing-species pool; only after all 16 species are present does it
allow the full roster again. Selection does not reserve a species: cancellation
does not consume it, and a departed species becomes eligible again. Existing
neighbors are unchanged. `node tools/check-resident-selection.mjs` checks these
rules, and `check-move-in-transition.mjs` checks that the real move-in controller
passes the current species to the builder for successive arrivals.

`resident-store.ts` saves names, species indices, surface coordinates and expelled
IDs to this browser's localStorage (`parange.planet.residents.v1`). It never stores
photos or face landmarks. Restored residents are rebuilt with the same 3D factory.
Expulsion is recorded immediately on a deliberate pointer release in the pit,
before its visual animation. Expelled IDs cannot be re-added. Stale local saves
merge expulsion records to prevent resurrecting a removed ID. Clearing browser
site data clears this local world; there is no account or server synchronization.
If storage is unavailable, play continues but the release toast warns that durable
saving could not be confirmed.

The sinkhole is a shaded 3D cup with a matching animated cut in both the terrain
and the underlying water sphere (including terrain shadow depth). It opens only
during a character hold, on clear visible ground beside that character. Its diameter
is 1.85 times the earlier pit; opening, hit area and navigation clearance share the
new size. Concentric tangent-plane searches start near the grabbed resident and
check the complete rim against shore, scenery and other residents, rather than
selecting a fixed screen corner. The origin is outside the opening so simply
holding/releasing does not expel the resident. If no safe nearby patch exists, no
pit is forced through scenery. Terrain
raycasts determine the drop; pointer cancellation, route changes and ordinary land
drops do not expel. A successful release removes the resident from active meeting,
follow and persistence state, then disposes its model after the shrinking descent.

`resident-lines.ts` contains 100 friendly Korean lines. Each resident uses a
shuffled deck without repeats until all lines are used. `planet-dialogue.ts` types
the text with punctuation pauses; READ IT ALL completes it, TELL ME MORE advances,
and a completed line advances automatically after eight seconds. Screen readers
receive the completed line once. Reduced-motion mode displays the line at once.
Leaving follow mode cancels typing and auto-advance timers.
Only spoken text and its accessible announcement are Korean, with `lang="ko"`.
The dialogue text uses `--game-font` (Planet Jua) and word-preserving wrapping.
Labels, actions, nameplate typography and mobile sizing retain the original
English/Planet Lilita UI; user names are kept.
`node tools/check-dialogue.mjs` checks Korean strings, shuffled decks, typing,
read-all/next actions, accessible announcements, reduced motion, automatic
advance and cleanup with a deterministic clock, without camera or village physics.

`node tools/check-neighbors.mjs` tests legacy/default/custom names, all 100 lines,
typewriter behavior, sinkhole cancellation and release, persistence after reload,
rejection of an expelled ID, mobile layout and user-initiated camera countdown.
The same Playwright environment variables apply. Test media is a synthetic camera;
this check does not claim to validate face recognition on a real person's photo.

## Lossless planet performance pass

`planet-performance.ts` indexes only bit-identical complete vertices in static
non-indexed scenery: position, normals, UVs and other attributes must all match.
No triangles, seams, texture resolution, materials, lighting, shadows, effects,
pixel ratio or animation frames are removed. Static mesh-local transforms are
cached, while animated parent joints, eyelids, swing pivots, fish ripples and
droplets stay live. Follow-camera updates no longer walk the whole scene twice,
and per-frame village math reuses temporary vectors/matrices/quaternions.

The opaque move-in studio suppresses GPU rendering of the hidden world, without
pausing resident simulation or effect clocks. Capsule preparation still renders
its first frame before uncovering the studio; cancellation restores rendering.
Closing the experience and hidden-tab suspension keep their existing behavior.

`node tools/check-performance.mjs` records deterministic day/night scenes with
zero and 16 residents, a covered studio and return to the planet. Set
`PERF_BASELINE=/absolute/path/to/previous/report.json` to compare the saved PNGs
byte-for-byte, pixel hashes, triangle/draw counts, pixel ratio and shadow size.
It also checks bit-exact geometry reconstruction, live parent transforms and
the closed-screen render stop. The test instruments the renderer only through
Playwright routing; production has no profiler or alternate graphics mode.

On the local 1280×900 / DPR 1 comparison, scene geometry buffers decreased from
44,950,152 to 14,958,856 bytes without residents, and from 75,758,352 to 45,767,056
bytes with all 16 species. Local matrix recompositions fell from 1,580 to 655
per daytime frame with 16 residents. The fully covered studio submitted zero
GPU frames. All four visible snapshots matched the pre-change images exactly.
These are geometry-buffer/work-count measurements, not total RAM, a stable FPS
benchmark or a guarantee of temperature on every physical device.

## Retro move-in and dialogue UI

`src/planet-retro-ui.css` scopes the orange checkerboard, cream game cards,
ink outlines and colourful sticker controls to the studio and dialogue only.
The home artwork, scene, capture logic and dialogue deck remain shared. Small
screens stack the camera and player card in a scrollable dialog. Long names are
visually truncated without removing their accessible text or full-name tooltip.

`node tools/check-retro-ui.mjs` checks desktop, mobile and landscape layouts,
long-name dialogue, camera countdown and Escape cancellation using synthetic media.
It writes review screenshots to a new temporary directory. Use the same
`PLAYWRIGHT_MODULE` and `REVIEW_URL` environment variables as the other checks.

The arrival reveal uses `planet-arrival.ts` for the orange-check backdrop,
decorative stars and separate caption card. Its measured stage rectangle drives
the 3D presentation scale/position in `planet-world.ts`, including a silhouette
depth/yaw margin. The character remains the actual animated mesh. Landscape phones
use a side-by-side stage and caption. Decorations stop on flight/landing/cancel,
and reduced-motion preferences suppress sparkle animations.

`node tools/check-arrival.mjs` checks all 16 model bounds, long names, mobile and
landscape layouts, reduced-motion mode, landing and cancellation. It uses the real
reveal controller and renderer with directly constructed residents, not a webcam
or face-recognition mock, and saves screenshots in a temporary directory.

## Console-era planet and playground

The unlock scene is a centered collectible game-cover card with oversized outlined
lettering, a bubble showcase and a yellow speech sticker (no blue window bezel).
Its background sits below WebGL, while the border, stars and caption sit above it. This keeps
the resident a visible 3D mesh; `check-arrival.mjs` verifies popup/backdrop alignment
and centering as well as character/label separation.

`planet-playground.ts` builds an irregular sand/compacted-earth meeting court,
speckled rubber safety islands, a roofed slide, swing set, seesaw, sandbox,
entrance benches, back fence and PLAY CLUB sign. Equipment is oriented around the
open meeting area, rather than placed at arbitrary world rotations. The court
follows the same gently levelled terrain
field as resident movement. Raised facilities register collision footprints;
meeting slots, walking, drops and sinkhole placement all use those exclusions.
The painted court shares terrain/water sinkhole clipping. Most of the middle
remains open for the meeting rings. There are no checker tiles on the playground.
`planet-environment.ts` replaces the old terraced/noise world with an authored
storybook globe. A front bay opens into the southern sea, with a separate rear
lagoon, broad sandy shores and gently rising inland grass. The shared signed coast
field shapes the terrain, navigation, shoreline colour and water foam. No image
map is stretched over the globe. Total radial relief is about 0.185 units on a
6-unit diameter world; the shore rises gradually, without discontinuous terraces.
Rendered terrain, props and resident navigation sample the same height field.

### Console adventure art direction

The supplied console/adventure references inform colour blocking and course
silhouettes; the later island/forest references add layered vegetation, soft
bevelled buildings, shallow-to-deep water colour and visibly different stone,
wood and painted finishes. These are original, procedural approximations of the
visual principles, not recovered source assets or a claim of commercial-game
asset equivalence. The UI and existing resident designs are intentionally retained.

`planet-console-materials.ts` provides object-space grass mottling/texel grain and
animated lagoon caustics/shore foam without spherical UV stretching. Island paths
are narrow sandstone/compacted-earth ribbons with broken stone margins; checks
are reserved for the decorative loop. The play court remains sand and poured
rubber. Object-space pigment grain distinguishes masonry, wood and painted props.
The neutral tone curve preserves strong colour blocking.

`planet-console-architecture.ts` authors a tiled cottage, fruit market, crenellated
castle gate, observatory and lighthouse while preserving all five destination IDs.
Masonry joints, roof seams, window frames, counters, railings, flags and signs are
modelled details; static geometry is merged by material. The large loop course and
rear arcade bridge are decorative stage landmarks, not new traversable platforms.
They register ground collision footprints. Rotating stars are decorative markers,
not collectibles, and respect reduced-motion preferences.

`planet-biomes.ts` builds forest clusters with tapered branching trunks and
overlapping, downward-curving branch sprays in three tiers. Broadleaf foliage is
closed curved geometry with shaded undersides and central ribs, rooted in an
internal crown rather than randomly rotated over a visible sphere. Leaf length,
spacing and tint vary within the shared growth direction. Placement RNG is kept
stable so this canopy revision does not reshuffle existing trees. Understory,
3D grass tufts and flower beds fill the gaps at different scales. Coastal palms
use curved trunks and feathered fronds; a mossy wooden arch, shoreline stones,
pier and parasol give the regions distinct silhouettes. Batches share geometry
and materials through instancing. Leaf sway is GPU-driven; palm-frond shadows use
the same deformation, while solid crown volumes provide soft forest shadows
without re-rendering every small leaf into the shadow map. Reduced-motion
preferences freeze the sway.

The island layout uses shuffled, seeded spherical candidates before applying tree
quotas, avoiding the previous north-to-south early-exit bias. A loose regional cap
prevents one quadrant consuming the forest budget. Broadleaves and fruit trees
vary in size, while palms overlap the inland/coastal transition instead of forming
an isolated belt. Paths, building approaches and the meeting court remain clear.
Building fronts face the nearest path and their shallow foundations sit close to
ground level; the beach parasol and pier are placed at the revised sandy shore.

`planet-coast.ts` defines a single smooth bay-to-sea contour rather than combining
two overlapping circular shorelines. Terrain/navigation and water shaders share
this field; the separate rear lagoon is retained. `planet-bubbles.ts` adds seven
transparent 3D background spheres with thin-film colours, Fresnel rims and curved
reflections. They do not affect picking, hide during the resident reveal, burst
and disappear on entering night, and freeze daytime drift/interference when
reduced motion is requested.

The compact-island revision scales broadleaf local height to 70% and palm height
to 68%, including foliage/fruit so nothing detaches from the trunks. The bay and
rear lagoon are smaller, with broad scallops along the sea contour. Pier/parasol
positions follow the new shore. Water retains painted caustics and foam but has
zero specular intensity, clearcoat and environment reflection to remove glare.
Bubbles use independent 12–16 second float cycles with a secondary gentle drift,
a curved upper reflection and subtle interference bands. The garden check measures
two-second screen displacement and per-frame continuity, smaller water area,
actual instanced trunk proportions and disabled water glare as regression guards.

Bevelled masonry, the castle's rear keep and arched wooden door, and a white-brick
coastal lighthouse replace the sharp, uniformly glossy prop finishes. A new
oblique home view balances the forest, playground and coast without obscuring the
heading. Closed routes follow the revised low-relief field; branch junctions use
depth bias to avoid flicker. Sinkhole clipping composes with turf/water/course
shaders and now also clips the instanced grass in planet coordinates. Existing
resident models, names, saved IDs, meetings and camera interactions are unchanged.

`node tools/check-garden.mjs` checks terrain/navigation agreement, height relief,
dry paths, surface contact, the closed road seam and the five destination targets.
It also checks architecture/vegetation counts and composed surface/sinkhole hooks,
tree distribution and mixed-species neighborhoods, shoreline continuity, building
entrance orientation, bubble transparency/lifecycle and reduced-motion behavior,
captures front, side, rear, mobile, building, coast and forest views, and checks
browser/shader errors. These checks cover structure and behavior, not an automatic
claim of visual equivalence with the supplied reference art.

`node tools/check-playground.mjs` checks 16-resident spacing and furniture clearance,
the court's sinkhole shader, and captures day/night, meeting and close-up views.
Run with the same Playwright environment variables as the other checks. Generated
review screenshots go to an isolated temporary directory, never into source art.

### Moonlit walk

`planet-night.ts` draws a camera-relative indigo sky behind the globe and bubbles:
antialiased stars, a shaded blue-white moon and slowly drifting cloud banks.
It is a depth-tested backdrop, not a full-screen brightness overlay, and hides
with the world during character reveals. Reduced motion freezes sky animation.
Entering night pops the seven bubbles at 110 ms intervals into one reusable batch
of 448 sparkles with six saturated firework colours and restrained white cores.
The 2.4-second transition ends before shooting stars
begin. Eight independently phased meteor lanes cross the sky with star-shaped
heads, tapered tails and trailing glints; the globe occludes these background
effects. Day mode restores bubbles from below the viewport, with staggered
2.2-second upward easing, fade-in and slight growth. Reversing midway bursts the
bubbles at their current entering positions, without jumping to the final layout.
Day mode also resets the meteor effect. Reduced motion
hides bubbles immediately and omits bursts/meteors. No per-toggle timers, meshes or
textures are allocated. `node tools/check-sky-effects.mjs` checks deterministic
transition frames, rapid toggles, reveal hiding, reduced motion and desktop/mobile
screenshots using the production scene and effect modules.
The moon changes the key-light direction; blue hemisphere/fill lights and a cool
pigment palette on grass/foliage establish teal shadows. Dark blue water keeps its
existing zero-specular/no-flare treatment and composed sinkhole clipping.

Windows, framed porch lanterns, the lighthouse core and star markers emit warm
light at night. Two bounded, shadowless porch lights and five surface-conforming
doorway glows add localized warmth without a point light for every prop. Switching
back to day restores lighting, palettes and visibility; resident data is unchanged.
`node tools/check-night.mjs` checks this round trip, backdrop depth/lifecycle,
reduced motion, closed leaf geometry/alignment, water shader composition and the
night-only lamps. It captures desktop/mobile and night architecture/forest views.

`planet-night-ui.css` supplies a scoped deep-navy/royal-blue night palette for the
existing logo, controls, guide cards, move-in UI and resident dialogue, preserving
their layout and fonts. Removing `is-night` restores the sunny palette. Water has
a teal emissive band with a 2.3× shader gain following the same shoreline field as terrain;
it is not specular glare or a second overlapping surface. `planet-star-lamps.ts`
adds 24 bevelled gold/ice-blue star lanterns on clear ground outside the meeting
court and paths. Their radial orientation keeps star silhouettes readable from
globe view; shared soft halos and a gentle bob are active only at night. The night
check covers UI restoration, coast glow/sinkhole shader composition and star
placement/visibility; the sky-effects check also covers sunrise entry and reversal.

### Coastal fish and original-roster refinement

`planet-fish.ts` adds 12 validated, slow closed patrols in the front bay and rear
lagoon. Fish are closed body/fin volumes below translucent water, shaded as dark
silhouettes while submerged and coloured when airborne. A 12-second schedule
selects one fish, or two every third cycle, for a short arc with expanding landing
ripples and eight reusable droplets. No per-event timers or geometry allocations
are used. Reduced motion freezes swimmers and omits leaps/splashes.
`planet-water.ts` shares small radial wave displacement between fish placement and
the water vertex shader; travelling broken crests replace the old static rings.
The existing no-flare settings, teal night coast gain and sinkhole shader remain.
`node tools/check-fish.mjs` samples two minutes of wet patrols, bed clearance,
speed, jump counts, splash states, day restoration and reduced motion; it captures
day swim/jump/splash and night swim views. The sunny mode label is now 햇살 산책.

The first `residents-16.png` roster is the authoritative character reference;
turnarounds inform hidden volume only, not their differing costume palettes.
All 16 species have revised torso/limb/shoe proportions and moulded finishes.
Separate ankle rings and sole discs were removed. Fox cheek depth/ear insets and
side-curled brush, koala muzzle/nose, frog's flattened face and asymmetric green/
orange extremities, and dog's amber/cream boots follow original-roster details.
Penguin's round bib/scarf and duck's cream feathers remain distinct from uniforms.
`check-residents.mjs` guards those differences in addition to closed geometry,
articulated motion, grounding and resource disposal. `capture-residents.mjs`
renders all 16 alongside original portraits and in front/side/back/three-quarter
views. These are authored approximations, not exact reconstruction of source 3D
assets from the raster reference.

The species-detail pass widens the requested heads without scaling animated
parents, shortens only the capybara torso depth, rounds/thickens the otter tail,
and gives the mouse tail an S curve visible in profile. Dog muzzle volume is
integrated into its head; dog/deer face masks wrap around curved cheeks. Ears,
sheep crown curls, duck bill/three-tip wings, bear hood and penguin scarf are
individually authored. Deer antlers use a cached closed smooth-union surface,
including their branch junctions and rounded ends, instead of overlapping tubes.
`check-resident-details.mjs` guards these species-specific changes and checks
the antler mesh for open/non-manifold edges. `check-resident-volumes.mjs` checks
head curvature, seam normals and face attachments for every species. The frog's
existing proportions and original asymmetric costume are intentionally retained.

### Capsule arrival premiere

`planet-capsule.ts` supplies a deterministic 5.6-second reveal timeline: left-to-
right decelerating roll (0–1.25 s), damped rebound (1.25–1.9 s), hinged opening
(1.9–2.38 s), overlapping emergence (2.1–2.55 s), one complete turn (2.65–5.25 s), and a short
front-facing hold. The existing 2.2-second flight then places the same resident in
the village. Dense green/aqua hemispheres, opening rims and latch are 3D meshes.
Reflection arcs and the artificial orbit ribbon have been removed: a dedicated
floating-point sky/softbox environment is sampled by the physical shell material,
so broad feathered highlights respond to the camera and moving surface normals.
The upper/lower shell opacities remain .76/.88 throughout: the open shell first
clears the entire resident depth, then moves down and out, without fading through
the body. Release begins 200 ms into opening, not after the lid has fully opened.
The shell stays behind the emerging resident until 2.35 s before moving down.
The resident rises fully opaque at its final scale; the local glow sits
behind it rather than washing out its face. Its shared HDR texture is disposed
with the capsule. A local glow and 28 candy-coloured star sparks accompany
opening; no whole-screen strobe, reference-image shell or extra resident is used.

`planet-capsule-ui.css` gives only the arrival screen a lime radial/rainbow arcade
presentation (deep blue/emerald at night). Names stay hidden until opening; text
and the measured 3D stage remain separate. Reduced motion skips rolling, bursting
and spinning, showing the character statically before flight. Hidden tabs pause
the reveal clock. Cancellation, replacement and landing dispose the effect's
owned geometries/materials/texture exactly once. `node tools/check-capsule.mjs`
checks choreography, complete rotation, disposal, no premature reveal, cancellation
and single landing, with phase screenshots. `check-arrival.mjs` checks all 16
species, mobile layouts, night/reduced motion and existing placement behavior.

The move-in studio now stays opaque through model preparation and capsule setup.
`presentResident` acknowledges the first completed render before the controller
removes the loading cover, and starts the reveal clock on that frame. The globe
canvas and home branding stay hidden during capture/build; setup failures restore
the retry dialog without exposing the home. `node tools/check-move-in-transition.mjs`
uses a synthetic webcam and gated builder with the real controller/renderer to
check delayed generation, the pre-render cover, desktop/day and mobile/night
handoffs, successful landing, failure/retry, and cancellation both before and
after capsule setup. It needs the same `PLAYWRIGHT_MODULE`/`REVIEW_URL` setup as
the other browser checks and does not use real photos or existing user storage.

Neon spatial/art regression: `node tools/check-neon-spatial.mjs` verifies full
360° surface-normal alignment (no upright angle clamp), near-plane polygon
clipping before perspective division, horizon-visible crowns with occluded roots,
and a focused resident retained at close/extreme-close camera distances. It
captures the globe, close/grazing views and four individually illustrated sky fish.
The sky uses pearl paper, articulated fish/birds and independently animated
pastel motifs; reduced motion is deterministic. Ground projection paths
are cached while the camera is stationary. The check also reports cached render
CPU time as a diagnostic, not an FPS or device-temperature guarantee.

### Neon walk illustration edition

The mode tabs now select day / night / neon. `planet-neon.ts` is a lazy Canvas 2D
renderer sharing the existing globe camera, resident identities, simulation,
fish, picking/drag controls and arrival timeline. It does not change the basic
edition's meshes, materials or saved resident schema. Neon replaces WebGL draws
instead of compositing an additional full renderer over them; its backing store
is capped at 2× DPR and four million pixels. Shore polygons are clipped once,
vector paths and the 16 portrait drawings are cached. `neon-illustration.ts`
contains the shared character drawing entry point and emergency vector fallback.
`neon-rig-sprites.ts` uses eight-view native-rendered atlases of the exact
`createResidentRig` designs used in the basic editions, not redesigned vectors
or AI replacement characters. `resident-neon-finish.ts` alters materials only;
`tools/bake-neon-residents.mjs` exports 16 WebP atlases and validates unchanged
alpha plus unclipped views. Signed yaw selects views; a continuous lower-body
mesh animates feet/arms while faces remain rigid. Portraits use the same art.
Neon entry waits for loading; no additional in-game WebGL pass is introduced.
`neon-resident-art.ts` and its generated replacement PNGs are archived only.
`neon-scenery.ts` contains
18 individually drawn architectural/botanical prop types; `neon-paint.ts` shares
ink, palette and paint primitives. `neon-scenery-paint.ts` adds shape-local glaze
gradients and finer outlines to scenery only, leaving character art unchanged.
Roofs have scalloped tile engraving, windows have reflected light and botanical
crowns have clipped leaf pillows, tiny foliage and glazed fruit.
World-scale scenery uses bounded 2× art tiles,
switching to the vector original at close range. Ground gardens are projected
on the sphere and cached alongside the shoreline. `neon-surface.ts` supplies
pearly spherical lighting for grass/water, plus a restrained edge glaze. Layered
sand/surf contours replace the old hard coastline; 1,400 equal-area sample points
supply cached world-anchored grass flecks and short water glints, replacing the
screen-wide water stripes. No added texture downloads, filter passes or timers.
`neon-backdrop.ts` caches a
quiet pearl-paper surface with two compact, mirrored feather fans and ghost musical
graphics. `neon-sky-layout.ts` defines separate portrait/landscape compositions
and a large/medium/small hierarchy. `neon-sky-art.ts` loads four transparent illustration
atlases once, preserves aspect ratios, bends fish tails with affine strips, and
animates birds with separate wing layers. `neon-background.ts` composes these
with rising bubbles, bouncing notes, turning flowers and shimmering stars.
No old chromatic plates, moving rings, extra animation loop or WebGL draw pass.
Reduced motion caches one still composition at the existing 4 MP limit.
`planet-neon.css` scopes the expansion palette, retaining existing UI wording.

`node tools/check-neon.mjs` checks 16 distinct drawings, ordered/keyboard tabs,
resident identity preservation, zero concurrent WebGL draws, following, meetings,
320/390 px and landscape layouts, normal and reduced-motion capsule arrivals,
landing and restoring original daylight. It captures roster, world, following,
mobile and capsule-phase screenshots in a temporary directory. Use the same
`PLAYWRIGHT_MODULE` and `REVIEW_URL` environment variables described above.

`node tools/check-neon-art.mjs` captures a scenery contact sheet and the front/back
of all 16 residents. It checks distinct assets and alpha bounds for every one of
the 12 scenery palette variants so cached art cannot cut off leaves or bases.

`node tools/check-neon-background.mjs` captures the isolated animated garden at
1280, 390 and 844 px, plus desktop/mobile in-game views. It verifies opaque,
deterministic reduced-motion output, the resolution budget, four distinct fish,
tail and wing articulation at fixed positions, and an opaque asset-failure
fallback. It also checks the new wing asset, size hierarchy, portrait recomposition,
bubble clusters, and that the archived print plates are never requested.

`node tools/check-neon-resident-art.mjs` checks the native bake manifest's 16
unchanged silhouettes, 128 distinct direction frames, walking, deterministic
stills, portrait caches and zero archived replacement-atlas downloads. It captures
the active roster front/back. `tools/bake-neon-residents.mjs` regenerates the
atlases and revalidates source-model silhouette alpha and frame-edge safety.

`node tools/check-planet-shared-ui.mjs` checks English interface labels, removed
tagline, enlarged logo, smaller slogan and tab/meeting separation in all three
editions at desktop, 390/320 px mobile and landscape widths. Dialogue content
remains Korean per the earlier request; saved custom names are not translated.
Shared visual overrides live in `planet-shared-ui.css` after mode-specific CSS.

### R / project archive

The R die now opens `#archive`; existing `#guestbook` links open the same archive.
`src/archive-projects.ts` owns the Instagram profile and ordered card records.
Add or edit each project title and `instagramUrl` using an individual Instagram
`/p/`, `/reel/` or `/tv/` share URL. Use `preview: true` only for unconnected studies.
The archive contains 29 owner-provided posts. Consecutive records with the same
`group` stay together within a drawer; drawers retain the original 5 × 5 layout and hold at most 25 cards.
Carousel `img_index` values are preserved; share-tracking parameters are removed.
Unconnected cards clearly report their preview state. Connected cards and their
project-index entries open that exact post in a new tab. No access token or
Instagram scraping is used; there is no automatic feed synchronization.

`src/archive-cassette-art.ts` defines 29 stable cassette editions with distinct
reference-led labels, type layouts, shell colors and clear/opaque finishes.
`src/archive-art.ts` supplies matching canvas previews for accessible native links
and the non-WebGL fallback. Historical print-v4/v5 files are retained on disk but
are no longer requested by the archive. Project order and Instagram URLs are unchanged.

`src/archive-cassette.ts` constructs actual cassette geometry: molded front/back
shells with reel and capstan apertures, internal tape packs, six-tooth reel hubs,
metal screws, seam lips, label cutouts and the lower head bridge. Paper labels
are separate textures; the physical reels remain visible through their windows.
Geometry is merged by material per cassette to limit draw calls. Label textures
are cached across pagination. Identical cassette geometry is shared across editions,
with three tape-pack variants; old per-edition materials and glow planes are disposed.
Shared geometry is released with the renderer. Unchanged shadows are reused for
camera-only and webcam-only frames; movement, hover, page changes and context
restoration invalidate the shadow map. Resolution, materials and triangle detail
are unchanged.

`src/archive-product.ts` renders the original 5 × 5 silver cassette case carried
by a white/cyan robot dog. Native Instagram links are projected onto cassette
faces and retain keyboard/new-tab behavior. Hover/focus lifts a cassette; the
immersive view hides surrounding text and UI. Rendering stops when idle/hidden.

`src/archive-robot-dog.ts` constructs a continuous sculpted head/snouted shell,
paw-shaped green optical lenses, cupped upright ears, concealed shoulder
mechanisms, solid moulded limbs and large round paws. The restored robot dog
proportions pair with gently tapered mouse ears attached lower on the upper
sides of the head. Their rounded tips lean outward. Concave ivory inner faces
and thick convex cyan backs meet along one continuous moulded rim. A short rounded club tail mounts on
the rear shell, and the silver lower body follows a curved chest/waist/joint boundary without
an overlapping belly mesh. Both body panels meet on the same ellipsoid. Rounded sockets seat the neck inside head and torso.
A continuous local muzzle profile shapes the nose bridge, rounded muzzle and
lower jaw; the nose, optical inserts and case grip share that surface.
The face has no visible mouth marking; an invisible attachment registers the case handle.
Optical bezels and lenses conform to the head surface; servo caps use flat
seats, inset gaskets and domed covers. Limbs sit inside the joint housings
rather than crossing the exposed cap faces. Ivory and pale cyan clear-coated
plastic preserves the toy robot finish. The dog walks in only after
the shared “COME OUT” button at the bottom center is pressed. All control labels are English. An arrow-oriented cheese wedge, with a light bevel and gold underside, is
the desktop cursor across the archive; there is no separate summon button. The robot
then sits with the case handle held at its mouth. Mouth and handle coordinates
remain aligned during walking and sitting. The case is scaled to 40% of its
original dimensions, with its wide aspect ratio retained. Selecting the case first eases from the stage into the fullscreen overview over 850 ms, preserving the on-screen framing at the viewport change. Closing eases back into the responsive stage before restoring the controls. Reduced motion skips these transitions. The case then runs a 5.8-second sequence: lower it upright, tip it onto
the floor with its lowest corner supported, pause, open the lid, pause again,
and move in for a front-facing cassette close-up. Closing reverses the sequence.
After arrival the camera moves to a straight-on view of the seated dog.
The lid's silver finish and hardware come from `src/archive-case-lid.ts`.
Its cover has a saturated cyan-blue tubular bow, a wrapped centre knot, two
curved tails and four over/under X stitches. The stitches pass through actual
apertures in the outer veneer with recessed chrome eyelets. All ribbon geometry
belongs to the lid pivot and follows its opening motion. Its inner metal liner now carries a fitted black monitor frame and cyan CRT glass; no mountain image
is loaded. `src/archive-monitor.ts` supplies a locally rendered, mirrored webcam
preview with aspect-preserving crop, cyan luminance treatment, subtle scanlines
and curved glass reflections. Clicking the monitor surface starts video and eases into a front-facing monitor close-up. There is no separate camera-enable tab. Escape stops the camera and returns to the cassette close-up.
Closing, exiting, hiding the page or losing WebGL stops the camera tracks; late
permission responses are also stopped. No recording or image upload is used. The superseded insect-car model is retained but no longer imported.

The bottom action reads COME OUT before summoning, ARRIVING… during walking
and sitting (disabled), then OPEN CASE after arrival. The old lower archive label
and RESET VIEW button are removed, along with the lower-left collection caption. Cassette links are inert while
closed or moving. Leaving the page cancels rendering; re-entry returns to the
summon button. Reduced motion skips the walk/sit and opening animations.
The full-width canvas and vertical shadow overscan avoid an internal entrance
crop. In the immersive viewer, the canvas occupies the complete viewport with
no feather mask. The first view fits the whole dog and case. After the lid opens, the second
zoom fits the cassette tray, with room for simple triangular drawer arrows at its sides; the dog stays fully opaque and remains in the scene
throughout the inspection view, including when it is outside the camera framing.
The transparent viewer keeps the original blue home gradient visible.
Drag to rotate; arrow keys rotate, Home resets, and Escape closes the case before
leaving the archive. Header/catalog elements are hidden and inert while viewing.
Cassette edges have a bright core and wider soft blue-white glow, intensified on
hover/focus. A yellow tooltip with black text identifies the active cassette;
native title tooltips are removed from the 3D links to prevent duplicate labels.

`tools/check-archive-dog.mjs` checks the summon/walk/sit sequence, mouth-handle
alignment across 25 poses, original dog head proportions, paw grounding, open-case
clearance, physical case selection, render suspension and navigation during entry.
`tools/check-archive-monitor.mjs` uses a synthetic webcam to check live display,
video-only capture, immersive pagination, mobile layout, camera cleanup, denied
permission and late permission responses. Home pagination remains available for
the project index, including before robot arrival. The same drawer actions become
two simple triangles beside the case in the cassette close-up; they hide during
transitions and monitor inspection, and return home when the case closes. The
page count remains on the home page only.
`tools/check-archive-transition.mjs` samples camera movement through entry and exit,
checks that the stage framing returns without a jump, and covers mobile
interruption and reduced motion.
`tools/check-archive-opening.mjs` checks the front-facing seated view, staged
set-down/open/pause/zoom timing, unchanged background, cassette close-up,
mobile targets and reverse closing.
`tools/check-archive-viewer.mjs` checks 360°/underside cassette containment, desktop/mobile
fullscreen layouts, UI hiding/restoration, absence of the mountain asset,
pagination and native Instagram links.
Run with `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/check-archive-dog.mjs`
(and the corresponding viewer filename). The previous beetle test is a historical
check for the retired model, not an active archive acceptance test.

`src/archive-product.css` styles the canvas, projected links and controls.
`src/archive.css` and `src/archive-skin.css` retain the CSS cabinet as a fallback for
unavailable/lost WebGL. `src/archive-pop.css` supplies the charcoal–blue–light-grey
gradient, centered pale-blue wordmark, colorful beveled geometric controls, black
catalog frame and white poster footer. The gradient and controls are native CSS,
so they remain sharp when enlarged. INDEX scrolls within the archive without changing routes. COME OUT starts
the robot entrance once, and resets when the archive is reopened. The superseded sky stylesheet and generated cloud asset
remain on disk but are no longer imported or requested.
`src/archive-type.css` restores PARANGE and its subtitle at the top center.
BACK TO PLAY, the shared COME OUT/OPEN CASE action, INDEX and the profile link
form the bottom dock with a shared monospaced font, including on mobile.
The smaller title sits slightly lower. Buttons use continuous molded edges and
soft contact shadows; the INDEX triangle has a joined SVG face and sidewall. The closed model is framed
within the space above a reserved bottom control strip.
The redundant new-tab instruction is removed while native links stay unchanged.
It applies the later typography reference: uppercase PARANGE,
off-white Archivo 700/800 headings and IBM Plex Mono 500/600 information labels.
Font files, source URLs and OFL licenses are self-hosted in
`src/assets/archive/fonts/`; no runtime font CDN is needed.
`archive-case-dimensions.ts` is the shared footprint for both case halves.
The retired guestbook modules,
assets and database records are retained, but the R experience no longer imports
or requests them. The archive only loads after navigation.

`node tools/check-archive.mjs` uses the existing `PLAYWRIGHT_MODULE` / `REVIEW_URL`
convention. It checks R and legacy navigation, keyboard/back/forward behaviour,
four viewport sizes, WebGL rendering, cover click and keyboard open/close,
closed-case link protection, 25 compartments, projected click targets,
rotation/reset, hover/focus, render suspension, unavailable-WebGL fallback,
all 29 owner post mappings, project grouping, preserved
carousel slides, absence of guestbook requests, URL validation and escaping,
post links opening in new tabs, and drawer pagination.
Post fixtures exist only in the test browser; Instagram requests are intercepted.

### Cassette close-up fidelity

Archive labels are drawn at 2048 × 1290 with maximum supported anisotropic
filtering. The archive canvas recalculates density for browser zoom, display DPR
changes and mobile pinch zoom, using 2–4× sampling within an 18 MP / 8192 px
budget. Shared linear roughness/bump maps distinguish polished translucent
plastic from textured opaque ABS. Tape packs have volume, non-overlapping fill
levels and fine layers; reel hubs have cut-out vents and integrated spindle teeth.
Reference typography, SEIKO's outlined script lockup, AGFA's spiral mark, AXIA's
circuit lines and writing-label details are authored on the native label canvas.
These remain code-built interpretations of the supplied references.

Run `node tools/check-archive-resolution.mjs` (same `PLAYWRIGHT_MODULE` override
as above) for DPR changes, pinch zoom and buffer limits, and `check-archive.mjs`
for the case and all 29 Instagram destinations.

`tools/check-archive-performance.mjs` records native draw calls, geometry buffer
bytes, CPU submission time, desktop/mobile captures and idle render suspension.
Set `ARCHIVE_PERF_BASELINE` to an earlier report.json to compare images and
confirm unchanged density/shadow resolution. Image comparisons allow only
one channel level at at most 0.001% of pixels for GPU rounding between runs.
This is not a physical device temperature or end-to-end FPS measurement.

Archive zoom retains the same pixel density and cassette surfaces. Scene
matrices are shared by the main and overscan passes; projected
links use those matrices directly. Framing reuses mesh corners until their pose,
geometry bounds or scale changes. Camera-only opening/closing phases reuse the
shadow map. Resize/DPR notifications share one pending drawing-buffer update,
and unchanged dimensions do not reallocate the canvas. The performance check
also samples set-down, lid opening, the pause and advancing close-up frames
against a baseline, with a fixed monitor clock for pixel comparisons. The
resolution check verifies that repeated resize notifications allocate nothing
and a DPR change resizes the drawing buffer only once.

The robot enters on one fixed path at constant speed, with its stride tied to
distance travelled. Its walking head sits lower over a short rounded neck joint;
both sockets follow the shoulder and jaw throughout sitting. Ivory clear-coated
plastic, deeper cyan shells, glossy green optics and polished joint trims follow
the supplied toy-robot material references. The moving leg shells reuse dynamic
vertex buffers instead of creating vertex arrays and indices every frame.

Cassette geometry indexes only bit-identical position/normal/UV combinations,
preserving all triangles and surface detail. Hidden shaders, textures and meshes
are warmed on the actual screen output path before enabling the first action.
Camera distance interpolates proportionally, and the final close-up ease lasts
1.536 seconds; the preceding mechanical beats retain their original durations.
Fullscreen entry preserves the stage's scroll position and restores it before
measuring the return pose, including when opening from a scrolled archive.
An active animation clock caps a dropped frame's advance at 50 ms without
reducing render resolution, and excludes time spent idle or hidden.
`tools/check-archive-refinement.mjs` checks constant measured arrival speed,
compact neck geometry, no shader creation during first walking/opening, dropped
frame handling and bit-exact reconstruction of indexed cassette attributes.

The six green paw lenses retain their original shape and material. Two small
conformal LED layers share one prewarmed shader: a travelling segmented loading
ring from arrival until the first bag opening, a star whose interior fills with
LEDs then briefly switches off on a 1.8-second cycle while open, a heart that
contracts to 70% and expands to 104% with a double beat every 1.4 seconds while
closing, and an occasional 1.8-second smile after a
random 10–26 seconds while open. After closing and returning to the stage, a
farewell smile lasts 2.2 seconds (including its blink), then loading resumes.
Reopening cancels this farewell timer. Each expression
change dims the old LEDs, switches the pattern while dark, then lights the new
pattern over 350 ms. The heart uses a mirrored dot matrix and a separate UV
basis aligned with head-up on each curved lens, without changing the optics.
When only LEDs move, a timer limits rendering to at most 30 fps and sleeps if
the eyes leave the camera view. Mechanical animation retains its RAF cadence.
All LED/smile timers are cancelled when hidden or disposed; reduced-motion mode
uses static patterns without blinking. There are no per-frame texture uploads, extra light
sources or postprocessing passes. The neck retains its size, aims from torso
toward head, and seats each socket tangent to its own shell.
`tools/check-archive-led.mjs` verifies persistent loading, dark switching,
visible motion in each pattern, original optics, bounded idle cadence,
background suspension, reduced motion and neck alignment through 33 poses,
and saves close-up screenshots for the expressions and their motion phases.

The stage header has been removed. The robot is centered above the measured
bottom dock, at the midpoint between the original and enlarged framing sizes.
The Instagram tab uses the lighter Archive Mono 500 face and narrower lettering;
its account spelling and destination remain unchanged. The bow uses slightly
narrower tangent-matched Bezier loops and smooth tails, retaining cord thickness,
material, knot, stitches and mesh subdivision counts.

Archive transforms cache the exact authored matrices until position, quaternion,
scale or pivot changes. Descendant invalidation also covers parent-only world
updates. Unmodified spherical parts share their original vertex/index buffers;
deformed feet and joint shells still own separate copies. The LED shader only
evaluates the currently visible pattern during its binary blink transition.
The full canvas, including shadow overscan, is observed for viewport visibility:
offscreen animation requests sleep and resume without skipping mechanical poses.
Pointer movement no longer raycasts every triangle just to set a cursor that the
archive stylesheet already overrides; click picking remains enabled.

`PLAYWRIGHT_MODULE=... node tools/check-archive-efficiency.mjs` verifies exact
parent/child matrix updates, no hover raycasts, persistent visible LED motion,
offscreen suspension/resume and fullscreen entry/exit. The performance baseline
comparison requires unchanged rendered triangles, pixel density and shadow maps,
less matrix composition and no increase in geometry storage or GPU draw calls.
Capture a fresh baseline before intentional artwork changes such as the bow;
those changes are expected to differ in a pixel comparison.
