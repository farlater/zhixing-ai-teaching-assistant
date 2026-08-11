import fs from 'node:fs'
import path from 'node:path'
import type { AnswerResult, Database, Diagnosis, Question, Student, Submission } from '../shared/types.js'

const DATA_DIR = path.resolve('data')
const DB_PATH = path.join(DATA_DIR, 'db.json')

const now = () => new Date().toISOString()

const showcaseNames = [
  '陈子轩', '林嘉怡', '周宇航', '许思远', '黄可欣', '吴俊杰', '赵一诺', '孙浩然', '徐若曦', '朱嘉诚',
  '胡欣妍', '郭子涵', '何明轩', '高雨桐', '罗梓豪', '郑语彤', '梁博文', '谢安然', '宋承泽', '唐诗涵',
  '韩景行', '冯佳琪', '曹睿哲', '彭晓彤', '曾奕辰', '肖梦洁', '田昊宇', '董思琪', '袁泽楷', '潘雅雯',
  '于皓轩', '蒋依琳', '蔡文昊', '杜欣怡', '叶嘉佑', '程雨欣', '苏奕鸣', '魏佳宁', '吕星宇', '丁若涵',
  '任梓晨', '沈书瑶', '姚俊熙', '卢心怡', '邓宇辰', '钟婉清', '范景尧', '金诗悦', '石浩铭', '廖芷晴',
  '邱泽宇', '熊语嫣', '孟嘉树', '贺安琪', '白宇泽', '秦舒涵', '江辰皓', '尹可心', '薛嘉言', '段思妍'
]

function diagnosisFor(correct: boolean, summary: string, errorType: string, suggestion: string, concept: string, abilityScores: Diagnosis['abilityScores']): Diagnosis {
  return {
    summary: correct ? '作答正确，相关概念与判断依据较完整。' : summary,
    errorLocation: correct ? undefined : summary,
    errorReason: correct ? undefined : `对“${concept}”的判定条件掌握不够稳定。`,
    errorType: correct ? undefined : errorType,
    suggestion: correct ? '继续通过变式题巩固，并尝试用规范术语说明判断依据。' : suggestion,
    relatedConcept: concept,
    abilityScores
  }
}

function createShowcaseData(createdAt: string): { students: Student[]; submissions: Submission[] } {
  const students = showcaseNames.map((name, index): Student => ({
    id: `demo-student-${String(index + 1).padStart(2, '0')}`,
    name,
    studentNo: `202301${String(index + 1).padStart(2, '0')}`,
    className: '机械2301班',
    createdAt
  }))
  const submissions = students.map((student, index): Submission => {
    const skill = (index * 37 + 23) % 100
    const q1 = skill >= 16
    const q2 = skill >= 34
    const q3 = skill >= 47
    const photoScore = skill >= 88 ? 16 : skill >= 74 ? 14 : skill >= 58 ? 12 : skill >= 42 ? 10 : skill >= 26 ? 7 : 4
    const answers: AnswerResult[] = [
      {
        questionId: 'q-structure-1', answer: q1 ? 'B' : index % 2 ? 'A' : 'C', score: q1 ? 10 : 0, correct: q1,
        diagnosis: diagnosisFor(q1, '基本杆组定义判断错误', '概念混淆', '结合 F=3n-2Pₗ=0，重新辨析“自由度为0且不可再拆”的定义。', '基本杆组识别', { 概念理解: q1 ? 92 : 48, 公式应用: q1 ? 88 : 55 })
      },
      {
        questionId: 'q-structure-2', answer: q2 ? 'C' : index % 3 ? 'B' : 'D', score: q2 ? 10 : 0, correct: q2,
        diagnosis: diagnosisFor(q2, '杆组级别判定环节出错', '级别判定错误', '先确认四构件六低副，再依据三副构件判断为Ⅲ级杆组。', '机构级别判定', { 概念理解: q2 ? 90 : 46, 公式应用: q2 ? 86 : 52 })
      },
      {
        questionId: 'q-structure-3', answer: q3 ? 'C' : index % 2 ? 'B' : 'D', score: q3 ? 10 : 0, correct: q3,
        diagnosis: diagnosisFor(q3, '更换原动件后的机构定级错误', '原动件变化分析错误', '分别标出两种原动件下可拆出的最高级杆组，再据此确定机构级别。', '机构结构分析', { 推理: q3 ? 91 : 43, 表达: q3 ? 86 : 58 })
      },
      {
        questionId: 'q-structure-photo',
        answer: photoScore >= 14
          ? '滚子的自转属于局部自由度，左侧同一移动构件上的重复导路形成虚约束，右侧同轴处为复合铰链。去除局部自由度并扣除虚约束后，用 F=3n-2P_L-P_H 计算得 F=1；原动件数等于自由度时机构具有确定运动。高副低代时在两构件接触点公法线上引入一个虚拟构件和两个转动副。'
          : '写出 F=3n-2P_L-P_H，并判断自由度为1；图中滚子处需要特殊处理，高副可用低副替代。',
        extractedText: photoScore >= 14 ? '手写过程识别：指出局部自由度、虚约束和复合铰链；F=1；原动件数应等于自由度；画出两处高副低代。' : '手写过程识别：写出自由度公式与F=1，特殊结构辨识和高副低代步骤不完整。',
        score: photoScore,
        correct: photoScore >= 15,
        diagnosis: diagnosisFor(photoScore >= 15, photoScore >= 12 ? '特殊结构辨识或高副低代说明不完整' : '自由度修正项存在缺漏', photoScore >= 12 ? '表达不完整' : '自由度计算疏漏', '按“标特殊结构—列修正后的自由度式—判断确定运动条件—完成两处高副低代”四步重新书写。', '自由度计算与高副低代', { 公式应用: Math.min(96, 54 + photoScore * 2.5), 推理: Math.min(94, 44 + photoScore * 2.7), 表达: Math.min(92, 40 + photoScore * 2.5) })
      }
    ]
    return {
      id: `demo-submission-${String(index + 1).padStart(2, '0')}`,
      assessmentId: 'assessment-structure',
      studentId: student.id,
      answers,
      totalScore: answers.reduce((sum, answer) => sum + answer.score, 0),
      maxScore: 46,
      status: 'completed',
      submittedAt: new Date(new Date(createdAt).getTime() + index * 27000).toISOString()
    }
  })
  return { students, submissions }
}

