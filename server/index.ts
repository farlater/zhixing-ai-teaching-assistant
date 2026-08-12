import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { store } from './store.js'
import { asyncRoute, id, loadEnv, now } from './utils.js'
import { extractMaterial } from './materials.js'
import { extractWithMinerU, mineruReady, mineruSupports } from './mineru.js'
import { generateQuestions, generateQuestionVariants, gradeSubjective, extractAnswerFromImage, teacherAssistant, teacherAssistantStream, describeInstructionalImage, bailianReady, generateClassDiagnosis, generatePracticeQuestion, analyzeQuestionBankMaterial } from './ai.js'
import { heuristicSubjectiveGrade, programGrade } from './grading.js'
import { buildClassReport, buildStudentProfile, buildStudentRanking } from './reports.js'
import { questionBank } from './questionBank.js'
import { transcribeAudio } from './speech.js'
import { buildRetrievedContext, knowledgeRoot, syncKnowledgeBase } from './knowledgeBase.js'
import { isLoopback, lanAddresses, openWindowsHotspotSettings } from './network.js'
import type { AnswerResult, Assessment, Course, GenerateConfig, KnowledgePoint, Material, Question, QuestionImportJob, Student, Submission } from '../shared/types.js'

loadEnv()
const app = express()
const port = Number(process.env.PORT || 4173)
const uploadDir = path.resolve('uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, callback) => callback(null, `${Date.now()}-${id('file')}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
})

function removeMaterialFiles(material: Material) {
  if (material.path?.startsWith('/uploads/')) {
    const relative = material.path.slice('/uploads/'.length).replace(/\//g, path.sep)
    const filePath = path.resolve(uploadDir, relative)
    if (filePath.startsWith(`${uploadDir}${path.sep}`) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) fs.unlinkSync(filePath)
  }
  for (const [root, child] of [
    [path.resolve(uploadDir, 'materials'), material.id],
    [path.resolve('data', 'mineru'), material.id],
  ] as const) {
    const target = path.resolve(root, child)
    if (target.startsWith(`${root}${path.sep}`) && fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
  }
}

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
    const value = String(values[key] || '')
      .replace(/[\r\n]/g, '')
      .trim()
    if (value) {
      next.set(key, value)
      process.env[key] = value
    }
  }
  const known = new Set(aiConfigKeys)
  const preserved = existing.filter((line) => !line.match(/^\s*([A-Z0-9_]+)=/) || !known.has(line.match(/^\s*([A-Z0-9_]+)=/)?.[1] as (typeof aiConfigKeys)[number]))
  const configured = aiConfigKeys.map((key) => `${key}=${next.get(key) || ''}`)
  fs.writeFileSync(envPath, [...preserved.filter((line, index, array) => line || (index > 0 && array[index - 1])), ...configured, ''].join('\n'), 'utf8')
}

app.use(cors())
app.use(express.json({ limit: '4mb' }))
app.use('/uploads', express.static(uploadDir))

app.get('/api/health', (_req, res) => {
  const connected = bailianReady()
  const mineru = mineruReady()
  res.json({
    ok: true,
    mode: connected || mineru ? 'ai' : 'demo',
    providers: {
      bailian: connected,
      text: connected,
      vision: connected,
      speech: connected,
      mineru,
    },
    models: {
      text: process.env.BAILIAN_TEXT_MODEL || 'deepseek-v4-flash',
      vision: process.env.BAILIAN_VISION_MODEL || 'qwen3-vl-flash',
      speech: process.env.BAILIAN_ASR_MODEL || 'qwen3-asr-flash',
      document: process.env.MINERU_MODEL_VERSION || 'vlm',
    },
    addresses: lanAddresses(port),
  })
})

let connectivityCache = { online: false, checkedAt: '', expiresAt: 0 }
app.get('/api/connectivity', asyncRoute(async (_req, res) => {
  if (Date.now() < connectivityCache.expiresAt) return res.json(connectivityCache)
  const targets = [
    new URL(process.env.BAILIAN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').origin,
    new URL(process.env.MINERU_API_BASE || 'https://mineru.net/api/v4').origin,
  ]
  const attempts = targets.map(async target => {
    const response = await fetch(target, { method: 'HEAD', signal: AbortSignal.timeout(3500) })
    return response.status > 0
  })
  const online = await Promise.any(attempts).catch(() => false)
  connectivityCache = { online, checkedAt: now(), expiresAt: Date.now() + 15000 }
  res.json(connectivityCache)
}))

app.get('/api/settings/ai', (req, res) => {
  if (!isLoopback(req.socket.remoteAddress)) return res.status(403).json({ error: 'AI 配置只允许在教师电脑本机修改' })
  res.json({
    bailianConfigured: Boolean(process.env.DASHSCOPE_API_KEY),
    mineruConfigured: Boolean(process.env.MINERU_API_TOKEN),
    baseUrl: process.env.BAILIAN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    textModel: process.env.BAILIAN_TEXT_MODEL || 'deepseek-v4-flash',
    visionModel: process.env.BAILIAN_VISION_MODEL || 'qwen3-vl-flash',
    asrModel: process.env.BAILIAN_ASR_MODEL || 'qwen3-asr-flash',
  })
})

app.patch('/api/settings/ai', (req, res) => {
  if (!isLoopback(req.socket.remoteAddress)) return res.status(403).json({ error: 'AI 配置只允许在教师电脑本机修改' })
  saveAiConfig(req.body || {})
  res.json({
    ok: true,
    bailianConfigured: Boolean(process.env.DASHSCOPE_API_KEY),
    mineruConfigured: Boolean(process.env.MINERU_API_TOKEN),
  })
})

app.get('/api/network', (_req, res) => {
  const settings = store.read().settings?.network || {
    hotspotSsid: '',
    hotspotPassword: '',
  }
  const addresses = lanAddresses(port)
  const preferredAddress = addresses[0] || `http://localhost:${port}`
  res.json({ ...settings, addresses, preferredAddress, studentPath: '/join' })
})

app.patch('/api/network', (req, res) => {
  const network = {
    hotspotSsid: String(req.body.hotspotSsid || '').trim(),
    hotspotPassword: String(req.body.hotspotPassword || ''),
    preferredAddress: String(req.body.preferredAddress || ''),
  }
  store.update((db) => {
    db.settings = { ...db.settings, network }
  })
  res.json(network)
})

app.post('/api/network/open-hotspot-settings', (req, res) => {
  if (!isLoopback(req.socket.remoteAddress)) return res.status(403).json({ error: '只能在教师电脑本机打开系统设置' })
  openWindowsHotspotSettings()
  res.json({ ok: true })
})

app.get('/api/overview', (_req, res) => {
  const db = store.read()
  const active = db.assessments.filter((item) => item.status === 'published')
  const submissionsToday = db.submissions.filter((item) => item.submittedAt.slice(0, 10) === now().slice(0, 10)).length
  res.json({
    courses: db.courses.length,
    activeClasses: active.length,
    students: db.students.length,
    submissionsToday,
    recentAssessments: db.assessments
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 4)
      .map((assessment) => ({
        ...assessment,
        course: db.courses.find((course) => course.id === assessment.courseId),
        submissions: db.submissions.filter((submission) => submission.assessmentId === assessment.id).length,
      })),
    courseProgress: db.courses.map((course) => ({
      ...course,
      knowledgeCount: db.knowledgePoints.filter((point) => point.courseId === course.id).length,
      materialCount: db.materials.filter((material) => material.courseId === course.id).length,
      questionCount: db.questions.filter((question) => question.courseId === course.id && !question.id.startsWith('demo-history-')).length,
    })),
  })
})

