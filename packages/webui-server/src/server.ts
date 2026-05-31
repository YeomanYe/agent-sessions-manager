// webui-server — Hono local server feeding the webui (read-only)
//
// SPEC: docs/SPEC-webui-stage-a.md §3-4
//
// Endpoints:
//   GET /api/findings           list + filter + paginate
//   GET /api/findings/:id       single finding (id = source_file:line)
//   GET /api/sessions/:id       session detail (via agent-sessions-cli)
//   GET /api/skills             4 starter skill extracted points
//   GET /api/health             readiness

import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import * as fs from "fs"
import * as path from "path"
import {
  loadConfig,
  setCliBinOverride,
  showSession,
} from "@agent-sessions-manager/core"
import { findingsRoute } from "./routes/findings"
import { sessionsRoute } from "./routes/sessions"
import { skillsRoute } from "./routes/skills"

const PORT = Number(process.env.WEBUI_SERVER_PORT ?? 5174)

const config = loadConfig()
setCliBinOverride(config.agent_sessions_cli_path)

const app = new Hono()

// CORS for vite dev server on :5173
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  })
)

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    config: {
      storage_base: config.storage.base_path,
      registered_skills: config.registered_skills.filter((s) => s.enabled).map((s) => s.name),
    },
  })
)

app.route("/api/findings", findingsRoute(config))
app.route("/api/sessions", sessionsRoute())
app.route("/api/skills", skillsRoute(config))

app.notFound((c) => c.json({ error: "not found", path: c.req.path }, 404))

serve({ fetch: app.fetch, port: PORT }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`[webui-server] listening on http://localhost:${info.port}`)
  // eslint-disable-next-line no-console
  console.log(`[webui-server] storage: ${config.storage.base_path}`)
})
