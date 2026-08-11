import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { store } from './store.js'
import { asyncRoute, id, loadEnv, now } from './utils.js'
import { extractMaterial } from './materials.js'
import { extractWithMinerU, mineruReady, mineruSupports } from './mineru.js'
import { generateQuestions, gradeSubjective, extractAnswerFromImage, teacherAssistant, describeInstructionalImage, bailianReady, generateClassDiagnosis, generatePracticeQuestion } from './ai.js'
import { programGrade } from './grading.js'
import { buildClassReport, buildStudentProfile } from './reports.js'
import { questionBank } from './questionBank.js'
import { transcribeAudio } from './speech.js'
import { buildRetrievedContext, knowledgeRoot, syncKnowledgeBase } from './knowledgeBase.js'
import { isLoopback, lanAddresses, openWindowsHotspotSettings } from './network.js'
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
  limits: { fileSize: 200 * 1024 * 1024 }
})

const aiConfigKeys = ['DASHSCOPE_API_KEY', 'MINERU_API_TOKEN', 'BAILIAN_BASE_URL', 'BAILIAN_TEXT_MODEL', 'BAILIAN_VISION_MODEL', 'BAILIAN_ASR_MODEL'] as const

function saveAiConfig(values: Record<string, string>) {
  const envPath = path.resolve('.env')
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/) : []
  const next = new Map<string, string>()
  for (const line of existing) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*)$/)
    if (match) next.set(match[1], match[2])
  }
  for (const key of aiConfigKeys) {
    const value = String(values[key] || '').replace(/[\r\n]/g, '').trim()
    if (value) {
      next.set(key, value)
      process.env[key] = value
    }
  }
  const known = new Set(aiConfigKeys)
  const preserved = existing.filter(line => !line.match(/^\s*([A-Z0-9_]+)=/) || !known.has(line.match(/^\s*([A-Z0-9_]+)=/)?.[1] as typeof aiConfigKeys[number]))
  const configured = aiConfigKeys.map(key => `${key}=${next.get(key) || ''}`)
  fs.writeFileSync(envPath, [...preserved.filter((line, index, array) => line || (index > 0 && array[index - 1])), ...configured, ''].join('\n'), 'utf8')
}

app.use(cors())
app.use(express.json({ limit: '4mb' }))
app.use('/uploads', express.static(uploadDir))

app.get('/api/health', (_req, res) => {
  const connected = bailianReady()
  const mineru = mineruReady()
  res.json({
    ok: true, mode: connected || mineru ? 'ai' : 'demo',
    providers: { bailian: connected, text: connected, vision: connected, speech: connected, mineru },
    models: { text: process.env.BAILIAN_TEXT_MODEL || 'deepseek-v4-flash', vision: process.env.BAILIAN_VISION_MODEL || 'qwen3-vl-flash', speech: process.env.BAILIAN_ASR_MODEL || 'qwen3-asr-flash', document: process.env.MINERU_MODEL_VERSION || 'vlm' },
    addresses: lanAddresses(port)
  })
})

app.get('/api/settings/ai', (req, res) => {
  if (!isLoopback(req.socket.remoteAddress)) return res.status(403).json({ error: 'AI 配置只允许在教师电脑本机修改' })
  res.json({
    bailianConfigured: Boolean(process.env.DASHSCOPE_API_KEY),
    mineruConfigured: Boolean(process.env.MINERU_API_TOKEN),
    baseUrl: process.env.BAILIAN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    textModel: process.env.BAILIAN_TEXT_MODEL || 'deepseek-v4-flash',
    visionModel: process.env.BAILIAN_VISION_MODEL || 'qwen3-vl-flash',
    asrModel: process.env.BAILIAN_ASR_MODEL || 'qwen3-asr-flash'
  })
})

app.patch('/api/settings/ai', (req, res) => {
  if (!isLoopback(req.socket.remoteAddress)) return res.status(403).json({ error: 'AI 配置只允许在教师电脑本机修改' })
  saveAiConfig(req.body || {})
  res.json({ ok: true, bailianConfigured: Boolean(process.env.DASHSCOPE_API_KEY), mineruConfigured: Boolean(process.env.MINERU_API_TOKEN) })
})

app.get('/api/network', (_req, res) => {
  const settings = store.read().settings?.network || { hotspotSsid: '', hotspotPassword: '' }
  const addresses = lanAddresses(port)
  res.json({ ...settings, addresses, preferredAddress: settings.preferredAddress || addresses[0] || `http://localhost:${port}`, studentPath: '/join' })
})

