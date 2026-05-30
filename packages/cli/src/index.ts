#!/usr/bin/env node
// skill-recall CLI — agent 日志分析工具 (SPEC §9)
//
// 命令:
//   skill-recall run [--full] [--skill <name>] [--config <path>] [--dry-run]
//                    [--use-llm-extract] [--use-llm-verify] [--use-llm-implicit]
//   skill-recall extract <skill-name> [--rerun]   # 单独跑 LLM 提取
//   skill-recall doctor
//
// Phase 2 LLM 流程(--use-llm-* 开启):
//   1. extract 阶段: 静态 + LLM 双路, LLM 输出缓存到 extracted/<skill>.json
//   2. detect 阶段: 程序化 detector 跑完后, LLM verify 对 unclear 的二次判定
//   3. implicit-constraint-violation detector: 用 LLM extracted 的 hint 扫 session

import { Command } from "commander"
import * as fs from "fs"
import * as path from "path"
import { execSync } from "child_process"
import {
  loadConfig,
  loadSkillMd,
  extractStatic,
  extractWithLlm,
  readExtractedCache,
  writeExtractedCache,
  isLlmCacheValid,
  listSessions,
  showSession,
  ProcessedTracker,
  SessionArchiver,
  detectTriggerMiss,
  verifyFindingsWithLlm,
  detectImplicitViolations,
  MinimaxClient,
  FindingsWriter,
  generateWeeklyReport,
  UnknownTracker,
  getCliBin,
  setCliBinOverride,
  type StaticExtractedPoints,
  type LlmExtractedPoints,
  type ExtractedPoints,
  type Finding,
  type SessionDetail,
} from "@agent-sessions-manager/core"

const program = new Command()
program
  .name("skill-recall")
  .description("Agent log analysis for skill recall/precision tuning")
  .version("0.2.0")

// ─── run ────────────────────────────────────────────────────────────────────

