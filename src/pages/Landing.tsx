import { ArrowRight, BarChart3, ShieldCheck, Smartphone } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Landing() {
  return <div className="landing"><header><div className="brand"><div className="brand-mark school-mark"><img src="/ustl-emblem.jpg" alt="辽宁科技大学校徽" /></div><div><strong>辽科智学</strong><span>辽宁科技大学 · 教学诊断</span></div></div><span><ShieldCheck size={16} />本地数据</span></header><main><div className="landing-copy"><img className="landing-emblem" src="/ustl-emblem.jpg" alt="辽宁科技大学校徽" /><span className="university-kicker">辽宁科技大学</span><h1>教学诊断系统</h1><p>课程、检测、作业、作答与报告集中在教师电脑中管理。</p><div className="landing-features"><span><BarChart3 />课堂与作业学情</span><span><Smartphone />手机局域网答题</span></div></div><div className="role-cards"><Link to="/teacher" className="role-card teacher"><div className="role-icon"><BarChart3 /></div><h2>教师端</h2><p>管理课程、发布任务并查看报告</p><strong>进入工作台 <ArrowRight /></strong></Link><Link to="/join" className="role-card student"><div className="role-icon"><Smartphone /></div><h2>学生端</h2><p>进入教师当前发布的教学任务</p><strong>进入课堂 <ArrowRight /></strong></Link></div></main></div>
}
