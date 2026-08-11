import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import JSZip from 'jszip'
import type { ExtractedAsset, MaterialExtraction } from './materials.js'

const DEFAULT_BASE_URL = 'https://mineru.net/api/v4'
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.jp2', '.webp', '.gif', '.bmp', '.svg', '.tif', '.tiff'])
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', ...IMAGE_EXTENSIONS])

interface MinerUEnvelope<T> {
  code: number
  msg?: string
  data: T
}

interface BatchCreateResult {
  batch_id: string
  file_urls: string[]
}

interface ExtractResult {
  file_name: string
  state: 'done' | 'waiting-file' | 'pending' | 'running' | 'failed' | 'converting'
  err_msg?: string
  full_zip_url?: string
  data_id?: string
  extract_progress?: { extracted_pages?: number; total_pages?: number }
}

interface BatchResult {
  extract_result: ExtractResult[]
}

export interface MinerUExtraction extends MaterialExtraction {
  batchId: string
  parser: 'mineru'
  visionCandidates: ExtractedAsset[]
}

const numberEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

function endpoint(pathname: string) {
  return `${(process.env.MINERU_API_BASE || DEFAULT_BASE_URL).replace(/\/$/, '')}${pathname}`
}

function authorization() {
  return { Authorization: `Bearer ${process.env.MINERU_API_TOKEN || ''}` }
}

async function readEnvelope<T>(response: Response, action: string): Promise<T> {
  const body = await response.json().catch(() => null) as MinerUEnvelope<T> | null
  if (!response.ok || !body || body.code !== 0) {
    throw new Error(`MinerU ${action}失败：${body?.msg || `HTTP ${response.status}`}`)
  }
  return body.data
}

