# Roadmap

> 状态标记: ✅ done · 🚧 in progress · 📋 planned · 💭 idea
>
> 最近更新: 2026-06-01(webui Stage B-1 review 状态机 shipped, B-2 pattern 批量打标和 B-3 全维度打标按需推进, Phase 4 detector 仍 next)

---

## Phase 1 — MVP CLI(✅ shipped 2026-05-28)

最低可用版本: 程序化提取关注点 + 1 个 detector + append-only 落盘.

| 组件 | 状态 |
|---|---|
| `core/types/` (config / session / extracted-points / finding) | ✅ |
| `core/loader/` (yaml config + SKILL.md + git hash) | ✅ |
| `core/extractors/static-extractor` (4 维: trigger / Do NOT use / Red Flags / Workflow steps) | ✅ |
| `core/source/agent-sessions-cli` (subprocess wrap + "Launching skill:" 文本识别) | ✅ |
| `core/cache/processed-tracker` (增量 cache) | ✅ |
| `core/storage/session-archiver` (append-only sessions/) | ✅ |
| `core/detectors/trigger-miss` (漏召检测 + 信心度) | ✅ |
| `core/reports/findings-writer` (append-only findings/<ts>.jsonl) | ✅ |
| `cli/index.ts` (commander: `run` / `doctor`) | ✅ |

**实测**: 20 sessions / 4 starter skill / 66 findings written.
**已知 quality 问题**(Phase 2 用 LLM 兜底解决):
- 短词 trigger ("提交"/"research") false-positive 多
- `extractUserMessages` 没完全过滤 `<task-notification>` 系统消息

---

## Phase 2 — LLM 增强(✅ shipped 2026-05-30)

### 目的

1. 用 LLM 提取 SKILL.md 散文里的**隐含约束**(regex 抓不到的)
2. 给程序化 detector 的 unclear / suspect 结果做**二次判定**,过滤 false positive
3. 启用 LLM 兜底 detector(规则没命中但有失败信号时调 LLM 分类)

### 任务清单

| # | 任务 | 估时 |
|---|---|---|
| 2.1 | `core/llm/minimax-client.ts` — MiniMax via Anthropic-compatible API + budget guard | 1 天 |
| 2.2 | `core/extractors/llm-extractor.ts` — 提 implicit_constraints / hidden_anti_patterns / downstream_handoff_required | 1 天 |
| 2.3 | `core/extractors/cache-tracker.ts` — 按 SKILL.md git hash 失效判定 | 0.5 天 |
| 2.4 | `core/detectors/llm-fallback.ts` — 模糊失败信号 → LLM 推断 verdict | 1 天 |
| 2.5 | `core/detectors/implicit-constraint-violation.ts` — 用 LLM extracted hint 检测 | 1 天 |
| 2.6 | `cli/index.ts` 加 `skill-recall extract <skill> [--rerun]` 命令 | 0.5 天 |
| 2.7 | quality fix: extractUserMessages 加 `<task-notification>` / `<observed_from_*>` 过滤 | 0.5 天 |
| 2.8 | quality fix: trigger 短词最小长度 + 高频词黑名单 | 0.5 天 |

### 验收

- LLM extract 跑 4 个 starter skill 输出 implicit_constraints ≥ 2 条/skill
- false positive rate(2.7+2.8 修完后)从当前 ~70% 降到 ≤ 30%(人工抽 20 个 finding 判)
- LLM 单次跑预算 ≤ 100 次,实际 < 50 次(测两周)

### 触发条件 / 死线

- 死线: Phase 1 跑 30 天若 trigger-miss 仍是主导 finding → 立刻进 Phase 2
- 或: 用户主动看 finding 觉得 false positive 太多打断流程

---

## Phase 3 — Weekly report + IM 推送(✅ shipped 2026-05-30)

> **2026-05-30 调换**: 原 Phase 3(8 个 detector)与原 Phase 4(报告)互换位置.
> 理由: Phase 2 LLM 已能在现有 trigger-miss detector 上压住 FP, 先把"数据可视化 + 人能看"做出来比再加 detector 更紧迫.

