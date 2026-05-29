# agent-sessions-manager

Agent session log analyzer + skill recall tuning toolkit.

## Status

- ✅ `packages/cli` — `skill-recall` CLI (Phase 1 MVP shipped 2026-05-28)
- ✅ `packages/core` — shared business logic (types / loader / extractor / detector)
- 📋 `packages/webui` — planned (browser UI for log review + manual labeling)

## Quick Start

```bash
pnpm install
pnpm build

# Copy config + edit
cp packages/cli/config-example.yaml local/skill-recall-config.yaml

# Set env (do NOT commit)
echo "MINIMAX_API_KEY=" >> .env  # 手填真 key 到 .env

# Health check
pnpm doctor

# Incremental run (default)
pnpm --filter @agent-sessions-manager/cli skill-recall run --limit 20
```

## Architecture

```
agent-sessions-manager/
├── packages/
│   ├── core/          # 共享: types / loader / extractor / detector / source / cache / storage
│   ├── cli/           # commander CLI (skill-recall command)
│   └── webui/         # (planned) browser UI
├── docs/
│   └── SPEC-skill-recall.md
└── local/             # git-ignored, 配置 + secrets
```

数据目录 `~/Documents/projects/skill-recall-data/` 是 **append-only**, 永不编辑/删除(SPEC §3.8)。

## Source of Truth

- [`ROADMAP.md`](./ROADMAP.md) — 当前进度 + 下一步 + 决策记录(DR)
- [`docs/SPEC-skill-recall.md`](./docs/SPEC-skill-recall.md) — 完整 spec

## Why this repo (not in `node-scripts`)

Phase 1 MVP was in `node-scripts/src/skill-recall/` (commit `a2c98cb`).
Spun out 2026-05-29 because:
- Future webui needs separate deploy target
- Monorepo lets `cli` + `webui` share `core` logic
- Independent versioning + release cycle
