import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClass, goToGroups, generateGroups, openRecipe, goToMatrix } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Grupper i browseren med de data, lærere faktisk har — ikke den pæne
// standardklasse på 12 (DEFAULT_CSV), som de fleste andre specs bruger.
// Testdataene deles med Python-testene og vitest; se testdata/README.md.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DATA = resolve(import.meta.dirname, '..', 'testdata');
const CLASS_DATA = JSON.parse(readFileSync(resolve(DATA, 'realistisk_klasse.json'), 'utf8'));
const LECTIO = readFileSync(resolve(DATA, 'lectio_elevliste.txt'), 'utf8');

/** Rækkerne som Excel kopierer dem: tabulator, og anførselstegn kun om en
 *  celle med linjeskift, tabulator eller anførselstegn. */
function asExcelPaste(rows: Record<string, string>[]): string {
    const cols: string[] = CLASS_DATA.columns;
    const cell = (v: string) => /["\n\r\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    return [cols.join('\t'), ...rows.map(r => cols.map(c => cell(r[c] ?? '')).join('\t'))].join('\n');
}

/** Klassen i appen lige nu, som ren data. */
const classData = (page) => page.evaluate(() =>
    JSON.parse(JSON.stringify((window as any).appDebug.state.currentClass.data)));

/**
 * Hverdagstilstanden fra scenariet — fravær, Skal sammen og undgåelser —
 * lagt direkte på klassen. Eleverne findes på RÆKKENUMMER, fordi to hedder
 * "Emil Hansen"; _rowId'et er appens eget og kendes først nu.
 */
async function applyScenario(page, scenario, offsets = [0], withTogether = true) {
    await page.evaluate(({ scenario, offsets, withTogether }) => {
        const cls = (window as any).appDebug.state.currentClass;
        const id = (i: number) => cls.data[i]._rowId;
        const ids = (grp: number[], off: number) => grp.map(i => id(i + off));
        for (const off of offsets) {
            scenario.absent.forEach((i: number) => { cls.data[i + off]._excluded = true; });
        }
        // En "Skal sammen" flytter kørslen til motor A (logic.py) — derfor kan
        // den slås fra, når det er motor B, der skal måles.
        cls.togetherGroups = !withTogether ? [] : offsets.flatMap(off =>
            scenario.together.map((g: number[]) => ({ ids: ids(g, off), timestamp: 1 })));
        cls.separations = offsets.flatMap(off =>
            scenario.avoid.map((g: number[]) => ({ ids: ids(g, off), timestamp: 1 })));
    }, { scenario, offsets, withTogether });
}

async function setRules(page, rules) {
    await page.evaluate((rules) => {
        (window as any).appDebug.state.currentClass.rules = rules;
    }, rules);
}

/** Alle til stede står i præcis én gruppe; ingen fraværende er placeret. */
async function checkPlacement(page) {
    const { groups, data } = await page.evaluate(() => {
        const s = (window as any).appDebug.state;
        return JSON.parse(JSON.stringify({ groups: s.storedStandardGroups, data: s.currentClass.data }));
    });
    const placed = groups.flatMap((g: any) => g.members.map((m: any) => typeof m === 'object' ? m.id : m));
    const present = data.filter((r: any) => !r._excluded).map((r: any) => r._rowId);
    expect([...placed].sort()).toEqual([...present].sort());
    const where = new Map<string, number>();
    groups.forEach((g: any, gi: number) => g.members.forEach((m: any) =>
        where.set(typeof m === 'object' ? m.id : m, gi)));
    return where;
}

test('en liste kopieret fra Lectio giver en klasse med navnene alene', async ({ page }) => {
    await createClass(page, 'Lectio 2Tz', LECTIO);

    const names = (await classData(page)).map((r: any) => r.Navn);
    const lines = LECTIO.trim().split('\n');
    expect(names).toHaveLength(lines.length);
    expect(names[0]).toBe('Ali Hassan Yousef');
    expect(names).toContain('Silje Anne-Marie Holt');
    expect(names.some((n: string) => /2Tz|\(/.test(n))).toBe(false);
});

test('den realistiske klasse: import, fravær, aftaler og en skæv Fordel', async ({ page }) => {
    await createClass(page, 'Realistisk klasse', asExcelPaste(CLASS_DATA.rows));

    // Importen: alle med, lærerens egne tegn står som skrevet.
    const data = await classData(page);
    expect(data).toHaveLength(CLASS_DATA.rows.length);
    expect(data.filter((r: any) => r.Navn === 'Emil Hansen')).toHaveLength(2);
    expect(data.find((r: any) => r.Navn === 'Sara El-Amin').Bemærkning).toBe('Ekstra tid\nved prøver');

    await applyScenario(page, CLASS_DATA.scenario);
    await setRules(page, [
        { type: 'distribute', column: 'Køn', value: '' },
        { type: 'distribute', column: 'Niveau', value: '' },
    ]);
    await goToGroups(page);
    await generateGroups(page);

    const where = await checkPlacement(page);
    const cls = await classData(page);
    for (const grp of CLASS_DATA.scenario.avoid) {
        const gs = grp.map((i: number) => where.get(cls[i]._rowId));
        expect(new Set(gs).size, `undgåelse brudt: ${grp}`).toBe(grp.length);
    }
    for (const grp of CLASS_DATA.scenario.together) {
        expect(new Set(grp.map((i: number) => where.get(cls[i]._rowId))).size).toBe(1);
    }
    // 14 piger til stede og plads til 12 — det skal læreren have at vide. Det
    // står i opskriften (bjælken tæller advarslen).
    // Før kørslen motorens advarsel, efter kørslen dens resultat under
    // "Sidste dannelse" — det ene eller det andet står der.
    await openRecipe(page);
    await expect(page.locator('dialog.recipe-dialog[open]').locator('.gh-hint, .recipe__lastlist li')
        .filter({ hasText: 'Fordel på "Køn"' }).first()).toBeVisible();
});

test('opskriften siger en skæv Fordel én gang, ikke også under "Sidste dannelse"', async ({ page }) => {
    test.setTimeout(120000);
    await createClass(page, 'Realistisk klasse', asExcelPaste(CLASS_DATA.rows));
    await setRules(page, [{ type: 'distribute', column: 'Køn', value: '' }]);
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await page.getByRole('button', { name: /Dan grupper/ }).last().click();
    await expect(page.locator('.group-card').first()).toBeVisible({ timeout: 30000 });

    await page.locator('.recipe-bar__open').click();
    const recipe = page.locator('dialog.recipe-dialog[open]');
    // Samme sag én gang: advarslen før kørslen er afløst af resultatet.
    await expect(recipe.locator('.gh-hint, .recipe__lastlist li').filter({ hasText: 'Fordel på "Køn"' })).toHaveCount(1);
    await expect(page.locator('.recipe-bar__warn')).toHaveText('1 advarsel');
    if (process.env.DUBLET_SHOT) await page.screenshot({ path: process.env.DUBLET_SHOT });
});

// ── En sammenlagt klasse ─────────────────────────────────────────────────────
// En tidsregression på store hold ses kun i browseren (motorens tråde). 120
// elever = den realistiske klasse fem gange (med nummer bag navnet), inkl.
// fravær og aftaler i hver kopi. Grænsen er gavmild: budgettet er 30 sekunder
// over 100 elever (nextEngine.appBudget), og parallelle tests lægger oveni.
// Tiden skrives i rapporten, så en langsom glidning kan ses, før grænsen rammes.
const COPIES = 5;
const BIG = Array.from({ length: COPIES }, (_, k) =>
    CLASS_DATA.rows.map((r: any) => ({ ...r, Navn: `${r.Navn} ${k + 1}` }))).flat().slice(0, 120);
const OFFSETS = [0, 27, 54, 81];   // kopi 5 er kun delvis med — ingen aftaler dér

for (const [label, rules, withTogether] of [
    ['Fordel ×2 og undgåelser', [
        { type: 'distribute', column: 'Køn', value: '' },
        { type: 'distribute', column: 'Niveau', value: '' },
    ], false],
    ['Balancér, Fordel og Skal sammen', [
        { type: 'balance', column: 'Karakter', value: '' },
        { type: 'distribute', column: 'Køn', value: '' },
    ], true],
] as const) {
    test(`120 elever i browseren: ${label}`, async ({ page }, testInfo) => {
        test.setTimeout(180_000);
        await createClass(page, `Stor klasse ${label.slice(0, 6)}`, asExcelPaste(BIG));
        await applyScenario(page, CLASS_DATA.scenario, OFFSETS, withTogether);
        await setRules(page, rules);
        await goToGroups(page);

        const started = Date.now();
        await generateGroups(page);
        await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating),
            { timeout: 120_000 }).toBe(false);
        const seconds = (Date.now() - started) / 1000;
        testInfo.annotations.push({ type: 'tid', description: `${seconds.toFixed(1)} s` });
        console.log(`[stor klasse] ${label}: ${seconds.toFixed(1)} s`);

        await checkPlacement(page);
        expect(await page.evaluate(() => (window as any).appDebug.nextStats.status)).toBe('ok');
        expect(seconds, 'gruppedannelsen tog for lang tid').toBeLessThan(60);
    });
}

