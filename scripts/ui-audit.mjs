/**
 * Every screen, read the way a person reads it: at desktop width, at phone width and in the
 * dark theme, signed in as an Admin. Reports what breaks reading — errors on the page, a page
 * wider than the phone, text under 12 px, text under WCAG AA contrast (4.5:1, 3:1 for large),
 * and buttons or links with no name. Exits non-zero when anything is found.
 *
 *   WEB_URL=http://127.0.0.1:5173 API_URL=http://127.0.0.1:5000/api \
 *   AUDIT_EMAIL=admin@example.com AUDIT_PASSWORD=… npm run audit:ui
 *
 * Needs Playwright with a Chromium (PLAYWRIGHT_CHROMIUM=/path/to/chrome to point at one).
 */
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const WEB = process.env.WEB_URL || 'http://127.0.0.1:5173';
const API = process.env.API_URL || 'http://127.0.0.1:5000/api';
const EMAIL = process.env.AUDIT_EMAIL;
const PASSWORD = process.env.AUDIT_PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error('Set AUDIT_EMAIL and AUDIT_PASSWORD (an Admin account)');
const out = process.argv[2] || 'ui-audit';
mkdirSync(out, { recursive: true });
const tok = (await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json()).data.token;
const first = async (p) => { const j = await (await fetch(`${API}${p}`, { headers: { Authorization: `Bearer ${tok}` } })).json(); return (j.data || [])[0]?._id; };
const ids = { enquiry: await first('/enquiries?limit=1'), customer: await first('/customers?limit=1'), quotation: await first('/quotations?limit=1'), order: await first('/orders?limit=1'), sample: await first('/samples?limit=1'), mould: await first('/moulds?limit=1') };
const routes = ['/today', '/dashboard', '/departments', '/departments/marketing', '/departments/despatch', '/departments/production', '/tasks', '/enquiries', '/enquiries/drafts', '/activities', '/quotations', '/samples', '/samples/dashboard', '/customers', '/orders', '/production', '/dispatches', '/dispatch/plan', '/dispatch/trips', '/dispatch/report', '/dispatch/register', '/qc-records', '/qc-records/report', '/machines', '/mould-runs', '/queries', '/quality', '/payments', '/moulds', '/materials', '/trading', '/users', '/integrations', '/profile',
  ids.enquiry && `/enquiries/${ids.enquiry}`, ids.customer && `/customers/${ids.customer}`, ids.quotation && `/quotations/${ids.quotation}`, ids.order && `/orders/${ids.order}`, ids.sample && `/samples/${ids.sample}`, ids.mould && `/moulds/${ids.mould}`].filter(Boolean);
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const results = [];
for (const [vw, vh, label, theme] of [[1366, 900, 'desktop', 'light'], [390, 844, 'phone', 'light'], [1366, 900, 'dark', 'dark']]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem('npt.theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login`);
  await page.fill('input[type=email]', EMAIL); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  for (const route of routes) {
    const errors = [];
    const onErr = (e) => errors.push(String(e.message || e).slice(0, 160));
    const onCon = (m) => { if (m.type() === 'error' && !/favicon|ERR_CERT_AUTHORITY_INVALID|Failed to load resource: the server responded with a status of 4/.test(m.text())) errors.push(m.text().slice(0, 160)); };
    page.on('pageerror', onErr); page.on('console', onCon);
    await page.goto(`${WEB}${route}`); await page.waitForTimeout(1800);
    const audit = await page.evaluate(() => {
      const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); if (a === 0) return null; return [[r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }), a]; };
      const L = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; const v = lum(c); if (v && v[1] > 0.5) return v[0]; } return lum('rgb(255,255,255)')[0]; };
      const small = [], low = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      while (walker.nextNode()) {
        const t = walker.currentNode; const el = t.parentElement; if (!el || seen.has(el) || !t.textContent.trim()) continue; seen.add(el);
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.3) continue;
        if (el.closest('[aria-hidden="true"], svg, .skip-link')) continue;
        const size = parseFloat(cs.fontSize); const text = t.textContent.trim().slice(0, 40);
        if (size < 12) small.push(`${size}px "${text}"`);
        const fg = lum(cs.color); if (!fg) continue; const bg = bgOf(el);
        const l1 = L(fg[0]), l2 = L(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5) && !el.closest('button[disabled], [disabled], input, select, textarea')) low.push(`${ratio.toFixed(2)} "${text}" (${cs.color})`);
      }
      const unnamed = [...document.querySelectorAll('button, a[href], [role=button]')].filter((b) => { const r = b.getBoundingClientRect(); return r.width && r.height && !(b.innerText || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('title') && !b.querySelector('img[alt]:not([alt=""])'); }).map((b) => b.outerHTML.slice(0, 90));
      return { overflow: document.documentElement.scrollWidth - window.innerWidth, small, low, unnamed, h1: !!document.querySelector('h1') };
    });
    page.off('pageerror', onErr); page.off('console', onCon);
    results.push({ label, route, errors, ...audit });
    if (audit.overflow > 1 || errors.length) await page.screenshot({ path: `${out}/${label}${route.replace(/\//g, '_')}.png` }).catch(() => {});
  }
  await ctx.close();
}
await browser.close();
const fs = await import('node:fs');
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
for (const r of results) {
  const issues = [r.errors.length && `errors ${r.errors.length}`, r.overflow > 1 && `overflow ${r.overflow}px`, r.small.length && `small ${r.small.length}`, r.low.length && `lowcontrast ${r.low.length}`, r.unnamed.length && `unnamed ${r.unnamed.length}`].filter(Boolean);
  if (issues.length) console.log(r.label.padEnd(8), r.route.padEnd(40), issues.join(' · '));
}
console.log('screens checked:', results.length);
const failing = results.filter((r) => r.errors.length || r.overflow > 1 || r.small.length || r.low.length || r.unnamed.length);
console.log(failing.length ? `${failing.length} screen(s) with findings — see ${out}/results.json` : 'no findings');
process.exit(failing.length ? 1 : 0);
