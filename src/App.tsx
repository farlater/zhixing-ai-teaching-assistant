import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Spinner, TeacherLayout } from './components'

const Landing = lazy(() => import('./pages/Landing'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Courses = lazy(() => import('./pages/Courses'))
const Questions = lazy(() => import('./pages/Questions'))
const Classes = lazy(() => import('./pages/Classes'))
const Reports = lazy(() => import('./pages/Reports'))
const Students = lazy(() => import('./pages/Students'))
const Assistant = lazy(() => import('./pages/Assistant'))
const StudentApp = lazy(() => import('./pages/StudentApp'))

export default function App() {
  return <Suspense fallback={<Spinner label="正在打开知行课堂" />}><Routes>
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
  </Routes></Suspense>
}
