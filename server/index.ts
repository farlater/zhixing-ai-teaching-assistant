import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { store } from './store.js'
import { asyncRoute, id, loadEnv, now } from './utils.js'
import { extractMaterial } from './materials.js'
import { generateQuestions, gradeSubjective, extractAnswerFromImage, teacherAssistant } from './ai.js'
import { programGrade } from './grading.js'
import { buildClassReport, buildStudentProfile } from './reports.js'
import { questionBank } from './questionBank.js'
import { transcribePcm } from './speech.js'
import type { Assessment, Course, GenerateConfig, KnowledgePoint, Material, Question, Student, Submission } from '../shared/types.js'

loadEnv()
const app = express()
const port = Number(process.env.PORT || 4173)
const uploadDir = path.resolve('uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, callback) => callback(null, `${Date.now()}-${id('file')}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 20 * 1024 * 1024 }
})

app.use(cors())
app.use(express.json({ limit: '4mb' }))
app.use('/uploads', express.static(uploadDir))

app.get('/api/health', (_req, res) => {
  const networks = Object.values(os.networkInterfaces()).flat().filter(item => item?.family === 'IPv4' && !item.internal).map(item => item?.address)
  res.json({
    ok: true, mode: process.env.DEEPSEEK_API_KEY ? 'ai' : 'demo',
    providers: { deepseek: Boolean(process.env.DEEPSEEK_API_KEY), qwenVision: Boolean(process.env.DASHSCOPE_API_KEY), xfyun: Boolean(process.env.XFYUN_APP_ID) },
    addresses: networks.map(address => `http://${address}:${port}`)
  })
})

app.get('/api/overview', (_req, res) => {
  const db = store.read()
  const active = db.assessments.filter(item => item.status === 'published')
  const submissionsToday = db.submissions.filter(item => item.submittedAt.slice(0, 10) === now().slice(0, 10)).length
  res.json({
    courses: db.courses.length, activeClasses: active.length, students: db.students.length, submissionsToday,
    recentAssessments: db.assessments.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4).map(assessment => ({
      ...assessment,
      course: db.courses.find(course => course.id === assessment.courseId),
      submissions: db.submissions.filter(submission => submission.assessmentId === assessment.id).length
    })),
    courseProgress: db.courses.map(course => ({
      ...course,
      knowledgeCount: db.knowledgePoints.filter(point => point.courseId === course.id).length,
      materialCount: db.materials.filter(material => material.courseId === course.id).length,
      questionCount: db.questions.filter(question => question.courseId === course.id).length
    }))
  })
})

app.get('/api/courses', (_req, res) => {
  const db = store.read()
  res.json(db.courses.map(course => ({
    ...course,
    knowledgePoints: db.knowledgePoints.filter(point => point.courseId === course.id),
    materials: db.materials.filter(material => material.courseId === course.id),
    questionCount: db.questions.filter(question => question.courseId === course.id).length,
    assessmentCount: db.assessments.filter(assessment => assessment.courseId === course.id).length
  })))
})

app.post('/api/courses', (req, res) => {
  const course: Course = { id: id('course'), name: req.body.name, subject: req.body.subject || '未设置', grade: req.body.grade || '未设置', description: req.body.description || '', color: req.body.color || '#275d56', createdAt: now() }
  if (!course.name?.trim()) return res.status(400).json({ error: '课程名称不能为空' })
  store.update(db => db.courses.push(course))
  res.status(201).json(course)
})

app.patch('/api/courses/:id', (req, res) => {
  let updated: Course | undefined
  store.update(db => {
    const course = db.courses.find(item => item.id === req.params.id)
    if (course) { Object.assign(course, req.body, { id: course.id }); updated = course }
  })
  if (!updated) return res.status(404).json({ error: '课程不存在' })
  res.json(updated)
})