app.get('/api/courses', (_req, res) => {
  const db = store.read()
  res.json(
    db.courses.map((course) => ({
      ...course,
      knowledgePoints: db.knowledgePoints.filter((point) => point.courseId === course.id),
      materials: db.materials.filter((material) => material.courseId === course.id),
      questions: db.questions.filter((question) => question.courseId === course.id && question.status === 'confirmed'),
      questionImports: (db.questionImports || [])
        .filter((job) => job.courseId === course.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((job) => ({
          ...job,
          questions: job.questionIds.map((questionId) => db.questions.find((question) => question.id === questionId)).filter(Boolean),
        })),
      questionCount: db.questions.filter((question) => question.courseId === course.id && !question.id.startsWith('demo-history-')).length,
      assessmentCount: db.assessments.filter((assessment) => assessment.courseId === course.id).length,
    })),
  )
})

app.post('/api/courses', (req, res) => {
  const course: Course = {
    id: id('course'),
    name: req.body.name,
    subject: req.body.subject || '未设置',
    grade: req.body.grade || '未设置',
    description: req.body.description || '',
    color: req.body.color || '#275d56',
    createdAt: now(),
  }
  if (!course.name?.trim()) return res.status(400).json({ error: '课程名称不能为空' })
  store.update((db) => db.courses.push(course))
  res.status(201).json(course)
})

app.patch('/api/courses/:id', (req, res) => {
  let updated: Course | undefined
  store.update((db) => {
    const course = db.courses.find((item) => item.id === req.params.id)
    if (course) {
      Object.assign(course, req.body, { id: course.id })
      updated = course
    }
  })
  if (!updated) return res.status(404).json({ error: '课程不存在' })
  res.json(updated)
})

app.delete('/api/courses/:id', (req, res) => {
  const db = store.read()
  const course = db.courses.find((item) => item.id === req.params.id)
  if (!course) return res.status(404).json({ error: '课程不存在' })
  const deleteLocalFiles = String(req.query.deleteLocalFiles || 'false') === 'true'
  const materials = db.materials.filter((item) => item.courseId === course.id)
  const assessmentIds = new Set(db.assessments.filter((item) => item.courseId === course.id).map((item) => item.id))
  const pointIds = new Set(db.knowledgePoints.filter((item) => item.courseId === course.id).map((item) => item.id))
  if (deleteLocalFiles) {
    materials.forEach(removeMaterialFiles)
    const knowledgeDir = path.resolve(knowledgeRoot(), course.id.replace(/[^a-zA-Z0-9_-]/g, '-'))
    const knowledgeBase = path.resolve(knowledgeRoot())
    if (knowledgeDir.startsWith(`${knowledgeBase}${path.sep}`) && fs.existsSync(knowledgeDir)) fs.rmSync(knowledgeDir, { recursive: true, force: true })
  }
  store.update((data) => {
    data.courses = data.courses.filter((item) => item.id !== course.id)
    data.knowledgePoints = data.knowledgePoints.filter((item) => item.courseId !== course.id)
    data.materials = data.materials.filter((item) => item.courseId !== course.id)
    data.questions = data.questions.filter((item) => item.courseId !== course.id)
    data.assessments = data.assessments.filter((item) => item.courseId !== course.id)
    data.submissions = data.submissions.filter((item) => !assessmentIds.has(item.assessmentId))
    data.practices = data.practices.filter((item) => !pointIds.has(item.knowledgePointId))
    data.videoProgress = (data.videoProgress || []).filter((item) => !assessmentIds.has(item.assessmentId))
    if (data.settings?.reportDiagnoses) for (const assessmentId of assessmentIds) delete data.settings.reportDiagnoses[assessmentId]
    data.questionImports = (data.questionImports || []).filter((item) => item.courseId !== course.id)
  })
  res.json({ ok: true, deletedLocalFiles: deleteLocalFiles })
})

app.post('/api/courses/:courseId/knowledge-points', (req, res) => {
  const point: KnowledgePoint = {
    id: id('kp'),
    courseId: req.params.courseId,
    name: req.body.name,
    description: req.body.description || '',
    formula: req.body.formula || '',
    createdAt: now(),
  }
  if (!point.name?.trim()) return res.status(400).json({ error: '知识点名称不能为空' })
  store.update((db) => db.knowledgePoints.push(point))
  res.status(201).json(point)
})

app.delete('/api/knowledge-points/:id', (req, res) => {
  store.update((db) => {
    db.knowledgePoints = db.knowledgePoints.filter((item) => item.id !== req.params.id)
  })
  res.status(204).end()
})

app.post('/api/courses/:courseId/tutorial-videos', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择视频文件' })
  const knowledgePointId = String(req.body.knowledgePointId || '')
  const db = store.read()
  if (!db.knowledgePoints.some((point) => point.id === knowledgePointId && point.courseId === req.params.courseId)) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    return res.status(400).json({ error: '请选择视频对应的知识点' })
  }
  if (!req.file.mimetype.startsWith('video/')) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    return res.status(400).json({ error: '仅支持上传常见视频文件' })
  }
  let originalName = req.file.originalname
  try {
    originalName = Buffer.from(originalName, 'latin1').toString('utf8')
  } catch {
    /* 保留原名 */
  }
  const materialId = id('video')
  const relativeDir = path.join('tutorials', req.params.courseId, knowledgePointId)
  const targetDir = path.resolve(uploadDir, relativeDir)
  if (!targetDir.startsWith(`${uploadDir}${path.sep}`)) return res.status(400).json({ error: '视频目录无效' })
  fs.mkdirSync(targetDir, { recursive: true })
  const filename = `${materialId}${path.extname(originalName).toLowerCase() || '.mp4'}`
  const target = path.join(targetDir, filename)
  fs.renameSync(req.file.path, target)
  const material: Material = {
    id: materialId,
    courseId: req.params.courseId,
    knowledgePointId,
    kind: 'tutorial-video',
    name: originalName,
    type: req.file.mimetype,
    size: req.file.size,
    extractedText: '讲解视频仅建立知识点目录索引，AI 不读取视频内容。',
    path: `/uploads/${relativeDir.replace(/\\/g, '/')}/${filename}`,
    parser: 'builtin',
    status: 'ready',
    createdAt: now(),
  }
  store.update((data) => data.materials.push(material))
  syncKnowledgeBase(store.read(), req.params.courseId)
  res.status(201).json(material)
})

