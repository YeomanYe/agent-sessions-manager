// API client — fetch wrappers for webui-server
//
// Vite proxy routes /api → http://localhost:5174

import type {
  Finding,
  SessionDetail,
  StaticExtractedPoints,
  LlmExtractedPoints,
} from "@agent-sessions-manager/core"

export interface IdentifiedFinding extends Finding {
  _id: string
  _file: string
  llm_verdict?: "real-issue" | "false-positive" | "unclear"
  llm_reasoning?: string
  llm_confidence?: number
}

export interface FindingsResponse {
  total: number
  offset: number
  limit: number
  findings: IdentifiedFinding[]
}

export interface FacetsResponse {
  skills: string[]
  types: string[]
  llm_verdicts: string[]
}

export interface SkillsResponse {
  skills: Array<{
    name: string
    extracted: { static: StaticExtractedPoints; llm?: LlmExtractedPoints } | null
    error?: string
  }>
}

export interface FindingsQuery {
  skill?: string
  type?: string
  llm_verdict?: string
  since?: string
  limit?: number
  offset?: number
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`${r.status}: ${text.slice(0, 200)}`)
  }
  return r.json() as Promise<T>
}

export function fetchFindings(q: FindingsQuery): Promise<FindingsResponse> {
  const params = new URLSearchParams()
  if (q.skill) params.set("skill", q.skill)
  if (q.type) params.set("type", q.type)
  if (q.llm_verdict) params.set("llm_verdict", q.llm_verdict)
  if (q.since) params.set("since", q.since)
  if (q.limit !== undefined) params.set("limit", String(q.limit))
  if (q.offset !== undefined) params.set("offset", String(q.offset))
  return get<FindingsResponse>(`/api/findings?${params}`)
}

export function fetchFacets(): Promise<FacetsResponse> {
  return get<FacetsResponse>("/api/findings/_/facets")
}

export function fetchSession(id: string, source = "claude"): Promise<SessionDetail> {
  return get<SessionDetail>(`/api/sessions/${id}?source=${source}`)
}

export function fetchSkills(): Promise<SkillsResponse> {
  return get<SkillsResponse>("/api/skills")
}