// ── Udgangene med den realistiske klasse ────────────────────────────────────
// Del-menuen (udskrift og Excel) og Kopiér → Gendan grupper, med emner, matrix
// og fravær på én gang — og med navne, der har komma, bindestreg og æøå, og to
// elever, der hedder det samme. output_surfaces.spec.ts prøver de samme udgange
// af med den pæne standardklasse.
test('udgangene: udskrift, Excel og Kopiér → Gendan med emner, matrix og fravær', async ({ page }) => {
    test.setTimeout(120_000);
    await createClass(page, 'Udgange realistisk', asExcelPaste(CLASS_DATA.rows));
    await page.evaluate(() => {
        const cls = (window as any).appDebug.state.currentClass;
        cls.topics = ['Klima', 'Energi', 'Migration'];
        cls.rules = [{ type: 'distribute', column: 'Køn', value: '' }];
    });
    await goToGroups(page);
    await generateGroups(page);
    await goToMatrix(page);
    await generateGroups(page);
    await expect.poll(() => page.evaluate(() =>
        ((window as any).appDebug.state.storedMatrixGroups || []).length), { timeout: 90_000 }).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating)).toBe(false);

    // Fravær EFTER grupperne er dannet: eleverne står i grupperne, men er væk i dag.
    await applyScenario(page, { ...CLASS_DATA.scenario, together: [], avoid: [] });
    const data = await classData(page);
    const absentNames = CLASS_DATA.scenario.absent.map((i: number) => data[i].Navn);
    const presentNames = data.filter((r: any) => !r._excluded).map((r: any) => r.Navn);

    // ── Udskriften ──
    const html: string = await page.evaluate(async () => {
        const mod = await import('/src/js/modules/overview.js');
        let out = '';
        const original = window.open;
        (window as any).open = () => ({ document: { write: (h: string) => { out += h; }, close() {} } });
        try { mod.openOverview(); } finally { window.open = original; }
        return out;
    });
    const doc = await page.evaluate((h) => {
        const d = new DOMParser().parseFromString(h, 'text/html');
        const names = (sel: string) => [...d.querySelectorAll(`${sel} li .name`)].map(e => e.textContent!.trim());
        return { std: names('section.std'), mtx: names('section.mtx'), meta: d.querySelector('.meta')!.textContent,
                 absentStd: [...d.querySelectorAll('section.std .absent')].map(e => e.textContent!.trim()),
                 topics: [...d.querySelectorAll('section.std .topic')].map(e => e.textContent!.trim()) };
    }, html);
    // Hver elev står i begge runder; de fraværende med markering.
    const clean = (n: string) => n.replace(/\s*fraværende$/, '');
    expect(doc.std.map(clean).sort()).toEqual([...data.map((r: any) => r.Navn)].sort());
    expect(doc.mtx.map(clean).sort()).toEqual([...data.map((r: any) => r.Navn)].sort());
    expect(doc.absentStd.sort()).toEqual([...absentNames].sort());
    expect(doc.meta).toContain('27 elever');
    expect(doc.meta).toContain('3 fraværende');
    expect(new Set(doc.topics)).toEqual(new Set(['Klima', 'Energi', 'Migration']));
    expect(html).not.toMatch(/\br-[a-f0-9]{16,32}\b/);

    // ── Excel fra Del-menuen: begge gruppesæt, fravær markeret ──
    // Menuen vælger på forhånd den visning, læreren står i (her Matrix);
    // "Begge" giver ét ark pr. gruppesæt.
    await page.getByRole('button', { name: 'Del', exact: true }).click();
    const menu = page.getByRole('group', { name: 'Del grupperne' });
    await expect(menu).toBeVisible();
    // Klik på teksten, som læreren gør: selve radioknappen er skjult bag det
    // segmenterede felt, og Firefox lader ikke en test "checke" den direkte.
    await menu.locator('.seg-opt').filter({ hasText: 'Begge' }).click();
    await expect(menu.getByRole('radio', { name: 'Begge' })).toBeChecked();
    const pending = page.waitForEvent('download');
    await menu.getByRole('button', { name: /Grupper i kolonner/ }).click();
    const download = await pending;
    const chunks: Buffer[] = [];
    for await (const chunk of (await download.createReadStream())!) chunks.push(Buffer.from(chunk));
    const XLSX = await import('../src/vendor/xlsx.mjs');
    const wb = XLSX.read(Buffer.concat(chunks), { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['Stamgrupper', 'Matrixgrupper']);
    for (const sheet of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' }) as string[][];
        const cells = rows.slice(1).flat().filter(Boolean);
        expect(cells.map(c => c.replace(/ \(fraværende\)$/, '')).sort(), sheet)
            .toEqual([...data.map((r: any) => r.Navn)].sort());
        expect(cells.filter(c => c.endsWith('(fraværende)'))).toHaveLength(3);
    }

    // ── Kopiér → Gendan grupper: teksten læses tilbage til de samme elever ──
    const roundtrip = await page.evaluate(async () => {
        const ga = await import('/src/js/modules/groupActions.js');
        const rg = await import('/src/js/modules/restoreGroups.js');
        const s = (window as any).appDebug.state;
        const text = ga.buildGroupsClipboardText(false, false);
        const parsed = rg.parseGroupsText(text);
        const resolved = rg.resolveTextGroups(parsed.groups, s.currentClass.data, s.displayColumn);
        const items = resolved.groups.flatMap((g: any) => g.items);
        return {
            error: parsed.error,
            groups: parsed.groups.length,
            topics: parsed.groups.map((g: any) => g.topic),
            bound: items.filter((i: any) => i.status === 'bound').length,
            ambiguous: items.filter((i: any) => i.status === 'ambiguous').map((i: any) => i.raw),
            unmatched: items.filter((i: any) => i.status === 'unmatched').map((i: any) => i.raw),
            absent: items.filter((i: any) => i.absent).length,
            stored: s.storedStandardGroups.length,
        };
    });
    expect(roundtrip.error).toBeNull();
    expect(roundtrip.groups).toBe(roundtrip.stored);
    expect(roundtrip.unmatched).toEqual([]);
    // De to "Emil Hansen" kan en tekst ikke skelne — læreren vælger selv.
    expect(roundtrip.ambiguous).toEqual(['Emil Hansen', 'Emil Hansen']);
    expect(roundtrip.bound).toBe(25);
    expect(roundtrip.absent).toBe(3);
    expect(presentNames).toHaveLength(24);
});