app.post('/api/tutorial-videos/:id/complete', (req, res) => {
  const db = store.read()
  const material = db.materials.find((item) => item.id === req.params.id && item.kind === 'tutorial-video')
  if (!material) return res.status(404).json({ error: '讲解视频不存在' })
  const progress = {
    id: id('video-progress'),
    materialId: material.id,
    studentId: String(req.body.studentId || ''),
    assessmentId: String(req.body.assessmentId || ''),
    questionId: String(req.body.questionId || ''),
    completed: true,
    watchedSeconds: Math.max(0, Number(req.body.watchedSeconds) || 0),
    completedAt: now(),
    createdAt: now(),
  }
  if (!progress.studentId || !progress.assessmentId || !progress.questionId) return res.status(400).json({ error: '学习记录信息不完整' })
  store.update((data) => {
    data.videoProgress ||= []
    data.videoProgress = data.videoProgress.filter((item) => !(item.studentId === progress.studentId && item.assessmentId === progress.assessmentId && item.questionId === progress.questionId))
    data.videoProgress.push(progress)
  })
  res.json(progress)
})

app.post(
  '/api/courses/:courseId/materials',
  upload.single('file'),
  asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请选择文件' })
    let originalName = req.file.originalname
    try {
      originalName = Buffer.from(originalName, 'latin1').toString('utf8')
    } catch {
      /* keep original */
    }
    const materialId = id('material')
    const publicBase = `/uploads/materials/${materialId}`
    const material: Material = {
      id: materialId,
      courseId: req.params.courseId,
      name: originalName,
      type: req.file.mimetype,
      size: req.file.size,
      extractedText: '',
      path: `/uploads/${req.file.filename}`,
      imageUrls: [],
      extractionNotes: [],
      status: 'processing',
      createdAt: now(),
    }

    if (mineruReady() && mineruSupports(originalName, req.file.mimetype)) {
      material.parser = 'mineru'
      material.extractionNotes = ['等待 MinerU 精准解析']
      store.update((db) => db.materials.push(material))
      res.status(202).json(material)

      const uploadedFilePath = req.file.path
      void extractWithMinerU({
        filePath: uploadedFilePath,
        originalName,
        outputDir: path.join(uploadDir, 'materials', materialId),
        publicBase,
        structuredDir: path.resolve('data', 'mineru', materialId),
        dataId: materialId,
        onStatus: (message, batchId) =>
          store.update((db) => {
            const current = db.materials.find((item) => item.id === materialId)
            if (!current) return
            current.extractionNotes = [message]
            if (batchId) current.parserTaskId = batchId
          }),
      })
        .then(async (extracted) => {
          const enrichmentMode = (process.env.MATERIAL_IMAGE_ENRICHMENT || 'smart').toLowerCase()
          const candidates = enrichmentMode === 'full' ? extracted.assets : enrichmentMode === 'off' ? [] : extracted.visionCandidates
          if (candidates.length && bailianReady()) {
            const descriptions: string[] = []
            let failedDescriptions = 0
            for (const [index, asset] of candidates.entries()) {
              try {
                const description = await describeInstructionalImage(asset.filePath, asset.mimeType)
                if (description) descriptions.push(`## 补充插图 ${index + 1}\n\n![原图](${asset.publicUrl})\n\n${description}`)
              } catch {
                failedDescriptions += 1
              }
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
          store.update((db) => {
            const current = db.materials.find((item) => item.id === materialId)
            if (!current) return
            current.extractedText = extracted.text
            current.imageUrls = extracted.assets.map((item) => item.publicUrl)
            current.extractionNotes = extracted.notes
            current.pageCount = extracted.pageCount
            current.parser = extracted.parser
            current.parserTaskId = extracted.batchId
            current.status = 'ready'
            courseId = current.courseId
          })
          if (courseId) syncKnowledgeBase(store.read(), courseId)
        })
        .catch((error) => {
          store.update((db) => {
            const current = db.materials.find((item) => item.id === materialId)
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
      text = extracted.text
      imageUrls = extracted.assets.map((item) => item.publicUrl)
      extractionNotes = extracted.notes
      pageCount = extracted.pageCount
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
    } catch (error) {
      status = 'failed'
      extractionNotes = [error instanceof Error ? error.message : '资料解析失败']
    }
    material.extractedText = text
    material.imageUrls = imageUrls
    material.extractionNotes = mineruSupports(originalName, req.file.mimetype) && !mineruReady() ? ['未配置 MinerU，已使用本地兼容解析器。', ...extractionNotes] : extractionNotes
    material.pageCount = pageCount
    material.parser = 'builtin'
    material.status = status
    store.update((db) => db.materials.push(material))
    syncKnowledgeBase(store.read(), material.courseId)
    res.status(201).json(material)
  }),
)

app.delete('/api/materials/:id', (req, res) => {
  const db = store.read()
  const material = db.materials.find((item) => item.id === req.params.id)
  if (material) removeMaterialFiles(material)
  store.update((data) => {
    data.materials = data.materials.filter((item) => item.id !== req.params.id)
  })
  if (material) syncKnowledgeBase(store.read(), material.courseId)
  res.status(204).end()
})

app.get('/api/questions', (req, res) => {
  const db = store.read()
  const courseId = String(req.query.courseId || '')
  res.json(db.questions.filter((question) => !question.id.startsWith('demo-history-') && (!courseId || question.courseId === courseId)))
})

app.post('/api/courses/:courseId/questions', upload.single('image'), (req, res) => {
  const db = store.read()
  const course = db.courses.find((item) => item.id === req.params.courseId)
  if (!course) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    return res.status(404).json({ error: '课程不存在' })
  }
  const knowledgePointId = String(req.body.knowledgePointId || '')
  const type = String(req.body.type || 'single') as Question['type']
  const stemText = String(req.body.stem || '').trim()
  if (!db.knowledgePoints.some((point) => point.id === knowledgePointId && point.courseId === course.id) || !stemText) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    return res.status(400).json({ error: '请完整填写知识点和题干' })
  }
  const options = String(req.body.options || '')
    .split(/\r?\n/)
    .map((item: string) => item.trim())
    .filter(Boolean)
  const rawAnswer = String(req.body.answer || '').trim()
  const answer =
    type === 'multiple'
      ? rawAnswer
          .split(/[,，、\s]+/)
          .filter(Boolean)
          .map((item) => item.toUpperCase())
      : rawAnswer
  const imageMarkdown = req.file ? `![题库配图](/uploads/${path.basename(req.file.path).replace(/\\/g, '/')})\n\n` : ''
  const question: Question = {
    id: id('q-bank'),
    courseId: course.id,
    knowledgePointId,
    type,
    difficulty: ['基础', '进阶', '挑战'].includes(req.body.difficulty) ? req.body.difficulty : '进阶',
    stem: `${imageMarkdown}${stemText}`,
    options: ['single', 'multiple', 'truefalse'].includes(type) ? options : undefined,
    answer,
    explanation: String(req.body.explanation || ''),
    rubric: String(req.body.rubric || '') || undefined,
    formula: String(req.body.formula || '') || undefined,
    maxScore: Math.max(1, Number(req.body.maxScore) || 10),
    abilities: ['概念理解', '公式应用'],
    source: 'bank',
    status: 'confirmed',
    createdAt: now(),
  }
  if (!rawAnswer || ((type === 'single' || type === 'multiple') && options.length < 2)) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    return res.status(400).json({ error: '请填写参考答案；选择题至少需要两个选项' })
  }
  store.update((data) => data.questions.push(question))
  syncKnowledgeBase(store.read(), course.id)
  res.status(201).json(question)
})

app.post('/api/courses/:courseId/question-imports', upload.single('file'), (req, res) => {
  const db = store.read()
  const course = db.courses.find((item) => item.id === req.params.courseId)
  const discardUpload = () => {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
  }
  if (!course || !req.file) {
    discardUpload()
    return res.status(400).json({
      error: !course ? '课程不存在' : '请选择 PDF、PPT 或 Word 题库文件',
    })
  }
  if (!mineruReady()) {
    discardUpload()
    return res.status(409).json({
      error: '批量题库需要 MinerU。请先在 AI 服务配置中填写 MinerU Token。',
    })
  }
  if (!bailianReady()) {
    discardUpload()
    return res.status(409).json({
      error: '批量拆题需要百炼模型。请先在 AI 服务配置中填写百炼 API Key。',
    })
  }
  let originalName = req.file.originalname
  try {
    originalName = Buffer.from(originalName, 'latin1').toString('utf8')
  } catch {
    /* 保留原名 */
  }
  if (!mineruSupports(originalName, req.file.mimetype)) {
    discardUpload()
    return res.status(400).json({
      error: '当前文件格式不受 MinerU 支持，请使用 PDF、PPT/PPTX、DOC/DOCX 或图片。',
    })
  }
  const job: QuestionImportJob = {
    id: id('question-import'),
    courseId: course.id,
    name: originalName,
    type: req.file.mimetype,
    size: req.file.size,
    sourcePath: `/uploads/${req.file.filename}`,
    questionIds: [],
    status: 'processing',
    progress: '等待 MinerU 精准解析',
    createdAt: now(),
  }
  store.update((data) => {
    data.questionImports ||= []
    data.questionImports.push(job)
  })
  res.status(202).json(job)

  const sourceFile = req.file.path
  const publicBase = `/uploads/question-banks/${job.id}`
  void extractWithMinerU({
    filePath: sourceFile,
    originalName,
    outputDir: path.join(uploadDir, 'question-banks', job.id),
    publicBase,
    structuredDir: path.resolve('data', 'mineru', job.id),
    dataId: job.id,
    onStatus: (message, batchId) =>
      store.update((data) => {
        const current = data.questionImports.find((item) => item.id === job.id)
        if (!current) return
        current.progress = message
        if (batchId) current.parserTaskId = batchId
      }),
  })
    .then(async (extracted) => {
      const descriptions: string[] = []
      const visualCandidates = extracted.visionCandidates
      for (const [index, asset] of visualCandidates.entries()) {
        store.update((data) => {
          const current = data.questionImports.find((item) => item.id === job.id)
          if (current) current.progress = `视觉模型正在理解 MinerU 未说明的题图 ${index + 1} / ${visualCandidates.length}`
        })
        try {
          const description = await describeInstructionalImage(asset.filePath, asset.mimeType)
          if (description) descriptions.push(`## 题图 ${index + 1}\n\n![MinerU 提取题图](${asset.publicUrl})\n\n${description}`)
        } catch (error) {
          descriptions.push(`## 题图 ${index + 1}\n\n![MinerU 提取题图](${asset.publicUrl})\n\n视觉补充失败：${error instanceof Error ? error.message : '未知错误'}。请教师复核原图。`)
        }
      }
      store.update((data) => {
        const current = data.questionImports.find((item) => item.id === job.id)
        if (current) current.progress = 'AI 正在识别题型并拆分题目'
      })
      const source = descriptions.length ? `${extracted.text}\n\n# 题图视觉说明\n\n${descriptions.join('\n\n')}` : extracted.text
      const questions = await analyzeQuestionBankMaterial(course.id, store.read(), source)
      if (!questions.length) throw new Error('没有识别到完整题目。请确认文件包含题干，并尝试换用排版更清晰的 PDF。')
      store.update((data) => {
        data.questions.push(...questions)
        const current = data.questionImports.find((item) => item.id === job.id)
        if (!current) return
        current.questionIds = questions.map((question) => question.id)
        current.status = 'review'
        current.progress = `已拆分 ${questions.length} 道题，等待教师确认`
        current.parserTaskId = extracted.batchId
      })
    })
    .catch((error) =>
      store.update((data) => {
        const current = data.questionImports.find((item) => item.id === job.id)
        if (!current) return
        current.status = 'failed'
        const cause =
          error instanceof Error
            ? (
                error as Error & {
                  cause?: { code?: string; message?: string }
                }
              ).cause
            : undefined
        current.error = cause?.code === 'ECONNRESET' || cause?.code === 'ETIMEDOUT' || cause?.code === 'ENETUNREACH' ? `无法连接 MinerU（${cause.code}）。请确认教师电脑联网；若正在使用移动热点，请检查电脑自身仍能访问互联网后重新上传。` : error instanceof Error ? error.message : '批量题库处理失败'
        current.progress = '处理失败'
      }),
    )
})

app.post('/api/question-imports/:id/confirm', (req, res) => {
  const db = store.read()
  const job = (db.questionImports || []).find((item) => item.id === req.params.id)
  if (!job || job.status !== 'review') return res.status(404).json({ error: '待确认的批量题库任务不存在' })
  const selected = new Set<string>(Array.isArray(req.body.questionIds) ? req.body.questionIds.map((value: unknown) => String(value)) : [])
  const allowed = new Set(job.questionIds)
  if (![...selected].some((questionId) => allowed.has(questionId))) return res.status(400).json({ error: '请至少保留一道题目' })
  store.update((data) => {
    data.questions = data.questions.filter((question) => !allowed.has(question.id) || selected.has(question.id))
    data.questions.forEach((question) => {
      if (selected.has(question.id)) question.status = 'confirmed'
    })
    const current = data.questionImports.find((item) => item.id === job.id)
    if (current) {
      current.questionIds = [...selected].filter((questionId) => allowed.has(questionId))
      current.status = 'completed'
      current.progress = `已加入题库 ${current.questionIds.length} 道`
      current.completedAt = now()
    }
  })
  syncKnowledgeBase(store.read(), job.courseId)
  res.json(store.read().questionImports.find((item) => item.id === job.id))
})

app.delete('/api/question-imports/:id', (req, res) => {
  const db = store.read()
  const job = (db.questionImports || []).find((item) => item.id === req.params.id)
  if (!job) return res.status(404).json({ error: '批量题库任务不存在' })
  const questionIds = new Set(job.questionIds)
  store.update((data) => {
    data.questions = data.questions.filter((question) => !questionIds.has(question.id) || question.status === 'confirmed')
    data.questionImports = data.questionImports.filter((item) => item.id !== job.id)
  })
  // 已确认题目会继续引用 MinerU 提取的题图，因此这里只移除导入记录，保留来源文件与图片。
  if (job.status === 'completed') return res.status(204).end()
  if (job.sourcePath?.startsWith('/uploads/')) {
    const target = path.resolve(uploadDir, job.sourcePath.slice('/uploads/'.length).replace(/\//g, path.sep))
    if (target.startsWith(`${uploadDir}${path.sep}`) && fs.existsSync(target)) fs.unlinkSync(target)
  }
  for (const root of [path.resolve(uploadDir, 'question-banks'), path.resolve('data', 'mineru')]) {
    const target = path.resolve(root, job.id)
    if (target.startsWith(`${root}${path.sep}`) && fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
  }
  res.status(204).end()
})

app.post(
  '/api/questions/generate',
  asyncRoute(async (req, res) => {
    const config = req.body as GenerateConfig
    if (!config.courseId || !config.knowledgePointIds?.length || !config.types?.length || config.count < 1 || config.count > 20) return res.status(400).json({ error: '请完整选择知识点、题型和题量（1–20）' })
    const db = store.read()
    let bankQuestions: Question[] = []
    if (config.source === 'bank' || config.source === 'mixed') {
      const selectedIds = new Set(config.bankQuestionIds || [])
      const hasExplicitSelection = Array.isArray(config.bankQuestionIds)
      bankQuestions = db.questions.filter((question) => question.courseId === config.courseId && question.status === 'confirmed' && question.source === 'bank' && config.knowledgePointIds.includes(question.knowledgePointId) && config.types.includes(question.type) && (!hasExplicitSelection || selectedIds.has(question.id)))
      if (bankQuestions.length < config.count) {
        const external = await questionBank.search(config)
        const known = new Set(bankQuestions.map((question) => question.id))
        bankQuestions.push(...external.filter((question) => !known.has(question.id)))
      }
    }
    if (config.source === 'mixed' && config.mixedMode === 'numeric-variant') {
      const variants = await generateQuestionVariants(config, db, bankQuestions)
      store.update((data) => data.questions.push(...variants))
      return res.status(201).json(variants)
    }
    bankQuestions = bankQuestions.slice(0, config.count)
    const remaining = Math.max(0, config.count - bankQuestions.length)
    const aiQuestions = remaining && config.source !== 'bank' ? await generateQuestions({ ...config, count: remaining }, db) : []
    const questions = [...bankQuestions, ...aiQuestions]
    if (!questions.length && config.source === 'bank')
      return res.status(409).json({
        error: '当前筛选条件下没有可用题库题目，请先在“课程与资料”中添加题目。',
      })
    if (aiQuestions.length) store.update((data) => data.questions.push(...aiQuestions))
    res.status(201).json(questions)
  }),
)

app.patch('/api/questions/:id', (req, res) => {
  let updated: Question | undefined
  let courseId = ''
  store.update((db) => {
    const question = db.questions.find((item) => item.id === req.params.id)
    if (question) {
      const changes = { ...req.body }
      if (typeof changes.answer === 'string' && question.type === 'multiple')
        changes.answer = changes.answer
          .split(/[,，、\s]+/)
          .filter(Boolean)
          .map((item: string) => item.toUpperCase())
      Object.assign(question, changes, {
        id: question.id,
        courseId: question.courseId,
      })
      updated = question
      courseId = question.courseId
    }
  })
  if (!updated) return res.status(404).json({ error: '题目不存在' })
  if (courseId) syncKnowledgeBase(store.read(), courseId)
  res.json(updated)
})

app.delete('/api/questions/:id', (req, res) => {
  const db = store.read()
  const question = db.questions.find((item) => item.id === req.params.id)
  if (!question) return res.status(404).json({ error: '题目不存在' })
  if (db.assessments.some((assessment) => assessment.questionIds.includes(question.id))) return res.status(409).json({ error: '该题已被教学任务使用，不能直接删除' })
  for (const match of question.stem.matchAll(/\/uploads\/([^\s)]+)/g)) {
    const target = path.resolve(uploadDir, match[1].replace(/\//g, path.sep))
    if (target.startsWith(`${uploadDir}${path.sep}`) && fs.existsSync(target)) fs.unlinkSync(target)
  }
  store.update((data) => {
    data.questions = data.questions.filter((item) => item.id !== question.id)
  })
  syncKnowledgeBase(store.read(), question.courseId)
  res.status(204).end()
})

app.post('/api/questions/confirm', (req, res) => {
  const ids = req.body.ids as string[]
  store.update((db) =>
    db.questions.forEach((question) => {
      if (ids.includes(question.id)) question.status = 'confirmed'
    }),
  )
  res.json({ ok: true })
})

app.get('/api/assessments', (req, res) => {
  const db = store.read()
  const courseId = String(req.query.courseId || '')
  res.json(
    db.assessments
      .filter((item) => !courseId || item.courseId === courseId)
      .map((assessment) => ({
        ...assessment,
        course: db.courses.find((course) => course.id === assessment.courseId),
        questions: assessment.questionIds.map((questionId) => db.questions.find((question) => question.id === questionId)).filter(Boolean),
        submissionCount: db.submissions.filter((submission) => submission.assessmentId === assessment.id).length,
      })),
  )
})

app.post('/api/assessments', (req, res) => {
  const code = Math.random().toString(36).slice(2, 7).toUpperCase()
  const assessment: Assessment = {
    id: id('assessment'),
    courseId: req.body.courseId,
    title: req.body.title,
    description: req.body.description || '',
    joinCode: code,
    questionIds: req.body.questionIds || [],
    category: req.body.category === 'homework' ? 'homework' : 'classroom',
    questionMode: ['fixed', 'pool', 'ai-variant'].includes(req.body.questionMode) ? req.body.questionMode : 'fixed',
    questionCount: Number(req.body.questionCount) || req.body.questionIds?.length || 1,
    status: 'draft',
    timeLimit: Number(req.body.timeLimit) || 20,
    createdAt: now(),
  }
  if (!assessment.courseId || !assessment.title || !assessment.questionIds.length) return res.status(400).json({ error: '课程、课堂名称和题目不能为空' })
  store.update((db) => db.assessments.push(assessment))
  res.status(201).json(assessment)
})

app.patch('/api/assessments/:id', (req, res) => {
  let updated: Assessment | undefined
  let courseId = ''
  store.update((db) => {
    const assessment = db.assessments.find((item) => item.id === req.params.id)
    if (!assessment) return
    const title = String(req.body.title || '').trim()
    if (title) assessment.title = title
    if (typeof req.body.description === 'string') assessment.description = req.body.description.trim()
    if (Number(req.body.timeLimit) > 0) assessment.timeLimit = Math.max(1, Number(req.body.timeLimit))
    updated = assessment
    courseId = assessment.courseId
  })
  if (!updated) return res.status(404).json({ error: '教学任务不存在' })
  if (courseId) syncKnowledgeBase(store.read(), courseId)
  res.json(updated)
})

app.delete('/api/assessments/:id', (req, res) => {
  const db = store.read()
  const assessment = db.assessments.find((item) => item.id === req.params.id)
  if (!assessment) return res.status(404).json({ error: '教学任务不存在' })
  store.update((data) => {
    data.assessments = data.assessments.filter((item) => item.id !== assessment.id)
    data.submissions = data.submissions.filter((item) => item.assessmentId !== assessment.id)
    data.videoProgress = (data.videoProgress || []).filter((item) => item.assessmentId !== assessment.id)
    if (data.settings?.reportDiagnoses) delete data.settings.reportDiagnoses[assessment.id]
  })
  syncKnowledgeBase(store.read(), assessment.courseId)
  res.status(204).end()
})

app.post('/api/assessments/:id/publish', (req, res) => {
  let assessment: Assessment | undefined
  store.update((db) => {
    assessment = db.assessments.find((item) => item.id === req.params.id)
    if (assessment) {
      db.assessments.forEach((item) => {
        if (item.status === 'published' && item.id !== req.params.id) item.status = 'closed'
      })
      assessment.status = 'published'
      assessment.publishedAt = now()
    }
  })
  if (!assessment) return res.status(404).json({ error: '课堂不存在' })
  res.json(assessment)
})

app.post('/api/assessments/:id/close', (req, res) => {
  let assessment: Assessment | undefined
  store.update((db) => {
    assessment = db.assessments.find((item) => item.id === req.params.id)
    if (assessment) assessment.status = 'closed'
  })
  if (!assessment) return res.status(404).json({ error: '课堂不存在' })
  res.json(assessment)
})

const stableHash = (value: string) => [...value].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0)

function resolveAssessmentQuestions(db: ReturnType<typeof store.read>, assessment: Assessment, studentId?: string) {
  const templates = assessment.questionIds.map((questionId) => db.questions.find((item) => item.id === questionId)).filter(Boolean) as Question[]
  if (!studentId || assessment.questionMode === 'fixed') return templates
  const desired = Math.max(1, assessment.questionCount || templates.length)
  const selected: Question[] = []
  const typeCounts = templates.reduce((map, question) => map.set(question.type, (map.get(question.type) || 0) + 1), new Map<Question['type'], number>())
  for (const [type, count] of typeCounts) {
    const candidates = db.questions.filter((question) => question.courseId === assessment.courseId && question.status === 'confirmed' && question.type === type).sort((a, b) => stableHash(`${studentId}:${assessment.id}:${a.id}`) - stableHash(`${studentId}:${assessment.id}:${b.id}`))
    selected.push(...candidates.slice(0, Math.min(count, desired - selected.length)))
  }
  if (selected.length < desired) {
    const selectedIds = new Set(selected.map((question) => question.id))
    const remaining = db.questions.filter((question) => question.courseId === assessment.courseId && question.status === 'confirmed' && !selectedIds.has(question.id)).sort((a, b) => stableHash(`${studentId}:${assessment.id}:${a.id}`) - stableHash(`${studentId}:${assessment.id}:${b.id}`))
    selected.push(...remaining.slice(0, desired - selected.length))
  }
  return selected.length ? selected : templates
}

function tutorialVideosFor(db: ReturnType<typeof store.read>, questions: Question[]) {
  const pointIds = new Set(questions.map((question) => question.knowledgePointId))
  return db.materials.filter((material) => material.kind === 'tutorial-video' && material.knowledgePointId && pointIds.has(material.knowledgePointId))
}

const classroomView = (assessment: Assessment, studentId?: string) => {
  const db = store.read()
  const course = db.courses.find((item) => item.id === assessment.courseId)
  const assigned = resolveAssessmentQuestions(db, assessment, studentId)
  const questions = assigned.map((question) => {
    const { answer: _answer, explanation: _explanation, rubric: _rubric, ...safeQuestion } = question as Question
    return safeQuestion
  })
  return {
    assessment,
    course,
    questions,
    submittedCount: db.submissions.filter((item) => item.assessmentId === assessment.id).length,
  }
}

app.get('/api/classrooms/available', (_req, res) => {
  const assessments = store.read().assessments.filter((item) => item.status === 'published')
  res.json(assessments.map((assessment) => classroomView(assessment)))
})

app.get('/api/classrooms/assessment/:id', (req, res) => {
  const assessment = store.read().assessments.find((item) => item.id === req.params.id && item.status === 'published')
  if (!assessment) return res.status(404).json({ error: '未找到当前课堂' })
  res.json(classroomView(assessment, String(req.query.studentId || '') || undefined))
})

app.get('/api/classrooms/:code', (req, res) => {
  const db = store.read()
  const assessment = db.assessments.find((item) => item.joinCode.toUpperCase() === req.params.code.toUpperCase() && item.status === 'published')
  if (!assessment) return res.status(404).json({ error: '未找到正在进行的课堂，请返回入口重新选择' })
  res.json(classroomView(assessment, String(req.query.studentId || '') || undefined))
})

app.get('/api/classrooms/active/current', (req, res) => {
  const db = store.read()
  const assessment = db.assessments.find((item) => item.status === 'published')
  if (!assessment) return res.status(404).json({ error: '教师尚未发布检测' })
  res.json(classroomView(assessment, String(req.query.studentId || '') || undefined))
})

app.post('/api/students/join', (req, res) => {
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ error: '请输入姓名' })
  const db = store.read()
  let student = db.students.find((item) => item.name === name && item.className === (req.body.className || '临时课堂'))
  if (!student) {
    student = {
      id: id('student'),
      name,
      studentNo: req.body.studentNo || '',
      className: req.body.className || '临时课堂',
      createdAt: now(),
    }
    const created = student
    store.update((data) => data.students.push(created))
  }
  res.json(student)
})

app.post(
  '/api/answers/image',
  upload.single('image'),
  asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请选择答题图片' })
    const result = await extractAnswerFromImage(req.file.path, req.file.mimetype)
    res.status(201).json({ imageUrl: `/uploads/${req.file.filename}`, ...result })
  }),
)

