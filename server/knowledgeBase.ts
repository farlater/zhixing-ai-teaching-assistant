import fs from 'node:fs'
import path from 'node:path'
import type { Database } from '../shared/types.js'
import { buildClassReport, buildStudentProfile } from './reports.js'

const ROOT = path.resolve('data', 'knowledge')

interface ManifestEntry {
  path: string
  title: string
  kind: 'course' | 'knowledge-point' | 'material' | 'question' | 'classroom' | 'submission' | 'student'
  courseId: string
  assessmentId?: string
  studentId?: string
  knowledgePointIds?: string[]
  updatedAt: string
}

const safe = (value: string) => value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, '-').slice(0, 80)
const frontmatter = (data: Record<string, string | string[] | undefined>) => `---\n${Object.entries(data).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}: ${Array.isArray(value) ? `[${value.map(item => JSON.stringify(item)).join(', ')}]` : JSON.stringify(value)}`).join('\n')}\n---\n\n`

function writeAtomic(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temp = `${filePath}.tmp`
  fs.writeFileSync(temp, content, 'utf8')
  fs.renameSync(temp, filePath)
}

export function syncKnowledgeBase(db: Database, courseId?: string) {
  fs.mkdirSync(ROOT, { recursive: true })
  const courses = db.courses.filter(course => !courseId || course.id === courseId)
  for (const course of courses) {
    const base = path.join(ROOT, safe(course.id))
    const manifest: ManifestEntry[] = []
    const add = (relative: string, title: string, kind: ManifestEntry['kind'], content: string, extra: Partial<ManifestEntry> = {}) => {
      writeAtomic(path.join(base, relative), content)
      manifest.push({ path: relative.replace(/\\/g, '/'), title, kind, courseId: course.id, updatedAt: new Date().toISOString(), ...extra })
    }
    add('00-course.md', course.name, 'course', frontmatter({ type: 'course', courseId: course.id }) + `# ${course.name}\n\n- 学科：${course.subject}\n- 年级：${course.grade}\n\n${course.description}`)
    for (const point of db.knowledgePoints.filter(item => item.courseId === course.id)) {
      add(path.join('01-knowledge-points', `${safe(point.id)}.md`), point.name, 'knowledge-point', frontmatter({ type: 'knowledge-point', courseId: course.id, knowledgePointId: point.id }) + `# ${point.name}\n\n${point.description}\n\n${point.formula ? `## 公式 / 要点\n\n${point.formula}` : ''}`, { knowledgePointIds: [point.id] })
    }
    for (const material of db.materials.filter(item => item.courseId === course.id)) {
      const figures = material.parser === 'mineru' ? '' : (material.imageUrls || []).map((url, index) => `![资料插图 ${index + 1}](${url})`).join('\n\n')
      const body = `${frontmatter({ type: 'material', courseId: course.id, source: material.path, parser: material.parser })}# ${material.name}\n\n${material.extractedText || '> 暂无可提取文本'}\n\n${figures ? `## 原始页面与插图\n\n${figures}` : ''}\n\n${material.extractionNotes?.length ? `## 处理说明\n\n${material.extractionNotes.map(note => `- ${note}`).join('\n')}` : ''}`
      const relative = path.join('02-materials', `${safe(material.id)}.md`)
      add(relative, material.name, 'material', body)
      material.knowledgeFile = path.join(base, relative).replace(/\\/g, '/')
    }
    for (const question of db.questions.filter(item => item.courseId === course.id)) {
      const answer = Array.isArray(question.answer) ? question.answer.join('、') : question.answer
      add(path.join('03-question-bank', `${safe(question.id)}.md`), question.stem, 'question', `${frontmatter({ type: 'question', courseId: course.id, questionId: question.id, knowledgePointId: question.knowledgePointId })}# ${question.stem}\n\n- 题型：${question.type}\n- 难度：${question.difficulty}\n- 满分：${question.maxScore}\n- 状态：${question.status}\n\n## 参考答案\n\n${answer}\n\n## 解析\n\n${question.explanation}\n\n${question.rubric ? `## 评分标准\n\n${question.rubric}` : ''}`, { knowledgePointIds: [question.knowledgePointId] })
    }
    for (const assessment of db.assessments.filter(item => item.courseId === course.id)) {
      const report = buildClassReport(db, assessment.id)
      const folder = path.join('04-classrooms', safe(assessment.id))
      add(path.join(folder, 'overview.md'), assessment.title, 'classroom', `${frontmatter({ type: 'classroom', courseId: course.id, assessmentId: assessment.id })}# ${assessment.title}\n\n- 状态：${assessment.status}\n- 题量：${assessment.questionIds.length}\n- 时长：${assessment.timeLimit} 分钟\n- 已提交：${report?.submittedCount || 0}\n- 班级正确率：${report?.accuracy || 0}%`, { assessmentId: assessment.id })
      if (report) add(path.join(folder, 'report.md'), `${assessment.title}班级报告`, 'classroom', `${frontmatter({ type: 'class-report', courseId: course.id, assessmentId: assessment.id })}# 班级报告\n\n## 真实统计\n\n- 平均分：${report.averageScore}\n- 正确率：${report.accuracy}%\n- 提交人数：${report.submittedCount}\n\n## 知识点掌握\n\n${report.knowledgeMastery.map(item => `- ${item.name}：${item.value}%`).join('\n')}\n\n## 逐题表现\n\n${report.questionStats.map(item => `- 第 ${item.index} 题：正确率 ${item.accuracy}%，平均 ${item.average}/${item.maxScore}`).join('\n')}\n\n## 常见错误\n\n${report.errorTypes.map(item => `- ${item.name}：${item.value} 次`).join('\n')}\n\n## 数据规则生成的建议\n\n${report.suggestions.map(item => `- ${item}`).join('\n')}`, { assessmentId: assessment.id })
      for (const submission of db.submissions.filter(item => item.assessmentId === assessment.id)) {
        const student = db.students.find(item => item.id === submission.studentId)
        const answers = submission.answers.map((answer, index) => `## 第 ${index + 1} 题\n\n- 得分：${answer.score}\n- 学生答案：${Array.isArray(answer.answer) ? answer.answer.join('、') : answer.answer}\n- 识别文本：${answer.extractedText || '无'}\n- 错误类型：${answer.diagnosis.errorType || '无'}\n- 诊断：${answer.diagnosis.summary}\n- 建议：${answer.diagnosis.suggestion}${answer.imageUrl ? `\n\n![学生作答](${answer.imageUrl})` : ''}`).join('\n\n')
        add(path.join(folder, 'submissions', `${safe(submission.studentId)}.md`), `${student?.name || submission.studentId}的作答`, 'submission', `${frontmatter({ type: 'submission', courseId: course.id, assessmentId: assessment.id, studentId: submission.studentId })}# ${student?.name || submission.studentId} · ${assessment.title}\n\n- 总分：${submission.totalScore}/${submission.maxScore}\n- 提交时间：${submission.submittedAt}\n\n${answers}`, { assessmentId: assessment.id, studentId: submission.studentId })
      }
    }
    for (const student of db.students) {
      const profile = buildStudentProfile(db, student.id)
      if (!profile) continue
      const relevant = db.submissions.some(submission => submission.studentId === student.id && db.assessments.some(assessment => assessment.id === submission.assessmentId && assessment.courseId === course.id))
      if (!relevant) continue
      add(path.join('05-students', `${safe(student.id)}.md`), `${student.name}学习画像`, 'student', `${frontmatter({ type: 'student-profile', courseId: course.id, studentId: student.id })}# ${student.name}学习画像\n\n\`\`\`json\n${JSON.stringify(profile, null, 2)}\n\`\`\``, { studentId: student.id })
    }
    writeAtomic(path.join(base, 'manifest.json'), JSON.stringify({ version: 1, courseId: course.id, generatedAt: new Date().toISOString(), entries: manifest }, null, 2))
  }
}

