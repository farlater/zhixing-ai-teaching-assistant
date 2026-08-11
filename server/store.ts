import fs from 'node:fs'
import path from 'node:path'
import type { AnswerResult, Database, Question, Student, Submission } from '../shared/types.js'

const DATA_DIR = path.resolve('data')
const DB_PATH = path.join(DATA_DIR, 'db.json')

const now = () => new Date().toISOString()

const demoNames = [
  '林浩然', '陈雨桐', '周子轩', '王若溪', '赵思远', '沈嘉禾', '李欣妍', '张宇航', '刘诗涵', '杨博文',
  '黄可欣', '吴俊杰', '徐梦琪', '孙泽宇', '胡雅雯', '朱浩铭', '高语彤', '何景行', '郭依诺', '马睿哲',
  '罗思琪', '梁嘉佑', '宋梓涵', '郑皓轩', '谢雨菲', '韩明宇', '唐佳宁', '冯奕辰', '董心悦', '萧承泽',
  '程婉清', '曹昊天', '袁舒涵', '邓子墨', '许安然', '傅一鸣', '彭若琳', '曾星宇', '苏语嫣', '卢俊熙',
  '蒋思源', '蔡佳琪', '魏景铄', '叶芷晴', '潘宇晨', '杜梦瑶', '戴梓睿', '夏可心', '钟皓然', '汪诗雅',
  '田嘉树', '任欣怡', '姜明轩', '范雨萱', '石博雅', '陆泽言', '龚思涵', '邹奕帆', '白清越', '陈思远'
]

function demoDiagnosis(correct: boolean, question: Question, index: number) {
  const isDirection = question.knowledgePointId.includes('direction')
  const isStructure = question.knowledgePointId.includes('structure')
  const errors = isStructure ? ['杆组识别错误', '拆分顺序错误', '机构级别判断错误', '自由度计算失误'] : ['概念混淆', '公式应用错误', '转向判断错误', '计算失误']
  return {
    summary: correct ? '判断准确，能够把机构简图与核心规律对应起来。' : '已经识别出题目中的主要构件，但关键判断仍有偏差。',
    errorLocation: correct ? undefined : isStructure ? '基本杆组拆分或机构级别判定' : isDirection ? '首末轮转向判断' : '公式选择或参数代入',
    errorReason: correct ? undefined : isStructure ? '没有先明确原动件，或未从传动路径远端开始拆分。' : isDirection ? '没有逐级传递箭头方向。' : '未先确定极位夹角或传动路线。',
    errorType: correct ? undefined : errors[index % errors.length],
    suggestion: correct ? '继续完成一道工程情境变式题。' : isStructure ? '先圈出原动件与机架，再从远端依次拆出基本杆组。' : '先在图上标出运动方向和已知量，再代入对应公式。',
    relatedConcept: question.formula || (isStructure ? '基本杆组与机构结构分析' : '机构简图与运动关系'),
    abilityScores: Object.fromEntries(question.abilities.map(ability => [ability, correct ? 90 + index % 8 : 48 + index % 18]))
  }
}

function simulatedSubmission(studentId: string, assessmentId: string, questions: Question[], studentIndex: number, targetRates: number[], createdAt: string): Submission {
  const answers: AnswerResult[] = questions.map((question, questionIndex) => {
    const courseOffset = assessmentId.includes('gear') ? 11 : assessmentId.includes('structure') ? 23 : 3
    const correct = ((studentIndex * 37 + questionIndex * 19 + courseOffset) % 100) < targetRates[questionIndex]
    const wrongScore = [0, 4, 6][(studentIndex + questionIndex) % 3]
    const answer = correct ? question.answer : ['A', 'B', 'D'].find(value => value !== question.answer) || 'A'
    return { questionId: question.id, answer, score: correct ? question.maxScore : wrongScore, correct, diagnosis: demoDiagnosis(correct, question, studentIndex + questionIndex) }
  })
  return {
    id: `submission-${assessmentId}-${studentId}`, assessmentId, studentId, answers,
    totalScore: answers.reduce((sum, answer) => sum + answer.score, 0),
    maxScore: questions.reduce((sum, question) => sum + question.maxScore, 0), status: 'completed', submittedAt: createdAt
  }
}

