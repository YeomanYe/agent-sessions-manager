// GET /api/sessions/:id — single session detail
//
// Delegates to agent-sessions-cli subprocess (via core/source/agent-sessions-cli).

import { Hono } from "hono"
import { showSession } from "@agent-sessions-manager/core"

export function sessionsRoute() {
  const app = new Hono()

  app.get("/:id", (c) => {
    const id = c.req.param("id")
    const source = c.req.query("source") ?? "claude"

    try {
      const detail = showSession(id, source)
      return c.json(detail)
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500)
    }
  })

  return app
}
