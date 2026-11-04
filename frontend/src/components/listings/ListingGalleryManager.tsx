import { useCallback, useEffect, useRef, useState } from 'react'

import type { MarketplaceListingImage } from '../../services/marketplaceListings'

import {
  deleteListingImage,
  getOwnerListingGallery,
  reorderListingImages,
  setListingCoverImage,
  uploadListingImage,
} from '../../services/listingImages'

import './ListingGalleryManager.css'

interface ListingGalleryManagerProps {
  listingId: string
  listingTitle?: string
}

export default function ListingGalleryManager({
  listingId,
  listingTitle = 'this listing',
}: ListingGalleryManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [images, setImages] = useState<MarketplaceListingImage[]>([])
  const [imageLimit, setImageLimit] = useState(20)
  const [maxImageBytes, setMaxImageBytes] = useState(10 * 1024 * 1024)

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [workingImageId, setWorkingImageId] = useState<string | null>(null)

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [uploadProgress, setUploadProgress] = useState('')

  const remainingSlots = Math.max(imageLimit - images.length, 0)

  const loadGallery = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const gallery = await getOwnerListingGallery(listingId)

      setImages(gallery.images)
      setImageLimit(gallery.imageLimit)
      setMaxImageBytes(gallery.maxImageBytes)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load this image gallery.',
      )
    } finally {
      setLoading(false)
    }
  }, [listingId])

  useEffect(() => {
    let active = true

    getOwnerListingGallery(listingId)
      .then((gallery) => {
        if (!active) return

        setImages(gallery.images)
        setImageLimit(gallery.imageLimit)
        setMaxImageBytes(gallery.maxImageBytes)
      })
      .catch((loadError: unknown) => {
        if (!active) return

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Unable to load this image gallery.',
        )
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [listingId])

  async function handleFileSelection(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFiles = Array.from(event.target.files ?? [])

    if (selectedFiles.length === 0) return

    setError('')
    setNotice('')

    if (selectedFiles.length > remainingSlots) {
      setError(
        `You can upload only ${remainingSlots} more image(s) to this listing.`,
      )
      event.target.value = ''
      return
    }

    const allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'avif']

    for (const file of selectedFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? ''

      if (!allowedFormats.includes(extension)) {
        setError(
          `${file.name} has an unsupported format. Use JPG, PNG, WebP or AVIF.`,
        )
        event.target.value = ''
        return
      }

      if (file.size > maxImageBytes) {
        setError(
          `${file.name} exceeds the ${Math.round(maxImageBytes / (1024 * 1024))} MB image limit.`,
        )
        event.target.value = ''
        return
      }

      if (file.size === 0) {
        setError(`${file.name} is empty and cannot be uploaded.`)
        event.target.value = ''
        return
      }
    }

    setUploading(true)

    let successfulUploads = 0

    try {
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index]

        setUploadProgress(
          `Uploading image ${index + 1} of ${selectedFiles.length}: ${file.name}`,
        )

        await uploadListingImage(
          listingId,
          file,
          `${listingTitle} image ${images.length + successfulUploads + 1}`,
        )

        successfulUploads += 1
      }

      setNotice(
        `${successfulUploads} image(s) uploaded successfully.`,
      )

      await loadGallery()
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'An image upload failed.',
      )

      if (successfulUploads > 0) {
        await loadGallery()
      }
    } finally {
      setUploading(false)
      setUploadProgress('')

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function handleSetCover(imageId: string) {
    setWorkingImageId(imageId)
    setError('')
    setNotice('')

    try {
      await setListingCoverImage(listingId, imageId)
      setNotice('Cover image updated successfully.')
      await loadGallery()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Unable to update the cover image.',
      )
    } finally {
      setWorkingImageId(null)
    }
  }

  async function handleMoveImage(index: number, direction: -1 | 1) {
    const targetIndex = index + direction

    if (targetIndex < 0 || targetIndex >= images.length) return

    const reordered = [...images]
    const [movedImage] = reordered.splice(index, 1)

    reordered.splice(targetIndex, 0, movedImage)

    setWorkingImageId(movedImage.id)
    setError('')
    setNotice('')

    try {
      await reorderListingImages(
        listingId,
        reordered.map((image) => image.id),
      )

      setImages(reordered.map((image, sortOrder) => ({
        ...image,
        sortOrder,
      })))

      setNotice('Gallery order updated successfully.')
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Unable to reorder the gallery.',
      )

      await loadGallery()
    } finally {
      setWorkingImageId(null)
    }
  }

  async function handleDeleteImage(image: MarketplaceListingImage) {
    const confirmed = window.confirm(
      `Delete this image from ${listingTitle}? This action cannot be undone.`,
    )

    if (!confirmed) return

    setWorkingImageId(image.id)
    setError('')
    setNotice('')

    try {
      const result = await deleteListingImage(listingId, image.id)

      await loadGallery()

      setNotice(
        result.cloudinaryCleanupPending
          ? 'Image removed from the listing. Cloudinary storage cleanup is still pending.'
          : 'Image deleted successfully.',
      )
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Unable to delete this image.',
      )
    } finally {
      setWorkingImageId(null)
    }
  }

  return (
    <section className="listing-gallery-manager">
      <div className="gallery-manager-heading">
        <div>
          <span className="section-kicker">LISTING PHOTOGRAPHS</span>
          <h2>Manage image gallery</h2>
          <p>
            Add and arrange photographs for {listingTitle}.
          </p>
        </div>

        <div className="gallery-manager-count">
          <strong>{images.length}</strong>
          <span>/ {imageLimit} images</span>
        </div>
      </div>

      <div className="gallery-manager-guidance">
        <span aria-hidden="true">ⓘ</span>
        <p>
          Upload clear, genuine photographs. Supported formats:
          JPG, PNG, WebP and AVIF. Maximum file size:{' '}
          {Math.round(maxImageBytes / (1024 * 1024))} MB per image.
        </p>
      </div>

      <div className="gallery-manager-upload">
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif"
          multiple
          disabled={loading || uploading || remainingSlots === 0}
          onChange={handleFileSelection}
          aria-label="Choose listing images"
        />

        <div className="gallery-upload-copy">
          <strong>Add photographs</strong>
          <span>
            {remainingSlots > 0
              ? `${remainingSlots} upload slot(s) remaining`
              : 'Maximum image limit reached'}
          </span>
        </div>

        <button
          type="button"
          className="gallery-upload-button"
          disabled={loading || uploading || remainingSlots === 0}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? 'Uploading...' : 'Choose images'}
        </button>
      </div>

      {uploading && (
        <div className="gallery-upload-progress" role="status">
          <span className="gallery-spinner" />
          <span>{uploadProgress}</span>
        </div>
      )}

      {error && (
        <div className="gallery-manager-message gallery-message-error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="gallery-manager-message gallery-message-success" role="status">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="gallery-manager-empty" role="status">
          Loading your image gallery...
        </div>
      ) : images.length === 0 ? (
        <div className="gallery-manager-empty">
          <span aria-hidden="true">▧</span>
          <strong>No photographs uploaded yet</strong>
          <p>
            Add photographs to make this listing more attractive to visitors.
          </p>
        </div>
      ) : (
        <div className="gallery-manager-grid">
          {images.map((image, index) => {
            const busy = workingImageId === image.id

            return (
              <article
                className="gallery-manager-image-card"
                key={image.id}
              >
                <div className="gallery-manager-image">
                  <img
                    src={image.url}
                    alt={image.altText || `${listingTitle} image ${index + 1}`}
                    loading="lazy"
                  />

                  {image.isCover && (
                    <span className="gallery-cover-label">
                      COVER IMAGE
                    </span>
                  )}

                  <span className="gallery-image-number">
                    {index + 1}
                  </span>
                </div>

                <div className="gallery-image-actions">
                  {!image.isCover && (
                    <button
                      type="button"
                      disabled={busy || workingImageId !== null}
                      onClick={() => void handleSetCover(image.id)}
                    >
                      Set as cover
                    </button>
                  )}

                  <div className="gallery-order-actions">
                    <button
                      type="button"
                      disabled={
                        index === 0 ||
                        busy ||
                        workingImageId !== null
                      }
                      onClick={() => void handleMoveImage(index, -1)}
                      aria-label={`Move image ${index + 1} left`}
                    >
                      ←
                    </button>

                    <button
                      type="button"
                      disabled={
                        index === images.length - 1 ||
                        busy ||
                        workingImageId !== null
                      }
                      onClick={() => void handleMoveImage(index, 1)}
                      aria-label={`Move image ${index + 1} right`}
                    >
                      →
                    </button>

                    <button
                      type="button"
                      className="gallery-delete-button"
                      disabled={busy || workingImageId !== null}
                      onClick={() => void handleDeleteImage(image)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="gallery-manager-footer">
        <span>
          {images.length} of {imageLimit} photographs used
        </span>

        <button
          type="button"
          className="gallery-refresh-button"
          disabled={loading || uploading || workingImageId !== null}
          onClick={() => void loadGallery()}
        >
          Refresh gallery
        </button>
      </div>
    </section>
  )
}
