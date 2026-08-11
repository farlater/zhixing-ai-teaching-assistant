import { ArrowRight, BarChart3, GraduationCap, ShieldCheck, Smartphone } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Landing() {
  return <div className="landing"><header><div className="brand"><div className="brand-mark"><GraduationCap size={23} /></div><div><strong>知行</strong><span>教学诊断</span></div></div><span><ShieldCheck size={16} />本地数据</span></header><main><div className="landing-copy"><h1>课堂教学诊断</h1><p>课程、检测、作答与报告集中在教师电脑中管理。</p><div className="landing-features"><span><BarChart3 />课堂学情报告</span><span><Smartphone />手机局域网答题</span></div></div><div className="role-cards"><Link to="/teacher" className="role-card teacher"><div className="role-icon"><BarChart3 /></div><h2>教师端</h2><p>管理课程、发布检测并查看报告</p><strong>进入工作台 <ArrowRight /></strong></Link><Link to="/join" className="role-card student"><div className="role-icon"><Smartphone /></div><h2>学生端</h2><p>进入教师当前发布的课堂</p><strong>进入课堂 <ArrowRight /></strong></Link></div></main></div>
}
