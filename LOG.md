# LOG: Commit City

## 2026-10-27 Grill, research and spec
- Grill with Lincoln, 6 rounds, then three research passes (free assets, optimization, risks; reports kept local) and a Codex devil's-advocate review of the spec (12 findings taken, 1 dropped; see the spec's review log).
- Local evidence: aios plans/2026-10-27-commit-city (brief.md, research-assets.md, research-optimization.md, research-risks.md, refs/).

## 2026-10-29 Ticket audit
- Codex audited the 12 tickets (verdict revise). Taken: art production owned in new tickets, appearance checks against the look references, strict review gates, renderer test on a representative load, final human review, stable index.html, Pages-by-Actions steps, ledger migration and card retirement fixes. Result: 19 tickets #2-#20.
- Lincoln chose a looping profile clip over a still, and portable Blender 5.2.3 (headless) with the blender-to-web guide kept local.

## 2026-11-02 Code tickets merged
- Merged #22, #24, #25, #26, #27, #28 (tickets #16, #15, #4, #5, #14, #6) after green CI and a local gate on each merge. Merge conflicts in src/main.js and tests/page.mjs resolved by keeping both sides.
- Bugs found while merging: walk, drive, drone and orbit cameras faced away from their target (Object3D rigs; now Cameras, new direction tests); movement overwrote the benchmark camera (movement now pauses during a benchmark, new page check); the movement switch covered the sound Enter button (sound bar pinned top right).
- Removed tracked Blender backups and Python caches from art/.
- Live screenshot: archive/2026-11-02-live-merged/.
