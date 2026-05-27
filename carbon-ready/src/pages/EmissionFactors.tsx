import { useState } from 'react';
import { Card, CardBody } from '../components/Card';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useStore } from '../store';
import { api } from '../lib/api';
import { fmtDate } from '../lib/date';
import { Plus } from 'lucide-react';

export function EmissionFactors() {
  const factors = useStore((s) => s.factors);
  const [open, setOpen] = useState(false);

  const sorted = [...factors].sort((a, b) =>
    a.country.localeCompare(b.country) ||
    a.source.localeCompare(b.source) ||
    b.version - a.version
  );

  return (
    <div>
      <PageHeader
        title="Emission Factors"
        subtitle="Country-specific grid emission factors. Add a new entry to supersede an existing version."
        action={<Button onClick={() => setOpen(true)}><Plus size={16} /> Add Factor</Button>}
      />

      <Card>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Country</TH><TH>Source</TH><TH className="text-right">Factor (kgCO₂e/kWh)</TH>
                <TH>Effective Date</TH><TH>Version</TH><TH>{''}</TH>
              </TR>
            </THead>
            <tbody>
              {sorted.map((f) => (
                <TR key={f.id}>
                  <TD className="font-medium">{f.country}</TD>
                  <TD>{f.source}</TD>
                  <TD className="text-right font-mono">{f.factor_kgco2e_per_kwh.toFixed(3)}</TD>
                  <TD>{fmtDate(f.effective_date)}</TD>
                  <TD>v{f.version}</TD>
                  <TD>{f.is_current ? <Badge tone="green">Current</Badge> : <Badge tone="gray">Historical</Badge>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      {open && <AddFactorModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function AddFactorModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    country: 'IN', source: '',
    factor_kgco2e_per_kwh: '',
    effective_date: new Date().toISOString().slice(0, 10),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.country.trim()) errs.country = 'Required';
    if (!form.source.trim()) errs.source = 'Required';
    const v = Number(form.factor_kgco2e_per_kwh);
    if (!form.factor_kgco2e_per_kwh || Number.isNaN(v) || v < 0) errs.factor_kgco2e_per_kwh = 'Must be ≥ 0';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    await api.addFactor({
      country: form.country.trim().toUpperCase(),
      source: form.source.trim(),
      factor_kgco2e_per_kwh: v,
      effective_date: form.effective_date,
    });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Add Emission Factor">
      <div className="space-y-4">
        <Select label="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
          <option value="IN">India (IN)</option>
          <option value="TH">Thailand (TH)</option>
          <option value="VN">Vietnam (VN)</option>
        </Select>
        <Input label="Source" placeholder="e.g. CEA, EGAT, EVN" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} error={errors.source} />
        <Input label="Factor (kgCO₂e/kWh)" type="number" inputMode="decimal" step="0.001" value={form.factor_kgco2e_per_kwh} onChange={(e) => setForm({ ...form, factor_kgco2e_per_kwh: e.target.value })} error={errors.factor_kgco2e_per_kwh} />
        <Input label="Effective Date" type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Add Factor</Button>
        </div>
      </div>
    </Modal>
  );
}
