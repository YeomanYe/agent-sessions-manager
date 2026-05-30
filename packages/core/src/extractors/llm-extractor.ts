// LLM extractor — 从 SKILL.md 散文里提隐含约束/anti-pattern/handoff
// 程序化 regex 抓不到的语义部分.
//
// SPEC §6.2 — 输出结构化 JSON,缓存到 extracted/<skill>.json
// SPEC §6.3 — 按 SKILL.md git hash 判失效, 没变就跳过

import * as fs from "fs"
import * as path from "path"
import type { MinimaxClient } from "../llm/minimax-client"
import { parseFencedJson } from "../llm/minimax-client"
import type { LoadedSkillMd } from "../loader/skill-md-loader"
import type {
  LlmExtractedPoints,
  StaticExtractedPoints,
  ExtractedPoints,
} from "../types/extracted-points"

const SYSTEM_PROMPT = `你是 skill 文档分析专家. 从 Claude Code skill 的 SKILL.md 提取**程序化 regex 抓不到的隐含语义**.

输出严格按 JSON schema, 不要其他解释:

{
  "implicit_constraints": [
    { "description": "<中文短句, 描述这个 skill 的隐含执行约束>",
      "detection_hint": "<英文/伪代码, 描述如何从 session events 识别违反>" }
  ],
  "hidden_anti_patterns": [
    { "description": "<中文短句, 描述容易被忽略的反模式>",
      "detection_hint": "<英文/伪代码, 描述检测线索>" }
  ],
  "downstream_handoff_required": [
    { "description": "<中文短句, 描述该 skill 完成后必须 handoff 给哪些下游>",
      "detection_hint": "<英文/伪代码, 如 'after skill_call X without subsequent skill_call Y'>" }
  ]
}

规则:
- 每类 ≤ 5 条, 抓最有信号的
- detection_hint 必须能转成代码检测(说清看哪个事件字段/什么 pattern)
- 不重复 frontmatter 里的 trigger phrases / Do NOT use(那些有程序抓)
- 找不到就给空数组, 不要硬凑`

interface LlmExtractResponse {
  implicit_constraints?: Array<{ description?: string; detection_hint?: string }>
  hidden_anti_patterns?: Array<{ description?: string; detection_hint?: string }>
  downstream_handoff_required?: Array<{ description?: string; detection_hint?: string }>
}

export async function extractWithLlm(
  loaded: LoadedSkillMd,
  client: MinimaxClient
): Promise<LlmExtractedPoints> {
  const result = await client.complete<LlmExtractResponse>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Skill: ${loaded.skill_name}\n\n完整 SKILL.md:\n\n${loaded.full_text}`,
    maxTokens: 4000,  // 长 SKILL.md (flow-dev-task ~600 行) 输出可能 ≥2000 token
    parse: parseFencedJson,
  })

  const data = result.data
  return {
    skill_name: loaded.skill_name,
    skill_md_git_hash: loaded.git_hash,
    extracted_at: new Date().toISOString(),
    llm_model: "MiniMax-2.7",
    implicit_constraints: normalize(data.implicit_constraints),
    hidden_anti_patterns: normalize(data.hidden_anti_patterns),
    downstream_handoff_required: normalize(data.downstream_handoff_required),
  }
}

function normalize(
  arr?: Array<{ description?: string; detection_hint?: string }>
): Array<{ description: string; detection_hint: string }> {
  if (!arr) return []
  return arr
    .filter((x) => x.description && x.detection_hint)
    .map((x) => ({
      description: x.description!.trim(),
      detection_hint: x.detection_hint!.trim(),
    }))
}

// ─── 缓存管理 ─────────────────────────────────────────────────────────────

interface CachedExtracted {
  static: StaticExtractedPoints
  llm?: LlmExtractedPoints
}

export function readExtractedCache(
  basePath: string,
  skillName: string
): CachedExtracted | undefined {
  const file = path.join(basePath, "extracted", `${skillName}.json`)
  if (!fs.existsSync(file)) return undefined
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as CachedExtracted
  } catch {
    return undefined
  }
}

export function writeExtractedCache(
  basePath: string,
  skillName: string,
  data: ExtractedPoints
): string {
  const file = path.join(basePath, "extracted", `${skillName}.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8")
  return file
}

/**
 * 检查 cache 是否对当前 SKILL.md 仍有效.
 * 有效 = 同 git_hash + 含 LLM 部分.
 */
export function isLlmCacheValid(
  cached: CachedExtracted | undefined,
  currentGitHash: string | undefined
): boolean {
  if (!cached?.llm) return false
  if (!currentGitHash) return false
  return cached.llm.skill_md_git_hash === currentGitHash
}
