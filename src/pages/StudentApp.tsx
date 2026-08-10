import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Camera, Check, CheckCircle2, ChevronRight, Clock3, GraduationCap, Image as ImageIcon, Lightbulb, LoaderCircle, RefreshCw, Send, Sparkles, Target, Upload, XCircle } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Assessment, Course, Diagnosis, Practice, Question, Student, Submission } from '../../shared/types'
import { api, post, questionTypeLabel } from '../api'
import { Empty, Modal, Toast } from '../components'

type SafeQuestion = Omit<Question, 'answer' | 'explanation' | 'rubric'>
type Classroom = { assessment: Assessment; course: Course; questions: SafeQuestion[]; submittedCount: number }
type Result = Submission & { questions: Question[] }
type AnswerDraft = { answer: string | string[]; imageUrl?: string; extractedText?: string; uploadNote?: string }

export default function StudentApp() {
  const params = useParams(); const navigate = useNavigate()
  const [code, setCode] = useState((params.code || '').toUpperCase())
  const [classroom, setClassroom] = useState<Classroom>()
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
  useEffect(() => { if (params.code) void loadClass(params.code) }, [params.code])
  async function loadClass(value = code) {
    try {
      const data = await api<Classroom>(`/api/classrooms/${value.trim()}`); setClassroom(data); setCode(value.toUpperCase())
      const cached = localStorage.getItem(`zhixing-student-${value.toUpperCase()}`); if (cached) setStudent(JSON.parse(cached))
      if (!params.code) navigate(`/join/${value.toUpperCase()}`, { replace: true })
    } catch (error) { setToast({ text: (error as Error).message, error: true }) }
  }
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const joined = await post<Student>('/api/students/join', Object.fromEntries(form)); setStudent(joined); localStorage.setItem(`zhixing-student-${code}`, JSON.stringify(joined))
  }
  const question = classroom?.questions[current]
  const draft = question ? answers[question.id] || { answer: question.type === 'multiple' ? [] : '' } : undefined
  const totalScore = useMemo(() => result?.maxScore || 0, [result])
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

  if (!classroom) return <div className="student-shell join-screen"><header className="student-brand"><div><GraduationCap size={23} /></div><span><strong>知行课堂</strong><small>让每次作答都有回应</small></span></header><main className="join-card"><span className="student-eyebrow">加入课堂</span><h1>输入课堂码</h1><p>课堂码由老师在大屏幕上展示</p><form onSubmit={event => { event.preventDefault(); loadClass() }}><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={8} autoFocus placeholder="如 MATH8" /><button className="student-btn" disabled={!code.trim()}>进入课堂 <ArrowRight size={19} /></button></form><Link to="/" className="back-home"><ArrowLeft size={15} />返回身份选择</Link></main>{toast && <Toast message={toast.text} type="error" onDone={() => setToast(undefined)} />}</div>
  if (!student) return <div className="student-shell join-screen"><header className="student-brand"><div><GraduationCap size={23} /></div><span><strong>知行课堂</strong><small>课堂码 {classroom.assessment.joinCode}</small></span></header><main className="join-card identity"><div className="course-mini"><BookOpen size={20} /><span><small>{classroom.course.grade} · {classroom.course.subject}</small><strong>{classroom.assessment.title}</strong></span></div><h1>告诉老师你是谁</h1><p>姓名将用于形成你的个人学习反馈</p><form onSubmit={join}><label>姓名<input name="name" required autoFocus placeholder="请输入真实姓名" /></label><label>班级<input name="className" defaultValue="八年级 2 班" placeholder="如：八年级 2 班" /></label><label>学号（选填）<input name="studentNo" placeholder="用于区分同名学生" /></label><button className="student-btn">确认加入 <ArrowRight size={19} /></button></form></main></div>
  if (result) return <StudentResult result={result} classroom={classroom} student={student} onPractice={startPractice} onBack={() => { setResult(undefined); setAnswers({}); setCurrent(0) }} practice={practice} closePractice={() => setPractice(undefined)} />
  if (!started) return <div className="student-shell"><StudentHeader student={student} /><main className="student-home"><span className="student-eyebrow">课堂检测</span><h1>{classroom.assessment.title}</h1><p>{classroom.assessment.description}</p><div className="test-facts"><span><b>{classroom.questions.length}</b> 道题</span><span><b>{classroom.assessment.timeLimit}</b> 分钟</span><span><b>{classroom.submittedCount}</b> 人已提交</span></div><div className="before-note"><Lightbulb size={20} /><p>遇到解答题时，可以直接输入，也可以拍照上传手写过程。提交后会立即收到分步诊断。</p></div><button className="student-btn" onClick={() => setStarted(true)}>开始答题 <ChevronRight size={19} /></button></main></div>
  if (!question || !draft) return null
  const progress = (current + 1) / classroom.questions.length * 100
  return <div className="student-shell answer-shell"><StudentHeader student={student} compact /><div className="answer-progress"><i style={{ width: `${progress}%` }} /></div><main className="answer-main"><div className="question-top"><span>第 {current + 1} / {classroom.questions.length} 题</span><div><i>{questionTypeLabel[question.type]}</i><i>{question.maxScore} 分</i></div></div><h1>{question.stem}</h1>{question.formula && <div className="formula-hint"><Sparkles size={16} />本题考查公式理解与应用，请写清关键步骤</div>}
    {(question.type === 'single' || question.type === 'truefalse') && <div className="student-options">{question.options?.map((option, index) => { const key = question.type === 'truefalse' ? option : String.fromCharCode(65 + index); return <button className={draft.answer === key ? 'selected' : ''} key={key} onClick={() => setAnswer(key)}><span>{draft.answer === key ? <Check size={17} /> : question.type === 'truefalse' ? '' : key}</span>{option}</button> })}</div>}
    {question.type === 'multiple' && <div className="student-options">{question.options?.map((option, index) => { const key = String.fromCharCode(65 + index); const values = draft.answer as string[]; return <button className={values.includes(key) ? 'selected' : ''} key={key} onClick={() => setAnswer(values.includes(key) ? values.filter(item => item !== key) : [...values, key])}><span>{values.includes(key) ? <Check size={17} /> : key}</span>{option}</button> })}</div>}
    {(question.type === 'blank' || question.type === 'short') && <div className="written-answer"><textarea rows={question.type === 'short' ? 7 : 3} value={draft.answer as string} onChange={event => setAnswer(event.target.value)} placeholder={question.type === 'short' ? '在这里输入解题过程与答案…' : '请输入答案…'} /><div className="or"><span>或</span></div><input ref={fileRef} hidden type="file" accept="image/*" capture="environment" onChange={event => uploadAnswer(event.target.files?.[0])} /><button className={`photo-upload ${draft.imageUrl ? 'uploaded' : ''}`} onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <><LoaderCircle className="spin" />正在识别手写内容…</> : draft.imageUrl ? <><img src={draft.imageUrl} /><span><CheckCircle2 />图片已上传<small>{draft.uploadNote}</small></span></> : <><Camera /><span><b>拍照提交手写过程</b><small>请保持画面清晰、完整</small></span><Upload size={17} /></>}</button>{draft.extractedText && <div className="ocr-preview"><span>识别结果</span><p>{draft.extractedText}</p></div>}</div>}
  </main><footer className="answer-footer"><button className="prev" disabled={current === 0} onClick={() => setCurrent(value => value - 1)}><ArrowLeft />上一题</button>{current < classroom.questions.length - 1 ? <button className="next" onClick={() => setCurrent(value => value + 1)}>下一题<ArrowRight /></button> : <button className="submit" disabled={submitting} onClick={submit}>{submitting ? <><LoaderCircle className="spin" />正在生成诊断…</> : <><Send />提交并查看诊断</>}</button>}</footer>{toast && <Toast message={toast.text} type={toast.error ? 'error' : 'success'} onDone={() => setToast(undefined)} />}</div>
}

