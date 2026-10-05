import { routeLoaders } from './routeLoaders';
import { lazy, Suspense } from 'react';
import { RouteMetadata } from './components/layout/RouteMetadata';
import { RouteSkeleton } from './components/ui/RouteSkeleton';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useStore } from './store';
import { AppShell } from './layouts/AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';

const Register = lazy(routeLoaders.Register);
const HowItWorks = lazy(routeLoaders.HowItWorks);
const Projects = lazy(routeLoaders.Projects);
const ProjectDetail = lazy(routeLoaders.ProjectDetail);
const UploadPage = lazy(routeLoaders.UploadPage);
const IotMapping = lazy(routeLoaders.IotMapping);
const Calculations = lazy(routeLoaders.Calculations);
const EmissionFactors = lazy(routeLoaders.EmissionFactors);
const AuditLogPage = lazy(routeLoaders.AuditLogPage);
const Verifications = lazy(routeLoaders.Verifications);
const ReviewDetail = lazy(routeLoaders.ReviewDetail);
const RecIssuance = lazy(routeLoaders.RecIssuance);
const RecIssueOfficialForm = lazy(routeLoaders.RecIssueOfficialForm);
const Guardian = lazy(routeLoaders.Guardian);
const Methodologies = lazy(routeLoaders.Methodologies);
const Registration = lazy(routeLoaders.Registration);
const PddDocument = lazy(routeLoaders.PddDocument);
const OfficialForm = lazy(routeLoaders.OfficialForm);
const ValidationQueue = lazy(routeLoaders.ValidationQueue);
const ValidationDetail = lazy(routeLoaders.ValidationDetail);

function RouteFallback() {
  const { pathname } = useLocation();
  return <RouteSkeleton path={pathname} />;
}

// Redirects to /login until a demo account is signed in.
function RequireAuth() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteMetadata />
      <Suspense fallback={<RouteFallback />}>
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
            <Route path="*" element={<div className="p-8 text-ink-meta">Page not found</div>} />
          </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
