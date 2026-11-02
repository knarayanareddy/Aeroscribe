# AeroScribe demo video

The product demo, made of React components and rendered to MP4 with
[Remotion](https://remotion.dev). No After Effects, no screen recording: each
scene is a `.tsx` file in `src/scenes/`, the timeline is a list of frame counts
in `src/timeline.ts`, and the renderer turns that into a file.

```bash
npm install
npm run studio -w @aeroscribe/demo-video    # scrub the timeline in a browser
npm run render -w @aeroscribe/demo-video    # render render/aeroscribe-demo.mp4
```

A render needs a Chromium binary; `npm run render` uses Remotion's own
downloader if you have none, or point it at yours with
`--browser-executable=/path/to/chrome`.

## The scenes

| #   | Scene       | What it claims                                                                    |
| --- | ----------- | --------------------------------------------------------------------------------- |
| 1   | `Title`     | what the product is, with the stage and checkpoint counts read from the catalogue |
| 2   | `Trace`     | one number in the manuscript, traced to its evidence record and artefact hash     |
| 3   | `Pipeline`  | nine stages, the gates they stop at, and how many the recorded run passed         |
| 4   | `Evidence`  | the eleven records of one run, in chain order                                     |
| 5   | `Plan`      | RULE-030: the plan record, the paragraph it rendered, and the check between them  |
| 6   | `Citations` | RULE-032: a structured reference, the AIAA line it produces, the field it omits   |
| 7   | `Figure`    | RULE-033: the mesh study plotted, and the `.dat` file the figure is drawn from    |
| 8   | `Review`    | the council on this run: verdict `revise`, with the finding that caused it        |
| 9   | `Limits`    | the synthetic solver, the missing toolchain, the fixture-only published build     |
| 10  | `Outro`     | where the site and the source are                                                 |

Scenes 8 and 9 are the reason this is a demo of the product rather than a trailer
for it: the run shown did **not** pass. The council asked for revisions, one
paragraph printed a number its plan had not declared, and stage 8 stayed shut —
so the video says so, on screen, next to the numbers it is explaining.

## Where the numbers come from

`src/data.ts` reads `apps/dashboard/src/api/__fixtures__/evidence.json`: the
capture `services/api/test/contract.test.ts` produced from a real pipeline run,
and the same one the dashboard's mapper tests replay against. No scene types a
numeral of its own, and `src/data.test.ts` fails if the capture stops carrying a
record the video needs, if the headline result drifts from the manuscript's, or
if the plan the video shows is not the one the manuscript names in `planRef`.

`src/scenes.test.tsx` renders every scene at its first, middle and last frame
with `remotion` stubbed to a frame counter, then checks that the text on screen
is the record's text — stage 8's blocker strings, the solver label, the headline
result. A scene that throws on missing data fails the suite instead of turning
into a black second in the render.

## Notes for editing

- Everything is a pure function of the frame number (`src/anim.ts`). No CSS
  transitions, no timers, no randomness — that is what lets Remotion render
  frames out of order, in parallel, and still produce the same file twice.
- Scene lengths live in `src/timeline.ts` only; the composition's duration is
  their sum, so the last scene can never be cut short.
- Fonts are the three families the landing page self-hosts, copied into
  `public/fonts/` (Remotion resolves `staticFile()` against `public/`, not
  against `node_modules`).
