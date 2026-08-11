import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Question } from '../shared/types.js'
import { programGrade, heuristicSubjectiveGrade } from './grading.js'
import { buildClassReport, buildStudentProfile } from './reports.js'
import { store } from './store.js'
import { extractAnswerFromImage } from './ai.js'
import { buildRetrievedContext, syncKnowledgeBase } from './knowledgeBase.js'

const baseQuestion: Question = {
  id: 'test-q', courseId: 'test-course', knowledgePointId: 'test-kp', type: 'single', difficulty: '基础',
  stem: '测试题', options: ['甲', '乙'], answer: 'B', explanation: '答案为 B', maxScore: 5,
  abilities: ['概念理解'], source: 'manual', status: 'confirmed', createdAt: new Date().toISOString()
}

test('客观题由程序准确判定且生成诊断', () => {
  const correct = programGrade(baseQuestion, 'B')
  const wrong = programGrade(baseQuestion, 'A')
  assert.equal(correct?.score, 5)
  assert.equal(correct?.correct, true)
  assert.equal(wrong?.score, 0)
  assert.equal(wrong?.diagnosis.errorType, '概念混淆')
})

test('主观题演示评分始终限制在合法分值内', () => {
  const question: Question = { ...baseQuestion, type: 'short', answer: 'y=2x+1', maxScore: 10, rubric: '过程 8 分，结论 2 分' }
  const result = heuristicSubjectiveGrade(question, 'y=2x+1')
  assert.equal(result.score, 10)
  assert.equal(result.correct, true)
  assert.ok(result.score >= 0 && result.score <= question.maxScore)
})

test('初始数据不包含虚构学生或作答', () => {
  const db = store.reset()
  const report = buildClassReport(db, 'assessment-fourbar')
  const structureReport = buildClassReport(db, 'assessment-structure')
  assert.equal(db.courses.length, 3)
  assert.equal(db.questions.length, 9)
  assert.equal(db.students.length, 0)
  assert.equal(db.submissions.length, 0)
  assert.equal(report?.submittedCount, 0)
  assert.equal(report?.questionStats.length, 3)
  assert.equal(structureReport?.submittedCount, 0)
  assert.equal(structureReport?.questionStats.length, 3)
  assert.ok((report?.knowledgeMastery.length || 0) >= 3)
  assert.equal(buildStudentProfile(db, 'demo-student-01'), null)
  assert.equal(db.assessments.filter(item => item.status === 'published').length, 1)
})

test('课堂数据能生成目录化知识文件并按问题检索', () => {
  const db = store.reset()
  syncKnowledgeBase(db, 'course-fourbar')
  const base = path.resolve('data', 'knowledge', 'course-fourbar')
  assert.ok(fs.existsSync(path.join(base, '00-course.md')))
  assert.equal(fs.existsSync(path.join(base, '04-classrooms', 'assessment-fourbar', 'submissions', 'demo-student-01.md')), false)
  const context = buildRetrievedContext(db, '这节课的行程速比系数公式是什么', 'course-fourbar', 'assessment-fourbar')
  assert.match(context, /来源：course-fourbar\//)
  assert.match(context, /K=\(180°\+θ\)\/\(180°-θ\)/)
})

test('图片识别使用百炼视觉并返回 Token 用量', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.DASHSCOPE_API_KEY
  const imagePath = path.join(os.tmpdir(), `zhixing-vision-${Date.now()}.png`)
  fs.writeFileSync(imagePath, Buffer.from([137, 80, 78, 71]))
  process.env.DASHSCOPE_API_KEY = 'test-bailian-key'
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
      assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer test-bailian-key')
      const body = JSON.parse(String(init?.body)) as { model: string; messages: { content: { image_url?: { url: string } }[] }[] }
      assert.equal(body.model, 'qwen3-vl-flash')
      assert.match(body.messages[0].content[0].image_url?.url || '', /^data:image\/png;base64,/) 
      return new Response(JSON.stringify({ choices: [{ message: { content: 'x=2，计算过程完整' } }], usage: { total_tokens: 321 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const result = await extractAnswerFromImage(imagePath, 'image/png')
    assert.equal(result.provider, 'bailian')
    assert.equal(result.text, 'x=2，计算过程完整')
    assert.match(result.note, /321 Tokens/)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.DASHSCOPE_API_KEY
    else process.env.DASHSCOPE_API_KEY = originalKey
    fs.rmSync(imagePath, { force: true })
  }
})
