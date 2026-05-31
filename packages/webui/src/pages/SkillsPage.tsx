import { useQuery } from "@tanstack/react-query"
import { fetchSkills } from "../lib/api"

export function SkillsPage() {
  const q = useQuery({ queryKey: ["skills"], queryFn: fetchSkills })

  if (q.isLoading) return <p className="text-muted">loading…</p>
  if (q.error) return <p className="text-danger">error: {String(q.error)}</p>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {q.data?.skills.map((s) => (
        <div key={s.name} className="border border-border rounded-md bg-white p-4 space-y-3">
          <h2 className="text-base font-semibold">{s.name}</h2>

          {!s.extracted && (
            <p className="text-muted text-sm">no extracted data — run `skill-recall extract {s.name}`</p>
          )}

          {s.extracted && (
            <>
              <Section title="Trigger phrases" items={s.extracted.static.trigger_phrases} mono />
              <Section title="Do NOT use" items={s.extracted.static.do_not_use_phrases} />
              <Section title="Red flags" items={s.extracted.static.red_flags} />
              <Section title="Workflow steps" items={s.extracted.static.workflow_steps} />

              {s.extracted.llm && (
                <>
                  <hr className="border-border my-2" />
                  <div className="text-xs uppercase text-muted">
                    LLM extracted ({s.extracted.llm.llm_model})
                  </div>
                  <LlmSection
                    title="Implicit constraints"
                    items={s.extracted.llm.implicit_constraints}
                  />
                  <LlmSection
                    title="Hidden anti-patterns"
                    items={s.extracted.llm.hidden_anti_patterns}
                  />
                  <LlmSection
                    title="Downstream handoff required"
                    items={s.extracted.llm.downstream_handoff_required}
                  />
                </>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function Section({
  title,
  items,
  mono = false,
}: {
  title: string
  items: string[]
  mono?: boolean
}) {
  if (!items.length) return null
  return (
    <div>
      <div className="text-[10px] uppercase text-muted mb-1">
        {title} <span className="text-muted/70">({items.length})</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {items.slice(0, 20).map((it, i) => (
          <span key={i} className={mono ? "badge font-mono" : "badge"}>
            {it}
          </span>
        ))}
        {items.length > 20 && (
          <span className="text-xs text-muted">+{items.length - 20} more</span>
        )}
      </div>
    </div>
  )
}

function LlmSection({
  title,
  items,
}: {
  title: string
  items: Array<{ description: string; detection_hint: string }>
}) {
  if (!items.length) return null
  return (
    <div>
      <div className="text-[10px] uppercase text-muted mb-1">
        {title} <span className="text-muted/70">({items.length})</span>
      </div>
      <ul className="space-y-2 text-sm">
        {items.map((it, i) => (
          <li key={i} className="border-l-2 border-accent pl-2">
            <div>{it.description}</div>
            <div className="text-xs text-muted font-mono mt-0.5">→ {it.detection_hint}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
