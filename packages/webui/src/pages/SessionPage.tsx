import { useQuery } from "@tanstack/react-query"
import { useParams, useSearchParams, Link } from "react-router-dom"
import { useEffect, useRef } from "react"
import { fetchSession } from "../lib/api"
import { cn } from "../lib/cn"

export function SessionPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const source = params.get("source") ?? "claude"
  const highlightRaw = params.get("highlight")
  const highlight = highlightRaw ? Number(highlightRaw) : undefined

  const q = useQuery({
    queryKey: ["session", id, source],
    queryFn: () => fetchSession(id!, source),
    enabled: !!id,
  })

  const highlightedRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: "auto", block: "center" })
    }
  }, [q.data, highlight])

  if (!id) return <p>missing session id</p>
  if (q.isLoading) return <p className="text-muted">loading session…</p>
  if (q.error) return <p className="text-danger">error: {String(q.error)}</p>
  if (!q.data) return <p className="text-muted">no session data</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link to="/" className="btn">← back to findings</Link>
        <h2 className="text-base font-semibold font-mono">{q.data.short_id}</h2>
        <span className="badge">{q.data.source_display}</span>
        {q.data.title && <span className="text-sm text-muted truncate">{q.data.title}</span>}
      </div>

      <div className="text-xs text-muted grid grid-cols-4 gap-2">
        <Meta label="events" value={String(q.data.event_count)} />
        <Meta label="cwd" value={q.data.cwd ?? "-"} />
        <Meta label="repo" value={q.data.repo_name ?? "-"} />
        <Meta label="modified" value={q.data.modified_at.slice(0, 19)} />
      </div>

      <div className="border border-border rounded-md bg-white">
        <ul className="divide-y divide-border max-h-[70vh] overflow-auto">
          {q.data.events.map((e, i) => {
            const isHighlight = highlight !== undefined && i === highlight
            return (
              <li
                ref={isHighlight ? highlightedRef : undefined}
                key={e.id}
                className={cn(
                  "px-3 py-2 text-xs font-mono",
                  isHighlight && "bg-yellow-100 border-l-4 border-warning",
                  e.kind === "user" && !isHighlight && "bg-blue-50/50",
                  e.kind === "error" && "bg-red-50/50"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-muted">[{i}]</span>
                  <span className="badge text-[10px]">{e.kind}</span>
                  {e.tool_name && <span className="badge text-[10px]">{e.tool_name}</span>}
                  <span className="text-muted">{e.timestamp?.slice(11, 19) ?? ""}</span>
                </div>
                {e.text && (
                  <pre className="whitespace-pre-wrap break-words text-foreground/80 max-h-60 overflow-auto">
                    {e.text}
                  </pre>
                )}
              </li>
            )
          })}
        </ul>
      </div>
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
