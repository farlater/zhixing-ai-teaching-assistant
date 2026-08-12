import fs from 'node:fs'
import type { Database, GenerateConfig, Question, AnswerResult, ClassReport, KnowledgePoint, Practice, ReportDiagnosis } from '../shared/types.js'
import { heuristicSubjectiveGrade } from './grading.js'
import { id, now } from './utils.js'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | unknown[] }

function promptFile(name: string, fallback: string) {
  try { return fs.readFileSync(`prompts/${name}.md`, 'utf8').trim() || fallback } catch { return fallback }
}

function balancedJsonCandidates(source: string) {
  const candidates: string[] = []
  for (let start = 0; start < source.length; start++) {
    if (source[start] !== '{' && source[start] !== '[') continue
    const stack: string[] = []
    let inString = false
    let escaped = false
    for (let index = start; index < source.length; index++) {
      const character = source[index]
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
        continue
      }
      if (character === '"') { inString = true; continue }
      if (character === '{' || character === '[') stack.push(character)
      else if (character === '}' || character === ']') {
        const expected = character === '}' ? '{' : '['
        if (stack.pop() !== expected) break
        if (!stack.length) { candidates.push(source.slice(start, index + 1)); break }
      }
    }
  }
  return candidates
}

export function extractModelJson(text: string) {
  const cleaned = String(text || '').replace(/^\uFEFF/, '').trim()
  const fenced = [...cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1].trim())
  const sources = [...fenced, cleaned]
  const parsed: unknown[] = []
  for (const source of sources) {
    for (const candidate of [source, ...balancedJsonCandidates(source)]) {
      try {
        const value = JSON.parse(candidate)
        if (value && typeof value === 'object' && !Array.isArray(value) && 'questions' in value) return value
        parsed.push(value)
      } catch { /* 继续尝试下一个完整 JSON 片段 */ }
    }
  }
  if (parsed.length) return parsed[0]
  throw new Error('AI 已返回内容，但 JSON 结构无法解析。请重试一次；若仍失败，请在 AI 配置中确认文本模型名称。')
}

export function bailianReady() {
  return Boolean(process.env.DASHSCOPE_API_KEY)
}

export async function chat(messages: ChatMessage[], options?: { json?: boolean; temperature?: number; model?: string; maxTokens?: number }) {
  const key = process.env.DASHSCOPE_API_KEY
  if (!key) throw new Error('BAILIAN_NOT_CONFIGURED')
  const base = (process.env.BAILIAN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '')
  const model = options?.model || process.env.BAILIAN_TEXT_MODEL || 'deepseek-v4-flash'
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, messages,
      temperature: options?.temperature ?? .3,
      max_tokens: options?.maxTokens || 4096,
      ...(options?.json && !model.startsWith('deepseek-') ? { response_format: { type: 'json_object' } } : {})
    }),
    signal: AbortSignal.timeout(60000)
  })
  if (!response.ok) throw new Error(`百炼模型请求失败：${response.status} ${await response.text()}`)
  const data = await response.json() as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content || ''
}

export async function streamChat(messages: ChatMessage[], onDelta: (text: string) => void, options?: { temperature?: number; model?: string; maxTokens?: number }) {
  const key = process.env.DASHSCOPE_API_KEY
  if (!key) throw new Error('BAILIAN_NOT_CONFIGURED')
  const base = (process.env.BAILIAN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '')
  const model = options?.model || process.env.BAILIAN_TEXT_MODEL || 'deepseek-v4-flash'
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, stream: true, temperature: options?.temperature ?? .25, max_tokens: options?.maxTokens || 4096 }),
    signal: AbortSignal.timeout(90000)
  })
  if (!response.ok) throw new Error(`百炼模型请求失败：${response.status} ${await response.text()}`)
  if (!response.body) throw new Error('百炼模型没有返回可读取的数据流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) {
      const payload = line.trim().replace(/^data:\s*/, '')
      if (!payload || payload === '[DONE]') continue
      try {
        const data = JSON.parse(payload) as { choices?: { delta?: { content?: string }; message?: { content?: string } }[] }
        const delta = data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content || ''
        if (delta) onDelta(delta)
      } catch { /* 忽略心跳或非 JSON 的 SSE 行 */ }
    }
    if (done) break
  }
}

