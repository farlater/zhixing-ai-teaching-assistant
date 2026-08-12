import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, ClipboardPlus, Clock3, Copy, ExternalLink, Pencil, Play, QrCode, Radio, Settings, Square, Trash2, Users } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import type { Assessment, Course, Question } from '../../shared/types'
import { api, formatDate, patch, post, questionTypeLabel, remove } from '../api'
import { Empty, Modal, Spinner, Toast } from '../components'

type AssessmentView = Assessment & {
  course?: Course
  questions: Question[]
  submissionCount: number
}
type NetworkConfig = {
  hotspotSsid: string
  hotspotPassword: string
  preferredAddress: string
  addresses: string[]
  studentPath: string
}
export default function Classes() {
  const [classes, setClasses] = useState<AssessmentView[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [creating, setCreating] = useState(false)
  const [category, setCategory] = useState<'classroom' | 'homework'>('classroom')
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [share, setShare] = useState<AssessmentView>()
  const [editing, setEditing] = useState<AssessmentView>()
  const [toast, setToast] = useState('')
  const [network, setNetwork] = useState<NetworkConfig>({
    hotspotSsid: '',
    hotspotPassword: '',
    preferredAddress: '',
    addresses: [],
    studentPath: '/join',
  })
  const refresh = async () => setClasses(await api<AssessmentView[]>('/api/assessments'))
  useEffect(() => {
    refresh()
    api<Course[]>('/api/courses').then((list) => {
      setCourses(list)
      setSelectedCourseId(list[0]?.id || '')
    })
    api<Question[]>('/api/questions').then((list) => setQuestions(list.filter((item) => item.status === 'confirmed')))
    api<NetworkConfig>('/api/network').then(setNetwork)
  }, [])
  useEffect(() => {
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [])
  const active = classes.filter((item) => item.status === 'published')
  const studentUrl = `${network.preferredAddress || network.addresses[0] || location.origin}/join${share ? `?assessment=${encodeURIComponent(share.id)}` : ''}`
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const questionIds = form.getAll('questionIds')
    const created = await post<Assessment>('/api/assessments', {
      courseId: form.get('courseId'),
      title: form.get('title'),
      description: form.get('description'),
      category: form.get('category'),
      questionMode: form.get('questionMode'),
      questionCount: Number(form.get('questionCount')),
      timeLimit: Number(form.get('timeLimit')),
      questionIds,
    })
    setCreating(false)
    setToast(`${form.get('category') === 'homework' ? '课后作业' : '课堂检测'}草稿已创建`)
    await refresh()
    return created
  }
  async function updateAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    const values = Object.fromEntries(new FormData(event.currentTarget))
    await patch(`/api/assessments/${editing.id}`, {
      ...values,
      timeLimit: Number(values.timeLimit),
    })
    setEditing(undefined)
    setToast('任务信息已更新')
    await refresh()
  }
  async function deleteAssessment(item: AssessmentView) {
    if (!confirm(`删除“${item.title}”？相关作答和报告也会删除，此操作不可撤销。`)) return
    try {
      await remove(`/api/assessments/${item.id}`)
      setToast('教学任务已删除')
      await refresh()
    } catch (error) {
      setToast((error as Error).message)
    }
  }
  const selectedCourseQuestions = useMemo(() => questions.filter((question) => question.courseId === selectedCourseId), [questions, selectedCourseId])
  const visibleClasses = classes.filter((item) => (item.category || 'classroom') === category)
  if (!classes.length && !courses.length) return <Spinner label="正在读取课堂" />
  return (
    <>
      {active.length > 0 && (
        <section className="live-banner">
          <div className="live-pulse">
            <Radio size={22} />
          </div>
          <div>
            <span>当前{active[0].category === 'homework' ? '作业' : '检测'}进行中</span>
            <h2>{active[0].title}</h2>
            <p>
              {active[0].course?.name} · 已收到 {active[0].submissionCount} 份作答
            </p>
          </div>
          <div className="live-code">
            <span>学生入口</span>
            <strong>扫码进入</strong>
          </div>
          <button className="btn light" onClick={() => setShare(active[0])}>
            <QrCode size={17} />
            显示二维码
          </button>
        </section>
      )}
      <div className="assessment-tabs">
        <button className={category === 'classroom' ? 'active' : ''} onClick={() => setCategory('classroom')}>
          课堂检测 <span>{classes.filter((item) => (item.category || 'classroom') === 'classroom').length}</span>
        </button>
        <button className={category === 'homework' ? 'active' : ''} onClick={() => setCategory('homework')}>
          课后作业 <span>{classes.filter((item) => item.category === 'homework').length}</span>
        </button>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{category === 'classroom' ? '课堂检测记录' : '课后作业记录'}</h2>
            <p>两类任务独立形成学情报告，综合成绩按课堂 30% + 作业 70% 计算</p>
          </div>
          <button className="btn primary" onClick={() => setCreating(true)}>
            <ClipboardPlus size={17} />
            创建{category === 'classroom' ? '检测' : '作业'}
          </button>
        </div>
        {visibleClasses.length ? (
          <div className="assessment-table">
            <div className="table-head">
              <span>任务</span>
              <span>状态</span>
              <span>题量 / 时长</span>
              <span>提交</span>
              <span>创建时间</span>
              <span>操作</span>
            </div>
            {visibleClasses.map((item) => (
              <div className="table-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {item.course?.name || '未关联课程'} · {item.questionMode === 'pool' ? '题库随机' : item.questionMode === 'ai-variant' ? 'AI 变式分配' : '统一试卷'}
                  </small>
                </div>
                <span>
                  <i className={`badge ${item.status}`}>{item.status === 'published' ? '进行中' : item.status === 'closed' ? '已结束' : '草稿'}</i>
                </span>
                <span>
                  {item.questionCount || item.questionIds.length} 题 · {item.timeLimit} 分钟
                </span>
                <span>
                  <b className="submit-count">{item.submissionCount}</b> 人
                </span>
                <span>{formatDate(item.createdAt)}</span>
                <div className="row-actions">
                  {item.status === 'draft' && (
                    <button
                      className="btn mini primary"
                      onClick={async () => {
                        await post(`/api/assessments/${item.id}/publish`)
                        setToast('任务已发布，学生扫码即可进入')
                        await refresh()
                      }}
                    >
                      <Play size={14} />
                      发布
                    </button>
                  )}
                  {item.status === 'published' && (
                    <>
                      <button className="btn mini" onClick={() => setShare(item)}>
                        <QrCode size={14} />
                        扫码加入
                      </button>
                      <button
                        className="icon-btn danger"
                        title="结束任务"
                        onClick={async () => {
                          await post(`/api/assessments/${item.id}/close`)
                          await refresh()
                        }}
                      >
                        <Square size={14} />
                      </button>
                    </>
                  )}
                  {item.status === 'closed' && (
                    <a className="btn mini" href="/teacher/reports">
                      查看报告 <ExternalLink size={13} />
                    </a>
                  )}
                  <button className="icon-btn" title="编辑名称和说明" onClick={() => setEditing(item)}>
                    <Pencil size={14} />
                  </button>
                  <button className="icon-btn danger" title="删除任务" onClick={() => deleteAssessment(item)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title={`还没有${category === 'classroom' ? '课堂检测' : '课后作业'}`} text="先确认题目，再把它们组合成一次教学任务。" />
        )}
      </section>
      {creating && (
        <Modal title={`创建${category === 'classroom' ? '课堂检测' : '课后作业'}`} wide onClose={() => setCreating(false)}>
          <form className="form" onSubmit={create}>
            <input type="hidden" name="category" value={category} />
            <div className="form-row">
              <label>
                任务名称
                <input name="title" required placeholder={category === 'classroom' ? '如：结构分析 · 随堂检测' : '如：结构分析 · 课后作业'} />
              </label>
              <label>
                关联课程
                <select name="courseId" value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              任务说明
              <input name="description" placeholder="学生加入后可看到" />
            </label>
            <div className="form-row">
              <label>
                答题时长（分钟）
                <input name="timeLimit" type="number" min="1" defaultValue={category === 'classroom' ? 10 : 30} />
              </label>
              <label>
                每人题量
                <input name="questionCount" type="number" min="1" max={Math.max(1, selectedCourseQuestions.length)} defaultValue={Math.max(1, selectedCourseQuestions.length)} />
              </label>
            </div>
            <label>
              学生题目分配
              <select name="questionMode" defaultValue="fixed">
                <option value="fixed">统一试卷（演示默认）</option>
                <option value="pool">题库随机 · 同题型每人不同</option>
                <option value="ai-variant">AI 变式题池 · 发布前生成后分配</option>
              </select>
              <small>随机与 AI 模式都由后端按学生稳定分配，刷新不会换题；API Key 不进入学生端。</small>
            </label>
            <fieldset>
              <legend>
                选择模板题 / 固定试卷 <span>本课程已确认 {selectedCourseQuestions.length} 道</span>
              </legend>
              <div className="pick-questions">
                {selectedCourseQuestions.map((question, index) => (
                  <label key={question.id}>
                    <input type="checkbox" name="questionIds" value={question.id} defaultChecked />
                    <span>
                      <b>{index + 1}</b>
                      <div>
                        <strong>{question.stem}</strong>
                        <small>
                          {questionTypeLabel[question.type]} · {question.maxScore} 分 · {question.difficulty}
                        </small>
                      </div>
                      <CheckCircle2 size={18} />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="modal-actions">
              <button type="button" className="btn subtle" onClick={() => setCreating(false)}>
                取消
              </button>
              <button className="btn primary">保存为草稿</button>
            </div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal title="编辑教学任务" onClose={() => setEditing(undefined)}>
          <form className="form" onSubmit={updateAssessment}>
            <label>
              任务名称
              <input name="title" required defaultValue={editing.title} />
            </label>
            <label>
              任务说明
              <textarea name="description" rows={3} defaultValue={editing.description} />
            </label>
            <label>
              答题时长（分钟）
              <input name="timeLimit" type="number" min="1" defaultValue={editing.timeLimit} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn subtle" onClick={() => setEditing(undefined)}>
                取消
              </button>
              <button className="btn primary">保存修改</button>
            </div>
          </form>
        </Modal>
      )}
      {share && (
        <Modal title="学生扫码入课" wide onClose={() => setShare(undefined)}>
          <div className="hotspot-share">
            <div className="hotspot-config">
              <h3>连接准备</h3>
              <p>学生先在手机 Wi-Fi 设置中连接教师电脑热点。二维码不包含热点密码，只用于填写教师电脑地址、端口并进入当前课堂。</p>
              <button
                className="btn"
                onClick={async () => {
                  await post('/api/network/open-hotspot-settings')
                  setToast('已打开 Windows 移动热点设置')
                }}
              >
                <Settings size={16} />
                打开 Windows 热点设置
              </button>
              <label>
                Windows 热点地址
                <input value={network.preferredAddress} readOnly />
              </label>
              <p>为避免家庭 Wi-Fi、VPN 或虚拟网卡干扰，课堂二维码固定使用 Windows 移动热点地址。</p>
            </div>
            <div className="join-share">
              <h3>扫码进入“{share.title}”</h3>
              <div className="qr-frame">
                <QRCodeSVG value={studentUrl} size={210} bgColor="#ffffff" fgColor="#1f2328" />
              </div>
              <p>学生 APK 点击“扫码加入课堂”后，会自动保存地址和端口并进入本次检测。</p>
              <div className="join-url">
                {studentUrl}
                <button
                  className="icon-btn"
                  title="复制课堂链接"
                  onClick={() => {
                    navigator.clipboard.writeText(studentUrl)
                    setToast('课堂链接已复制')
                  }}
                >
                  <Copy size={16} />
                </button>
              </div>
              <div className="share-stats">
                <span>
                  <Users size={17} />
                  {share.submissionCount} 人已提交
                </span>
                <span>
                  <Clock3 size={17} />
                  {share.timeLimit} 分钟
                </span>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </>
  )
}
