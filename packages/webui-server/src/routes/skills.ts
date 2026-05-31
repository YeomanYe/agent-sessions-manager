// GET /api/skills — 4 starter skill extracted points
// Reads <storage.base_path>/extracted/<name>.json directly.

import { Hono } from "hono"
import * as fs from "fs"
import * as path from "path"
import type { SkillRecallConfig } from "@agent-sessions-manager/core"

export function skillsRoute(config: SkillRecallConfig) {
  const app = new Hono()
  const extractedDir = path.join(config.storage.base_path, "extracted")

  app.get("/", (c) => {
    const enabled = config.registered_skills.filter((s) => s.enabled).map((s) => s.name)
    const skills = enabled.map((name) => {
      const file = path.join(extractedDir, `${name}.json`)
      if (!fs.existsSync(file)) return { name, extracted: null }
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf8"))
        return { name, extracted: data }
      } catch {
        return { name, extracted: null, error: "malformed json" }
      }
    })
    return c.json({ skills })
  })

  app.get("/:name", (c) => {
    const name = c.req.param("name")
    const file = path.join(extractedDir, `${name}.json`)
    if (!fs.existsSync(file)) return c.json({ error: "skill not found" }, 404)
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"))
      return c.json({ name, extracted: data })
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500)
    }
  })

  return app
}
