import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowDown, CheckCircle2, Lightbulb, RefreshCw, Target, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ClassReport } from '../../shared/types'
import { api, formatDate, post } from '../api'
import { Empty, ScoreRing, Spinner } from '../components'

type AssessmentOption = { id: string; title: string; status: string; submissionCount: number }
const chartColors = ['#275d56', '#d99d68', '#789b91', '#b96d5a', '#7a738e']

export default function Reports() {
  const [assessments, setAssessments] = useState<AssessmentOption[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [report, setReport] = useState<ClassReport>()
  const [loading, setLoading] = useState(true)
  const [refreshingDiagnosis, setRefreshingDiagnosis] = useState(false)
  const [diagnosisError, setDiagnosisError] = useState('')
  useEffect(() => { api<AssessmentOption[]>('/api/assessments').then(list => { setAssessments(list); const id = list.find(item => item.submissionCount > 0)?.id || list[0]?.id || ''; setSelectedId(id) }) }, [])
  useEffect(() => {
    if (!selectedId) return
    let active = true
    setLoading(true)
    const load = () => api<ClassReport>(`/api/reports/${selectedId}`).then(data => { if (active) setReport(data) }).finally(() => { if (active) setLoading(false) })
    void load()
    const timer = window.setInterval(() => { void load() }, 4000)
    return () => { active = false; window.clearInterval(timer) }
  }, [selectedId])
  async function refreshDiagnosis() {
    setRefreshingDiagnosis(true); setDiagnosisError('')
    try { setReport(await post<ClassReport>(`/api/reports/${selectedId}/diagnosis/refresh`)) }
    catch (error) { setDiagnosisError((error as Error).message) }
    finally { setRefreshingDiagnosis(false) }
  }
  if (!assessments.length) return <Empty title="还没有可分析的课堂" text="学生完成一次课堂检测后，这里会形成学情报告。" />
  if (loading || !report) return <Spinner label="正在计算真实作答数据" />
  const weakest = [...report.knowledgeMastery].sort((a, b) => a.value - b.value)[0]
  const hardest = [...report.questionStats].sort((a, b) => a.accuracy - b.accuracy)[0]
  return <>
    <section className="report-toolbar"><div><span>当前报告</span><select value={selectedId} onChange={event => setSelectedId(event.target.value)}>{assessments.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></div><div className="report-status"><span className="status-dot" />统计实时更新 · {report.submittedCount} 份作答</div></section>
    <section className="report-summary">
      <div className="report-score panel"><ScoreRing value={report.accuracy} label="整体掌握" size={138} /><div><span>班级平均分</span><strong>{report.averageScore}</strong><small>本次检测原始分</small></div></div>
      <div className="insight-card warm"><div className="insight-icon"><Target /></div><div><span>最薄弱知识点</span><strong>{weakest?.name || '暂无'}</strong><p>掌握度 {weakest?.value || 0}%，建议优先回讲</p></div><ArrowDown /></div>
      <div className="insight-card rose"><div className="insight-icon"><AlertTriangle /></div><div><span>区分度较高题目</span><strong>第 {hardest?.index || 0} 题</strong><p>仅 {hardest?.accuracy || 0}% 的学生完整答对</p></div><ArrowDown /></div>
      <div className="insight-card sage"><div className="insight-icon"><Users /></div><div><span>重点关注</span><strong>{report.students.filter(item => item.rate < 60).length} 名学生</strong><p>建议安排基础回忆练习</p></div><ArrowDown /></div>
    </section>
    <section className="report-grid">
      <div className="panel chart-panel"><div className="panel-head"><div><h2>知识点掌握度</h2><p>按实际得分 / 对应知识点总分计算</p></div></div><ResponsiveContainer width="100%" height={260}><BarChart data={report.knowledgeMastery} layout="vertical" margin={{ left: 16, right: 24 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e8e2" /><XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} unit="%" /><YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: '#f5f6f2' }} formatter={value => `${value}%`} /><Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>{report.knowledgeMastery.map((item, index) => <Cell fill={item.value < 70 ? '#d99d68' : '#275d56'} key={index} />)}</Bar></BarChart></ResponsiveContainer></div>
      <div className="panel chart-panel"><div className="panel-head"><div><h2>成绩分布</h2><p>观察班级差异与集中区间</p></div></div><ResponsiveContainer width="100%" height={260}><BarChart data={report.scoreDistribution}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e8e2" /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: '#f5f6f2' }} /><Bar dataKey="value" fill="#789b91" radius={[6, 6, 0, 0]} barSize={34} /></BarChart></ResponsiveContainer></div>
      <div className="panel chart-panel"><div className="panel-head"><div><h2>常见错误类型</h2><p>来自每道题的诊断标签</p></div></div>{report.errorTypes.length ? <div className="pie-wrap"><ResponsiveContainer width="54%" height={230}><PieChart><Pie data={report.errorTypes} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3}>{report.errorTypes.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="legend">{report.errorTypes.map((item, index) => <span key={item.name}><i style={{ background: chartColors[index % chartColors.length] }} /><b>{item.name}</b><em>{item.value} 次</em></span>)}</div></div> : <Empty title="暂无错误标签" text="当前作答全部正确或尚无诊断。" />}</div>
      <div className="panel suggestion-panel"><div className="panel-head"><div><h2>AI 教学诊断</h2><p>文字诊断手动更新，统计数据保持实时</p></div><div className="diagnosis-actions"><span className="ai-label"><Lightbulb size={14} />{report.diagnosis.source === 'preset' ? '预置诊断' : report.diagnosis.source === 'bailian' ? '百炼诊断' : '本地诊断'}</span><button className="btn mini" onClick={refreshDiagnosis} disabled={refreshingDiagnosis}>{refreshingDiagnosis ? <span className="spinner small" /> : <RefreshCw size={14} />}更新诊断</button></div></div><div className="diagnosis-summary"><strong>诊断结论</strong><p>{report.diagnosis.summary}</p><small>上次更新：{formatDate(report.diagnosis.updatedAt)}</small></div><div className="suggestion-list">{report.suggestions.map((text, index) => <div key={text}><span>{index + 1}</span><p>{text}</p></div>)}</div>{diagnosisError && <p className="inline-error">{diagnosisError}</p>}<a href="/teacher/assistant" className="btn primary">继续追问教学助教</a></div>
    </section>
    <section className="panel question-analysis"><div className="panel-head"><div><h2>逐题分析</h2><p>定位问题发生在哪一道题、哪个步骤</p></div></div><div className="analysis-table"><div className="table-head"><span>题目</span><span>平均得分</span><span>正确率</span><span>判断</span></div>{report.questionStats.map(item => <div className="table-row" key={item.id}><div><b>第 {item.index} 题</b><p>{item.stem}</p></div><span>{item.average} / {item.maxScore}</span><div className="accuracy-cell"><div><i style={{ width: `${item.accuracy}%` }} /></div><b>{item.accuracy}%</b></div><span>{item.accuracy >= 80 ? <em className="good"><CheckCircle2 size={14} />掌握稳定</em> : item.accuracy >= 60 ? <em className="medium">需要巩固</em> : <em className="weak"><AlertTriangle size={14} />建议回讲</em>}</span></div>)}</div></section>
  </>
}
