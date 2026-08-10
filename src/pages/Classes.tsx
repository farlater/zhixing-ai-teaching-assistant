import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, ClipboardPlus, Clock3, Copy, ExternalLink, Play, QrCode, Radio, Square, Users } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import type { Assessment, Course, Question } from '../../shared/types'
import { api, formatDate, post, questionTypeLabel } from '../api'
import { Empty, Modal, Spinner, Toast } from '../components'

type AssessmentView = Assessment & { course?: Course; questions: Question[]; submissionCount: number }

export default function Classes() {
  const [classes, setClasses] = useState<AssessmentView[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [creating, setCreating] = useState(false)
  const [share, setShare] = useState<AssessmentView>()
  const [toast, setToast] = useState('')
  const refresh = async () => setClasses(await api<AssessmentView[]>('/api/assessments'))
  useEffect(() => { refresh(); api<Course[]>('/api/courses').then(setCourses); api<Question[]>('/api/questions').then(list => setQuestions(list.filter(item => item.status === 'confirmed'))) }, [])
  useEffect(() => { const timer = setInterval(refresh, 5000); return () => clearInterval(timer) }, [])
  const active = classes.filter(item => item.status === 'published')
  const joinUrl = share ? `${location.origin}/join/${share.joinCode}` : ''
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const questionIds = form.getAll('questionIds')
    const created = await post<Assessment>('/api/assessments', { courseId: form.get('courseId'), title: form.get('title'), description: form.get('description'), timeLimit: Number(form.get('timeLimit')), questionIds })
    setCreating(false); setToast('课堂草稿已创建'); await refresh(); return created
  }
  const selectedCourseQuestions = useMemo(() => questions, [questions])
  if (!classes.length && !courses.length) return <Spinner label="正在读取课堂" />
  return <>
    {active.length > 0 && <section className="live-banner"><div className="live-pulse"><Radio size={22} /></div><div><span>课堂进行中</span><h2>{active[0].title}</h2><p>{active[0].course?.name} · 已收到 {active[0].submissionCount} 份作答</p></div><div className="live-code"><span>课堂码</span><strong>{active[0].joinCode}</strong></div><button className="btn light" onClick={() => setShare(active[0])}><QrCode size={17} />投屏加入页</button></section>}
    <section className="panel"><div className="panel-head"><div><h2>全部课堂</h2><p>每个课堂码对应一次独立检测与报告</p></div><button className="btn primary" onClick={() => setCreating(true)}><ClipboardPlus size={17} />创建课堂</button></div>
      {classes.length ? <div className="assessment-table"><div className="table-head"><span>课堂</span><span>状态</span><span>题量 / 时长</span><span>提交</span><span>创建时间</span><span>操作</span></div>{classes.map(item => <div className="table-row" key={item.id}><div><strong>{item.title}</strong><small>{item.course?.name || '未关联课程'}</small></div><span><i className={`badge ${item.status}`}>{item.status === 'published' ? '进行中' : item.status === 'closed' ? '已结束' : '草稿'}</i></span><span>{item.questionIds.length} 题 · {item.timeLimit} 分钟</span><span><b className="submit-count">{item.submissionCount}</b> 人</span><span>{formatDate(item.createdAt)}</span><div className="row-actions">{item.status === 'draft' && <button className="btn mini primary" onClick={async () => { await post(`/api/assessments/${item.id}/publish`); setToast('课堂已发布，学生现在可以加入'); await refresh() }}><Play size={14} />发布</button>}{item.status === 'published' && <><button className="btn mini" onClick={() => setShare(item)}><QrCode size={14} />加入码</button><button className="icon-btn danger" title="结束课堂" onClick={async () => { await post(`/api/assessments/${item.id}/close`); await refresh() }}><Square size={14} /></button></>}{item.status === 'closed' && <a className="btn mini" href="/teacher/reports">查看报告 <ExternalLink size={13} /></a>}</div></div>)}</div> : <Empty title="还没有课堂检测" text="先确认题目，再把它们组合成一次课堂检测。" />}
    </section>
    {creating && <Modal title="创建课堂检测" wide onClose={() => setCreating(false)}><form className="form" onSubmit={create}><div className="form-row"><label>课堂名称<input name="title" required placeholder="如：一次函数 · 随堂检测" /></label><label>关联课程<select name="courseId">{courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label></div><label>课堂说明<input name="description" placeholder="学生加入后可看到" /></label><label>答题时长（分钟）<input name="timeLimit" type="number" min="1" defaultValue="20" /></label><fieldset><legend>选择题目 <span>已确认 {selectedCourseQuestions.length} 道</span></legend><div className="pick-questions">{selectedCourseQuestions.map((question, index) => <label key={question.id}><input type="checkbox" name="questionIds" value={question.id} defaultChecked /><span><b>{index + 1}</b><div><strong>{question.stem}</strong><small>{questionTypeLabel[question.type]} · {question.maxScore} 分 · {question.difficulty}</small></div><CheckCircle2 size={18} /></span></label>)}</div></fieldset><div className="modal-actions"><button type="button" className="btn subtle" onClick={() => setCreating(false)}>取消</button><button className="btn primary">保存为草稿</button></div></form></Modal>}
    {share && <Modal title="学生加入课堂" onClose={() => setShare(undefined)}><div className="join-share"><div className="qr-frame"><QRCodeSVG value={joinUrl} size={190} bgColor="#ffffff" fgColor="#173f3a" /></div><p>扫描二维码或在学生端输入课堂码</p><strong>{share.joinCode}</strong><div className="join-url">{joinUrl}<button className="icon-btn" onClick={() => { navigator.clipboard.writeText(joinUrl); setToast('链接已复制') }}><Copy size={16} /></button></div><div className="share-stats"><span><Users size={17} />{share.submissionCount} 人已提交</span><span><Clock3 size={17} />{share.timeLimit} 分钟</span></div></div></Modal>}
    {toast && <Toast message={toast} onDone={() => setToast('')} />}
  </>
}