function fallbackQuestion(config: GenerateConfig, db: Database, index: number): Question {
  const points = db.knowledgePoints.filter(point => config.knowledgePointIds.includes(point.id))
  const point = points[index % Math.max(points.length, 1)] || db.knowledgePoints.find(item => item.courseId === config.courseId)
  if (!point) throw new Error('请先为课程添加知识点')
  const type = config.types[index % Math.max(config.types.length, 1)] || 'short'
  const base = {
    id: id('q'), courseId: config.courseId, knowledgePointId: point.id, type, difficulty: config.difficulty,
    explanation: point.description, formula: point.formula, abilities: ['概念理解'] as Question['abilities'],
    source: 'ai' as const, status: 'draft' as const, createdAt: now()
  }
  if (type === 'single') return { ...base, stem: `关于“${point.name}”，下列说法中最符合本节课定义的是？`, options: [point.description, '它与题设条件完全无关', '任何情况下结论都相反', '只需要记住名称，不需要理解含义'], answer: 'A', maxScore: 5 }
  if (type === 'multiple') return { ...base, stem: `学习“${point.name}”时，哪些做法有助于正确解决问题？`, options: ['先识别已知条件', '使用相关概念或公式', '检查推导和结论', '忽略题目中的限制条件'], answer: ['A', 'B', 'C'], maxScore: 6, abilities: ['概念理解', '推理'] }
  if (type === 'truefalse') return { ...base, stem: `判断：${point.description}`, options: ['正确', '错误'], answer: '正确', maxScore: 4 }
  if (type === 'blank') return { ...base, stem: `请写出“${point.name}”对应的核心公式或关键词：____。`, answer: point.formula || point.name, maxScore: 5, abilities: ['公式掌握'] }
  return { ...base, stem: `请用自己的话解释“${point.name}”，并结合一个简单例子说明如何应用。`, answer: point.description, rubric: '概念准确 4 分；应用过程合理 4 分；表达清楚 2 分。', maxScore: 10, abilities: ['概念理解', '公式应用', '表达'] }
}

export async function generateQuestions(config: GenerateConfig, db: Database): Promise<Question[]> {
  const course = db.courses.find(item => item.id === config.courseId)
  const points = db.knowledgePoints.filter(item => config.knowledgePointIds.includes(item.id))
  const materials = db.materials.filter(item => item.courseId === config.courseId && item.status === 'ready').map(item => item.extractedText).join('\n').slice(0, 18000)
  if (!bailianReady()) throw new Error('尚未配置百炼 API。请先运行“配置AI服务”并填写 DASHSCOPE_API_KEY。')
  const prompt = `请为课程“${course?.name}”（${course?.grade}${course?.subject}）生成 ${config.count} 道课堂诊断题。\n知识点：${JSON.stringify(points.map(point => ({ id: point.id, name: point.name, description: point.description, formula: point.formula })))}\n教师资料：${materials || '暂无资料，请严格围绕知识点'}\n题型只可使用：${config.types.join(',')}，难度：${config.difficulty}。\n返回 JSON 对象 {"questions": [...]}。每题必须包含 knowledgePointId,type,stem,options(若需要),answer,explanation,rubric,formula,maxScore,abilities。type 为 single/multiple/truefalse/blank/short；abilities 只用 概念理解/公式掌握/公式应用/推理/计算/表达。选择题答案用 A/B/C/D，多选用数组。题目必须能区分学生具体错误，答案无歧义。`
  const raw = await chat([{ role: 'system', content: promptFile('question-generation', '你是高校课程的教学诊断出题助教，只输出指定 JSON。') }, { role: 'user', content: prompt }], { json: true })
  const parsed = extractModelJson(raw) as { questions?: Partial<Question>[] }
  if (!Array.isArray(parsed.questions)) throw new Error('AI 返回结果中缺少 questions 数组，请重试。')
  return (parsed.questions || []).slice(0, config.count).map((question, index) => ({
    ...fallbackQuestion(config, db, index), ...question, id: id('q'), courseId: config.courseId,
    source: 'ai', status: 'draft', createdAt: now()
  })) as Question[]
}

