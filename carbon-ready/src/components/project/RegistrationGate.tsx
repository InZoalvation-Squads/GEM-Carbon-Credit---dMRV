import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useStore } from '../store';
import { EmptyState } from './EmptyState';
import { Button } from './Button';

/** Renders children only when the project is registered; otherwise blocks dMRV with a link to the wizard. */
export function RegistrationGate({ projectId, children }: { projectId: string; children: ReactNode }) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const pdd = useStore((s) => s.pdds.find((p) => p.project_id === projectId));

  if (project && project.lifecycle_stage === 'registered') return <>{children}</>;

  const target = pdd ? `/registration/${pdd.id}` : '/registration';
  return (
    <EmptyState
      title="Project not registered yet"
      hint="This project must be registered (methodology selected, PDD validated by an auditor) before dMRV monitoring can start."
      action={
        <Link to={target}>
          <Button><Lock size={16} /> Go to Registration</Button>
        </Link>
      }
    />
  );
}
