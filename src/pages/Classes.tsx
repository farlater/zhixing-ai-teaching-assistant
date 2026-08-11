import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, ClipboardPlus, Clock3, Copy, ExternalLink, Play, QrCode, Radio, Settings, Square, Users } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import type { Assessment, Course, Question } from '../../shared/types'
import { api, formatDate, post, questionTypeLabel } from '../api'
import { Empty, Modal, Spinner, Toast } from '../components'

type AssessmentView = Assessment & { course?: Course; questions: Question[]; submissionCount: number }
type NetworkConfig = { hotspotSsid: string; hotspotPassword: string; preferredAddress: string; addresses: string[]; studentPath: string }
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
  const studentUrl = `${network.preferredAddress || network.addresses[0] || location.origin}/join${share ? `?assessment=${encodeURIComponent(share.id)}` : ''}`
  async function saveNetwork() {
    await api('/api/network', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(network) })
    setToast('学生访问地址已保存')
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const questionIds = form.getAll('questionIds')
    const created = await post<Assessment>('/api/assessments', { courseId: form.get('courseId'), title: form.get('title'), description: form.get('description'), timeLimit: Number(form.get('timeLimit')), questionIds })
    setCreating(false); setToast('课堂草稿已创建'); await refresh(); return created
  }
  const selectedCourseQuestions = useMemo(() => questions, [questions])
  if (!classes.length && !courses.length) return <Spinner label="正在读取课堂" />
  return <>
    {active.length > 0 && <section className="live-banner"><div className="live-pulse"><Radio size={22} /></div><div><span>当前检测进行中</span><h2>{active[0].title}</h2><p>{active[0].course?.name} · 已收到 {active[0].submissionCount} 份作答</p></div><div className="live-code"><span>学生入口</span><strong>扫码进入</strong></div><button className="btn light" onClick={() => setShare(active[0])}><QrCode size={17} />显示二维码</button></section>}
    <section className="panel"><div className="panel-head"><div><h2>检测记录</h2><p>现场始终只有一个活动检测，新检测发布后旧检测自动结束</p></div><button className="btn primary" onClick={() => setCreating(true)}><ClipboardPlus size={17} />创建检测</button></div>
      {classes.length ? <div className="assessment-table"><div className="table-head"><span>课堂</span><span>状态</span><span>题量 / 时长</span><span>提交</span><span>创建时间</span><span>操作</span></div>{classes.map(item => <div className="table-row" key={item.id}><div><strong>{item.title}</strong><small>{item.course?.name || '未关联课程'}</small></div><span><i className={`badge ${item.status}`}>{item.status === 'published' ? '进行中' : item.status === 'closed' ? '已结束' : '草稿'}</i></span><span>{item.questionIds.length} 题 · {item.timeLimit} 分钟</span><span><b className="submit-count">{item.submissionCount}</b> 人</span><span>{formatDate(item.createdAt)}</span><div className="row-actions">{item.status === 'draft' && <button className="btn mini primary" onClick={async () => { await post(`/api/assessments/${item.id}/publish`); setToast('检测已发布，学生扫码即可进入'); await refresh() }}><Play size={14} />发布</button>}{item.status === 'published' && <><button className="btn mini" onClick={() => setShare(item)}><QrCode size={14} />扫码入课</button><button className="icon-btn danger" title="结束课堂" onClick={async () => { await post(`/api/assessments/${item.id}/close`); await refresh() }}><Square size={14} /></button></>}{item.status === 'closed' && <a className="btn mini" href="/teacher/reports">查看报告 <ExternalLink size={13} /></a>}</div></div>)}</div> : <Empty title="还没有课堂检测" text="先确认题目，再把它们组合成一次课堂检测。" />}
    </section>
    {creating && <Modal title="创建课堂检测" wide onClose={() => setCreating(false)}><form className="form" onSubmit={create}><div className="form-row"><label>课堂名称<input name="title" required placeholder="如：一次函数 · 随堂检测" /></label><label>关联课程<select name="courseId">{courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label></div><label>课堂说明<input name="description" placeholder="学生加入后可看到" /></label><label>答题时长（分钟）<input name="timeLimit" type="number" min="1" defaultValue="20" /></label><fieldset><legend>选择题目 <span>已确认 {selectedCourseQuestions.length} 道</span></legend><div className="pick-questions">{selectedCourseQuestions.map((question, index) => <label key={question.id}><input type="checkbox" name="questionIds" value={question.id} defaultChecked /><span><b>{index + 1}</b><div><strong>{question.stem}</strong><small>{questionTypeLabel[question.type]} · {question.maxScore} 分 · {question.difficulty}</small></div><CheckCircle2 size={18} /></span></label>)}</div></fieldset><div className="modal-actions"><button type="button" className="btn subtle" onClick={() => setCreating(false)}>取消</button><button className="btn primary">保存为草稿</button></div></form></Modal>}
    {share && <Modal title="学生扫码入课" wide onClose={() => setShare(undefined)}><div className="hotspot-share"><div className="hotspot-config"><h3>连接准备</h3><p>学生先在手机 Wi-Fi 设置中连接教师电脑热点。二维码不包含热点密码，只用于填写教师电脑地址、端口并进入当前课堂。</p><button className="btn" onClick={async () => { await post('/api/network/open-hotspot-settings'); setToast('已打开 Windows 移动热点设置') }}><Settings size={16} />打开 Windows 热点设置</button><label>二维码使用的教师电脑地址<select value={network.preferredAddress} onChange={event => setNetwork({ ...network, preferredAddress: event.target.value })}>{network.addresses.map(address => <option value={address} key={address}>{address}{address.includes('192.168.137.1') ? '（Windows 热点）' : ''}</option>)}</select></label><button className="btn primary" onClick={saveNetwork}>保存访问地址</button></div><div className="join-share"><h3>扫码进入“{share.title}”</h3><div className="qr-frame"><QRCodeSVG value={studentUrl} size={210} bgColor="#ffffff" fgColor="#1f2328" /></div><p>学生 APK 点击“扫码加入课堂”后，会自动保存地址和端口并进入本次检测。</p><div className="join-url">{studentUrl}<button className="icon-btn" title="复制课堂链接" onClick={() => { navigator.clipboard.writeText(studentUrl); setToast('课堂链接已复制') }}><Copy size={16} /></button></div><div className="share-stats"><span><Users size={17} />{share.submissionCount} 人已提交</span><span><Clock3 size={17} />{share.timeLimit} 分钟</span></div></div></div></Modal>}
    {toast && <Toast message={toast} onDone={() => setToast('')} />}
  </>
}
