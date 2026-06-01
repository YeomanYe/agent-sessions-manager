import { Link } from "react-router-dom"
import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  upsertReview,
  deleteReview,
  type IdentifiedFinding,
  type ReviewStatus,
} from "../lib/api"
import { cn } from "../lib/cn"

const STATUS_LABELS: Record<ReviewStatus, { label: string; help: string; cls: string }> = {
  correct: {
    label: "correct",
    help: "agent 响应正确, finding 是误报",
    cls: "badge-success",
  },
  "agent-error": {
    label: "agent-error",
    help: "agent 错了, finding 是真问题",
    cls: "badge-danger",
  },
  unclear: {
    label: "unclear",
    help: "信息不够 / 模糊场景",
    cls: "badge-warning",
  },
  triaged: {
    label: "triaged",
    help: "已经处理过 (改了 SKILL.md / 加到错题本)",
    cls: "badge",
  },
}

const STATUSES: ReviewStatus[] = ["correct", "agent-error", "unclear", "triaged"]

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
        {finding._review_status && (
          <span className={cn("badge", STATUS_LABELS[finding._review_status].cls)}>
            ✓ {STATUS_LABELS[finding._review_status].label}
          </span>
        )}
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

      {/* ─── Review widget (Stage B-1) ─── */}
      <ReviewWidget finding={finding} />

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

function ReviewWidget({ finding }: { finding: IdentifiedFinding }) {
  const qc = useQueryClient()
  // Local form state (sync from prop on finding change)
  const [status, setStatus] = useState<ReviewStatus | "">(finding._review_status ?? "")
  const [notes, setNotes] = useState<string>(finding._review_notes ?? "")

  useEffect(() => {
    setStatus(finding._review_status ?? "")
    setNotes(finding._review_notes ?? "")
  }, [finding._id, finding._review_status, finding._review_notes])

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!status) throw new Error("status required")
      return upsertReview(finding._id, { status, notes: notes.trim() || undefined })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["findings"] })
      qc.invalidateQueries({ queryKey: ["facets"] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: () => deleteReview(finding._id),
    onSuccess: () => {
      setStatus("")
      setNotes("")
      qc.invalidateQueries({ queryKey: ["findings"] })
      qc.invalidateQueries({ queryKey: ["facets"] })
    },
  })

  return (
    <div className="border border-border rounded p-3 bg-yellow-50/30 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-muted font-semibold">Review</span>
        {finding._review_status && (
          <span className="text-[10px] text-muted">(已 review,可改)</span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {STATUSES.map((s) => (
          <label key={s} className="inline-flex items-center gap-1 cursor-pointer text-sm">
            <input
              type="radio"
              name={`status-${finding._id}`}
              checked={status === s}
              onChange={() => setStatus(s)}
              className="accent-accent"
            />
            <span className={cn("badge", STATUS_LABELS[s].cls, "text-xs")}>
              {STATUS_LABELS[s].label}
            </span>
            <span className="text-[10px] text-muted">{STATUS_LABELS[s].help}</span>
          </label>
        ))}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="notes (optional): 为什么这样标 / 改了哪个 SKILL.md / 加了哪条错题本…"
        className="input w-full font-mono text-xs"
        rows={2}
      />

      <div className="flex items-center gap-2">
        <button
          className="btn btn-primary"
          disabled={!status || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? "saving…" : finding._review_status ? "update review" : "save review"}
        </button>
        {finding._review_status && (
          <button
            className="btn"
            disabled={removeMutation.isPending}
            onClick={() => removeMutation.mutate()}
          >
            {removeMutation.isPending ? "removing…" : "remove review"}
          </button>
        )}
        {saveMutation.isError && (
          <span className="text-xs text-danger">save failed: {String(saveMutation.error)}</span>
        )}
        {removeMutation.isError && (
          <span className="text-xs text-danger">remove failed: {String(removeMutation.error)}</span>
        )}
      </div>
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