app.post(
  '/api/submissions',
  asyncRoute(async (req, res) => {
    const { assessmentId, studentId, answers } = req.body as {
      assessmentId: string
      studentId: string
      answers: {
        questionId: string
        answer: string | string[]
        imageUrl?: string
        extractedText?: string
      }[]
    }
    const db = store.read()
    const assessment = db.assessments.find((item) => item.id === assessmentId)
    if (!assessment || assessment.status !== 'published') return res.status(409).json({ error: '课堂未发布或已经结束' })
    const assignedQuestions = resolveAssessmentQuestions(db, assessment, studentId)
    const assignedIds = new Set(assignedQuestions.map((question) => question.id))
    const results: AnswerResult[] = []
    const aiJobs: {
      index: number
      question: Question
      answer: string | string[]
    }[] = []
    for (const input of answers || []) {
      const question = db.questions.find((item) => item.id === input.questionId)
      if (!question || !assignedIds.has(question.id)) continue
      const actualAnswer = input.extractedText || input.answer || ''
      const programmed = programGrade(question, actualAnswer)
      const graded = programmed || heuristicSubjectiveGrade(question, actualAnswer)
      if (!programmed && bailianReady()) aiJobs.push({ index: results.length, question, answer: actualAnswer })
      results.push({
        ...graded,
        answer: input.answer,
        imageUrl: input.imageUrl,
        extractedText: input.extractedText,
      })
    }
    const maxScore = assignedQuestions.reduce((sum, question) => sum + question.maxScore, 0)
    const submission: Submission = {
      id: id('submission'),
      assessmentId,
      studentId,
      answers: results,
      totalScore: results.reduce((sum, result) => sum + result.score, 0),
      maxScore,
      status: aiJobs.length ? 'grading' : 'completed',
      submittedAt: now(),
    }
    store.update((data) => {
      data.submissions = data.submissions.filter((item) => !(item.assessmentId === assessmentId && item.studentId === studentId))
      data.submissions.push(submission)
    })
    // 手机不再长时间保持一次 HTTP 请求等待 DeepSeek。先保存客观题和规则评分，
    // 主观题在教师电脑后台完成；学生端轮询同一提交记录取得最终诊断。
    res.status(aiJobs.length ? 202 : 201).json({
      ...submission,
      questions: assignedQuestions,
      tutorialVideos: tutorialVideosFor(db, assignedQuestions),
    })
    if (!aiJobs.length) {
      setImmediate(() => syncKnowledgeBase(store.read(), assessment.courseId))
      return
    }
    const startedAt = Date.now()
    console.log(`[诊断] 已接收提交 ${submission.id}，后台评分 ${aiJobs.length} 道主观题`)
    void Promise.all(
      aiJobs.map(async (job) => ({
        ...job,
        result: await gradeSubjective(job.question, job.answer),
      })),
    )
      .then((completed) => {
        store.update((data) => {
          const current = data.submissions.find((item) => item.id === submission.id)
          if (!current) return
          for (const item of completed)
            current.answers[item.index] = {
              ...item.result,
              answer: current.answers[item.index]?.answer ?? item.result.answer,
              imageUrl: current.answers[item.index]?.imageUrl,
              extractedText: current.answers[item.index]?.extractedText,
            }
          current.totalScore = current.answers.reduce((sum, answer) => sum + answer.score, 0)
          current.status = 'completed'
        })
        console.log(`[诊断] 提交 ${submission.id} 评分完成，用时 ${Date.now() - startedAt}ms`)
        syncKnowledgeBase(store.read(), assessment.courseId)
      })
      .catch((error) => {
        store.update((data) => {
          const current = data.submissions.find((item) => item.id === submission.id)
          if (current) current.status = 'completed'
        })
        console.error(`[诊断] 提交 ${submission.id} 后台评分异常，已保留规则诊断`, error)
      })
  }),
)