export async function generateQuestionVariants(config: GenerateConfig, db: Database, templates: Question[]): Promise<Question[]> {
  if (!bailianReady()) throw new Error('尚未配置百炼 API，不能生成题库数值变式。')
  const numericTemplates = templates.filter(question => /\d/.test(`${question.stem}\n${question.answer}\n${question.formula || ''}`))
  if (!numericTemplates.length) throw new Error('选中的题库题目没有可修改的数值条件，请换题或选择“题库优先，AI 补充”。')
  const selected = Array.from({ length: config.count }, (_, index) => numericTemplates[index % numericTemplates.length])
  const compact = selected.map((question, index) => ({
    index,
    knowledgePointId: question.knowledgePointId,
    type: question.type,
    stem: question.stem,
    options: question.options,
    answer: question.answer,
    explanation: question.explanation,
    rubric: question.rubric,
    formula: question.formula,
    maxScore: question.maxScore,
    abilities: question.abilities
  }))
  const prompt = `请把下面 ${selected.length} 道题库模板改成数值变式题。只允许修改已知数值、量纲以及随之变化的选项、答案和解析，不改变原考点、题型、难度、机构图含义或评分能力。必须重新计算并核验答案；不得虚构新图片。题干原有 Markdown 图片引用必须原样保留。\n题库模板：${JSON.stringify(compact)}\n返回 JSON 对象 {"questions":[...]}，每题包含 knowledgePointId,type,stem,options,answer,explanation,rubric,formula,maxScore,abilities，顺序与模板一致。`
  const raw = await chat([
    { role: 'system', content: `${promptFile('question-generation', '你是高校课程的教学诊断出题助教，只输出指定 JSON。')}\n\n本次任务是题库数值变式：必须重算答案，保持原图引用和知识点不变。` },
    { role: 'user', content: prompt }
  ], { json: true, temperature: .15, maxTokens: 4096 })
  const parsed = extractModelJson(raw) as { questions?: Partial<Question>[] }
  if (!Array.isArray(parsed.questions)) throw new Error('AI 返回结果中缺少 questions 数组，请重试。')
  return selected.map((template, index) => {
    const variant = parsed.questions?.[index] || {}
    const imageMarkdown = template.stem.match(/!\[[^\]]*\]\([^\s)]+(?:\s+"[^"]*")?\)/g)?.join('\n\n') || ''
    let stem = String(variant.stem || template.stem)
    if (imageMarkdown && !/!\[[^\]]*\]\(/.test(stem)) stem = `${imageMarkdown}\n\n${stem}`
    return {
      ...template,
      ...variant,
      id: id('q'),
      courseId: config.courseId,
      knowledgePointId: template.knowledgePointId,
      type: template.type,
      stem,
      source: 'ai',
      status: 'draft',
      createdAt: now()
    } as Question
  })
}

export async function gradeSubjective(question: Question, answer: string | string[]): Promise<AnswerResult> {
  if (!bailianReady()) return heuristicSubjectiveGrade(question, answer)
  const prompt = `题目：${question.stem}\n学生答案：${Array.isArray(answer) ? answer.join('、') : answer}\n参考答案：${Array.isArray(question.answer) ? question.answer.join('、') : question.answer}\n满分：${question.maxScore}\n评分标准：${question.rubric || question.explanation}\n能力维度：${question.abilities.join('、')}\n请严格依据学生实际作答评分。返回 JSON：{"score":数字,"correct":布尔,"diagnosis":{"summary":"","errorLocation":"","errorReason":"","errorType":"","suggestion":"","relatedConcept":"","abilityScores":{}}}。得分范围 0-${question.maxScore}。`
  try {
    const raw = await chat([{ role: 'system', content: promptFile('grading-diagnosis', '你是高校课程的教学诊断评分助教。客观、具体，不臆测学生未写出的内容，只输出 JSON。') }, { role: 'user', content: prompt }], { json: true, temperature: .1 })
    const parsed = extractModelJson(raw) as Omit<AnswerResult, 'questionId' | 'answer'>
    return { questionId: question.id, answer, score: Math.max(0, Math.min(question.maxScore, Number(parsed.score) || 0)), correct: Boolean(parsed.correct), diagnosis: parsed.diagnosis }
  } catch {
    return heuristicSubjectiveGrade(question, answer)
  }
}

