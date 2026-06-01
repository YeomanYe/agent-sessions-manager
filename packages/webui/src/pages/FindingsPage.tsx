import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import { fetchFindings, fetchFacets, type IdentifiedFinding } from "../lib/api"
import { FindingDetail } from "../components/FindingDetail"
import { cn } from "../lib/cn"

const PAGE_SIZE = 50
const GROUPED_LIMIT = 10000  // 分组视图一次性拉全(MVP, 数据量小)

type ViewMode = "session" | "flat"

export function FindingsPage() {
  const [params, setParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const skill = params.get("skill") ?? ""
  const type = params.get("type") ?? ""
  const llmVerdict = params.get("llm_verdict") ?? ""
  const reviewStatus = params.get("review_status") ?? ""
  const offset = Number(params.get("offset") ?? 0)
  const view: ViewMode = (params.get("view") as ViewMode) || "session"

  const facetsQ = useQuery({ queryKey: ["facets"], queryFn: fetchFacets })
  const findingsQ = useQuery({
    queryKey: [
      "findings",
      skill,
      type,
      llmVerdict,
      reviewStatus,
      view === "flat" ? offset : "all",
    ],
    queryFn: () =>
      fetchFindings({
        skill: skill || undefined,
        type: type || undefined,
        llm_verdict: llmVerdict || undefined,
        review_status: reviewStatus || undefined,
        limit: view === "flat" ? PAGE_SIZE : GROUPED_LIMIT,
        offset: view === "flat" ? offset : 0,
      }),
  })

  const selected = useMemo(
    () => findingsQ.data?.findings.find((f) => f._id === selectedId),
    [findingsQ.data, selectedId]
  )

  const grouped = useMemo(() => {
    if (!findingsQ.data || view !== "session") return null
    return groupBySession(findingsQ.data.findings)
  }, [findingsQ.data, view])

  const updateParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    next.delete("offset")  // reset to first page on filter change
    setParams(next)
    setSelectedId(null)
  }

  const goPage = (newOffset: number) => {
    const next = new URLSearchParams(params)
    if (newOffset > 0) next.set("offset", String(newOffset))
    else next.delete("offset")
    setParams(next)
  }

  const switchView = (v: ViewMode) => {
    const next = new URLSearchParams(params)
    if (v === "flat") next.set("view", "flat")
    else next.delete("view")  // session is default, omit from URL
    next.delete("offset")
    setParams(next)
    setSelectedId(null)
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-130px)]">
      {/* Left: filters + list */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex items-end gap-2 flex-wrap">
          <Filter
            label="skill"
            value={skill}
            options={facetsQ.data?.skills ?? []}
            onChange={(v) => updateParam("skill", v)}
          />
          <Filter
            label="type"
            value={type}
            options={facetsQ.data?.types ?? []}
            onChange={(v) => updateParam("type", v)}
          />
          <Filter
            label="LLM verdict"
            value={llmVerdict}
            options={facetsQ.data?.llm_verdicts ?? []}
            onChange={(v) => updateParam("llm_verdict", v)}
          />
          <Filter
            label="review"
            value={reviewStatus}
            options={["unreviewed", "reviewed", "correct", "agent-error", "unclear", "triaged"]}
            onChange={(v) => updateParam("review_status", v)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-muted">view</label>
            <div className="flex border border-border rounded-md overflow-hidden">
              <button
                onClick={() => switchView("session")}
                className={cn(
                  "px-3 py-1 text-sm transition",
                  view === "session" ? "bg-accent text-white" : "bg-white hover:bg-neutral-50"
                )}
              >
                by session
              </button>
              <button
                onClick={() => switchView("flat")}
                className={cn(
                  "px-3 py-1 text-sm transition border-l border-border",
                  view === "flat" ? "bg-accent text-white" : "bg-white hover:bg-neutral-50"
                )}
              >
                flat
              </button>
            </div>
          </div>
          <div className="ml-auto text-xs text-muted self-end pb-1">
            {findingsQ.data
              ? view === "session" && grouped
                ? `${findingsQ.data.findings.length} findings · ${grouped.length} sessions`
                : `${findingsQ.data.total} total`
              : "loading…"}
          </div>
        </div>

        <div className="flex-1 overflow-auto border border-border rounded-md bg-white">
          {findingsQ.isLoading && <div className="p-4 text-muted">loading…</div>}
          {findingsQ.error && (
            <div className="p-4 text-danger">error: {String(findingsQ.error)}</div>
          )}
          {findingsQ.data?.findings.length === 0 && (
            <div className="p-4 text-muted">no findings match the filter</div>
          )}

          {view === "flat" && (
            <ul className="divide-y divide-border">
              {findingsQ.data?.findings.map((f) => (
                <FindingRow
                  key={f._id}
                  finding={f}
                  selected={f._id === selectedId}
                  onSelect={() => setSelectedId(f._id)}
                />
              ))}
            </ul>
          )}

          {view === "session" && grouped && (
            <ul className="divide-y divide-border">
              {grouped.map((g) => (
                <SessionGroup
                  key={g.session_id}
                  group={g}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ))}
            </ul>
          )}
        </div>

        {view === "flat" && findingsQ.data && findingsQ.data.total > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-2">
            <button
              className="btn"
              disabled={offset === 0}
              onClick={() => goPage(Math.max(0, offset - PAGE_SIZE))}
            >
              ← prev
            </button>
            <span className="text-sm text-muted">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, findingsQ.data.total)} / {findingsQ.data.total}
            </span>
            <button
              className="btn"
              disabled={offset + PAGE_SIZE >= findingsQ.data.total}
              onClick={() => goPage(offset + PAGE_SIZE)}
            >
              next →
            </button>
          </div>
        )}
      </div>

      {/* Right: detail */}
      <aside className="w-[480px] flex-shrink-0 border border-border rounded-md bg-white overflow-auto">
        {selected ? (
          <FindingDetail finding={selected} />
        ) : (
          <div className="p-4 text-muted text-sm">点 left 列表选一条 finding 看详情</div>
        )}
      </aside>
    </div>
  )
}