app.post('/api/courses/:courseId/knowledge-points', (req, res) => {
  const point: KnowledgePoint = { id: id('kp'), courseId: req.params.courseId, name: req.body.name, description: req.body.description || '', formula: req.body.formula || '', createdAt: now() }
  if (!point.name?.trim()) return res.status(400).json({ error: '知识点名称不能为空' })
  store.update(db => db.knowledgePoints.push(point))
  res.status(201).json(point)
})

app.delete('/api/knowledge-points/:id', (req, res) => {
  store.update(db => { db.knowledgePoints = db.knowledgePoints.filter(item => item.id !== req.params.id) })
  res.status(204).end()
})

app.post('/api/courses/:courseId/materials', upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择文件' })
  let originalName = req.file.originalname
  try { originalName = Buffer.from(originalName, 'latin1').toString('utf8') } catch { /* keep original */ }
  let text = ''
  let status: Material['status'] = 'ready'
  try { text = await extractMaterial(req.file.path, req.file.mimetype, originalName) } catch { status = 'failed' }
  const material: Material = {
    id: id('material'), courseId: req.params.courseId, name: originalName, type: req.file.mimetype, size: req.file.size,
    extractedText: text, path: `/uploads/${req.file.filename}`, status, createdAt: now()
  }
  store.update(db => db.materials.push(material))
  res.status(201).json(material)
}))

app.delete('/api/materials/:id', (req, res) => {
  const db = store.read()
  const material = db.materials.find(item => item.id === req.params.id)
  if (material?.path) {
    const filePath = path.join(uploadDir, path.basename(material.path))
    if (fs.existsSync(filePath) && path.dirname(filePath) === uploadDir) fs.unlinkSync(filePath)
  }
  store.update(data => { data.materials = data.materials.filter(item => item.id !== req.params.id) })
  res.status(204).end()
})

app.get('/api/questions', (req, res) => {
  const db = store.read()
  const courseId = String(req.query.courseId || '')
  res.json(db.questions.filter(question => !courseId || question.courseId === courseId))
})

app.post('/api/questions/generate', asyncRoute(async (req, res) => {
  const config = req.body as GenerateConfig
  if (!config.courseId || !config.knowledgePointIds?.length || !config.types?.length || config.count < 1 || config.count > 20) return res.status(400).json({ error: '请完整选择知识点、题型和题量（1–20）' })
  const db = store.read()
  let bankQuestions: Question[] = []
  if (config.source === 'bank' || config.source === 'mixed') bankQuestions = await questionBank.search(config)
  const remaining = Math.max(0, config.count - bankQuestions.length)
  const aiQuestions = remaining && config.source !== 'bank' ? await generateQuestions({ ...config, count: remaining }, db) : []
  const questions = [...bankQuestions, ...aiQuestions]
  if (!questions.length && config.source === 'bank') return res.status(409).json({ error: '题库接口已保留，但当前尚未配置题库数据源。请选择 AI 出题或混合模式。' })
  store.update(data => data.questions.push(...questions))
  res.status(201).json(questions)
}))

app.patch('/api/questions/:id', (req, res) => {
  let updated: Question | undefined
  store.update(db => {
    const question = db.questions.find(item => item.id === req.params.id)
    if (question) { Object.assign(question, req.body, { id: question.id }); updated = question }
  })
  if (!updated) return res.status(404).json({ error: '题目不存在' })
  res.json(updated)
})

app.post('/api/questions/confirm', (req, res) => {
  const ids = req.body.ids as string[]
  store.update(db => db.questions.forEach(question => { if (ids.includes(question.id)) question.status = 'confirmed' }))
  res.json({ ok: true })
})

app.get('/api/assessments', (req, res) => {
  const db = store.read()
  const courseId = String(req.query.courseId || '')
  res.json(db.assessments.filter(item => !courseId || item.courseId === courseId).map(assessment => ({
    ...assessment,
    course: db.courses.find(course => course.id === assessment.courseId),
    questions: assessment.questionIds.map(questionId => db.questions.find(question => question.id === questionId)).filter(Boolean),
    submissionCount: db.submissions.filter(submission => submission.assessmentId === assessment.id).length
  })))
})

