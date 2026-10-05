import { DragEvent, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import clsx from 'clsx';

interface Props { onFile: (f: File) => void; accept?: string; columnsHint?: string; }
export function FileDrop({ onFile, accept = '.csv,text/csv', columnsHint = 'Date, Generation_kWh' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setHover(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      className={clsx(
        'cursor-pointer rounded-xl border-2 border-dashed bg-white px-6 py-12 text-center transition-colors',
        hover ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:border-brand-500'
      )}
    >
      <Upload aria-hidden className="mx-auto text-ink-400" size={32} />
      <div className="mt-3 text-sm font-medium text-ink-900">Drop CSV here, or click to browse</div>
      <div className="mt-1 text-xs text-ink-500">Expected columns: <code>{columnsHint}</code></div>
      <input
        ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}
