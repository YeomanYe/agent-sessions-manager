# Roadmap

> 状态标记: ✅ done · 🚧 in progress · 📋 planned · 💭 idea
>
> 最近更新: 2026-05-30

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

## Phase 2 — LLM 增强(🚧 next,目标 1-2 周)

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

## Phase 3 — 其他 detector(📋 Phase 2 见效后,2 周)

按价值从高到低:

| # | Detector | 用途 | 估时 |
|---|---|---|---|
| 3.1 | `false-trigger` | skill 启动但用户原话命中 Do NOT use | 1 天 |
| 3.2 | `wrong-skill` | 调了 A 但用户原话明显是 B 的 trigger | 1 天 |
| 3.3 | `step-skip` | Required Workflow 关键 step 在 events 流没出现 | 1.5 天 |
| 3.4 | `user-aborted` | task_aborted + user_msg "不对/算了/stop" | 1 天 |
| 3.5 | `red-flag-hit` | session 出现 SKILL.md Red Flags 描述的现象 | 1 天 |
| 3.6 | `silent-retry` | skill 跑完用户立刻重复同样意图(短时间窗 user_msg 相似度) | 1 天 |
| 3.7 | `manual-revert` | 24h 内 git revert 了 skill 改的文件(跨 session join) | 2 天 |
| 3.8 | Case 7 失败模式 5 大类分类(`core/detectors/failure-classifier.ts`)| 2 天 |

### 触发条件

- Phase 2 LLM 跑稳(false positive rate ≤ 30% 维持 2 周)
- 单纯 trigger-miss 不再产生新洞察

---

## Phase 4 — Weekly report + IM 推送(📋 Phase 3 进行中可并行,1 周)

| # | 任务 | 估时 |
|---|---|---|
| 4.1 | `core/reports/weekly-md.ts` — markdown 模板(SPEC §14 报告样例) | 1 天 |
| 4.2 | `cli/index.ts` 加 `skill-recall report weekly` 命令 | 0.5 天 |
| 4.3 | cc-connect 推 IM(若 CC_SESSION_KEY 非空) | 0.5 天 |
| 4.4 | 接入 auto-cmd 调度(`node-scripts/local/auto-cmd-config.json`)| 0.5 天 |
| 4.5 | unknown 事件计数 KPI(SPEC §3.2 卡颂方法) | 1 天 |
| 4.6 | 报告"建议候选段"(待 experience-summary / unblock-recipes 分诊) | 1 天 |

### 触发条件

- 用户开始定期看周报(每周一固定时间)
- 或 findings ≥ 200 条 jq 查询变慢

---

## Phase 5 — webui(💭 future)

**不开始的现状**: Phase 1-4 用 markdown + grep + jq 处理足够.

### 启动触发条件(任一即可)

1. `findings/*.jsonl` 累积 > 1000 行,grep/jq 翻找不便
2. Phase 2 LLM 提取需要**人工 review 抽样**(校验幻觉)
3. 多人 / 多机器协作 review 出现
4. 想做"标记某 finding 为已处理 / false positive / 已沉淀"等状态机

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
