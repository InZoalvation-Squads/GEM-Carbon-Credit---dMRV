import { memo, useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Table, THead, TR, TH, TD } from '../components/ui/Table';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Drawer } from '../components/layout/Drawer';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../lib/api';
import { useStore } from '../store';
import { fmtDate } from '../lib/date';
import { formatNumber } from '../lib/format';
import { PROJECT_STATUS_LABEL } from '../lib/labels';
import type { Project, ProjectStatus } from '../types';

const STATUSES: ProjectStatus[] = ['draft', 'active', 'suspended', 'retired'];

export function Projects() {
  const projects = useStore((s) => s.projects);
  const records = useStore((s) => s.records);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | ProjectStatus>('');

  const deferredSearch = useDeferredValue(search);
  const deferredStatus = useDeferredValue(filterStatus);
  const filtered = useMemo(() => projects.filter((p) => {
    if (deferredSearch && !p.name.toLowerCase().includes(deferredSearch.toLowerCase())) return false;
    if (deferredStatus && p.status !== deferredStatus) return false;
    return true;
  }), [projects, deferredSearch, deferredStatus]);

  const uploads = useMemo(() => {
    const latest = new Map<string, string>();
    for (const record of records) {
      if (!latest.has(record.project_id) || record.uploaded_at > latest.get(record.project_id)!) latest.set(record.project_id, record.uploaded_at);
    }
    return latest;
  }, [records]);

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Solar rooftop projects under your organisation"
        action={<Button onClick={() => setCreating(true)}><Plus size={16} /> New Project</Button>}
      />

      <Card className="mb-4 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input label="Search" placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as ProjectStatus | '')}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
        </Select>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState illustration="/illustrations/empty-projects.webp" title="No projects yet" hint="Create a project to start tracking generation."
            action={<Button onClick={() => setCreating(true)}><Plus size={16} /> New Project</Button>} />
        ) : (
          <ProjectRows projects={filtered} uploads={uploads} onEdit={setEditing} />
        )}
      </Card>

      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}
      {editing && <EditProjectDrawer project={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// Stable deferred rows skip the urgent keystroke render, including cell formatting.
const ProjectRows = memo(function ProjectRows({ projects, uploads, onEdit }: {
  projects: Project[]; uploads: Map<string, string>; onEdit: (project: Project) => void;
}) {
  return (
  <>
  <ul aria-label="Projects on mobile" className="sm:hidden divide-y divide-ink-100">
    {projects.map((p) => {
      const lu = uploads.get(p.id);
      return <li key={p.id} className="flex min-h-[90px] items-center gap-2 px-4 py-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-start justify-between gap-2">
            <Link to={`/projects/${p.id}`} aria-label={`View ${p.name}`} className="min-w-0 whitespace-normal text-sm font-medium hover:text-brand-600">{p.name}</Link>
            <StatusBadge state={p.status} label={PROJECT_STATUS_LABEL[p.status]} className="shrink-0 whitespace-nowrap" />
          </div>
          <p className="text-sm text-ink-secondary">{p.location} · <span className="whitespace-nowrap">{formatNumber(p.capacity_kwp, 2)} kWp</span></p>
          <p className="text-xs text-ink-meta">Commissioned <span className="whitespace-nowrap">{fmtDate(p.commission_date)}</span> · Last upload <span className="whitespace-nowrap">{lu ? fmtDate(lu.slice(0, 10)) : '—'}</span></p>
        </div>
        <button type="button" onClick={() => onEdit(p)} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-ink-meta hover:text-ink" aria-label={`Edit ${p.name}`}>
          <Pencil size={16} aria-hidden="true" />
        </button>
      </li>;
    })}
  </ul>
  <Table className="hidden sm:block">
    <THead>
      <TR>
        <TH>Name</TH><TH>Location</TH><TH className="text-right">Capacity</TH>
        <TH>Status</TH><TH>Commissioned</TH><TH>Last Upload</TH><TH>{''}</TH>
      </TR>
    </THead>
    <tbody>
      {projects.map((p) => {
        const lu = uploads.get(p.id);
        return (
          <TR key={p.id}>
            <TD className="font-medium"><Link to={`/projects/${p.id}`} className="hover:text-brand-600">{p.name}</Link></TD>
            <TD>{p.location}</TD>
            <TD className="text-right">{formatNumber(p.capacity_kwp, 2)} kWp</TD>
            <TD><StatusBadge state={p.status} label={PROJECT_STATUS_LABEL[p.status]} /></TD>
            <TD>{fmtDate(p.commission_date)}</TD>
            <TD>{lu ? fmtDate(lu.slice(0, 10)) : '—'}</TD>
            <TD className="text-right">
              <button onClick={() => onEdit(p)} className="inline-flex min-h-8 min-w-8 items-center justify-center text-ink-meta hover:text-ink" aria-label="Edit">
                <Pencil size={16} />
              </button>
            </TD>
          </TR>
        );
      })}
    </tbody>
  </Table>
  </>
  );
});

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    name: '', location: '', capacity_kwp: '', commission_date: new Date().toISOString().slice(0, 10), status: 'draft' as ProjectStatus,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.location.trim()) errs.location = 'Required';
    // Capacity is 0 for land-based projects (forestry / ARR), which have no kWp.
    const cap = Number(form.capacity_kwp);
    if (form.capacity_kwp === '' || Number.isNaN(cap) || cap < 0) errs.capacity_kwp = 'Must be ≥ 0';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    try {
      await api.createProject({
        name: form.name.trim(), location: form.location.trim(), capacity_kwp: cap,
        commission_date: form.commission_date, status: form.status,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="New Project">
      <div className="space-y-4">
        <Input label="Project Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
        <Input label="Location" placeholder="e.g. Pune, India" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} error={errors.location} />
        <Input label="Capacity (kWp)" type="number" inputMode="decimal" value={form.capacity_kwp} onChange={(e) => setForm({ ...form, capacity_kwp: e.target.value })} error={errors.capacity_kwp} />
        <p className="-mt-2 text-xs text-ink-meta">Use 0 for land-based projects (forestry, ARR) with no installed capacity.</p>
        <Input label="Commission Date" type="date" value={form.commission_date} onChange={(e) => setForm({ ...form, commission_date: e.target.value })} />
        <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
          {STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
        </Select>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Create Project</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditProjectDrawer({ project, onClose }: { project: Project; onClose: () => void }) {
  const [form, setForm] = useState({
    name: project.name, location: project.location,
    capacity_kwp: String(project.capacity_kwp),
    commission_date: project.commission_date, status: project.status,
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.updateProject(project.id, {
        name: form.name.trim(), location: form.location.trim(),
        capacity_kwp: Number(form.capacity_kwp), commission_date: form.commission_date, status: form.status,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title={`Edit ${project.name}`}>
      <div className="space-y-4">
        <Input label="Project Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        <Input label="Capacity (kWp)" type="number" inputMode="decimal" value={form.capacity_kwp} onChange={(e) => setForm({ ...form, capacity_kwp: e.target.value })} />
        <Input label="Commission Date" type="date" value={form.commission_date} onChange={(e) => setForm({ ...form, commission_date: e.target.value })} />
        <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
          {STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
        </Select>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Save Changes</Button>
        </div>
      </div>
    </Drawer>
  );
}
