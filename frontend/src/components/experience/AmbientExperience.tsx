import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'

const LOCATION_KEY = 'smart-help-market:experience-location:v1'
function readLocation() { try { return window.localStorage.getItem(LOCATION_KEY) || '' } catch { return '' } }
function getTimeScene() {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 20) return 'evening'
  return 'night'
}

export default function AmbientExperience() {
  const route = useLocation()
  const [location, setLocation] = useState(readLocation)
  const [draft, setDraft] = useState(readLocation)
  const [editing, setEditing] = useState(false)
  const [scene, setScene] = useState(getTimeScene)
  useEffect(() => {
    const timer = window.setInterval(() => setScene(getTimeScene()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const next = draft.trim(); setLocation(next)
    try { window.localStorage.setItem(LOCATION_KEY, next) } catch { /* Optional preference. */ }
    setEditing(false)
  }
  const edo = /edo/i.test(location)
  return <div className={`shm-ambient shm-ambient-${scene}`} aria-label={`Marketplace atmosphere: ${scene}`}>
    <span key={route.pathname} className="shm-route-progress" aria-hidden="true" />
    <div className="shm-ambient-sky" aria-hidden="true">
      {scene === 'night' && Array.from({ length: 34 }, (_, index) => <i key={index} className="shm-star" style={{ '--star-index': index, left: `${(index * 37 + 9) % 97}%`, top: `${(index * 61 + 4) % 90}%` } as CSSProperties} />)}
      <span className="shm-ambient-sun" /><span className="shm-ambient-moon" />
      <span className="shm-ambient-cloud shm-cloud-one" /><span className="shm-ambient-cloud shm-cloud-two" />
      {scene === 'morning' && <span className="shm-sun-rays" />}
    </div>
    <div className="shm-ambient-road" aria-hidden="true"><span className="shm-road-line" />
      <span className="shm-road-vehicle shm-car"><i /><b /><em /></span>
      <span className="shm-road-vehicle shm-van"><i /><b /><em /></span>
    </div>
    {edo && <div className="shm-location-billboard" aria-live="polite"><span>WELCOME TO</span><strong>EDO STATE</strong><small>Great opportunities begin here ✨</small></div>}
    <div className="shm-location-control">{editing ? <form onSubmit={saveLocation}><label htmlFor="shm-experience-location">Your location</label><input id="shm-experience-location" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="e.g. Benin City, Edo" autoFocus /><div><button type="submit">Save location</button><button type="button" onClick={() => { setDraft(location); setEditing(false) }}>Cancel</button></div></form> : <button type="button" onClick={() => { setDraft(location); setEditing(true) }} aria-label="Set your marketplace location"><span aria-hidden="true">⌖</span> {location || 'Set your location'} <span aria-hidden="true">✦</span></button>}</div>
  </div>
}
