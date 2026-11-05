import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  getPublicCategories,
  type MarketplaceCategory,
} from '../../services/marketplaceCategories'
import { createOwnerListingDraft, updateOwnerListingDraft } from '../../services/ownerListingDrafts'
import './ListingEditorPage.css'

type ListingKind = 'properties' | 'products' | 'services'

type FormValues = Record<string, string>

interface MediaItem {
  name: string
  url: string
}

interface PropertyUnit {
  id: string
  name: string
  rent: string
  bedrooms: string
  bathrooms: string
  description: string
  photos: MediaItem[]
  videoUrl: string
}

interface Draft {
  values: FormValues
  units: Omit<PropertyUnit, 'photos' | 'videoUrl'>[]
  categoryKey?: string
  serverListingId?: string
  updatedAt: string
}

const propertyTypes = [
  'Self-contained',
  'Single room',
  'Apartment / Flat',
  'Duplex',
  'House',
  'Hostel',
  'Land',
  'Commercial property',
  'Shortlet',
  'Other',
]

const emptyValues: FormValues = {
  title: '',
  description: '',
  price: '',
  priceUnit: 'Negotiable',
  location: '',
  propertyType: 'Self-contained',
  purpose: 'For rent',
  unitCount: '1',
  area: '',
  furnishing: '',
  facilities: '',
  landUse: '',
  dimensions: '',
  productType: '',
  condition: 'Brand new',
  brand: '',
  stock: '1',
  delivery: 'Both',
  warranty: '',
  serviceType: '',
  experience: '',
  serviceArea: '',
  deliveryMode: 'On-site',
  availability: 'By appointment',
}

