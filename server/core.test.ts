import test from 'node:test'
import assert from 'node:assert/strict'
import type { Question } from '../shared/types.js'
import { programGrade, heuristicSubjectiveGrade } from './grading.js'
import { buildClassReport, buildStudentProfile } from './reports.js'
import { store } from './store.js'

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

test('示例数据能生成班级报告和学生画像', () => {
  const db = store.reset()
  const report = buildClassReport(db, 'assessment-demo')
  const profile = buildStudentProfile(db, 'stu-1')
  assert.equal(report?.submittedCount, 6)
  assert.equal(report?.questionStats.length, 4)
  assert.ok((report?.knowledgeMastery.length || 0) >= 3)
  assert.equal(profile?.student.name, '林晓雨')
  assert.ok((profile?.mastery.length || 0) >= 1)
})