| # | 任务 | 估时 |
|---|---|---|
| 3.1 | `core/reports/weekly-md.ts` — markdown 模板(SPEC §14 报告样例) | 1 天 |
| 3.2 | `cli/index.ts` 加 `skill-recall report weekly` 命令 | 0.5 天 |
| 3.3 | cc-connect 推 IM(若 CC_SESSION_KEY 非空) | 0.5 天 |
| 3.4 | 接入 auto-cmd 调度(`node-scripts/local/auto-cmd-config.json`)| 0.5 天 ✅ 配置见 [Cron](#cron) |
| 3.5 | unknown 事件计数 KPI(SPEC §3.2 卡颂方法) | 1 天 |
| 3.6 | 报告"建议候选段"(待 experience-summary / unblock-recipes 分诊) | 1 天 |

### 触发条件

- 用户开始定期看周报(每周一固定时间)
- 或 findings ≥ 200 条 jq 查询变慢

### Cron

调度由 `~/Documents/projects/node-scripts/local/auto-cmd-config.json` 驱动(local/ git-ignored,这里只记备忘):

```json
{
  "path": "~/Documents/projects/agent-sessions-manager",
  "cmds": [
    "node --env-file=.env packages/cli/dist/index.js run --limit 50 --use-llm-verify",
    "test $(date +%u) -eq 1 && node --env-file=.env packages/cli/dist/index.js report weekly || echo 'skip weekly (not Monday)'"
  ]
}
```

每天 09:30 / 12:30 / 19:00 / 23:00 跑(跟 auto-cmd 其它 entry 同步), 仅周一额外跑 weekly report + IM 推送.

---

## Phase 4 — 其他 detector(🚧 next,2 周)

按价值从高到低:

| # | Detector | 用途 | 估时 |
|---|---|---|---|
| 4.1 | `false-trigger` | skill 启动但用户原话命中 Do NOT use | 1 天 |
| 4.2 | `wrong-skill` | 调了 A 但用户原话明显是 B 的 trigger | 1 天 |
| 4.3 | `step-skip` | Required Workflow 关键 step 在 events 流没出现 | 1.5 天 |
| 4.4 | `user-aborted` | task_aborted + user_msg "不对/算了/stop" | 1 天 |
| 4.5 | `red-flag-hit` | session 出现 SKILL.md Red Flags 描述的现象 | 1 天 |
| 4.6 | `silent-retry` | skill 跑完用户立刻重复同样意图(短时间窗 user_msg 相似度) | 1 天 |
| 4.7 | `manual-revert` | 24h 内 git revert 了 skill 改的文件(跨 session join) | 2 天 |
| 4.8 | Case 7 失败模式 5 大类分类(`core/detectors/failure-classifier.ts`)| 2 天 |

### 触发条件

- Phase 3 weekly report 跑稳, 用户定期看, 反馈"只有 trigger-miss 不够"
- 或 LLM verify FP rate ≤ 30% 维持 2 周后

---

## Phase 5 — webui

### Stage A — MVP read-only(✅ shipped 2026-05-30)

| # | 组件 | 状态 |
|---|---|---|
| 5A.1 | `packages/webui-server` — Hono local API (:5174) | ✅ /api/findings + /api/sessions/:id + /api/skills + /api/health |
| 5A.2 | `packages/webui` — Vite + React + TanStack Query + Tailwind (:5173) | ✅ |
| 5A.3 | Findings Inspector page | ✅ filter (skill/type/llm_verdict) + 分页 + split-pane 详情 |
| 5A.4 | Session Viewer page | ✅ events timeline + 高亮 event_index ±3 上下文 |
| 5A.5 | Skills Overview page | ✅ 4 starter skill 卡片(static + LLM 提取浏览) |
| 5A.6 | `pnpm dev:webui` 一键启 server+vite | ✅ concurrently |

**实测**:`pnpm build` 4 packages OK / vite build 96 modules 96KB gzip / curl 验证 95 findings 通过 vite proxy 取到.

详细 spec: [`docs/SPEC-webui-stage-a.md`](./docs/SPEC-webui-stage-a.md)

### Stage B-1 — Review 状态机 单 finding 维度(✅ shipped 2026-06-01)

跟 LLM verdict 对齐, 4 个状态 (用户决策 2026-06-01):
- `correct` ≈ LLM false-positive: agent 响应正确, finding 误报
- `agent-error` ≈ LLM real-issue: agent 真错了
- `unclear` ≈ LLM unclear: 信息不够
- `triaged`: 已处理 (改了 SKILL.md / 加错题本)

Shipped 组件:
- core/types/review.ts — ReviewRecord + ReviewStatus union
- core/reviews/store.ts — ReviewsStore (read / readAll / upsert / remove)
- webui-server/routes/reviews.ts — GET/POST/DELETE /api/reviews/:id
- webui-server/routes/findings.ts — join review_status, filter ?review_status=
- webui FindingDetail — 4 radio + notes + save/remove + react-query invalidate
- webui FindingsPage — row 显示 ✓ review badge + 顶部 filter

存储: `~/Documents/projects/skill-recall-data/reviews/<finding_id>.json` (append-only history)
finding_id = `<jsonl-filename>:<line-number>`, filesystem-safe `:` → `__`

实测 E2E:
- POST/GET/DELETE 4 endpoint 全通
- findings API 自动 join `_review_status / _review_notes`
- review_status=agent-error → 1 finding, unreviewed → 94 (数学一致)
- webui build: 316 KB / gzip 99 KB (+6 KB vs Stage A)

### Stage B-2 — pattern 维度批量打标(💭 等 B-1 用一两周后)

跟据 B-1 数据决定是否做. 触发条件: B-1 重复打同款 finding 痛点真实出现.

可能形态:
- pattern_id = hash(skill, type, trigger_keyword)
- 打 FP 时弹"还有 N 条相同 pattern, 一起打 FP?"
- pattern 状态优先级 < 单 finding 状态(用户细调能 override)

### Stage B-3 — 用户发言全维度打标(💭 长期)

跟 B-1/B-2 互补: 不只看 detector 找的, 看**所有** user message → agent 响应对.
能识别 false negative (detector 盲区), 但工作量大. 等 B-1/B-2 跑稳再说.

### Stage C — 时间序列 / 跨周对比(💭 long-term)

- skill FP rate 历史曲线
- SKILL.md git log ↔ FP rate 关联("hat 改 description 后 FP 从 91% 降到 X")
- 跨 starter skill 共同失败模式聚类

### 不会做的事

- 不替代 markdown 报告(report 是给所有人看的,UI 是给重度用户)
- 不做实时监控大盘(超出 skill-recall scope)
- 不做付费 SaaS

### 预估技术栈(到时再定)

- 主选: Vite + React + TanStack Query + shadcn — 本地优先,直接读 `~/Documents/projects/skill-recall-data/`
- 备选: Next.js — 仅当需要 server-side 处理(如批量 LLM 重跑)

---

## Phase 6 — 跨 skill / 跨项目分析(💭 long-term)

观察到的 pattern 升级到**元层**:

- 跨 starter 4 skill 的共同失败模式聚类
- 跨 session 的"项目级 skill 召回率"统计(同一 cwd 下哪些 skill 表现如何)
- 跟 `unblock-recipes` / `experience-summary` 双向数据流(写候选,读结果)

---

## 关键决策记录(DR)

### DR-001 (2026-05-28): 跳过人工标注

**Why**: 卡颂方法的精神就是"agent 看自己日志学",人工标注违背范式.
**How to apply**: Phase 1 直接程序化 + Phase 2 LLM, 不再回头做人工 ground truth.

### DR-002 (2026-05-28): 程序化 + LLM 双路捕获

**Why**: 程序化覆盖 80%,LLM 兜底剩 20% 的隐含语义.
**How to apply**: 所有 detector 优先程序化,LLM 只在 unclear / suspect 时调用.

### DR-003 (2026-05-28): 原始日志 append-only

**Why**: 用户日志是真相,删除 = 失去事后回溯能力.
**How to apply**: `sessions/` 永不编辑/删除,无保留期.

### DR-004 (2026-05-29): 拆出独立 monorepo

**Why**: webui 需要独立 deploy + 独立版本周期,跟 node-scripts CLI 工具集职责不同.
**How to apply**: 本仓库 (`agent-sessions-manager`) 是 source of truth, node-scripts 仅留指向链接.

### DR-005 (2026-05-29): 3 package 占位

**Why**: 提前给 webui 留 `packages/webui/` 目录,避免未来加 webui 重构.
**How to apply**: `core` = 共享业务,`cli` = 命令入口,`webui` = 占位 README.

---

## 不在 roadmap 的事(❌ 不会做)

- 自动 PR 草稿改 SKILL.md → 工具只输出报告,SKILL 修改始终人工触发(SPEC §1)
- 自动喂候选直接落 unblock-recipes / experience-summary → 报告里列候选,人工触发
- 回归 fixture 跑 skill-behavior-test → 移到 SPEC §19 已废弃
- 多模态分析(截图 / 视频)→ 超出 scope
- 付费 SaaS / 多租户 → 个人工具