// ─── group-by-session helpers ──────────────────────────────────────────────

interface SessionGroupData {
  session_id: string
  source: string
  /** 按 event_index 升序 */
  findings: IdentifiedFinding[]
  /** finding type → count (用于 group header 概览) */
  typeCounts: Record<string, number>
  /** earliest detected_at, 用于跨 group 排序 */
  earliestDetectedAt: string
}

function groupBySession(findings: IdentifiedFinding[]): SessionGroupData[] {
  const map = new Map<string, SessionGroupData>()
  for (const f of findings) {
    let g = map.get(f.session_id)
    if (!g) {
      g = {
        session_id: f.session_id,
        source: f.source,
        findings: [],
        typeCounts: {},
        earliestDetectedAt: f.detected_at,
      }
      map.set(f.session_id, g)
    }
    g.findings.push(f)
    g.typeCounts[f.type] = (g.typeCounts[f.type] ?? 0) + 1
    if (f.detected_at < g.earliestDetectedAt) g.earliestDetectedAt = f.detected_at
  }
  // session 内按 event_index 升序(跟 session 时间线一致), 无 event_index 放最后
  for (const g of map.values()) {
    g.findings.sort((a, b) => {
      const ai = a.event_index ?? Number.MAX_SAFE_INTEGER
      const bi = b.event_index ?? Number.MAX_SAFE_INTEGER
      return ai - bi
    })
  }
  // group 之间按最早 finding 时间倒序(最近的 session 在上)
  return [...map.values()].sort(
    (a, b) => Date.parse(b.earliestDetectedAt) - Date.parse(a.earliestDetectedAt)
  )
}

// ─── components ──────────────────────────────────────────────────────────

function SessionGroup({
  group,
  selectedId,
  onSelect,
}: {
  group: SessionGroupData
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <li className="bg-neutral-50/50">
      <details open className="group">
        <summary className="px-3 py-2 cursor-pointer flex items-center gap-2 hover:bg-neutral-100 text-sm">
          <span className="font-mono text-muted text-xs">{group.session_id.slice(0, 8)}</span>
          <span className="badge text-[10px]">{group.source}</span>
          <span className="text-xs text-muted">
            {group.findings.length} finding{group.findings.length > 1 ? "s" : ""}
          </span>
          <div className="flex gap-1">
            {Object.entries(group.typeCounts).map(([type, n]) => (
              <span key={type} className="badge text-[10px] font-mono">
                {type} × {n}
              </span>
            ))}
          </div>
          <span className="ml-auto text-[10px] text-muted">
            {group.earliestDetectedAt.slice(0, 16).replace("T", " ")}
          </span>
        </summary>
        <ul className="divide-y divide-border bg-white">
          {group.findings.map((f) => (
            <FindingRow
              key={f._id}
              finding={f}
              selected={f._id === selectedId}
              onSelect={() => onSelect(f._id)}
              indented
            />
          ))}
        </ul>
      </details>
    </li>
  )
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase text-muted">{label}</label>
      <select
        className="input min-w-[140px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">(all)</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

function FindingRow({
  finding,
  selected,
  onSelect,
  indented = false,
}: {
  finding: IdentifiedFinding
  selected: boolean
  onSelect: () => void
  indented?: boolean
}) {
  return (
    <li
      onClick={onSelect}
      className={cn(
        "p-3 cursor-pointer hover:bg-neutral-50 transition",
        indented && "pl-8",
        selected && "bg-blue-50 hover:bg-blue-50"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="badge font-mono">{finding.type}</span>
        <span className="text-sm font-semibold">{finding.skill}</span>
        <VerdictBadge verdict={finding.llm_verdict} />
        <ReviewBadge status={finding._review_status} />
        {finding.event_index !== undefined && (
          <span className="text-xs text-muted font-mono">event {finding.event_index}</span>
        )}
        <span className="ml-auto text-xs text-muted">conf {finding.confidence.toFixed(2)}</span>
      </div>
      <p className="text-sm text-foreground/80 line-clamp-2">{finding.description}</p>
      {finding.user_msg_snippet && (
        <p className="text-xs text-muted mt-1 font-mono line-clamp-1">
          "{finding.user_msg_snippet}"
        </p>
      )}
    </li>
  )
}

function VerdictBadge({ verdict }: { verdict?: string }) {
  if (!verdict) return <span className="badge text-xs">unverified</span>
  if (verdict === "real-issue") return <span className="badge badge-danger">real-issue</span>
  if (verdict === "false-positive") return <span className="badge badge-success">FP</span>
  return <span className="badge badge-warning">{verdict}</span>
}

function ReviewBadge({ status }: { status?: string }) {
  if (!status) return null
  const cls =
    status === "correct" ? "badge-success" :
    status === "agent-error" ? "badge-danger" :
    status === "unclear" ? "badge-warning" :
    "badge"
  return <span className={cn("badge text-xs", cls)}>✓ {status}</span>
}
