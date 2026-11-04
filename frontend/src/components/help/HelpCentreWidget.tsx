import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import HelpCentreChat from './HelpCentreChat'
import './HelpCentreWidget.css'

export default function HelpCentreWidget() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return createPortal(
    <div className="shm-help-widget-root">
      {open && (
        <button
          type="button"
          className="shm-help-widget-backdrop"
          aria-label="Close Help Centre"
          onClick={() => setOpen(false)}
        />
      )}
      {open && (
        <div className="shm-help-widget-panel">
          <HelpCentreChat mode="floating" onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        type="button"
        className={`shm-help-widget-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close Help Centre' : 'Open BIGMAZ AI assistant'}
        aria-expanded={open}
        title="Open BIGMAZ AI"
      >
        <span className="shm-help-trigger-spark" aria-hidden="true">✦</span>
        <span className="shm-help-trigger-bubble" aria-hidden="true">•••</span>
        {!open && <i aria-hidden="true"/>}
      </button>
    </div>,
    document.body,
  )
}
