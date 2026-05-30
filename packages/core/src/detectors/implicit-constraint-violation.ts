// Implicit constraint violation detector — 用 LLM extracted 的 implicit_constraints
// 的 detection_hint 字段去 session 里查命中.
//
// SPEC §6.2 — detection_hint 是 LLM 给的伪代码/英文描述如何检测.
//
// Phase 2 实现策略: 两档
//   - 简单模式(本档): 把 detection_hint 当 LLM 二次判定的输入, 一次判一个 (session, constraint)
//                    LLM 输出"是否违反", budget 控制.
//   - 复杂模式(future): 把 detection_hint 编译成代码规则(高门槛, 留 Phase 3+).
//
// 这里做简单模式 — 直接让 LLM 看 constraint + session events, 判断是否违反.

import type { MinimaxClient } from "../llm/minimax-client"
import { parseFencedJson } from "../llm/minimax-client"
import type { SessionDetail } from "../types/session"
import type { LlmExtractedPoints } from "../types/extracted-points"
import type { Finding } from "../types/finding"

const SYSTEM_PROMPT = `你是 Claude Code session 违规检测员. 给你一个 skill 的"隐含约束"和一段 session 摘要,
判断 session 里是否有事件违反这个约束.

输出严格 JSON, 不要其他解释:

{
  "violated": true | false,
  "evidence_event_index": <int 或 -1, 命中的事件 index>,
  "reasoning": "<中文 30 字以内说明>",
  "confidence": <0-1>
}

规则:
- 找不到明确违反的事件 → violated=false
- 不确定 / 上下文不足 → violated=false (倾向保守)
- evidence_event_index 是相对给你看的事件 slice 的 index, 从 0 开始`

interface LlmViolationResp {
  violated?: boolean
  evidence_event_index?: number
  reasoning?: string
  confidence?: number
}

/**
 * 对一个 session + 一个 skill 的所有 implicit constraints 跑检测.
 * 注意: budget 紧时只跑前 N 个 constraints.
 */
export async function detectImplicitViolations(
  session: SessionDetail,
  skillName: string,
  llmPoints: LlmExtractedPoints,
  client: MinimaxClient,
  /** 每个 session 最多跑几条 constraint(防 budget 爆) */
  maxConstraintsPerSession = 3
): Promise<{ findings: Finding[]; calls: number }> {
  const findings: Finding[] = []
  let calls = 0

  // 取前 N 个 constraints (LLM 提取时已按信号强度排序)
  const constraints = llmPoints.implicit_constraints.slice(0, maxConstraintsPerSession)

  // session 摘要: 抓 user/assistant/tool_call 事件, 过滤 meta
  const summary = buildSessionSummary(session)

  for (const c of constraints) {
    if (client.isBudgetExceeded()) break

    try {
      const result = await client.complete<LlmViolationResp>({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: `Skill: ${skillName}
Implicit constraint: ${c.description}
Detection hint: ${c.detection_hint}

Session events (filtered, max 40 lines):
${summary}`,
        maxTokens: 250,
        parse: parseFencedJson,
      })
      calls++

      if (result.data.violated) {
        const eventIdx = result.data.evidence_event_index ?? -1
        const realEvent = eventIdx >= 0 ? session.events[eventIdx] : undefined
        findings.push({
          skill: skillName,
          type: "implicit-constraint-violation",
          severity: "high",
          session_id: session.id,
          source: session.source,
          event_id: realEvent?.id,
          event_index: eventIdx >= 0 ? eventIdx : undefined,
          description: `违反隐含约束: ${c.description}`,
          confidence: typeof result.data.confidence === "number" ? result.data.confidence : 0.7,
          detector: "implicit-constraint-violation",
          detected_at: new Date().toISOString(),
          suggested_action: `${(result.data.reasoning ?? "").slice(0, 80)} — 检查 SKILL.md 是否需要把这条约束加入 Red Flags`,
        })
      }
    } catch {
      // 单条 constraint 失败不阻断其他
    }
  }

  return { findings, calls }
}

function buildSessionSummary(session: SessionDetail): string {
  const lines: string[] = []
  let count = 0
  const MAX = 40
  for (let i = 0; i < session.events.length && count < MAX; i++) {
    const e = session.events[i]
    if (e.kind === "meta") continue
    const text = (e.text ?? "").slice(0, 150).replace(/\n/g, " ")
    lines.push(`[${i}] (${e.kind}) ${text}`)
    count++
  }
  return lines.join("\n")
}
