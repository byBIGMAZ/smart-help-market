import { useEffect, useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import { getPublicPlatformSettings } from '../../services/platformSettings'

function getTimeScene() {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 20) return 'evening'
  return 'night'
}

export default function AmbientExperience() {
  const route = useLocation()
  const [scene, setScene] = useState(getTimeScene)
  const [vehicleBrand, setVehicleBrand] = useState('')
  useEffect(() => {
    let active = true
    getPublicPlatformSettings().then((settings) => {
      if (!active) return
      const words = settings['platform.name'].trim().split(/\s+/)
      setVehicleBrand(words[words.length - 1] || '')
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const timer = window.setInterval(() => setScene(getTimeScene()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  return <div className={`shm-ambient shm-ambient-${scene}`} aria-label={`Marketplace atmosphere: ${scene}`}>
    <span key={route.pathname} className="shm-route-progress" aria-hidden="true" />
    <div className="shm-ambient-sky" aria-hidden="true">
      {scene === 'night' && Array.from({ length: 34 }, (_, index) => <i key={index} className="shm-star" style={{ '--star-index': index, left: `${(index * 37 + 9) % 97}%`, top: `${(index * 61 + 4) % 90}%` } as CSSProperties} />)}
      <span className="shm-ambient-sun" /><span className="shm-ambient-moon" />
      <span className="shm-ambient-cloud shm-cloud-one" /><span className="shm-ambient-cloud shm-cloud-two" />
      {scene === 'morning' && <span className="shm-sun-rays" />}
    </div>
    <div className="shm-ambient-road" aria-hidden="true"><span className="shm-road-line" />
      <span className="shm-road-vehicle shm-car"><i /><b /><em /><strong className="shm-vehicle-brand">{vehicleBrand}</strong></span>
      <span className="shm-road-vehicle shm-van"><i /><b /><em /><strong className="shm-vehicle-brand">{vehicleBrand}</strong></span>
      <span className="shm-road-bus" data-brand={vehicleBrand}><i /><b /><em className="shm-bus-headlight" /></span>
    </div>
  </div>
}
