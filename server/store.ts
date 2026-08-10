import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Database, Submission } from '../shared/types.js'

const DATA_DIR = path.resolve('data')
const DB_PATH = path.join(DATA_DIR, 'db.json')

const now = () => new Date().toISOString()

function demoSubmission(studentId: string, answers: Submission['answers']): Submission {
  const totalScore = answers.reduce((sum, answer) => sum + answer.score, 0)
  return {
    id: randomUUID(),
    assessmentId: 'assessment-demo',
    studentId,
    answers,
    totalScore,
    maxScore: 30,
    status: 'completed',
    submittedAt: now()
  }
}

const diag = (correct: boolean, ability: '概念理解' | '公式应用' | '计算', reason = '') => ({
  summary: correct ? '思路清晰，答案正确。' : '核心思路已接近，但关键环节存在偏差。',
  errorLocation: correct ? undefined : '列式或代入计算环节',
  errorReason: correct ? undefined : reason || '没有准确结合一次函数的变化规律。',
  errorType: correct ? undefined : ability === '计算' ? '计算失误' : ability === '公式应用' ? '公式应用错误' : '概念混淆',
  suggestion: correct ? '继续尝试更复杂的变式题。' : '先回顾相关概念，再完成一道同类变式题。',
  relatedConcept: ability === '概念理解' ? '一次函数中 k 的符号决定增减性' : '一次函数 y=kx+b 的图像与代入计算',
  abilityScores: { [ability]: correct ? 92 : 52 }
})

