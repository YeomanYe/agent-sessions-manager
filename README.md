# agent-sessions-manager

Agent session log analyzer + skill recall tuning toolkit.

## Status

- ✅ `packages/cli` — `skill-recall` CLI (Phase 1 MVP / Phase 2 LLM / Phase 3 weekly report — shipped)
- ✅ `packages/core` — shared business logic (types / loader / extractor / detector / LLM)
- 📋 `packages/webui` — planned (browser UI for log review + manual labeling)

---

## Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│  agent-sessions-manager (this repo)                          │
│                                                              │
│  packages/cli  (TypeScript / Node 20+)                       │
│       │                                                      │
│       └─► packages/core ─► @anthropic-ai/sdk → MiniMax LLM   │
│                            │                                 │
│                            └─► subprocess ──┐                │
└──────────────────────────────────────────────┼──────────────┘
                                               │
                                               ▼
                ┌────────────────────────────────────────────┐
                │  vendor/agent-sessions-cli  (git submodule)│
                │  Python 3.10+ / venv at vendor/.../.venv    │
                │  Parses 7 agents' jsonl → unified JSON      │
                │    Codex / Claude Code / Gemini / Copilot   │
                │    Droid / OpenCode / OpenClaw              │
                └────────────────────────────────────────────┘
                                               │
                                               ▼
                ┌────────────────────────────────────────────┐
                │  ~/.claude/* + ~/.codex/* + ...             │
                │  (agent session jsonl files,                │
                │   read-only consumption)                    │
                └────────────────────────────────────────────┘
```

### Required (auto-installed by `pnpm setup`)

- **Node.js 20+** (for ES modules + `--env-file` flag)
- **Python 3.10+** (for `vendor/agent-sessions-cli`)
- **pnpm** (monorepo)
- **git** (with submodule support)

### Optional

- **MiniMax API key** (for Phase 2 LLM extract/verify). Set in `.env`.
- **cc-connect** (for IM push). Set `CC_SESSION_KEY` env when running.

---

## Quick Start (fresh clone)

```bash
# 1. Clone with submodules
git clone --recursive git@github.com:YeomanYe/agent-sessions-manager.git
cd agent-sessions-manager

# (or if you already cloned without --recursive:)
git submodule update --init --recursive

# 2. One-shot setup (Python venv + pip install vendor/agent-sessions-cli)
pnpm setup

# 3. Install Node deps + build
pnpm install
pnpm build

# 4. Configure
cp packages/cli/config-example.yaml local/skill-recall-config.yaml
echo "MINIMAX_API_KEY=sk-xxxxx" >> .env   # 真 key, 永不 commit

# 5. Health check
pnpm doctor

# 6. First run
node --env-file=.env packages/cli/dist/index.js run --limit 20
```

---

## Daily Use

```bash
# Incremental analysis (default)
node --env-file=.env packages/cli/dist/index.js run

# Full rebuild (re-analyze all sessions)
node --env-file=.env packages/cli/dist/index.js run --full

# LLM-enhanced (Phase 2)
node --env-file=.env packages/cli/dist/index.js run --use-llm-extract --use-llm-verify

# Extract one skill's LLM points
node --env-file=.env packages/cli/dist/index.js extract hat

# Weekly markdown report + IM push (Phase 3)
node --env-file=.env packages/cli/dist/index.js report weekly

# Health check
pnpm doctor
```

---

## Architecture

```
agent-sessions-manager/
├── packages/
│   ├── core/             # 共享业务: types / loader / extractor / detector / source / llm / reports
│   ├── cli/              # commander CLI (skill-recall command)
│   └── webui/            # (planned) browser UI
├── vendor/
│   └── agent-sessions-cli/  # git submodule (Python, parses agent jsonl)
├── scripts/
│   └── setup.sh          # one-shot Python venv + pip install
├── docs/
│   └── SPEC-skill-recall.md
├── ROADMAP.md
├── .env.example          # MINIMAX_API_KEY 等 secret 占位
└── local/                # git-ignored, 真 config
```

数据目录 `~/Documents/projects/skill-recall-data/` 是 **append-only**, 永不编辑/删除(SPEC §3.8).

---

## CLI binary 路径解析(三层)

`packages/core/source/agent-sessions-cli.ts` 按以下优先级找 `agent-sessions` binary:

1. **env `AGENT_SESSIONS_CLI_BIN`** — 显式覆盖 (debug / CI 用)
2. **config `agent_sessions_cli_path`** — local/skill-recall-config.yaml 显式指定
3. **vendor/ 自动探测** — `<repo-root>/vendor/agent-sessions-cli/.venv/bin/agent-sessions` (默认安装位置)
4. **PATH fallback** — `agent-sessions` (用户已全局 activate venv 时)

跑 `pnpm doctor` 会显示**实际找到的 bin 路径** + 版本号.

---

## Source of Truth

- [`ROADMAP.md`](./ROADMAP.md) — 当前进度 + Phase 列表 + 决策记录(DR)
- [`docs/SPEC-skill-recall.md`](./docs/SPEC-skill-recall.md) — 完整 spec

---

## Troubleshooting

### `doctor` 报 "agent-sessions-cli --version failed"

```bash
pnpm setup   # 重跑 setup,会重建 venv 重装
```

### Python 3.10 没有

```bash
# macOS
brew install python@3.12

# 或下载 https://www.python.org/downloads/
```

### submodule 更新

```bash
# 拉 vendor/agent-sessions-cli 上游最新
git submodule update --remote vendor/agent-sessions-cli

# 重新 pip install (上游可能改了 deps)
cd vendor/agent-sessions-cli && .venv/bin/pip install -e . --upgrade
```

### 切换到自定义 agent-sessions-cli 路径(开发用)

```bash
# 临时
AGENT_SESSIONS_CLI_BIN=/path/to/my-cli pnpm doctor

# 或在 local/skill-recall-config.yaml 顶部加
agent_sessions_cli_path: /path/to/my-cli
```

### LLM 调用失败 (MiniMax key 没设)

```bash
# .env 文件没写 / Node 没 --env-file=.env 启动
echo "MINIMAX_API_KEY=sk-xxxxx" >> .env
node --env-file=.env packages/cli/dist/index.js doctor
```

---

## Why this repo (not in `node-scripts`)

Phase 1 MVP was in `node-scripts/src/skill-recall/` (commit `a2c98cb`).
Spun out 2026-05-29 because:

- Future webui needs separate deploy target
- Monorepo lets `cli` + `webui` share `core` logic
- Independent versioning + release cycle
- vendor 子模块隔离 agent-sessions-cli 版本控制
