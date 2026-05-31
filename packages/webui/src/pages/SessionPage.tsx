import { useQuery } from "@tanstack/react-query"
import { useParams, useSearchParams, Link } from "react-router-dom"
import { useEffect, useMemo, useRef } from "react"
import { fetchSession } from "../lib/api"
import { cn } from "../lib/cn"

const ALL_KINDS = ["user", "assistant", "tool_call", "tool_result", "error", "meta"] as const
type Kind = (typeof ALL_KINDS)[number]

// 默认隐 meta(通常是空字段噪音)
const DEFAULT_KINDS: Kind[] = ["user", "assistant", "tool_call", "tool_result", "error"]

export function SessionPage() {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const source = params.get("source") ?? "claude"
  const highlightRaw = params.get("highlight")
  const highlight = highlightRaw ? Number(highlightRaw) : undefined
  const kindsParam = params.get("kinds")

  // URL kinds 解析: 空 = 默认; 有值 = 用户显式设置
  const activeKinds = useMemo<Set<Kind>>(() => {
    if (kindsParam === null) return new Set(DEFAULT_KINDS)
    if (kindsParam === "") return new Set()  // 显式清空也保留
    return new Set(kindsParam.split(",").filter((k): k is Kind => ALL_KINDS.includes(k as Kind)))
  }, [kindsParam])

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
  }, [q.data, highlight, kindsParam])

  const toggleKind = (k: Kind) => {
    const next = new Set(activeKinds)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    const nextParams = new URLSearchParams(params)
    // 如果跟默认完全一致, 去掉 URL 参数让 URL 更干净
    const isDefault =
      next.size === DEFAULT_KINDS.length && DEFAULT_KINDS.every((d) => next.has(d))
    if (isDefault) nextParams.delete("kinds")
    else nextParams.set("kinds", [...next].join(","))
    setParams(nextParams)
  }

  // 计算每个 kind 的 count(用于 checkbox label)
  const kindCounts = useMemo<Record<Kind, number>>(() => {
    const counts = Object.fromEntries(ALL_KINDS.map((k) => [k, 0])) as Record<Kind, number>
    if (!q.data) return counts
    for (const e of q.data.events) {
      if ((counts as Record<string, number>)[e.kind] !== undefined) counts[e.kind as Kind]++
    }
    return counts
  }, [q.data])

  if (!id) return <p>missing session id</p>
  if (q.isLoading) return <p className="text-muted">loading session…</p>
  if (q.error) return <p className="text-danger">error: {String(q.error)}</p>
  if (!q.data) return <p className="text-muted">no session data</p>

  // 应用过滤; 高亮 event 强制显示(避免跳转后空白)
  const visibleEvents = q.data.events
    .map((e, i) => ({ event: e, index: i }))
    .filter(({ event, index }) => {
      if (highlight !== undefined && index === highlight) return true
      return activeKinds.has(event.kind as Kind)
    })

  const hiddenCount = q.data.events.length - visibleEvents.length

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

      {/* Kind filter */}
      <div className="border border-border rounded-md bg-white px-3 py-2 flex items-center gap-3 flex-wrap text-sm">
        <span className="text-[10px] uppercase text-muted">show</span>
        {ALL_KINDS.map((k) => {
          const checked = activeKinds.has(k)
          const count = kindCounts[k]
          return (
            <label
              key={k}
              className={cn(
                "inline-flex items-center gap-1 cursor-pointer select-none",
                count === 0 && "opacity-40"
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleKind(k)}
                className="accent-accent"
              />
              <span className="font-mono text-xs">{k}</span>
              <span className="text-xs text-muted">({count})</span>
            </label>
          )
        })}
        {hiddenCount > 0 && (
          <span className="ml-auto text-xs text-muted">
            {visibleEvents.length} shown · {hiddenCount} hidden
            {highlight !== undefined && !activeKinds.has(q.data.events[highlight]?.kind as Kind) && (
              <span className="ml-1 text-warning">(highlight forced visible)</span>
            )}
          </span>
        )}
      </div>

      <div className="border border-border rounded-md bg-white">
        <ul className="divide-y divide-border max-h-[70vh] overflow-auto">
          {visibleEvents.length === 0 && (
            <li className="p-4 text-muted text-sm">no events match the filter</li>
          )}
          {visibleEvents.map(({ event: e, index: i }) => {
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