function seed(): Database {
  const createdAt = now()
  const questionAnswers = {
    q1: (answer: string, correct: boolean) => ({ questionId: 'q-demo-1', answer, score: correct ? 5 : 0, correct, diagnosis: diag(correct, '概念理解') }),
    q2: (answer: string, score: number) => ({ questionId: 'q-demo-2', answer, score, correct: score === 5, diagnosis: diag(score === 5, '公式应用', '代入 x 值后移项或符号处理不准确。') }),
    q3: (answer: string, score: number) => ({ questionId: 'q-demo-3', answer, score, correct: score === 10, diagnosis: diag(score === 10, '公式应用', '没有同时利用两个点建立方程求出 k 与 b。') }),
    q4: (answer: string, score: number) => ({ questionId: 'q-demo-4', answer, score, correct: score === 10, diagnosis: diag(score === 10, '计算', '交点坐标代入后计算出现偏差。') })
  }
  const students = [
    ['stu-1', '林晓雨', '八年级 2 班'], ['stu-2', '陈一鸣', '八年级 2 班'],
    ['stu-3', '周可欣', '八年级 2 班'], ['stu-4', '王子墨', '八年级 2 班'],
    ['stu-5', '赵思源', '八年级 2 班'], ['stu-6', '沈星澜', '八年级 2 班']
  ].map(([id, name, className], index) => ({ id, name, className, studentNo: `20260${index + 1}`, createdAt }))

  return {
    courses: [{
      id: 'course-demo', name: '一次函数的图像与性质', subject: '数学', grade: '八年级',
      description: '理解一次函数的图像、增减性与实际应用，能够从图像和表达式两个角度解决问题。',
      color: '#275d56', createdAt
    }],
    knowledgePoints: [
      { id: 'kp-demo-1', courseId: 'course-demo', name: '一次函数的概念', description: '理解 y=kx+b（k≠0）的基本形式及变量关系。', formula: 'y = kx + b（k ≠ 0）', createdAt },
      { id: 'kp-demo-2', courseId: 'course-demo', name: '图像与增减性', description: '根据 k 的正负判断图像走势与函数增减性。', formula: 'k > 0 时 y 随 x 增大而增大；k < 0 时相反', createdAt },
      { id: 'kp-demo-3', courseId: 'course-demo', name: '待定系数法', description: '根据点的坐标或条件求一次函数解析式。', formula: '将已知点代入 y = kx + b 建立方程组', createdAt }
    ],
    materials: [{
      id: 'material-demo', courseId: 'course-demo', name: '一次函数课堂讲义（示例）.md', type: 'text/markdown', size: 1240,
      extractedText: '一次函数的一般形式为 y=kx+b，其中 k、b 为常数且 k 不等于 0。k>0 时函数值随自变量增大而增大；k<0 时函数值随自变量增大而减小。求函数解析式常用待定系数法。',
      status: 'ready', createdAt
    }],
    questions: [
      { id: 'q-demo-1', courseId: 'course-demo', knowledgePointId: 'kp-demo-2', type: 'single', difficulty: '基础', stem: '对于一次函数 y = -2x + 3，下列说法正确的是？', options: ['y 随 x 增大而增大', 'y 随 x 增大而减小', '图像经过原点', '图像不经过第二象限'], answer: 'B', explanation: '因为 k=-2<0，所以 y 随 x 增大而减小。', formula: 'k < 0 ⇒ y 随 x 增大而减小', maxScore: 5, abilities: ['概念理解'], source: 'ai', status: 'confirmed', createdAt },
      { id: 'q-demo-2', courseId: 'course-demo', knowledgePointId: 'kp-demo-1', type: 'blank', difficulty: '基础', stem: '已知一次函数 y = 3x - 2，当 x = 4 时，y = ____。', answer: '10', explanation: '把 x=4 代入：y=3×4-2=10。', formula: 'y = kx + b', maxScore: 5, abilities: ['公式应用', '计算'], source: 'ai', status: 'confirmed', createdAt },
      { id: 'q-demo-3', courseId: 'course-demo', knowledgePointId: 'kp-demo-3', type: 'short', difficulty: '进阶', stem: '一次函数的图像经过点 A(1, 3) 和 B(3, 7)，求这个一次函数的解析式，并写出主要过程。', answer: 'y=2x+1', explanation: '分别代入得到 k+b=3，3k+b=7，解得 k=2，b=1。', rubric: '列出两个方程 4 分；求出 k、b 4 分；写出解析式 2 分。', formula: 'y = kx + b', maxScore: 10, abilities: ['公式应用', '推理', '表达'], source: 'ai', status: 'confirmed', createdAt },
      { id: 'q-demo-4', courseId: 'course-demo', knowledgePointId: 'kp-demo-2', type: 'short', difficulty: '挑战', stem: '直线 y = 2x - 1 与 y = -x + 5 相交于点 P。求 P 的坐标，并说明两条直线增减性有什么不同。', answer: 'P(2,3)；前者递增，后者递减', explanation: '令 2x-1=-x+5，得 x=2，y=3。两条直线 k 分别为 2 与 -1。', rubric: '求交点 6 分；正确说明增减性 4 分。', formula: '联立 2x-1=-x+5', maxScore: 10, abilities: ['计算', '概念理解', '推理'], source: 'ai', status: 'confirmed', createdAt }
    ],
    assessments: [{
      id: 'assessment-demo', courseId: 'course-demo', title: '一次函数 · 课堂即时诊断', description: '检测图像性质、代入计算与待定系数法。', joinCode: 'MATH8',
      questionIds: ['q-demo-1', 'q-demo-2', 'q-demo-3', 'q-demo-4'], status: 'published', timeLimit: 20, publishedAt: createdAt, createdAt
    }],
    students,
    submissions: [
      demoSubmission('stu-1', [questionAnswers.q1('B', true), questionAnswers.q2('10', 5), questionAnswers.q3('y=2x+1', 10), questionAnswers.q4('P(2,3)，前增后减', 10)]),
      demoSubmission('stu-2', [questionAnswers.q1('B', true), questionAnswers.q2('10', 5), questionAnswers.q3('y=2x+1', 8), questionAnswers.q4('P(2,3)', 6)]),
      demoSubmission('stu-3', [questionAnswers.q1('A', false), questionAnswers.q2('14', 0), questionAnswers.q3('y=2x+1', 7), questionAnswers.q4('P(2,3)，前增后减', 10)]),
      demoSubmission('stu-4', [questionAnswers.q1('B', true), questionAnswers.q2('10', 5), questionAnswers.q3('k=2,b=1', 8), questionAnswers.q4('P(3,2)', 4)]),
      demoSubmission('stu-5', [questionAnswers.q1('A', false), questionAnswers.q2('10', 5), questionAnswers.q3('y=x+2', 3), questionAnswers.q4('不会', 0)]),
      demoSubmission('stu-6', [questionAnswers.q1('B', true), questionAnswers.q2('10', 5), questionAnswers.q3('y=2x+1', 10), questionAnswers.q4('P(2,3)，前增后减', 10)])
    ],
    practices: []
  }
}

export class JsonStore {
  private data: Database

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    if (fs.existsSync(DB_PATH)) {
      try {
        this.data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as Database
      } catch {
        this.data = seed()
        this.save()
      }
    } else {
      this.data = seed()
      this.save()
    }
  }

  read(): Database {
    return structuredClone(this.data)
  }

  update(mutator: (db: Database) => void): Database {
    mutator(this.data)
    this.save()
    return this.read()
  }

  reset(): Database {
    this.data = seed()
    this.save()
    return this.read()
  }

  private save() {
    const temporaryPath = `${DB_PATH}.tmp`
    fs.writeFileSync(temporaryPath, JSON.stringify(this.data, null, 2), 'utf8')
    fs.renameSync(temporaryPath, DB_PATH)
  }
}

export const store = new JsonStore()
