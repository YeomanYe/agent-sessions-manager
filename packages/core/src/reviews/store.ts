// Reviews store — 单文件一份 review (~/Documents/projects/skill-recall-data/reviews/<finding_id>.json)
//
// 注: finding_id 含 ":", filesystem-safe 转成 "__" 写文件名.
//   "2026-05-30T07-41-58-948Z.jsonl:0" → "2026-05-30T07-41-58-948Z.jsonl__0.json"

import * as fs from "fs"
import * as path from "path"
import type {
  ReviewRecord,
  ReviewStatus,
  ReviewHistoryEntry,
} from "../types/review"

const DEFAULT_REVIEWER = "local"

export class ReviewsStore {
  private dir: string

  constructor(basePath: string) {
    this.dir = path.join(basePath, "reviews")
  }

  private safeName(findingId: string): string {
    return findingId.replace(/:/g, "__") + ".json"
  }

  private filePath(findingId: string): string {
    return path.join(this.dir, this.safeName(findingId))
  }

  /** 读单条 review, 不存在返回 undefined */
  read(findingId: string): ReviewRecord | undefined {
    const file = this.filePath(findingId)
    if (!fs.existsSync(file)) return undefined
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as ReviewRecord
    } catch {
      return undefined
    }
  }

  /** 读全部 review (Map<finding_id, ReviewRecord>) — 给 findings list join 用 */
  readAll(): Map<string, ReviewRecord> {
    const out = new Map<string, ReviewRecord>()
    if (!fs.existsSync(this.dir)) return out
    const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json"))
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf8")) as ReviewRecord
        if (data.finding_id) out.set(data.finding_id, data)
      } catch {
        // skip malformed
      }
    }
    return out
  }

  /**
   * 写/更新 review.
   * - 不存在: 创建, history 含初始 entry
   * - 已存在: 更新 status/notes/reviewed_at, append history
   */
  upsert(
    findingId: string,
    input: { status: ReviewStatus; notes?: string; reviewer?: string }
  ): ReviewRecord {
    fs.mkdirSync(this.dir, { recursive: true })
    const now = new Date().toISOString()
    const reviewer = input.reviewer ?? DEFAULT_REVIEWER
    const existing = this.read(findingId)
    const entry: ReviewHistoryEntry = {
      status: input.status,
      ts: now,
      notes: input.notes,
    }
    const record: ReviewRecord = existing
      ? {
          ...existing,
          status: input.status,
          notes: input.notes,
          reviewed_at: now,
          reviewer,
          history: [...existing.history, entry],
        }
      : {
          finding_id: findingId,
          status: input.status,
          reviewed_at: now,
          reviewer,
          notes: input.notes,
          history: [entry],
        }
    fs.writeFileSync(this.filePath(findingId), JSON.stringify(record, null, 2), "utf8")
    return record
  }

  /** 删除单条 review (撤销人工打标) */
  remove(findingId: string): boolean {
    const file = this.filePath(findingId)
    if (!fs.existsSync(file)) return false
    fs.unlinkSync(file)
    return true
  }
}
