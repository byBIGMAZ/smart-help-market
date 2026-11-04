import type { MarketplaceListingImage } from './marketplaceListings'

export interface ListingGalleryResponse {
  status: string
  listingId: string
  images: MarketplaceListingImage[]
  imageLimit: number
  maxImageBytes: number
  allowedFormats: string[]
}

interface UploadAuthorization {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  publicId: string
  signature: string
  maxBytes: number
  allowedFormats: string[]
}

interface UploadAuthorizationResponse {
  status: string
  upload: UploadAuthorization
}

interface CloudinaryUploadResponse {
  public_id: string
  secure_url: string
  width: number
  height: number
  bytes: number
  format: string
}

interface ImageRegistrationResponse {
  status: string
  image: {
    id: string
    listingId: string
    publicId: string
    secureUrl: string
    width: number
    height: number
    bytes: number
    format: string
    altText: string
    sortOrder: number
    isCover: boolean
  }
}

async function getErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data: unknown = await response.json()

    if (
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof data.error === 'string'
    ) {
      return data.error
    }
  } catch {
    // Use the fallback message when the response is not JSON.
  }

  return `${fallback} (HTTP ${response.status})`
}

function validateListingId(listingId: string): void {
  if (!/^[1-9]\d*$/.test(listingId)) {
    throw new Error('A valid listing ID is required.')
  }
}

function getFileFormat(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''

  return extension === 'jpeg' ? 'jpg' : extension
}

/**
 * Retrieve the authenticated owner's complete gallery.
 * Works for draft and unpublished listings.
 */
export async function getOwnerListingGallery(
  listingId: string,
): Promise<ListingGalleryResponse> {
  validateListingId(listingId)

  const response = await fetch(
    `/api/listings/owner/${encodeURIComponent(listingId)}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        'Unable to retrieve the listing gallery.',
      ),
    )
  }

  const data = (await response.json()) as ListingGalleryResponse

  if (
    !data ||
    data.status !== 'ok' ||
    !Array.isArray(data.images) ||
    typeof data.imageLimit !== 'number'
  ) {
    throw new Error('The gallery API returned an invalid response.')
  }

  return data
}

/**
 * Request a short-lived, server-generated Cloudinary signature.
 */
async function requestUploadAuthorization(
  listingId: string,
): Promise<UploadAuthorization> {
  const response = await fetch(
    `/api/listings/${encodeURIComponent(listingId)}/signature`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        'Unable to authorize the image upload.',
      ),
    )
  }

  const data = (await response.json()) as UploadAuthorizationResponse

  if (
    data.status !== 'ok' ||
    !data.upload ||
    !data.upload.cloudName ||
    !data.upload.apiKey ||
    !data.upload.signature
  ) {
    throw new Error('The upload authorization response is invalid.')
  }

  return data.upload
}

/**
 * Upload the original file directly from the browser to Cloudinary.
 * The Cloudinary API secret is never exposed to this function.
 */
async function uploadToCloudinary(
  file: File,
  authorization: UploadAuthorization,
): Promise<CloudinaryUploadResponse> {
  const formData = new FormData()

  formData.append('file', file)
  formData.append('api_key', authorization.apiKey)
  formData.append('timestamp', String(authorization.timestamp))
  formData.append('folder', authorization.folder)
  formData.append('public_id', authorization.publicId)
  formData.append('signature', authorization.signature)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(authorization.cloudName)}/image/upload`,
    {
      method: 'POST',
      body: formData,
    },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        'Cloudinary could not upload this image.',
      ),
    )
  }

  const data = (await response.json()) as CloudinaryUploadResponse

  if (
    !data.public_id ||
    !data.secure_url ||
    !Number.isSafeInteger(data.width) ||
    !Number.isSafeInteger(data.height) ||
    !Number.isSafeInteger(data.bytes) ||
    !data.format
  ) {
    throw new Error('Cloudinary returned invalid image information.')
  }

  return data
}

/**
 * Register the verified Cloudinary image in the marketplace database.
 */
async function registerListingImage(
  listingId: string,
  cloudinaryImage: CloudinaryUploadResponse,
  altText: string,
): Promise<MarketplaceListingImage> {
  const response = await fetch(
    `/api/listings/${encodeURIComponent(listingId)}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publicId: cloudinaryImage.public_id,
        secureUrl: cloudinaryImage.secure_url,
        width: cloudinaryImage.width,
        height: cloudinaryImage.height,
        bytes: cloudinaryImage.bytes,
        format: cloudinaryImage.format,
        altText,
      }),
    },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        'The uploaded image could not be saved to the listing.',
      ),
    )
  }

  const data = (await response.json()) as ImageRegistrationResponse

  if (!data.image || !data.image.id) {
    throw new Error('The image registration response is invalid.')
  }

  return {
    id: data.image.id,
    url: data.image.secureUrl,
    width: data.image.width,
    height: data.image.height,
    format: data.image.format,
    altText: data.image.altText,
    sortOrder: data.image.sortOrder,
    isCover: data.image.isCover,
  }
}

/**
 * Complete upload process: authorize, upload, verify and register.
 */
export async function uploadListingImage(
  listingId: string,
  file: File,
  altText: string,
): Promise<MarketplaceListingImage> {
  validateListingId(listingId)

  if (!(file instanceof File)) {
    throw new Error('Select a valid image file.')
  }

  const authorization = await requestUploadAuthorization(listingId)

  if (file.size <= 0 || file.size > authorization.maxBytes) {
    throw new Error(
      `Each image must be smaller than ${Math.round(authorization.maxBytes / (1024 * 1024))} MB.`,
    )
  }

  const format = getFileFormat(file)

  if (!authorization.allowedFormats.includes(format)) {
    throw new Error(
      `Unsupported image format. Allowed formats: ${authorization.allowedFormats.join(', ')}.`,
    )
  }

  const cloudinaryImage = await uploadToCloudinary(
    file,
    authorization,
  )

  return registerListingImage(
    listingId,
    cloudinaryImage,
    altText.trim() || file.name,
  )
}

/**
 * Select an image as the listing cover.
 */
export async function setListingCoverImage(
  listingId: string,
  imageId: string,
): Promise<void> {
  validateListingId(listingId)

  if (!/^[1-9]\d*$/.test(imageId)) {
    throw new Error('A valid image ID is required.')
  }

  const response = await fetch(
    `/api/listings/${encodeURIComponent(listingId)}/${encodeURIComponent(imageId)}/cover`,
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Unable to change the cover image.'),
    )
  }
}

/**
 * Save the complete gallery order.
 */
export async function reorderListingImages(
  listingId: string,
  imageIds: string[],
): Promise<void> {
  validateListingId(listingId)

  const response = await fetch(
    `/api/listings/${encodeURIComponent(listingId)}/order`,
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageIds }),
    },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Unable to reorder listing images.'),
    )
  }
}

/**
 * Delete an image from the listing and request Cloudinary cleanup.
 */
export async function deleteListingImage(
  listingId: string,
  imageId: string,
): Promise<{ cloudinaryCleanupPending: boolean }> {
  validateListingId(listingId)

  if (!/^[1-9]\d*$/.test(imageId)) {
    throw new Error('A valid image ID is required.')
  }

  const response = await fetch(
    `/api/listings/${encodeURIComponent(listingId)}/${encodeURIComponent(imageId)}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Unable to delete this image.'),
    )
  }

  const data = (await response.json()) as {
    cloudinaryCleanupPending?: boolean
  }

  return {
    cloudinaryCleanupPending: data.cloudinaryCleanupPending === true,
  }
}
