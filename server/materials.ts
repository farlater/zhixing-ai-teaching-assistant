import fs from 'node:fs'
import path from 'node:path'
import mammoth from 'mammoth'
import pdf from 'pdf-parse'

export async function extractMaterial(filePath: string, mimeType: string, originalName: string) {
  const extension = path.extname(originalName).toLowerCase()
  if (['.txt', '.md', '.csv', '.json', '.html'].includes(extension) || mimeType.startsWith('text/')) {
    return fs.readFileSync(filePath, 'utf8').slice(0, 100000)
  }
  if (extension === '.pdf' || mimeType === 'application/pdf') {
    const result = await pdf(fs.readFileSync(filePath))
    return result.text.slice(0, 100000)
  }
  if (extension === '.docx' || mimeType.includes('wordprocessingml')) {
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value.slice(0, 100000)
  }
  return ''
}
