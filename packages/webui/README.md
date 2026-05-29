# webui (planned)

Future browser UI for:
- View `findings/*.jsonl` with filter / search
- Manual review/labeling of false-positive findings
- Inspect raw archived sessions(`sessions/<agent>/<date>/<id>.jsonl`)
- Trigger re-extraction when SKILL.md changes

## Status

Not started. Placeholder so that `core` / `cli` interface design considers UI consumption from day one.

## When to start

Triggers:
- `cli` Phase 2 LLM extractor needs human review loop for sampling
- `findings` accumulate to >1000 and grep/jq becomes too clumsy
- Multi-user / multi-machine review workflow needed

## Likely stack(TBD)

- Vite + React + TanStack Query — local-first, reads same `~/Documents/projects/skill-recall-data/` files
- Or Next.js if multi-user / auth becomes a requirement

**Do not start without a concrete workflow problem solved**.