async function readImageWithVision(filePath: string, mimeType: string, prompt: string) {
  const key = process.env.DASHSCOPE_API_KEY
  if (!key) return { text: '', note: '已保存图片；配置百炼 API 后可自动识别手写答案。', provider: 'demo' }
  const base64 = fs.readFileSync(filePath).toString('base64')
  const base = (process.env.BAILIAN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '')
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.BAILIAN_VISION_MODEL || 'qwen3-vl-flash', messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
      { type: 'text', text: prompt }
    ] }], max_tokens: 2048, temperature: 0.1 }), signal: AbortSignal.timeout(60000)
  })
  if (!response.ok) throw new Error(`百炼视觉请求失败：${response.status} ${await response.text()}`)
  const data = await response.json() as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } }
  const tokenNote = data.usage?.total_tokens ? `，本次使用 ${data.usage.total_tokens} Tokens` : ''
  return { text: data.choices?.[0]?.message?.content || '', note: `百炼视觉识别完成${tokenNote}`, provider: 'bailian', usage: data.usage }
}

export async function extractAnswerFromImage(filePath: string, mimeType: string) {
  return readImageWithVision(filePath, mimeType, promptFile('vision-answer-extraction', '请忠实提取图片中的学生作答、公式、步骤和图中标注。不要评分或纠错；无法辨认处标记为 [无法辨认]。'))
}

export async function describeInstructionalImage(filePath: string, mimeType: string) {
  if (!bailianReady()) return ''
  const result = await readImageWithVision(filePath, mimeType, '这是一份课程资料中的页面或插图。请提取其中的标题、正文、公式、表格或图示含义，按原有层级整理为简洁 Markdown。公式使用 LaTeX；若只是装饰图请写“装饰性图片”。不要补充图中不存在的知识。')
  if (!result.text) return ''
  return result.text
}

export async function teacherAssistant(message: string, db: Database, report?: ClassReport | null, retrievedContext = '', globalPrompt = '') {
  const context = report ? JSON.stringify({
    title: report.assessment.title, submittedCount: report.submittedCount, averageScore: report.averageScore,
    accuracy: report.accuracy
  }) : '{}'
  if (bailianReady()) {
    return chat([{ role: 'system', content: `${globalPrompt || '你是教师的课堂诊断助教。'}\n\n检索到的课程知识文件：\n${retrievedContext || '暂无匹配文件'}\n\n课堂统计快照：\n${context}` }, { role: 'user', content: message }], { temperature: .25 })
  }
  if (!report || !report.submittedCount) return '当前还没有足够的课堂作答数据。建议先发布检测并等待学生提交，我会根据真实数据形成诊断。'
  const weakest = [...report.knowledgeMastery].sort((a, b) => a.value - b.value)[0]
  const hardest = [...report.questionStats].sort((a, b) => a.accuracy - b.accuracy)[0]
  const attention = report.students.filter(student => student.rate < 60)
  return `从本次 ${report.submittedCount} 份作答看，班级整体掌握度为 ${report.accuracy}%。最需要回讲的是“${weakest?.name}”（${weakest?.value}%）；第 ${hardest?.index} 题正确率最低，为 ${hardest?.accuracy}%。建议先用 3 分钟让学生复述核心概念，再展示一道典型错例，最后安排一题同构变式。${attention.length ? `需要重点关注：${attention.map(item => item.name).join('、')}。` : ''}`
}

export async function teacherAssistantStream(message: string, db: Database, report: ClassReport | null | undefined, retrievedContext: string, globalPrompt: string, onDelta: (text: string) => void) {
  const context = report ? JSON.stringify({
    title: report.assessment.title, category: report.assessment.category, submittedCount: report.submittedCount,
    averageScore: report.averageScore, accuracy: report.accuracy, knowledgeMastery: report.knowledgeMastery,
    questionStats: report.questionStats, students: report.students.slice(0, 15)
  }) : '{}'
  if (bailianReady()) {
    await streamChat([
      { role: 'system', content: `${globalPrompt || '你是教师的教学诊断助教。'}\n\n检索到的课程知识文件：\n${retrievedContext || '暂无匹配文件'}\n\n当前教学任务统计快照：\n${context}` },
      { role: 'user', content: message }
    ], onDelta, { temperature: .25 })
    return
  }
  const fallback = await teacherAssistant(message, db, report, retrievedContext, globalPrompt)
  for (const part of fallback.match(/.{1,12}/gs) || [fallback]) onDelta(part)
}

