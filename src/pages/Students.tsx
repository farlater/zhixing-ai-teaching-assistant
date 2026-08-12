import { useEffect, useState } from 'react'
import { ArrowRight, BookMarked, Medal, Search, TrendingUp, UserRound } from 'lucide-react'
import { Line, LineChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Ability, Student } from '../../shared/types'
import { api } from '../api'
import { Empty, Modal, ScoreRing, Spinner } from '../components'

type StudentView = Student & { submissionCount: number; classroomAverage: number; homeworkAverage: number; weightedScore: number; rank: number }
type Profile = {
  student: Student; submissions: number; mastery: { id: string; name: string; value: number }[];
  abilities: { name: Ability; value: number }[]; history: { name: string; classroom?: number; homework?: number; date: string }[];
  errorTypes: { name: string; value: number }[]; summary: string; classroomAverage: number; homeworkAverage: number; weightedScore: number; rank: number; totalStudents: number
}

export default function Students() {
  const [students, setStudents] = useState<StudentView[]>([])
  const [query, setQuery] = useState('')
  const [profile, setProfile] = useState<Profile>()
  const [loading, setLoading] = useState(true)
  useEffect(() => { api<StudentView[]>('/api/students').then(setStudents).finally(() => setLoading(false)) }, [])
  if (loading) return <Spinner label="正在建立学生档案" />
  const filtered = students.filter(item => item.name.includes(query) || item.studentNo?.includes(query))
  return <>
    <section className="student-toolbar"><div className="search-box"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索姓名或学号" /></div><div className="student-total"><UserRound size={18} /><strong>{students.length}</strong> 名学生已建立档案</div></section>
    <section className="student-grid">{filtered.map((student, index) => <button className="student-card" key={student.id} onClick={async () => setProfile(await api<Profile>(`/api/students/${student.id}/profile`))}><div className={`student-avatar tone-${index % 5}`}>{student.name.slice(-1)}</div><div className="student-name"><strong>{student.name}</strong><span>{student.className} · {student.studentNo || '暂无学号'}</span></div><div className="student-rank"><span>综合排名</span><strong>#{student.rank}</strong><em>{student.weightedScore}</em></div><div className="student-facts"><span><BookMarked size={15} />课堂 {student.classroomAverage}</span><span><BookMarked size={15} />作业 {student.homeworkAverage}</span></div><div className="view-profile">查看画像 <ArrowRight size={15} /></div></button>)}</section>
    {!filtered.length && <Empty title="没有找到学生" text="试试其他姓名或学号。" />}
    {profile && <Modal title={`${profile.student.name} · 学习画像`} wide onClose={() => setProfile(undefined)}><div className="profile-head"><div className="profile-person"><div className="student-avatar tone-0">{profile.student.name.slice(-1)}</div><div><h3>{profile.student.name}</h3><p>{profile.student.className} · 已完成 {profile.submissions} 次学习任务</p></div></div><div className="profile-scoreboard"><div><Medal /><span>综合排名</span><strong>{profile.rank}<small> / {profile.totalStudents}</small></strong></div><div><span>课堂均分 · 30%</span><strong>{profile.classroomAverage}</strong></div><div><span>作业均分 · 70%</span><strong>{profile.homeworkAverage}</strong></div><div className="weighted"><span>加权总成绩</span><strong>{profile.weightedScore}</strong></div></div><div className="profile-summary"><TrendingUp size={20} /><p>{profile.summary}</p></div></div>
      <div className="profile-grid"><div className="profile-block"><h3>知识点掌握</h3><div className="mastery-list">{profile.mastery.map(item => <div key={item.id}><span>{item.name}</span><div><i style={{ width: `${item.value}%` }} /></div><strong>{item.value}%</strong></div>)}</div></div><div className="profile-block"><h3>能力维度</h3>{profile.abilities.length ? <ResponsiveContainer width="100%" height={250}><RadarChart data={profile.abilities}><PolarGrid stroke="#dfe4dd" /><PolarAngleAxis dataKey="name" tick={{ fontSize: 12 }} /><Radar dataKey="value" stroke="#275d56" fill="#275d56" fillOpacity={.22} /></RadarChart></ResponsiveContainer> : <Empty title="暂无能力数据" text="完成作答后自动形成。" />}</div><div className="profile-block wide"><div className="trend-head"><h3>历史表现趋势</h3><div><span><i className="classroom-line" />课堂检测</span><span><i className="homework-line" />课后作业</span></div></div>{profile.history.length ? <ResponsiveContainer width="100%" height={230}><LineChart data={profile.history}><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} /><Tooltip /><Line name="课堂检测" dataKey="classroom" stroke="#0969da" strokeWidth={3} dot={{ fill: '#0969da', strokeWidth: 0, r: 4 }} connectNulls /><Line name="课后作业" dataKey="homework" stroke="#bf8700" strokeWidth={3} dot={{ fill: '#bf8700', strokeWidth: 0, r: 4 }} connectNulls /></LineChart></ResponsiveContainer> : <Empty title="暂无趋势" text="至少完成一次检测或作业后显示。" />}</div></div>
    </Modal>}
  </>
}
