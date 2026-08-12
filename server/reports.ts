import type { Ability, ClassReport, Database, ReportDiagnosis, Submission } from '../shared/types.js'

export function buildClassReport(db: Database, assessmentId: string): ClassReport | null {
  const assessment = db.assessments.find(item => item.id === assessmentId)
  if (!assessment) return null
  const submissions = db.submissions.filter(item => item.assessmentId === assessmentId && item.status === 'completed')
  const questionIds = [...new Set([...assessment.questionIds, ...submissions.flatMap(submission => submission.answers.map(answer => answer.questionId))])]
  const questions = questionIds.map(id => db.questions.find(item => item.id === id)).filter(Boolean) as Database['questions']
  const maxScore = questions.reduce((sum, question) => sum + question.maxScore, 0) || 1
  const averageScore = submissions.length ? submissions.reduce((sum, submission) => sum + submission.totalScore, 0) / submissions.length : 0
  const bins = [
    { label: '0–59', min: 0, max: .6 }, { label: '60–69', min: .6, max: .7 },
    { label: '70–79', min: .7, max: .8 }, { label: '80–89', min: .8, max: .9 }, { label: '90–100', min: .9, max: 1.01 }
  ]
  const scoreDistribution = bins.map(bin => ({
    label: bin.label,
    value: submissions.filter(submission => submission.totalScore / (submission.maxScore || maxScore) >= bin.min && submission.totalScore / (submission.maxScore || maxScore) < bin.max).length
  }))

  const knowledgeMastery = db.knowledgePoints.filter(point => point.courseId === assessment.courseId).map(point => {
    const pointQuestions = questions.filter(question => question.knowledgePointId === point.id)
    const possible = submissions.reduce((sum, submission) => sum + submission.answers
      .filter(answer => pointQuestions.some(question => question.id === answer.questionId))
      .reduce((answerSum, answer) => answerSum + (pointQuestions.find(question => question.id === answer.questionId)?.maxScore || 0), 0), 0)
    const actual = submissions.reduce((sum, submission) => sum + submission.answers.filter(answer => pointQuestions.some(question => question.id === answer.questionId)).reduce((acc, answer) => acc + answer.score, 0), 0)
    return { id: point.id, name: point.name, value: possible ? Math.round(actual / possible * 100) : 0 }
  })

  const questionStats = questions.map((question, index) => {
    const answers = submissions.flatMap(submission => submission.answers.filter(answer => answer.questionId === question.id))
    const average = answers.length ? answers.reduce((sum, answer) => sum + answer.score, 0) / answers.length : 0
    const cleanStem = question.stem.replace(/!\[[^\]]*\]\([^)]+\)\s*/g, '').replace(/\$([^$]+)\$/g, '$1')
    return { id: question.id, index: index + 1, stem: cleanStem, accuracy: answers.length ? Math.round(answers.filter(answer => answer.correct).length / answers.length * 100) : 0, average: Number(average.toFixed(1)), maxScore: question.maxScore }
  })

  const errors = submissions.flatMap(submission => submission.answers.map(answer => answer.diagnosis.errorType).filter(Boolean) as string[])
  const errorTypes = [...new Set(errors)].map(name => ({ name, value: errors.filter(error => error === name).length })).sort((a, b) => b.value - a.value)
  const weakByStudent = (submission: Submission) => {
    const scores = new Map<string, { earned: number; possible: number }>()
    for (const answer of submission.answers) {
      const question = questions.find(item => item.id === answer.questionId)
      if (!question) continue
      const current = scores.get(question.knowledgePointId) || { earned: 0, possible: 0 }
      scores.set(question.knowledgePointId, { earned: current.earned + answer.score, possible: current.possible + question.maxScore })
    }
    const weakId = [...scores].sort((a, b) => a[1].earned / a[1].possible - b[1].earned / b[1].possible)[0]?.[0]
    return db.knowledgePoints.find(point => point.id === weakId)?.name || '暂无'
  }
  const students = submissions.map(submission => ({
    id: submission.studentId,
    name: db.students.find(student => student.id === submission.studentId)?.name || '未知学生',
    score: submission.totalScore,
    rate: Math.round(submission.totalScore / (submission.maxScore || maxScore) * 100),
    weakPoint: weakByStudent(submission)
  })).sort((a, b) => b.score - a.score)
  const weakest = [...knowledgeMastery].sort((a, b) => a.value - b.value)[0]
  const hardest = [...questionStats].sort((a, b) => a.accuracy - b.accuracy)[0]
  const suggestions = submissions.length ? [
    weakest ? `优先回讲“${weakest.name}”，当前班级掌握度为 ${weakest.value}%。` : '继续收集作答数据后生成知识点建议。',
    hardest ? `第 ${hardest.index} 题正确率最低（${hardest.accuracy}%），建议展示两种典型解法并对比错误步骤。` : '',
    students.some(student => student.rate < 60) ? `为 ${students.filter(student => student.rate < 60).map(student => student.name).join('、')} 安排基础概念与公式回忆练习。` : '全班基础表现稳定，可以进入进阶变式。'
  ].filter(Boolean) : ['课堂尚未收到提交，发布检测后将自动形成教学建议。']
  const totalPossible = submissions.reduce((sum, submission) => sum + (submission.maxScore || maxScore), 0)
  const cachedDiagnosis = db.settings?.reportDiagnoses?.[assessmentId]
  const diagnosis: ReportDiagnosis = cachedDiagnosis || {
    summary: submissions.length
      ? `已根据 ${submissions.length} 份作答形成统计。当前最需要关注“${weakest?.name || '待继续观察'}”，建议结合逐题正确率安排回讲。`
      : '课堂尚未收到作答，暂时无法形成可靠的班级诊断。',
    suggestions,
    updatedAt: assessment.publishedAt || assessment.createdAt,
    source: 'fallback'
  }

  return {
    assessment, submittedCount: submissions.length, averageScore: Number(averageScore.toFixed(1)),
    accuracy: totalPossible ? Math.round(submissions.reduce((sum, submission) => sum + submission.totalScore, 0) / totalPossible * 100) : 0,
    scoreDistribution, knowledgeMastery, questionStats, errorTypes, students, suggestions: diagnosis.suggestions, diagnosis
  }
}

