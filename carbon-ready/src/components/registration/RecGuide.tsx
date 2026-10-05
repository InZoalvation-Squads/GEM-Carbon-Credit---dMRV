import { useState } from 'react';
import { ChevronDown, FileDown, FileText } from 'lucide-react';
import { Button } from '../ui/Button';
import { useStore } from '../../store';
import { REC_GUIDE_PHASES } from '../../data/rec-guide';
import { currentRecPhase } from '../../lib/rec-journey';
import { RecCoverLetterModal } from './RecCoverLetterModal';

export const REC_GUIDE_STORAGE_KEY = 'carbonready.rec-guide.v1';

// localStorage can be absent/full (private mode) — persistence degrades to
// session-only state, never crashes.
function loadChecked(): Set<string> {
  try {
    const raw = localStorage.getItem(REC_GUIDE_STORAGE_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveChecked(ids: Set<string>) {
  try {
    localStorage.setItem(REC_GUIDE_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // private mode / quota — keep in-memory state only
  }
}

/**
 * 3-phase REC onboarding guide with a tickable document checklist, shown on the
 * REC track of the Register Project page. Content: EGAT Process Guide V12 +
 * Evident SF-02 v1.3 (see src/data/rec-guide.ts).
 */
export function RecGuide() {
  const pdds = useStore((s) => s.pdds);
  const methodologies = useStore((s) => s.methodologies);
  // Where the org actually is in the journey — drives the ✓ / "คุณอยู่ขั้นนี้"
  // markers and which phase opens by default.
  const journeyPhase = currentRecPhase(pdds, methodologies);

  const [checked, setChecked] = useState<Set<string>>(loadChecked);
  const [openKeys, setOpenKeys] = useState<Set<string>>(
    () => new Set([REC_GUIDE_PHASES[journeyPhase - 1]?.key ?? REC_GUIDE_PHASES[0].key]),
  );
  const [letterOpen, setLetterOpen] = useState(false);

  function toggleItem(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveChecked(next);
      return next;
    });
  }

  function togglePhase(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function clearAll() {
    const empty = new Set<string>();
    saveChecked(empty);
    setChecked(empty);
  }

  return (
    <div className="mb-4 rounded-sheet border border-rule/80 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink">ขั้นตอนขึ้นทะเบียน REC — เตรียมอะไรบ้าง</h2>
      <div className="divide-y divide-rule">
        {REC_GUIDE_PHASES.map((phase, idx) => {
          const open = openKeys.has(phase.key);
          const done = phase.items.filter((i) => checked.has(i.id)).length;
          const phasePassed = idx < journeyPhase - 1;
          const isCurrent = idx === journeyPhase - 1;
          return (
            <div key={phase.key} className={` ${isCurrent ? 'bg-petrol-50' : ''}`}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`rec-guide-${phase.key}`}
                onClick={() => togglePhase(phase.key)}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left"
              >
                {phasePassed && <span className="shrink-0 font-semibold text-petrol-600">✓</span>}
                <span className="flex-1 text-sm font-medium text-ink">{phase.title}</span>
                {isCurrent && (
                  <span className="shrink-0 rounded-full bg-petrol-600 px-2 py-0.5 text-xs font-semibold text-white">
                    คุณอยู่ขั้นนี้
                  </span>
                )}
                {phase.items.length > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    done === phase.items.length ? 'bg-petrol-50 text-petrol-700' : 'bg-surface-sunk text-ink-meta'}`}>
                    {done}/{phase.items.length}
                  </span>
                )}
                <ChevronDown size={14} className={`shrink-0 text-ink-meta transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div id={`rec-guide-${phase.key}`} className="border-t border-rule px-3 py-2">
                  {phase.notes.length > 0 && (
                    <ul className="mb-2 list-disc space-y-0.5 pl-4 text-xs text-ink-meta">
                      {phase.notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  )}
                  {phase.links && phase.links.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {phase.links.map((l) => (
                        <a
                          key={l.url}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-petrol-100 bg-petrol-50/60 px-2.5 py-1 text-xs font-medium text-petrol-700 transition-colors hover:border-petrol-600 hover:bg-petrol-50"
                        >
                          <FileDown size={12} aria-hidden />
                          {l.label}
                        </a>
                      ))}
                      {phase.key === 'registrant' && (
                        <button
                          type="button"
                          onClick={() => setLetterOpen(true)}
                          className="inline-flex items-center gap-1 rounded-full border border-petrol-100 bg-petrol-50/60 px-2.5 py-1 text-xs font-medium text-petrol-700 transition-colors hover:border-petrol-600 hover:bg-petrol-50"
                        >
                          <FileText size={12} aria-hidden />
                          ร่างจดหมายนำส่ง
                        </button>
                      )}
                    </div>
                  )}
                  {phase.items.length > 0 && (
                    <div className="space-y-1">
                      {phase.items.map((item) => (
                        <label key={item.id} className="flex cursor-pointer items-start gap-2 text-sm text-ink-secondary">
                          <input
                            type="checkbox"
                            checked={checked.has(item.id)}
                            onChange={() => toggleItem(item.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-rule-strong accent-petrol-600"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-end">
        <Button variant="ghost" onClick={clearAll}>ล้าง checklist</Button>
      </div>
      {letterOpen && <RecCoverLetterModal checkedIds={checked} onClose={() => setLetterOpen(false)} />}
    </div>
  );
}
