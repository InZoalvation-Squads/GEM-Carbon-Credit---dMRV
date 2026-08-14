import { useMemo, useState } from 'react';
import { Copy, Printer } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { toast } from '../layout/Toast';
import { buildRecCoverLetter } from '../../lib/rec-cover-letter';

/**
 * Drafts the EGAT registrant-submission cover letter (Process Guide V15 p.5
 * official example). Ephemeral tool: nothing is persisted — the user copies
 * the text onto company letterhead or prints it.
 */
export function RecCoverLetterModal({ checkedIds, onClose }: {
  checkedIds: ReadonlySet<string>;
  onClose: () => void;
}) {
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [copied, setCopied] = useState(false);

  const letter = useMemo(
    () => buildRecCoverLetter({ companyName, companyAddress, date, checkedIds }),
    [companyName, companyAddress, date, checkedIds],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('คัดลอกไม่สำเร็จ', 'เลือกข้อความในกล่องด้านบนแล้วคัดลอกเองได้');
    }
  }

  function printLetter() {
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('เปิดหน้าพิมพ์ไม่สำเร็จ', 'เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปแล้วลองใหม่');
      return;
    }
    w.document.write(`<pre style="font-family: monospace; white-space: pre-wrap; padding: 24px;">${
      letter.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    }</pre>`);
    w.document.close();
    w.print();
  }

  return (
    <Modal open onClose={onClose} title="ร่างจดหมายนำส่งถึง EGAT" size="lg">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="ชื่อบริษัท" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <Input label="วันที่" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Textarea label="ที่อยู่บริษัท" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
        <p className="text-xs text-ink-400">
          โครงจดหมายตามตัวอย่างทางการใน EGAT Process Guide — ช่อง [.....] ให้กรอกเพิ่มใน Word/กระดาษหัวจดหมายบริษัท
        </p>
        <pre data-testid="cover-letter-preview"
          className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-4 font-mono text-xs text-ink-800 ring-1 ring-ink-200">
          {letter}
        </pre>
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="secondary" onClick={printLetter}><Printer size={15} /> พิมพ์</Button>
          <Button onClick={copy}><Copy size={15} /> {copied ? 'Copied ✓' : 'Copy'}</Button>
        </div>
      </div>
    </Modal>
  );
}