app.patch('/api/network', (req, res) => {
  const network = { hotspotSsid: String(req.body.hotspotSsid || '').trim(), hotspotPassword: String(req.body.hotspotPassword || ''), preferredAddress: String(req.body.preferredAddress || '') }
  store.update(db => { db.settings = { ...db.settings, network } })
  res.json(network)
})

app.post('/api/network/open-hotspot-settings', (req, res) => {
  if (!isLoopback(req.socket.remoteAddress)) return res.status(403).json({ error: '只能在教师电脑本机打开系统设置' })
  openWindowsHotspotSettings()
  res.json({ ok: true })
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
  const materialId = id('material')
  const publicBase = `/uploads/materials/${materialId}`
  const material: Material = {
    id: materialId, courseId: req.params.courseId, name: originalName, type: req.file.mimetype, size: req.file.size,
    extractedText: '', path: `/uploads/${req.file.filename}`, imageUrls: [], extractionNotes: [],
    status: 'processing', createdAt: now()
  }

  if (mineruReady() && mineruSupports(originalName, req.file.mimetype)) {
    material.parser = 'mineru'
    material.extractionNotes = ['等待 MinerU 精准解析']
    store.update(db => db.materials.push(material))
    res.status(202).json(material)

    const uploadedFilePath = req.file.path
    void extractWithMinerU({
      filePath: uploadedFilePath,
      originalName,
      outputDir: path.join(uploadDir, 'materials', materialId),
      publicBase,
      structuredDir: path.resolve('data', 'mineru', materialId),
      dataId: materialId,
      onStatus: (message, batchId) => store.update(db => {
        const current = db.materials.find(item => item.id === materialId)
        if (!current) return
        current.extractionNotes = [message]
        if (batchId) current.parserTaskId = batchId
      })
    }).then(async extracted => {
      const enrichmentMode = (process.env.MATERIAL_IMAGE_ENRICHMENT || 'smart').toLowerCase()
      const candidates = enrichmentMode === 'full' ? extracted.assets : enrichmentMode === 'off' ? [] : extracted.visionCandidates
      if (candidates.length && bailianReady()) {
        const descriptions: string[] = []
        let failedDescriptions = 0
        for (const [index, asset] of candidates.entries()) {
          try {
            const description = await describeInstructionalImage(asset.filePath, asset.mimeType)
            if (description) descriptions.push(`## 补充插图 ${index + 1}\n\n![原图](${asset.publicUrl})\n\n${description}`)
          } catch { failedDescriptions += 1 }
        }
        if (descriptions.length) {
          extracted.text = `${extracted.text}\n\n# MinerU 未语义化插图补充\n\n${descriptions.join('\n\n')}`
          extracted.notes.push(`百炼视觉补充识别 ${descriptions.length} 张 MinerU 未语义化插图/图表`)
          fs.writeFileSync(path.resolve('data', 'mineru', materialId, 'normalized.md'), extracted.text, 'utf8')
        }
        if (failedDescriptions) extracted.notes.push(`${failedDescriptions} 张插图的百炼补充识别失败，MinerU 主解析结果仍已保留`)
      } else if (candidates.length) {
        extracted.notes.push(`发现 ${candidates.length} 张未语义化插图；配置百炼 Key 后可自动补充图意`)
      }
      let courseId = ''
      store.update(db => {
        const current = db.materials.find(item => item.id === materialId)
        if (!current) return
        current.extractedText = extracted.text
        current.imageUrls = extracted.assets.map(item => item.publicUrl)
        current.extractionNotes = extracted.notes
        current.pageCount = extracted.pageCount
        current.parser = extracted.parser
        current.parserTaskId = extracted.batchId
        current.status = 'ready'
        courseId = current.courseId
      })
      if (courseId) syncKnowledgeBase(store.read(), courseId)
    }).catch(error => {
      store.update(db => {
        const current = db.materials.find(item => item.id === materialId)
        if (!current) return
        current.status = 'failed'
        current.extractionNotes = [error instanceof Error ? error.message : 'MinerU 资料解析失败']
      })
    })
    return
  }

  let text = ''
  let imageUrls: string[] = []
  let extractionNotes: string[] = []
  let pageCount: number | undefined
  let status: Material['status'] = 'ready'
  try {
    const extracted = await extractMaterial(req.file.path, req.file.mimetype, originalName, path.join(uploadDir, 'materials', materialId), publicBase)
    text = extracted.text; imageUrls = extracted.assets.map(item => item.publicUrl); extractionNotes = extracted.notes; pageCount = extracted.pageCount
    const extension = path.extname(originalName).toLowerCase()
    const visionMode = (process.env.MATERIAL_VISION_MODE || 'smart').toLowerCase()
    const isStandaloneImage = req.file.mimetype.startsWith('image/')
    const isScannedPdf = extension === '.pdf' && text.trim().length < 500
    const isSparseOffice = ['.pptx', '.docx'].includes(extension) && text.trim().length < 250
    const shouldReadImages = Boolean(extracted.assets.length) && visionMode !== 'off' && (visionMode === 'full' || isStandaloneImage || isScannedPdf || isSparseOffice)
    if (shouldReadImages && bailianReady()) {
      const descriptions: string[] = []
      for (const [index, asset] of extracted.assets.entries()) {
        const description = await describeInstructionalImage(asset.filePath, asset.mimeType)
        if (description) descriptions.push(`## 视觉提取 ${index + 1}\n\n${description}`)
      }
      if (descriptions.length) text = `${text}\n\n# 图片与扫描页识别\n\n${descriptions.join('\n\n')}`
    } else if (shouldReadImages) extractionNotes.push('尚未配置百炼 API，图片已提取保存，配置后重新上传即可识别。')
    else if (extracted.assets.length && visionMode === 'smart') extractionNotes.push(`智能节省模式：已提取 ${extracted.assets.length} 张页面/插图，但正文信息充足，未自动调用视觉模型。`)
  } catch (error) { status = 'failed'; extractionNotes = [error instanceof Error ? error.message : '资料解析失败'] }
  material.extractedText = text
  material.imageUrls = imageUrls
  material.extractionNotes = mineruSupports(originalName, req.file.mimetype) && !mineruReady()
    ? ['未配置 MinerU，已使用本地兼容解析器。', ...extractionNotes]
    : extractionNotes
  material.pageCount = pageCount
  material.parser = 'builtin'
  material.status = status
  store.update(db => db.materials.push(material))
  syncKnowledgeBase(store.read(), material.courseId)
  res.status(201).json(material)
}))

