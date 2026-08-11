import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, ClipboardPlus, Clock3, Copy, ExternalLink, Play, Radio, Settings, Square, Users, Wifi } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import type { Assessment, Course, Question } from '../../shared/types'
import { api, formatDate, post, questionTypeLabel } from '../api'
import { Empty, Modal, Spinner, Toast } from '../components'

type AssessmentView = Assessment & { course?: Course; questions: Question[]; submissionCount: number }
type NetworkConfig = { hotspotSsid: string; hotspotPassword: string; preferredAddress: string; addresses: string[]; studentPath: string }
const wifiEscape = (value: string) => value.replace(/([\\;,:"])/g, '\\$1')

export default function Classes() {
  const [classes, setClasses] = useState<AssessmentView[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [creating, setCreating] = useState(false)
  const [share, setShare] = useState<AssessmentView>()
  const [toast, setToast] = useState('')
  const [network, setNetwork] = useState<NetworkConfig>({ hotspotSsid: '', hotspotPassword: '', preferredAddress: '', addresses: [], studentPath: '/join' })
  const refresh = async () => setClasses(await api<AssessmentView[]>('/api/assessments'))
  useEffect(() => { refresh(); api<Course[]>('/api/courses').then(setCourses); api<Question[]>('/api/questions').then(list => setQuestions(list.filter(item => item.status === 'confirmed'))); api<NetworkConfig>('/api/network').then(setNetwork) }, [])
  useEffect(() => { const timer = setInterval(refresh, 5000); return () => clearInterval(timer) }, [])
  const active = classes.filter(item => item.status === 'published')
  const studentUrl = `${network.preferredAddress || network.addresses[0] || location.origin}/join`
  const wifiQr = network.hotspotSsid ? `WIFI:T:WPA;S:${wifiEscape(network.hotspotSsid)};P:${wifiEscape(network.hotspotPassword)};;` : ''
  async function saveNetwork() {
    await api('/api/network', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(network) })
    setToast('热点信息与学生入口已保存')
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const questionIds = form.getAll('questionIds')
    const created = await post<Assessment>('/api/assessments', { courseId: form.get('courseId'), title: form.get('title'), description: form.get('description'), timeLimit: Number(form.get('timeLimit')), questionIds })
    setCreating(false); setToast('课堂草稿已创建'); await refresh(); return created
  }
  const selectedCourseQuestions = useMemo(() => questions, [questions])
  if (!classes.length && !courses.length) return <Spinner label="正在读取课堂" />
  return <>
    {active.length > 0 && <section className="live-banner"><div className="live-pulse"><Radio size={22} /></div><div><span>当前检测进行中</span><h2>{active[0].title}</h2><p>{active[0].course?.name} · 已收到 {active[0].submissionCount} 份作答</p></div><div className="live-code"><span>学生入口</span><strong>选择课程</strong></div><button className="btn light" onClick={() => setShare(active[0])}><Wifi size={17} />热点入课</button></section>}
    <section className="panel"><div className="panel-head"><div><h2>检测记录</h2><p>现场始终只有一个活动检测，新检测发布后旧检测自动结束</p></div><button className="btn primary" onClick={() => setCreating(true)}><ClipboardPlus size={17} />创建检测</button></div>
      {classes.length ? <div className="assessment-table"><div className="table-head"><span>课堂</span><span>状态</span><span>题量 / 时长</span><span>提交</span><span>创建时间</span><span>操作</span></div>{classes.map(item => <div className="table-row" key={item.id}><div><strong>{item.title}</strong><small>{item.course?.name || '未关联课程'}</small></div><span><i className={`badge ${item.status}`}>{item.status === 'published' ? '进行中' : item.status === 'closed' ? '已结束' : '草稿'}</i></span><span>{item.questionIds.length} 题 · {item.timeLimit} 分钟</span><span><b className="submit-count">{item.submissionCount}</b> 人</span><span>{formatDate(item.createdAt)}</span><div className="row-actions">{item.status === 'draft' && <button className="btn mini primary" onClick={async () => { await post(`/api/assessments/${item.id}/publish`); setToast('检测已发布，学生可在入口页选择进入'); await refresh() }}><Play size={14} />发布</button>}{item.status === 'published' && <><button className="btn mini" onClick={() => setShare(item)}><Wifi size={14} />热点入课</button><button className="icon-btn danger" title="结束课堂" onClick={async () => { await post(`/api/assessments/${item.id}/close`); await refresh() }}><Square size={14} /></button></>}{item.status === 'closed' && <a className="btn mini" href="/teacher/reports">查看报告 <ExternalLink size={13} /></a>}</div></div>)}</div> : <Empty title="还没有课堂检测" text="先确认题目，再把它们组合成一次课堂检测。" />}
    </section>
    {creating && <Modal title="创建课堂检测" wide onClose={() => setCreating(false)}><form className="form" onSubmit={create}><div className="form-row"><label>课堂名称<input name="title" required placeholder="如：一次函数 · 随堂检测" /></label><label>关联课程<select name="courseId">{courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label></div><label>课堂说明<input name="description" placeholder="学生加入后可看到" /></label><label>答题时长（分钟）<input name="timeLimit" type="number" min="1" defaultValue="20" /></label><fieldset><legend>选择题目 <span>已确认 {selectedCourseQuestions.length} 道</span></legend><div className="pick-questions">{selectedCourseQuestions.map((question, index) => <label key={question.id}><input type="checkbox" name="questionIds" value={question.id} defaultChecked /><span><b>{index + 1}</b><div><strong>{question.stem}</strong><small>{questionTypeLabel[question.type]} · {question.maxScore} 分 · {question.difficulty}</small></div><CheckCircle2 size={18} /></span></label>)}</div></fieldset><div className="modal-actions"><button type="button" className="btn subtle" onClick={() => setCreating(false)}>取消</button><button className="btn primary">保存为草稿</button></div></form></Modal>}
    {share && <Modal title="开启热点并让学生入课" wide onClose={() => setShare(undefined)}><div className="hotspot-share"><div className="hotspot-config"><span className="student-eyebrow">教师电脑</span><h3>1. 开启 Windows 移动热点</h3><p>浏览器不能直接修改系统热点密码，先打开系统设置并开启热点，再把实际名称和密码填在下方。</p><button className="btn" onClick={async () => { await post('/api/network/open-hotspot-settings'); setToast('已打开 Windows 移动热点设置') }}><Settings size={16} />打开热点设置</button><div className="form-row"><label>热点名称<input value={network.hotspotSsid} onChange={event => setNetwork({ ...network, hotspotSsid: event.target.value })} placeholder="例如 Teacher-Class" /></label><label>热点密码<input value={network.hotspotPassword} onChange={event => setNetwork({ ...network, hotspotPassword: event.target.value })} placeholder="至少 8 位" /></label></div><label>学生访问地址<select value={network.preferredAddress} onChange={event => setNetwork({ ...network, preferredAddress: event.target.value })}>{network.addresses.map(address => <option value={address} key={address}>{address}{address.includes('192.168.137.1') ? '（Windows 热点常用）' : ''}</option>)}</select></label><button className="btn primary" onClick={saveNetwork}>保存热点信息</button></div><div className="join-share"><span className="student-eyebrow">学生手机</span><h3>2. 扫码连接教师热点</h3>{wifiQr ? <div className="qr-frame"><QRCodeSVG value={wifiQr} size={190} bgColor="#ffffff" fgColor="#173f3a" /></div> : <div className="qr-placeholder"><Wifi /><span>先填写热点名称与密码</span></div>}<p>连接后打开学生端 PWA 或下面的固定入口，选择课程并填写班级、姓名即可进入，无需课堂码。</p><div className="join-url">{studentUrl}<button className="icon-btn" onClick={() => { navigator.clipboard.writeText(studentUrl); setToast('学生入口已复制') }}><Copy size={16} /></button></div><div className="share-stats"><span><Users size={17} />{share.submissionCount} 人已提交</span><span><Clock3 size={17} />{share.timeLimit} 分钟</span></div></div></div></Modal>}
    {toast && <Toast message={toast} onDone={() => setToast('')} />}
  </>
}
