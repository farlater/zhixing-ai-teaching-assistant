import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Edit3, Library, RefreshCw, Sparkles, WandSparkles } from 'lucide-react'
import type { Course, Difficulty, GenerateConfig, KnowledgePoint, Question, QuestionType } from '../../shared/types'
import { api, patch, post, questionTypeLabel } from '../api'
import { Empty, Modal, Spinner, Toast } from '../components'
import { MarkdownContent } from '../MarkdownContent'

type CourseView = Course & { knowledgePoints: KnowledgePoint[]; materials: unknown[] }
const types: QuestionType[] = ['single', 'multiple', 'truefalse', 'blank', 'short']

export default function Questions() {
  const [courses, setCourses] = useState<CourseView[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [bankQuestions, setBankQuestions] = useState<Question[]>([])
  const [bankQuestionIds, setBankQuestionIds] = useState<string[]>([])
  const [courseId, setCourseId] = useState('')
  const [pointIds, setPointIds] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<QuestionType[]>(['single', 'blank', 'short'])
  const [difficulty, setDifficulty] = useState<Difficulty>('进阶')
  const [source, setSource] = useState<GenerateConfig['source']>('ai')
  const [mixedMode, setMixedMode] = useState<NonNullable<GenerateConfig['mixedMode']>>('numeric-variant')
  const [count, setCount] = useState(4)
  const [generating, setGenerating] = useState(false)
  const [editing, setEditing] = useState<Question>()
  const [toast, setToast] = useState<{ text: string; error?: boolean }>()
  useEffect(() => { api<CourseView[]>('/api/courses').then(list => { setCourses(list); if (list[0]) { setCourseId(list[0].id); setPointIds(list[0].knowledgePoints.map(point => point.id)) } }) }, [])
  useEffect(() => { if (courseId) api<Question[]>(`/api/questions?courseId=${courseId}`).then(list => { const bank = list.filter(item => item.status === 'confirmed' && item.source === 'bank'); setQuestions(list.filter(item => item.status === 'draft')); setBankQuestions(bank); setBankQuestionIds(bank.map(item => item.id)) }) }, [courseId])
  const course = courses.find(item => item.id === courseId)
  const toggle = <T,>(items: T[], value: T, setter: (items: T[]) => void) => setter(items.includes(value) ? items.filter(item => item !== value) : [...items, value])
  async function generate() {
    setGenerating(true)
    try {
      const created = await post<Question[]>('/api/questions/generate', { courseId, knowledgePointIds: pointIds, count, types: selectedTypes, difficulty, source, bankQuestionIds, mixedMode })
      setQuestions(previous => [...created, ...previous]); setToast({ text: `已生成 ${created.length} 道题，请预览确认` })
    } catch (error) { setToast({ text: (error as Error).message, error: true }) } finally { setGenerating(false) }
  }
  async function confirmAll() {
    const ids = questions.map(item => item.id); if (!ids.length) return
    await post('/api/questions/confirm', { ids }); setQuestions([]); setToast({ text: '题目已确认，可用于创建课堂检测' })
  }
  const materialReady = useMemo(() => course?.materials.length || 0, [course])
  const eligibleBankQuestions = useMemo(() => bankQuestions.filter(question => pointIds.includes(question.knowledgePointId) && selectedTypes.includes(question.type)), [bankQuestions, pointIds, selectedTypes])
  const selectedEligibleBankCount = eligibleBankQuestions.filter(question => bankQuestionIds.includes(question.id)).length
  if (!courses.length) return <Spinner label="正在读取出题配置" />
  return <div className="question-layout">
    <section className="generator panel">
      <div className="panel-head"><div><h2>出题设置</h2><p>使用选定知识点与课程资料</p></div></div>
      <div className="form"><label>选择课程<select value={courseId} onChange={event => { const value = event.target.value; setCourseId(value); setPointIds(courses.find(item => item.id === value)?.knowledgePoints.map(point => point.id) || []) }}>{courses.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <div className="source-note"><Library size={18} /><div><strong>课程上下文已就绪</strong><span>{course?.knowledgePoints.length || 0} 个知识点 · {materialReady} 份资料</span></div></div>
        <fieldset><legend>知识点 <button onClick={() => setPointIds(course?.knowledgePoints.map(point => point.id) || [])}>全选</button></legend><div className="check-list">{course?.knowledgePoints.map(point => <label key={point.id} className={pointIds.includes(point.id) ? 'checked' : ''}><input type="checkbox" checked={pointIds.includes(point.id)} onChange={() => toggle(pointIds, point.id, setPointIds)} /><span><Check size={13} /></span>{point.name}</label>)}</div></fieldset>
        <fieldset><legend>题型</legend><div className="chip-list">{types.map(type => <button key={type} className={selectedTypes.includes(type) ? 'active' : ''} onClick={() => toggle(selectedTypes, type, setSelectedTypes)}>{questionTypeLabel[type]}</button>)}</div></fieldset>
        <div className="form-row"><label>题目数量<input type="number" min="1" max="20" value={count} onChange={event => setCount(Number(event.target.value))} /></label><label>难度<select value={difficulty} onChange={event => setDifficulty(event.target.value as Difficulty)}><option>基础</option><option>进阶</option><option>挑战</option></select></label></div>
        <fieldset><legend>题目来源</legend><div className="source-options"><button className={source === 'ai' ? 'active' : ''} onClick={() => setSource('ai')}><Sparkles size={18} /><span><b>AI 生成</b><small>基于课程资料</small></span></button><button className={source === 'mixed' ? 'active' : ''} onClick={() => setSource('mixed')}><RefreshCw size={18} /><span><b>混合模式</b><small>从题库生成变式</small></span></button><button className={source === 'bank' ? 'active' : ''} onClick={() => setSource('bank')}><Library size={18} /><span><b>仅题库</b><small>直接选择已有题目</small></span></button></div></fieldset>
        {source === 'mixed' && <label>混合方式<select value={mixedMode} onChange={event => setMixedMode(event.target.value as NonNullable<GenerateConfig['mixedMode']>)}><option value="numeric-variant">AI 修改题库数值并重算答案</option><option value="supplement">题库优先，不足题量由 AI 补充</option></select></label>}
        {(source === 'bank' || source === 'mixed') && <fieldset className="bank-picker"><legend>选择题库题目 <span>符合当前知识点与题型 {eligibleBankQuestions.length} 道</span></legend><div>{eligibleBankQuestions.map(question => <label className={bankQuestionIds.includes(question.id) ? 'selected' : ''} key={question.id}><input type="checkbox" checked={bankQuestionIds.includes(question.id)} onChange={() => toggle(bankQuestionIds, question.id, setBankQuestionIds)} /><span><Check size={14} /></span><div><MarkdownContent content={question.stem} compact /><small>{questionTypeLabel[question.type]} · {question.maxScore} 分</small></div></label>)}</div>{!eligibleBankQuestions.length && <p className="bank-empty">当前筛选条件下没有题库题目，请到“课程与资料”添加。</p>}</fieldset>}
        <button className="btn primary generate-btn" disabled={generating || !pointIds.length || !selectedTypes.length || (source !== 'ai' && !selectedEligibleBankCount)} onClick={generate}>{generating ? <><span className="spinner small" />正在依据资料生成…</> : <><WandSparkles size={18} />生成诊断题</>}</button>
      </div>
    </section>
    <section className="preview panel"><div className="panel-head"><div><h2>题目预览</h2><p>可逐题修改后统一确认</p></div><div className="preview-actions">{questions.length > 0 && <button className="btn small primary" onClick={confirmAll}><Check size={16} />确认全部</button>}</div></div>
      {questions.length ? <div className="question-list">{questions.map((question, index) => <article className="question-card" key={question.id}><div className="question-meta"><span className="question-index">{String(index + 1).padStart(2, '0')}</span><span>{questionTypeLabel[question.type]}</span><span>{question.difficulty}</span><span>{course?.knowledgePoints.find(point => point.id === question.knowledgePointId)?.name}</span><button className="icon-btn" onClick={() => setEditing(question)}><Edit3 size={16} /></button></div><MarkdownContent content={question.stem} />{question.options && <div className="option-preview">{question.options.map((option, optionIndex) => <div key={optionIndex}><b>{String.fromCharCode(65 + optionIndex)}</b>{option}</div>)}</div>}<div className="answer-box"><span>参考答案</span><strong>{Array.isArray(question.answer) ? question.answer.join('、') : question.answer}</strong><MarkdownContent content={question.explanation} compact /></div><div className="question-foot"><span>{question.maxScore} 分</span><span>{question.abilities.join(' · ')}</span><span className="ai-source"><Sparkles size={13} />{question.source === 'ai' ? 'AI 生成' : '题库'}</span></div></article>)}</div> : <Empty title="等待生成题目" text="左侧完成设置后生成题目。题目不会直接发布，教师确认后才会进入课堂。" />}
    </section>
    {editing && <Modal title="编辑题目" wide onClose={() => setEditing(undefined)}><form className="form" onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); const updated = await patch<Question>(`/api/questions/${editing.id}`, { stem: form.get('stem'), answer: form.get('answer'), explanation: form.get('explanation'), maxScore: Number(form.get('maxScore')) }); setQuestions(list => list.map(item => item.id === updated.id ? updated : item)); setEditing(undefined); setToast({ text: '题目修改已保存' }) }}><label>题干<textarea name="stem" rows={4} defaultValue={editing.stem} required /></label><div className="form-row"><label>参考答案<input name="answer" defaultValue={Array.isArray(editing.answer) ? editing.answer.join(',') : editing.answer} required /></label><label>分值<input type="number" name="maxScore" min="1" defaultValue={editing.maxScore} /></label></div><label>解析<textarea name="explanation" rows={3} defaultValue={editing.explanation} /></label><div className="modal-actions"><button type="button" className="btn subtle" onClick={() => setEditing(undefined)}>取消</button><button className="btn primary">保存修改 <ChevronRight size={16} /></button></div></form></Modal>}
    {toast && <Toast message={toast.text} type={toast.error ? 'error' : 'success'} onDone={() => setToast(undefined)} />}
  </div>
}
