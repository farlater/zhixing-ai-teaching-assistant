import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Question } from '../shared/types.js'
import { programGrade, heuristicSubjectiveGrade } from './grading.js'
import { buildClassReport, buildStudentProfile } from './reports.js'
import { store } from './store.js'
import { extractAnswerFromImage, extractModelJson, generatePracticeQuestion } from './ai.js'
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

test('展示数据包含60名大学课程学生、12次课堂检测、12次作业和综合题', () => {
  const db = store.reset()
  const report = buildClassReport(db, 'demo-classroom-01')
  const structureReport = buildClassReport(db, 'assessment-structure')
  assert.equal(db.courses.length, 3)
  assert.equal(db.questions.length, 10)
  assert.equal(db.students.length, 60)
  assert.equal(db.assessments.filter(item => item.category === 'classroom').length, 12)
  assert.equal(db.assessments.filter(item => item.category === 'homework').length, 12)
  assert.equal(new Set(db.assessments.filter(item => item.category === 'classroom').map(item => item.title.split(' · ')[1])).size, 12)
  assert.ok(db.assessments.some(item => item.title.includes('机械系统的方案设计')))
  assert.equal(db.submissions.length, 1440)
  assert.equal(report?.submittedCount, 60)
  assert.equal(report?.questionStats.length, 3)
  assert.equal(structureReport?.submittedCount, 60)
  assert.equal(structureReport?.questionStats.length, 4)
  assert.equal(structureReport?.diagnosis.source, 'preset')
  assert.match(structureReport?.diagnosis.summary || '', /局部自由度|高副低代/)
  assert.ok((report?.knowledgeMastery.length || 0) >= 3)
  const profile = buildStudentProfile(db, 'demo-student-01')
  assert.equal(profile?.student.className, '机械2301班')
  assert.equal(profile?.history.length, 12)
  assert.ok((profile?.weightedScore || 0) > 0)
  assert.equal(db.assessments.filter(item => item.status === 'published').length, 1)
  assert.equal(db.questions.find(item => item.id === 'q-structure-photo')?.type, 'short')
  assert.equal(db.assessments.some(item => item.id === 'assessment-photo-demo'), false)
  assert.ok(db.assessments.find(item => item.id === 'assessment-structure')?.questionIds.includes('q-structure-photo'))
})

test('DeepSeek 返回外层对象、数组和尾部说明时仍能解析题目 JSON', () => {
  const response = '下面是结果：\n```json\n{"questions":[{"stem":"含有 [括号] 的题目","options":["A","B"]}]}\n```\n以上题目均来自课程资料。'
  const parsed = extractModelJson(response) as { questions: { stem: string }[] }
  assert.equal(parsed.questions.length, 1)
  assert.equal(parsed.questions[0].stem, '含有 [括号] 的题目')
})

test('课堂数据能生成目录化知识文件并按问题检索', () => {
  const db = store.reset()
  syncKnowledgeBase(db, 'course-fourbar')
  const base = path.resolve('data', 'knowledge', 'course-fourbar')
  assert.ok(fs.existsSync(path.join(base, '00-course.md')))
  assert.equal(fs.existsSync(path.join(base, '04-classrooms', 'demo-classroom-02', 'submissions', 'demo-student-01.md')), true)
  const context = buildRetrievedContext(db, '这节课的行程速比系数公式是什么', 'course-fourbar', 'demo-classroom-02')
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
      const body = JSON.parse(String(init?.body)) as { model: string; messages: { content: ({ image_url?: { url: string }; text?: string })[] }[] }
      assert.equal(body.model, 'qwen3-vl-flash')
      assert.match(body.messages[0].content[0].image_url?.url || '', /^data:image\/png;base64,/) 
      assert.match(body.messages[0].content[1].text || '', /不评分/)
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

test('强化练习提示词会携带上一轮作答、诊断和公式', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.DASHSCOPE_API_KEY
  process.env.DASHSCOPE_API_KEY = 'test-bailian-key'
  const db = store.reset()
  const point = db.knowledgePoints.find(item => item.id === 'kp-structure-analysis')!
  const sourceQuestion = db.questions.find(item => item.id === 'q-structure-photo')!
  const lastAnswer = db.submissions.flatMap(item => item.answers).find(item => item.questionId === sourceQuestion.id)!
  try {
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] }
      assert.match(body.messages[0].content, /上一轮的具体错误位置/)
      assert.match(body.messages[1].content, /studentAnswer/)
      assert.match(body.messages[1].content, /F=3n-2P_L-P_H/)
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"question":{"stem":"默写自由度公式并说明修正项","answer":"F=3n-2P_L-P_H","explanation":"针对上一轮漏项","rubric":"公式3分，说明2分","formula":"F=3n-2P_L-P_H","maxScore":5,"abilities":["公式掌握"]}}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const question = await generatePracticeQuestion({ mode: 'formula', point, sourceQuestion, lastAnswer }, db)
    assert.equal(question.type, 'blank')
    assert.equal(question.source, 'practice')
    assert.match(String(question.answer), /F=3n-2P_L-P_H/)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.DASHSCOPE_API_KEY
    else process.env.DASHSCOPE_API_KEY = originalKey
  }
})
