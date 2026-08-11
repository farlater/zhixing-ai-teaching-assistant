import fs from 'node:fs'
import path from 'node:path'
import type { Database, Question } from '../shared/types.js'

const DATA_DIR = path.resolve('data')
const DB_PATH = path.join(DATA_DIR, 'db.json')

const now = () => new Date().toISOString()

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
    { id: 'q-structure-3', courseId: 'course-structure', knowledgePointId: 'kp-structure-analysis', type: 'single', difficulty: '进阶', stem: '![破碎机杆组拆分过程（内蒙古农业大学课件）](/question-assets/source-structure-crusher.png)\n\n对图示破碎机进行结构分析。若取构件 1 为原动件，可依次拆出构件 5、4 和构件 2、3 两个Ⅱ级杆组；若改取构件 5 为原动件，只能拆出由构件 1～4 组成的Ⅲ级杆组。两种情况下机构级别分别为？', options: ['Ⅰ级、Ⅱ级', 'Ⅱ级、Ⅱ级', 'Ⅱ级、Ⅲ级', 'Ⅲ级、Ⅱ级'], answer: 'C', explanation: '机构级别由拆出的最高级别基本杆组决定，因此构件1为原动件时是Ⅱ级机构，构件5为原动件时是Ⅲ级机构。题图取自内蒙古农业大学课程课件。', formula: '机构级别 = 所含最高级基本杆组级别', maxScore: 10, abilities: ['推理', '表达'], source: 'bank', status: 'confirmed', createdAt }
  ]
  return {
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
      { id: 'assessment-structure', courseId: 'course-structure', title: '平面机构结构分析 · 课堂即时诊断', description: '3 道图示题，检测基本杆组、机构级别与拆组分析。', joinCode: 'JG027', questionIds: structureQuestions.map(question => question.id), status: 'published', timeLimit: 6, publishedAt: createdAt, createdAt }
    ],
    students: [], submissions: [], practices: [],
    settings: { demoShowcase: false, demoSeedVersion: 4, network: { hotspotSsid: 'AI-Classroom', hotspotPassword: '12345678', preferredAddress: '' } }
  }
}

function removeLegacyShowcaseData(db: Database) {
  const legacyStudentIds = new Set(db.students.filter(student => student.id === 'demo-live-student' || student.id.startsWith('demo-student-')).map(student => student.id))
  db.students = db.students.filter(student => !legacyStudentIds.has(student.id))
  db.submissions = db.submissions.filter(submission => !legacyStudentIds.has(submission.studentId))
  db.practices = db.practices.filter(practice => !legacyStudentIds.has(practice.studentId))
  db.courses = db.courses.map(course => ({ ...course, grade: course.grade === '高职机械类' ? '大学机械类' : course.grade }))
  const published = db.assessments.filter(assessment => assessment.status === 'published')
  if (published.length > 1) {
    const current = db.assessments.find(assessment => assessment.id === 'assessment-structure') || published[0]
    db.assessments.forEach(assessment => {
      if (assessment.status === 'published' && assessment.id !== current.id) assessment.status = 'closed'
    })
  }
  if ((db.settings?.demoSeedVersion || 0) < 4) {
    const curated = seed()
    curated.questions.forEach(question => {
      const current = db.questions.find(item => item.id === question.id)
      if (current) Object.assign(current, question)
      else db.questions.push(question)
    })
  }
  db.settings = { ...db.settings, demoShowcase: false, demoSeedVersion: 4 }
}

export class JsonStore {
  private data: Database

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    if (fs.existsSync(DB_PATH)) {
      try {
        this.data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as Database
        if ((this.data.settings?.demoSeedVersion || 0) < 4 || this.data.settings?.demoShowcase) {
          removeLegacyShowcaseData(this.data)
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
