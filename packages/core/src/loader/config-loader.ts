// 读 local/skill-recall-config.yaml(SPEC §8)
//
// 路径解析:
// - ~/ 展开到 $HOME
// - ${VAR} 展开环境变量(reporting.weekly_output 里的 {week} 是模板占位符, 不属于这里)

import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { parse as parseYaml } from "yaml"
import type { SkillRecallConfig } from "../types/config"

// 默认查找顺序:
//   1. env SKILL_RECALL_CONFIG (显式覆盖)
//   2. ./local/skill-recall-config.yaml(cwd, 适合 monorepo root 调用)
//   3. ~/Documents/projects/agent-sessions-manager/local/skill-recall-config.yaml
const DEFAULT_CONFIG_CANDIDATES = [
  process.env.SKILL_RECALL_CONFIG,
  path.join(process.cwd(), "local/skill-recall-config.yaml"),
  path.join(
    os.homedir(),
    "Documents/projects/agent-sessions-manager/local/skill-recall-config.yaml"
  ),
].filter(Boolean) as string[]

function findDefaultConfig(): string | undefined {
  for (const p of DEFAULT_CONFIG_CANDIDATES) {
    if (p && fs.existsSync(p)) return p
  }
  return undefined
}

export function loadConfig(configPath?: string): SkillRecallConfig {
  const resolved = configPath ?? findDefaultConfig()

  if (!resolved || !fs.existsSync(resolved)) {
    throw new Error(
      `Config not found. Searched:\n` +
        DEFAULT_CONFIG_CANDIDATES.map((p) => `  - ${p}`).join("\n") +
        `\n\nCopy packages/cli/config-example.yaml to local/skill-recall-config.yaml`
    )
  }

  const raw = fs.readFileSync(resolved, "utf8")
  const parsed = parseYaml(raw) as SkillRecallConfig

  // Expand paths
  parsed.storage.base_path = expandPath(parsed.storage.base_path)
  parsed.incremental.cache_path = expandPath(parsed.incremental.cache_path)
  parsed.reporting.weekly_output = expandPath(parsed.reporting.weekly_output)

  validateConfig(parsed, resolved)
  return parsed
}

function expandPath(p: string): string {
  // ${VAR} → process.env.VAR
  let out = p.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] ?? "")
  // ~/ → $HOME
  if (out.startsWith("~/")) {
    out = path.join(os.homedir(), out.slice(2))
  } else if (out === "~") {
    out = os.homedir()
  }
  return out
}

function validateConfig(cfg: SkillRecallConfig, source: string): void {
  if (!cfg.storage) throw new Error(`[${source}] missing 'storage'`)
  if (!cfg.registered_skills || cfg.registered_skills.length === 0) {
    throw new Error(`[${source}] no registered_skills`)
  }
  if (cfg.llm_fallback.enabled) {
    const keyEnv = cfg.llm_fallback.api_key_env
    if (!keyEnv) {
      throw new Error(`[${source}] llm_fallback.enabled=true but api_key_env empty`)
    }
    if (!process.env[keyEnv]) {
      // eslint-disable-next-line no-console
      console.warn(
        `[skill-recall] env ${keyEnv} not set; LLM fallback will fail at runtime`
      )
    }
  }
}
