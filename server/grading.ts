import type { AnswerResult, Diagnosis, Question } from '../shared/types.js'
import { normalizeAnswer } from './utils.js'

function objectiveCorrect(question: Question, answer: string | string[]) {
  const expected = Array.isArray(question.answer) ? [...question.answer].sort() : question.answer
  const actual = Array.isArray(answer) ? [...answer].sort() : answer
  return normalizeAnswer(expected) === normalizeAnswer(actual)
}

export function programGrade(question: Question, answer: string | string[]): AnswerResult | null {
  if (question.type === 'short') return null
  const correct = objectiveCorrect(question, answer)
  const relatedConcept = question.formula || question.explanation
  const diagnosis: Diagnosis = correct ? {
    summary: '答案正确，当前知识点掌握稳定。',
    suggestion: '可以继续完成一道进阶变式题，检验迁移能力。',
    relatedConcept,
    abilityScores: Object.fromEntries(question.abilities.map(ability => [ability, 92]))
  } : {
    summary: '答案与标准结论不一致，需要回到关键概念检查判断过程。',
    errorLocation: question.type === 'blank' ? '代入或计算结果' : '选项判断',
    errorReason: question.type === 'blank' ? '代入后计算或符号处理不准确。' : '没有准确使用题干中的关键条件。',
    errorType: question.type === 'blank' ? '计算失误' : '概念混淆',
    suggestion: '先遮住答案复述相关公式或概念，再重新完成本题。',
    relatedConcept,
    abilityScores: Object.fromEntries(question.abilities.map(ability => [ability, 45]))
  }
  return { questionId: question.id, answer, score: correct ? question.maxScore : 0, correct, diagnosis }
}

export function heuristicSubjectiveGrade(question: Question, answer: string | string[]): AnswerResult {
  const actual = normalizeAnswer(answer)
  const expected = normalizeAnswer(question.answer)
  const expectedParts = expected.split(/[；;|]/).filter(Boolean)
  const overlap = expectedParts.length ? expectedParts.filter(part => actual.includes(part) || part.includes(actual)).length / expectedParts.length : 0
  const formulaTokens = expected.match(/-?\d+|[a-z]+/g) || []
  const tokenOverlap = formulaTokens.length ? formulaTokens.filter(token => actual.includes(token)).length / formulaTokens.length : 0
  const rate = Math.min(1, Math.max(overlap, tokenOverlap * .85, actual === expected ? 1 : 0))
  const score = Math.round(question.maxScore * rate)
  const correct = score >= question.maxScore * .85
  return {
    questionId: question.id,
    answer,
    score,
    correct,
    diagnosis: {
      summary: correct ? '主要思路和结论完整，表达基本准确。' : score > 0 ? '已抓住部分关键步骤，但过程或结论还不完整。' : '当前答案尚未体现有效的解题步骤。',
      errorLocation: correct ? undefined : '关键推导步骤或最终结论',
      errorReason: correct ? undefined : '答案中的关键条件、计算过程或结论缺失。',
      errorType: correct ? undefined : score > 0 ? '步骤不完整' : '思路缺失',
      suggestion: correct ? '尝试用更简洁的语言说明依据。' : '对照评分要点逐项补全：已知条件、列式、计算和结论。',
      relatedConcept: question.formula || question.explanation,
      abilityScores: Object.fromEntries(question.abilities.map(ability => [ability, correct ? 88 : Math.max(35, Math.round(rate * 80))]))
    }
  }
}
