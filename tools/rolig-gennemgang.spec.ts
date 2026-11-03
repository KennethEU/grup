// Gennemgang af Grupper i Rolig-temaet: åbner hver visning, hvert vindue og hver
// menu, tager et skærmbillede og scanner efter rester af glas-designet.
//
// Det er et værktøj til at LÆSE udseendet, ikke en test der kan fejle: et trin der
// ikke kan åbnes bliver skrevet i rapporten ("ikke åbnet"), og kørslen går videre.
//
// Kør (Vite skal køre, fx på port 3010):
//   ROLIG_OUT=/en/mappe E2E_BASE_URL=http://localhost:3010 \
//     npx playwright test -c tools/rolig.config.ts
// Valgfrit: ROLIG_W=1920 ROLIG_H=1080 for en anden skærmstørrelse.
import { test, expect, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gotoAppReady } from '../e2e/helpers';

const OUT = process.env.ROLIG_OUT || join(process.cwd(), 'rolig-gennemgang-ud');
const W = Number(process.env.ROLIG_W || 1280);
const H = Number(process.env.ROLIG_H || 800);
const THEME = process.env.ROLIG_THEME || 'rolig';

type Finding = { step: string; kind: string; what: string };
const findings: Finding[] = [];
const report: { n: number; label: string; file: string | null; note: string }[] = [];
let n = 0;

// Kører inde i siden: finder det, Rolig ikke vil have
function scan() {
    const out: { kind: string; what: string }[] = [];
    const name = (e: Element) => e.tagName.toLowerCase() + '.' +
        (typeof (e as any).className === 'string' ? (e as any).className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const hasBorder = (c: CSSStyleDeclaration) =>
        parseFloat(c.borderTopWidth) >= 1 && c.borderTopStyle !== 'none' &&
        !/(rgba?\(0, 0, 0, 0\)|transparent|\/ 0\))/.test(c.borderTopColor) && !/ 0\)$/.test(c.borderTopColor);
    const seen = new Set<string>();
    const add = (kind: string, what: string) => { const k = kind + what; if (!seen.has(k)) { seen.add(k); out.push({ kind, what }); } };
    for (const e of Array.from(document.querySelectorAll('body *'))) {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const c = getComputedStyle(e);
        if (c.visibility === 'hidden' || c.display === 'none') continue;
        const bs = c.boxShadow;
        if (bs !== 'none') {
            const layers = bs.split(/\),\s*(?=[a-z])/i);
            if (/inset/.test(bs) && !/0px 0px 0px 1px/.test(bs)) add('indvendig skygge', name(e));
            if (layers.length >= 2 && !/ring|focus/.test(name(e))) add('flere skyggelag', name(e) + ' ' + bs.slice(0, 60));
            const blur = parseFloat((bs.match(/\) (-?\d+)px (-?\d+)px (\d+)px/) || [])[3] || '0');
            if (blur >= 20 && !/dialog|modal|popover|menu|drawer/.test(name(e))) add('stor blød skygge', name(e) + ' ' + blur + 'px');
        }
        if (/gradient/.test(c.backgroundImage)) add('gradient', name(e));
        if (c.textShadow !== 'none') add('tekstskygge', name(e));
        if (c.filter !== 'none') add('filter', name(e));
        if ((c as any).backdropFilter && (c as any).backdropFilter !== 'none') add('sløring (backdrop)', name(e));
        if (hasBorder(c) && c.borderTopStyle === 'dashed') add('stiplet ramme', name(e));
        // ramme i ramme: en boks (ikke et felt/knap) med streg inde i en boks med streg
        if (hasBorder(c) && /^(div|section|ul|li|label|details|article)$/i.test(e.tagName)) {
            let p = e.parentElement;
            while (p && p !== document.body) {
                const pc = getComputedStyle(p);
                if (hasBorder(pc)) { if (parseFloat(c.borderTopLeftRadius) > 0 || true) add('ramme i ramme', name(e) + ' < ' + name(p)); break; }
                p = p.parentElement;
            }
        }
    }
    return out;
}

async function closeAll(page: Page) {
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(150);
    }
    const open = await page.evaluate(() => document.body.classList.contains('has-modal') || !!document.querySelector('dialog[open]'));
    if (open) {
        const btn = page.locator('dialog[open] button, .modal-overlay button, .modal-content button')
            .filter({ hasText: /^(Annuller|Luk|Fortryd|Annullér)$/ }).first();
        if (await btn.count()) await btn.click({ timeout: 1500 }).catch(() => {});
        else await page.locator('[aria-label="Luk"]').first().click({ timeout: 1500 }).catch(() => {});
    }
    await page.waitForTimeout(250);
}

