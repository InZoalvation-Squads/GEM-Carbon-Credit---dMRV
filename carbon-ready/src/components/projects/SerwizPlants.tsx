import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Table, THead, TR, TH, TD } from '../ui/Table';
import { SkeletonRows } from '../ui/Skeleton';
import { toast } from '../layout/Toast';
import { useStore } from '../../store';
import { formatNumber } from '../../lib/format';
import { iotApi, type IotDevice } from '../../lib/server-api';
import { backfillPlant, createProjectFromPlant, unmappedPlants } from '../../lib/iot-plants';

const FIRST_PAGE = 10;

/**
 * Plants in the Serwiz IoT database that no project owns yet, with a one-click
 * "create project" that maps the plant and backfills its history. Server mode
 * only; renders nothing when the server has no IoT source configured.
 */
export function SerwizPlants({ search }: { search: string }) {
  const role = useStore((s) => s.currentUser.role);
  const refreshFromServer = useStore((s) => s.refreshFromServer);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [plants, setPlants] = useState<IotDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busyPlant, setBusyPlant] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const status = await iotApi.status();
      setEnabled(status.enabled);
      if (status.enabled) setPlants(unmappedPlants(await iotApi.devices()));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? plants.filter((p) => (p.name ?? p.device_id).toLowerCase().includes(q)) : plants;
  }, [plants, search]);

  if (enabled === false) return null;

  const visible = showAll ? filtered : filtered.slice(0, FIRST_PAGE);
  const canCreate = role !== 'verifier';
  const title = `Plant จาก Serwiz ที่ยังไม่เป็น project (${plants.length})`;

  async function handleCreate(plant: IotDevice) {
    setBusyPlant(plant.device_id);
    try {
      const project = await createProjectFromPlant(plant);
      toast.success('สร้าง project แล้ว', project.name);
      try {
        const stats = await backfillPlant(plant);
        if (stats) toast.success('ดึงข้อมูลย้อนหลังแล้ว', `เพิ่ม ${stats.inserted} วันเข้าระบบ`);
      } catch (err) {
        toast.error('ดึงข้อมูลย้อนหลังไม่สำเร็จ', `${err instanceof Error ? err.message : String(err)} · กด Sync ในหน้า IoT Mapping เพื่อลองใหม่`);
      }
      await Promise.all([refreshFromServer(), reload()]);
    } catch (err) {
      toast.error('สร้าง project ไม่สำเร็จ', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyPlant(null);
    }
  }

  return (
    <section aria-label={title} className="mt-6">
      <Card>
        <CardHeader title={title} />
        {loading && plants.length === 0 ? (
          <div role="status"><span className="sr-only">กำลังโหลด plant จาก Serwiz…</span><SkeletonRows rows={4} columns={5} entity /></div>
        ) : loadError ? (
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-sm text-ink-secondary">
              โหลดรายชื่อ plant จาก Serwiz ไม่ได้: <span className="font-mono text-xs text-red-700 break-all">{loadError}</span>
            </p>
            <Button variant="secondary" size="sm" onClick={() => void reload()}><RefreshCw size={14} /> ลองใหม่</Button>
          </CardBody>
        ) : filtered.length === 0 ? (
          <CardBody>
            <p className="text-sm text-ink-meta">
              {plants.length === 0 ? 'ทุก plant ใน Serwiz มี project แล้ว' : 'ไม่พบ plant ที่ตรงกับคำค้น'}
            </p>
          </CardBody>
        ) : (
          <>
            <Table mobileLabels={['Plant', 'kWp', 'ข้อมูล', 'ล่าสุด', '']}>
              <THead>
                <TR>
                  <TH>Plant</TH>
                  <TH className="text-right">kWp</TH>
                  <TH className="text-right">ข้อมูล</TH>
                  <TH>ล่าสุด</TH>
                  <TH>{''}</TH>
                </TR>
              </THead>
              <tbody>
                {visible.map((p) => {
                  const label = p.name ?? p.device_id;
                  return (
                    <TR key={p.device_id}>
                      <TD>
                        <div className="font-medium text-ink whitespace-normal">{label}</div>
                        {p.location && <div className="text-xs text-ink-meta whitespace-normal">{p.location}</div>}
                      </TD>
                      <TD className="text-right tabular-nums whitespace-nowrap">{p.capacity_kwp != null ? formatNumber(p.capacity_kwp, 1) : '—'}</TD>
                      <TD className="text-right tabular-nums whitespace-nowrap">{p.days > 0 ? `${p.days} วัน` : <span className="text-ink-meta">ยังไม่มีข้อมูล</span>}</TD>
                      <TD className="font-mono text-xs text-ink-secondary whitespace-nowrap">{p.last_date ?? '—'}</TD>
                      <TD className="text-right whitespace-nowrap">
                        {canCreate && (
                          <Button size="sm" variant="secondary" loading={busyPlant === p.device_id}
                            disabled={busyPlant !== null && busyPlant !== p.device_id}
                            aria-label={`สร้าง project จาก ${label}`} onClick={() => void handleCreate(p)}>
                            <Plus size={14} aria-hidden="true" /> สร้าง project
                          </Button>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            {filtered.length > FIRST_PAGE && !showAll && (
              <div className="border-t border-ink-100 px-5 py-3">
                <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>แสดงทั้งหมด ({filtered.length})</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </section>
  );
}
