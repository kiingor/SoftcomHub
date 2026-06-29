import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const svgPath = './public/workdesk-icon.svg'
const sizes = [192, 512]

async function generate() {
  const svg = fs.readFileSync(svgPath)

  for (const size of sizes) {
    const pngPath = `./public/workdesk-icon-${size}.png`
    try {
      await sharp(svg)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ quality: 90 })
        .toFile(pngPath)
      console.log(`✅ Generated ${pngPath} (${size}x${size})`)
    } catch (e) {
      console.error(`❌ Failed to generate ${pngPath}:`, e.message)
    }
  }
}

generate()