function safeRelative(name: string) {
  const segments = name.replace(/\\/g, '/').split('/').filter(segment => segment && segment !== '.' && segment !== '..')
    .map(segment => segment.replace(/[<>:"|?*\x00-\x1f]/g, '-'))
  return segments.join('/')
}

function mimeType(name: string) {
  const extension = path.extname(name).toLowerCase()
  return ({
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jp2': 'image/jp2', '.webp': 'image/webp',
    '.gif': 'image/gif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.tif': 'image/tiff', '.tiff': 'image/tiff'
  } as Record<string, string>)[extension] || 'application/octet-stream'
}

function publicUrl(base: string, relative: string) {
  return `${base.replace(/\/$/, '')}/${relative.split('/').map(encodeURIComponent).join('/')}`
}

function countPages(value: unknown): number | undefined {
  let maximum = -1
  const visit = (item: unknown) => {
    if (Array.isArray(item)) return item.forEach(visit)
    if (!item || typeof item !== 'object') return
    const object = item as Record<string, unknown>
    for (const key of ['page_idx', 'page_index', 'page_no', 'page_number']) {
      if (typeof object[key] === 'number') maximum = Math.max(maximum, Number(object[key]))
    }
    Object.values(object).forEach(visit)
  }
  visit(value)
  return maximum >= 0 ? maximum + 1 : undefined
}

function rewriteImageLinks(markdown: string, urls: Map<string, string>) {
  return markdown.replace(/(!\[[^\]]*\]\()([^)]+)(\))/g, (match, prefix: string, rawTarget: string, suffix: string) => {
    const target = rawTarget.trim().replace(/^<|>$/g, '').replace(/^\.\//, '').replace(/\\/g, '/')
    if (/^(https?:|data:|\/)/i.test(target)) return match
    const mapped = urls.get(target) || urls.get(path.posix.basename(target))
    return mapped ? `${prefix}${mapped}${suffix}` : match
  })
}

function collectUnexplainedVisuals(value: unknown, missing: Set<string>) {
  if (Array.isArray(value)) return value.forEach(item => collectUnexplainedVisuals(item, missing))
  if (!value || typeof value !== 'object') return
  const object = value as Record<string, unknown>
  const type = String(object.type || '').toLowerCase()
  if (type === 'image' || type === 'chart') {
    const nested = object.content && typeof object.content === 'object' ? object.content as Record<string, unknown> : undefined
    const visualPath = [object.img_path, object.image_path, object.chart_path, nested?.img_path, nested?.image_path, nested?.chart_path]
      .find(item => typeof item === 'string') as string | undefined
    const semanticValues = [
      typeof object.content === 'string' ? object.content : undefined,
      object.image_content, object.chart_content, object.description, object.analysis,
      nested?.image_content, nested?.chart_content, nested?.description, nested?.analysis
    ]
    const hasSemanticContent = semanticValues.some(item => typeof item === 'string' ? item.trim() : Array.isArray(item) && item.length)
    if (visualPath && !hasSemanticContent) missing.add(visualPath.replace(/^\.\//, '').replace(/\\/g, '/'))
  }
  Object.values(object).forEach(item => collectUnexplainedVisuals(item, missing))
}

async function unpackResult(zipBuffer: ArrayBuffer, outputDir: string, publicBase: string, structuredDir: string) {
  const zip = await JSZip.loadAsync(zipBuffer)
  const files = Object.values(zip.files).filter(item => !item.dir)
  const markdownEntry = files.find(item => path.posix.basename(item.name).toLowerCase() === 'full.md')
    || files.filter(item => path.extname(item.name).toLowerCase() === '.md').sort((a, b) => a.name.length - b.name.length)[0]
  if (!markdownEntry) throw new Error('MinerU 结果包中没有 Markdown 文件')

  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(structuredDir, { recursive: true })
  const assets: ExtractedAsset[] = []
  const urlMap = new Map<string, string>()
  const unexplainedVisuals = new Set<string>()
  let pageCount: number | undefined

  for (const entry of files) {
    const relative = safeRelative(entry.name)
    if (!relative) continue
    const extension = path.extname(relative).toLowerCase()
    if (IMAGE_EXTENSIONS.has(extension)) {
      const target = path.join(outputDir, ...relative.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, Buffer.from(await entry.async('uint8array')))
      const url = publicUrl(publicBase, relative)
      urlMap.set(relative, url)
      if (!urlMap.has(path.posix.basename(relative))) urlMap.set(path.posix.basename(relative), url)
      assets.push({ name: relative, filePath: target, mimeType: mimeType(relative), publicUrl: url })
    }
    if (extension === '.json' || extension === '.md') {
      const content = await entry.async('string')
      const target = path.join(structuredDir, ...relative.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content, 'utf8')
      if (extension === '.json') {
        try {
          const parsed = JSON.parse(content)
          pageCount = Math.max(pageCount || 0, countPages(parsed) || 0) || pageCount
          if (path.posix.basename(relative).toLowerCase().includes('content_list')) collectUnexplainedVisuals(parsed, unexplainedVisuals)
        } catch { /* keep provider output even if one auxiliary JSON is malformed */ }
      }
    }
  }

  const markdown = rewriteImageLinks(await markdownEntry.async('string'), urlMap)
  fs.writeFileSync(path.join(structuredDir, 'normalized.md'), markdown, 'utf8')
  const visionCandidates = assets.filter(asset => [...unexplainedVisuals].some(reference =>
    asset.name === reference || asset.name.endsWith(`/${reference}`) || path.posix.basename(asset.name) === path.posix.basename(reference)))
  return { text: markdown, assets, pageCount, visionCandidates }
}

export function mineruReady() {
  return Boolean(process.env.MINERU_API_TOKEN?.trim())
}

export function mineruSupports(originalName: string, mimeType = '') {
  return SUPPORTED_EXTENSIONS.has(path.extname(originalName).toLowerCase()) || mimeType === 'application/pdf' || mimeType.startsWith('image/')
}

export async function extractWithMinerU(args: {
  filePath: string
  originalName: string
  outputDir: string
  publicBase: string
  structuredDir: string
  dataId: string
  onStatus?: (status: string, batchId?: string) => void
}): Promise<MinerUExtraction> {
  if (!mineruReady()) throw new Error('尚未配置 MINERU_API_TOKEN')
  const modelVersion = process.env.MINERU_MODEL_VERSION || 'vlm'
  args.onStatus?.('正在申请 MinerU 上传地址')
  const createResponse = await fetch(endpoint('/file-urls/batch'), {
    method: 'POST',
    headers: { ...authorization(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{ name: args.originalName, data_id: args.dataId, is_ocr: (process.env.MINERU_ENABLE_OCR || 'true').toLowerCase() !== 'false' }],
      model_version: modelVersion,
      enable_formula: true,
      enable_table: true,
      language: process.env.MINERU_LANGUAGE || 'ch'
    }),
    signal: AbortSignal.timeout(numberEnv('MINERU_REQUEST_TIMEOUT_MS', 120_000))
  })
  const created = await readEnvelope<BatchCreateResult>(createResponse, '创建任务')
  if (!created.file_urls?.[0]) throw new Error('MinerU 未返回文件上传地址')
  args.onStatus?.('正在上传到 MinerU', created.batch_id)

  const stream = fs.createReadStream(args.filePath)
  const uploadResponse = await fetch(created.file_urls[0], {
    method: 'PUT', body: Readable.toWeb(stream) as BodyInit,
    signal: AbortSignal.timeout(numberEnv('MINERU_UPLOAD_TIMEOUT_MS', 600_000)),
    // Node fetch streams require duplex; the signed upload explicitly must not add Content-Type.
    duplex: 'half'
  } as RequestInit & { duplex: 'half' })
  if (!uploadResponse.ok) throw new Error(`MinerU 文件上传失败：HTTP ${uploadResponse.status}`)

  const startedAt = Date.now()
  const timeout = numberEnv('MINERU_TIMEOUT_MS', 900_000)
  const interval = numberEnv('MINERU_POLL_INTERVAL_MS', 3_000)
  let lastState = ''
  while (Date.now() - startedAt < timeout) {
    const resultResponse = await fetch(endpoint(`/extract-results/batch/${encodeURIComponent(created.batch_id)}`), {
      headers: authorization(), signal: AbortSignal.timeout(numberEnv('MINERU_REQUEST_TIMEOUT_MS', 120_000))
    })
    const batch = await readEnvelope<BatchResult>(resultResponse, '查询任务')
    const result = batch.extract_result?.find(item => item.data_id === args.dataId) || batch.extract_result?.[0]
    if (!result) throw new Error('MinerU 查询结果中没有对应文件')
    if (result.state !== lastState) {
      lastState = result.state
      const progress = result.extract_progress
      const suffix = progress?.total_pages ? `（${progress.extracted_pages || 0}/${progress.total_pages} 页）` : ''
      args.onStatus?.(`MinerU ${result.state}${suffix}`, created.batch_id)
    }
    if (result.state === 'failed') throw new Error(`MinerU 解析失败：${result.err_msg || '服务未返回原因'}`)
    if (result.state === 'done') {
      if (!result.full_zip_url) throw new Error('MinerU 解析完成但未返回结果包地址')
      const zipResponse = await fetch(result.full_zip_url, { signal: AbortSignal.timeout(numberEnv('MINERU_DOWNLOAD_TIMEOUT_MS', 300_000)) })
      if (!zipResponse.ok) throw new Error(`MinerU 结果下载失败：HTTP ${zipResponse.status}`)
      args.onStatus?.('正在整理 MinerU Markdown、JSON 与图片', created.batch_id)
      const unpacked = await unpackResult(await zipResponse.arrayBuffer(), args.outputDir, args.publicBase, args.structuredDir)
      return {
        ...unpacked, parser: 'mineru', batchId: created.batch_id,
        notes: [`MinerU 精准解析完成（${modelVersion}）`, `任务批次：${created.batch_id}`]
      }
    }
    await delay(interval)
  }
  throw new Error(`MinerU 解析超时（已等待 ${Math.round(timeout / 60_000)} 分钟）`)
}