app.get('/api/submissions/:assessmentId/:studentId', (req, res) => {
  const db = store.read()
  const submission = db.submissions.find((item) => item.assessmentId === req.params.assessmentId && item.studentId === req.params.studentId)
  if (!submission) return res.status(404).json({ error: '未找到作答记录' })
  const questions = submission.answers.map((answer) => db.questions.find((item) => item.id === answer.questionId)).filter(Boolean) as Question[]
  res.json({
    ...submission,
    questions,
    tutorialVideos: tutorialVideosFor(db, questions),
  })
})

app.get('/api/reports/:assessmentId', (req, res) => {
  const report = buildClassReport(store.read(), req.params.assessmentId)
  if (!report) return res.status(404).json({ error: '课堂不存在' })
  res.json(report)
})

app.post(
  '/api/reports/:assessmentId/diagnosis/refresh',
  asyncRoute(async (req, res) => {
    const report = buildClassReport(store.read(), req.params.assessmentId)
    if (!report) return res.status(404).json({ error: '课堂不存在' })
    const diagnosis = await generateClassDiagnosis(report)
    store.update((db) => {
      db.settings = {
        ...db.settings,
        reportDiagnoses: {
          ...(db.settings?.reportDiagnoses || {}),
          [req.params.assessmentId]: diagnosis,
        },
      }
    })
    res.json(buildClassReport(store.read(), req.params.assessmentId))
  }),
)

