import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './QuickNavigationOrb.css'

const QUICK_LINKS = [
  { id: 'explore', label: 'Explore', icon: '⌕', to: '/explore' },
  { id: 'how', label: 'How it works', icon: '◉', to: '/how-it-works' },
  { id: 'help', label: 'Help Centre', icon: '?', to: '/help' },
  { id: 'escrow', label: 'Escrow Pro', icon: '◇', to: '/escrow-pro' },
  { id: 'categories', label: 'Categories', icon: '▦', to: '/categories' },
  { id: 'home', label: 'Home', icon: '⌂', to: '/' },
  { id: 'account', label: 'My account', icon: '♙', to: '/login' },
]

const STORAGE_KEY = 'shm.quick-navigation.preferences.v1'
const POSITION_KEY = 'shm.quick-navigation.position.v1'

type OrbPosition = { x: number; y: number }

function readStoredLinks() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return QUICK_LINKS.map((item) => item.id)
    const parsed = JSON.parse(saved)
    if (!Array.isArray(parsed)) return QUICK_LINKS.map((item) => item.id)
    const valid = parsed.filter((id): id is string => QUICK_LINKS.some((item) => item.id === id))
    return valid.length ? valid : QUICK_LINKS.map((item) => item.id)
  } catch {
    return QUICK_LINKS.map((item) => item.id)
  }
}

function readPosition(): OrbPosition | null {
  try {
    const saved = window.localStorage.getItem(POSITION_KEY)
    if (!saved) return null
    const parsed = JSON.parse(saved)
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed
  } catch {
    // Use the responsive default position.
  }
  return null
}

export default function QuickNavigationOrb() {
  const location = useLocation()
  const dragRef = useRef<{ pointerId: number; pointerX: number; pointerY: number; startX: number; startY: number; moved: boolean } | null>(null)
  const [open, setOpen] = useState(false)
  const [customising, setCustomising] = useState(false)
  const [selected, setSelected] = useState<string[]>(() => readStoredLinks())
  const [position, setPosition] = useState<OrbPosition | null>(() => readPosition())
  const [viewport, setViewport] = useState({ width: typeof window === 'undefined' ? 1280 : window.innerWidth, height: typeof window === 'undefined' ? 800 : window.innerHeight })

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selected))
  }, [selected])

  useEffect(() => {
    if (position) window.localStorage.setItem(POSITION_KEY, JSON.stringify(position))
  }, [position])

  useEffect(() => {
    setOpen(false)
    setCustomising(false)
  }, [location.pathname])

  const links = useMemo(
    () => QUICK_LINKS.filter((item) => selected.includes(item.id)),
    [selected],
  )

  const defaultPosition = {
    x: viewport.width - 34,
    y: Math.max(116, viewport.height - (viewport.width <= 720 ? 184 : 150)),
  }
  const center = position || defaultPosition
  const opensRight = center.x < viewport.width / 2
  const radius = viewport.width <= 720 ? 91 : 116
  const arc = links.length > 1 ? links.map((_, index) => -Math.PI / 2 + (Math.PI * index) / (links.length - 1)) : [0]

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
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
    if (!drag.moved) return
    setOpen(false)
    setPosition({
      x: Math.min(viewport.width - 30, Math.max(30, drag.startX + dx)),
      y: Math.min(viewport.height - 38, Math.max(38, drag.startY + dy)),
    })
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      const moved = dragRef.current.moved
      dragRef.current = null
      if (!moved) setOpen((value) => !value)
    }
  }

  function toggleLink(id: string) {
    setSelected((current) => {
      if (current.includes(id)) {
        return current.length > 1 ? current.filter((item) => item !== id) : current
      }
      return [...current, id]
    })
  }

  return (
    <div
      className={`shm-quick-orb ${open ? 'is-open' : ''} ${opensRight ? 'opens-right' : 'opens-left'}`}
      style={{ left: center.x, top: center.y }}
    >
      {open && (
        <div className="shm-quick-orb-items" aria-label="Quick navigation">
          {links.map((item, index) => {
            const angle = arc[index]
            const x = (opensRight ? 1 : -1) * Math.cos(angle) * radius
            const y = Math.sin(angle) * radius
            const active = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/'))
            return (
              <Link
                key={item.id}
                to={item.to}
                className={`shm-quick-orb-link ${active ? 'is-active' : ''}`}
                style={{ '--orb-x': `${x}px`, '--orb-y': `${y}px`, '--orb-delay': `${index * 35}ms` } as CSSProperties}
                aria-label={item.label}
                title={item.label}
                onClick={() => setOpen(false)}
              >
                <span aria-hidden="true">{item.icon}</span>
              </Link>
            )
          })}
        </div>
      )}

      {customising && (
        <div className={`shm-quick-orb-settings ${opensRight ? 'settings-right' : 'settings-left'}`}>
          <div className="shm-quick-orb-settings-head">
            <strong>Quick links</strong>
            <button type="button" onClick={() => setCustomising(false)} aria-label="Close quick link settings">×</button>
          </div>
          <p>Choose the shortcuts you want around your navigation button.</p>
          {QUICK_LINKS.map((item) => (
            <label key={item.id}>
              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleLink(item.id)} />
              <span>{item.icon}</span>
              {item.label}
            </label>
          ))}
        </div>
      )}

      {open && (
        <button
          type="button"
          className="shm-quick-orb-customise"
          onClick={() => setCustomising((value) => !value)}
          aria-label="Customise quick navigation"
          title="Customise shortcuts"
        >
          ⚙
        </button>
      )}

      <button
        type="button"
        className="shm-quick-orb-trigger"
        aria-label={open ? 'Close quick navigation' : 'Open quick navigation'}
        aria-expanded={open}
        title="Quick navigation. Drag to move, tap to open."
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="shm-quick-orb-trigger-symbol" aria-hidden="true">{open ? '×' : '✣'}</span>
        <span className="shm-quick-orb-pulse" />
      </button>
    </div>
  )
}
