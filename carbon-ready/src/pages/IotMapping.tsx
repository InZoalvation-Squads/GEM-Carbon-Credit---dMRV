import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cable, ExternalLink, Link2, PlugZap, RefreshCw, Trash2, Zap } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, THead, TR, TH, TD } from '../components/ui/Table';
import { Select } from '../components/ui/Select';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonRows } from '../components/ui/Skeleton';
import { toast } from '../components/layout/Toast';
import { useStore } from '../store';
import { formatNumber } from '../lib/format';
import {
  iotApi, serverMode,
  type IotDevice, type IotStatus, type IotSyncStats,
} from '../lib/server-api';

/**
 * IoT data mapping page: list plants/meters found in the external IoT
 * database, map each to a project (or create the project straight from the
 * plant's own name/capacity), and trigger a sync — no .env editing involved.
 */
export function IotMapping() {
  const projects = useStore((s) => s.projects);
  const refreshFromServer = useStore((s) => s.refreshFromServer);

  const [status, setStatus] = useState<IotStatus | null>(null);
  const [devices, setDevices] = useState<IotDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyDevice, setBusyDevice] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [backfillDays, setBackfillDays] = useState('0');
  const [lastSync, setLastSync] = useState<IotSyncStats | null>(null);

  const projectName = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const st = await iotApi.status();
      setStatus(st);
      if (st.enabled) setDevices(await iotApi.devices());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  if (!serverMode()) {
    return (
      <div>
        <PageHeader title="IoT Mapping" />
        <Card><CardBody className="p-0">
          <EmptyState icon={<PlugZap size={32} />} illustration="/illustrations/empty-iot.webp" title="ต้องใช้โหมด server"
            hint="หน้านี้ทำงานเมื่อ SPA เชื่อมกับ backend (ตั้งค่า VITE_API_BASE_URL)" />
        </CardBody></Card>
      </div>
    );
  }

  /** Backfill window reaching the device's first data day (+2 days slack, server caps at 400 days). */
  function backfillHoursFor(firstDate: string): number {
    const days = Math.ceil((Date.now() - new Date(`${firstDate}T00:00:00`).getTime()) / 86_400_000) + 2;
    return Math.min(days, 400) * 24;
  }

  /** After a new mapping, pull the plant's ENTIRE history so coverage hits 100% without extra clicks. */
  async function autoBackfill(device: IotDevice) {
    if (!device.first_date) return; // no readings at the source yet — cron will pick them up when they appear
    const stats = await iotApi.sync(backfillHoursFor(device.first_date));
    setLastSync(stats);
    toast.success('ดึงข้อมูลย้อนหลังแล้ว', `เพิ่ม ${stats.inserted} วันเข้าระบบ`);
  }

  async function handleMap(device: IotDevice) {
    const projectId = selection[device.device_id];
    if (!projectId) return;
    setBusyDevice(device.device_id);
    try {
      await iotApi.map(device.device_id, projectId, device.name ?? undefined);
      toast.success('Map สำเร็จ', `${device.name ?? device.device_id} → ${projectName.get(projectId) ?? projectId}`);
      await autoBackfill(device);
      await Promise.all([refreshFromServer(), reload()]);
    } catch (err) {
      toast.error('Map ไม่สำเร็จ', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyDevice(null);
    }
  }

  async function handleUnmap(device: IotDevice) {
    setBusyDevice(device.device_id);
    try {
      await iotApi.unmap(device.device_id);
      toast.info('ยกเลิก mapping แล้ว', device.name ?? device.device_id);
      await reload();
    } catch (err) {
      toast.error('ยกเลิกไม่สำเร็จ', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyDevice(null);
    }
  }

  async function handleCreateProject(device: IotDevice) {
    setBusyDevice(device.device_id);
    try {
      const project = await iotApi.createProject({
        device_id: device.device_id,
        name: device.name ?? device.device_id,
        capacity_kwp: device.capacity_kwp ?? 1,
        location: device.location ?? 'Thailand',
        commission_date: device.commission_date ?? device.first_date ?? new Date().toISOString().slice(0, 10),
      });
      toast.success('สร้างโปรเจกต์ + map แล้ว', project.name);
      await autoBackfill(device);
      await Promise.all([refreshFromServer(), reload()]);
    } catch (err) {
      toast.error('สร้างโปรเจกต์ไม่สำเร็จ', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyDevice(null);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const days = Number(backfillDays);
      const stats = await iotApi.sync(days > 0 ? days * 24 : undefined);
      setLastSync(stats);
      toast.success('Sync สำเร็จ', `เพิ่ม ${stats.inserted} วัน · ข้ามที่มีอยู่ ${stats.skipped_existing} · ข้ามวันนี้ ${stats.skipped_partial_day}`);
      await refreshFromServer();
    } catch (err) {
      toast.error('Sync ไม่สำเร็จ', err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  const mappedCount = devices.filter((d) => d.project_id).length;

  return (
    <div>
      <PageHeader
        title="IoT Mapping"
        subtitle="จับคู่ plant/มิเตอร์จากฐานข้อมูล IoT เข้ากับโปรเจกต์ แล้วระบบจะดึงยอดผลิตรายวันให้อัตโนมัติ"
        action={status?.enabled && (
          <div className="flex items-end gap-2">
            <Select label="Backfill" value={backfillDays} onChange={(e) => setBackfillDays(e.target.value)} className="w-36">
              <option value="0">ช่วงปกติ ({Math.round((status.lookback_hours ?? 96) / 24)} วัน)</option>
              <option value="7">ย้อนหลัง 7 วัน</option>
              <option value="30">ย้อนหลัง 30 วัน</option>
              <option value="60">ย้อนหลัง 60 วัน</option>
              <option value="180">ย้อนหลัง 180 วัน</option>
            </Select>
            <Button onClick={() => void handleSync()} loading={syncing}>
              <RefreshCw size={16} /> Sync ตอนนี้
            </Button>
          </div>
        )}
      />

      {loading ? (
        <Card role="status"><span className="sr-only">กำลังโหลด…</span><SkeletonRows columns={6} entity /></Card>
      ) : !status?.enabled ? (
        <Card><CardBody className="p-0">
          <EmptyState icon={<Cable size={32} />} illustration="/illustrations/empty-iot.webp" title="ยังไม่ได้เชื่อมฐานข้อมูล IoT"
            hint="ตั้งค่า IOT_DB_URL ใน server/.env แล้ว restart server — mapping ทั้งหมดจัดการจากหน้านี้ได้เลย ไม่ต้องแก้ .env อีก" />
        </CardBody></Card>
      ) : loadError ? (
        <Card><CardBody className="py-8 text-center text-sm text-state-rejected">{loadError}</CardBody></Card>
      ) : (
        <div className="space-y-4">
          <Card className="border-brand-100 bg-brand-50/60">
            <CardBody className="flex flex-wrap items-center gap-x-8 gap-y-2 py-4 text-sm text-ink-secondary">
              <span className="inline-flex items-center gap-1.5 font-semibold text-brand-600">
                <Zap size={15} /> เชื่อมต่อแล้ว
              </span>
              <span>ตาราง <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs">{status.table}</code></span>
              <span>{devices.length} plant · มีข้อมูล {devices.filter((d) => d.days > 0).length} · map แล้ว {mappedCount}</span>
              <span>หักตามแผน monitoring {status.deduction_pct}%</span>
              <span>ดึงอัตโนมัติทุกชั่วโมง (เฉพาะวันที่จบแล้ว ไม่เขียนทับของเดิม)</span>
              {lastSync && (
                <span className="font-medium text-brand-600">
                  ล่าสุด: +{lastSync.inserted} วัน (ข้าม {lastSync.skipped_existing + lastSync.skipped_partial_day})
                </span>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={`อุปกรณ์ / Plant (${devices.length})`} action={<Link2 size={16} className="text-ink-meta" />} />
            <CardBody className="p-0">
              {devices.length === 0 ? (
                <EmptyState icon={<Cable size={32} />} illustration="/illustrations/empty-iot.webp" title="ไม่พบข้อมูลในตารางอ่านค่า" />
              ) : (
                <Table mobileLabels={["Plant", "kWp", "ช่วงข้อมูล", "เฉลี่ย/วัน", "โปรเจกต์", "จัดการ"]}>
                    <THead>
                      <TR>
                        <TH className="px-5 py-3">Plant</TH>
                        <TH className="px-3 py-3 text-right">kWp</TH>
                        <TH className="px-3 py-3">ช่วงข้อมูล</TH>
                        <TH className="px-3 py-3 text-right">เฉลี่ย/วัน</TH>
                        <TH className="px-3 py-3">โปรเจกต์</TH>
                        <TH className="px-5 py-3 text-right">จัดการ</TH>
                      </TR>
                    </THead>
                    <tbody className="divide-y divide-rule">
                      {devices.map((d) => {
                        const mapped = d.project_id;
                        const busy = busyDevice === d.device_id;
                        return (
                          <TR key={d.device_id}>
                            <TD className="px-5 py-3">
                              <div className="font-medium text-ink">{d.name ?? d.device_id}</div>
                              <div className="font-mono text-xs text-ink-meta">{d.device_id}</div>
                            </TD>
                            <TD className="px-3 py-3 text-right tabular-nums text-ink-secondary">
                              {d.capacity_kwp != null ? formatNumber(d.capacity_kwp, 1) : '—'}
                            </TD>
                            <TD className="px-3 py-3 whitespace-nowrap text-xs text-ink-meta">
                              {d.first_date ? (
                                <>
                                  {d.first_date} → {d.last_date}
                                  <span className="ml-1.5 rounded-full bg-surface-sunk px-1.5 py-0.5 text-xs text-ink-secondary">{d.days} วัน</span>
                                </>
                              ) : (
                                <span className="rounded-full bg-surface-sunk px-2 py-0.5 text-xs text-ink-meta"
                                  title="plant นี้ยังไม่มีค่าอ่านเข้ามาในฐานข้อมูล IoT — ต้องตามที่ระบบเก็บข้อมูลต้นทาง">
                                  ไม่มีข้อมูลใน IoT DB
                                </span>
                              )}
                            </TD>
                            <TD className="px-3 py-3 text-right tabular-nums text-ink-secondary">
                              {d.first_date ? `${formatNumber(d.avg_value, 1)} kWh` : '—'}
                            </TD>
                            <TD className="px-3 py-3">
                              {mapped ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600 ring-1 ring-brand-600/15">
                                    <ExternalLink size={12} /> {projectName.get(mapped) ?? mapped}
                                  </span>
                                  {d.synced_days != null && (
                                    d.synced_days >= d.days ? (
                                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 ring-1 ring-brand-600/15">
                                        ครบ {d.synced_days}/{d.days} วัน
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-state-revision/5 px-2 py-0.5 text-xs font-medium text-state-revision ring-1 ring-state-revision/15"
                                        title="กด Sync + backfill เพื่อดึงวันที่เหลือ">
                                        ในระบบ {d.synced_days}/{d.days} วัน
                                      </span>
                                    )
                                  )}
                                </div>
                              ) : (
                                <Select
                                  label={`เลือกโปรเจกต์สำหรับ ${d.name ?? d.device_id}`}
                                  value={selection[d.device_id] ?? ''}
                                  onChange={(e) => setSelection((s) => ({ ...s, [d.device_id]: e.target.value }))}
                                  className="h-9 min-w-44 text-sm"
                                >
                                  <option value="">— เลือกโปรเจกต์ —</option>
                                  {projects.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </Select>
                              )}
                            </TD>
                            <TD className="px-5 py-3 text-right">
                              {mapped ? (
                                <Button variant="ghost" size="sm" loading={busy} onClick={() => void handleUnmap(d)}>
                                  <Trash2 size={14} /> ยกเลิก
                                </Button>
                              ) : (
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="secondary" loading={busy}
                                    disabled={!selection[d.device_id]}
                                    onClick={() => void handleMap(d)}>
                                    Map
                                  </Button>
                                  <Button size="sm" loading={busy} onClick={() => void handleCreateProject(d)}>
                                    สร้างโปรเจกต์ + Map
                                  </Button>
                                </div>
                              )}
                            </TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </Table>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
