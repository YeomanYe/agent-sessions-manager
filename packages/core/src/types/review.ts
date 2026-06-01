// Review state machine for human triage of findings (Stage B-1).
//
// 跟 LLM verdict (real-issue / false-positive / unclear) 对应但更精确:
//   - correct      ≈ LLM false-positive: agent 响应正确, finding 是误报
//   - agent-error  ≈ LLM real-issue:     agent 响应错了, finding 是真问题
//   - unclear      ≈ LLM unclear:         信息不够 / 模糊场景
//   - triaged      (新): 我已经处理过 (改了 SKILL.md / 加到错题本)
//
// 存储: ~/Documents/projects/skill-recall-data/reviews/<finding_id>.json
// finding_id = "<jsonl-filename>:<line-number>" (跟 webui-server findings route 一致)

export type ReviewStatus = "correct" | "agent-error" | "unclear" | "triaged"

export interface ReviewHistoryEntry {
  status: ReviewStatus
  ts: string  // ISO 8601
  notes?: string
}

export interface ReviewRecord {
  /** finding id, format: "<jsonl-filename>:<line-number>" */
  finding_id: string
  /** current status */
  status: ReviewStatus
  /** last reviewed timestamp (ISO 8601) */
  reviewed_at: string
  /** who reviewed (本地工具默认 "local", 多人场景 Stage C 再说) */
  reviewer: string
  /** free-text notes */
  notes?: string
  /** state change audit log (append-only) */
  history: ReviewHistoryEntry[]
}
