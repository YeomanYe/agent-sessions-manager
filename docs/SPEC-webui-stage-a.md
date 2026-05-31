# SPEC: webui Stage A (MVP, read-only)

> **状态**: 待实现
> **创建**: 2026-05-30
> **关联**: ROADMAP Phase 5 / Stage A
>
> **范围**: 只读浏览 findings + sessions + extracted skill points. **不含 review 状态机**(Stage B).

---

## 1. 目的

替代 `jq` 翻 `findings/*.jsonl` 的体力活. 让人能:
- 用 filter 找特定 finding(skill / type / LLM verdict)
- 点 finding 跳到对应 session,高亮 event_index 上下文
- 浏览 4 个 starter skill 的提取关注点(静态 + LLM)

## 2. 不做的事(留 Stage B+)

- ❌ 人工打标(confirmed / dismissed / triaged)
- ❌ LLM verdict 推翻
- ❌ 时间序列 FP rate 曲线
- ❌ 多人 / auth
- ❌ 部署到远程(只本地 localhost)

## 3. 架构

```
浏览器 (Vite, :5173)
       │
       │ fetch /api/*
       ▼
Hono server (:5174)
       │
       │ 复用 @agent-sessions-manager/core
       ▼
~/Documents/projects/skill-recall-data/
  ├── findings/*.jsonl      (read)
  ├── sessions/*/...        (read via agent-sessions-cli)
  └── extracted/*.json      (read)
```

**关键**: server 跟 webui 分两个 port(:5174 server + :5173 vite dev), webui 用 vite proxy 转 `/api/*` 到 server. 生产打包后可单文件 binary(以后).

## 4. API 接口(3 个 endpoint, 全部 GET)

### 4.1 `GET /api/findings`

Query params:
- `skill?: string` — 过滤 skill 名
- `type?: string` — 过滤 finding.type
- `llm_verdict?: 'real-issue' | 'false-positive' | 'unclear' | 'unverified'` — 过滤 LLM 判定
- `since?: string` (ISO) — 时间过滤(基于 detected_at)
- `limit?: number` (default 50)
- `offset?: number` (default 0)

Response:
```json
{
  "total": 95,
  "offset": 0,
  "limit": 50,
  "findings": [ Finding[], 见 core/types/finding ]
}
```

### 4.2 `GET /api/sessions/:id`

Path param: `:id` (session id)
Query: `?source=claude` (必须, agent-sessions-cli 需要)

Response: 完整 SessionDetail (含 events).

### 4.3 `GET /api/skills`

无 query.

Response:
```json
{
  "skills": [
    {
      "name": "hat",
      "extracted": { static: {...}, llm: {...} }  // ExtractedPoints
    }
  ]
}
```

(从 `~/Documents/projects/skill-recall-data/extracted/*.json` 直接读)

## 5. 前端路由(3 个页面)

| Path | 组件 | 内容 |
|---|---|---|
| `/` | FindingsPage | 默认页, filter + 列表 + 右侧详情 split-pane |
| `/sessions/:id` | SessionPage | events timeline, 可带 `?highlight=<event_index>` |
| `/skills` | SkillsPage | 4 个 starter skill 卡片浏览 |

## 6. UI 关键决策

- **filter 用 URL query string** — 可分享 / 可前进后退
- **列表分页 50 条** — 简单, 不上虚拟列表
- **详情面板** — 列表右侧 split, 点 finding 显示完整 JSON + LLM reasoning + jump-to-session 按钮
- **session events** — 简单纵向列表, 高亮 event_index ±3 上下文
- **不做 dark mode**(MVP 不必)

## 7. 技术栈最小集

| 用途 | 选择 |
|---|---|
| 构建 | Vite |
| 框架 | React 19 |
| 路由 | React Router 7 |
| UI 库 | shadcn/ui (Radix + Tailwind) |
| Data fetching | TanStack Query (server state) |
| Server | Hono |
| 类型 | 复用 `@agent-sessions-manager/core` 的 Finding / SessionDetail / ExtractedPoints |

## 8. 启动命令

```bash
# 单独跑 server
pnpm --filter @agent-sessions-manager/webui-server dev   # :5174

# 单独跑 webui
pnpm --filter @agent-sessions-manager/webui dev          # :5173

# 一起跑(根命令)
pnpm dev:webui   # 用 concurrently 同时启
```

## 9. 验收

- [ ] 浏览器打开 http://localhost:5173 看到 findings 列表
- [ ] filter 选 hat + llm_verdict=false-positive, 列表正确缩减
- [ ] 点一条 finding,右侧详情显示完整字段
- [ ] 点 "jump to session", 跳到 `/sessions/:id?highlight=N`, event N 被高亮
- [ ] `/skills` 看到 4 个 starter skill 的 trigger / Red Flags / implicit_constraints

## 10. 不在 Stage A 但 Stage B 要做

- POST /api/reviews/:finding_id — review 状态机
- `~/Documents/projects/skill-recall-data/reviews/` append-only 持久化
- webui findings 列表加 status filter + 一键打标按钮
