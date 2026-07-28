
import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import DocPage from './components/DocPage'
import ThemeToggle from './components/ThemeToggle'
import docsData from '../docs-data.json'

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1))
  useEffect(() => {
    const onHash = () => setHash(window.location.hash.slice(1))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return [hash, (h) => { window.location.hash = h }]
}

export default function App() {
  const [active, setActive] = useHash()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const modules = docsData.modules || []
  const activeModule = modules.find(m => m.package === active) || modules[0] || null

  useEffect(() => {
    if (!active && modules.length > 0) {
      setActive(modules[0].package)
    }
  }, [active, modules, setActive])

  return (
    <div className="docs-shell h-screen flex flex-col">
      <ThemeToggle />
      <header className="docs-topbar shrink-0 h-14 flex items-center px-4 border-b border-az-75 bg-az-85">
        <button
          className="lg:hidden mr-3 p-1 rounded text-az-30 hover:bg-az-75 cursor-pointer"
          onClick={() => setSidebarOpen(o => !o)}
          aria-label="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <rect y="3" width="20" height="2" rx="1" />
            <rect y="9" width="20" height="2" rx="1" />
            <rect y="15" width="20" height="2" rx="1" />
          </svg>
        </button>
        <div className="docs-brand flex items-center gap-2">
          <img src="/azora_logo.svg" alt="Azora" className="docs-brand__logo" />
          <h1 className="text-base font-semibold text-az-10">Azora</h1>
          <span className="docs-brand__product">Standard Library</span>
          <span className="version-tag">v{docsData.version}</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 docs-sidebar
          fixed lg:static inset-y-14 left-0 z-30
          w-56 shrink-0 border-r border-az-75
          bg-az-85
          transition-transform lg:transition-none
        `}>
          <Sidebar
            modules={modules}
            active={active || activeModule?.package}
            onSelect={setActive}
            onClose={() => setSidebarOpen(false)}
          />
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="docs-main flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-6 pt-4">
            <div className="rounded-lg border border-pastel-blue/40 bg-pastel-blue/10 px-4 py-3 text-sm text-az-30">
              <strong className="text-az-10">Azora {docsData.version} API reference.</strong>{' '}
              Generated from the standard-library sources shipped with this language release.
            </div>
          </div>
          <DocPage module={activeModule} />
        </main>
      </div>
    </div>
  )
}