const tokens = (query: string) => {
  const clean = query.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  return [...new Set([clean, ...Array.from({ length: Math.max(0, clean.length - 1) }, (_, index) => clean.slice(index, index + 2))].filter(Boolean))]
}

export function retrieveKnowledge(db: Database, query: string, courseId?: string, assessmentId?: string, limit = 7) {
  syncKnowledgeBase(db, courseId)
  const courseIds = courseId ? [courseId] : db.courses.map(course => course.id)
  const candidates: { entry: ManifestEntry; absolute: string; score: number }[] = []
  for (const id of courseIds) {
    const base = path.join(ROOT, safe(id))
    const manifestPath = path.join(base, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { entries: ManifestEntry[] }
    for (const entry of manifest.entries) {
      const haystack = `${entry.title}${entry.path}`.toLowerCase()
      const score = tokens(query).reduce((sum, token) => sum + (haystack.includes(token) ? token.length : 0), 0) + (assessmentId && entry.assessmentId === assessmentId ? 10 : 0) + (entry.kind === 'classroom' ? 2 : 0)
      candidates.push({ entry, absolute: path.join(base, entry.path), score })
    }
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, limit).map(item => ({ source: `${item.entry.courseId}/${item.entry.path}`, content: fs.readFileSync(item.absolute, 'utf8').slice(0, 7000) }))
}

export function buildRetrievedContext(db: Database, query: string, courseId?: string, assessmentId?: string) {
  return retrieveKnowledge(db, query, courseId, assessmentId).map(item => `## 来源：${item.source}\n\n${item.content}`).join('\n\n---\n\n').slice(0, 28000)
}

export function knowledgeRoot() { return ROOT }
