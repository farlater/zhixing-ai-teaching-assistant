import fs from 'node:fs'
import path from 'node:path'
import mammoth from 'mammoth'
import pdf from 'pdf-parse'
import JSZip from 'jszip'
import { createCanvas } from '@napi-rs/canvas'

export interface ExtractedAsset {
  name: string
  filePath: string
  mimeType: string
  publicUrl: string
}

export interface MaterialExtraction {
  text: string
  assets: ExtractedAsset[]
  notes: string[]
  pageCount?: number
}

const xmlText = (xml: string) => [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(match => match[1]
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).join('\n')

function mediaType(name: string) {
  const extension = path.extname(name).toLowerCase()
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff' } as Record<string, string>)[extension] || 'application/octet-stream'
}

async function officeAssets(zip: JSZip, prefixes: string[], outputDir: string, publicBase: string) {
  const assets: ExtractedAsset[] = []
  const files = Object.values(zip.files).filter(item => !item.dir && prefixes.some(prefix => item.name.startsWith(prefix)) && mediaType(item.name).startsWith('image/'))
  fs.mkdirSync(outputDir, { recursive: true })
  for (const [index, item] of files.entries()) {
    const extension = path.extname(item.name).toLowerCase() || '.png'
    const name = `figure-${String(index + 1).padStart(2, '0')}${extension}`
    const filePath = path.join(outputDir, name)
    fs.writeFileSync(filePath, Buffer.from(await item.async('uint8array')))
    assets.push({ name, filePath, mimeType: mediaType(name), publicUrl: `${publicBase}/${name}` })
  }
  return assets
}

async function renderPdfPages(buffer: Buffer, outputDir: string, publicBase: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false }).promise
  const assets: ExtractedAsset[] = []
  fs.mkdirSync(outputDir, { recursive: true })
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1.35 })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext('2d')
    await page.render({ canvas: canvas as never, canvasContext: context as never, viewport }).promise
    const name = `page-${String(pageNumber).padStart(2, '0')}.jpg`
    const filePath = path.join(outputDir, name)
    fs.writeFileSync(filePath, await canvas.encode('jpeg', 82))
    assets.push({ name, filePath, mimeType: 'image/jpeg', publicUrl: `${publicBase}/${name}` })
  }
  return { assets, pageCount: document.numPages }
}

export async function extractMaterial(filePath: string, mimeType: string, originalName: string, outputDir: string, publicBase: string): Promise<MaterialExtraction> {
  const extension = path.extname(originalName).toLowerCase()
  const notes: string[] = []
  if (['.txt', '.md', '.csv', '.json', '.html'].includes(extension) || mimeType.startsWith('text/')) {
    return { text: fs.readFileSync(filePath, 'utf8').slice(0, 160000), assets: [], notes }
  }
  if (extension === '.pdf' || mimeType === 'application/pdf') {
    const buffer = fs.readFileSync(filePath)
    const result = await pdf(buffer)
    const rendered = await renderPdfPages(buffer, outputDir, publicBase)
    if (result.text.trim().length < 200) notes.push('检测到扫描型或低文本 PDF，将使用页面图像辅助视觉识别。')
    return { text: result.text.slice(0, 160000), assets: rendered.assets, notes, pageCount: rendered.pageCount }
  }
  if (extension === '.docx' || mimeType.includes('wordprocessingml')) {
    const buffer = fs.readFileSync(filePath)
    const [result, zip] = await Promise.all([mammoth.extractRawText({ buffer }), JSZip.loadAsync(buffer)])
    const assets = await officeAssets(zip, ['word/media/'], outputDir, publicBase)
    return { text: result.value.slice(0, 160000), assets, notes }
  }
  if (extension === '.pptx' || mimeType.includes('presentationml')) {
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath))
    const slides = Object.values(zip.files).filter(item => /^ppt\/slides\/slide\d+\.xml$/.test(item.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    const sections: string[] = []
    for (const [index, slide] of slides.entries()) sections.push(`## 第 ${index + 1} 页\n\n${xmlText(await slide.async('text'))}`)
    const assets = await officeAssets(zip, ['ppt/media/'], outputDir, publicBase)
    return { text: sections.join('\n\n').slice(0, 160000), assets, notes, pageCount: slides.length }
  }
  if (mimeType.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(extension)) {
    fs.mkdirSync(outputDir, { recursive: true })
    const name = `figure-01${extension || '.jpg'}`
    const target = path.join(outputDir, name)
    fs.copyFileSync(filePath, target)
    return { text: '', assets: [{ name, filePath: target, mimeType: mediaType(name), publicUrl: `${publicBase}/${name}` }], notes: ['图片资料将由百炼视觉提取文字、公式和教学含义。'] }
  }
  throw new Error(`暂不支持 ${extension || mimeType} 格式`)
}
