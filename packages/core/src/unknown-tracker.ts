// Unknown event tracker (SPEC §3.2 卡颂方法核心 KPI)
//
// 记录: 每次 run 看到了多少"未识别"的 event (kind 不在已知 union 内 / 字段不在预期 schema 内)
// 简单实现: 维护一个 known kinds 集合, run 中遇到不在集合的 kind → unknown++
//
// 持久化: 跟 cache 同目录的 unknown-counter.json
//   { "last_run_count": 23, "by_kind": { "newkind": 3 }, "ts": "..." }

import * as fs from "fs"
import * as path from "path"

const KNOWN_KINDS = new Set([
  "user",
  "assistant",
  "tool_call",
  "tool_result",
  "error",
  "meta",
])

export interface UnknownTrackerData {
  last_run_count: number
  by_kind: Record<string, number>
  ts: string
}

export class UnknownTracker {
  private currentCount = 0
  private currentByKind: Record<string, number> = {}
  private previousCount: number | undefined

  constructor(private readonly filePath: string) {
    this.previousCount = this.loadPreviousCount()
  }

  /** 检查一个 event kind, 不在 KNOWN_KINDS 则计为 unknown */
  observe(kind: string | undefined | null): void {
    if (!kind) return
    if (!KNOWN_KINDS.has(kind)) {
      this.currentCount++
      this.currentByKind[kind] = (this.currentByKind[kind] ?? 0) + 1
    }
  }

  getCurrentCount(): number {
    return this.currentCount
  }

  getPreviousCount(): number | undefined {
    return this.previousCount
  }

  getCurrentByKind(): Record<string, number> {
    return { ...this.currentByKind }
  }

  /** 持久化本次 run 的 count, 供下次比对 */
  save(): void {
    const data: UnknownTrackerData = {
      last_run_count: this.currentCount,
      by_kind: this.currentByKind,
      ts: new Date().toISOString(),
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8")
  }

  private loadPreviousCount(): number | undefined {
    if (!fs.existsSync(this.filePath)) return undefined
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as UnknownTrackerData
      return data.last_run_count
    } catch {
      return undefined
    }
  }
}