app.get('/api/students', (_req, res) => {
  const db = store.read()
  const ranking = new Map(buildStudentRanking(db).map((item) => [item.id, item]))
  res.json(db.students.map((student) => ({ ...student, ...ranking.get(student.id) })).sort((a, b) => (a.rank || 9999) - (b.rank || 9999)))
})

app.get('/api/students/:id/profile', (req, res) => {
  const profile = buildStudentProfile(store.read(), req.params.id)
  if (!profile) return res.status(404).json({ error: '学生不存在' })
  res.json(profile)
})

app.post(
  '/api/practices',
  asyncRoute(async (req, res) => {
    const db = store.read()
    const point = db.knowledgePoints.find((item) => item.id === req.body.knowledgePointId)
    if (!point) return res.status(404).json({ error: '知识点不存在' })
    const sourceQuestion = req.body.questionId ? db.questions.find((item) => item.id === req.body.questionId) : undefined
    const latestAnswers = db.submissions
      .filter((item) => item.studentId === req.body.studentId && item.status === 'completed')
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .flatMap((item) => item.answers)
    const lastAnswer = sourceQuestion ? latestAnswers.find((answer) => answer.questionId === sourceQuestion.id) : latestAnswers.find((answer) => db.questions.find((question) => question.id === answer.questionId)?.knowledgePointId === point.id)
    const mode = (['similar', 'formula', 'recall', 'error'].includes(req.body.mode) ? req.body.mode : 'similar') as 'similar' | 'formula' | 'recall' | 'error'
    const question = await generatePracticeQuestion({ mode, point, sourceQuestion, lastAnswer }, db)
    const practice = {
      id: id('practice'),
      studentId: req.body.studentId,
      knowledgePointId: point.id,
      mode,
      question,
      completed: false,
      createdAt: now(),
    }
    store.update((data) => data.practices.push(practice))
    res.status(201).json(practice)
  }),
)

