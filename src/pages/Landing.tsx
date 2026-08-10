import { ArrowRight, BarChart3, GraduationCap, ShieldCheck, Smartphone, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Landing() {
  return <div className="landing"><header><div className="brand"><div className="brand-mark"><GraduationCap size={23} /></div><div><strong>知行</strong><span>教学诊断</span></div></div><span><ShieldCheck size={16} />数据保存在教师电脑</span></header><main><div className="landing-copy"><span className="eyebrow"><Sparkles size={14} />让教学决策有据可依</span><h1>从一次作答，<br />看见每个学生的下一步。</h1><p>课程资料约束出题，真实作答形成诊断。连接教师教学与学生练习的完整课堂闭环。</p><div className="landing-features"><span><BarChart3 />数据驱动的学情报告</span><span><Smartphone />学生手机局域网访问</span></div></div><div className="role-cards"><Link to="/teacher" className="role-card teacher"><div className="role-icon"><BarChart3 /></div><span>教师端</span><h2>进入教学工作台</h2><p>管理课程、发布检测、查看报告与教学建议</p><strong>以教师身份进入 <ArrowRight /></strong></Link><Link to="/join" className="role-card student"><div className="role-icon"><Smartphone /></div><span>学生端</span><h2>加入课堂检测</h2><p>输入课堂码，完成作答并获取个人诊断</p><strong>以学生身份进入 <ArrowRight /></strong></Link></div></main><footer>知行 AI 教学诊断 · 为公开课与真实教学设计</footer></div>
}
