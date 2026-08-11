import { Navigate, Route, Routes } from 'react-router-dom'
import { TeacherLayout } from './components'
import { ErrorBoundary } from './ErrorBoundary'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Courses from './pages/Courses'
import Questions from './pages/Questions'
import Classes from './pages/Classes'
import Reports from './pages/Reports'
import Students from './pages/Students'
import Assistant from './pages/Assistant'
import StudentApp from './pages/StudentApp'

export default function App() {
  return <ErrorBoundary><Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/teacher" element={<TeacherLayout />}>
      <Route index element={<Dashboard />} />
      <Route path="courses" element={<Courses />} />
      <Route path="questions" element={<Questions />} />
      <Route path="classes" element={<Classes />} />
      <Route path="reports" element={<Reports />} />
      <Route path="students" element={<Students />} />
      <Route path="assistant" element={<Assistant />} />
    </Route>
    <Route path="/join" element={<StudentApp />} />
    <Route path="/join/:code" element={<StudentApp />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></ErrorBoundary>
}
