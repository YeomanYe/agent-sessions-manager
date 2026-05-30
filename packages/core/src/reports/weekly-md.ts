// Weekly markdown report generator (SPEC §14 + ROADMAP Phase 3)
//
// 读 findings/*.jsonl 聚合 + 输出 markdown.
// 关键设计:
// - 报告头一行: unknown 事件计数 KPI (SPEC §3.2 卡颂方法)
// - 按 skill / type 聚合
// - "建议候选段": 给 experience-summary / unblock-recipes 列候选, 不擅自落盘
// - 不在 webui 之前不做 sparkline / chart

import * as fs from "fs"
import * as path from "path"
import type { Finding, FindingType } from "../types/finding"

interface VerifiedShape extends Finding {
  llm_verdict?: "real-issue" | "false-positive" | "unclear"
  llm_reasoning?: string
  llm_confidence?: number
}

interface ReportInput {
  /** findings/ 目录绝对路径 */
  findingsDir: string
  /** 周报覆盖的开始时间(ISO),默认上周一 00:00 UTC */
  since?: string
  /** 注册的 starter skill 列表(报告头展示) */
  registeredSkills: string[]
  /** 上次报告的 unknown 计数(可选,用于算 ↑↓)*/
  lastUnknownCount?: number
  /** 本次 unknown 计数(由调用方算好传入)*/
  unknownCount?: number
}

interface AggregateBySkill {
  total: number
  byType: Map<FindingType, number>
  fpCount: number          // LLM verify 标 false-positive
  realCount: number        // LLM verify 标 real-issue
  unclearCount: number     // LLM verify 标 unclear
  unverified: number       // 无 llm_verdict 的
  topMissedTriggers: Map<string, number>  // 关键词 → 出现次数(仅 trigger-miss)
}

export interface WeeklyReportResult {
  markdown: string
  filePath?: string
  findingsAnalyzed: number
  filesAnalyzed: string[]
}

