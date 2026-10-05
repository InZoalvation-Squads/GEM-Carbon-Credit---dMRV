import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useStore } from '../../store';
import { api } from '../../lib/api';
import type { EurThbResult } from '../../lib/server-api';
import type { RecRoiSettings, RecRoiSettingsInput } from '../../types';
import { fmtDate } from '../../lib/date';
import { toast } from '../layout/Toast';

type Draft = Record<
  'price_low_thb' | 'price_mid_thb' | 'price_high_thb' | 'platform_fee_pct' | 'eur_thb' | 'horizon_years'
  | 'price_source' | 'eur_thb_source',
  string
>;

const toDraft = (s: RecRoiSettings): Draft => ({
  price_low_thb: s.price_low_thb?.toString() ?? '',
  price_mid_thb: s.price_mid_thb?.toString() ?? '',
  price_high_thb: s.price_high_thb?.toString() ?? '',
  platform_fee_pct: s.platform_fee_pct?.toString() ?? '',
  eur_thb: s.eur_thb?.toString() ?? '',
  horizon_years: String(s.horizon_years),
  price_source: s.price_source,
  eur_thb_source: s.eur_thb_source,
});

type Key = keyof Draft;
const NUMBER_KEYS: Key[] = ['price_low_thb', 'price_mid_thb', 'price_high_thb', 'platform_fee_pct', 'eur_thb', 'horizon_years'];
const FIELD_LABEL: Record<Key, string> = {
  price_low_thb: 'ราคาต่ำ', price_mid_thb: 'ราคากลาง', price_high_thb: 'ราคาสูง',
  platform_fee_pct: 'ค่าบริการแพลตฟอร์ม', eur_thb: 'อัตรา EUR→THB', horizon_years: 'ระยะประเมิน',
  price_source: 'ที่มาของราคา', eur_thb_source: 'ที่มา FX',
};

const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));

const fromDraft = (d: Draft): RecRoiSettingsInput => ({
  price_low_thb: num(d.price_low_thb),
  price_mid_thb: num(d.price_mid_thb),
  price_high_thb: num(d.price_high_thb),
  price_source: d.price_source.trim(),
  platform_fee_pct: num(d.platform_fee_pct),
  eur_thb: num(d.eur_thb),
  eur_thb_source: d.eur_thb.trim() ? d.eur_thb_source.trim() || 'กรอกเอง' : '',
  horizon_years: Number(d.horizon_years),
});

/** Org-level REC ROI assumptions. Editable by admin/esg_manager; read-only otherwise. */
export function RecRoiAssumptions() {
  const settings = useStore((s) => s.recRoiSettings);
  const role = useStore((s) => s.currentUser.role);
  const canEdit = role === 'admin' || role === 'esg_manager';
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [saving, setSaving] = useState(false);
  const [bot, setBot] = useState<EurThbResult>({ available: false });

  const [bad, setBad] = useState<Set<Key>>(new Set());

  // Re-sync only when a save landed (updated_at moved), never on a mere reference change.
  const syncedAt = useRef(settings.updated_at);
  useEffect(() => {
    if (syncedAt.current === settings.updated_at) return;
    syncedAt.current = settings.updated_at;
    setDraft(toDraft(settings));
    setBad(new Set());
  }, [settings]);
  useEffect(() => {
    if (!canEdit) return;
    let live = true;
    api.fetchEurThb().then((r) => { if (live && r.available) setBot(r); });
    return () => { live = false; };
  }, [canEdit]);

  const field = (key: Key) => ({
    value: draft[key],
    disabled: !canEdit,
    error: bad.has(key) ? 'ตัวเลขไม่ถูกต้อง' : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target;
      const isBad = NUMBER_KEYS.includes(key) && e.target.validity?.badInput === true;
      setBad((prev) => {
        if (prev.has(key) === isBad) return prev;
        const next = new Set(prev);
        if (isBad) next.add(key); else next.delete(key);
        return next;
      });
      // FX provenance follows the input: typing = manual; the BOT button sets its own source.
      setDraft((d) => (key === 'eur_thb'
        ? { ...d, eur_thb: value, eur_thb_source: value.trim() ? 'กรอกเอง' : '' }
        : { ...d, [key]: value }));
    },
  });

  const save = async () => {
    if (bad.size > 0) {
      toast.error('บันทึกไม่ได้', `ตัวเลขไม่ถูกต้องในช่อง ${[...bad].map((k) => FIELD_LABEL[k]).join(', ')}`);
      return;
    }
    setSaving(true);
    await api.saveRecRoiSettings(fromDraft(draft));
    setSaving(false);
  };

  return (
    <Card className="mb-6">
      <CardHeader
        title="สมมติฐาน"
        action={settings.updated_by && settings.updated_at
          ? <span className="text-xs text-ink-meta">แก้ล่าสุด: {settings.updated_by} · {fmtDate(settings.updated_at)}</span>
          : undefined}
      />
      <CardBody className="space-y-5 p-5">
        <div className="flex gap-2 rounded-sheet border border-state-revision/30 bg-state-revision/5 px-3 py-2 text-xs text-state-revision">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            ไม่มีราคากลาง REC ในไทย (ตลาดสมัครใจ/OTC) — กรอกราคาจากข้อเสนอซื้อจริงหรือโบรกเกอร์ พร้อมระบุที่มา
            ระบบแสดง “ราคาคุ้มทุน” ได้เสมอแม้ยังไม่มีราคา
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-4"><Input label="ราคาต่ำ (฿/MWh)" type="number" min="0" step="any" {...field('price_low_thb')} /></div>
          <div className="md:col-span-4"><Input label="ราคากลาง (฿/MWh)" type="number" min="0" step="any" {...field('price_mid_thb')} /></div>
          <div className="md:col-span-4"><Input label="ราคาสูง (฿/MWh)" type="number" min="0" step="any" {...field('price_high_thb')} /></div>
          <div className="md:col-span-12"><Input label="ที่มาของราคา" placeholder="เช่น ใบเสนอซื้อ บริษัท X ลงวันที่ …" {...field('price_source')} /></div>
          <div className="md:col-span-4"><Input label="ค่าบริการแพลตฟอร์ม (% ของรายได้)" type="number" min="0" max="99.99" step="any" {...field('platform_fee_pct')} /></div>
          <div className="md:col-span-4"><Input label="อัตรา EUR→THB" type="number" min="0" step="any" {...field('eur_thb')} /></div>
          <div className="md:col-span-4"><Input label="ระยะประเมิน (ปี)" type="number" min="1" max="25" step="1" {...field('horizon_years')} /></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
            {draft.eur_thb_source && <>ที่มา FX: {draft.eur_thb_source}</>}
            {canEdit && bot.available && bot.rate !== null && (
              <Button variant="ghost" size="sm" onClick={() => {
                setBad((p) => { const n = new Set(p); n.delete('eur_thb'); return n; });
                setDraft((d) => ({ ...d, eur_thb: String(bot.rate), eur_thb_source: bot.source }));
              }}>
                ใช้อัตรา BOT {bot.period}: {bot.rate}
              </Button>
            )}
            {canEdit && bot.available && bot.rate === null && <span className="text-state-rejected">{bot.error}</span>}
          </div>
          {canEdit && <Button onClick={save} disabled={saving}>บันทึกสมมติฐาน</Button>}
        </div>
      </CardBody>
    </Card>
  );
}
