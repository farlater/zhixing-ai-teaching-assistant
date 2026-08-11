export type QuestionType = 'single' | 'multiple' | 'truefalse' | 'blank' | 'short'
export type Difficulty = '基础' | '进阶' | '挑战'
export type Ability = '概念理解' | '公式掌握' | '公式应用' | '推理' | '计算' | '表达'

export interface KnowledgePoint {
  id: string
  courseId: string
  name: string
  description: string
  formula?: string
  createdAt: string
}

export interface Material {
  id: string
  courseId: string
  name: string
  type: string
  size: number
  extractedText: string
  path?: string
  imageUrls?: string[]
  extractionNotes?: string[]
  pageCount?: number
  knowledgeFile?: string
  parser?: 'mineru' | 'builtin'
  parserTaskId?: string
  status: 'ready' | 'processing' | 'failed'
  createdAt: string
}

export interface Course {
  id: string
  name: string
  subject: string
  grade: string
  description: string
  color: string
  createdAt: string
}

export interface Question {
  id: string
  courseId: string
  knowledgePointId: string
  type: QuestionType
  difficulty: Difficulty
  stem: string
  options?: string[]
  answer: string | string[]
  explanation: string
  rubric?: string
  formula?: string
  maxScore: number
  abilities: Ability[]
  source: 'ai' | 'bank' | 'manual' | 'practice'
  status: 'draft' | 'confirmed'
  createdAt: string
}

export interface Assessment {
  id: string
  courseId: string
  title: string
  description: string
  joinCode: string
  questionIds: string[]
  status: 'draft' | 'published' | 'closed'
  timeLimit: number
  publishedAt?: string
  createdAt: string
}

export interface Student {
  id: string
  name: string
  studentNo?: string
  className: string
  createdAt: string
}

export interface Diagnosis {
  summary: string
  errorLocation?: string
  errorReason?: string
  errorType?: string
  suggestion: string
  relatedConcept: string
  abilityScores: Partial<Record<Ability, number>>
}

export interface AnswerResult {
  questionId: string
  answer: string | string[]
  imageUrl?: string
  extractedText?: string
  score: number
  correct: boolean
  diagnosis: Diagnosis
}

export interface Submission {
  id: string
  assessmentId: string
  studentId: string
  answers: AnswerResult[]
  totalScore: number
  maxScore: number
  status: 'grading' | 'completed'
  submittedAt: string
}

export interface Practice {
  id: string
  studentId: string
  knowledgePointId: string
  mode: 'similar' | 'formula' | 'recall' | 'error'
  question: Question
  completed: boolean
  createdAt: string
}

export interface Database {
  courses: Course[]
  knowledgePoints: KnowledgePoint[]
  materials: Material[]
  questions: Question[]
  assessments: Assessment[]
  students: Student[]
  submissions: Submission[]
  practices: Practice[]
  settings?: {
    network?: {
      hotspotSsid: string
      hotspotPassword: string
      preferredAddress?: string
    }
  }
}

export interface GenerateConfig {
  courseId: string
  knowledgePointIds: string[]
  count: number
  types: QuestionType[]
  difficulty: Difficulty
  source: 'ai' | 'bank' | 'mixed'
}

export interface ClassReport {
  assessment: Assessment
  submittedCount: number
  averageScore: number
  accuracy: number
  scoreDistribution: { label: string; value: number }[]
  knowledgeMastery: { id: string; name: string; value: number }[]
  questionStats: { id: string; index: number; stem: string; accuracy: number; average: number; maxScore: number }[]
  errorTypes: { name: string; value: number }[]
  students: { id: string; name: string; score: number; rate: number; weakPoint: string }[]
  suggestions: string[]
}