program
  .command("run")
  .description("Run analysis (incremental by default)")
  .option("--full", "Full rebuild instead of incremental", false)
  .option("--skill <name>", "Only analyze a specific registered skill")
  .option("--config <path>", "Custom config path")
  .option("--dry-run", "Compute but do not write findings", false)
  .option("--limit <n>", "Cap sessions analyzed (debug)", parseIntOpt)
  .option("--use-llm-extract", "Run LLM extractor (cached by SKILL.md hash)", false)
  .option("--use-llm-verify", "Verify findings via LLM (filter false positives)", false)
  .option("--use-llm-implicit", "Run implicit-constraint-violation detector", false)
  .action(async (opts) => {
    const config = loadConfig(opts.config)
    setCliBinOverride(config.agent_sessions_cli_path)
    const cache = new ProcessedTracker(config.incremental.cache_path)
    const archiver = new SessionArchiver(config.storage.base_path, config.storage.enabled)
    const unknownTracker = new UnknownTracker(
      path.join(config.storage.base_path, ".cache/unknown-counter.json")
    )

    const targetSkills = config.registered_skills
      .filter((s) => s.enabled)
      .filter((s) => !opts.skill || s.name === opts.skill)
    if (targetSkills.length === 0) {
      console.error("No registered skills (or --skill filter excluded all)")
      process.exit(2)
    }

    // LLM client (lazy — only create if any --use-llm-* flag is set)
    const llmNeeded = opts.useLlmExtract || opts.useLlmVerify || opts.useLlmImplicit
    let llmClient: MinimaxClient | undefined
    if (llmNeeded) {
      if (!config.llm_fallback.enabled) {
        console.error("LLM flags passed but llm_fallback.enabled=false in config")
        process.exit(2)
      }
      try {
        llmClient = new MinimaxClient(config.llm_fallback)
        console.log(
          `[skill-recall] LLM enabled: ${config.llm_fallback.model}, budget ${config.llm_fallback.budget_per_run}`
        )
      } catch (e) {
        console.error("LLM init failed:", (e as Error).message)
        process.exit(2)
      }
    }

    // 1. Extract points
    console.log(`[skill-recall] extracting points for ${targetSkills.length} skill(s)…`)
    const staticBySkill: Record<string, StaticExtractedPoints> = {}
    const llmBySkill: Record<string, LlmExtractedPoints> = {}

    for (const s of targetSkills) {
      try {
        const loaded = loadSkillMd(s.name)
        const staticPoints = extractStatic(loaded)
        if (s.extra_triggers) staticPoints.trigger_phrases.push(...s.extra_triggers)
        if (s.extra_red_flags) staticPoints.red_flags.push(...s.extra_red_flags)
        staticBySkill[s.name] = staticPoints

        let llmPoints: LlmExtractedPoints | undefined
        const cached = readExtractedCache(config.storage.base_path, s.name)
        if (
          opts.useLlmExtract &&
          s.use_llm_extraction &&
          llmClient &&
          !llmClient.isBudgetExceeded()
        ) {
          if (isLlmCacheValid(cached, loaded.git_hash)) {
            llmPoints = cached!.llm
            console.log(`  ${s.name} (LLM cache hit)`)
          } else {
            console.log(`  ${s.name} → LLM extracting…`)
            llmPoints = await extractWithLlm(loaded, llmClient)
          }
          if (llmPoints) llmBySkill[s.name] = llmPoints
        } else if (cached?.llm) {
          llmBySkill[s.name] = cached.llm
        }

        const data: ExtractedPoints = { static: staticPoints, llm: llmPoints ?? cached?.llm }
        writeExtractedCache(config.storage.base_path, s.name, data)

        const llmTag = data.llm
          ? ` | LLM ${data.llm.implicit_constraints.length}/${data.llm.hidden_anti_patterns.length}/${data.llm.downstream_handoff_required.length}`
          : ""
        console.log(
          `  ${s.name}: ${staticPoints.trigger_phrases.length}t/${staticPoints.do_not_use_phrases.length}d/${staticPoints.red_flags.length}r/${staticPoints.workflow_steps.length}s${llmTag}`
        )
      } catch (e) {
        console.error(`  ${s.name}: extract failed — ${(e as Error).message}`)
      }
    }

    // 2. List sessions (incremental or full)
    const since = opts.full ? undefined : computeSince(cache, config.incremental.fallback_window)
    console.log(`[skill-recall] listing sessions${since ? ` since ${since}` : " (full)"}…`)
    const sessions = listSessions({
      agent: "claude",
      limit: opts.limit ?? 100,
      since,
    })
    console.log(`  found ${sessions.length} session(s)`)

    // 3. For each session: show → archive → detect
    let findings: Finding[] = []
    const sessionsById = new Map<string, SessionDetail>()
    let processedCount = 0
    let skippedCount = 0

    for (const list of sessions) {
      if (!opts.full && cache.isProcessed(list.id)) {
        skippedCount++
        continue
      }
      try {
        const detail = showSession(list.id, list.source)
        archiver.archive(detail)
        sessionsById.set(detail.id, detail)

        // Track unknown event kinds (SPEC §3.2 卡颂方法 KPI)
        for (const e of detail.events) unknownTracker.observe(e.kind)

        // Static detector
        const triggerMissFindings = detectTriggerMiss(detail, staticBySkill)
        findings.push(...triggerMissFindings)

        // Implicit constraint detector (LLM-driven)
        if (opts.useLlmImplicit && llmClient && !llmClient.isBudgetExceeded()) {
          for (const [skillName, llmPoints] of Object.entries(llmBySkill)) {
            if (!llmPoints.implicit_constraints.length) continue
            const r = await detectImplicitViolations(detail, skillName, llmPoints, llmClient, 2)
            findings.push(...r.findings)
          }
        }

        cache.markProcessed(list.id)
        processedCount++
      } catch (e) {
        console.error(`  session ${list.short_id}: failed — ${(e as Error).message}`)
      }
    }

    console.log(
      `[skill-recall] processed ${processedCount}, skipped ${skippedCount} (cache), findings: ${findings.length}`
    )

    // 4. LLM verify pass (二次过滤 false positive)
    if (opts.useLlmVerify && llmClient && findings.length > 0) {
      const before = findings.length
      console.log(`[skill-recall] LLM verifying ${before} findings…`)
      const r = await verifyFindingsWithLlm(findings, sessionsById, llmClient)
      findings = r.verified
      const fpCount = findings.filter((f) => "llm_verdict" in f && (f as { llm_verdict: string }).llm_verdict === "false-positive").length
      console.log(`  LLM calls: ${r.calls}, marked false-positive: ${fpCount}`)
    }

    // 5. Write findings
    if (!opts.dryRun && findings.length > 0) {
      const writer = new FindingsWriter(config.storage.base_path)
      const result = writer.write(findings)
      console.log(`  findings written: ${result.path}`)
    } else if (opts.dryRun) {
      console.log(`  (dry-run, findings not written)`)
      if (findings.length > 0) {
        console.log("  sample (first 5):")
        for (const f of findings.slice(0, 5)) {
          const verdict = "llm_verdict" in f ? ` [${(f as { llm_verdict: string }).llm_verdict}]` : ""
          console.log(
            `    [${f.type}]${verdict} ${f.skill} — ${f.description.slice(0, 70)} (conf ${f.confidence.toFixed(2)})`
          )
        }
      }
    }

    if (llmClient) {
      console.log(`[skill-recall] LLM calls used: ${llmClient.callsMade()}/${config.llm_fallback.budget_per_run}`)
    }

    // Save unknown KPI
    const ukCount = unknownTracker.getCurrentCount()
    if (ukCount > 0) {
      console.log(
        `[skill-recall] unknown event kinds: ${ukCount} (${Object.keys(unknownTracker.getCurrentByKind()).join(", ")})`
      )
    }
    unknownTracker.save()

    cache.markRunComplete()
  })

