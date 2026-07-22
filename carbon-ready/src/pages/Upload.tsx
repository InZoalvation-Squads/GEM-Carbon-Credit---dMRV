import { useState } from 'react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Select } from '../components/Select';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { FileDrop } from '../components/FileDrop';
import { PageHeader } from '../components/PageHeader';
import { RegistrationGate } from '../components/RegistrationGate';
import { useStore } from '../store';
import { parseAndValidateCsv } from '../lib/csv';
import { api } from '../lib/api';
import type { CsvValidationResult } from '../types';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export function UploadPage() {
  const projects = useStore((s) => s.projects);
  const records = useStore((s) => s.records);
  const pdds = useStore((s) => s.pdds);
  const methodologies = useStore((s) => s.methodologies);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');

  // Labels track the selected project's methodology driver (fallback: legacy kWh).
  // Registered PDDs only — a draft's methodology can still change (mirrors the store's stamping rule).
  const pdd = pdds.find((p) => p.project_id === projectId);
  const methodology = pdd?.state === 'registered' ? methodologies.find((m) => m.id === pdd.methodology_id) : undefined;
  const driverUnit = methodology?.calculation.input_unit ?? 'kWh';
  const driverHeader = methodology?.calculation.input_param ?? 'Generation_kWh';
  const [preview, setPreview] = useState<CsvValidationResult | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ accepted: number; rejected: number } | null>(null);

  const onFile = async (file: File) => {
    const text = await file.text();
    const existing = records.filter((r) => r.project_id === projectId).map((r) => r.record_date);
    const result = parseAndValidateCsv(text, existing);
    setPreview(result);
    setPendingText(text);
    setSubmitted(null);
  };

  const confirm = async () => {
    if (!pendingText || !projectId) return;
    const result = await api.uploadMonitoringCsv(projectId, pendingText);
    setSubmitted({ accepted: result.accepted.length, rejected: result.rejected.length });
    setPreview(null); setPendingText(null);
  };

  const reset = () => { setPreview(null); setPendingText(null); setSubmitted(null); };

  return (
    <div>
      <PageHeader title="Upload Monitoring Data" subtitle={`Drop a CSV with daily values in ${driverUnit}; we'll validate row-by-row before saving.`} />

      <Card className="mb-4 p-4">
        <Select label="Project" value={projectId} onChange={(e) => { setProjectId(e.target.value); reset(); }}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.location}</option>)}
        </Select>
      </Card>

      <RegistrationGate projectId={projectId}>
        {!preview && !submitted && (
          <Card className="mb-4">
            <CardBody><FileDrop onFile={onFile} columnsHint={`Date, ${driverHeader}`} /></CardBody>
          </Card>
        )}

        {preview && (
          <Card className="mb-4">
            <CardHeader title="Validation Report" />
            <CardBody>
              <div className="flex items-center gap-3 mb-4">
                <Badge tone="green"><CheckCircle2 size={12} /> {preview.accepted.length} accepted</Badge>
                <Badge tone={preview.rejected.length ? 'red' : 'gray'}><AlertTriangle size={12} /> {preview.rejected.length} rejected</Badge>
              </div>
              {preview.rejected.length > 0 && (
                <Table>
                  <THead><TR><TH>Row</TH><TH>Code</TH><TH>Date</TH><TH>Value</TH></TR></THead>
                  <tbody>
                    {preview.rejected.slice(0, 50).map((r, i) => (
                      <TR key={i}>
                        <TD>{r.row}</TD>
                        <TD className="font-mono text-xs">{r.code}</TD>
                        <TD>{r.date ?? '—'}</TD>
                        <TD>{r.value ?? '—'}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={reset}>Cancel</Button>
                <Button onClick={confirm} disabled={preview.accepted.length === 0}>Confirm Upload {preview.accepted.length} rows</Button>
              </div>
            </CardBody>
          </Card>
        )}

        {submitted && (
          <Card className="mb-4">
            <CardBody>
              <div className="text-sm">
                <span className="font-medium">Upload complete.</span> {submitted.accepted} rows saved, {submitted.rejected} rejected.
              </div>
              <div className="mt-3"><Button variant="secondary" onClick={reset}>Upload another file</Button></div>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="CSV Format" />
          <CardBody>
            <pre className="bg-ink-50 text-xs p-3 rounded-md overflow-x-auto">{`Date,${driverHeader}
2026-01-01,1234.5
2026-01-02,1180.2`}</pre>
            <p className="mt-3 text-sm text-ink-500">Dates must be ISO-8601 (<code>YYYY-MM-DD</code>). Values are in {driverUnit} and must be non-negative. Duplicate dates — within the file or against records already on the project — are rejected.</p>
          </CardBody>
        </Card>
      </RegistrationGate>
    </div>
  );
}
