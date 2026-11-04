import { useEffect, useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'

const LOCATION_KEY = 'smart-help-market:experience-location:v1'
function readLocation() { try { return window.localStorage.getItem(LOCATION_KEY) || window.localStorage.getItem('smart-help-market:profile-location:v1') || '' } catch { return '' } }
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
  const [scene, setScene] = useState(getTimeScene)
  useEffect(() => {
    const timer = window.setInterval(() => setScene(getTimeScene()), 60000)
    return () => window.clearInterval(timer)
  }, [])
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
    {edo && <div className="shm-location-billboard" aria-live="polite"><div className="shm-billboard-face"><span>WELCOME TO</span><strong>{location.toUpperCase()}</strong><small>Great opportunities begin here ✨</small></div><i className="shm-billboard-pole pole-left"/><i className="shm-billboard-pole pole-right"/></div>
    <div className="shm-ambient-road" aria-hidden="true"><span className="shm-road-line"/><span className="shm-road-bus"><i/><b/><em/></span></div>}
  </div>
}
