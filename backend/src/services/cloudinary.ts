import { v2 as cloudinary } from 'cloudinary'

const cloudName = process.env.CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET

if (!cloudName || !apiKey || !apiSecret) {
  throw new Error('Cloudinary environment configuration is unavailable.')
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
})

export { cloudinary }

export const CLOUDINARY_CLOUD_NAME = cloudName
export const CLOUDINARY_API_KEY = apiKey
