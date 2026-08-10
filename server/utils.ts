import fs from 'node:fs'
import path from 'node:path'
import type { RequestHandler } from 'express'

export const asyncRoute = (handler: (...args: Parameters<RequestHandler>) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void handler(req, res, next).catch(next) }

export const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
export const now = () => new Date().toISOString()

export function loadEnv() {
  const envPath = path.resolve('.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match || match[1] in process.env) continue
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
}

export function normalizeAnswer(value: string | string[]) {
  const text = Array.isArray(value) ? value.join('|') : value
  return text.toLowerCase().replace(/[\s，,。；;：:（）()]/g, '')
}