// ─── report weekly ──────────────────────────────────────────────────────────

program
  .command("report")
  .description("Generate reports from findings")
  .argument("<type>", "Report type: weekly")
  .option("--config <path>", "Custom config path")
  .option("--since <iso>", "Override default since (default: last Monday 00:00 UTC)")
  .option("--no-push", "Skip cc-connect IM push even if CC_SESSION_KEY is set")
  .action((type: string, opts) => {
    if (type !== "weekly") {
      console.error(`Unsupported report type: ${type} (only 'weekly' for now)`)
      process.exit(2)
    }
    const config = loadConfig(opts.config)
    setCliBinOverride(config.agent_sessions_cli_path)
    const findingsDir = path.join(config.storage.base_path, "findings")
    const registered = config.registered_skills.filter((s) => s.enabled).map((s) => s.name)

    // Read last unknown count for ↑↓ delta
    const ukPath = path.join(config.storage.base_path, ".cache/unknown-counter.json")
    const tracker = new UnknownTracker(ukPath)
    const ukCount = tracker.getPreviousCount() ?? 0

    const result = generateWeeklyReport({
      findingsDir,
      since: opts.since,
      registeredSkills: registered,
      unknownCount: ukCount,
      lastUnknownCount: undefined,  // 历史对比留 Phase 3.6
    })

    // Resolve output path from config template
    const week = isoWeekShort()
    const outputPath = config.reporting.weekly_output.replace("{week}", week)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, result.markdown, "utf8")
    console.log(`[report] weekly written: ${outputPath}`)
    console.log(`  findings analyzed: ${result.findingsAnalyzed} (from ${result.filesAnalyzed.length} file(s))`)

    // IM push (Task #63)
    const pushEnabled = config.reporting.push_to_im && !opts.noPush && process.env.CC_SESSION_KEY
    if (pushEnabled) {
      try {
        execSync(`cc-connect send --file "${outputPath}"`, {
          stdio: ["ignore", "inherit", "inherit"],
        })
        console.log(`[report] pushed to IM via cc-connect`)
      } catch (e) {
        console.error(`[report] cc-connect push failed: ${(e as Error).message}`)
      }
    } else if (!process.env.CC_SESSION_KEY) {
      console.log(`[report] CC_SESSION_KEY not set, skipping IM push`)
    }
  })

