// MiniMax LLM client (Anthropic-compatible API)
//
// SPEC §3.10: baseUrl=https://api.minimaxi.com/anthropic, model=MiniMax-2.7
// SPEC §11: key 从环境变量读, 绝不写明文
//
// Budget guard: 单次跑 LLM 调用上限, 超出后调用方应使用 isBudgetExceeded() 跳过.

import Anthropic from "@anthropic-ai/sdk"
import type { SkillRecallConfig } from "../types/config"

export interface LlmCallResult<T> {
  data: T
  raw_response: string
  cost_input_tokens: number
  cost_output_tokens: number
}

export class MinimaxClient {
  private client: Anthropic
  private model: string
  private budget: number
  private callsUsed = 0

  constructor(config: SkillRecallConfig["llm_fallback"]) {
    const apiKey = process.env[config.api_key_env]
    if (!apiKey) {
      throw new Error(
        `LLM env var ${config.api_key_env} not set. ` +
          `Set in .env (git-ignored).`
      )
    }
    this.client = new Anthropic({
      apiKey,
      baseURL: config.base_url,
    })
    this.model = config.model
    this.budget = config.budget_per_run
  }

  /** Budget 检查 — 调用前先 check */
  isBudgetExceeded(): boolean {
    return this.callsUsed >= this.budget
  }

  /** 剩余调用次数 */
  remainingBudget(): number {
    return Math.max(0, this.budget - this.callsUsed)
  }

  callsMade(): number {
    return this.callsUsed
  }

  /**
   * 跑一次完成请求.
   * - systemPrompt: 系统提示
   * - userPrompt: 用户输入
   * - jsonSchema: 期望输出的 JSON 结构(用于 parse + 校验)
   * - maxTokens: 输出 token 上限
   * - retries: 失败重试次数(默认 1)
   */
  async complete<T>(opts: {
    systemPrompt: string
    userPrompt: string
    maxTokens?: number
    /** parse 函数, 拿到原始 text 后解析为 T;失败抛错触发重试 */
    parse: (text: string) => T
    retries?: number
  }): Promise<LlmCallResult<T>> {
    if (this.isBudgetExceeded()) {
      throw new Error(
        `LLM budget exceeded (${this.callsUsed}/${this.budget} calls). Pass --full to reset or raise budget_per_run.`
      )
    }

    const maxTokens = opts.maxTokens ?? 2000
    const retries = opts.retries ?? 1
    let lastErr: Error | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.callsUsed++
        const resp = await this.client.messages.create({
          model: this.model,
          max_tokens: maxTokens,
          system: opts.systemPrompt,
          messages: [{ role: "user", content: opts.userPrompt }],
        })

        // Extract text from content blocks
        const text = resp.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")

        const parsed = opts.parse(text)

        return {
          data: parsed,
          raw_response: text,
          cost_input_tokens: resp.usage?.input_tokens ?? 0,
          cost_output_tokens: resp.usage?.output_tokens ?? 0,
        }
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
        if (attempt < retries) {
          // Exponential backoff: 1s, 2s
          await sleep(1000 * Math.pow(2, attempt))
        }
      }
    }

    throw new Error(
      `LLM call failed after ${retries + 1} attempts: ${lastErr?.message ?? "unknown"}`
    )
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 把 LLM 返回的 markdown code-fenced JSON 抽出来 parse
 *
 * 策略(防 JSON 内部反引号干扰):
 * 1. 优先 ```json 起始的块, 用 greedy match 到最后一个 ``` (避免内部反引号截断)
 * 2. 否则裸 ```...``` 块同理
 * 3. 都没匹配 → 试整段 parse
 * 4. 仍失败 → 抽出第一个 { 到最后一个 } (兜底 JSON object 抽取)
 */
export function parseFencedJson<T>(text: string): T {
  // ```json ... ``` greedy
  const fencedJson = text.match(/```json\s*([\s\S]+)```/)
  if (fencedJson) {
    try {
      return JSON.parse(fencedJson[1].trim()) as T
    } catch {
      // fall through
    }
  }
  // ``` ... ``` greedy
  const fenced = text.match(/```\s*([\s\S]+)```/)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim()) as T
    } catch {
      // fall through
    }
  }
  // 整段
  try {
    return JSON.parse(text.trim()) as T
  } catch {
    // fall through
  }
  // 兜底: 抓第一个 { 到最后一个 }
  const first = text.indexOf("{")
  const last = text.lastIndexOf("}")
  if (first >= 0 && last > first) {
    return JSON.parse(text.slice(first, last + 1)) as T
  }
  throw new Error(`Cannot parse LLM JSON response (first 200 chars): ${text.slice(0, 200)}`)
}