app.post(
  '/api/assistant/chat',
  asyncRoute(async (req, res) => {
    const db = store.read()
    const assessmentId = req.body.assessmentId || db.assessments.find((item) => item.status === 'published')?.id
    const report = assessmentId ? buildClassReport(db, assessmentId) : null
    const assessment = assessmentId ? db.assessments.find((item) => item.id === assessmentId) : undefined
    const message = String(req.body.message || '')
    const retrievedContext = buildRetrievedContext(db, message, assessment?.courseId, assessmentId)
    const promptPath = path.resolve('prompts', 'teacher-assistant.md')
    const globalPrompt = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : ''
    const answer = await teacherAssistant(message, db, report, retrievedContext, globalPrompt)
    res.json({ answer, mode: bailianReady() ? 'bailian' : 'data-demo' })
  }),
)

app.post('/api/assistant/chat/stream', async (req, res) => {
  res.status(200).set({
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  })
  res.flushHeaders()
  try {
    const db = store.read()
    const assessmentId = req.body.assessmentId || db.assessments.find((item) => item.status === 'published')?.id
    const report = assessmentId ? buildClassReport(db, assessmentId) : null
    const assessment = assessmentId ? db.assessments.find((item) => item.id === assessmentId) : undefined
    const message = String(req.body.message || '')
    const retrievedContext = buildRetrievedContext(db, message, assessment?.courseId, assessmentId)
    const promptPath = path.resolve('prompts', 'teacher-assistant.md')
    const globalPrompt = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : ''
    await teacherAssistantStream(message, db, report, retrievedContext, globalPrompt, (delta) => res.write(`${JSON.stringify({ type: 'delta', text: delta })}\n`))
    res.write(`${JSON.stringify({ type: 'done', mode: bailianReady() ? 'bailian' : 'data-demo' })}\n`)
  } catch (error) {
    res.write(`${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'AI 助教暂时无法回答' })}\n`)
  } finally {
    res.end()
  }
})

app.post(
  '/api/assistant/transcribe',
  upload.single('audio'),
  asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '没有收到音频' })
    try {
      const text = await transcribeAudio(fs.readFileSync(req.file.path), req.file.mimetype)
      res.json({ text, provider: 'bailian' })
    } finally {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    }
  }),
)

app.post('/api/demo/reset', (_req, res) => {
  const db = store.reset()
  syncKnowledgeBase(db)
  res.json(db)
})

app.get('/api/knowledge/:courseId/manifest', (req, res) => {
  const db = store.read()
  syncKnowledgeBase(db, req.params.courseId)
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
  console.log(`辽科智学服务已启动：http://localhost:${port}`)
  for (const address of lanAddresses(port)) console.log(`局域网访问：${address}`)
})

export { app }