export function buildStudentProfile(db: Database, studentId: string) {
  const student = db.students.find(item => item.id === studentId)
  if (!student) return null
  const submissions = db.submissions.filter(item => item.studentId === studentId && item.status === 'completed').sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  const knowledge = new Map<string, { earned: number; possible: number }>()
  const ability = new Map<Ability, number[]>()
  const errorTypes: string[] = []
  for (const submission of submissions) {
    for (const answer of submission.answers) {
      const question = db.questions.find(item => item.id === answer.questionId)
      if (!question) continue
      const current = knowledge.get(question.knowledgePointId) || { earned: 0, possible: 0 }
      knowledge.set(question.knowledgePointId, { earned: current.earned + answer.score, possible: current.possible + question.maxScore })
      for (const [key, value] of Object.entries(answer.diagnosis.abilityScores)) {
        const values = ability.get(key as Ability) || []
        values.push(value || 0)
        ability.set(key as Ability, values)
      }
      if (answer.diagnosis.errorType) errorTypes.push(answer.diagnosis.errorType)
    }
  }
  const mastery = [...knowledge].map(([id, value]) => ({ id, name: db.knowledgePoints.find(point => point.id === id)?.name || '未知', value: Math.round(value.earned / value.possible * 100) }))
  const abilities = [...ability].map(([name, values]) => ({ name, value: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) }))
  const classroom = submissions.filter(submission => db.assessments.find(item => item.id === submission.assessmentId)?.category === 'classroom')
  const homework = submissions.filter(submission => db.assessments.find(item => item.id === submission.assessmentId)?.category === 'homework')
  const history = Array.from({ length: Math.max(classroom.length, homework.length) }, (_, index) => ({
    name: `第 ${index + 1} 次`,
    classroom: classroom[index] ? Math.round(classroom[index].totalScore / classroom[index].maxScore * 100) : undefined,
    homework: homework[index] ? Math.round(homework[index].totalScore / homework[index].maxScore * 100) : undefined,
    date: classroom[index]?.submittedAt || homework[index]?.submittedAt || ''
  }))
  const ranking = buildStudentRanking(db)
  const score = ranking.find(item => item.id === studentId) || { classroomAverage: 0, homeworkAverage: 0, weightedScore: 0, rank: ranking.length }
  const strongest = [...mastery].sort((a, b) => b.value - a.value)[0]
  const weakest = [...mastery].sort((a, b) => a.value - b.value)[0]
  return {
    student, submissions: submissions.length, mastery, abilities, history,
    classroomAverage: score.classroomAverage,
    homeworkAverage: score.homeworkAverage,
    weightedScore: score.weightedScore,
    rank: score.rank,
    totalStudents: ranking.length,
    errorTypes: [...new Set(errorTypes)].map(name => ({ name, value: errorTypes.filter(item => item === name).length })),
    summary: submissions.length ? `${student.name}在“${strongest?.name || '当前内容'}”上表现较稳定；“${weakest?.name || '当前内容'}”仍需加强。建议采用概念回忆—例题复述—同类变式的短周期练习。` : '暂无完整作答记录，完成课堂检测后将形成学习画像。'
  }
}

export function buildStudentRanking(db: Database) {
  const rows = db.students.map(student => {
    const completed = db.submissions.filter(item => item.studentId === student.id && item.status === 'completed')
    const averageFor = (category: 'classroom' | 'homework') => {
      const values = completed.filter(submission => db.assessments.find(item => item.id === submission.assessmentId)?.category === category)
        .map(submission => submission.maxScore ? submission.totalScore / submission.maxScore * 100 : 0)
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
    }
    const classroomAverage = averageFor('classroom')
    const homeworkAverage = averageFor('homework')
    return {
      id: student.id,
      submissionCount: completed.length,
      classroomAverage: Number(classroomAverage.toFixed(1)),
      homeworkAverage: Number(homeworkAverage.toFixed(1)),
      weightedScore: Number((classroomAverage * .3 + homeworkAverage * .7).toFixed(1)),
      rank: 0
    }
  }).sort((a, b) => b.weightedScore - a.weightedScore || b.homeworkAverage - a.homeworkAverage)
  rows.forEach((row, index) => { row.rank = index + 1 })
  return rows
}