export async function generateClassDiagnosis(report: ClassReport): Promise<ReportDiagnosis> {
  const weakest = [...report.knowledgeMastery].sort((a, b) => a.value - b.value)[0]
  const hardest = [...report.questionStats].sort((a, b) => a.accuracy - b.accuracy)[0]
  const fallback: ReportDiagnosis = {
    summary: `本次共收到 ${report.submittedCount} 份作答，整体掌握度为 ${report.accuracy}%。当前主要问题集中在“${weakest?.name || '待继续观察'}”，第 ${hardest?.index || 0} 题的完整正确率最低。`,
    suggestions: [
      weakest ? `优先回讲“${weakest.name}”，用一份典型错例让学生标出出错步骤。` : '继续收集作答后再确定回讲重点。',
      hardest ? `围绕第 ${hardest.index} 题安排一道同构变式，要求学生写出完整判断依据。` : '安排一道限时变式题验证掌握情况。',
      report.students.some(student => student.rate < 60) ? '对低于60分的学生安排公式回忆与基础步骤练习，再进行一次短测。' : '全班基础表现较稳，可进入进阶变式练习。'
    ],
    updatedAt: now(),
    source: 'fallback'
  }
  if (!bailianReady()) return fallback
  const statistics = {
    title: report.assessment.title,
    submittedCount: report.submittedCount,
    averageScore: report.averageScore,
    accuracy: report.accuracy,
    knowledgeMastery: report.knowledgeMastery,
    questionStats: report.questionStats,
    errorTypes: report.errorTypes,
    below60Count: report.students.filter(student => student.rate < 60).length
  }
  const raw = await chat([
    { role: 'system', content: '你是高校机械原理课堂诊断助教。只依据提供的统计数据形成简洁、可执行的教学诊断，不臆造学生表现。只输出 JSON。' },
    { role: 'user', content: `课堂统计：${JSON.stringify(statistics)}\n返回 JSON：{"summary":"一段80-160字的班级诊断","suggestions":["建议1","建议2","建议3"]}。诊断要指出证据，建议包含回讲重点、练习形式和复测方式。` }
  ], { json: true, temperature: .2, maxTokens: 1200 })
  const parsed = extractModelJson(raw) as { summary?: string; suggestions?: string[] }
  return {
    summary: String(parsed.summary || fallback.summary),
    suggestions: Array.isArray(parsed.suggestions) && parsed.suggestions.length ? parsed.suggestions.slice(0, 4).map(String) : fallback.suggestions,
    updatedAt: now(),
    source: 'bailian'
  }
}

export async function generatePracticeQuestion(input: {
  mode: Practice['mode']
  point: KnowledgePoint
  sourceQuestion?: Question
  lastAnswer?: AnswerResult
}, db: Database): Promise<Question> {
  const type = input.mode === 'formula' ? 'blank' : 'short'
  const config: GenerateConfig = { courseId: input.point.courseId, knowledgePointIds: [input.point.id], count: 1, types: [type], difficulty: '基础', source: 'ai' }
  const fallback = { ...fallbackQuestion(config, db, 0), source: 'practice' as const }
  if (!bailianReady()) return fallback
  const context = {
    mode: input.mode,
    knowledgePoint: { name: input.point.name, description: input.point.description, formula: input.point.formula },
    sourceQuestion: input.sourceQuestion ? { stem: input.sourceQuestion.stem, answer: input.sourceQuestion.answer, rubric: input.sourceQuestion.rubric, formula: input.sourceQuestion.formula } : undefined,
    studentAnswer: input.lastAnswer ? { answer: input.lastAnswer.extractedText || input.lastAnswer.answer, score: input.lastAnswer.score, diagnosis: input.lastAnswer.diagnosis } : undefined
  }
  const raw = await chat([
    { role: 'system', content: promptFile('practice-generation', '你是高校机械原理强化练习设计助教，只输出指定 JSON。') },
    { role: 'user', content: `请根据以下信息生成1道强化练习：${JSON.stringify(context)}。模式为 ${input.mode}。严格返回 {"question":{...}}。` }
  ], { json: true, temperature: .25, maxTokens: 1600 })
  const parsed = extractModelJson(raw) as { question?: Partial<Question> }
  if (!parsed.question || typeof parsed.question !== 'object') return fallback
  return {
    ...fallback,
    ...parsed.question,
    id: id('practice-q'),
    courseId: input.point.courseId,
    knowledgePointId: input.point.id,
    type,
    source: 'practice',
    status: 'confirmed',
    createdAt: now()
  }
}
