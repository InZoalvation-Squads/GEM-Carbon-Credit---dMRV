import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useStore } from './store';
import { AppShell } from './layouts/AppShell';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { HowItWorks } from './pages/HowItWorks';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { UploadPage } from './pages/Upload';
import { IotMapping } from './pages/IotMapping';
import { Calculations } from './pages/Calculations';
import { EmissionFactors } from './pages/EmissionFactors';
import { AuditLogPage } from './pages/AuditLog';
import { Verifications } from './pages/Verifications';
import { ReviewDetail } from './pages/ReviewDetail';
import { Guardian } from './pages/Guardian';
import { Methodologies } from './pages/Methodologies';
import { Registration } from './pages/Registration';
import { PddDocument } from './pages/PddDocument';
import { TverSF001Pdd } from './templates/TverSF001Pdd';
import { ValidationQueue } from './pages/ValidationQueue';
import { ValidationDetail } from './pages/ValidationDetail';

// Redirects to /login until a demo account is signed in.
function RequireAuth() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="/registration/:pddId/official" element={<TverSF001Pdd />} />
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
          <Route path="/guardian" element={<Guardian />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="*" element={<div className="p-8 text-ink-500">Page not found</div>} />
        </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
