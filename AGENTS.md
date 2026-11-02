# lstuek.github.io: Commit City

A night cyberpunk city in three.js, built from Lincoln's GitHub activity, hosted on GitHub Pages at https://lstuek.github.io. Decisions: [ref/spec.md](ref/spec.md) (product) and [ref/build.md](ref/build.md) (build and tests). State: [PLAN.md](PLAN.md). Terms: [GLOSSARY.md](GLOSSARY.md). Rules for all of personal: ../../index.md.

gate: `npm run gate`
allow: art/ — Blender sources for owned art: the Python scripts that build each asset, plus its .blend when under 5 MB (no LFS; the script rebuilds larger ones)
Map: read `index.md` first; `node ~/.claude/infra/index.mjs <repo root>` writes it, never edit it by hand.

- This repo is PUBLIC. Never commit a private repo name, a partner detail beyond the 8 landmark lines, a look-reference image, or any paid or store-licensed raw asset. Only CC0 and CC-BY files, each listed in the credits.
- Look references, grill notes and risk research live in Lincoln's local workspace: aios plans/2026-10-27-commit-city (brief.md, refs/, research-risks.md). Read them there; never copy them here.
- The city data comes from the PC job in the lstuek profile repo (personal/projects/lstuek). Its privacy guard is the boundary; change it only through its tests.
- Browser tests run headless only, one browser-test agent at a time, and close their browser. A 3D page is checked with a few still frames, never a long software-GL run. Headless frame times are a regression check only; the 60 fps bar is proven in Lincoln's own browser with the benchmark link.
- Never: Git LFS, a library that needs SharedArrayBuffer, a file from threejspunk.vercel.app, NC, ND or SA licensed assets, fan models of film or game IP.

## Agent skills

### Issue tracker

GitHub Issues on lstuek/lstuek.github.io. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix), plus one realm label per ticket (`code` or `design`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one GLOSSARY.md and docs/adr/ at the repo root. See `docs/agents/domain.md`.
