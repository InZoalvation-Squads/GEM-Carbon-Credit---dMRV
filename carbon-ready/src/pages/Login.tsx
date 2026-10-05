import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Globe, Pause, Play } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../store';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../data/accounts';
import { ROLE_LABEL } from '../lib/labels';

type Lang = 'th' | 'en';

const REMEMBER_KEY = 'gem.login.email';
const LANG_KEY = 'gem.login.lang';
const SUPPORT_MAILTO = 'mailto:support@gem.demo';

const STRINGS = {
  th: {
    title: 'เข้าสู่ระบบ',
    subtitle: 'เข้าสู่ระบบสำหรับองค์กรและผู้พัฒนาโครงการ',
    signingInAs: 'กำลังลงชื่อเข้าใช้เป็น:',
    change: 'เปลี่ยน',
    email: 'อีเมล',
    password: 'รหัสผ่าน',
    showPassword: 'แสดงรหัสผ่าน',
    hidePassword: 'ซ่อนรหัสผ่าน',
    forgot: 'ลืมรหัสผ่าน',
    remember: 'จดจำฉัน',
    submit: 'เข้าสู่ระบบ',
    noAccount: 'ยังไม่มีบัญชี GEM Carbon Credit ?',
    register: 'สมัครบัญชี',
    needHelp: 'ต้องการความช่วยเหลือด้านการเข้าสู่ระบบ ?',
    support: 'ติดต่อทีมสนับสนุน',
    demoHint: 'บัญชีเดโม · คลิกเพื่อกรอกอัตโนมัติ',
    demoPassword: 'รหัสผ่านของบัญชีเดโมทุกบัญชี:',
    prevSlide: 'สไลด์ก่อนหน้า',
    nextSlide: 'สไลด์ถัดไป',
    goToSlide: 'ไปยังสไลด์ที่',
    langBadge: 'EN',
    genericError: 'เข้าสู่ระบบไม่สำเร็จ',
  },
  en: {
    title: 'Sign in',
    subtitle: 'Sign in for corporates and project developers',
    signingInAs: 'Signing in as:',
    change: 'Change',
    email: 'Email',
    password: 'Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    forgot: 'Forgot password',
    remember: 'Remember me',
    submit: 'Sign in',
    noAccount: "Don't have a GEM Carbon Credit account ?",
    register: 'Create account',
    needHelp: 'Need help signing in ?',
    support: 'Contact support',
    demoHint: 'Demo accounts · click to fill',
    demoPassword: 'Password for all demo accounts:',
    prevSlide: 'Previous slide',
    nextSlide: 'Next slide',
    goToSlide: 'Go to slide',
    langBadge: 'ไทย',
    genericError: 'Sign in failed.',
  },
} satisfies Record<Lang, Record<string, string>>;

// Store errors are English; translate the known ones for the Thai UI.
const ERROR_TH: Record<string, string> = {
  'Incorrect password.': 'รหัสผ่านไม่ถูกต้อง',
  'No account found for that email.': 'ไม่พบบัญชีสำหรับอีเมลนี้',
  'Invalid email or password': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'Cannot reach the server. Check your connection and try again.':
    'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง',
  'Session expired — please sign in again.': 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
};

const SLIDES = [
  {
    img: '/login/slide-forest.jpg',
    th: {
      title: 'โทเคไนซ์เครดิตคาร์บอน T-VER อย่างมั่นใจ',
      body: 'เชื่อมข้อมูลจาก TGO ตรวจสอบเอกสารอัตโนมัติ และสร้างโทเคนบนเครือข่ายที่ผ่านการกำกับ ดูสถานะ Mint - Transfer - Retire ในที่เดียว',
    },
    en: {
      title: 'Tokenize T-VER carbon credits with confidence',
      body: 'Connect TGO data, verify documents automatically, and mint tokens on a governed network. Track Mint - Transfer - Retire status in one place.',
    },
  },
  {
    img: '/login/slide-valley.jpg',
    th: {
      title: 'dMRV โปร่งใส ตรวจสอบได้ทุกขั้นตอน',
      body: 'บันทึกหลักฐานการตรวจวัด รายงาน และทวนสอบบนบัญชีแยกประเภทสาธารณะ พร้อมเส้นทางตรวจสอบย้อนกลับครบถ้วนทุกเครดิต',
    },
    en: {
      title: 'Transparent dMRV, auditable end to end',
      body: 'Measurement, reporting, and verification evidence anchored to a public ledger with a complete audit trail for every credit.',
    },
  },
  {
    img: '/login/slide-hills.jpg',
    th: {
      title: 'ผู้พัฒนา ผู้ทวนสอบ และนายทะเบียน ในที่เดียว',
      body: 'จัดการโครงการ เอกสาร PDD การทวนสอบ และการออกเครดิตร่วมกันบนแพลตฟอร์มเดียว ลดงานซ้ำซ้อนและข้อผิดพลาด',
    },
    en: {
      title: 'Developers, verifiers, and registries together',
      body: 'Manage projects, PDD documents, verification, and issuance on a single platform — less duplicated work, fewer errors.',
    },
  },
];

