import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Camera, Check, CheckCircle2, ChevronRight, Clock3, GraduationCap, Lightbulb, LoaderCircle, RefreshCw, Send, Sparkles, Target, Upload, XCircle } from 'lucide-react'
import type { Assessment, Course, Practice, Question, Student, Submission } from '../../shared/types'
import { api, post, questionTypeLabel } from '../api'
import { Empty, Modal, Toast } from '../components'
import { MarkdownContent } from '../MarkdownContent'

type SafeQuestion = Omit<Question, 'answer' | 'explanation' | 'rubric'>
type Classroom = { assessment: Assessment; course: Course; questions: SafeQuestion[]; submittedCount: number }
type Result = Submission & { questions: Question[] }
type AnswerDraft = { answer: string | string[]; imageUrl?: string; extractedText?: string; uploadNote?: string }

export default function StudentApp() {
  const [classroom, setClassroom] = useState<Classroom>()
  const [loadingClassroom, setLoadingClassroom] = useState(true)
  const [student, setStudent] = useState<Student>()
  const [started, setStarted] = useState(false)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({})
  const [result, setResult] = useState<Result>()
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [practice, setPractice] = useState<Practice>()
  const [toast, setToast] = useState<{ text: string; error?: boolean }>()
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { void loadClassroom() }, [])
  async function loadClassroom() {
    setLoadingClassroom(true)
    try {
      const assessmentId = new URLSearchParams(window.location.search).get('assessment')
      const data = await api<Classroom>(assessmentId ? `/api/classrooms/assessment/${encodeURIComponent(assessmentId)}` : '/api/classrooms/active/current')
      setClassroom(data)
    } catch (error) { setClassroom(undefined); setToast({ text: (error as Error).message, error: true }) } finally { setLoadingClassroom(false) }
  }
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!classroom) return; const form = new FormData(event.currentTarget); const joined = await post<Student>('/api/students/join', Object.fromEntries(form)); setStudent(joined); localStorage.setItem(`zhixing-student-${classroom.assessment.id}`, JSON.stringify(joined))
  }
  const question = classroom?.questions[current]
  const draft = question ? answers[question.id] || { answer: question.type === 'multiple' ? [] : '' } : undefined
  function setAnswer(value: string | string[]) { if (!question) return; setAnswers(previous => ({ ...previous, [question.id]: { ...previous[question.id], answer: value } })) }
  async function uploadAnswer(file?: File) {
    if (!question || !file) return; setUploading(true); const form = new FormData(); form.append('image', file)
    try { const uploaded = await api<{ imageUrl: string; text: string; note: string }>('/api/answers/image', { method: 'POST', body: form }); setAnswers(previous => ({ ...previous, [question.id]: { ...previous[question.id], answer: previous[question.id]?.answer || '', imageUrl: uploaded.imageUrl, extractedText: uploaded.text, uploadNote: uploaded.note } })); setToast({ text: uploaded.note }) } catch (error) { setToast({ text: (error as Error).message, error: true }) } finally { setUploading(false) }
  }
  async function submit() {
    if (!classroom || !student) return; setSubmitting(true)
    try { const data = await post<Result>('/api/submissions', { assessmentId: classroom.assessment.id, studentId: student.id, answers: classroom.questions.map(item => ({ questionId: item.id, ...(answers[item.id] || { answer: '' }) })) }); setResult(data); setStarted(false); scrollTo(0, 0) } catch (error) { setToast({ text: (error as Error).message, error: true }) } finally { setSubmitting(false) }
  }
  async function startPractice(knowledgePointId: string, mode: Practice['mode']) {
    if (!student) return; try { setPractice(await post<Practice>('/api/practices', { studentId: student.id, knowledgePointId, mode })) } catch (error) { setToast({ text: (error as Error).message, error: true }) }
  }

  if (!classroom) return <div className="student-shell join-screen lesson-select-screen"><header className="student-brand"><div><GraduationCap size={23} /></div><span><strong>知行课堂</strong><small>机械原理 · 课堂检测</small></span></header><main className="lesson-select"><h1>{loadingClassroom ? '正在连接课堂…' : '当前没有已发布的检测'}</h1><p>{loadingClassroom ? '已连接教师热点，正在获取课堂内容。' : '请等待教师发布后重新检查。'}</p><button className="student-btn" disabled={loadingClassroom} onClick={() => loadClassroom()}>{loadingClassroom ? <LoaderCircle className="spin" /> : <>重新检查 <RefreshCw size={18} /></>}</button></main>{toast && <Toast message={toast.text} type="error" onDone={() => setToast(undefined)} />}</div>
  if (!student) return <div className="student-shell join-screen"><header className="student-brand"><div><GraduationCap size={23} /></div><span><strong>知行课堂</strong><small>机械原理 · 课堂检测</small></span></header><main className="join-card identity"><div className="course-mini"><BookOpen size={20} /><span><small>{classroom.course.grade} · {classroom.course.subject}</small><strong>{classroom.assessment.title}</strong></span></div><h1>填写课堂信息</h1><form onSubmit={join}><label>班级<select name="className" defaultValue="23级机械设计1班"><option>23级机械设计1班</option><option>23级机械设计2班</option><option>23级智能制造1班</option></select></label><label>姓名<input name="name" required autoFocus placeholder="请输入姓名" /></label><label>学号（选填）<input name="studentNo" placeholder="例如：2023001" /></label><button className="student-btn">进入课堂 <ArrowRight size={19} /></button></form></main></div>
  if (result) return <StudentResult result={result} classroom={classroom} student={student} onPractice={startPractice} onBack={() => { setResult(undefined); setAnswers({}); setCurrent(0) }} practice={practice} closePractice={() => setPractice(undefined)} />
  if (!started) return <div className="student-shell"><StudentHeader student={student} /><main className="student-home"><span className="student-eyebrow">课堂检测</span><h1>{classroom.assessment.title}</h1><p>{classroom.assessment.description}</p><div className="test-facts"><span><b>{classroom.questions.length}</b> 道图示题</span><span><b>{classroom.assessment.timeLimit}</b> 分钟</span><span><b>{classroom.submittedCount}</b> 人参与</span></div><div className="before-note"><Lightbulb size={20} /><p>仔细观察机构简图中的构件、齿数和转向箭头。提交后将立即生成逐题诊断，并同步更新班级学情。</p></div><button className="student-btn" onClick={() => setStarted(true)}>开始答题 <ChevronRight size={19} /></button></main></div>
  if (!question || !draft) return null
  const progress = (current + 1) / classroom.questions.length * 100
  return <div className="student-shell answer-shell"><StudentHeader student={student} compact /><div className="answer-progress"><i style={{ width: `${progress}%` }} /></div><main className="answer-main"><div className="question-top"><span>第 {current + 1} / {classroom.questions.length} 题</span><div><i>{questionTypeLabel[question.type]}</i><i>{question.maxScore} 分</i></div></div><div className="student-question"><MarkdownContent content={question.stem} /></div>{question.formula && <div className="formula-hint"><Sparkles size={16} />本题考查公式理解与应用，请写清关键步骤</div>}
    {(question.type === 'single' || question.type === 'truefalse') && <div className="student-options">{question.options?.map((option, index) => { const key = question.type === 'truefalse' ? option : String.fromCharCode(65 + index); return <button className={draft.answer === key ? 'selected' : ''} key={key} onClick={() => setAnswer(key)}><span>{draft.answer === key ? <Check size={17} /> : question.type === 'truefalse' ? '' : key}</span>{option}</button> })}</div>}
    {question.type === 'multiple' && <div className="student-options">{question.options?.map((option, index) => { const key = String.fromCharCode(65 + index); const values = draft.answer as string[]; return <button className={values.includes(key) ? 'selected' : ''} key={key} onClick={() => setAnswer(values.includes(key) ? values.filter(item => item !== key) : [...values, key])}><span>{values.includes(key) ? <Check size={17} /> : key}</span>{option}</button> })}</div>}
    {(question.type === 'blank' || question.type === 'short') && <div className="written-answer"><textarea rows={question.type === 'short' ? 7 : 3} value={draft.answer as string} onChange={event => setAnswer(event.target.value)} placeholder={question.type === 'short' ? '在这里输入解题过程与答案…' : '请输入答案…'} /><div className="or"><span>或</span></div><input ref={fileRef} hidden type="file" accept="image/*" capture="environment" onChange={event => uploadAnswer(event.target.files?.[0])} /><button className={`photo-upload ${draft.imageUrl ? 'uploaded' : ''}`} onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <><LoaderCircle className="spin" />正在识别手写内容…</> : draft.imageUrl ? <><img src={draft.imageUrl} /><span><CheckCircle2 />图片已上传<small>{draft.uploadNote}</small></span></> : <><Camera /><span><b>拍照提交手写过程</b><small>请保持画面清晰、完整</small></span><Upload size={17} /></>}</button>{draft.extractedText && <div className="ocr-preview"><span>识别结果</span><MarkdownContent content={draft.extractedText} compact /></div>}</div>}
  </main><footer className="answer-footer"><button className="prev" disabled={current === 0} onClick={() => setCurrent(value => value - 1)}><ArrowLeft />上一题</button>{current < classroom.questions.length - 1 ? <button className="next" onClick={() => setCurrent(value => value + 1)}>下一题<ArrowRight /></button> : <button className="submit" disabled={submitting} onClick={submit}>{submitting ? <><LoaderCircle className="spin" />正在生成诊断…</> : <><Send />提交并查看诊断</>}</button>}</footer>{toast && <Toast message={toast.text} type={toast.error ? 'error' : 'success'} onDone={() => setToast(undefined)} />}</div>
}