async function shot(page: Page, label: string, note = '') {
    n++;
    const file = `${String(n).padStart(2, '0')}-${label.replace(/[^a-z0-9æøå]+/gi, '-').toLowerCase()}.png`;
    await page.waitForTimeout(450); // lad animationer falde til ro
    await page.screenshot({ path: join(OUT, file) });
    const f = await page.evaluate(scan);
    for (const x of f) findings.push({ step: label, ...x });
    report.push({ n, label, file, note: note + (f.length ? ` — ${f.length} fund` : '') });
    writeReport();
}

// Et trin: gør noget, tag billede, ryd op. Fejler det, står det i rapporten.
async function step(page: Page, label: string, run: () => Promise<void>, opts: { keepOpen?: boolean } = {}) {
    try {
        await run();
        await shot(page, label);
    } catch (e: any) {
        n++;
        report.push({ n, label, file: null, note: 'ikke åbnet: ' + String(e.message).split('\n')[0].slice(0, 140) });
        writeReport();
    }
    if (!opts.keepOpen) await closeAll(page);
}

const named = (page: Page, text: string) =>
    page.locator(`button:has-text("${text}"), [title*="${text}"], [aria-label*="${text}"]`).locator('visible=true').first();
const tab = (page: Page, text: string) => page.locator('.nav-tab').filter({ hasText: text }).click();

function writeReport() {
    const bySteps = new Map<string, Finding[]>();
    for (const f of findings) { if (!bySteps.has(f.kind)) bySteps.set(f.kind, []); bySteps.get(f.kind)!.push(f); }
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
    let html = `<!doctype html><meta charset="utf-8"><title>Rolig-gennemgang ${W}x${H}</title>
<style>body{font:14px system-ui;margin:24px;background:#f6f4ef;color:#222}h1,h2{letter-spacing:-.02em}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px}
figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:8px;padding:8px}img{width:100%;border:1px solid #eee}
figcaption{font:500 12px ui-monospace,monospace;padding:6px 2px}.miss{color:#a33}table{border-collapse:collapse;font-size:12px}td,th{border:1px solid #ddd;padding:3px 8px;text-align:left}</style>
<h1>Rolig-gennemgang (${esc(THEME)}, ${W}×${H})</h1><h2>Fund (${findings.length})</h2>`;
    if (!findings.length) html += '<p>Ingen fund.</p>';
    else {
        html += '<table><tr><th>Slags</th><th>Hvad</th><th>Hvor</th></tr>';
        const agg = new Map<string, Set<string>>();
        for (const f of findings) { const k = f.kind + '|' + f.what; if (!agg.has(k)) agg.set(k, new Set()); agg.get(k)!.add(f.step); }
        for (const [k, steps] of agg) { const [kind, what] = k.split('|'); html += `<tr><td>${esc(kind)}</td><td>${esc(what)}</td><td>${esc([...steps].slice(0, 4).join(', '))}${steps.size > 4 ? ` +${steps.size - 4}` : ''}</td></tr>`; }
        html += '</table>';
    }
    html += `<h2>Skærmbilleder (${report.length})</h2><div class="g">`;
    for (const r of report) {
        html += `<figure>${r.file ? `<img src="${r.file}" loading="lazy">` : ''}<figcaption class="${r.file ? '' : 'miss'}">${r.n}. ${esc(r.label)} ${r.note ? '· ' + esc(r.note) : ''}</figcaption></figure>`;
    }
    html += '</div>';
    writeFileSync(join(OUT, 'index.html'), html);
    writeFileSync(join(OUT, 'fund.json'), JSON.stringify({ findings, report }, null, 1));
    console.log(`RAPPORT: ${join(OUT, 'index.html')} — ${report.length} trin, ${report.filter(r => !r.file).length} ikke åbnet, ${findings.length} fund`);
}

