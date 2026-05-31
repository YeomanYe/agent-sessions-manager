import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import { fetchFindings, fetchFacets, type IdentifiedFinding } from "../lib/api"
import { FindingDetail } from "../components/FindingDetail"
import { cn } from "../lib/cn"

const PAGE_SIZE = 50

export function FindingsPage() {
  const [params, setParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const skill = params.get("skill") ?? ""
  const type = params.get("type") ?? ""
  const llmVerdict = params.get("llm_verdict") ?? ""
  const offset = Number(params.get("offset") ?? 0)

  const facetsQ = useQuery({ queryKey: ["facets"], queryFn: fetchFacets })
  const findingsQ = useQuery({
    queryKey: ["findings", skill, type, llmVerdict, offset],
    queryFn: () =>
      fetchFindings({
        skill: skill || undefined,
        type: type || undefined,
        llm_verdict: llmVerdict || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const selected = useMemo(
    () => findingsQ.data?.findings.find((f) => f._id === selectedId),
    [findingsQ.data, selectedId]
  )

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
          <div className="ml-auto text-xs text-muted">
            {findingsQ.data ? `${findingsQ.data.total} total` : "loading…"}
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
        </div>

        {findingsQ.data && findingsQ.data.total > PAGE_SIZE && (
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
}: {
  finding: IdentifiedFinding
  selected: boolean
  onSelect: () => void
}) {
  return (
    <li
      onClick={onSelect}
      className={cn(
        "p-3 cursor-pointer hover:bg-neutral-50 transition",
        selected && "bg-blue-50 hover:bg-blue-50"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="badge font-mono">{finding.type}</span>
        <span className="text-sm font-semibold">{finding.skill}</span>
        <VerdictBadge verdict={finding.llm_verdict} />
        <span className="ml-auto text-xs text-muted">
          conf {finding.confidence.toFixed(2)}
        </span>
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
