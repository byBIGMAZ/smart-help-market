import { useState } from 'react'
import type { MarketplaceListingImage } from '../../services/marketplaceListings'

import './ListingImageGallery.css'

interface ListingImageGalleryProps {
  images: MarketplaceListingImage[]
  fallbackIcon: string
  category: string
  variant?: 'card' | 'detail'
  altTitle: string
}

export default function ListingImageGallery({
  images,
  fallbackIcon,
  category,
  variant = 'detail',
  altTitle,
}: ListingImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [failedImages, setFailedImages] = useState<string[]>([])

  const availableImages = images.filter(
    (image) => !failedImages.includes(image.id),
  )

  const activeImage = availableImages[
    Math.min(activeIndex, Math.max(availableImages.length - 1, 0))
  ]

  function moveTo(index: number) {
    if (availableImages.length === 0) return

    const nextIndex =
      (index + availableImages.length) % availableImages.length

    setActiveIndex(nextIndex)
  }

  function handleImageError(imageId: string) {
    setFailedImages((current) =>
      current.includes(imageId)
        ? current
        : [...current, imageId],
    )
    setActiveIndex(0)
  }

  function stopCardNavigation(
    event: React.MouseEvent<HTMLButtonElement>,
  ) {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div
      className={`listing-gallery listing-gallery-${variant} listing-gallery-${category.toLowerCase()}`}
      aria-label={`${altTitle} image gallery`}
    >
      {activeImage ? (
        <>
          <img
            className="listing-gallery-main-image"
            src={activeImage.url}
            alt={activeImage.altText || altTitle}
            loading="lazy"
            onError={() => handleImageError(activeImage.id)}
          />

          {availableImages.length > 1 && (
            <>
              <button
                type="button"
                className="listing-gallery-arrow listing-gallery-previous"
                onClick={(event) => {
                  if (variant === 'card') {
                    stopCardNavigation(event)
                  }

                  moveTo(activeIndex - 1)
                }}
                aria-label="Previous image"
              >
                ‹
              </button>

              <button
                type="button"
                className="listing-gallery-arrow listing-gallery-next"
                onClick={(event) => {
                  if (variant === 'card') {
                    stopCardNavigation(event)
                  }

                  moveTo(activeIndex + 1)
                }}
                aria-label="Next image"
              >
                ›
              </button>

              <span className="listing-gallery-counter">
                {activeIndex + 1} / {availableImages.length}
              </span>
            </>
          )}

          {variant === 'detail' && availableImages.length > 1 && (
            <div className="listing-gallery-thumbnails">
              {availableImages.map((image, index) => (
                <button
                  type="button"
                  key={image.id}
                  className={
                    index === activeIndex
                      ? 'listing-gallery-thumbnail thumbnail-active'
                      : 'listing-gallery-thumbnail'
                  }
                  onClick={() => moveTo(index)}
                  aria-label={`View image ${index + 1}`}
                  aria-pressed={index === activeIndex}
                >
                  <img
                    src={image.url}
                    alt={image.altText || `${altTitle} image ${index + 1}`}
                    loading="lazy"
                    onError={() => handleImageError(image.id)}
                  />
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="listing-gallery-placeholder">
          <span aria-hidden="true">{fallbackIcon || '◈'}</span>
          <small>{category}</small>
        </div>
      )}
    </div>
  )
}
