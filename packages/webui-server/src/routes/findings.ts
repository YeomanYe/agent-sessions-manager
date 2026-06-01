// GET /api/findings — list + filter + paginate
//
// Findings live in <storage.base_path>/findings/<timestamp>.jsonl (append-only).
// We aggregate across all files; each line is one Finding (JSON).
// id = "<filename>:<line_number>" so the webui can request a single one.

import { Hono } from "hono"
import * as fs from "fs"
import * as path from "path"
import {
  ReviewsStore,
  type SkillRecallConfig,
  type Finding,
  type ReviewStatus,
} from "@agent-sessions-manager/core"

interface IdentifiedFinding extends Finding {
  /** synthetic id: "<filename>:<line>" */
  _id: string
  /** source jsonl filename */
  _file: string
  /** review status if user has triaged */
  _review_status?: ReviewStatus
  _review_notes?: string
}

export function findingsRoute(config: SkillRecallConfig) {
  const app = new Hono()
  const findingsDir = path.join(config.storage.base_path, "findings")
  const reviewsStore = new ReviewsStore(config.storage.base_path)

  app.get("/", (c) => {
    const skill = c.req.query("skill")
    const type = c.req.query("type")
    const llmVerdict = c.req.query("llm_verdict")
    const reviewStatus = c.req.query("review_status")  // "unreviewed" | "reviewed" | <ReviewStatus>
    const since = c.req.query("since")
    const limit = Number(c.req.query("limit") ?? 50)
    const offset = Number(c.req.query("offset") ?? 0)

    const all = loadAllFindings(findingsDir)
    const reviews = reviewsStore.readAll()

    // Join review status to each finding
    for (const f of all) {
      const r = reviews.get(f._id)
      if (r) {
        f._review_status = r.status
        f._review_notes = r.notes
      }
    }

    let filtered = all
    if (skill) filtered = filtered.filter((f) => f.skill === skill)
    if (type) filtered = filtered.filter((f) => f.type === type)
    if (llmVerdict) {
      filtered = filtered.filter((f) => {
        const v = (f as { llm_verdict?: string }).llm_verdict
        if (llmVerdict === "unverified") return !v
        return v === llmVerdict
      })
    }
    if (reviewStatus) {
      filtered = filtered.filter((f) => {
        if (reviewStatus === "unreviewed") return !f._review_status
        if (reviewStatus === "reviewed") return !!f._review_status
        return f._review_status === reviewStatus
      })
    }
    if (since) {
      const sinceMs = Date.parse(since)
      filtered = filtered.filter((f) => Date.parse(f.detected_at) >= sinceMs)
    }

    const sorted = filtered.sort(
      (a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at)
    )

    const total = sorted.length
    const page = sorted.slice(offset, offset + limit)

    return c.json({
      total,
      offset,
      limit,
      findings: page,
    })
  })

  app.get("/:id", (c) => {
    const id = c.req.param("id")
    const [filename, lineStr] = id.split(":")
    if (!filename || !lineStr) return c.json({ error: "invalid id" }, 400)

    const file = path.join(findingsDir, filename)
    if (!fs.existsSync(file)) return c.json({ error: "file not found" }, 404)

    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean)
    const idx = Number(lineStr)
    if (Number.isNaN(idx) || idx < 0 || idx >= lines.length) {
      return c.json({ error: "line out of range" }, 404)
    }

    try {
      const finding = JSON.parse(lines[idx])
      const review = reviewsStore.read(id)
      return c.json({
        ...finding,
        _id: id,
        _file: filename,
        _review_status: review?.status,
        _review_notes: review?.notes,
      })
    } catch {
      return c.json({ error: "malformed jsonl line" }, 500)
    }
  })

  // 派生 listings: 用于 filter 下拉
  app.get("/_/facets", (c) => {
    const all = loadAllFindings(findingsDir)
    const skills = unique(all.map((f) => f.skill))
    const types = unique(all.map((f) => f.type))
    const verdicts = unique(
      all
        .map((f) => (f as { llm_verdict?: string }).llm_verdict)
        .filter((v): v is string => !!v)
    )
    return c.json({ skills, types, llm_verdicts: [...verdicts, "unverified"] })
  })

  return app
}

function loadAllFindings(dir: string): IdentifiedFinding[] {
  if (!fs.existsSync(dir)) return []
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
  const out: IdentifiedFinding[] = []
  for (const file of files) {
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n").filter(Boolean)
    for (let i = 0; i < lines.length; i++) {
      try {
        const f = JSON.parse(lines[i]) as Finding
        out.push({ ...f, _id: `${file}:${i}`, _file: file })
      } catch {
        // skip malformed
      }
    }
  }
  return out
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}