function applyShowcaseData(db: Database, createdAt = now()) {
  const showcase = createShowcaseData(createdAt)
  db.students = showcase.students
  db.submissions = showcase.submissions
  db.practices = []
  const structureAssessment = db.assessments.find(item => item.id === 'assessment-structure')
  if (structureAssessment) {
    structureAssessment.questionIds = ['q-structure-1', 'q-structure-2', 'q-structure-3', 'q-structure-photo']
    structureAssessment.description = '4 道图示题，包含 1 道可拍照提交的综合分析题。'
  }
  db.settings = {
    ...db.settings,
    demoShowcase: true,
    demoSeedVersion: 7,
    reportDiagnoses: {
      ...(db.settings?.reportDiagnoses || {}),
      'assessment-structure': {
        summary: '班级对基本杆组的定义掌握较稳，但在复杂机构中同时识别复合铰链、局部自由度和虚约束时出现明显分化。综合题失分主要集中在自由度修正项遗漏，以及高副低代时没有说明接触点公法线和瞬时等效原则。',
        suggestions: [
          '在江苏大学样题机构图上用三种颜色分别标出复合铰链、局部自由度和虚约束，再让学生说明每一项如何影响运动副计数。',
          '回讲 $F=3n-2P_L-P_H$ 及修正项的使用顺序，并用“先标特殊结构、再数构件和运动副、最后代入”的检查表减少漏项。',
          '对低于60分的学生安排公式默写和一处高副低代填图；中高分学生完成含两个高副的变式题，课堂结束前用1道限时题复测。'
        ],
        updatedAt: createdAt,
        source: 'preset'
      }
    }
  }
}

