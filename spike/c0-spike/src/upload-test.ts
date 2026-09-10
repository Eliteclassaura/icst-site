import 'dotenv/config'
import { getPayload } from 'payload'
import config from './payload.config'
import sharp from 'sharp'

const payload = await getPayload({ config })
const png = await sharp({ create: { width: 640, height: 400, channels: 3, background: { r: 6, g: 5, b: 4 } } }).png().toBuffer()
const doc = await payload.create({
  collection: 'media',
  data: { alt: 'C0 storage test image' },
  file: { data: png, mimetype: 'image/png', name: 'c0-test.png', size: png.length },
})
console.log(JSON.stringify({ id: doc.id, filename: doc.filename, url: doc.url, width: doc.width, height: doc.height, thumb: doc.sizes?.thumb?.filename }, null, 1))
process.exit(0)
