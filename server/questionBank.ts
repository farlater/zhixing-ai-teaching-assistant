import type { GenerateConfig, Question } from '../shared/types.js'

export interface QuestionBankProvider {
  search(config: GenerateConfig): Promise<Question[]>
}

class EmptyQuestionBank implements QuestionBankProvider {
  async search(): Promise<Question[]> {
    return []
  }
}

// 将来接入校本题库或第三方题库时只需替换这一实现，出题流程与页面无需改变。
export const questionBank: QuestionBankProvider = new EmptyQuestionBank()