function seed(): Database {
  const createdAt = now()
  const fourbarQuestions: Question[] = [
    { id: 'q-fourbar-1', courseId: 'course-fourbar', knowledgePointId: 'kp-fourbar-k', type: 'single', difficulty: '基础', stem: '![插齿机急回机构（江苏大学机械原理样题）](/question-assets/source-fourbar-quick-return.png)\n\n图示插齿机构的行程速比系数 $K=1.5$，其极位夹角 $\\theta$ 为多少？', options: ['18°', '30°', '36°', '45°'], answer: 'C', explanation: '$\\theta=180°(K-1)/(K+1)=180°×0.5/2.5=36°$。题图取自江苏大学 803《机械原理》样题。', formula: 'θ = 180°(K−1)/(K+1)', maxScore: 10, abilities: ['公式掌握', '计算'], source: 'bank', status: 'confirmed', createdAt },
    { id: 'q-fourbar-2', courseId: 'course-fourbar', knowledgePointId: 'kp-fourbar-extreme', type: 'single', difficulty: '进阶', stem: '![插齿机急回机构（江苏大学机械原理样题）](/question-assets/source-fourbar-quick-return.png)\n\n已知图中 $l_{AC}=200\\,\\text{mm}$、$K=1.5$。按摆动导杆机构的极位几何关系，曲柄 $AB$ 的长度最接近？', options: ['31.0 mm', '61.8 mm', '95.5 mm', '123.6 mm'], answer: 'B', explanation: '先得 $\\theta=36°$，再由 $l_{AB}=l_{AC}\\sin(\\theta/2)$，得 $200\\sin18°≈61.8\\,\\text{mm}$。题图取自江苏大学 803《机械原理》样题。', formula: 'lAB = lAC·sin(θ/2)', maxScore: 10, abilities: ['公式应用', '计算'], source: 'bank', status: 'confirmed', createdAt },
    { id: 'q-fourbar-3', courseId: 'course-fourbar', knowledgePointId: 'kp-fourbar-judge', type: 'single', difficulty: '进阶', stem: '![插齿机急回机构（江苏大学机械原理样题）](/question-assets/source-fourbar-quick-return.png)\n\n图示机构 $K=1.5$，插刀行程 $H=60\\,\\text{mm}$。若扇形齿轮转过的角度等于摆角 $\\theta$，其节圆半径 $R$ 最接近？', options: ['47.7 mm', '60.0 mm', '95.5 mm', '120.0 mm'], answer: 'C', explanation: '$\\theta=36°=\\pi/5\\,\\text{rad}$，齿条行程 $H=R\\theta$，故 $R=60/(\\pi/5)≈95.5\\,\\text{mm}$。题图取自江苏大学 803《机械原理》样题。', formula: 'H = Rθ（θ 用弧度）', maxScore: 10, abilities: ['公式应用', '计算'], source: 'bank', status: 'confirmed', createdAt }
  ]
  const gearQuestions: Question[] = [
    { id: 'q-gear-1', courseId: 'course-gear', knowledgePointId: 'kp-gear-ratio', type: 'single', difficulty: '基础', stem: '![含蜗杆的多级定轴轮系（江苏大学机械原理样题）](/question-assets/source-gear-train.png)\n\n图示轮系中各齿轮的回转轴线位置不随运动改变。该轮系按轴线位置应归为？', options: ['定轴轮系', '行星轮系', '差动轮系', '复合周转轮系'], answer: 'A', explanation: '定轴轮系的各齿轮回转轴线位置固定。题图取自江苏大学 803《机械原理》样题。', formula: '定轴轮系：各齿轮轴线位置固定', maxScore: 10, abilities: ['概念理解'], source: 'bank', status: 'confirmed', createdAt },
    { id: 'q-gear-2', courseId: 'course-gear', knowledgePointId: 'kp-gear-direction', type: 'single', difficulty: '进阶', stem: '![含蜗杆的多级定轴轮系（江苏大学机械原理样题）](/question-assets/source-gear-train.png)\n\n图示传动同时包含左旋蜗杆和空间布置的多级齿轮。判断轴 $B$ 转向时，最可靠的方法是？', options: ['只数外啮合次数', '沿传动路线逐级用箭头判向', '只比较首末轮齿数', '默认与蜗杆转向相反'], answer: 'B', explanation: '空间轮系不能只用平面轮系的 $(-1)^m$。应先按左旋蜗杆啮合关系定出下一轮方向，再沿每一级传动逐级标注箭头。题图取自江苏大学 803《机械原理》样题。', formula: '空间定轴轮系：箭头法', maxScore: 10, abilities: ['概念理解', '推理'], source: 'bank', status: 'confirmed', createdAt },
    { id: 'q-gear-3', courseId: 'course-gear', knowledgePointId: 'kp-gear-idler', type: 'single', difficulty: '进阶', stem: '![含蜗杆的多级定轴轮系（江苏大学机械原理样题）](/question-assets/source-gear-train.png)\n\n计算图示总传动比 $i_{AB}$ 时，正确的处理原则是？', options: ['分段写出各级传动比并连乘，同轴固联轮角速度相同', '把所有齿数直接相加', '只计算首末两个齿轮', '所有中间轮齿数一律忽略'], answer: 'A', explanation: '复杂定轴轮系应沿传动路线分级列式；同轴固联齿轮角速度相同，各级传动比连乘后再约去中间角速度。题图取自江苏大学 803《机械原理》样题。', formula: 'iAB = i12·i23·…·inB', maxScore: 10, abilities: ['公式应用', '推理'], source: 'bank', status: 'confirmed', createdAt }
  ]
  const structureQuestions: Question[] = [
    { id: 'q-structure-1', courseId: 'course-structure', knowledgePointId: 'kp-structure-dyad', type: 'single', difficulty: '基础', stem: '![Ⅱ级基本杆组的五种形式（内蒙古农业大学课件）](/question-assets/source-structure-dyad-types.png)\n\n图中 a～e 五种杆组均由两个构件和三个低副组成。它们属于？', options: ['Ⅰ级组', 'Ⅱ级组', 'Ⅲ级组', 'Ⅳ级组'], answer: 'B', explanation: '$F=3n-2P_L=3×2-2×3=0$，由两个构件和三个低副组成的最简单基本杆组称为Ⅱ级组。题图取自内蒙古农业大学《平面机构的组成原理、分类与结构分析》课件。', formula: 'F = 3n − 2Pₗ = 0', maxScore: 10, abilities: ['概念理解', '公式应用'], source: 'bank', status: 'confirmed', createdAt },
    { id: 'q-structure-2', courseId: 'course-structure', knowledgePointId: 'kp-structure-level', type: 'single', difficulty: '基础', stem: '![Ⅲ级基本杆组的典型形式（内蒙古农业大学课件）](/question-assets/source-structure-levels.png)\n\n图示三种基本杆组均由 4 个构件和 6 个低副组成，并含有一个具有 3 个低副的构件。该杆组属于？', options: ['Ⅰ级组', 'Ⅱ级组', 'Ⅲ级组', 'Ⅳ级组'], answer: 'C', explanation: '满足 $F=3×4-2×6=0$，且具有三副构件的这种四件六副基本杆组定义为Ⅲ级组。题图取自内蒙古农业大学课程课件。', formula: 'F = 3n − 2Pₗ = 0', maxScore: 10, abilities: ['概念理解', '公式应用'], source: 'bank', status: 'confirmed', createdAt },
    { id: 'q-structure-3', courseId: 'course-structure', knowledgePointId: 'kp-structure-analysis', type: 'single', difficulty: '进阶', stem: '![破碎机杆组拆分过程（内蒙古农业大学课件）](/question-assets/source-structure-crusher.png)\n\n对图示破碎机进行结构分析。若取构件 1 为原动件，可依次拆出构件 5、4 和构件 2、3 两个Ⅱ级杆组；若改取构件 5 为原动件，只能拆出由构件 1～4 组成的Ⅲ级杆组。两种情况下机构级别分别为？', options: ['Ⅰ级、Ⅱ级', 'Ⅱ级、Ⅱ级', 'Ⅱ级、Ⅲ级', 'Ⅲ级、Ⅱ级'], answer: 'C', explanation: '机构级别由拆出的最高级别基本杆组决定，因此构件1为原动件时是Ⅱ级机构，构件5为原动件时是Ⅲ级机构。题图取自内蒙古农业大学课程课件。', formula: '机构级别 = 所含最高级基本杆组级别', maxScore: 10, abilities: ['推理', '表达'], source: 'bank', status: 'confirmed', createdAt },
    { id: 'q-structure-photo', courseId: 'course-structure', knowledgePointId: 'kp-structure-analysis', type: 'short', difficulty: '挑战', stem: '![江苏大学 803 样题中的平面机构](/question-assets/source-structure-ujs-freedom.png)\n\n**综合分析题（16 分，请写出完整过程，可拍照提交）**\n\n对图示平面机构完成下列分析：\n\n1. 若存在复合铰链、局部自由度或虚约束，请在图中指出；\n2. 写出平面机构自由度计算式并求自由度 $F$；\n3. 说明机构具有确定运动的条件；\n4. 对图中两处高副进行低代，并说明替代原则。', answer: '图中滚子的自转属于局部自由度；左侧同一移动构件上的重复导路形成虚约束；右侧多个构件在同一轴线处连接的位置按复合铰链计数。自由度计算应在正确计入复合铰链的同时，排除局部自由度并扣除虚约束，采用 $F=3n-2P_L-P_H$（或包含局部自由度、虚约束修正项的等价写法），最终得到 $F=1$。机构具有确定运动的条件是原动件数等于机构自由度，且原动件配置合理。高副低代时，在接触点公法线上引入一个虚拟构件，用两个转动副替代原高副，并保持瞬时运动关系不变；图中两处高副分别按此处理。', explanation: '本题改编自江苏大学硕士研究生入学考试 803《机械原理》官方样题 A 卷第 2 题。评分时允许不同但等价的构件和运动副编号方式，重点核对特殊结构辨识、自由度结果、确定运动条件与高副低代原则。[查看官方样题 PDF](https://yz.ujs.edu.cn/__local/5/A9/99/F8B34AC364CCC4273A91D6F04BE_72A244FB_116C34.pdf)', rubric: '共16分：正确指出复合铰链、局部自由度和虚约束4分；自由度公式、计数过程与F=1共5分；说明原动件数等于自由度且配置合理2分；两处高副低代各2分，说明接触点公法线与瞬时等效原则1分。若图中标注清楚但文字简略，可按对应评分点给分。', formula: 'F=3n-2P_L-P_H；含局部自由度与虚约束时使用等价修正式', maxScore: 16, abilities: ['概念理解', '公式应用', '推理', '表达'], source: 'bank', status: 'confirmed', createdAt }
  ]
  const db: Database = {
    courses: [
      { id: 'course-fourbar', name: '平面四杆机构的急回特性', subject: '机械原理', grade: '大学机械类', description: '判断机构是否具有急回特性，确定极位夹角并计算行程速比系数。', color: '#0969da', createdAt },
      { id: 'course-gear', name: '定轴轮系的传动比', subject: '机械原理', grade: '大学机械类', description: '计算定轴轮系传动比，并使用箭头法判断首末轮转向。', color: '#8250df', createdAt },
      { id: 'course-structure', name: '平面机构的组成与结构分析', subject: '机械原理', grade: '大学机械类', description: '识别基本杆组，判断机构级别，并完成平面机构的结构分析。', color: '#1a7f37', createdAt }
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
      { id: 'assessment-fourbar', courseId: 'course-fourbar', title: '急回特性 · 课堂即时诊断', description: '3 道图示题，检测极位夹角、行程速比系数与机构判断。', joinCode: 'JH083', questionIds: fourbarQuestions.map(question => question.id), status: 'closed', timeLimit: 6, createdAt },
      { id: 'assessment-gear', courseId: 'course-gear', title: '定轴轮系 · 课堂即时诊断', description: '3 道图示题，检测传动比计算、惰轮作用与转向判断。', joinCode: 'LX112', questionIds: gearQuestions.map(question => question.id), status: 'closed', timeLimit: 6, createdAt },
      { id: 'assessment-structure', courseId: 'course-structure', title: '平面机构结构分析 · 课堂即时诊断', description: '4 道图示题，包含 1 道可拍照提交的综合分析题。', joinCode: 'JG027', questionIds: structureQuestions.map(question => question.id), status: 'published', timeLimit: 10, publishedAt: createdAt, createdAt },
      { id: 'assessment-photo-demo', courseId: 'course-structure', title: '结构分析综合题 · 拍照作答演示', description: '1 道 20 分综合分析题，用于演示学生手写过程拍照、视觉识别和 AI 诊断。', joinCode: 'PZ027', questionIds: ['q-structure-photo'], status: 'draft', timeLimit: 10, createdAt }
    ],
    students: [], submissions: [], practices: [],
    settings: { demoShowcase: true, demoSeedVersion: 7, network: { hotspotSsid: 'AI-Classroom', hotspotPassword: '12345678', preferredAddress: '' } }
  }
  applyShowcaseData(db, createdAt)
  return db
}