app.post('/api/assessments', (req, res) => {
  const code = Math.random().toString(36).slice(2, 7).toUpperCase()
  const assessment: Assessment = {
    id: id('assessment'), courseId: req.body.courseId, title: req.body.title, description: req.body.description || '', joinCode: code,
    questionIds: req.body.questionIds || [], status: 'draft', timeLimit: Number(req.body.timeLimit) || 20, createdAt: now()
  }
  if (!assessment.courseId || !assessment.title || !assessment.questionIds.length) return res.status(400).json({ error: '课程、课堂名称和题目不能为空' })
  store.update(db => db.assessments.push(assessment))
  res.status(201).json(assessment)
})

app.post('/api/assessments/:id/publish', (req, res) => {
  let assessment: Assessment | undefined
  store.update(db => {
    assessment = db.assessments.find(item => item.id === req.params.id)
    if (assessment) { assessment.status = 'published'; assessment.publishedAt = now() }
  })
  if (!assessment) return res.status(404).json({ error: '课堂不存在' })
  res.json(assessment)
})

app.post('/api/assessments/:id/close', (req, res) => {
  let assessment: Assessment | undefined
  store.update(db => { assessment = db.assessments.find(item => item.id === req.params.id); if (assessment) assessment.status = 'closed' })
  if (!assessment) return res.status(404).json({ error: '课堂不存在' })
  res.json(assessment)
})

app.get('/api/classrooms/:code', (req, res) => {
  const db = store.read()
  const assessment = db.assessments.find(item => item.joinCode.toUpperCase() === req.params.code.toUpperCase() && item.status === 'published')
  if (!assessment) return res.status(404).json({ error: '未找到正在进行的课堂，请检查课堂码' })
  const course = db.courses.find(item => item.id === assessment.courseId)
  const questions = assessment.questionIds.map(questionId => db.questions.find(item => item.id === questionId)).filter(Boolean).map(question => {
    const { answer: _answer, explanation: _explanation, rubric: _rubric, ...safeQuestion } = question as Question
    return safeQuestion
  })
  res.json({ assessment, course, questions, submittedCount: db.submissions.filter(item => item.assessmentId === assessment.id).length })
})

app.post('/api/students/join', (req, res) => {
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ error: '请输入姓名' })
  const db = store.read()
  let student = db.students.find(item => item.name === name && item.className === (req.body.className || '临时课堂'))
  if (!student) {
    student = { id: id('student'), name, studentNo: req.body.studentNo || '', className: req.body.className || '临时课堂', createdAt: now() }
    const created = student
    store.update(data => data.students.push(created))
  }
  res.json(student)
})

app.post('/api/answers/image', upload.single('image'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择答题图片' })
  const result = await extractAnswerFromImage(req.file.path, req.file.mimetype)
  res.status(201).json({ imageUrl: `/uploads/${req.file.filename}`, ...result })
}))

app.post('/api/submissions', asyncRoute(async (req, res) => {
  const { assessmentId, studentId, answers } = req.body as { assessmentId: string; studentId: string; answers: { questionId: string; answer: string | string[]; imageUrl?: string; extractedText?: string }[] }
  const db = store.read()
  const assessment = db.assessments.find(item => item.id === assessmentId)
  if (!assessment || assessment.status !== 'published') return res.status(409).json({ error: '课堂未发布或已经结束' })
  const results = []
  for (const input of answers || []) {
    const question = db.questions.find(item => item.id === input.questionId)
    if (!question || !assessment.questionIds.includes(question.id)) continue
    const actualAnswer = input.extractedText || input.answer || ''
    const graded = programGrade(question, actualAnswer) || await gradeSubjective(question, actualAnswer)
    results.push({ ...graded, answer: input.answer, imageUrl: input.imageUrl, extractedText: input.extractedText })
  }
  const maxScore = assessment.questionIds.reduce((sum, questionId) => sum + (db.questions.find(question => question.id === questionId)?.maxScore || 0), 0)
  const submission: Submission = { id: id('submission'), assessmentId, studentId, answers: results, totalScore: results.reduce((sum, result) => sum + result.score, 0), maxScore, status: 'completed', submittedAt: now() }
  store.update(data => {
    data.submissions = data.submissions.filter(item => !(item.assessmentId === assessmentId && item.studentId === studentId))
    data.submissions.push(submission)
  })
  res.status(201).json({ ...submission, questions: assessment.questionIds.map(questionId => db.questions.find(item => item.id === questionId)).filter(Boolean) })
}))

