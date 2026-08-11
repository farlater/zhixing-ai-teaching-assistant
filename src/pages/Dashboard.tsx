import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Clock3, Sparkles, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, formatDate } from '../api'
import { Spinner } from '../components'

type Overview = {
  courses: number; activeClasses: number; students: number; submissionsToday: number
  recentAssessments: { id: string; title: string; status: string; submissions: number; createdAt: string; course?: { name: string } }[]
  courseProgress: { id: string; name: string; subject: string; grade: string; knowledgeCount: number; materialCount: number; questionCount: number }[]
}
type Health = { mode: string; providers: Record<string, boolean>; addresses: string[] }

export default function Dashboard() {
  const [data, setData] = useState<Overview>()
  const [health, setHealth] = useState<Health>()
  useEffect(() => { api<Overview>('/api/overview').then(setData); api<Health>('/api/health').then(setHealth) }, [])
  if (!data) return <Spinner label="正在汇总课堂数据" />
  const stats = [
    { label: '课程', value: data.courses, note: '已建立课程空间', icon: BookOpen, tone: 'green' },
    { label: '进行中课堂', value: data.activeClasses, note: '学生端可选择进入', icon: ClipboardCheck, tone: 'orange' },
    { label: '学生档案', value: data.students, note: '长期学习记录', icon: Users, tone: 'blue' },
    { label: '今日提交', value: data.submissionsToday, note: '份诊断结果已形成', icon: CheckCircle2, tone: 'violet' }
  ]
  return <>
    <section className="hero-card">
      <div><span className="eyebrow"><Sparkles size={14} />今日教学提示</span><h2>先看见问题，再决定下一步。</h2><p>示例课堂已有完整作答数据，可直接进入学情报告查看班级共性问题。</p><div className="hero-actions"><Link className="btn primary" to="/teacher/reports">查看课堂报告 <ArrowRight size={17} /></Link><Link className="btn subtle" to="/teacher/questions">创建新检测</Link></div></div>
      <div className="hero-visual"><div className="orbit one" /><div className="orbit two" /><div className="hero-score"><strong>83%</strong><span>班级掌握度</span><small>基于 6 份真实作答</small></div></div>
    </section>
    <section className="stat-grid">{stats.map(({ label, value, note, icon: Icon, tone }) => <div className="stat-card" key={label}><div className={`stat-icon ${tone}`}><Icon size={20} /></div><div><p>{label}</p><strong>{value}</strong><span>{note}</span></div></div>)}</section>
    <section className="dashboard-grid">
      <div className="panel"><div className="panel-head"><div><h2>最近课堂</h2><p>发布与提交进度</p></div><Link to="/teacher/classes">全部课堂 <ArrowRight size={15} /></Link></div>
        <div className="class-list">{data.recentAssessments.map(item => <Link to="/teacher/classes" className="class-row" key={item.id}><div className="date-tile"><span>{new Date(item.createdAt).getDate()}</span><small>{new Date(item.createdAt).toLocaleString('zh-CN', { month: 'short' })}</small></div><div className="class-main"><strong>{item.title}</strong><span>{item.course?.name || '未关联课程'} · {formatDate(item.createdAt)}</span></div><div className="class-status"><b>{item.submissions}</b><span>已提交</span></div><i className={`badge ${item.status}`}>{item.status === 'published' ? '进行中' : item.status === 'closed' ? '已结束' : '草稿'}</i></Link>)}</div>
      </div>
      <div className="panel"><div className="panel-head"><div><h2>课程准备度</h2><p>知识点、资料与题目</p></div><Link to="/teacher/courses">管理 <ArrowRight size={15} /></Link></div>
        <div className="course-progress">{data.courseProgress.map(course => { const total = Math.min(100, course.knowledgeCount * 15 + course.materialCount * 20 + course.questionCount * 5); return <div key={course.id}><div className="progress-title"><span><b>{course.name}</b><small>{course.grade} · {course.subject}</small></span><strong>{total}%</strong></div><div className="progress"><i style={{ width: `${total}%` }} /></div><div className="progress-meta"><span>{course.knowledgeCount} 个知识点</span><span>{course.materialCount} 份资料</span><span>{course.questionCount} 道题</span></div></div>})}</div>
      </div>
    </section>
    <section className="service-strip"><div><span className={`status-dot ${health?.mode === 'ai' ? '' : 'demo'}`} /><div><strong>{health?.mode === 'ai' ? '百炼 AI 服务已连接' : '当前为演示模式'}</strong><small>{health?.mode === 'ai' ? 'DeepSeek、千问视觉与语音已就绪' : '配置一个百炼 API Key 后启用全部模型；核心流程仍可体验'}</small></div></div><span><Clock3 size={15} /> 本地数据自动保存</span></section>
  </>
}
