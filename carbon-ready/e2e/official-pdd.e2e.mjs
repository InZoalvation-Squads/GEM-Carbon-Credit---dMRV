// E2E: T-VER-S-F001-PDD official document over the two live demo projects.
//
// Preconditions (run against the live dev stack — NOT part of `npm test`):
//   1. backend running:  cd server && npm run dev          (port 4000)
//   2. SPA running:      cd carbon-ready && npm run dev    (port 5173, server mode)
//   3. demo data: "Solar Rooftop มรภ.หมู่บ้านจอมบึง" (MCRU dataset, photos) and
//      "Trat Community college" (IoT-fed project) exist with registered/submitted PDDs
//
// Run:  npm run test:e2e
// Uses the system Chrome (playwright-core, no browser download). Override the
// binary with CHROME_PATH, the app with E2E_BASE_URL / E2E_API_URL.

import { chromium } from 'playwright-core';

const APP = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const API = (process.env.E2E_API_URL ?? 'http://localhost:4000') + '/api/v1';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const EMAIL = 'proponent@gem.demo';
const PASSWORD = 'demo1234';

// Every official document must carry the form frame + the reference-completeness
// sections (TOC, boundary/monitoring diagrams, forecast + financial appendices).
const FORM_TEXT = [
  'T-VER-S-F001-PDD', 'VERSION 2.1',
  'สารบัญ',
  'รูปที่ 1 ขอบเขตของโครงการ',
  'รูปแสดงผังจุดตรวจวัด',
  'แผนผังขั้นตอนการจัดเก็บข้อมูล',
  'ตารางแสดงปริมาณไฟฟ้าคาดการณ์รายปี',
  'การประเมินทางด้านการเงินของระบบผลิตไฟฟ้า',
  'ระยะเวลาคุ้มทุน',
];
const PROJECTS = [
  {
    // MCRU dataset — the reference figures must reproduce exactly.
    name: 'Solar Rooftop มรภ.หมู่บ้านจอมบึง',
    text: [
      ...FORM_TEXT,
      'มหาวิทยาลัยราชภัฏหมู่บ้านจอมบึง',
      '451.31', '440.58', '3,121.48', '3,098', '445.93', '2.72',
      '443 ตันคาร์บอนไดออกไซด์เทียบเท่าต่อปี',
      '5,801.40', // EC_PJ from THIS project's consumers (inverter 610 kWh; the printed reference used 610.28)
      '963,915', '941,011', '6,666,972', '952,425', // forecast appendix (chained rounding)
      'เลขที่ 12/2568',                       // construction permit line
      '46 หมู่ 3 ตำบลจอมบึง',                  // full address
      'Trinasolar', 'รุ่น SUN2000-50KTL-M3',   // equipment specs list
    ],
  },
  {
    // IoT-fed project — year-1 estimate derives from real synced generation.
    name: 'Trat Community college',
    text: [
      ...FORM_TEXT,
      'วิทยาลัยชุมชนตราด',
      '52,481', // year-1 kWh from the IoT average
    ],
  },
];

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function api(path, token, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

// ---- discover the demo projects + their PDD ids through the API ----
const { access_token: token } = await api('/auth/login', null, {
  method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
// NB: GET /pdds is the validation queue (registered PDDs are excluded by
// design) — resolve each project's PDD via /projects/:id/pdd instead.
const { projects } = await api('/projects', token);
for (const p of PROJECTS) {
  const row = projects.find((x) => x.name === p.name);
  p.projectId = row?.id;
  const pdd = row ? (await api(`/projects/${row.id}/pdd`, token).catch(() => null))?.pdd : undefined;
  p.pddId = pdd?.id;
  // Expected figure count from live data: an EXPLICITLY chosen cover leaves the
  // section-1 figures; a fallback first-image cover stays in them (template rule).
  if (row) {
    const { evidence } = await api(`/projects/${row.id}/evidence`, token);
    const images = evidence.filter((e) => e.kind === 'image' && e.status === 'active');
    const explicit = images.some((img) => img.id === pdd?.section_data?.cover_evidence_id);
    p.figures = Math.max(0, images.length - (explicit ? 1 : 0));
  }
  check(`discover: ${p.name}`, Boolean(p.pddId), p.pddId ?? 'project or PDD missing — reseed demo data');
}
if (failures > 0) {
  console.error('\ndemo data missing — aborting browser checks');
  process.exit(1);
}

// ---- drive the SPA ----
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  await page.goto(APP + '/');
  await page.waitForTimeout(800);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  check('login + hydration', true);

  for (const p of PROJECTS) {
    console.log(`\n— ${p.name} —`);

    await page.goto(`${APP}/registration/${p.pddId}/document`);
    await page.waitForTimeout(800);
    check('export button on PDD document', (await page.getByText('เอกสารฟอร์ม อบก.').count()) > 0);

    await page.goto(`${APP}/registration/${p.pddId}/official`);
    // figures fetch after mount — wait for the last expected image, or settle
    if (p.figures > 0) {
      await page.locator('figure img').nth(p.figures - 1).waitFor({ timeout: 10_000 }).catch(() => {});
    }
    await page.waitForTimeout(600);

    const body = await page.textContent('body');
    for (const probe of p.text) check(`shows "${probe}"`, body.includes(probe));

    const logos = await page.locator('img[src="/tgo-logo-notext.svg"]')
      .evaluateAll((els) => els.map((e) => e.complete && e.naturalWidth > 0));
    check('TGO logo on every page header', logos.length >= 5 && logos.every(Boolean), `${logos.length} headers`);

    const figs = await page.locator('figure img')
      .evaluateAll((els) => els.map((e) => e.complete && e.naturalWidth > 0));
    check(`evidence figures loaded (${p.figures})`, figs.length === p.figures && figs.every(Boolean), `found ${figs.length}`);

    const rows = await page.locator('[data-testid="yearly-table"] tbody tr').count();
    check('yearly table = 7 years + total + avg', rows === 9, `${rows} rows`);

    const finRows = await page.locator('[data-testid="financial-table"] tbody tr').count();
    check('financial table = 26 cash-flow rows + sum', finRows === 27, `${finRows} rows`);
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nE2E PASS' : `\nE2E FAIL — ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
