import fs from 'node:fs'
import type { Database, GenerateConfig, Question, AnswerResult, ClassReport } from '../shared/types.js'
import { heuristicSubjectiveGrade } from './grading.js'
import { id, now } from './utils.js'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | unknown[] }

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const source = fenced || text.slice(text.indexOf(text.includes('[') ? '[' : '{'), Math.max(text.lastIndexOf(']'), text.lastIndexOf('}')) + 1)
  return JSON.parse(source)
}

async function chat(messages: ChatMessage[], options?: { json?: boolean; temperature?: number }) {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error('DEEPSEEK_NOT_CONFIGURED')
  const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash', messages,
      temperature: options?.temperature ?? .3,
      ...(options?.json ? { response_format: { type: 'json_object' } } : {})
    }),
    signal: AbortSignal.timeout(60000)
  })
  if (!response.ok) throw new Error(`DeepSeek 请求失败：${response.status} ${await response.text()}`)
  const data = await response.json() as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content || ''
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
  if (!process.env.DEEPSEEK_API_KEY) return Array.from({ length: config.count }, (_, index) => fallbackQuestion(config, db, index))
  const prompt = `请为课程“${course?.name}”（${course?.grade}${course?.subject}）生成 ${config.count} 道课堂诊断题。\n知识点：${JSON.stringify(points.map(point => ({ id: point.id, name: point.name, description: point.description, formula: point.formula })))}\n教师资料：${materials || '暂无资料，请严格围绕知识点'}\n题型只可使用：${config.types.join(',')}，难度：${config.difficulty}。\n返回 JSON 对象 {"questions": [...]}。每题必须包含 knowledgePointId,type,stem,options(若需要),answer,explanation,rubric,formula,maxScore,abilities。type 为 single/multiple/truefalse/blank/short；abilities 只用 概念理解/公式掌握/公式应用/推理/计算/表达。选择题答案用 A/B/C/D，多选用数组。题目必须能区分学生具体错误，答案无歧义。`
  const raw = await chat([{ role: 'system', content: '你是一名严谨的中学教师和测评专家，只输出指定 JSON。' }, { role: 'user', content: prompt }], { json: true })
  const parsed = extractJson(raw) as { questions?: Partial<Question>[] }
  return (parsed.questions || []).slice(0, config.count).map((question, index) => ({
    ...fallbackQuestion(config, db, index), ...question, id: id('q'), courseId: config.courseId,
    source: 'ai', status: 'draft', createdAt: now()
  })) as Question[]
}

export async function gradeSubjective(question: Question, answer: string | string[]): Promise<AnswerResult> {
  if (!process.env.DEEPSEEK_API_KEY) return heuristicSubjectiveGrade(question, answer)
  const prompt = `题目：${question.stem}\n学生答案：${Array.isArray(answer) ? answer.join('、') : answer}\n参考答案：${Array.isArray(question.answer) ? question.answer.join('、') : question.answer}\n满分：${question.maxScore}\n评分标准：${question.rubric || question.explanation}\n能力维度：${question.abilities.join('、')}\n请严格依据学生实际作答评分。返回 JSON：{"score":数字,"correct":布尔,"diagnosis":{"summary":"","errorLocation":"","errorReason":"","errorType":"","suggestion":"","relatedConcept":"","abilityScores":{}}}。得分范围 0-${question.maxScore}。`
  try {
    const raw = await chat([{ role: 'system', content: '你是教学诊断评分器。客观、具体，不臆测学生未写出的内容，只输出 JSON。' }, { role: 'user', content: prompt }], { json: true, temperature: .1 })
    const parsed = extractJson(raw) as Omit<AnswerResult, 'questionId' | 'answer'>
    return { questionId: question.id, answer, score: Math.max(0, Math.min(question.maxScore, Number(parsed.score) || 0)), correct: Boolean(parsed.correct), diagnosis: parsed.diagnosis }
  } catch {
    return heuristicSubjectiveGrade(question, answer)
  }
}

export async function extractAnswerFromImage(filePath: string, mimeType: string) {
  const key = process.env.ZHIPU_API_KEY
  if (!key) return { text: '', note: '已保存图片；配置智谱视觉 API 后可自动识别手写答案。', provider: 'demo' }
  const base64 = fs.readFileSync(filePath).toString('base64')
  const base = (process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '')
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.ZHIPU_VISION_MODEL || 'glm-4v-plus-0111', messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
      { type: 'text', text: '请准确提取这张学生答题图片中的答案、公式和解题步骤。保留原有顺序，只输出识别到的作答文字，不要评分。' }
    ] }], max_tokens: 2048, temperature: 0.1 }), signal: AbortSignal.timeout(60000)
  })
  if (!response.ok) throw new Error(`智谱视觉请求失败：${response.status} ${await response.text()}`)
  const data = await response.json() as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } }
  const tokenNote = data.usage?.total_tokens ? `，本次使用 ${data.usage.total_tokens} Tokens` : ''
  return { text: data.choices?.[0]?.message?.content || '', note: `智谱视觉识别完成${tokenNote}`, provider: 'zhipu', usage: data.usage }
}

export async function teacherAssistant(message: string, db: Database, report?: ClassReport | null) {
  const context = report ? JSON.stringify({
    title: report.assessment.title, submittedCount: report.submittedCount, averageScore: report.averageScore,
    accuracy: report.accuracy, knowledgeMastery: report.knowledgeMastery, questionStats: report.questionStats,
    errorTypes: report.errorTypes, students: report.students, suggestions: report.suggestions
  }) : '{}'
  if (process.env.DEEPSEEK_API_KEY) {
    return chat([{ role: 'system', content: `你是教师的课堂诊断助教。只根据给定真实数据回答，不编造学生情况。给出简洁、可执行的教学建议。当前课堂数据：${context}` }, { role: 'user', content: message }], { temperature: .25 })
  }
  if (!report || !report.submittedCount) return '当前还没有足够的课堂作答数据。建议先发布检测并等待学生提交，我会根据真实数据形成诊断。'
  const weakest = [...report.knowledgeMastery].sort((a, b) => a.value - b.value)[0]
  const hardest = [...report.questionStats].sort((a, b) => a.accuracy - b.accuracy)[0]
  const attention = report.students.filter(student => student.rate < 60)
  return `从本次 ${report.submittedCount} 份作答看，班级整体掌握度为 ${report.accuracy}%。最需要回讲的是“${weakest?.name}”（${weakest?.value}%）；第 ${hardest?.index} 题正确率最低，为 ${hardest?.accuracy}%。建议先用 3 分钟让学生复述核心概念，再展示一道典型错例，最后安排一题同构变式。${attention.length ? `需要重点关注：${attention.map(item => item.name).join('、')}。` : ''}`
}