app.delete('/api/materials/:id', (req, res) => {
  const db = store.read()
  const material = db.materials.find(item => item.id === req.params.id)
  if (material?.path) {
    const filePath = path.join(uploadDir, path.basename(material.path))
    if (fs.existsSync(filePath) && path.dirname(filePath) === uploadDir) fs.unlinkSync(filePath)
  }
  const assetDir = path.resolve(uploadDir, 'materials', req.params.id)
  const materialRoot = path.resolve(uploadDir, 'materials')
  if (assetDir.startsWith(`${materialRoot}${path.sep}`) && fs.existsSync(assetDir)) fs.rmSync(assetDir, { recursive: true, force: true })
  const structuredDir = path.resolve('data', 'mineru', req.params.id)
  const structuredRoot = path.resolve('data', 'mineru')
  if (structuredDir.startsWith(`${structuredRoot}${path.sep}`) && fs.existsSync(structuredDir)) fs.rmSync(structuredDir, { recursive: true, force: true })
  store.update(data => { data.materials = data.materials.filter(item => item.id !== req.params.id) })
  if (material) syncKnowledgeBase(store.read(), material.courseId)
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
    if (assessment) {
      db.assessments.forEach(item => { if (item.status === 'published' && item.id !== req.params.id) item.status = 'closed' })
      assessment.status = 'published'; assessment.publishedAt = now()
    }
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

const classroomView = (assessment: Assessment) => {
  const db = store.read()
  const course = db.courses.find(item => item.id === assessment.courseId)
  const questions = assessment.questionIds.map(questionId => db.questions.find(item => item.id === questionId)).filter(Boolean).map(question => {
    const { answer: _answer, explanation: _explanation, rubric: _rubric, ...safeQuestion } = question as Question
    return safeQuestion
  })
  return { assessment, course, questions, submittedCount: db.submissions.filter(item => item.assessmentId === assessment.id).length }
}

app.get('/api/classrooms/available', (_req, res) => {
  const assessments = store.read().assessments.filter(item => item.status === 'published')
  res.json(assessments.map(classroomView))
})

app.get('/api/classrooms/assessment/:id', (req, res) => {
  const assessment = store.read().assessments.find(item => item.id === req.params.id && item.status === 'published')
  if (!assessment) return res.status(404).json({ error: '未找到当前课堂' })
  res.json(classroomView(assessment))
})

app.get('/api/classrooms/:code', (req, res) => {
  const db = store.read()
  const assessment = db.assessments.find(item => item.joinCode.toUpperCase() === req.params.code.toUpperCase() && item.status === 'published')
  if (!assessment) return res.status(404).json({ error: '未找到正在进行的课堂，请返回入口重新选择' })
  const course = db.courses.find(item => item.id === assessment.courseId)
  const questions = assessment.questionIds.map(questionId => db.questions.find(item => item.id === questionId)).filter(Boolean).map(question => {
    const { answer: _answer, explanation: _explanation, rubric: _rubric, ...safeQuestion } = question as Question
    return safeQuestion
  })
  res.json({ assessment, course, questions, submittedCount: db.submissions.filter(item => item.assessmentId === assessment.id).length })
})

app.get('/api/classrooms/active/current', (_req, res) => {
  const db = store.read()
  const assessment = db.assessments.find(item => item.status === 'published')
  if (!assessment) return res.status(404).json({ error: '教师尚未发布检测' })
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
  syncKnowledgeBase(store.read(), assessment.courseId)
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

app.post('/api/reports/:assessmentId/diagnosis/refresh', asyncRoute(async (req, res) => {
  const report = buildClassReport(store.read(), req.params.assessmentId)
  if (!report) return res.status(404).json({ error: '课堂不存在' })
  const diagnosis = await generateClassDiagnosis(report)
  store.update(db => {
    db.settings = { ...db.settings, reportDiagnoses: { ...(db.settings?.reportDiagnoses || {}), [req.params.assessmentId]: diagnosis } }
  })
  res.json(buildClassReport(store.read(), req.params.assessmentId))
}))

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
  const sourceQuestion = req.body.questionId
    ? db.questions.find(item => item.id === req.body.questionId)
    : undefined
  const latestAnswers = db.submissions
    .filter(item => item.studentId === req.body.studentId && item.status === 'completed')
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .flatMap(item => item.answers)
  const lastAnswer = sourceQuestion
    ? latestAnswers.find(answer => answer.questionId === sourceQuestion.id)
    : latestAnswers.find(answer => db.questions.find(question => question.id === answer.questionId)?.knowledgePointId === point.id)
  const mode = (['similar', 'formula', 'recall', 'error'].includes(req.body.mode) ? req.body.mode : 'similar') as 'similar' | 'formula' | 'recall' | 'error'
  const question = await generatePracticeQuestion({ mode, point, sourceQuestion, lastAnswer }, db)
  const practice = { id: id('practice'), studentId: req.body.studentId, knowledgePointId: point.id, mode, question, completed: false, createdAt: now() }
  store.update(data => data.practices.push(practice))
  res.status(201).json(practice)
}))

app.post('/api/assistant/chat', asyncRoute(async (req, res) => {
  const db = store.read()
  const assessmentId = req.body.assessmentId || db.assessments.find(item => item.status === 'published')?.id
  const report = assessmentId ? buildClassReport(db, assessmentId) : null
  const assessment = assessmentId ? db.assessments.find(item => item.id === assessmentId) : undefined
  const message = String(req.body.message || '')
  const retrievedContext = buildRetrievedContext(db, message, assessment?.courseId, assessmentId)
  const promptPath = path.resolve('prompts', 'teacher-assistant.md')
  const globalPrompt = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : ''
  const answer = await teacherAssistant(message, db, report, retrievedContext, globalPrompt)
  res.json({ answer, mode: bailianReady() ? 'bailian' : 'data-demo' })
}))

app.post('/api/assistant/transcribe', upload.single('audio'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有收到音频' })
  try {
    const text = await transcribeAudio(fs.readFileSync(req.file.path), req.file.mimetype)
    res.json({ text, provider: 'bailian' })
  } finally {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
  }
}))

app.post('/api/demo/reset', (_req, res) => { const db = store.reset(); syncKnowledgeBase(db); res.json(db) })

app.get('/api/knowledge/:courseId/manifest', (req, res) => {
  const db = store.read(); syncKnowledgeBase(db, req.params.courseId)
  const manifest = path.join(knowledgeRoot(), req.params.courseId.replace(/[^a-zA-Z0-9_-]/g, '-'), 'manifest.json')
  if (!fs.existsSync(manifest)) return res.status(404).json({ error: '课程知识目录不存在' })
  res.type('json').send(fs.readFileSync(manifest, 'utf8'))
})

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

syncKnowledgeBase(store.read())
app.listen(port, '0.0.0.0', () => {
  console.log(`知行教学诊断服务已启动：http://localhost:${port}`)
  for (const address of lanAddresses(port)) console.log(`局域网访问：${address}`)
})

export { app }
