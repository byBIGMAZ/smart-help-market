import { useEffect, useState, type ChangeEvent } from 'react'
import './ProfilePhotoSlideshow.css'

interface ProfilePhotoSlideshowProps {
  storageKey: string
  initialImage?: string | null
  displayName?: string
}

function readPhotos(storageKey: string, initialImage?: string | null): string[] {
  try {
    const saved = window.localStorage.getItem(storageKey)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item.startsWith('data:image/')).slice(0, 2)
      }
    }
  } catch {
    // Keep the profile photo placeholder available if browser storage is unavailable.
  }
  return initialImage ? [initialImage] : []
}

export default function ProfilePhotoSlideshow({ storageKey, initialImage, displayName }: ProfilePhotoSlideshowProps) {
  const [photos, setPhotos] = useState<string[]>(() => readPhotos(storageKey, initialImage))
  const [activeIndex, setActiveIndex] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    setPhotos(readPhotos(storageKey, initialImage))
    setActiveIndex(0)
  }, [storageKey, initialImage])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(photos))
    } catch {
      setError('Photo storage is full. Remove a photo or choose a smaller image.')
    }
  }, [photos, storageKey])

  useEffect(() => {
    if (photos.length < 2) return
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % photos.length), 3600)
    return () => window.clearInterval(timer)
  }, [photos.length])

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    setError('')
    const available = Math.max(0, 2 - photos.length)
    if (!available) {
      setError('You can display a maximum of two profile photos.')
      return
    }
    const selected = files.slice(0, available)
    if (selected.some((file) => !file.type.startsWith('image/'))) {
      setError('Please select image files only.')
      return
    }
    if (selected.some((file) => file.size > 1024 * 1024)) {
      setError('Each photo must be 1 MB or smaller for this preview.')
      return
    }
    try {
      const encoded = await Promise.all(selected.map((file) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read image.'))
        reader.onerror = () => reject(new Error('Unable to read image.'))
        reader.readAsDataURL(file)
      })))
      setPhotos((current) => [...current, ...encoded].slice(0, 2))
      setActiveIndex(0)
    } catch {
      setError('Unable to load the selected photo. Please try again.')
    }
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))
    setActiveIndex(0)
    setError('')
  }

  return (
    <section className="shm-profile-photo-card" aria-label="Dashboard profile photos">
      <div className="shm-profile-photo-frame">
        {photos.length > 0 ? (
          <img src={photos[activeIndex] || photos[0]} alt={displayName ? `${displayName} profile` : 'Profile'} />
        ) : (
          <div className="shm-profile-photo-empty" aria-hidden="true">
            <span>♙</span>
            <small>PROFILE PHOTO</small>
          </div>
        )}
        {photos.length > 1 && (
          <div className="shm-profile-photo-dots" aria-label={`${photos.length} profile photos`}>
            {photos.map((_, index) => <button key={index} type="button" className={index === activeIndex ? 'is-active' : ''} onClick={() => setActiveIndex(index)} aria-label={`Show photo ${index + 1}`} />)}
          </div>
        )}
      </div>
      <div className="shm-profile-photo-controls">
        <label className="shm-profile-photo-upload">
          <input type="file" accept="image/*" multiple onChange={handleUpload} disabled={photos.length >= 2} />
          {photos.length ? 'Add another photo' : 'Upload photo'}
        </label>
        {photos.length > 0 && <button type="button" className="shm-profile-photo-remove" onClick={() => removePhoto(activeIndex)}>Remove</button>}
        <small>{photos.length}/2 photos</small>
      </div>
      {error && <p className="shm-profile-photo-error" role="alert">{error}</p>}
    </section>
  )
}