export function Login() {
  const navigate = useNavigate();
  const login = useStore((s) => s.login);

  const [lang, setLang] = useState<Lang>(() =>
    localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'th'
  );
  const remembered = localStorage.getItem(REMEMBER_KEY);
  const [email, setEmail] = useState(remembered ?? '');
  const [locked, setLocked] = useState(Boolean(remembered));
  const [remember, setRemember] = useState(Boolean(remembered));
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const t = STRINGS[lang];
  const active = SLIDES[slide];
  const demoMatch = DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
  const accountLabel = demoMatch?.name ?? email.split('@')[0];

  useEffect(() => {
    if (paused || reducedMotion) return;
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 6000);
    return () => clearInterval(id);
  }, [paused, reducedMotion]);

  function toggleLang() {
    const next: Lang = lang === 'th' ? 'en' : 'th';
    setLang(next);
    localStorage.setItem(LANG_KEY, next);
  }

  function quickFill(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setLocked(true);
    setError('');
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (res.ok) {
      if (remember) localStorage.setItem(REMEMBER_KEY, email.trim().toLowerCase());
      else localStorage.removeItem(REMEMBER_KEY);
      navigate('/dashboard');
    } else {
      const message = res.error ?? t.genericError;
      setError(lang === 'th' ? (ERROR_TH[message] ?? message) : message);
    }
  }

  return (
    <div className="flex min-h-full">
      {/* Left — sign-in card */}
      <div className="flex flex-1 items-center justify-center bg-ground px-4 py-10 lg:px-10">
        <div className="w-full max-w-[460px] rounded-sheet border border-rule bg-surface px-7 py-8 sm:px-10 sm:py-10">
          <div className="flex items-start justify-between">
            <img src="/gem-logo-dark.svg" alt="GEM Carbon Credit" className="h-9 w-auto" />
            <button
              type="button"
              onClick={toggleLang}
              className="inline-flex h-10 items-center gap-1.5 rounded-sheet border border-rule-strong px-3.5 text-sm font-medium text-ink-secondary transition-colors hover:border-rule-strong hover:bg-ground"
            >
              <Globe size={15} aria-hidden />
              {t.langBadge}
            </button>
          </div>
          <p className="mt-3 text-base text-ink-secondary">The Chain of Trust for Digital Carbon</p>

          <h1 className="mt-7 text-2xl font-semibold text-petrol-800">{t.title}</h1>
          <p className="mt-1 text-sm text-ink-meta">{t.subtitle}</p>

          <form onSubmit={submit} className="mt-5">
            {locked ? (
              <div className="flex h-11 items-center justify-between rounded-sheet bg-surface-sunk px-4 text-sm">
                <span className="truncate text-ink-secondary">
                  {t.signingInAs} <span className="font-semibold text-ink">{accountLabel}</span>
                </span>
                <button
                  type="button"
                  onClick={() => { setLocked(false); setPassword(''); setError(''); }}
                  className="ml-3 min-h-8 min-w-8 shrink-0 font-medium text-petrol-600 hover:underline"
                >
                  {t.change}
                </button>
              </div>
            ) : (
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-ink">
                  {t.email}
                </label>
                <input
                  id="login-email"
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@gem.demo"
                  className="block h-11 w-full rounded-sheet border border-rule-strong bg-surface px-4 text-sm transition-colors placeholder:text-ink-meta hover:border-rule-strong focus:border-petrol-600 focus:outline-none focus:ring-2 focus:ring-petrol-600"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => quickFill(a.email)}
                      className="rounded-sheet border border-rule bg-white px-3 py-2 text-left text-xs transition-colors hover:border-petrol-600 hover:bg-ground"
                    >
                      <div className="font-medium text-ink">{ROLE_LABEL[a.role]}</div>
                      <div className="truncate font-mono text-xs text-ink-meta">{a.email}</div>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-meta">
                  {t.demoHint} · {t.demoPassword} <span className="font-mono">{DEMO_PASSWORD}</span>
                </p>
              </div>
            )}

            <div className="mt-5 flex items-center justify-between">
              <label htmlFor="login-password" className="text-sm font-medium text-ink">
                {t.password}
              </label>
              <a href={SUPPORT_MAILTO} className="text-sm text-ink-meta hover:text-ink-secondary hover:underline">
                {t.forgot}
              </a>
            </div>
            <div className="relative mt-1.5">
              <input
                id="login-password"
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••••"
                className="block h-11 w-full rounded-sheet border border-rule-strong bg-surface px-4 pr-11 text-sm transition-colors placeholder:text-ink-meta hover:border-rule-strong focus:border-petrol-600 focus:outline-none focus:ring-2 focus:ring-petrol-600"
              />
              <button
                type="button"
                aria-label={showPw ? t.hidePassword : t.showPassword}
                onClick={() => setShowPw((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-meta transition-colors hover:text-ink-secondary"
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && <p id="login-error" role="alert" className="mt-3 text-sm text-state-rejected">{error}</p>}

            <label className="mt-4 inline-flex min-h-10 cursor-pointer select-none items-center gap-2.5">
              <span className="relative inline-flex">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-sheet border border-rule-strong transition-colors checked:border-petrol-600 checked:bg-petrol-600"
                />
                <Check
                  size={12}
                  strokeWidth={1.75}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 m-auto text-white opacity-0 transition-opacity peer-checked:opacity-100"
                />
              </span>
              <span className="text-sm text-ink-secondary">{t.remember}</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-6 h-12 w-full rounded-sheet bg-petrol-700 text-base font-semibold text-on-petrol transition-colors hover:bg-petrol-800 active:bg-petrol-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t.submit}
            </button>
          </form>

          <div className="mt-7 space-y-2 border-t border-rule pt-6 text-sm text-ink-secondary">
            <p>
              {t.noAccount}{' '}
              <Link to="/register" className="font-semibold text-petrol-600 hover:underline">
                {t.register}
              </Link>
            </p>
            <p>
              {t.needHelp}{' '}
              <a href={SUPPORT_MAILTO} className="font-semibold text-petrol-600 hover:underline">
                {t.support}
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Right — brand showcase carousel */}
      <div className="hidden w-1/2 items-center justify-center bg-petrol-800 px-12 py-10 lg:flex">
        <div className="w-full max-w-2xl">
          <div className="relative overflow-hidden rounded-sheet">
            <img
              src={active.img}
              alt=""
              className="aspect-[16/10] w-full object-cover"
            />
            <button
              type="button"
              aria-label={t.prevSlide}
              onClick={() => setSlide((s) => (s - 1 + SLIDES.length) % SLIDES.length)}
              className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-sheet border border-on-petrol-2 bg-petrol-800 text-on-petrol transition-colors hover:bg-petrol-900 rail-focus"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              aria-label={t.nextSlide}
              onClick={() => setSlide((s) => (s + 1) % SLIDES.length)}
              className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-sheet border border-on-petrol-2 bg-petrol-800 text-on-petrol transition-colors hover:bg-petrol-900 rail-focus"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="mx-auto mt-8 max-w-xl text-center">
            <h2 className="text-2xl font-semibold leading-snug text-on-petrol">
              {active[lang].title}
            </h2>
            <p className="mt-4 leading-7 text-on-petrol-2">{active[lang].body}</p>
          </div>

          <div className="mt-8 flex items-center justify-center gap-2">
            <button type="button" aria-label={reducedMotion ? 'Carousel paused for reduced motion' : paused ? 'Play carousel' : 'Pause carousel'} aria-pressed={paused || reducedMotion}
              onClick={() => setPaused((value) => !value)} disabled={reducedMotion}
              className="rail-focus inline-flex min-h-10 min-w-10 items-center justify-center rounded-sheet border border-on-petrol-2 text-on-petrol disabled:opacity-100">
              {paused || reducedMotion ? <Play size={18} /> : <Pause size={18} />}
            </button>
            {SLIDES.map((s, i) => (
              <button
                key={s.img}
                type="button"
                aria-label={`${t.goToSlide} ${i + 1}`}
                aria-current={i === slide ? "true" : undefined}
                onClick={() => setSlide(i)}
                className={clsx(
                  'h-8 w-8 rounded-sheet border transition-colors rail-focus',
                  i === slide ? 'border-lime-400 bg-lime-400' : 'border-on-petrol-2 bg-petrol-800 hover:bg-petrol-900'
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
