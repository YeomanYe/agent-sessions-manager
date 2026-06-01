// /api/reviews — Stage B-1 打标 CRUD
//
//   GET    /api/reviews              所有 review 列表 (Map → array)
//   GET    /api/reviews/:id          单条 review (id = encodeURIComponent finding_id)
//   POST   /api/reviews/:id          创建/更新 review { status, notes? }
//   DELETE /api/reviews/:id          撤销 review

import { Hono } from "hono"
import { ReviewsStore, type SkillRecallConfig } from "@agent-sessions-manager/core"
import type { ReviewStatus } from "@agent-sessions-manager/core"

const VALID_STATUS: ReviewStatus[] = ["correct", "agent-error", "unclear", "triaged"]

export function reviewsRoute(config: SkillRecallConfig) {
  const app = new Hono()
  const store = new ReviewsStore(config.storage.base_path)

  app.get("/", (c) => {
    const all = store.readAll()
    return c.json({ reviews: [...all.values()], count: all.size })
  })

  app.get("/:id", (c) => {
    const id = decodeURIComponent(c.req.param("id"))
    const r = store.read(id)
    if (!r) return c.json({ error: "review not found" }, 404)
    return c.json(r)
  })

  app.post("/:id", async (c) => {
    const id = decodeURIComponent(c.req.param("id"))
    let body: { status?: string; notes?: string; reviewer?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "invalid json body" }, 400)
    }
    if (!body.status || !VALID_STATUS.includes(body.status as ReviewStatus)) {
      return c.json({ error: `invalid status, want one of: ${VALID_STATUS.join(", ")}` }, 400)
    }
    const record = store.upsert(id, {
      status: body.status as ReviewStatus,
      notes: body.notes,
      reviewer: body.reviewer,
    })
    return c.json(record)
  })

  app.delete("/:id", (c) => {
    const id = decodeURIComponent(c.req.param("id"))
    const ok = store.remove(id)
    if (!ok) return c.json({ error: "review not found" }, 404)
    return c.json({ ok: true, removed: id })
  })

  return app
}
