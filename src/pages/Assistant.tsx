import { useEffect, useRef, useState } from 'react'
import { BarChart3, Mic, MicOff, Send, Sparkles, UserRound } from 'lucide-react'
import { api } from '../api'
import { Toast } from '../components'
import { MarkdownContent } from '../MarkdownContent'

type Assessment = { id: string; title: string; status: string; category?: 'classroom' | 'homework' }
type Message = { role: 'assistant' | 'user'; text: string }
type SpeechRecognitionLike = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: (event: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; onerror: () => void }
type AudioRecorder = { stop: () => Promise<Blob> }

const prompts = ['这节课最大的共性问题是什么？', '哪个知识点最需要重新讲？', '哪些学生需要重点关注？', '给我一个下一步教学安排']

export default function Assistant() {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [assessmentId, setAssessmentId] = useState('')
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: '我已经读取当前课堂、学生作答和诊断数据。你可以直接问我共性问题、重点学生或下一步教学安排。' }])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [listening, setListening] = useState(false)
  const [toast, setToast] = useState('')
  const [bailianSpeechReady, setBailianSpeechReady] = useState(false)
  const recognition = useRef<SpeechRecognitionLike>()
  const pcmRecorder = useRef<AudioRecorder>()
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => {
    api<Assessment[]>('/api/assessments').then(list => { setAssessments(list); setAssessmentId(list.find(item => item.status === 'published')?.id || list[0]?.id || '') })
    api<{ providers: { speech: boolean } }>('/api/health').then(data => setBailianSpeechReady(data.providers.speech))
    return () => { recognition.current?.stop(); if (pcmRecorder.current) void pcmRecorder.current.stop() }
  }, [])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])
  async function send(text = input) {
    const content = text.trim(); if (!content || sending) return
    setMessages(list => [...list, { role: 'user', text: content }, { role: 'assistant', text: '' }]); setInput(''); setSending(true)
    try {
      const response = await fetch('/api/assistant/chat/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: content, assessmentId }) })
      if (!response.ok || !response.body) throw new Error(`助教请求失败（${response.status}）`)
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
      while (true) {
        const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
        const lines = buffer.split(/\r?\n/); buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as { type: string; text?: string; error?: string }
          if (event.type === 'error') throw new Error(event.error || 'AI 助教暂时无法回答')
          if (event.type === 'delta' && event.text) setMessages(list => list.map((message, index) => index === list.length - 1 ? { ...message, text: message.text + event.text } : message))
        }
        if (done) break
      }
    } catch (error) {
      setMessages(list => list.filter((message, index) => !(index === list.length - 1 && message.role === 'assistant' && !message.text)))
      setToast((error as Error).message)
    } finally { setSending(false) }
  }
  async function toggleVoice() {
    if (bailianSpeechReady) {
      if (listening && pcmRecorder.current) {
        setListening(false)
        try {
          const blob = await pcmRecorder.current.stop(); pcmRecorder.current = undefined
          const form = new FormData(); form.append('audio', blob, 'teacher-question.wav')
          const result = await api<{ text: string }>('/api/assistant/transcribe', { method: 'POST', body: form })
          if (!result.text.trim()) throw new Error('没有识别到有效语音，请重试')
          setInput(result.text); await send(result.text)
        } catch (error) { setToast((error as Error).message) }
        return
      }
      try { pcmRecorder.current = await startPcmRecorder(); setListening(true); setToast('正在录音，再次点击麦克风结束并提问') } catch { setToast('无法访问麦克风，请检查浏览器权限') }
      return
    }
    if (listening) { recognition.current?.stop(); setListening(false); return }
    const Recognition = (window as typeof window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition || (window as typeof window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
    if (!Recognition) { setToast('当前浏览器不支持语音识别，建议使用最新版 Chrome 或 Edge'); return }
    const instance = new Recognition(); instance.lang = 'zh-CN'; instance.continuous = false; instance.interimResults = false
    instance.onresult = event => { const text = event.results[0][0].transcript; setInput(text); setListening(false); void send(text) }
    instance.onend = () => setListening(false); instance.onerror = () => { setListening(false); setToast('没有识别到语音，请重试') }
    recognition.current = instance; instance.start(); setListening(true)
  }
  return <div className="assistant-layout">
    <section className="assistant-context panel"><div className="context-head"><div className="assistant-logo"><Sparkles /></div><div><h2>辽科智学助教</h2><span><i />已读取教学数据</span></div></div><label>分析任务<select value={assessmentId} onChange={event => setAssessmentId(event.target.value)}>{assessments.map(item => <option value={item.id} key={item.id}>{item.category === 'homework' ? '课后作业' : '课堂检测'} · {item.title}</option>)}</select></label><div className="context-scope"><h3>我可以读取</h3><span><BarChart3 size={17} />课堂与作业统计</span><span><UserRound size={17} />学生表现与错误类型</span><span><Sparkles size={17} />知识点掌握与历史记录</span></div></section>
    <section className="chat-panel panel"><div className="chat-head"><div><h2>教学对话</h2><p>回答引用课程知识文件和真实作答，支持公式与插图。</p></div><span>{sending ? '正在生成' : '数据驱动'}</span></div><div className="messages">{messages.map((message, index) => <div className={`message ${message.role} ${sending && index === messages.length - 1 ? 'streaming' : ''}`} key={index}>{message.role === 'assistant' && <div className="message-avatar"><Sparkles size={16} /></div>}<div>{message.role === 'assistant' ? message.text ? <MarkdownContent content={message.text} compact /> : <div className="typing"><i /><i /><i /></div> : message.text}</div></div>)}<div ref={bottom} /></div><div className="prompt-row">{prompts.map(prompt => <button key={prompt} onClick={() => send(prompt)}>{prompt}</button>)}</div><div className={`chat-input ${listening ? 'listening' : ''}`}><button className="voice-btn" onClick={toggleVoice} title="语音提问">{listening ? <MicOff /> : <Mic />}</button><textarea rows={1} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} placeholder={listening ? '正在听，请说话…' : '问问课堂、作业学情或下一步教学方案'} /><button className="send-btn" onClick={() => send()} disabled={!input.trim() || sending}><Send size={18} /></button></div></section>
    {toast && <Toast message={toast} type="error" onDone={() => setToast('')} />}
  </div>
}

async function startPcmRecorder(): Promise<AudioRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
  const context = new AudioContext()
  const source = context.createMediaStreamSource(stream)
  const processor = context.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []
  processor.onaudioprocess = event => chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
  source.connect(processor); processor.connect(context.destination)
  return {
    async stop() {
      processor.disconnect(); source.disconnect(); stream.getTracks().forEach(track => track.stop()); await context.close()
      const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const merged = new Float32Array(length); let offset = 0
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length }
      const ratio = context.sampleRate / 16000
      const output = new Int16Array(Math.floor(merged.length / ratio))
      for (let index = 0; index < output.length; index++) {
        const start = Math.floor(index * ratio); const end = Math.min(merged.length, Math.floor((index + 1) * ratio))
        let sum = 0; for (let input = start; input < end; input++) sum += merged[input]
        const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)))
        output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      }
      const wav = new ArrayBuffer(44 + output.byteLength)
      const view = new DataView(wav)
      const write = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
      write(0, 'RIFF'); view.setUint32(4, 36 + output.byteLength, true); write(8, 'WAVE'); write(12, 'fmt ')
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true)
      view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, output.byteLength, true)
      new Int16Array(wav, 44).set(output)
      return new Blob([wav], { type: 'audio/wav' })
    }
  }
}
