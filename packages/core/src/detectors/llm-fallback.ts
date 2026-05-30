// LLM fallback detector — 对程序化 detector 标 unclear/suspect 的 finding 跑 LLM 二次判定
//
// SPEC §7.2 — 触发条件:
//   1. 用户在 skill 后说了点什么但 regex 没命中明确否决词
//   2. session 持续 ≥30 分钟但没 commit / 没 task_complete
//   3. 同一 skill 在同一 session 被调了 ≥2 次
//
// 这里实现"对已有 finding 做二次判定"模式:
//   - 输入: 程序化 detector 产出的 finding(可能含 FP)
//   - 输出: LLM 判定后的修正 finding(标记 verdict, 信心度调整)

import type { MinimaxClient } from "../llm/minimax-client"
import { parseFencedJson } from "../llm/minimax-client"
import type { SessionDetail, SessionEvent } from "../types/session"
import type { Finding } from "../types/finding"

const SYSTEM_PROMPT = `你是 Claude Code session 分析专家. 给你一个**疑似 skill 召回问题**, 判断是真问题还是误报.

输出严格 JSON, 不要其他解释:

{
  "verdict": "real-issue" | "false-positive" | "unclear",
  "reasoning": "<中文 30 字以内, 说明判断理由>",
  "confidence": <0-1 浮点, 你对 verdict 的信心>
}

判断标准:
- 用户原话是不是真的在表达"该用某 skill"的意图? 还是路由到别的 skill 才对?
- 用户后续是否表现出"没用上想要的能力"的信号?
- 系统消息 / 工具反馈 / 历史 context 是不是不该被当成"用户原话"?
- 如果原话同时命中多个 skill 的 trigger, 选哪个更合适?

verdict 选择:
- real-issue: 确实漏召/误召, 这个 finding 该保留
- false-positive: 工具误判, 实际路由正确或原话不是真用户意图
- unclear: 上下文不足无法判断`

interface LlmVerdict {
  verdict?: "real-issue" | "false-positive" | "unclear"
  reasoning?: string
  confidence?: number
}

export interface VerifiedFinding extends Finding {
  llm_verdict: "real-issue" | "false-positive" | "unclear"
  llm_reasoning: string
  llm_confidence: number
}

/**
 * 用 LLM 对一批 finding 做二次判定.
 * 返回 (verified findings, llm calls made).
 *
 * 调用前会 check budget; budget 用完后剩余 finding 不动(原样返回, 不带 verdict).
 */
export async function verifyFindingsWithLlm(
  findings: Finding[],
  sessionsById: Map<string, SessionDetail>,
  client: MinimaxClient
): Promise<{ verified: Array<Finding | VerifiedFinding>; calls: number }> {
  const verified: Array<Finding | VerifiedFinding> = []
  let calls = 0

  for (const f of findings) {
    if (client.isBudgetExceeded()) {
      // Budget 用完, 剩余 finding 不跑 LLM, 原样保留
      verified.push(f)
      continue
    }

    const session = sessionsById.get(f.session_id)
    if (!session) {
      verified.push(f)
      continue
    }

    try {
      const context = buildSessionContext(session, f.event_index ?? 0)
      const result = await client.complete<LlmVerdict>({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: `Skill: ${f.skill}
Detector type: ${f.type}
Description: ${f.description}
User msg snippet: ${f.user_msg_snippet ?? "(none)"}

Session context (target event + 3 before/after):
${context}`,
        maxTokens: 300,
        parse: parseFencedJson,
      })
      calls++

      const v = result.data
      const verdict = v.verdict ?? "unclear"
      verified.push({
        ...f,
        llm_verdict: verdict,
        llm_reasoning: (v.reasoning ?? "").slice(0, 100),
        llm_confidence: typeof v.confidence === "number" ? v.confidence : 0.5,
        // 如果 LLM 标 false-positive, 把原信心度压低
        confidence: verdict === "false-positive" ? f.confidence * 0.2 : f.confidence,
      } as VerifiedFinding)
    } catch (e) {
      // LLM 调用失败, 保留原 finding 不动
      verified.push(f)
    }
  }

  return { verified, calls }
}

/** 抓 target event 前后 ~3 events 当上下文给 LLM */
function buildSessionContext(session: SessionDetail, targetIdx: number): string {
  const start = Math.max(0, targetIdx - 3)
  const end = Math.min(session.events.length, targetIdx + 4)
  const slice = session.events.slice(start, end)
  return slice
    .map((e, i) => {
      const idx = start + i
      const marker = idx === targetIdx ? ">>> " : "    "
      const text = (e.text ?? "").slice(0, 200).replace(/\n/g, " ")
      return `${marker}[${idx}] (${e.kind}) ${text}`
    })
    .join("\n")
}
