import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BookOpen, FileText, MoreHorizontal, Plus, Trash2, Upload, X } from 'lucide-react'
import type { Course, KnowledgePoint, Material } from '../../shared/types'
import { api, post, remove } from '../api'
import { Empty, Modal, Spinner, Toast } from '../components'

type CourseView = Course & { knowledgePoints: KnowledgePoint[]; materials: Material[]; questionCount: number; assessmentCount: number }

export default function Courses() {
  const [courses, setCourses] = useState<CourseView[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [pointOpen, setPointOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const refresh = async () => { const list = await api<CourseView[]>('/api/courses'); setCourses(list); setSelectedId(id => id || list[0]?.id || ''); setLoading(false) }
  useEffect(() => { refresh() }, [])
  const selected = courses.find(course => course.id === selectedId)
  const hasProcessingMaterial = Boolean(selected?.materials.some(material => material.status === 'processing'))
  useEffect(() => {
    if (!hasProcessingMaterial) return
    const timer = window.setInterval(() => { void refresh() }, 3000)
    return () => window.clearInterval(timer)
  }, [hasProcessingMaterial, selectedId])

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    await post('/api/courses', Object.fromEntries(form)); setCreateOpen(false); setToast('课程已创建'); await refresh()
  }
  async function createPoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const form = new FormData(event.currentTarget)
    await post(`/api/courses/${selected.id}/knowledge-points`, Object.fromEntries(form)); setPointOpen(false); setToast('知识点已添加'); await refresh()
  }
  async function uploadFile(file?: File) {
    if (!selected || !file) return; const form = new FormData(); form.append('file', file)
    try {
      const material = await api<Material>(`/api/courses/${selected.id}/materials`, { method: 'POST', body: form })
      setToast(material.status === 'processing' ? '资料已上传，MinerU 正在后台解析' : '资料已解析并写入课程知识目录')
      await refresh()
    } catch (error) { setToast((error as Error).message) }
    if (fileRef.current) fileRef.current.value = ''
  }
  if (loading) return <Spinner label="正在读取课程" />
  return <div className="course-layout">
    <aside className="course-sidebar panel"><div className="panel-head"><div><h2>我的课程</h2><p>{courses.length} 个课程空间</p></div><button className="icon-btn solid" onClick={() => setCreateOpen(true)}><Plus size={18} /></button></div>
      <div className="course-nav">{courses.map(course => <button key={course.id} onClick={() => setSelectedId(course.id)} className={selectedId === course.id ? 'active' : ''}><span className="course-color" style={{ background: course.color }}><BookOpen size={18} /></span><span><strong>{course.name}</strong><small>{course.grade} · {course.subject}</small></span><MoreHorizontal size={17} /></button>)}</div>
    </aside>
    <div className="course-content">{selected ? <>
      <section className="course-cover" style={{ '--course': selected.color } as React.CSSProperties}><div><span>{selected.grade} · {selected.subject}</span><h2>{selected.name}</h2><p>{selected.description || '为课程补充教学目标与说明，让 AI 更准确地理解课程。'}</p></div><div className="course-counts"><div><strong>{selected.knowledgePoints.length}</strong><span>知识点</span></div><div><strong>{selected.materials.length}</strong><span>资料</span></div><div><strong>{selected.questionCount}</strong><span>题目</span></div></div></section>
      <section className="panel"><div className="panel-head"><div><h2>知识点结构</h2><p>出题、判题和学情统计的最小单元</p></div><button className="btn small" onClick={() => setPointOpen(true)}><Plus size={16} />添加知识点</button></div>
        <div className="knowledge-list">{selected.knowledgePoints.length ? selected.knowledgePoints.map((point, index) => <div className="knowledge-item" key={point.id}><span className="number">{String(index + 1).padStart(2, '0')}</span><div><strong>{point.name}</strong><p>{point.description || '暂无描述'}</p>{point.formula && <code>{point.formula}</code>}</div><button className="icon-btn danger" title="删除" onClick={async () => { if (confirm(`删除知识点“${point.name}”？`)) { await remove(`/api/knowledge-points/${point.id}`); refresh() } }}><Trash2 size={16} /></button></div>) : <Empty title="还没有知识点" text="先建立知识点，AI 才能被课程目标准确约束。" />}</div>
      </section>
      <section className="panel"><div className="panel-head"><div><h2>课程资料</h2><p>MinerU 解析 PDF、PPT/PPTX、DOC/DOCX 与图片；文本本地直读，单个不超过 200 MB</p></div><button className="btn small" onClick={() => fileRef.current?.click()}><Upload size={16} />上传资料</button><input ref={fileRef} hidden type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.jp2,.webp,.gif,.bmp" onChange={event => uploadFile(event.target.files?.[0])} /></div>
        <div className="material-grid">{selected.materials.map(material => <div className="material-card" key={material.id}><div className="file-icon"><FileText size={22} /></div><div><strong>{material.name}</strong><span>{(material.size / 1024 / 1024).toFixed(2)} MB · {material.status === 'ready' ? '已入库' : material.status === 'processing' ? '解析中' : '解析失败'}{material.parser ? ` · ${material.parser === 'mineru' ? 'MinerU' : '本地解析'}` : ''}</span><small>{material.extractedText ? `已提取 ${material.extractedText.length} 字符` : material.status === 'processing' ? '后台处理中，页面会自动更新' : '暂无文本'}{material.imageUrls?.length ? ` · ${material.imageUrls.length} 张页面/插图` : ''}{material.pageCount ? ` · ${material.pageCount} 页` : ''}</small>{material.extractionNotes?.[0] && <small className="material-note">{material.extractionNotes[0]}</small>}</div><button className="icon-btn danger" onClick={async () => { if (confirm('删除这份资料？')) { await remove(`/api/materials/${material.id}`); refresh() } }}><X size={16} /></button></div>)}<button className="upload-card" onClick={() => fileRef.current?.click()}><Upload size={24} /><strong>添加课堂资料</strong><span>解析后自动写入知识目录</span></button></div>
      </section>
    </> : <Empty title="创建第一门课程" text="课程会集中管理知识点、资料、题目和课堂数据。" action={<button className="btn primary" onClick={() => setCreateOpen(true)}>创建课程</button>} />}</div>
    {createOpen && <Modal title="创建课程" onClose={() => setCreateOpen(false)}><form className="form" onSubmit={createCourse}><label>课程名称<input name="name" required placeholder="如：一次函数的图像与性质" /></label><div className="form-row"><label>学科<input name="subject" placeholder="数学" /></label><label>年级<input name="grade" placeholder="八年级" /></label></div><label>课程说明<textarea name="description" rows={3} placeholder="教学目标、学习范围等" /></label><label>课程标识色<input type="color" name="color" defaultValue="#275d56" /></label><div className="modal-actions"><button type="button" className="btn subtle" onClick={() => setCreateOpen(false)}>取消</button><button className="btn primary">创建课程</button></div></form></Modal>}
    {pointOpen && <Modal title="添加知识点" onClose={() => setPointOpen(false)}><form className="form" onSubmit={createPoint}><label>知识点名称<input name="name" required placeholder="如：待定系数法" /></label><label>知识点说明<textarea name="description" rows={3} placeholder="需要学生理解或掌握的内容" /></label><label>相关公式 / 概念<input name="formula" placeholder="如：y = kx + b" /></label><div className="modal-actions"><button type="button" className="btn subtle" onClick={() => setPointOpen(false)}>取消</button><button className="btn primary">添加</button></div></form></Modal>}
    {toast && <Toast message={toast} type={toast.includes('失败') ? 'error' : 'success'} onDone={() => setToast('')} />}
  </div>
}