function seed(): Database {
  const createdAt = now()
  const fourbarQuestions: Question[] = [
    { id: 'q-fourbar-1', courseId: 'course-fourbar', knowledgePointId: 'kp-fourbar-k', type: 'single', difficulty: '基础', stem: '![曲柄摇杆机构极位示意图](/question-assets/fourbar-angle.svg)\n\n图示机构的极位夹角 $\\theta=30°$，其行程速比系数 $K$ 最接近下列哪一项？', options: ['1.00', '1.20', '1.40', '1.67'], answer: 'C', explanation: '$K=(180°+30°)/(180°-30°)=210/150=1.40$。', formula: 'K = (180° + θ) / (180° - θ)', maxScore: 10, abilities: ['公式掌握', '计算'], source: 'manual', status: 'confirmed', createdAt },
    { id: 'q-fourbar-2', courseId: 'course-fourbar', knowledgePointId: 'kp-fourbar-judge', type: 'single', difficulty: '进阶', stem: '![对心与偏置曲柄滑块机构](/question-assets/fourbar-slider.svg)\n\n关于图中两种曲柄滑块机构的急回特性，判断正确的是？', options: ['Ⅰ无急回，Ⅱ有急回', 'Ⅰ有急回，Ⅱ无急回', '两者均有急回', '两者均无急回'], answer: 'A', explanation: '对心曲柄滑块机构 $θ=0°$，$K=1$；偏置后一般 $θ>0°$，具有急回特性。', formula: 'θ > 0° ⇒ K > 1', maxScore: 10, abilities: ['概念理解', '推理'], source: 'manual', status: 'confirmed', createdAt },
    { id: 'q-fourbar-3', courseId: 'course-fourbar', knowledgePointId: 'kp-fourbar-extreme', type: 'single', difficulty: '进阶', stem: '![摆动导杆机构极限位置](/question-assets/fourbar-guide.svg)\n\n图示摆动导杆机构的摆角 $\\psi=40°$。若 $\\theta=\\psi$，行程速比系数 $K$ 约为？', options: ['1.29', '1.57', '1.80', '2.00'], answer: 'B', explanation: '$K=(180°+40°)/(180°-40°)=220/140≈1.57$。', formula: '摆动导杆机构中 θ = ψ', maxScore: 10, abilities: ['公式应用', '计算'], source: 'manual', status: 'confirmed', createdAt }
  ]
  const gearQuestions: Question[] = [
    { id: 'q-gear-1', courseId: 'course-gear', knowledgePointId: 'kp-gear-ratio', type: 'single', difficulty: '进阶', stem: '![两级定轴轮系](/question-assets/gear-compound.svg)\n\n齿轮 2 与齿轮 3 同轴固定。图示轮系的传动比 $i_{14}=\\omega_1/\\omega_4$ 为多少？', options: ['3', '4', '6', '9'], answer: 'C', explanation: '$i_{14}=(z_2/z_1)(z_4/z_3)=(40/20)×(45/15)=6$。', formula: 'i₁₄ = (z₂z₄)/(z₁z₃)', maxScore: 10, abilities: ['公式应用', '计算'], source: 'manual', status: 'confirmed', createdAt },
    { id: 'q-gear-2', courseId: 'course-gear', knowledgePointId: 'kp-gear-idler', type: 'single', difficulty: '基础', stem: '![含惰轮的定轴轮系](/question-assets/gear-idler.svg)\n\n图中齿轮 2 为惰轮。关于 $i_{13}$ 的大小和齿轮 1、3 的转向，正确的是？', options: ['$i_{13}=1.75$，转向相反', '$i_{13}=3$，转向相反', '$i_{13}=1.75$，转向相同', '$i_{13}=3$，转向相同'], answer: 'D', explanation: '惰轮齿数不影响总传动比大小，$i_{13}=z_3/z_1=60/20=3$；两次外啮合，首末轮转向相同。', formula: '惰轮只改变传递方向，不改变总传动比大小', maxScore: 10, abilities: ['概念理解', '推理'], source: 'manual', status: 'confirmed', createdAt },
    { id: 'q-gear-3', courseId: 'course-gear', knowledgePointId: 'kp-gear-direction', type: 'single', difficulty: '进阶', stem: '![空间定轴轮系箭头法](/question-assets/gear-spatial.svg)\n\n判断空间定轴轮系首、末轮转向时，最稳妥的方法是？', options: ['只数外啮合次数', '沿传动路线逐级标注箭头', '只比较首末轮齿数', '统一按相反方向处理'], answer: 'B', explanation: '空间轮系各轴不平行，不能只用 $(-1)^m$；应使用箭头法逐级判断。', formula: '空间定轴轮系：箭头法', maxScore: 10, abilities: ['概念理解', '推理'], source: 'manual', status: 'confirmed', createdAt }
  ]
  const structureQuestions: Question[] = [
    { id: 'q-structure-1', courseId: 'course-structure', knowledgePointId: 'kp-structure-dyad', type: 'single', difficulty: '基础', stem: '![两件三副基本杆组](/question-assets/structure-dyad.svg)\n\n图示构件组有 $n=2$ 个活动构件、$P_L=3$ 个低副，且不能继续拆分。该基本杆组属于哪一级？', options: ['Ⅰ级组', 'Ⅱ级组', 'Ⅲ级组', 'Ⅳ级组'], answer: 'B', explanation: '$F=3n-2P_L=3×2-2×3=0$，两件三副的基本杆组为Ⅱ级组。', formula: 'F = 3n − 2Pₗ = 0', maxScore: 10, abilities: ['概念理解', '公式应用'], source: 'manual', status: 'confirmed', createdAt },
    { id: 'q-structure-2', courseId: 'course-structure', knowledgePointId: 'kp-structure-level', type: 'single', difficulty: '基础', stem: '![机构级别按最高基本杆组确定](/question-assets/structure-level.svg)\n\n某平面机构除机架和原动件外，既含Ⅱ级组又含Ⅲ级组。该机构应判定为？', options: ['Ⅰ级机构', 'Ⅱ级机构', 'Ⅲ级机构', 'Ⅳ级机构'], answer: 'C', explanation: '平面机构的级别按机构中所含基本杆组的最高级别命名，因此为Ⅲ级机构。', formula: '机构级别 = 所含基本杆组的最高级别', maxScore: 10, abilities: ['概念理解', '推理'], source: 'manual', status: 'confirmed', createdAt },
    { id: 'q-structure-3', courseId: 'course-structure', knowledgePointId: 'kp-structure-analysis', type: 'single', difficulty: '进阶', stem: '![同一机构采用不同原动件](/question-assets/structure-driver.svg)\n\n对图示双缸机构进行结构分析。分别以构件 AB、EG 为原动件时，机构级别的正确组合是？', options: ['AB：Ⅰ级；EG：Ⅱ级', 'AB：Ⅲ级；EG：Ⅱ级', '两种情况均为Ⅱ级', 'AB：Ⅱ级；EG：Ⅲ级'], answer: 'D', explanation: '以 AB 为原动件时可依次拆出Ⅱ级组，机构为Ⅱ级；以 EG 为原动件时拆分中出现Ⅲ级组，机构为Ⅲ级。', formula: '先明确原动件，再从传动路径远端拆组', maxScore: 10, abilities: ['推理', '表达'], source: 'manual', status: 'confirmed', createdAt }
  ]
  const students: Student[] = demoNames.map((name, index) => ({ id: index === 59 ? 'demo-live-student' : `demo-student-${String(index + 1).padStart(2, '0')}`, name, className: '23级机械设计1班', studentNo: `2023${String(index + 1).padStart(3, '0')}`, createdAt }))
  const submissions = students.flatMap((student, index) => [
    simulatedSubmission(student.id, 'assessment-fourbar', fourbarQuestions, index, [82, 68, 74], createdAt),
    simulatedSubmission(student.id, 'assessment-gear', gearQuestions, index, [76, 71, 63], createdAt),
    simulatedSubmission(student.id, 'assessment-structure', structureQuestions, index, [84, 73, 61], createdAt)
  ])

  return {
    courses: [
      { id: 'course-fourbar', name: '平面四杆机构的急回特性', subject: '机械原理', grade: '高职机械类', description: '判断机构是否具有急回特性，确定极位夹角并计算行程速比系数。', color: '#275d56', createdAt },
      { id: 'course-gear', name: '定轴轮系的传动比', subject: '机械原理', grade: '高职机械类', description: '计算定轴轮系传动比，并使用箭头法判断首末轮转向。', color: '#9b6b46', createdAt },
      { id: 'course-structure', name: '平面机构的组成与结构分析', subject: '机械原理', grade: '高职机械类', description: '识别基本杆组，判断机构级别，并完成平面机构的结构分析。', color: '#6a5b8b', createdAt }
    ],
    knowledgePoints: [
      { id: 'kp-fourbar-extreme', courseId: 'course-fourbar', name: '极位与极位夹角', description: '从动件位于两个极限位置时确定主动曲柄之间的锐角。', formula: '极位夹角 θ', createdAt },
      { id: 'kp-fourbar-k', courseId: 'course-fourbar', name: '行程速比系数', description: '利用极位夹角衡量急回程度。', formula: 'K=(180°+θ)/(180°-θ)', createdAt },
      { id: 'kp-fourbar-judge', courseId: 'course-fourbar', name: '急回特性判断', description: 'θ>0° 时 K>1，机构具有急回特性。', formula: 'θ>0° ⇒ K>1', createdAt },
      { id: 'kp-gear-ratio', courseId: 'course-gear', name: '传动比大小计算', description: '从输入轮到输出轮逐级连乘并约去中间轮角速度。', formula: 'iAB=ωA/ωB', createdAt },
      { id: 'kp-gear-idler', courseId: 'course-gear', name: '惰轮作用', description: '惰轮影响转向与布置，不影响总传动比大小。', formula: '中间惰轮齿数在连乘中约去', createdAt },
      { id: 'kp-gear-direction', courseId: 'course-gear', name: '首末轮转向判断', description: '平面轮系可数外啮合次数，空间轮系采用箭头法。', formula: '平面：(-1)^m；空间：箭头法', createdAt },
      { id: 'kp-structure-dyad', courseId: 'course-structure', name: '基本杆组识别', description: '最简单的、不能继续拆分且自由度为 0 的构件组称为基本杆组。', formula: 'F=3n-2Pₗ=0', createdAt },
      { id: 'kp-structure-level', courseId: 'course-structure', name: '机构级别判定', description: '机构按所含基本杆组的最高级别命名。', formula: '机构级别=最高基本杆组级别', createdAt },
      { id: 'kp-structure-analysis', courseId: 'course-structure', name: '机构结构分析', description: '明确原动件，从传动路径远端先拆Ⅱ级组、再拆Ⅲ级组。', formula: '自由度计算→明确原动件→拆组→定级', createdAt }
    ],
    materials: [
      { id: 'material-fourbar-demo', courseId: 'course-fourbar', name: '§8-3 平面四杆机构的急回特性（课件摘要）', type: 'application/vnd.ms-powerpoint', size: 3156992, extractedText: '急回特性是从动件返回行程平均速度大于工作行程平均速度的特性。极位夹角为从动件处于两极限位置时两曲柄所夹锐角。K=(180°+θ)/(180°-θ)，θ越大，急回越明显。', parser: 'builtin', status: 'ready', createdAt },
      { id: 'material-gear-demo', courseId: 'course-gear', name: '§11-2 定轴轮系的传动比（课件摘要）', type: 'application/vnd.ms-powerpoint', size: 19553792, extractedText: '定轴轮系所有齿轮轴线位置固定。传动比等于输入轮与输出轮角速度之比。平面轮系可依据外啮合次数判断方向，空间轮系使用箭头法。', parser: 'builtin', status: 'ready', createdAt },
      { id: 'material-structure-demo', courseId: 'course-structure', name: '§2-7 平面机构的组成原理、结构分类及结构分析（课件摘要）', type: 'application/vnd.ms-powerpoint', size: 3041280, extractedText: '任何机构都由原动件、机架和若干基本杆组构成。基本杆组是最简单的、不能继续拆分且自由度为0的构件组。机构按所含基本杆组的最高级别命名。结构分析时先明确原动件，再从传动路径远端拆分杆组。', parser: 'builtin', status: 'ready', createdAt }
    ],
    questions: [...fourbarQuestions, ...gearQuestions, ...structureQuestions],
    assessments: [
      { id: 'assessment-fourbar', courseId: 'course-fourbar', title: '急回特性 · 课堂即时诊断', description: '3 道图示题，检测极位夹角、行程速比系数与机构判断。', joinCode: 'JH083', questionIds: fourbarQuestions.map(question => question.id), status: 'published', timeLimit: 6, publishedAt: createdAt, createdAt },
      { id: 'assessment-gear', courseId: 'course-gear', title: '定轴轮系 · 课堂即时诊断', description: '3 道图示题，检测传动比计算、惰轮作用与转向判断。', joinCode: 'LX112', questionIds: gearQuestions.map(question => question.id), status: 'published', timeLimit: 6, publishedAt: createdAt, createdAt },
      { id: 'assessment-structure', courseId: 'course-structure', title: '平面机构结构分析 · 课堂即时诊断', description: '3 道图示题，检测基本杆组、机构级别与拆组分析。', joinCode: 'JG027', questionIds: structureQuestions.map(question => question.id), status: 'published', timeLimit: 6, publishedAt: createdAt, createdAt }
    ],
    students, submissions, practices: [],
    settings: { demoShowcase: true, demoSeedVersion: 2, network: { hotspotSsid: 'AI-Classroom', hotspotPassword: '12345678', preferredAddress: '' } }
  }
}

export class JsonStore {
  private data: Database

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    if (fs.existsSync(DB_PATH)) {
      try {
        this.data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as Database
        if (!this.data.settings?.demoShowcase || this.data.settings.demoSeedVersion !== 2) {
          this.data = seed()
          this.save()
        }
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
