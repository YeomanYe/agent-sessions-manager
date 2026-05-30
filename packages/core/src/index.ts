// Public API for @agent-sessions-manager/core
//
// CLI 和 webui 都从这里 import.

// Types
export type * from "./types/config"
export type * from "./types/session"
export type * from "./types/extracted-points"
export type * from "./types/finding"

// Loaders
export { loadConfig } from "./loader/config-loader"
export { loadSkillMd } from "./loader/skill-md-loader"
export type { LoadedSkillMd } from "./loader/skill-md-loader"

// Extractors
export { extractStatic } from "./extractors/static-extractor"

// Source
export {
  listSessions,
  showSession,
  reindex,
  extractSkillCalls,
  extractUserMessages,
} from "./source/agent-sessions-cli"
export type { ListSessionsOptions, SkillCallSite } from "./source/agent-sessions-cli"

// Cache
export { ProcessedTracker } from "./cache/processed-tracker"

// Storage
export { SessionArchiver } from "./storage/session-archiver"

// Detectors
export { detectTriggerMiss } from "./detectors/trigger-miss"
export { verifyFindingsWithLlm } from "./detectors/llm-fallback"
export type { VerifiedFinding } from "./detectors/llm-fallback"
export { detectImplicitViolations } from "./detectors/implicit-constraint-violation"

// LLM
export { MinimaxClient, parseFencedJson } from "./llm/minimax-client"
export type { LlmCallResult } from "./llm/minimax-client"

// Extractors (LLM)
export {
  extractWithLlm,
  readExtractedCache,
  writeExtractedCache,
  isLlmCacheValid,
} from "./extractors/llm-extractor"

// Reports
export { FindingsWriter } from "./reports/findings-writer"
export { generateWeeklyReport } from "./reports/weekly-md"
export type { WeeklyReportResult } from "./reports/weekly-md"

// Unknown tracker (KPI)
export { UnknownTracker } from "./unknown-tracker"
export type { UnknownTrackerData } from "./unknown-tracker"