app.get('/api/submissions/:assessmentId/:studentId', (req, res) => {
  const db = store.read()
  const submission = db.submissions.find(item => item.assessmentId === req.params.assessmentId && item.studentId === req.params.studentId)
  if (!submission) return res.status(404).json({ error: '未找到作答记录' })
  res.json({ ...submission, questions: db.assessments.find(item => item.id === req.params.assessmentId)?.questionIds.map(questionId => db.questions.find(item => item.id === questionId)).filter(Boolean) })
})

app.get('/api/reports/:assessmentId', (req, res) => {
  const report = buildClassReport(store.read(), req.params.assessmentId)
  if (!report) return res.status(404).json({ error: '课堂不存在' })
  res.json(report)
})

app.get('/api/students', (_req, res) => {
  const db = store.read()
  res.json(db.students.map(student => ({ ...student, submissionCount: db.submissions.filter(item => item.studentId === student.id).length })))
})

app.get('/api/students/:id/profile', (req, res) => {
  const profile = buildStudentProfile(store.read(), req.params.id)
  if (!profile) return res.status(404).json({ error: '学生不存在' })
  res.json(profile)
})

app.post('/api/practices', asyncRoute(async (req, res) => {
  const db = store.read()
  const point = db.knowledgePoints.find(item => item.id === req.body.knowledgePointId)
  if (!point) return res.status(404).json({ error: '知识点不存在' })
  const typeByMode = { similar: 'short', formula: 'blank', recall: 'short', error: 'short' } as const
  const questions = await generateQuestions({ courseId: point.courseId, knowledgePointIds: [point.id], count: 1, types: [typeByMode[req.body.mode as keyof typeof typeByMode] || 'short'], difficulty: '基础', source: 'ai' }, db)
  const practice = { id: id('practice'), studentId: req.body.studentId, knowledgePointId: point.id, mode: req.body.mode || 'similar', question: { ...questions[0], source: 'practice' as const }, completed: false, createdAt: now() }
  store.update(data => data.practices.push(practice))
  res.status(201).json(practice)
}))

app.post('/api/assistant/chat', asyncRoute(async (req, res) => {
  const db = store.read()
  const assessmentId = req.body.assessmentId || db.assessments.find(item => item.status === 'published')?.id
  const report = assessmentId ? buildClassReport(db, assessmentId) : null
  const answer = await teacherAssistant(String(req.body.message || ''), db, report)
  res.json({ answer, mode: process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'data-demo' })
}))

app.post('/api/assistant/transcribe', upload.single('audio'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有收到音频' })
  try {
    const text = await transcribePcm(fs.readFileSync(req.file.path))
    res.json({ text, provider: 'xfyun' })
  } finally {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
  }
}))

app.post('/api/demo/reset', (_req, res) => res.json(store.reset()))

const clientDir = path.resolve('dist')
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir))
  app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')))
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : '服务器发生未知错误'
  console.error(error)
  res.status(message.includes('File too large') ? 413 : 500).json({ error: message })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`知行教学诊断服务已启动：http://localhost:${port}`)
  for (const info of Object.values(os.networkInterfaces()).flat()) {
    if (info?.family === 'IPv4' && !info.internal) console.log(`局域网访问：http://${info.address}:${port}`)
  }
})

export { app }
