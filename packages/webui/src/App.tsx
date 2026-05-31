import { NavLink, Route, Routes } from "react-router-dom"
import { FindingsPage } from "./pages/FindingsPage"
import { SessionPage } from "./pages/SessionPage"
import { SkillsPage } from "./pages/SkillsPage"
import { cn } from "./lib/cn"

const navLinkCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    "px-3 py-1.5 text-sm font-medium rounded-md transition",
    isActive ? "bg-accent text-white" : "text-foreground hover:bg-neutral-100"
  )

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <h1 className="text-lg font-bold">skill-recall</h1>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navLinkCls}>
              Findings
            </NavLink>
            <NavLink to="/skills" className={navLinkCls}>
              Skills
            </NavLink>
          </nav>
          <span className="ml-auto text-xs text-muted">Stage A · read-only</span>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4">
        <Routes>
          <Route path="/" element={<FindingsPage />} />
          <Route path="/sessions/:id" element={<SessionPage />} />
          <Route path="/skills" element={<SkillsPage />} />
        </Routes>
      </main>
    </div>
  )
}
