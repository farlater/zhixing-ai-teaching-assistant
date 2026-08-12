import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, BookOpen, CheckCircle2, FileQuestion, FileText, Layers3, LoaderCircle, MoreHorizontal, Pencil, PlayCircle, Plus, Trash2, Upload, Video, X } from 'lucide-react'
import type { Course, KnowledgePoint, Material, Question, QuestionImportJob, QuestionType } from '../../shared/types'
import { api, patch, post, questionTypeLabel, remove } from '../api'
import { Empty, Modal, Spinner, Toast } from '../components'
import { MarkdownContent } from '../MarkdownContent'

type QuestionImportView = QuestionImportJob & { questions: Question[] }
type CourseView = Course & {
  knowledgePoints: KnowledgePoint[]
  materials: Material[]
  questions: Question[]
  questionImports: QuestionImportView[]
  questionCount: number
  assessmentCount: number
}

export default function Courses() {
  const [courses, setCourses] = useState<CourseView[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [pointOpen, setPointOpen] = useState(false)
  const [editCourse, setEditCourse] = useState<CourseView>()
  const [deleteCourse, setDeleteCourse] = useState<CourseView>()
  const [deleteLocalFiles, setDeleteLocalFiles] = useState(false)
  const [courseMenu, setCourseMenu] = useState('')
  const [videoOpen, setVideoOpen] = useState(false)
  const [questionOpen, setQuestionOpen] = useState(false)
  const [questionType, setQuestionType] = useState<QuestionType>('single')
  const [reviewJob, setReviewJob] = useState<QuestionImportView>()
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([])
  const [editingQuestion, setEditingQuestion] = useState<Question>()
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const bankFileRef = useRef<HTMLInputElement>(null)
  const refresh = async () => {
    const list = await api<CourseView[]>('/api/courses')
    setCourses(list)
    setSelectedId((current) => (list.some((course) => course.id === current) ? current : list[0]?.id || ''))
    setLoading(false)
  }
  useEffect(() => {
    refresh()
  }, [])
  const selected = courses.find((course) => course.id === selectedId)
  const hasProcessingMaterial = Boolean(selected?.materials.some((material) => material.status === 'processing'))
  const hasProcessingImport = Boolean(selected?.questionImports?.some((job) => job.status === 'processing'))
  useEffect(() => {
    if (!hasProcessingMaterial && !hasProcessingImport) return
    const timer = window.setInterval(() => {
      void refresh()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [hasProcessingMaterial, hasProcessingImport, selectedId])

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await post('/api/courses', Object.fromEntries(form))
    setCreateOpen(false)
    setToast('课程已创建')
    await refresh()
  }
  async function createPoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    await post(`/api/courses/${selected.id}/knowledge-points`, Object.fromEntries(form))
    setPointOpen(false)
    setToast('知识点已添加')
    await refresh()
  }
  async function updateCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editCourse) return
    await patch(`/api/courses/${editCourse.id}`, Object.fromEntries(new FormData(event.currentTarget)))
    setEditCourse(undefined)
    setToast('课程信息已更新')
    await refresh()
  }
  async function confirmDeleteCourse() {
    if (!deleteCourse) return
    await api(`/api/courses/${deleteCourse.id}?deleteLocalFiles=${deleteLocalFiles}`, { method: 'DELETE' })
    setDeleteCourse(undefined)
    setDeleteLocalFiles(false)
    setSelectedId('')
    setToast('课程已删除')
    await refresh()
  }
  async function uploadVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    try {
      await api(`/api/courses/${selected.id}/tutorial-videos`, {
        method: 'POST',
        body: form,
      })
      setVideoOpen(false)
      setToast('讲解视频已关联到知识点')
      await refresh()
    } catch (error) {
      setToast((error as Error).message)
    }
  }
  async function addBankQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    try {
      await api(`/api/courses/${selected.id}/questions`, {
        method: 'POST',
        body: new FormData(event.currentTarget),
      })
      setQuestionOpen(false)
      setQuestionType('single')
      setToast('题目已加入课程题库')
      await refresh()
    } catch (error) {
      setToast((error as Error).message)
    }
  }
  async function uploadFile(file?: File) {
    if (!selected || !file) return
    const form = new FormData()
    form.append('file', file)
    try {
      const material = await api<Material>(`/api/courses/${selected.id}/materials`, { method: 'POST', body: form })
      setToast(material.status === 'processing' ? '资料已上传，MinerU 正在后台解析' : '资料已解析并写入课程知识目录')
      await refresh()
    } catch (error) {
      setToast((error as Error).message)
    }
    if (fileRef.current) fileRef.current.value = ''
  }
  async function uploadQuestionBank(file?: File) {
    if (!selected || !file) return
    const form = new FormData()
    form.append('file', file)
    try {
      await api(`/api/courses/${selected.id}/question-imports`, {
        method: 'POST',
        body: form,
      })
      setToast('题库文件已上传，MinerU 与 AI 正在后台拆题')
      await refresh()
    } catch (error) {
      setToast((error as Error).message)
    }
    if (bankFileRef.current) bankFileRef.current.value = ''
  }
  function openReview(job: QuestionImportView) {
    setReviewJob(job)
    setSelectedImportIds(job.questions.map((question) => question.id))
  }
  async function confirmImport() {
    if (!reviewJob) return
    await post(`/api/question-imports/${reviewJob.id}/confirm`, {
      questionIds: selectedImportIds,
    })
    setReviewJob(undefined)
    setToast(`已将 ${selectedImportIds.length} 道题加入课程题库`)
    await refresh()
  }
  async function updateQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingQuestion) return
    const values = Object.fromEntries(new FormData(event.currentTarget))
    await patch(`/api/questions/${editingQuestion.id}`, {
      ...values,
      maxScore: Number(values.maxScore),
    })
    setEditingQuestion(undefined)
    setToast('题目已更新')
    await refresh()
  }
  if (loading) return <Spinner label="正在读取课程" />
  return (
    <div className="course-layout">
      <aside className="course-sidebar panel">
        <div className="panel-head">
          <div>
            <h2>我的课程</h2>
            <p>{courses.length} 个课程空间</p>
          </div>
          <button className="icon-btn solid" onClick={() => setCreateOpen(true)}>
            <Plus size={18} />
          </button>
        </div>
        <div className="course-nav">
          {courses.map((course) => (
            <div className={`course-entry ${selectedId === course.id ? 'active' : ''}`} key={course.id}>
              <button
                className="course-select"
                onClick={() => {
                  setSelectedId(course.id)
                  setCourseMenu('')
                }}
              >
                <span className="course-color" style={{ background: course.color }}>
                  <BookOpen size={18} />
                </span>
                <span>
                  <strong>{course.name}</strong>
                  <small>
                    {course.grade} · {course.subject}
                  </small>
                </span>
              </button>
              <button className="course-more" title="课程操作" onClick={() => setCourseMenu((value) => (value === course.id ? '' : course.id))}>
                <MoreHorizontal size={17} />
              </button>
              {courseMenu === course.id && (
                <div className="course-menu">
                  <button
                    onClick={() => {
                      setEditCourse(course)
                      setCourseMenu('')
                    }}
                  >
                    <Pencil size={15} />
                    编辑课程
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      setDeleteCourse(course)
                      setCourseMenu('')
                    }}
                  >
                    <Trash2 size={15} />
                    删除课程
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
      <div className="course-content">
        {selected ? (
          <>
            <section className="course-cover" style={{ '--course': selected.color } as React.CSSProperties}>
              <div>
                <span>
                  {selected.grade} · {selected.subject}
                </span>
                <h2>{selected.name}</h2>
                <p>{selected.description || '为课程补充教学目标与说明，让 AI 更准确地理解课程。'}</p>
              </div>
              <div className="course-counts">
                <div>
                  <strong>{selected.knowledgePoints.length}</strong>
                  <span>知识点</span>
                </div>
                <div>
                  <strong>{selected.materials.length}</strong>
                  <span>资料</span>
                </div>
                <div>
                  <strong>{selected.questionCount}</strong>
                  <span>题目</span>
                </div>
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>知识点结构</h2>
                  <p>出题、判题和学情统计的最小单元</p>
                </div>
                <button className="btn small" onClick={() => setPointOpen(true)}>
                  <Plus size={16} />
                  添加知识点
                </button>
              </div>
              <div className="knowledge-list">
                {selected.knowledgePoints.length ? (
                  selected.knowledgePoints.map((point, index) => (
                    <div className="knowledge-item" key={point.id}>
                      <span className="number">{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <strong>{point.name}</strong>
                        <p>{point.description || '暂无描述'}</p>
                        {point.formula && <code>{point.formula}</code>}
                      </div>
                      <button
                        className="icon-btn danger"
                        title="删除"
                        onClick={async () => {
                          if (confirm(`删除知识点“${point.name}”？`)) {
                            await remove(`/api/knowledge-points/${point.id}`)
                            refresh()
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <Empty title="还没有知识点" text="先建立知识点，AI 才能被课程目标准确约束。" />
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>课程资料</h2>
                  <p>MinerU 解析 PDF、PPT/PPTX、DOC/DOCX 与图片；讲解视频只建立知识点索引</p>
                </div>
                <div className="head-actions">
                  <button className="btn small" onClick={() => setVideoOpen(true)}>
                    <Video size={16} />
                    讲解视频
                  </button>
                  <button className="btn small" onClick={() => fileRef.current?.click()}>
                    <Upload size={16} />
                    上传资料
                  </button>
                </div>
                <input ref={fileRef} hidden type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.jp2,.webp,.gif,.bmp" onChange={(event) => uploadFile(event.target.files?.[0])} />
              </div>
              <div className="material-grid">
                {selected.materials.map((material) => (
                  <div className={`material-card ${material.kind === 'tutorial-video' ? 'video-material' : ''}`} key={material.id}>
                    <div className="file-icon">{material.kind === 'tutorial-video' ? <PlayCircle size={22} /> : <FileText size={22} />}</div>
                    <div>
                      <strong>{material.name}</strong>
                      {material.kind === 'tutorial-video' ? (
                        <>
                          <span>{(material.size / 1024 / 1024).toFixed(2)} MB · 讲解视频</span>
                          <small>
                            对应知识点：
                            {selected.knowledgePoints.find((point) => point.id === material.knowledgePointId)?.name || '未关联'}
                          </small>
                        </>
                      ) : (
                        <>
                          <span>
                            {(material.size / 1024 / 1024).toFixed(2)} MB · {material.status === 'ready' ? '已入库' : material.status === 'processing' ? '解析中' : '解析失败'}
                            {material.parser ? ` · ${material.parser === 'mineru' ? 'MinerU' : '本地解析'}` : ''}
                          </span>
                          <small>
                            {material.extractedText ? `已提取 ${material.extractedText.length} 字符` : material.status === 'processing' ? '后台处理中，页面会自动更新' : '暂无文本'}
                            {material.imageUrls?.length ? ` · ${material.imageUrls.length} 张页面/插图` : ''}
                            {material.pageCount ? ` · ${material.pageCount} 页` : ''}
                          </small>
                          {material.extractionNotes?.[0] && <small className="material-note">{material.extractionNotes[0]}</small>}
                        </>
                      )}
                    </div>
                    <button
                      className="icon-btn danger"
                      onClick={async () => {
                        if (confirm(`删除“${material.name}”？`)) {
                          await remove(`/api/materials/${material.id}`)
                          refresh()
                        }
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button className="upload-card" onClick={() => fileRef.current?.click()}>
                  <Upload size={24} />
                  <strong>添加课堂资料</strong>
                  <span>解析后自动写入知识目录</span>
                </button>
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>课程题库</h2>
                  <p>支持单题录入，也可让 MinerU 与 AI 从 PDF、PPT、Word 中批量拆题</p>
                </div>
                <div className="head-actions">
                  <button className="btn small" onClick={() => bankFileRef.current?.click()}>
                    <Layers3 size={16} />
                    批量导入
                  </button>
                  <button className="btn small" onClick={() => setQuestionOpen(true)}>
                    <FileQuestion size={16} />
                    添加单题
                  </button>
                </div>
                <input ref={bankFileRef} hidden type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.png,.jpg,.jpeg" onChange={(event) => uploadQuestionBank(event.target.files?.[0])} />
              </div>
              {selected.questionImports?.length > 0 && (
                <div className="import-jobs">
                  {selected.questionImports.map((job) => (
                    <div className={`import-job ${job.status}`} key={job.id}>
                      <span>{job.status === 'processing' ? <LoaderCircle className="spin" /> : job.status === 'failed' ? <AlertCircle /> : <CheckCircle2 />}</span>
                      <div>
                        <strong>{job.name}</strong>
                        <small>{job.error || job.progress}</small>
                      </div>
                      {job.status === 'review' && (
                        <button className="btn mini primary" onClick={() => openReview(job)}>
                          预览并确认
                        </button>
                      )}
                      {job.status === 'failed' && (
                        <button className="btn mini" onClick={() => bankFileRef.current?.click()}>
                          重新上传
                        </button>
                      )}
                      {job.status !== 'processing' && (
                        <button
                          className="icon-btn danger"
                          title="移除导入记录"
                          onClick={async () => {
                            if (confirm(`移除“${job.name}”的导入记录？未确认的题目会一并删除。`)) {
                              await remove(`/api/question-imports/${job.id}`)
                              await refresh()
                            }
                          }}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="bank-grid">
                {selected.questions.length ? (
                  selected.questions.map((question) => (
                    <article className="bank-card" key={question.id}>
                      <div className="bank-meta">
                        <span>{questionTypeLabel[question.type]}</span>
                        <span>{question.difficulty}</span>
                        <span>{selected.knowledgePoints.find((point) => point.id === question.knowledgePointId)?.name}</span>
                        <div className="bank-actions">
                          <button className="icon-btn" title="编辑题目" onClick={() => setEditingQuestion(question)}>
                            <Pencil size={14} />
                          </button>
                          <button
                            className="icon-btn danger"
                            title="删除题目"
                            onClick={async () => {
                              if (confirm('删除这道题？已被教学任务使用的题目会受到保护。')) {
                                try {
                                  await remove(`/api/questions/${question.id}`)
                                  setToast('题目已删除')
                                  await refresh()
                                } catch (error) {
                                  setToast((error as Error).message)
                                }
                              }
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <MarkdownContent content={question.stem} />
                      <div className="bank-answer">
                        <b>参考答案</b>
                        <MarkdownContent content={Array.isArray(question.answer) ? question.answer.join('、') : question.answer} compact />
                      </div>
                    </article>
                  ))
                ) : (
                  <Empty title="题库还是空的" text="添加题干、配图、答案和解析，或批量导入现有题库文件。" />
                )}
              </div>
            </section>
          </>
        ) : (
          <Empty
            title="创建第一门课程"
            text="课程会集中管理知识点、资料、题目和课堂数据。"
            action={
              <button className="btn primary" onClick={() => setCreateOpen(true)}>
                创建课程
              </button>
            }
          />
        )}
      </div>
      {createOpen && (
        <Modal title="创建课程" onClose={() => setCreateOpen(false)}>
          <form className="form" onSubmit={createCourse}>
            <label>
              课程名称
              <input name="name" required placeholder="如：机械原理" />
            </label>
            <div className="form-row">
              <label>
                学科
                <input name="subject" placeholder="机械原理" />
              </label>
              <label>
                适用对象
                <input name="grade" placeholder="大学机械类" />
              </label>
            </div>
            <label>
              课程说明
              <textarea name="description" rows={3} placeholder="教学目标、学习范围等" />
            </label>
            <label>
              课程标识色
              <input type="color" name="color" defaultValue="#0969da" />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn subtle" onClick={() => setCreateOpen(false)}>
                取消
              </button>
              <button className="btn primary">创建课程</button>
            </div>
          </form>
        </Modal>
      )}
      {editCourse && (
        <Modal title="编辑课程" onClose={() => setEditCourse(undefined)}>
          <form className="form" onSubmit={updateCourse}>
            <label>
              课程名称
              <input name="name" required defaultValue={editCourse.name} />
            </label>
            <div className="form-row">
              <label>
                学科
                <input name="subject" defaultValue={editCourse.subject} />
              </label>
              <label>
                适用对象
                <input name="grade" defaultValue={editCourse.grade} />
              </label>
            </div>
            <label>
              课程说明
              <textarea name="description" rows={3} defaultValue={editCourse.description} />
            </label>
            <label>
              课程标识色
              <input type="color" name="color" defaultValue={editCourse.color} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn subtle" onClick={() => setEditCourse(undefined)}>
                取消
              </button>
              <button className="btn primary">保存修改</button>
            </div>
          </form>
        </Modal>
      )}
      {deleteCourse && (
        <Modal title="删除课程" onClose={() => setDeleteCourse(undefined)}>
          <div className="delete-course-dialog">
            <p>
              确定删除“{deleteCourse.name}
              ”吗？课程下的知识点、题目、检测和作答记录会一并移除。
            </p>
            <label className="check-row">
              <input type="checkbox" checked={deleteLocalFiles} onChange={(event) => setDeleteLocalFiles(event.target.checked)} />
              <span>
                <strong>同时删除教师电脑上的资料文件</strong>
                <small>不勾选时仅从系统移除课程，原始资料文件仍保留在本地。</small>
              </span>
            </label>
            <div className="modal-actions">
              <button className="btn subtle" onClick={() => setDeleteCourse(undefined)}>
                取消
              </button>
              <button className="btn danger-fill" onClick={confirmDeleteCourse}>
                删除课程
              </button>
            </div>
          </div>
        </Modal>
      )}
      {videoOpen && selected && (
        <Modal title="添加知识点讲解视频" onClose={() => setVideoOpen(false)}>
          <form className="form" onSubmit={uploadVideo}>
            <label>
              对应知识点
              <select name="knowledgePointId" required defaultValue="">
                <option value="" disabled>
                  请选择知识点
                </option>
                {selected.knowledgePoints.map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              视频文件
              <input name="file" type="file" accept="video/mp4,video/webm,video/quicktime" required />
            </label>
            <div className="video-index-note">
              <Video size={18} />
              <p>AI 只知道视频所属课程、知识点和文件位置，不读取视频内容。学生答错对应知识点后才能进入播放流程。</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn subtle" onClick={() => setVideoOpen(false)}>
                取消
              </button>
              <button className="btn primary">上传并关联</button>
            </div>
          </form>
        </Modal>
      )}
      {questionOpen && selected && (
        <Modal title="添加课程题库题目" wide onClose={() => setQuestionOpen(false)}>
          <form className="form" onSubmit={addBankQuestion}>
            <div className="form-row">
              <label>
                对应知识点
                <select name="knowledgePointId" required defaultValue="">
                  <option value="" disabled>
                    请选择知识点
                  </option>
                  {selected.knowledgePoints.map((point) => (
                    <option key={point.id} value={point.id}>
                      {point.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                题型
                <select name="type" value={questionType} onChange={(event) => setQuestionType(event.target.value as QuestionType)}>
                  <option value="single">单选题</option>
                  <option value="multiple">多选题</option>
                  <option value="truefalse">判断题</option>
                  <option value="blank">填空题</option>
                  <option value="short">解答题</option>
                </select>
              </label>
              <label>
                难度
                <select name="difficulty" defaultValue="进阶">
                  <option>基础</option>
                  <option>进阶</option>
                  <option>挑战</option>
                </select>
              </label>
            </div>
            <label>
              题干
              <textarea name="stem" required rows={4} placeholder="输入完整题目；公式可使用 LaTeX" />
            </label>
            <label>
              题目配图（可选）
              <input name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
            </label>
            {['single', 'multiple', 'truefalse'].includes(questionType) && (
              <label>
                选项
                <textarea name="options" rows={4} placeholder={'每行一个选项，例如：\n10 mm\n20 mm\n30 mm\n40 mm'} required />
              </label>
            )}
            <div className="form-row">
              <label>
                参考答案
                <input name="answer" required placeholder={questionType === 'multiple' ? '如：A,B,C' : questionType === 'single' ? '如：B' : '输入标准答案'} />
              </label>
              <label>
                分值
                <input name="maxScore" type="number" min="1" defaultValue={questionType === 'short' ? 16 : 10} />
              </label>
            </div>
            <label>
              答案解析
              <textarea name="explanation" rows={3} required placeholder="列出关键计算和结论" />
            </label>
            {questionType === 'short' && (
              <label>
                评分标准
                <textarea name="rubric" rows={3} placeholder="按评分点说明各步骤分值" />
              </label>
            )}
            <label>
              相关公式
              <input name="formula" placeholder="如：F=3n-2P_L-P_H" />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn subtle" onClick={() => setQuestionOpen(false)}>
                取消
              </button>
              <button className="btn primary">加入题库</button>
            </div>
          </form>
        </Modal>
      )}
      {reviewJob && (
        <Modal title={`确认批量题库 · ${reviewJob.questions.length} 道`} wide onClose={() => setReviewJob(undefined)}>
          <div className="import-review">
            <p>AI 已完成题型识别和拆分。取消勾选不需要的题目，确认后才会进入正式题库。</p>
            {reviewJob.questions.map((question, index) => (
              <label className="import-question" key={question.id}>
                <input type="checkbox" checked={selectedImportIds.includes(question.id)} onChange={() => setSelectedImportIds((current) => (current.includes(question.id) ? current.filter((id) => id !== question.id) : [...current, question.id]))} />
                <div>
                  <span>
                    第 {index + 1} 题 · {questionTypeLabel[question.type]} · {question.maxScore} 分
                  </span>
                  <MarkdownContent content={question.stem} compact />
                  <small>
                    答案：
                    {Array.isArray(question.answer) ? question.answer.join('、') : question.answer}
                  </small>
                </div>
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn subtle" onClick={() => setReviewJob(undefined)}>
              稍后处理
            </button>
            <button className="btn primary" disabled={!selectedImportIds.length} onClick={confirmImport}>
              确认加入 {selectedImportIds.length} 道题
            </button>
          </div>
        </Modal>
      )}
      {editingQuestion && (
        <Modal title="编辑题库题目" wide onClose={() => setEditingQuestion(undefined)}>
          <form className="form" onSubmit={updateQuestion}>
            <label>
              题干
              <textarea name="stem" required rows={5} defaultValue={editingQuestion.stem} />
            </label>
            <div className="form-row">
              <label>
                参考答案
                <input name="answer" required defaultValue={Array.isArray(editingQuestion.answer) ? editingQuestion.answer.join(',') : editingQuestion.answer} />
              </label>
              <label>
                分值
                <input name="maxScore" type="number" min="1" defaultValue={editingQuestion.maxScore} />
              </label>
            </div>
            <label>
              答案解析
              <textarea name="explanation" rows={4} defaultValue={editingQuestion.explanation} />
            </label>
            <label>
              评分标准
              <textarea name="rubric" rows={3} defaultValue={editingQuestion.rubric || ''} />
            </label>
            <label>
              相关公式
              <input name="formula" defaultValue={editingQuestion.formula || ''} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn subtle" onClick={() => setEditingQuestion(undefined)}>
                取消
              </button>
              <button className="btn primary">保存修改</button>
            </div>
          </form>
        </Modal>
      )}
      {pointOpen && (
        <Modal title="添加知识点" onClose={() => setPointOpen(false)}>
          <form className="form" onSubmit={createPoint}>
            <label>
              知识点名称
              <input name="name" required placeholder="如：待定系数法" />
            </label>
            <label>
              知识点说明
              <textarea name="description" rows={3} placeholder="需要学生理解或掌握的内容" />
            </label>
            <label>
              相关公式 / 概念
              <input name="formula" placeholder="如：y = kx + b" />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn subtle" onClick={() => setPointOpen(false)}>
                取消
              </button>
              <button className="btn primary">添加</button>
            </div>
          </form>
        </Modal>
      )}
      {toast && <Toast message={toast} type={toast.includes('失败') ? 'error' : 'success'} onDone={() => setToast('')} />}
    </div>
  )
}
