import { createHmac } from 'node:crypto'
import WebSocket from 'ws'

type XfyunResponse = {
  code: number
  message?: string
  data?: {
    status?: number
    result?: {
      sn?: number
      pgs?: 'apd' | 'rpl'
      rg?: [number, number]
      ws?: { cw?: { w?: string }[] }[]
    }
  }
}

function signedUrl() {
  const apiKey = process.env.XFYUN_API_KEY || ''
  const apiSecret = process.env.XFYUN_API_SECRET || ''
  const host = 'iat-api.xfyun.cn'
  const date = new Date().toUTCString()
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/iat HTTP/1.1`
  const signature = createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64')
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = Buffer.from(authorizationOrigin).toString('base64')
  return `wss://${host}/v2/iat?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`
}

export function transcribePcm(audio: Buffer): Promise<string> {
  if (!process.env.XFYUN_APP_ID || !process.env.XFYUN_API_KEY || !process.env.XFYUN_API_SECRET) {
    return Promise.reject(new Error('科大讯飞语音服务尚未配置'))
  }
  if (!audio.length) return Promise.reject(new Error('没有采集到有效音频'))
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(signedUrl())
    const pieces = new Map<number, string>()
    let offset = 0
    let frameStatus = 0
    let timer: ReturnType<typeof setInterval> | undefined
    const timeout = setTimeout(() => { socket.close(); reject(new Error('语音识别超时，请重试')) }, 70000)
    const finish = (error?: Error) => {
      if (timer) clearInterval(timer)
      clearTimeout(timeout)
      if (error) reject(error)
      else resolve([...pieces.entries()].sort((a, b) => a[0] - b[0]).map(([, text]) => text).join(''))
    }
    socket.on('open', () => {
      const sendFrame = () => {
        if (offset >= audio.length) {
          socket.send(JSON.stringify({ data: { status: 2, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' } }))
          if (timer) clearInterval(timer)
          return
        }
        const chunk = audio.subarray(offset, Math.min(offset + 1280, audio.length))
        const payload: Record<string, unknown> = { data: { status: frameStatus, format: 'audio/L16;rate=16000', encoding: 'raw', audio: chunk.toString('base64') } }
        if (frameStatus === 0) {
          payload.common = { app_id: process.env.XFYUN_APP_ID }
          payload.business = { language: 'zh_cn', domain: 'iat', accent: 'mandarin', dwa: 'wpgs' }
        }
        socket.send(JSON.stringify(payload))
        offset += chunk.length
        frameStatus = 1
      }
      sendFrame()
      timer = setInterval(sendFrame, 40)
    })
    socket.on('message', raw => {
      let response: XfyunResponse
      try { response = JSON.parse(raw.toString()) as XfyunResponse } catch { return }
      if (response.code !== 0) { socket.close(); finish(new Error(`讯飞识别失败：${response.message || response.code}`)); return }
      const result = response.data?.result
      if (result) {
        if (result.pgs === 'rpl' && result.rg) for (let index = result.rg[0]; index <= result.rg[1]; index++) pieces.delete(index)
        pieces.set(result.sn || 0, result.ws?.flatMap(item => item.cw?.map(word => word.w || '') || []).join('') || '')
      }
      if (response.data?.status === 2) { socket.close(); finish() }
    })
    socket.on('error', error => finish(new Error(`无法连接讯飞语音服务：${error.message}`)))
  })
}
