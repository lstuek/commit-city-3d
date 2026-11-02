# PLAN: Commit City (lstuek.github.io)

Now (2026-11-02): live at https://lstuek.github.io is the test scaffolding only: page shell (#3), data loader and landmark panels (#4), five movement modes (#5), sound (#6), quality governor and benchmark (#14), plus the pilot art kit (#15) and stand-in cyborg and car (#16) in art/. All closed and merged; the last deploy's live check returned 200 for the root and a hashed script. Merging found and fixed two bugs: mode cameras faced away from their target, and movement overwrote the benchmark camera. Unblocked next: #7 (first street block and renderer choice) and #10 (draft the 8 panel lines). #2 (city data, lstuek/lstuek PR #14) waits on Lincoln.

Order: city data, page shell and the first art in parallel; then data, movement, quality and sound; then the first block and Lincoln's first-block review; then the full city; then final polish, the final review, and the profile swap.

## Lincoln queue
- 2026-11-02: fill in landmarks.json on the PC (the 8 keys mapped to your repos; shape in landmarks.example.json in the lstuek repo), then give the go to merge lstuek/lstuek PR #14 (city data, #2).
- 2026-10-29: add the OPENAI_KEY and CODEX_TRIGGER_TOKEN secrets to lstuek/lstuek.github.io (Settings, Secrets and variables, Actions; same values as the lstuek repo), then give the go to merge PR #21 (PR review workflow).
- 2026-10-29: decide how Codex may run here: auto mode blocked full-access Codex workers, so #2 to #14 ran on the Claude code agent instead.
- 2026-10-27: judge the first block in the browser when it is ready (look, hologram symbols, default movement mode, loading bar color, stats bar style, hero art: stand-ins or CC-BY bases you download) and run it once on your iPhone.
- 2026-10-27: approve the 8 landmark panel lines before launch.
