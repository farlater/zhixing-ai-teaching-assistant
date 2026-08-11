import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { extractWithMinerU } from './mineru.js'

test('MinerU 本地文件流程会上传、轮询并保留 Markdown、JSON 和未语义化插图', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixing-mineru-'))
  const source = path.join(root, 'lesson.pdf')
  const output = path.join(root, 'assets')
  const structured = path.join(root, 'structured')
  fs.writeFileSync(source, 'fake-pdf')

  const zip = new JSZip()
  zip.file('lesson/full.md', '# 函数讲义\n\n![](images/chart.png)')
  zip.file('lesson/images/chart.png', Buffer.from([137, 80, 78, 71]))
  zip.file('lesson/lesson_content_list.json', JSON.stringify([
    { type: 'text', text: '函数图像', page_idx: 0 },
    { type: 'image', img_path: 'images/chart.png', image_caption: ['图 1'], page_idx: 1 }
  ]))
  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })

  const originalFetch = globalThis.fetch
  const originalToken = process.env.MINERU_API_TOKEN
  const originalInterval = process.env.MINERU_POLL_INTERVAL_MS
  process.env.MINERU_API_TOKEN = 'test-mineru-token'
  process.env.MINERU_POLL_INTERVAL_MS = '1'
  let call = 0
  try {
    globalThis.fetch = async (input, init) => {
      call += 1
      if (call === 1) {
        assert.equal(String(input), 'https://mineru.net/api/v4/file-urls/batch')
        assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-mineru-token')
        const body = JSON.parse(String(init?.body)) as { model_version: string; files: { is_ocr: boolean }[] }
        assert.equal(body.model_version, 'vlm')
        assert.equal(body.files[0].is_ocr, true)
        return Response.json({ code: 0, msg: 'ok', data: { batch_id: 'batch-1', file_urls: ['https://upload.example/signed'] } })
      }
      if (call === 2) {
        assert.equal(String(input), 'https://upload.example/signed')
        assert.equal(init?.method, 'PUT')
        assert.equal(init?.headers, undefined)
        await new Response(init?.body).arrayBuffer()
        return new Response('', { status: 200 })
      }
      if (call === 3) {
        assert.equal(String(input), 'https://mineru.net/api/v4/extract-results/batch/batch-1')
        return Response.json({ code: 0, msg: 'ok', data: { extract_result: [{ file_name: 'lesson.pdf', data_id: 'material-1', state: 'running', extract_progress: { extracted_pages: 1, total_pages: 2 } }] } })
      }
      if (call === 4) {
        return Response.json({ code: 0, msg: 'ok', data: { extract_result: [{ file_name: 'lesson.pdf', data_id: 'material-1', state: 'done', full_zip_url: 'https://download.example/result.zip' }] } })
      }
      assert.equal(String(input), 'https://download.example/result.zip')
      return new Response(zipBuffer, { status: 200 })
    }

    const result = await extractWithMinerU({
      filePath: source, originalName: '函数讲义.pdf', outputDir: output,
      publicBase: '/uploads/materials/material-1', structuredDir: structured, dataId: 'material-1'
    })

    assert.equal(result.batchId, 'batch-1')
    assert.equal(result.pageCount, 2)
    assert.equal(result.assets.length, 1)
    assert.equal(result.visionCandidates.length, 1)
    assert.match(result.text, /\/uploads\/materials\/material-1\/lesson\/images\/chart.png/)
    assert.ok(fs.existsSync(path.join(structured, 'lesson', 'lesson_content_list.json')))
    assert.ok(fs.existsSync(path.join(structured, 'normalized.md')))
    assert.equal(call, 5)
  } finally {
    globalThis.fetch = originalFetch
    if (originalToken === undefined) delete process.env.MINERU_API_TOKEN
    else process.env.MINERU_API_TOKEN = originalToken
    if (originalInterval === undefined) delete process.env.MINERU_POLL_INTERVAL_MS
    else process.env.MINERU_POLL_INTERVAL_MS = originalInterval
    fs.rmSync(root, { recursive: true, force: true })
  }
})
