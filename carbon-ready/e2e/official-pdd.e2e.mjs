// E2E: T-VER-S-F001-PDD official document over the two demo projects.
//
// Preconditions (run against the live dev stack — NOT part of `npm test`):
//   1. backend running:  cd server && npm run dev          (port 4000)
//   2. SPA running:      cd carbon-ready && npm run dev    (port 5173, server mode)
//   3. demo data seeded: the two "Solar Rooftop มรภ.หมู่บ้านจอมบึง" projects
//      (created 2026-08-03 via the API workflow) exist in the company DB
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

// The two demo projects and what their official documents must show.
// Both carry the MCRU dataset (EF 0.4682, year-1 963,915 kWh, 0.4 %/yr,
// EC_PJ 5,801.68) so the reference figures must render on both.
const SHARED_TEXT = [
  'T-VER-S-F001-PDD', 'VERSION 2.1',
  'มหาวิทยาลัยราชภัฏหมู่บ้านจอมบึง',
  '451.31', '440.58', '3,121.48', '3,098', '445.93', '2.72', '5,801.68',
  '443 ตันคาร์บอนไดออกไซด์เทียบเท่าต่อปี',
];
const PROJECTS = [
  {
    name: 'Solar Rooftop มรภ.หมู่บ้านจอมบึง (ตัวอย่าง)',
    text: SHARED_TEXT,
    absentText: ['ภาพประกอบการติดตั้ง'], // no evidence images on this one
    figures: 0,
  },
  {
    name: 'Solar Rooftop มรภ.หมู่บ้านจอมบึง (ฉบับเต็ม)',
    text: [
      ...SHARED_TEXT,
      'เลขที่ 12/2568',                       // construction permit line
      '46 หมู่ 3 ตำบลจอมบึง',                  // full address
      'Trinasolar', 'รุ่น SUN2000-50KTL-M3',   // equipment specs list
      'ภาพประกอบการติดตั้ง',
    ],
    absentText: [],
    figures: 3, // uploaded site photos rendered as loaded <figure><img>
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
  p.pddId = row ? (await api(`/projects/${row.id}/pdd`, token).catch(() => null))?.pdd?.id : undefined;
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
    for (const probe of p.absentText) check(`hides "${probe}"`, !body.includes(probe));

    const logos = await page.locator('img[src="/tgo-logo-notext.svg"]')
      .evaluateAll((els) => els.map((e) => e.complete && e.naturalWidth > 0));
    check('TGO logo on every page header', logos.length >= 5 && logos.every(Boolean), `${logos.length} headers`);

    const figs = await page.locator('figure img')
      .evaluateAll((els) => els.map((e) => e.complete && e.naturalWidth > 0));
    check(`evidence figures loaded (${p.figures})`, figs.length === p.figures && figs.every(Boolean), `found ${figs.length}`);

    const rows = await page.locator('[data-testid="yearly-table"] tbody tr').count();
    check('yearly table = 7 years + total + avg', rows === 9, `${rows} rows`);
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nE2E PASS' : `\nE2E FAIL — ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