function isoWeekShort(): string {
  const d = new Date()
  const target = new Date(d)
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`
}

// ─── extract ────────────────────────────────────────────────────────────────

program
  .command("extract <skill-name>")
  .description("Extract LLM points for a single skill (force re-run with --rerun)")
  .option("--rerun", "Ignore cache and re-extract", false)
  .option("--config <path>", "Custom config path")
  .action(async (skillName: string, opts) => {
    const config = loadConfig(opts.config)
    setCliBinOverride(config.agent_sessions_cli_path)
    if (!config.llm_fallback.enabled) {
      console.error("llm_fallback.enabled=false in config")
      process.exit(2)
    }
    const client = new MinimaxClient(config.llm_fallback)
    const loaded = loadSkillMd(skillName)
    const staticPoints = extractStatic(loaded)

    const cached = readExtractedCache(config.storage.base_path, skillName)
    if (!opts.rerun && isLlmCacheValid(cached, loaded.git_hash)) {
      console.log(`[extract] cache hit for ${skillName} (git hash ${loaded.git_hash?.slice(0, 8)})`)
      console.log(JSON.stringify(cached!.llm, null, 2))
      return
    }

    console.log(`[extract] running LLM for ${skillName}…`)
    const llmPoints = await extractWithLlm(loaded, client)
    writeExtractedCache(config.storage.base_path, skillName, {
      static: staticPoints,
      llm: llmPoints,
    })
    console.log(
      `[extract] ${skillName}: ${llmPoints.implicit_constraints.length} constraints, ${llmPoints.hidden_anti_patterns.length} anti-patterns, ${llmPoints.downstream_handoff_required.length} handoffs`
    )
    console.log(JSON.stringify(llmPoints, null, 2))
  })

// ─── doctor ─────────────────────────────────────────────────────────────────

program
  .command("doctor")
  .description("Check setup: config, agent-sessions-cli availability, env vars")
  .action(() => {
    try {
      const config = loadConfig()
      setCliBinOverride(config.agent_sessions_cli_path)
      console.log("✓ config loaded")
      console.log(`  registered skills: ${config.registered_skills.map((s) => s.name).join(", ")}`)
      console.log(`  storage base: ${config.storage.base_path} (enabled: ${config.storage.enabled})`)
      console.log(`  cache: ${config.incremental.cache_path}`)
      if (config.llm_fallback.enabled) {
        const keySet = !!process.env[config.llm_fallback.api_key_env]
        console.log(
          `  llm fallback: ${config.llm_fallback.provider} ${config.llm_fallback.model} (key: ${keySet ? "set" : "MISSING"})`
        )
      } else {
        console.log("  llm fallback: disabled")
      }

      // agent-sessions-cli resolution + version
      const bin = getCliBin()
      console.log(`  agent-sessions-cli bin: ${bin}`)
      try {
        const version = execSync(`"${bin}" --version`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
        console.log(`  agent-sessions-cli version: ${version}`)
      } catch (e) {
        console.error(`  ✗ agent-sessions-cli --version failed: ${(e as Error).message}`)
        console.error(`    → run 'pnpm setup' to install (git submodule + venv + pip)`)
        process.exit(1)
      }

      const sessions = listSessions({ agent: "claude", limit: 1 })
      console.log(`✓ agent-sessions-cli reachable (sample session: ${sessions[0]?.short_id ?? "none"})`)
    } catch (e) {
      console.error("✗ doctor failed:", (e as Error).message)
      process.exit(1)
    }
  })

program.parse()

// ─── helpers ────────────────────────────────────────────────────────────────

function parseIntOpt(v: string): number {
  const n = Number.parseInt(v, 10)
  if (Number.isNaN(n)) throw new Error(`invalid number: ${v}`)
  return n
}

function computeSince(cache: ProcessedTracker, fallback: string): string {
  const last = cache.getLastRunAt()
  if (last) return last
  const m = fallback.match(/^(\d+)d$/)
  const days = m ? parseInt(m[1], 10) : 7
  const t = new Date()
  t.setUTCDate(t.getUTCDate() - days)
  return t.toISOString()
}