/** 生成 weekly report markdown(不写文件,交给调用方决定写哪) */
export function generateWeeklyReport(input: ReportInput): WeeklyReportResult {
  const since = input.since ?? defaultSince()
  const sinceMs = Date.parse(since)
  const { files, findings } = loadFindings(input.findingsDir, sinceMs)

  // Aggregate by skill
  const bySkill = new Map<string, AggregateBySkill>()
  for (const skill of input.registeredSkills) {
    bySkill.set(skill, emptyAgg())
  }
  for (const f of findings) {
    let agg = bySkill.get(f.skill)
    if (!agg) {
      agg = emptyAgg()
      bySkill.set(f.skill, agg)
    }
    agg.total++
    agg.byType.set(f.type, (agg.byType.get(f.type) ?? 0) + 1)

    const v = (f as VerifiedShape).llm_verdict
    if (v === "false-positive") agg.fpCount++
    else if (v === "real-issue") agg.realCount++
    else if (v === "unclear") agg.unclearCount++
    else agg.unverified++

    // Top missed triggers (trigger-miss only, extract from description "短语 \"X\"")
    if (f.type === "trigger-miss") {
      const m = f.description.match(/trigger 短语 "([^"]+)"/)
      if (m) {
        const kw = m[1]
        agg.topMissedTriggers.set(kw, (agg.topMissedTriggers.get(kw) ?? 0) + 1)
      }
    }
  }

  const md = buildMarkdown({
    since,
    registeredSkills: input.registeredSkills,
    bySkill,
    findings,
    unknownCount: input.unknownCount ?? 0,
    lastUnknownCount: input.lastUnknownCount,
    files,
  })

  return {
    markdown: md,
    findingsAnalyzed: findings.length,
    filesAnalyzed: files,
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function emptyAgg(): AggregateBySkill {
  return {
    total: 0,
    byType: new Map(),
    fpCount: 0,
    realCount: 0,
    unclearCount: 0,
    unverified: 0,
    topMissedTriggers: new Map(),
  }
}

function defaultSince(): string {
  // 上周一 00:00 UTC
  const now = new Date()
  const day = now.getUTCDay()  // 0 (Sun) ~ 6 (Sat)
  const daysSinceMonday = day === 0 ? 6 : day - 1
  const lastMonday = new Date(now)
  lastMonday.setUTCDate(now.getUTCDate() - daysSinceMonday - 7)
  lastMonday.setUTCHours(0, 0, 0, 0)
  return lastMonday.toISOString()
}

function loadFindings(
  findingsDir: string,
  sinceMs: number
): { files: string[]; findings: Finding[] } {
  if (!fs.existsSync(findingsDir)) {
    return { files: [], findings: [] }
  }
  const allFiles = fs
    .readdirSync(findingsDir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()

  // 文件名格式: 2026-05-30T02-55-23-944Z.jsonl
  // 转回 ISO 时间筛选
  const eligible = allFiles.filter((f) => {
    const iso = f.replace(".jsonl", "").replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ":$1:$2.$3Z")
    const ms = Date.parse(iso)
    return !Number.isNaN(ms) && ms >= sinceMs
  })

  const findings: Finding[] = []
  for (const file of eligible) {
    const lines = fs.readFileSync(path.join(findingsDir, file), "utf8").split("\n").filter(Boolean)
    for (const ln of lines) {
      try {
        findings.push(JSON.parse(ln) as Finding)
      } catch {
        // skip malformed
      }
    }
  }
  return { files: eligible, findings }
}

interface BuildMdInput {
  since: string
  registeredSkills: string[]
  bySkill: Map<string, AggregateBySkill>
  findings: Finding[]
  unknownCount: number
  lastUnknownCount?: number
  files: string[]
}

function buildMarkdown(input: BuildMdInput): string {
  const { since, registeredSkills, bySkill, findings, unknownCount, lastUnknownCount, files } =
    input

  const weekNum = isoWeekNumber(new Date())
  const totalFP = sum([...bySkill.values()].map((a) => a.fpCount))
  const totalReal = sum([...bySkill.values()].map((a) => a.realCount))
  const totalVerified = totalFP + totalReal + sum([...bySkill.values()].map((a) => a.unclearCount))
  const fpRate = totalVerified > 0 ? Math.round((totalFP / totalVerified) * 100) : 0

  const unknownDelta = formatDelta(unknownCount, lastUnknownCount)

  const lines: string[] = []
  lines.push(`# Skill Recall Report ${weekNum}`)
  lines.push("")
  lines.push(`**Period**: \`${since.slice(0, 10)}\` ~ \`${new Date().toISOString().slice(0, 10)}\``)
  lines.push(`**Unknown events**: ${unknownCount}${unknownDelta}  ← 卡颂方法核心 KPI`)
  lines.push("")
  lines.push("## Summary")
  lines.push("")
  lines.push(`- Registered skills: ${registeredSkills.length} (${registeredSkills.join(" / ")})`)
  lines.push(`- Findings analyzed: ${findings.length} (across ${files.length} file(s))`)
  lines.push(`- LLM verified: ${totalVerified}, false-positive: ${totalFP} (${fpRate}%)`)
  lines.push("")

  // ─── Per-skill section ───────────────────────────────────────────────────
  for (const skill of registeredSkills) {
    const agg = bySkill.get(skill)
    if (!agg || agg.total === 0) {
      lines.push(`## ${skill}`)
      lines.push("")
      lines.push("_No findings this period._")
      lines.push("")
      continue
    }

    lines.push(`## ${skill}`)
    lines.push("")
    lines.push(`Total findings: **${agg.total}**`)
    lines.push("")

    // Breakdown by type
    if (agg.byType.size > 0) {
      lines.push("By type:")
      const sorted = [...agg.byType.entries()].sort((a, b) => b[1] - a[1])
      for (const [t, n] of sorted) {
        lines.push(`- \`${t}\` × ${n}`)
      }
      lines.push("")
    }

    // LLM verdict breakdown
    if (totalVerified > 0) {
      lines.push(
        `LLM verdict: ${agg.realCount} real / ${agg.fpCount} false-positive / ${agg.unclearCount} unclear / ${agg.unverified} unverified`
      )
      lines.push("")
    }

    // Top missed triggers
    if (agg.topMissedTriggers.size > 0) {
      lines.push("Top missed trigger keywords:")
      const top = [...agg.topMissedTriggers.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
      for (const [kw, n] of top) {
        lines.push(`- "${kw}" × ${n}`)
      }
      lines.push("")
    }
  }

  // ─── Suggested actions for human triage ─────────────────────────────────
  lines.push("---")
  lines.push("")
  lines.push("## 待 experience-summary 分诊的候选")
  lines.push("")
  const expCandidates = buildExpSummaryCandidates(bySkill)
  if (expCandidates.length === 0) {
    lines.push("_(本周无新候选)_")
  } else {
    for (const c of expCandidates) lines.push(`- ${c}`)
  }
  lines.push("")
  lines.push("> 工具只列候选, 真触发请在对话里调 `/exp-sum <主题>`.")
  lines.push("")

  lines.push("## 待 unblock-recipes 录入的候选")
  lines.push("")
  const recipeCandidates = buildUnblockCandidates(findings)
  if (recipeCandidates.length === 0) {
    lines.push("_(本周无新候选)_")
  } else {
    for (const c of recipeCandidates) lines.push(`- ${c}`)
  }
  lines.push("")
  lines.push("> 工具只列候选, 真录入请人工触发 unblock-recipes skill.")
  lines.push("")

  // ─── Footer ─────────────────────────────────────────────────────────────
  lines.push("---")
  lines.push("")
  lines.push(`**Source files**: ${files.length === 0 ? "none" : files.map((f) => `\`${f}\``).join(", ")}`)
  lines.push(`**Generated**: ${new Date().toISOString()}`)

  return lines.join("\n")
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0)
}

function formatDelta(current: number, previous?: number): string {
  if (previous === undefined) return ""
  const diff = current - previous
  if (diff === 0) return " (=)"
  if (diff < 0) return ` (↓${Math.abs(diff)})`
  return ` (↑${diff})`
}

function isoWeekNumber(d: Date): string {
  // ISO 8601 week number
  const target = new Date(d)
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`
}

function buildExpSummaryCandidates(bySkill: Map<string, AggregateBySkill>): string[] {
  const out: string[] = []
  for (const [skill, agg] of bySkill) {
    // 高频失败模式 → 建议分诊
    const top = [...agg.byType.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top && top[1] >= 5) {
      out.push(`${skill}: \`${top[0]}\` 出现 ${top[1]} 次 → 建议 \`/exp-sum ${skill} ${top[0]} 该写到哪一层\``)
    }
    // 高 FP rate → 建议改 description
    const totalV = agg.fpCount + agg.realCount + agg.unclearCount
    if (totalV >= 5 && agg.fpCount / totalV > 0.5) {
      out.push(
        `${skill}: FP rate ${Math.round((agg.fpCount / totalV) * 100)}% → 建议 \`/exp-sum 为什么 ${skill} 误触发多, 改 description\``
      )
    }
  }
  return out
}

function buildUnblockCandidates(findings: Finding[]): string[] {
  // 找重复出现的 user_msg_snippet 模式(出现 ≥ 2 次)
  const counts = new Map<string, number>()
  for (const f of findings) {
    const snippet = f.user_msg_snippet
    if (!snippet) continue
    // 取前 40 char 作为 key 模式
    const key = snippet.slice(0, 40).trim()
    if (key.length < 10) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const repeated = [...counts.entries()].filter(([, n]) => n >= 2)
  return repeated
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([snippet, n]) => `"${snippet}..." 在 ${n} 个 finding 重复出现 → 可能是新的卡壳模式`)
}
