import { lazy, Suspense } from 'react';
import { RouteMetadata } from './components/layout/RouteMetadata';
import { RouteSkeleton } from './components/ui/RouteSkeleton';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useStore } from './store';
import { AppShell } from './layouts/AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';

const Register = lazy(() => import('./pages/Register').then((module) => ({ default: module.Register })));
const HowItWorks = lazy(() => import('./pages/HowItWorks').then((module) => ({ default: module.HowItWorks })));
const Projects = lazy(() => import('./pages/Projects').then((module) => ({ default: module.Projects })));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail').then((module) => ({ default: module.ProjectDetail })));
const UploadPage = lazy(() => import('./pages/Upload').then((module) => ({ default: module.UploadPage })));
const IotMapping = lazy(() => import('./pages/IotMapping').then((module) => ({ default: module.IotMapping })));
const Calculations = lazy(() => import('./pages/Calculations').then((module) => ({ default: module.Calculations })));
const EmissionFactors = lazy(() => import('./pages/EmissionFactors').then((module) => ({ default: module.EmissionFactors })));
const AuditLogPage = lazy(() => import('./pages/AuditLog').then((module) => ({ default: module.AuditLogPage })));
const Verifications = lazy(() => import('./pages/Verifications').then((module) => ({ default: module.Verifications })));
const ReviewDetail = lazy(() => import('./pages/ReviewDetail').then((module) => ({ default: module.ReviewDetail })));
const RecIssuance = lazy(() => import('./pages/RecIssuance').then((module) => ({ default: module.RecIssuance })));
const RecIssueOfficialForm = lazy(() => import('./templates/RecIssueOfficialForm').then((module) => ({ default: module.RecIssueOfficialForm })));
const Guardian = lazy(() => import('./pages/Guardian').then((module) => ({ default: module.Guardian })));
const Methodologies = lazy(() => import('./pages/Methodologies').then((module) => ({ default: module.Methodologies })));
const Registration = lazy(() => import('./pages/Registration').then((module) => ({ default: module.Registration })));
const PddDocument = lazy(() => import('./pages/PddDocument').then((module) => ({ default: module.PddDocument })));
const OfficialForm = lazy(() => import('./templates/OfficialForm').then((module) => ({ default: module.OfficialForm })));
const ValidationQueue = lazy(() => import('./pages/ValidationQueue').then((module) => ({ default: module.ValidationQueue })));
const ValidationDetail = lazy(() => import('./pages/ValidationDetail').then((module) => ({ default: module.ValidationDetail })));

// Redirects to /login until a demo account is signed in.
function RequireAuth() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteMetadata />
      <Suspense fallback={<RouteSkeleton />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/methodologies" element={<Methodologies />} />
            <Route path="/methodologies/:id" element={<Methodologies />} />
            <Route path="/registration" element={<Registration />} />
            <Route path="/registration/:pddId" element={<Registration />} />
            <Route path="/registration/:pddId/document" element={<PddDocument />} />
            <Route path="/registration/:pddId/official" element={<OfficialForm />} />
            <Route path="/validation" element={<ValidationQueue />} />
            <Route path="/validation/:pddId" element={<ValidationDetail />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/iot" element={<IotMapping />} />
            <Route path="/calculations" element={<Calculations />} />
            <Route path="/emission-factors" element={<EmissionFactors />} />
            <Route path="/verifications" element={<Verifications />} />
            <Route path="/verifications/:id" element={<ReviewDetail />} />
            <Route path="/rec-issuance" element={<RecIssuance />} />
            <Route path="/rec-issuance/:id/official" element={<RecIssueOfficialForm />} />
            <Route path="/guardian" element={<Guardian />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
            <Route path="*" element={<div className="p-8 text-ink-500">Page not found</div>} />
          </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