function createUnit(index: number): PropertyUnit {
  return {
    id: `unit-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    name: `Unit ${index + 1}`,
    rent: '',
    bedrooms: '',
    bathrooms: '',
    description: '',
    photos: [],
    videoUrl: '',
  }
}

function formatPrice(value: string) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0
    ? `₦${amount.toLocaleString('en-NG')}`
    : 'Price not set'
}

function CameraStudio({
  onRecorded,
  onClose,
}: {
  onRecorded: (url: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const frameRef = useRef<number | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const [cameraReady, setCameraReady] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    let active = true

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera recording requires HTTPS or localhost.')
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        })

        if (!active) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        setCameraReady(true)

        const canvas = canvasRef.current
        const video = videoRef.current
        const context = canvas?.getContext('2d')

        function drawFrame() {
          if (!canvas || !video || !context) return

          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height)

            const watermark = 'SMART HELP MARKET'
            const padding = 22
            const fontSize = 27

            context.font = `bold ${fontSize}px Arial`
            const textWidth = context.measureText(watermark).width

            context.fillStyle = 'rgba(0, 0, 0, 0.55)'
            context.fillRect(
              canvas.width - textWidth - padding * 2,
              canvas.height - 65,
              textWidth + padding * 2,
              43,
            )

            context.fillStyle = '#ffffff'
            context.fillText(
              watermark,
              canvas.width - textWidth - padding,
              canvas.height - 36,
            )

            context.font = '16px Arial'
            context.fillStyle = 'rgba(255,255,255,.85)'
            context.fillText('MARKETPLACE VERIFIED RECORDING', 22, canvas.height - 25)
          }

          frameRef.current = requestAnimationFrame(drawFrame)
        }

        drawFrame()
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to access your camera. Check browser permissions.',
        )
      }
    }

    startCamera()

    return () => {
      active = false

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
      }

      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  function startRecording() {
    const canvas = canvasRef.current
    const stream = streamRef.current

    if (!canvas || !stream || !cameraReady) return

    try {
      const canvasStream = canvas.captureStream(30)
      stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track))

      const mimeType = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find((type) => MediaRecorder.isTypeSupported(type))

      const recorder = new MediaRecorder(
        canvasStream,
        mimeType ? { mimeType } : undefined,
      )

      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'video/webm',
        })

        const url = URL.createObjectURL(blob)
        onRecorded(url)
        canvasStream.getTracks().forEach((track) => track.stop())
        onClose()
      }

      recorderRef.current = recorder
      recorder.start(1000)
      setRecording(true)
      setElapsed(0)

      const startedAt = Date.now()
      const interval = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt) / 1000))
      }, 1000)

      recorder.addEventListener('stop', () => window.clearInterval(interval), {
        once: true,
      })
    } catch {
      setError('Your browser could not start video recording.')
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') {
      setRecording(false)
      recorderRef.current.stop()
    }
  }

  return (
    <div className="smart-camera-backdrop" role="presentation">
      <section className="smart-camera" role="dialog" aria-modal="true" aria-labelledby="camera-title">
        <header className="smart-camera-heading">
          <div>
            <span className="listing-editor-kicker">UNIT MEDIA STUDIO</span>
            <h2 id="camera-title">Record property video</h2>
          </div>
          <button type="button" className="smart-icon-button" onClick={onClose} aria-label="Close camera">×</button>
        </header>

        <video ref={videoRef} autoPlay muted playsInline className="smart-camera-source" />
        <canvas ref={canvasRef} width={1280} height={720} className="smart-camera-canvas" />

        {error && <p className="listing-editor-error">{error}</p>}

        <div className="smart-camera-watermark">
          <span>●</span> SMART HELP MARKET WATERMARK
        </div>

        <div className="smart-camera-controls">
          {recording ? (
            <>
              <span className="smart-recording-indicator">
                <span /> Recording {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
              </span>
              <button type="button" className="smart-record-button smart-record-stop" onClick={stopRecording}>
                Stop and save
              </button>
            </>
          ) : (
            <button
              type="button"
              className="smart-record-button"
              disabled={!cameraReady}
              onClick={startRecording}
            >
              <span /> Start recording
            </button>
          )}
        </div>

        <p className="smart-camera-note">
          Video is captured directly through your browser. The temporary marketplace
          watermark is embedded in the recording. The official logo will replace it
          when branding settings are configured.
        </p>
      </section>
    </div>
  )
}

export default function ListingEditorPage() {
  const location = useLocation()

  const kind: ListingKind = location.pathname.startsWith('/seller/')
    ? 'products'
    : location.pathname.startsWith('/provider/')
      ? 'services'
      : 'properties'

  const storageKey = `smart-help-market-listing-draft-${kind}`

  const [values, setValues] = useState<FormValues>(emptyValues)
  const [categories, setCategories] = useState<MarketplaceCategory[]>([])
  const [categoryKey, setCategoryKey] = useState('')
  const [units, setUnits] = useState<PropertyUnit[]>([createUnit(0)])
  const [productImages, setProductImages] = useState<MediaItem[]>([])
  const [serviceImages, setServiceImages] = useState<MediaItem[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [cameraUnitId, setCameraUnitId] = useState<string | null>(null)
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const [serverListingId, setServerListingId] = useState('')
  const [isSavingDraft, setIsSavingDraft] = useState(false)

  const category = categories.find((item) => item.key === categoryKey)

  const propertyType = values.propertyType || 'Self-contained'
  const isLand = propertyType === 'Land'
  const isSelfContained = propertyType === 'Self-contained'
  const isSingleRoom = propertyType === 'Single room'
  const isHostel = propertyType === 'Hostel'
  const isCommercial = propertyType === 'Commercial property'
  const usesUnits = !isLand

  const heading = kind === 'properties'
    ? 'Build your property listing'
    : kind === 'products'
      ? 'Build your product listing'
      : 'Build your service listing'

  const description = kind === 'properties'
    ? 'Tell us about the property. Your questions will adapt to the type you select.'
    : kind === 'products'
      ? 'Show customers what you sell with clear specifications and inventory.'
      : 'Help customers understand your service, coverage and availability.'

  useEffect(() => {
    let active = true

    getPublicCategories().then((items) => {
      if (active) setCategories(items)
    }).catch(() => {
      if (active) setError('Marketplace categories could not be loaded. You can continue once they are available.')
    })

    try {
      const saved = localStorage.getItem(storageKey)

      if (saved) {
        const draft = JSON.parse(saved) as Draft

        if (draft.values && typeof draft.values === 'object') {
          setValues({ ...emptyValues, ...draft.values })
          if (typeof draft.categoryKey === 'string') setCategoryKey(draft.categoryKey)
          if (typeof draft.serverListingId === 'string') setServerListingId(draft.serverListingId)
          setRestored(true)

          if (Array.isArray(draft.units) && draft.units.length) {
            setUnits(draft.units.map((unit) => ({
              ...createUnit(0),
              ...unit,
              photos: [],
              videoUrl: '',
            })))
          }
        }
      }
    } catch {
      localStorage.removeItem(storageKey)
    }

    return () => {
      active = false
    }
  }, [storageKey])

  useEffect(() => {
    return () => {
      productImages.forEach((item) => URL.revokeObjectURL(item.url))
      serviceImages.forEach((item) => URL.revokeObjectURL(item.url))
      units.forEach((unit) => {
        unit.photos.forEach((item) => URL.revokeObjectURL(item.url))
        if (unit.videoUrl) URL.revokeObjectURL(unit.videoUrl)
      })
    }
  }, [productImages, serviceImages, units])

  const totalPropertyPhotos = useMemo(
    () => units.reduce((total, unit) => total + unit.photos.length, 0),
    [units],
  )

  function updateField(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
    setNotice('')
    setError('')
  }

  function updateUnit(id: string, field: keyof PropertyUnit, value: string) {
    setUnits((current) => current.map((unit) =>
      unit.id === id ? { ...unit, [field]: value } : unit,
    ))
  }

  function updateUnitCount(raw: string) {
    const count = Math.max(1, Math.min(100, Number(raw) || 1))

    updateField('unitCount', String(count))

    setUnits((current) => {
      if (count < current.length) {
        current.slice(count).forEach((unit) => {
          unit.photos.forEach((item) => URL.revokeObjectURL(item.url))
          if (unit.videoUrl) URL.revokeObjectURL(unit.videoUrl)
        })
        return current.slice(0, count)
      }

      return [
        ...current,
        ...Array.from({ length: count - current.length }, (_, index) =>
          createUnit(current.length + index),
        ),
      ]
    })
  }

  function handlePhotos(
    files: FileList | null,
    onAdd: (items: MediaItem[]) => void,
    existingCount: number,
  ) {
    if (!files) return

    const selected = Array.from(files)
    const valid = selected.filter((file) =>
      file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024,
    )

    if (valid.length !== selected.length) {
      setError('Only image files up to 10 MB each are accepted.')
    }

    if (existingCount + valid.length > 10) {
      setError('Each gallery can contain a maximum of 10 photographs.')
      return
    }

    onAdd(valid.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    })))
  }

  function addUnitPhotos(id: string, files: FileList | null) {
    const unit = units.find((item) => item.id === id)
    if (!unit) return

    handlePhotos(files, (items) => {
      setUnits((current) => current.map((item) =>
        item.id === id ? { ...item, photos: [...item.photos, ...items] } : item,
      ))
    }, unit.photos.length)
  }

  function removeUnitPhoto(id: string, index: number) {
    setUnits((current) => current.map((unit) => {
      if (unit.id !== id) return unit

      const removed = unit.photos[index]
      if (removed) URL.revokeObjectURL(removed.url)

      return {
        ...unit,
        photos: unit.photos.filter((_, photoIndex) => photoIndex !== index),
      }
    }))
  }

  async function saveDraft() {
    setIsSavingDraft(true)
    setNotice('')
    setError('')

    const draft: Draft = {
      values,
      units: units.map(({ photos, videoUrl, ...unit }) => unit),
      categoryKey,
      serverListingId,
      updatedAt: new Date().toISOString(),
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(draft))
    } catch {
      setError('Unable to save your local recovery copy. Check your browser storage.')
      setIsSavingDraft(false)
      return
    }

    if (!categoryKey) {
      setNotice('Your draft is saved in this browser. Select a marketplace category to also save it to your account.')
      setIsSavingDraft(false)
      return
    }

    try {
      const payload = {
        categoryKey,
        details: {
          version: 1 as const,
          kind,
          values,
          units: kind === 'properties'
            ? (isLand ? [] : units.map(({ photos, videoUrl, ...unit }) => unit))
            : [],
        },
      }

      const saved = serverListingId
        ? await updateOwnerListingDraft(serverListingId, payload)
        : await createOwnerListingDraft(payload)

      const nextDraft: Draft = {
        ...draft,
        serverListingId: saved.id,
        updatedAt: new Date().toISOString(),
      }
      setServerListingId(saved.id)
      localStorage.setItem(storageKey, JSON.stringify(nextDraft))
      setNotice('Your draft is saved to your marketplace account and this browser. It has not been published.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Marketplace draft synchronisation failed.'
      setError('Your local draft is safe, but it could not be synced to your marketplace account: ' + message)
    } finally {
      setIsSavingDraft(false)
    }
  }

  function validateAndPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setError('')

    if (!categoryKey) {
      setError('Please select a marketplace category.')
      return
    }

    if (kind === 'properties' && usesUnits) {
      const missingUnit = units.find((unit) => !unit.name.trim())

      if (missingUnit) {
        setError('Every property unit must have a name.')
        return
      }
    }

    setShowPreview(true)
  }

  const propertyDetails = (
    <>
      <div className="smart-section-heading">
        <span>02</span>
        <div>
          <h2>What type of property?</h2>
          <p>Selecting a property type changes the information we request.</p>
        </div>
      </div>

      <label className="listing-editor-field">
        Property type
        <select
          value={propertyType}
          onChange={(event) => {
            updateField('propertyType', event.target.value)
            setUnits([createUnit(0)])
            setExpandedUnit(null)
          }}
        >
          {propertyTypes.map((type) => <option key={type}>{type}</option>)}
        </select>
      </label>

      <label className="listing-editor-field">
        Listing purpose
        <select value={values.purpose} onChange={(event) => updateField('purpose', event.target.value)}>
          <option>For rent</option>
          <option>For sale</option>
          <option>Shortlet</option>
        </select>
      </label>

      {isLand ? (
        <div className="smart-conditional-panel">
          <h3>Land information</h3>
          <div className="smart-form-grid">
            <label className="listing-editor-field">
              Plot size
              <input value={values.area} onChange={(event) => updateField('area', event.target.value)} placeholder="e.g. 500 sqm" />
            </label>
            <label className="listing-editor-field">
              Dimensions
              <input value={values.dimensions} onChange={(event) => updateField('dimensions', event.target.value)} placeholder="e.g. 50 × 100 ft" />
            </label>
          </div>
          <label className="listing-editor-field">
            Permitted land use
            <select value={values.landUse} onChange={(event) => updateField('landUse', event.target.value)}>
              <option value="">Choose land use</option>
              <option>Residential</option>
              <option>Commercial</option>
              <option>Agricultural</option>
              <option>Industrial</option>
              <option>Mixed use</option>
            </select>
          </label>
        </div>
      ) : (
        <>
          <div className="smart-form-grid">
            <label className="listing-editor-field">
              Number of available {isSingleRoom ? 'rooms' : isHostel ? 'rooms' : isCommercial ? 'spaces' : 'units'}
              <input
                type="number"
                min="1"
                max="100"
                value={values.unitCount}
                onChange={(event) => updateUnitCount(event.target.value)}
              />
            </label>
            <label className="listing-editor-field">
              Property size (optional)
              <input value={values.area} onChange={(event) => updateField('area', event.target.value)} placeholder="e.g. 50 sqm" />
            </label>
          </div>

          {isHostel && (
            <label className="listing-editor-field">
              Bed spaces per room
              <input type="number" min="1" value={values.bedSpaces || ''} onChange={(event) => updateField('bedSpaces', event.target.value)} placeholder="Number of bed spaces" />
            </label>
          )}

          <div className="smart-unit-intro">
            <div>
              <h3>Manage each {isSingleRoom ? 'room' : isHostel ? 'hostel room' : isCommercial ? 'space' : 'unit'}</h3>
              <p>Every unit has its own price, details, photographs and recorded video.</p>
            </div>
            <span className="listing-editor-badge listing-editor-badge-success">{units.length} {units.length === 1 ? 'unit' : 'units'}</span>
          </div>

          <div className="smart-unit-list">
            {units.map((unit, index) => {
              const expanded = expandedUnit === unit.id

              return (
                <article className={`smart-unit-card ${expanded ? 'is-expanded' : ''}`} key={unit.id}>
                  <button
                    type="button"
                    className="smart-unit-toggle"
                    onClick={() => setExpandedUnit(expanded ? null : unit.id)}
                    aria-expanded={expanded}
                  >
                    <span className="smart-unit-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="smart-unit-summary">
                      <strong>{unit.name || `Unit ${index + 1}`}</strong>
                      <small>{unit.photos.length} photos · {unit.videoUrl ? 'Video recorded' : 'No video yet'}</small>
                    </span>
                    <span className="smart-unit-price">{unit.rent ? formatPrice(unit.rent) : 'Set price'}</span>
                    <span className="smart-unit-chevron">{expanded ? '−' : '+'}</span>
                  </button>

                  {expanded && (
                    <div className="smart-unit-content">
                      <label className="listing-editor-field">
                        Unit name or number
                        <input value={unit.name} onChange={(event) => updateUnit(unit.id, 'name', event.target.value)} placeholder={`Unit ${index + 1}`} />
                      </label>

                      <label className="listing-editor-field">
                        {values.purpose === 'For sale' ? 'Unit selling price (₦)' : 'Rent per unit (₦)'}
                        <input type="number" min="0" value={unit.rent} onChange={(event) => updateUnit(unit.id, 'rent', event.target.value)} placeholder="Enter amount" />
                      </label>

                      {!isSelfContained && !isSingleRoom && (
                        <div className="smart-form-grid">
                          {!isCommercial && (
                            <>
                              <label className="listing-editor-field">
                                Bedrooms
                                <input type="number" min="0" value={unit.bedrooms} onChange={(event) => updateUnit(unit.id, 'bedrooms', event.target.value)} />
                              </label>
                              <label className="listing-editor-field">
                                Bathrooms
                                <input type="number" min="0" value={unit.bathrooms} onChange={(event) => updateUnit(unit.id, 'bathrooms', event.target.value)} />
                              </label>
                            </>
                          )}
                        </div>
                      )}

                      <label className="listing-editor-field">
                        Unit description and facilities
                        <textarea rows={3} value={unit.description} onChange={(event) => updateUnit(unit.id, 'description', event.target.value)} placeholder="Describe this unit, its condition and facilities..." />
                      </label>

                      <div className="smart-media-heading">
                        <div>
                          <h4>Unit photographs</h4>
                          <p>Up to 10 photographs for this unit.</p>
                        </div>
                      </div>

                      <label className="smart-photo-picker">
                        <span className="listing-editor-inline-icon" aria-hidden="true">▧</span>
                        <strong>Add unit photographs</strong>
                        <small>Select image files from your device</small>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(event) => {
                            addUnitPhotos(unit.id, event.target.files)
                            event.target.value = ''
                          }}
                        />
                      </label>

                      {unit.photos.length > 0 && (
                        <div className="smart-unit-photos">
                          {unit.photos.map((photo, photoIndex) => (
                            <div className="smart-unit-photo" key={photo.url}>
                              <img src={photo.url} alt={photo.name}/>
                              <button type="button" onClick={() => removeUnitPhoto(unit.id, photoIndex)} aria-label="Remove photograph">×</button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="smart-media-heading smart-video-heading">
                        <div>
                          <h4>Recorded unit video</h4>
                          <p>Record directly with your camera. Video uploads are not accepted.</p>
                        </div>
                        <span className={`listing-editor-badge ${unit.videoUrl ? "listing-editor-badge-success" : "listing-editor-badge-secondary"}`}>
                          {unit.videoUrl ? 'Recorded' : 'Not recorded'}
                        </span>
                      </div>

                      {unit.videoUrl ? (
                        <div className="smart-recorded-video">
                          <video src={unit.videoUrl} controls playsInline/>
                          <button
                            type="button"
                            className="listing-editor-secondary"
                            onClick={() => {
                              URL.revokeObjectURL(unit.videoUrl)
                              updateUnit(unit.id, 'videoUrl', '')
                            }}
                          >
                            Remove recording
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="smart-open-camera"
                          onClick={() => setCameraUnitId(unit.id)}
                        >
                          <span className="listing-editor-inline-icon" aria-hidden="true">🎥</span>
                          Open camera and record
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>

          {isSingleRoom && (
            <p className="smart-context-note">For single rooms, we focus on room availability and shared facilities instead of asking for bedroom counts.</p>
          )}
          {isSelfContained && (
            <p className="smart-context-note">Self-contained units do not require bedroom or bathroom counts. Add the facilities in each unit description.</p>
          )}
        </>
      )}

      <label className="listing-editor-field">
        General facilities and amenities
        <textarea rows={3} value={values.facilities} onChange={(event) => updateField('facilities', event.target.value)} placeholder="e.g. Water supply, electricity, security, parking..." />
      </label>

      <label className="listing-editor-field">
        Furnishing
        <select value={values.furnishing} onChange={(event) => updateField('furnishing', event.target.value)}>
          <option value="">Select if applicable</option>
          <option>Furnished</option>
          <option>Partly furnished</option>
          <option>Unfurnished</option>
          <option>Not applicable</option>
        </select>
      </label>
    </>
  )

  return (
    <main className="listing-editor-page smart-listing-builder">
      <header className="listing-editor-heading smart-builder-heading">
        <div>
          <span className="listing-editor-kicker">SMART HELP MARKET · LISTING STUDIO</span>
          <h1>{heading}</h1>
          <p>{description}</p>
        </div>
        <Link className="listing-editor-back" to="/owner/listings">My listings</Link>
      </header>

      <div className="smart-builder-progress">
        <span className="smart-progress-active"/>
        <span/>
        <span/>
        <span/>
      </div>

      {restored && <p className="listing-editor-notice" role="status">Your previously saved draft details have been restored. Media previews need to be selected or recorded again.</p>}
      {notice && <p className="listing-editor-notice" role="status">{notice}</p>}
      {error && <p className="listing-editor-error" role="alert">{error}</p>}

      <form className="listing-editor-layout smart-builder-layout" onSubmit={validateAndPreview}>
        <section className="listing-editor-form smart-builder-form">
          <div className="smart-section-heading">
            <span>01</span>
            <div>
              <h2>Listing essentials</h2>
              <p>Start with the information customers will see first.</p>
            </div>
          </div>

          <label className="listing-editor-field">
            Marketplace category
            <select value={categoryKey} onChange={(event) => setCategoryKey(event.target.value)} required>
              <option value="">Choose a category</option>
              {categories.map((item) => (
                <option key={item.key} value={item.key}>{item.name}</option>
              ))}
            </select>
            {category?.description && <small>{category.description}</small>}
          </label>

          <label className="listing-editor-field">
            Listing title
            <input required value={values.title} onChange={(event) => updateField('title', event.target.value)} placeholder={kind === 'properties' ? 'e.g. Modern self-contained at Ekosodin' : kind === 'products' ? 'e.g. Brand new Android smartphone' : 'e.g. Professional electrical installation'} />
          </label>

          <label className="listing-editor-field">
            Description
            <textarea required rows={4} value={values.description} onChange={(event) => updateField('description', event.target.value)} placeholder="Describe what makes this listing useful or attractive..."/>
          </label>

          <div className="smart-form-grid">
            <label className="listing-editor-field">
              {kind === 'properties' ? 'Starting price (₦)' : kind === 'products' ? 'Product price (₦)' : 'Service price or starting fee (₦)'}
              <input type="number" min="0" required value={values.price} onChange={(event) => updateField('price', event.target.value)} placeholder="Enter amount"/>
            </label>
            <label className="listing-editor-field">
              Price basis
              <select value={values.priceUnit} onChange={(event) => updateField('priceUnit', event.target.value)}>
                <option>Negotiable</option>
                <option>One-time</option>
                <option>Per item</option>
                <option>Per month</option>
                <option>Per year</option>
                <option>Per night</option>
                <option>Per hour</option>
                <option>Starting estimate</option>
              </select>
            </label>
          </div>

          <label className="listing-editor-field">
            Location
            <input required value={values.location} onChange={(event) => updateField('location', event.target.value)} placeholder="Area, town or city"/>
          </label>

          {kind === 'properties' && propertyDetails}

          {kind === 'products' && (
            <>
              <div className="smart-section-heading">
                <span>02</span>
                <div>
                  <h2>Product specifications</h2>
                  <p>Give buyers the details they need to make a decision.</p>
                </div>
              </div>
              <label className="listing-editor-field">
                Product type
                <input required value={values.productType} onChange={(event) => updateField('productType', event.target.value)} placeholder="e.g. Electronics, furniture, fashion"/>
              </label>
              <div className="smart-form-grid">
                <label className="listing-editor-field">
                  Condition
                  <select value={values.condition} onChange={(event) => updateField('condition', event.target.value)}>
                    <option>Brand new</option>
                    <option>Used</option>
                    <option>Refurbished</option>
                  </select>
                </label>
                <label className="listing-editor-field">
                  Brand
                  <input value={values.brand} onChange={(event) => updateField('brand', event.target.value)} placeholder="Brand name"/>
                </label>
                <label className="listing-editor-field">
                  Stock quantity
                  <input type="number" min="0" value={values.stock} onChange={(event) => updateField('stock', event.target.value)}/>
                </label>
                <label className="listing-editor-field">
                  Delivery
                  <select value={values.delivery} onChange={(event) => updateField('delivery', event.target.value)}>
                    <option>Both</option>
                    <option>Pickup</option>
                    <option>Delivery available</option>
                  </select>
                </label>
              </div>
              <label className="listing-editor-field">
                Warranty information
                <input value={values.warranty} onChange={(event) => updateField('warranty', event.target.value)} placeholder="Optional warranty details"/>
              </label>
            </>
          )}

          {kind === 'services' && (
            <>
              <div className="smart-section-heading">
                <span>02</span>
                <div>
                  <h2>Service details</h2>
                  <p>Help customers understand your skills and availability.</p>
                </div>
              </div>
              <label className="listing-editor-field">
                Service type
                <input required value={values.serviceType} onChange={(event) => updateField('serviceType', event.target.value)} placeholder="e.g. Plumbing, cleaning, electrical work"/>
              </label>
              <div className="smart-form-grid">
                <label className="listing-editor-field">
                  Years of experience
                  <input type="number" min="0" value={values.experience} onChange={(event) => updateField('experience', event.target.value)}/>
                </label>
                <label className="listing-editor-field">
                  Delivery mode
                  <select value={values.deliveryMode} onChange={(event) => updateField('deliveryMode', event.target.value)}>
                    <option>On-site</option>
                    <option>Remote</option>
                    <option>Both</option>
                  </select>
                </label>
                <label className="listing-editor-field">
                  Service area
                  <input required value={values.serviceArea} onChange={(event) => updateField('serviceArea', event.target.value)} placeholder="Areas you cover"/>
                </label>
                <label className="listing-editor-field">
                  Availability
                  <select value={values.availability} onChange={(event) => updateField('availability', event.target.value)}>
                    <option>By appointment</option>
                    <option>Full-time</option>
                    <option>Weekdays</option>
                    <option>Weekends</option>
                  </select>
                </label>
              </div>
            </>
          )}

          {kind !== 'properties' && (
            <>
              <div className="smart-section-heading">
                <span>03</span>
                <div>
                  <h2>{kind === 'products' ? 'Product photographs' : 'Service photographs'}</h2>
                  <p>Add up to 10 images. Video uploads are not enabled.</p>
                </div>
              </div>
              <label className="smart-photo-picker">
                <span className="listing-editor-inline-icon" aria-hidden="true">▧</span>
                <strong>Select photographs</strong>
                <small>Images only, up to 10 MB each</small>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    const setter = kind === 'products' ? setProductImages : setServiceImages
                    const existing = kind === 'products' ? productImages : serviceImages
                    handlePhotos(event.target.files, (items) => setter((current) => [...current, ...items]), existing.length)
                    event.target.value = ''
                  }}
                />
              </label>
              <div className="smart-unit-photos">
                {(kind === 'products' ? productImages : serviceImages).map((item, index) => (
                  <div className="smart-unit-photo" key={item.url}>
                    <img src={item.url} alt={item.name}/>
                    <button type="button" onClick={() => {
                      URL.revokeObjectURL(item.url)
                      const setter = kind === 'products' ? setProductImages : setServiceImages
                      setter((current) => current.filter((_, photoIndex) => photoIndex !== index))
                    }}>×</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {kind === 'properties' && !isLand && (
            <p className="smart-context-note">{totalPropertyPhotos} property photographs selected across {units.length} units. Every unit has a separate gallery and recording.</p>
          )}

          <div className="listing-editor-actions smart-builder-actions">
            <button type="button" className="listing-editor-secondary" onClick={() => void saveDraft()} disabled={isSavingDraft}>{isSavingDraft ? "Saving…" : "Save draft"}</button>
            <button type="submit" className="listing-editor-primary">Preview listing <span>→</span></button>
          </div>
        </section>

        <aside className="listing-editor-aside smart-builder-aside">
          <div className="listing-editor-tip">
            <span>✦</span>
            <h3>Smart listing assistant</h3>
            <p>The questions change according to your listing type, helping you provide relevant information without unnecessary fields.</p>
          </div>
          <div className="listing-editor-tip">
            <span>🎥</span>
            <h3>Authentic property videos</h3>
            <p>Property videos are recorded directly through the website. Uploaded video files are not accepted.</p>
          </div>
          <div className="listing-editor-tip">
            <span>🔒</span>
            <h3>Draft protection</h3>
            <p>Your draft is saved in this browser and, when signed in with an eligible account, to your marketplace account. It is never published automatically.</p>
          </div>
          <div className="smart-builder-summary">
            <span className="listing-editor-kicker">YOUR PROGRESS</span>
            <strong>{kind === 'properties' ? units.length : 1}</strong>
            <small>{kind === 'properties' ? 'Property units' : kind === 'products' ? 'Product listing' : 'Service listing'}</small>
            {kind === 'properties' && <small>{totalPropertyPhotos} photographs added</small>}
          </div>
        </aside>
      </form>

      {showPreview && (
        <div className="listing-editor-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowPreview(false)
        }}>
          <section className="listing-editor-preview smart-listing-preview" role="dialog" aria-modal="true" aria-labelledby="listing-preview-title">
            <button className="listing-editor-preview-close" type="button" onClick={() => setShowPreview(false)} aria-label="Close preview">×</button>
            <span className="listing-editor-kicker">MARKETPLACE LISTING PREVIEW</span>
            <h2 id="listing-preview-title">{values.title || 'Untitled listing'}</h2>
            <p>{category?.name || kind} · {values.location}</p>
            <strong className="listing-editor-preview-price">{formatPrice(values.price)} <small>{values.priceUnit}</small></strong>
            <p>{values.description}</p>

            {kind === 'properties' && (
              <div className="smart-preview-units">
                <h3>{isLand ? 'Land information' : `${units.length} property units`}</h3>
                {units.map((unit) => (
                  <article key={unit.id}>
                    <strong>{unit.name}</strong>
                    <span>{unit.rent ? formatPrice(unit.rent) : 'Price not set'}</span>
                    {unit.description && <p>{unit.description}</p>}
                    {unit.photos.length > 0 && (
                      <div className="smart-preview-gallery">
                        {unit.photos.map((photo) => <img src={photo.url} alt={photo.name} key={photo.url}/>)}
                      </div>
                    )}
                    {unit.videoUrl && <video src={unit.videoUrl} controls playsInline/>}
                  </article>
                ))}
              </div>
            )}

            <dl>
              {Object.entries(values)
                .filter(([key, value]) => value && !['title', 'description', 'price', 'priceUnit'].includes(key))
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replace(/([A-Z])/g, ' $1')}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>

            <p className="listing-editor-preview-note">This is a preview only. Saving creates an unpublished draft in your marketplace account when signed in, together with a local recovery copy.</p>
            <div className="listing-editor-actions">
              <button type="button" className="listing-editor-secondary" onClick={() => setShowPreview(false)}>Continue editing</button>
              <button type="button" className="listing-editor-primary" disabled={isSavingDraft} onClick={() => {
                void saveDraft()
                setShowPreview(false)
              }}>{isSavingDraft ? "Saving…" : "Save this draft"}</button>
            </div>
          </section>
        </div>
      )}

      {cameraUnitId && (
        <CameraStudio
          onClose={() => setCameraUnitId(null)}
          onRecorded={(url) => {
            setUnits((current) => current.map((unit) => {
              if (unit.id !== cameraUnitId) return unit
              if (unit.videoUrl) URL.revokeObjectURL(unit.videoUrl)
              return { ...unit, videoUrl: url }
            }))
            setNotice('Watermarked unit video recorded successfully.')
          }}
        />
      )}
    </main>
  )
}