function StudentHeader({ student, compact }: { student: Student; compact?: boolean }) {
  return <header className={`student-topbar ${compact ? 'compact' : ''}`}><div className="student-brand"><div><GraduationCap size={21} /></div><span><strong>知行课堂</strong>{!compact && <small>诊断 · 反馈 · 提高</small>}</span></div><div className="student-user">{student.name.slice(-1)}</div></header>
}

function StudentResult({ result, classroom, student, onPractice, onBack, practice, closePractice }: { result: Result; classroom: Classroom; student: Student; onPractice: (id: string, mode: Practice['mode']) => void; onBack: () => void; practice?: Practice; closePractice: () => void }) {
  const [open, setOpen] = useState(0); const rate = Math.round(result.totalScore / result.maxScore * 100)
  return <div className="student-shell result-shell"><StudentHeader student={student} /><main><section className="result-hero"><div className="result-ring" style={{ '--score': `${rate * 3.6}deg` } as React.CSSProperties}><div><strong>{result.totalScore}</strong><span>/ {result.maxScore} 分</span></div></div><div><span>诊断已完成</span><h1>{rate >= 85 ? '掌握得很不错！' : rate >= 60 ? '关键思路已经掌握' : '找到问题，就是进步的开始'}</h1><p>下面的反馈来自你的实际作答，可以从薄弱处继续练习。</p></div></section><section className="result-summary"><span><CheckCircle2 />答对 {result.answers.filter(item => item.correct).length} 题</span><span><Target />整体掌握 {rate}%</span><span><Clock3 />诊断已保存</span></section><section className="diagnosis-list"><h2>逐题诊断</h2>{result.answers.map((answer, index) => { const question = result.questions.find(item => item.id === answer.questionId); const kp = question?.knowledgePointId; return <article className={`diagnosis-card ${answer.correct ? 'correct' : 'wrong'}`} key={answer.questionId}><button className="diagnosis-head" onClick={() => setOpen(open === index ? -1 : index)}><span>{answer.correct ? <CheckCircle2 /> : <XCircle />}</span><div><small>第 {index + 1} 题 · {question ? questionTypeLabel[question.type] : ''}</small><strong>{answer.correct ? '回答正确' : `${answer.score} / ${question?.maxScore || 0} 分`}</strong></div><ChevronRight className={open === index ? 'rotate' : ''} /></button>{open === index && <div className="diagnosis-body"><p className="question-stem">{question?.stem}</p><div className="answer-compare"><div><span>你的答案</span><p>{Array.isArray(answer.answer) ? answer.answer.join('、') : answer.answer || answer.extractedText || '未作答'}</p></div><div><span>参考答案</span><p>{Array.isArray(question?.answer) ? question?.answer.join('、') : question?.answer}</p></div></div><div className="diagnosis-copy"><span>诊断</span><p>{answer.diagnosis.summary}</p>{answer.diagnosis.errorReason && <p><b>问题原因：</b>{answer.diagnosis.errorReason}</p>}<p><b>相关概念：</b>{answer.diagnosis.relatedConcept}</p><p><b>提高建议：</b>{answer.diagnosis.suggestion}</p></div>{!answer.correct && kp && <div className="practice-actions"><span>针对这个知识点继续练</span><button onClick={() => onPractice(kp, 'similar')}>相似题</button><button onClick={() => onPractice(kp, 'formula')}>公式默写</button><button onClick={() => onPractice(kp, 'recall')}>概念回忆</button></div>}</div>}</article>})}</section><button className="student-secondary-btn" onClick={onBack}><RefreshCw />返回课堂首页</button></main>{practice && <Modal title="强化练习" onClose={closePractice}><div className="practice-modal"><span className="student-eyebrow">{practice.mode === 'formula' ? '公式默写' : practice.mode === 'recall' ? '概念回忆' : '相似题'}</span><h3>{practice.question.stem}</h3><textarea rows={5} placeholder="先独立作答，再查看提示" /><details><summary>查看参考与提示</summary><p>{Array.isArray(practice.question.answer) ? practice.question.answer.join('、') : practice.question.answer}</p><small>{practice.question.explanation}</small></details><button className="student-btn" onClick={closePractice}>完成本次练习 <Check /></button></div></Modal>}</div>
}
