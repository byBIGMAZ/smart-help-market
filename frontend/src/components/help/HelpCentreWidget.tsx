import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import HelpCentreChat from './HelpCentreChat'
import './HelpCentreWidget.css'

type Position = { x: number; y: number }
const POSITION_KEY = 'shm.help-centre-launcher.position.v1'

function loadPosition(): Position | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(POSITION_KEY) || 'null')
    if (value && typeof value.x === 'number' && typeof value.y === 'number') return value
  } catch {
    // Fall back to the default bottom-corner position.
  }
  return null
}

export default function HelpCentreWidget() {
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [position, setPosition] = useState<Position | null>(() => loadPosition())
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null)

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (position) window.localStorage.setItem(POSITION_KEY, JSON.stringify(position))
  }, [position])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    setPosition((current) => {
      if (!current) return current
      const next = {
        x: Math.max(28, Math.min(viewport.width - 28, current.x)),
        y: Math.max(32, Math.min(viewport.height - 32, current.y)),
      }
      return next.x === current.x && next.y === current.y ? current : next
    })
  }, [viewport.width, viewport.height])

  const center = position || {
    x: viewport.width - 40,
    y: viewport.height - (viewport.width <= 720 ? 106 : 50),
  }
  const panelWidth = Math.min(430, viewport.width - 24)
  const panelHeight = Math.min(650, viewport.height - (viewport.width <= 720 ? 104 : 28))
  const panelTop = Math.max(12, Math.min(viewport.height - panelHeight - 12, center.y - panelHeight + 28))
  const opensRight = center.x < viewport.width / 2
  const panelStyle = {
    top: panelTop,
    height: panelHeight,
    width: panelWidth,
    ...(opensRight
      ? { left: Math.min(viewport.width - panelWidth - 12, center.x + 28) }
      : { right: Math.min(viewport.width - panelWidth - 12, viewport.width - center.x + 28) }),
  }

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: center.x,
      originY: center.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (Math.abs(dx) + Math.abs(dy) > 5) current.moved = true
    if (!current.moved) return
    setOpen(false)
    setPosition({
      x: Math.max(28, Math.min(viewport.width - 28, current.originX + dx)),
      y: Math.max(32, Math.min(viewport.height - 32, current.originY + dy)),
    })
  }

  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    const moved = drag.current.moved
    drag.current = null
    if (!moved) setOpen((value) => !value)
  }

  return createPortal(
    <div className="shm-help-widget-root">
      {open && <button type="button" className="shm-help-widget-backdrop" aria-label="Close Help Centre" onClick={() => setOpen(false)}/>}
      {open && (
        <div className="shm-help-widget-panel" style={panelStyle}>
          <HelpCentreChat mode="floating" onClose={() => setOpen(false)}/>
        </div>
      )}
      <button
        type="button"
        className={`shm-help-widget-trigger ${open ? 'is-open' : ''}`}
        style={{ left: center.x, top: center.y }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        aria-label={open ? 'Close Help Centre' : 'Open SMART HELP assistant'}
        aria-expanded={open}
        title="Drag to move. Click to open SMART HELP."
      >
        <span className="shm-help-trigger-spark" aria-hidden="true">✦</span>
        <span className="shm-help-trigger-bubble" aria-hidden="true">•••</span>
        {!open && <i aria-hidden="true"/>}
      </button>
    </div>,
    document.body,
  )
}
