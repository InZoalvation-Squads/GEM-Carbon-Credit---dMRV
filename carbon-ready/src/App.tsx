import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { UploadPage } from './pages/Upload';
import { Calculations } from './pages/Calculations';
import { EmissionFactors } from './pages/EmissionFactors';
import { AuditLogPage } from './pages/AuditLog';
import { Verifications } from './pages/Verifications';
import { ReviewDetail } from './pages/ReviewDetail';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/calculations" element={<Calculations />} />
          <Route path="/emission-factors" element={<EmissionFactors />} />
          <Route path="/verifications" element={<Verifications />} />
          <Route path="/verifications/:id" element={<ReviewDetail />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="*" element={<div className="p-8 text-ink-500">Page not found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
