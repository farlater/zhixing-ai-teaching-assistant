import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BookOpen, ChartNoAxesCombined, ClipboardCheck, GraduationCap, LayoutDashboard, Menu, MessageCircleMore, Sparkles, Users, X, Wifi } from 'lucide-react'

export function Spinner({ label = '正在加载' }: { label?: string }) {
  return <div className="loading"><span className="spinner" />{label}</div>
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty"><div className="empty-mark">知</div><h3>{title}</h3><p>{text}</p>{action}</div>
}

export function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`}><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose}><X size={20} /></button></div>{children}</div>
  </div>
}

export function Toast({ message, type = 'success', onDone }: { message: string; type?: 'success' | 'error'; onDone: () => void }) {
  useEffect(() => { const timer = setTimeout(onDone, 3200); return () => clearTimeout(timer) }, [onDone])
  return <div className={`toast ${type}`}>{message}</div>
}

const nav = [
  ['/teacher', '课堂总览', LayoutDashboard], ['/teacher/courses', '课程与资料', BookOpen],
  ['/teacher/questions', '智能出题', Sparkles], ['/teacher/classes', '课堂检测', ClipboardCheck],
  ['/teacher/reports', '学情报告', ChartNoAxesCombined], ['/teacher/students', '学生画像', Users],
  ['/teacher/assistant', '教学助教', MessageCircleMore]
] as const

const pageNames: Record<string, { title: string; subtitle: string }> = {
  '/teacher': { title: '早上好，王老师', subtitle: '让每一次作答，都成为下一步教学的依据。' },
  '/teacher/courses': { title: '课程与资料', subtitle: '知识点和课堂资料将共同约束 AI 出题。' },
  '/teacher/questions': { title: '智能出题', subtitle: '设置教学目标，生成并确认课堂诊断题。' },
  '/teacher/classes': { title: '课堂检测', subtitle: '发布课堂，实时查看学生加入与提交情况。' },
  '/teacher/reports': { title: '学情报告', subtitle: '从真实作答数据中发现共性问题与个体差异。' },
  '/teacher/students': { title: '学生画像', subtitle: '持续记录表现，观察能力与知识点的变化。' },
  '/teacher/assistant': { title: '教学助教', subtitle: '基于当前课堂数据，获得具体可执行的教学建议。' }
}

export function TeacherLayout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const current = pageNames[location.pathname] || pageNames['/teacher']
  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><GraduationCap size={23} /></div><div><strong>知行</strong><span>教学诊断</span></div></div>
      <nav>{nav.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/teacher'} onClick={() => setOpen(false)}><Icon size={19} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-foot"><span className="status-dot" /><div><strong>本地服务运行中</strong><small>数据保存在教师电脑</small></div></div>
    </aside>
    {open && <div className="sidebar-mask" onClick={() => setOpen(false)} />}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setOpen(true)}><Menu /></button><div><h1>{current.title}</h1><p>{current.subtitle}</p></div><div className="top-actions"><div className="network-pill"><Wifi size={15} />局域网已就绪</div><div className="avatar">王</div></div></header>
      <div className="page"><Outlet /></div>
    </main>
  </div>
}

export function Segmented({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return <div className="segmented">{options.map(option => <button key={option.value} className={value === option.value ? 'active' : ''} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>
}

export function ScoreRing({ value, label, size = 112 }: { value: number; label?: string; size?: number }) {
  return <div className="score-ring" style={{ '--score': `${Math.min(100, value) * 3.6}deg`, width: size, height: size } as React.CSSProperties}><div><strong>{value}</strong><span>{label || '掌握度'}</span></div></div>
}
