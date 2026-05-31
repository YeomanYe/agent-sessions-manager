import { Link } from "react-router-dom"
import type { IdentifiedFinding } from "../lib/api"

export function FindingDetail({ finding }: { finding: IdentifiedFinding }) {
  const jumpHref = finding.event_index !== undefined
    ? `/sessions/${finding.session_id}?source=${finding.source}&highlight=${finding.event_index}`
    : `/sessions/${finding.session_id}?source=${finding.source}`

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="badge font-mono">{finding.type}</span>
        <span className="text-base font-semibold">{finding.skill}</span>
        <Verdict verdict={finding.llm_verdict} />
      </div>

      <Field label="Description" value={finding.description} />
      {finding.user_msg_snippet && (
        <Field label="User msg snippet" value={finding.user_msg_snippet} mono />
      )}
      {finding.suggested_action && (
        <Field label="Suggested action" value={finding.suggested_action} />
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Meta label="severity" value={finding.severity} />
        <Meta label="confidence" value={finding.confidence.toFixed(2)} />
        <Meta label="detector" value={finding.detector} />
        <Meta label="detected at" value={finding.detected_at.slice(0, 19)} />
        <Meta label="source" value={finding.source} />
        <Meta
          label="event index"
          value={finding.event_index !== undefined ? String(finding.event_index) : "-"}
        />
      </div>

      {finding.llm_verdict && (
        <div className="border border-border rounded p-3 bg-neutral-50">
          <div className="text-[10px] uppercase text-muted mb-1">LLM verdict</div>
          <div className="text-sm">
            <strong>{finding.llm_verdict}</strong>{" "}
            <span className="text-muted">
              (conf {finding.llm_confidence?.toFixed(2) ?? "?"})
            </span>
          </div>
          {finding.llm_reasoning && (
            <p className="text-xs text-foreground/80 mt-1">{finding.llm_reasoning}</p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Link to={jumpHref} className="btn btn-primary">
          → jump to session
        </Link>
      </div>

      <details className="text-xs text-muted">
        <summary className="cursor-pointer hover:text-foreground">raw JSON</summary>
        <pre className="mt-2 p-2 bg-neutral-100 rounded overflow-auto max-h-80 font-mono whitespace-pre-wrap break-words">
          {JSON.stringify(finding, null, 2)}
        </pre>
      </details>
    </div>
  )
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted mb-0.5">{label}</div>
      <p className={mono ? "text-sm font-mono whitespace-pre-wrap break-words" : "text-sm whitespace-pre-wrap break-words"}>
        {value}
      </p>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded p-2 bg-white">
      <div className="uppercase text-[10px] text-muted">{label}</div>
      <div className="text-foreground truncate font-mono">{value}</div>
    </div>
  )
}

function Verdict({ verdict }: { verdict?: string }) {
  if (!verdict) return <span className="badge text-xs">unverified</span>
  if (verdict === "real-issue") return <span className="badge badge-danger">real-issue</span>
  if (verdict === "false-positive") return <span className="badge badge-success">false-positive</span>
  return <span className="badge badge-warning">{verdict}</span>
}