function StudentHeader({ student, compact }: { student: Student; compact?: boolean }) {
  return <header className={`student-topbar ${compact ? 'compact' : ''}`}><div className="student-brand"><div><GraduationCap size={21} /></div><span><strong>知行课堂</strong>{!compact && <small>诊断 · 反馈 · 提高</small>}</span></div><div className="student-user">{student.name.slice(-1)}</div></header>
}

function StudentResult({ result, classroom, student, onPractice, onBack, practice, closePractice }: { result: Result; classroom: Classroom; student: Student; onPractice: (id: string, mode: Practice['mode']) => void; onBack: () => void; practice?: Practice; closePractice: () => void }) {
  const [open, setOpen] = useState(0); const rate = Math.round(result.totalScore / result.maxScore * 100)
  return <div className="student-shell result-shell"><StudentHeader student={student} /><main><section className="result-hero"><div className="result-ring" style={{ '--score': `${rate * 3.6}deg` } as React.CSSProperties}><div><strong>{result.totalScore}</strong><span>/ {result.maxScore} 分</span></div></div><div><span>诊断已完成</span><h1>{rate >= 85 ? '掌握得很不错！' : rate >= 60 ? '关键思路已经掌握' : '找到问题，就是进步的开始'}</h1><p>下面的反馈来自你的实际作答，可以从薄弱处继续练习。</p></div></section><section className="result-summary"><span><CheckCircle2 />答对 {result.answers.filter(item => item.correct).length} 题</span><span><Target />整体掌握 {rate}%</span><span><Clock3 />诊断已保存</span></section><section className="diagnosis-list"><h2>逐题诊断</h2>{result.answers.map((answer, index) => { const question = result.questions.find(item => item.id === answer.questionId); const kp = question?.knowledgePointId; return <article className={`diagnosis-card ${answer.correct ? 'correct' : 'wrong'}`} key={answer.questionId}><button className="diagnosis-head" onClick={() => setOpen(open === index ? -1 : index)}><span>{answer.correct ? <CheckCircle2 /> : <XCircle />}</span><div><small>第 {index + 1} 题 · {question ? questionTypeLabel[question.type] : ''}</small><strong>{answer.correct ? '回答正确' : `${answer.score} / ${question?.maxScore || 0} 分`}</strong></div><ChevronRight className={open === index ? 'rotate' : ''} /></button>{open === index && <div className="diagnosis-body"><div className="question-stem"><MarkdownContent content={question?.stem} compact /></div><div className="answer-compare"><div><span>你的答案</span><MarkdownContent content={String(Array.isArray(answer.answer) ? answer.answer.join('、') : answer.answer || answer.extractedText || '未作答')} compact /></div><div><span>参考答案</span><MarkdownContent content={String(Array.isArray(question?.answer) ? question?.answer.join('、') : question?.answer || '')} compact /></div></div><div className="diagnosis-copy"><span>诊断</span><MarkdownContent content={answer.diagnosis.summary} compact />{answer.diagnosis.errorReason && <><b>问题原因：</b><MarkdownContent content={answer.diagnosis.errorReason} compact /></>}<b>相关概念：</b><MarkdownContent content={answer.diagnosis.relatedConcept} compact /><b>提高建议：</b><MarkdownContent content={answer.diagnosis.suggestion} compact /></div>{!answer.correct && kp && <div className="practice-actions"><span>针对这个知识点继续练</span><button onClick={() => onPractice(kp, 'similar')}>相似题</button><button onClick={() => onPractice(kp, 'formula')}>公式默写</button><button onClick={() => onPractice(kp, 'recall')}>概念回忆</button></div>}</div>}</article>})}</section><button className="student-secondary-btn" onClick={onBack}><RefreshCw />返回课堂首页</button></main>{practice && <Modal title="强化练习" onClose={closePractice}><div className="practice-modal"><span className="student-eyebrow">{practice.mode === 'formula' ? '公式默写' : practice.mode === 'recall' ? '概念回忆' : '相似题'}</span><MarkdownContent content={`### ${practice.question.stem}`} /><textarea rows={5} placeholder="先独立作答，再查看提示" /><details><summary>查看参考与提示</summary><MarkdownContent content={`${Array.isArray(practice.question.answer) ? practice.question.answer.join('、') : practice.question.answer}\n\n${practice.question.explanation}`} compact /></details><button className="student-btn" onClick={closePractice}>完成本次练习 <Check /></button></div></Modal>}</div>
}
