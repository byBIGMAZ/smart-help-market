import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import './WorkspaceFloatingSidebar.css'

type WorkspaceLink = { label: string; path: string }
type Position = { x: number; y: number }
const POSITION_KEY = 'shm.workspace-floating-sidebar.position.v2'

function readPosition(): Position | null {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY)
    if (!raw) return null
    const value = JSON.parse(raw)
    if (typeof value.x === 'number' && typeof value.y === 'number') return value
  } catch {
    // Use a viewport-aware default position.
  }
  return null
}

export default function WorkspaceFloatingSidebar({ links, onNavigate, activePath }: { links: WorkspaceLink[]; onNavigate?: (path: string) => void; activePath?: string }) {
  const { pathname } = useLocation()
  const dragRef = useRef<{ pointerId: number; pointerX: number; pointerY: number; startX: number; startY: number; moved: boolean } | null>(null)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [position, setPosition] = useState<Position | null>(() => readPosition())
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    if (position) window.localStorage.setItem(POSITION_KEY, JSON.stringify(position))
  }, [position])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const center = position || {
    x: viewport.width - 34,
    y: Math.max(110, Math.min(viewport.height - 110, viewport.height * 0.56)),
  }
  const buttonOnLeft = center.x < viewport.width / 2
  const panelWidth = Math.min(330, viewport.width - 28)
  const panelMaxHeight = Math.min(480, viewport.height - 24)
  const panelTop = Math.max(12, Math.min(viewport.height - panelMaxHeight - 12, center.y - panelMaxHeight / 2))
  const panelStyle: CSSProperties = {
    top: panelTop,
    width: panelWidth,
    maxHeight: panelMaxHeight,
    ...(buttonOnLeft
      ? { left: Math.min(viewport.width - panelWidth - 12, center.x + 40) }
      : { right: Math.min(viewport.width - panelWidth - 12, viewport.width - center.x + 40) }),
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    dragRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: center.x,
      startY: center.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.pointerX
    const dy = event.clientY - drag.pointerY
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true
    if (!drag.moved) return
    setOpen(false)
    setPosition({
      x: Math.max(28, Math.min(viewport.width - 28, drag.startX + dx)),
      y: Math.max(36, Math.min(viewport.height - 36, drag.startY + dy)),
    })
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    const moved = dragRef.current.moved
    dragRef.current = null
    if (!moved) setOpen((current) => !current)
  }

  return createPortal(
    <div className="shm-workspace-float-root">
      {open && (
        <button
          type="button"
          className="shm-workspace-float-backdrop"
          aria-label="Close workspace navigation"
          onClick={() => setOpen(false)}
        />
      )}

      {open && (
        <aside
          className={`shm-workspace-float-panel ${buttonOnLeft ? 'panel-opens-right' : 'panel-opens-left'}`}
          style={panelStyle}
          aria-label="Workspace navigation"
        >
          <div className="shm-workspace-float-panel-head">
            <div><span>QUICK ACCESS</span><strong>Workspace navigation</strong></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation">×</button>
          </div>
          <nav>
            {links.map((item, index) => (
              <Link
                key={item.path}
                to={item.path}
                className={item.path === (activePath ?? pathname) ? 'is-active' : ''}
                aria-current={item.path === (activePath ?? pathname) ? 'page' : undefined}
                onClick={(event) => {
                  if (onNavigate) {
                    event.preventDefault()
                    onNavigate(item.path)
                  }
                  setOpen(false)
                }}
              >
                <span className="shm-workspace-float-link-index">{String(index + 1).padStart(2, '0')}</span>
                <span>{item.label}</span>
                <span className="shm-workspace-float-link-arrow" aria-hidden="true">›</span>
              </Link>
            ))}
          </nav>
        </aside>
      )}

      <button
        type="button"
        className={`shm-workspace-float-trigger ${open ? 'is-open' : ''}`}
        style={{ left: center.x, top: center.y }}
        aria-label={open ? 'Close workspace navigation' : 'Open workspace navigation'}
        aria-expanded={open}
        title="Drag to move. Click to open workspace navigation."
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span aria-hidden="true">{open ? '×' : '☰'}</span>
        {!open && <i aria-hidden="true" />}
      </button>
    </div>,
    document.body,
  )
}