function migrateShowcaseData(db: Database) {
  db.courses = db.courses.map(course => ({ ...course, grade: course.grade === '高职机械类' ? '大学机械类' : course.grade }))
  const published = db.assessments.filter(assessment => assessment.status === 'published')
  if (published.length > 1) {
    const current = db.assessments.find(assessment => assessment.id === 'assessment-structure') || published[0]
    db.assessments.forEach(assessment => {
      if (assessment.status === 'published' && assessment.id !== current.id) assessment.status = 'closed'
    })
  }
  if ((db.settings?.demoSeedVersion || 0) < 7) {
    const curated = seed()
    curated.questions.forEach(question => {
      const current = db.questions.find(item => item.id === question.id)
      if (current) Object.assign(current, question)
      else db.questions.push(question)
    })
    const photoAssessment = curated.assessments.find(assessment => assessment.id === 'assessment-photo-demo')
    if (photoAssessment && !db.assessments.some(assessment => assessment.id === photoAssessment.id)) db.assessments.push(photoAssessment)
  }
  applyShowcaseData(db)
}

export class JsonStore {
  private data: Database

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    if (fs.existsSync(DB_PATH)) {
      try {
        this.data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as Database
        if ((this.data.settings?.demoSeedVersion || 0) < 7) {
          migrateShowcaseData(this.data)
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