test('Rolig-gennemgang', async ({ page }) => {
    test.setTimeout(25 * 60 * 1000);
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: W, height: H });
    await page.addInitScript((t) => { try { localStorage.setItem('groupeng-theme', t); } catch (e) { /* ingen */ } }, THEME);
    await gotoAppReady(page);
    page.setDefaultTimeout(3000); // et trin der ikke kan åbnes må ikke holde kørslen op

    // --- Ingen klasse ---
    await step(page, 'Velkommen (ingen klasse)', async () => {});

    // --- Opret testklasse ---
    await page.getByRole('button', { name: /Prøv med testdata/ }).click();
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 15000 });

    // --- Elevliste ---
    await step(page, 'Elevliste', async () => { await tab(page, 'Elevliste'); }, { keepOpen: true });
    for (const t of ['Kategoriser', 'Ranger', 'Aftaler', 'Elev', 'Kolonne', 'Flyt']) {
        await step(page, `Elevliste · vindue ${t}`, async () => {
            await tab(page, 'Elevliste');
            await page.locator('.students-header-sticky button').filter({ hasText: new RegExp(`^\\s*${t}\\s*$`) }).first().click({ timeout: 2000 });
            await page.waitForTimeout(300);
        });
    }
    await step(page, 'Elevliste · klassevælger åben', async () => { await page.locator('.class-trigger').click(); });
    await step(page, 'Elevliste · to rækker valgt', async () => {
        await page.locator('tbody tr').nth(0).locator('input[type=checkbox]').first().check({ timeout: 1500 });
        await page.locator('tbody tr').nth(1).locator('input[type=checkbox]').first().check({ timeout: 1500 });
    }, { keepOpen: true });

    // --- Grupper ---
    await step(page, 'Grupper · før generering', async () => { await tab(page, 'Grupper'); }, { keepOpen: true });
    await step(page, 'Grupper · Emner åben', async () => { await named(page, 'Emner').click(); });
    await step(page, 'Grupper · Regler åben', async () => { await named(page, 'Regler').click(); });
    await step(page, 'Grupper · Matrix-tilstand', async () => {
        await page.locator('.view-btn').filter({ hasText: 'Matrix' }).click({ force: true });
    }, { keepOpen: true });
    await step(page, 'Grupper · tilbage til Grupper', async () => {
        await page.locator('.view-btn').filter({ hasText: /^\s*Grupper\s*$/ }).click();
    }, { keepOpen: true });
    await step(page, 'Grupper · genereret', async () => {
        await page.locator('.generate-btn').click();
        await expect(page.locator('.group-card').first()).toBeVisible({ timeout: 90000 });
    }, { keepOpen: true });
    await step(page, 'Grupper · beskeder (fejl + succes)', async () => {
        await page.evaluate(() => { (window as any).notifyError('Fordel på \'Køn\' kan ikke gå helt op: 14 elever har værdien \'Pige\'.'); (window as any).notifySuccess?.('Grupper kopieret'); });
    }, { keepOpen: true });
    await page.waitForTimeout(500);
    await step(page, 'Grupper · en gruppe låst', async () => {
        await page.locator('.group-card').first().locator('button[title*="Lås"], button[aria-label*="Lås"]').first().click({ timeout: 1500 });
    }, { keepOpen: true });
    for (const t of ['Del', 'Tags', 'Kopiér', 'Gendan', 'Tilføj efternøler', 'Tilføj gruppe', 'Lås alle', 'Tidligere kørsler', 'Optag og afspil']) {
        await step(page, `Grupper · bjælke ${t}`, async () => {
            await named(page, t).click({ timeout: 2000 });
            await page.waitForTimeout(300);
        });
    }
    await step(page, 'Grupper · Gem kolonne', async () => { await named(page, 'Gem matrix').or(named(page, 'Gem stam')).first().click({ timeout: 2000 }); });
    await step(page, 'Grupper · Gem session', async () => { await named(page, 'Gem session').click({ timeout: 2000 }); });

    // --- Historik ---
    await step(page, 'Historik', async () => { await tab(page, 'Historik'); }, { keepOpen: true });

    // --- Import & backup ---
    await step(page, 'Import & backup · Importér (indsæt tekst)', async () => { await tab(page, 'Import & backup'); }, { keepOpen: true });
    await step(page, 'Import & backup · Importér (upload)', async () => {
        await page.getByRole('button', { name: /Upload fil/ }).click();
    }, { keepOpen: true });
    await step(page, 'Import & backup · Eksportér', async () => {
        await page.getByRole('button', { name: /Eksporter/ }).click();
    }, { keepOpen: true });

    // --- Topbar: sider og vinduer ---
    await step(page, 'Nyheder', async () => { await named(page, 'Nyheder').click(); });
    for (const t of ['Pædagogisk guide', 'GDPR & Data', 'Om programmet']) {
        await step(page, `Side · ${t}`, async () => { await named(page, t).click({ timeout: 2000 }); }, { keepOpen: true });
    }
    await step(page, 'Omdøb klasse (vindue)', async () => {
        await page.locator('.class-trigger').click();
        await page.locator('button[title="Omdøb klasse"]').first().click({ timeout: 1500 });
    });

    writeReport();
});
