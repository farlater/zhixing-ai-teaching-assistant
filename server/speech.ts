function audioMime(mimeType: string) {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'audio/mpeg'
  if (mimeType.includes('webm')) return 'audio/webm'
  if (mimeType.includes('ogg')) return 'audio/ogg'
  return 'audio/wav'
}

export async function transcribeAudio(audio: Buffer, mimeType = 'audio/wav'): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY
  if (!key) throw new Error('百炼语音识别尚未配置')
  if (!audio.length) throw new Error('没有采集到有效音频')
  if (audio.length > 10 * 1024 * 1024) throw new Error('音频超过百炼单次 10MB 限制')
  const base = (process.env.BAILIAN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '')
  const dataUrl = `data:${audioMime(mimeType)};base64,${audio.toString('base64')}`
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.BAILIAN_ASR_MODEL || 'qwen3-asr-flash',
      messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: dataUrl } }] }],
      asr_options: { language: 'zh', enable_itn: true },
      temperature: 0
    }),
    signal: AbortSignal.timeout(70000)
  })
  if (!response.ok) throw new Error(`百炼语音识别失败：${response.status} ${await response.text()}`)
  const result = await response.json() as { choices?: { message?: { content?: string } }[] }
  return result.choices?.[0]?.message?.content?.trim() || ''
}
