import { test, expect, Page } from '@playwright/test';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { createClass, goToGroups, generateGroups, addTopics, openSaveSession, addRecipeRule, closeRecipe } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Nøglerne i lageret hed "groupeng_classes", "GroupEng_Groups_<fil>" osv.
// indtil november 2026 og hedder nu "grupdk_…" (src/js/modules/
// migrateStorage.js). En lærers klasser findes KUN i browseren, så her
// prøves flytningen med rigtige data: en realistisk klasse med grupper,
// emner og en gemt session — lavet af appen selv, så formatet er det ægte,
// og derefter lagt under de gamle navne, som en lærers browser har dem.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DATA = resolve(import.meta.dirname, '..', 'testdata');
const CLASS_DATA = JSON.parse(readFileSync(resolve(DATA, 'realistisk_klasse.json'), 'utf8'));
const CLASS_NAME = '2.c Samfundsfag';

/** De nye navne → de gamle, som de står i en lærers browser fra før. */
const AS_BEFORE: [string, string][] = [
    ['grupdk_classes', 'groupeng_classes'],
    ['grupdk_last_class_index', 'GroupEng_Last_Class_Index'],
    ['grupdk_last_class', 'GroupEng_Last_Class'],
    ['grupdk_news_filter', 'GroupEng_News_Filter'],
    ['grupdk_groups_', 'GroupEng_Groups_'],
    ['grupdk_topics_', 'GroupEng_Topics_'],
    ['grupdk_history_', 'GroupEng_History_'],
    ['grupdk_session_', 'GroupEng_Session_'],
];
function oldName(key: string): string | null {
    for (const [now, then] of AS_BEFORE) {
        if (now.endsWith('_') ? key.startsWith(now) : key === now) return then + key.slice(now.length);
    }
    return null;
}

function asExcelPaste(rows: Record<string, string>[]): string {
    const cols: string[] = CLASS_DATA.columns;
    const cell = (v: string) => /["\n\r\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    return [cols.join('\t'), ...rows.map(r => cols.map(c => cell(r[c] ?? '')).join('\t'))].join('\n');
}

/** Grupper's nøgler i lageret lige nu (de nye navne). */
const grupdkKeys = (page: Page) => page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith('grupdk_')) out[k] = localStorage.getItem(k)!;
    }
    return out;
});

/** Nøgler med de gamle navne, der stadig står. */
const legacyKeys = (page: Page) => page.evaluate(() =>
    Object.keys(localStorage).filter(k => k === 'groupeng_classes' || k.startsWith('GroupEng_')));

/**
 * En realistisk klasse med det hele: grupper, emner og én gemt session.
 * Svarer med lageret, som appen har skrevet det.
 */
async function classWithEverything(page: Page) {
    await createClass(page, CLASS_NAME, asExcelPaste(CLASS_DATA.rows));
    await goToGroups(page);
    await addTopics(page, ['Klima', 'Migration', 'Velfærd']);
    // En regel, så "reglerne forsvandt" kan ses (fundet i gennemgangen 3/11).
    await addRecipeRule(page, { type: 'Fordel', column: 'Køn' });
    await closeRecipe(page);
    await generateGroups(page);
    await openSaveSession(page);
    await page.locator('#vue-modals').getByRole('button', { name: 'Gem session', exact: true }).click();
    await expect(page.locator('.toast.success').filter({ hasText: 'gemt i historikken' })).toBeVisible();
    await page.evaluate(() => localStorage.setItem('grupdk_news_filter', 'features'));
    // Regelen gemmes med en lille forsinkelse (autoSave): vent, til den står i lageret.
    await expect.poll(() => page.evaluate(() =>
        JSON.parse(localStorage.getItem('grupdk_classes') || '[]')[0]?.content?.rules?.length ?? 0)).toBe(1);
    const saved = await grupdkKeys(page);
    // Alt det, der skal med, er der — ellers prøver testen ingenting.
    const kinds = Object.keys(saved).map(k => k.replace(/^(grupdk_[a-z]+(_class)?(_index)?).*$/, '$1'));
    for (const kind of ['grupdk_classes', 'grupdk_groups', 'grupdk_topics', 'grupdk_history', 'grupdk_session', 'grupdk_last_class']) {
        expect(kinds, kind).toContain(kind);
    }
    return saved;
}

/**
 * Forlad appen, så intet, den gemmer, kan lande bagefter. Gem-ventetiderne
 * (op til et halvt sekund) løber ud først, og så skiftes side. Firefox kan
 * lade en skrivning fra siden, der lukker, lande lidt efter den nye side er
 * åben — derfor ventes der også, til lageret står stille.
 */
async function leaveApp(page: Page) {
    await page.waitForTimeout(1000);
    await page.goto('/privatliv.html');
    const snapshot = () => page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
    let last = await snapshot();
    await expect.poll(async () => { const now = await snapshot(); const same = now === last; last = now; return same; },
        { intervals: [300, 300, 300] }).toBe(true);
}

/**
 * Læg lageret under de gamle navne, som en lærers browser fra før har det.
 * Appen forlades først: når siden lukkes, gemmer den det, der venter
 * (flushPendingWrites), og det ville ellers lægge klassen tilbage under de
 * nye navne lige efter, at testen har ryddet dem.
 */
async function putBackAsBefore(page: Page, saved: Record<string, string>) {
    const old: Record<string, string> = {};
    for (const [k, v] of Object.entries(saved)) old[oldName(k)!] = v;
    await leaveApp(page);
    await page.evaluate((old) => {
        for (const k of Object.keys(localStorage)) if (k.startsWith('grupdk_')) localStorage.removeItem(k);
        for (const [k, v] of Object.entries(old)) localStorage.setItem(k, v);
    }, old);
    return old;
}

/** Klassen står på skærmen med sine grupper, emner og sin gemte session. */
async function expectClassIsBack(page: Page, saved: Record<string, string>) {
    const file = JSON.parse(saved.grupdk_classes)[0].filename;
    const groups = JSON.parse(saved[`grupdk_groups_${file}`]).standard;
    await expect(page.locator('.class-switcher, .topbar').getByText(CLASS_NAME).first()).toBeVisible({ timeout: 15000 });
    await goToGroups(page);
    await expect(page.locator('.group-card')).toHaveCount(groups.length);
    await expect(page.locator('.group-card').filter({ hasText: 'Klima' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Historik', exact: true }).click();
    await expect(page.getByText(CLASS_NAME + ' - ', { exact: false }).first()).toBeVisible();
}

test('en lærers gamle lager flyttes til de nye navne — intet ændret, intet tilbage', async ({ page }) => {
    test.setTimeout(120000);
    const saved = await classWithEverything(page);
    await putBackAsBefore(page, saved);
    await page.goto('/');

    // Præcis de samme bytes under de nye navne, og intet under de gamle.
    await expect.poll(() => legacyKeys(page)).toEqual([]);
    const after = await grupdkKeys(page);
    for (const [k, v] of Object.entries(saved)) expect(after[k], k).toBe(v);
    await expect(page.locator('.toast.error')).toHaveCount(0);
    await expectClassIsBack(page, saved);
});

test('næsten fuldt lager: den store klasseliste kommer alligevel over', async ({ page }) => {
    test.setTimeout(120000);
    const saved = await classWithEverything(page);
    await putBackAsBefore(page, saved);
    // Fyld lageret, til der ikke er plads til en kopi af klasselisten ved
    // siden af den gamle — men til den, når den gamle er væk.
    const filled = await page.evaluate((classesLength) => {
        // Store bidder først (hurtigt), så bidder på en fjerdedel klasseliste,
        // så småbidder til sidst: lageret er helt fuldt.
        const sizes = [200000, Math.floor(classesLength / 4), 50];
        const big: string[] = [];
        let n = 0;
        for (const size of sizes) {
            const chunk = 'x'.repeat(size);
            try { for (;;) { localStorage.setItem(`fyld_${n}`, chunk); if (size === sizes[1]) big.push(`fyld_${n}`); n++; } } catch { /* fuldt */ }
        }
        // Giv en halv klasseliste tilbage: for lidt til en kopi ved siden af
        // den gamle, nok når den gamle er væk.
        localStorage.removeItem(big.pop()!);
        localStorage.removeItem(big.pop()!);
        let roomForCopy = true;
        try { localStorage.setItem('prøve', 'y'.repeat(classesLength)); } catch { roomForCopy = false; }
        localStorage.removeItem('prøve');
        const kept: Record<string, number> = {};
        for (const k of Object.keys(localStorage)) if (k.startsWith('fyld_')) kept[k] = localStorage.getItem(k)!.length;
        return { kept, roomForCopy };
    }, saved.grupdk_classes.length);
    expect(filled.roomForCopy).toBe(false);

    await page.goto('/');
    await expect.poll(() => legacyKeys(page)).toEqual([]);
    const after = await grupdkKeys(page);
    for (const [k, v] of Object.entries(saved)) expect(after[k], k).toBe(v);
    // Andres data i lageret er urørt.
    expect(await page.evaluate(() => {
        const now: Record<string, number> = {};
        for (const k of Object.keys(localStorage)) if (k.startsWith('fyld_')) now[k] = localStorage.getItem(k)!.length;
        return now;
    })).toEqual(filled.kept);
    // Appens egen advarsel om et næsten fuldt lager er på sin plads — men
    // ingen besked om, at noget ikke kunne flyttes.
    await expect(page.locator('.toast.error').filter({ hasText: 'lagerplads er' })).toHaveCount(1);
    await expect(page.locator('.toast.error').filter({ hasText: /gammelt navn|gemmes igen/ })).toHaveCount(0);
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('fyld_')) localStorage.removeItem(k); });
});

test('en gammel backup-fil (groupeng_backup_…json) kan stadig gendannes', async ({ page }) => {
    test.setTimeout(120000);
    const saved = await classWithEverything(page);
    // Backuppen er en liste af klasser — samme form før og efter navneskiftet;
    // kun filnavnet hed noget andet. Ingen nøglenavne indeni.
    const file = JSON.parse(saved.grupdk_classes)[0];
    const body = JSON.stringify([{ ...file.content, filename: file.filename, name: file.name }]);
    await leaveApp(page);
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');

    await page.getByRole('button', { name: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Importér', exact: true }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.setInputFiles('input[type=file]', {
        name: 'groupeng_backup_2026-10-01.json', mimeType: 'application/json', buffer: Buffer.from(body, 'utf-8'),
    });
    await page.getByRole('button', { name: /Importér Filer/i }).click();
    await expect.poll(() => page.evaluate(() =>
        JSON.parse(localStorage.getItem('grupdk_classes') || '[]').map((c: any) => c.name))).toContain(CLASS_NAME);
    expect(await legacyKeys(page)).toEqual([]);
});

test('klasser fra www.dida.dk (med de gamle navne) hentes ind under de nye', async ({ page }) => {
    test.setTimeout(120000);
    const saved = await classWithEverything(page);
    const old = await putBackAsBefore(page, saved);
    // Pakken, som mellemsiden på www lægger her — og ingen klasser i forvejen.
    await page.evaluate((entries) => {
        for (const k of Object.keys(localStorage)) {
            if (k.startsWith('grupdk_') || k.startsWith('GroupEng_') || k === 'groupeng_classes') localStorage.removeItem(k);
        }
        localStorage.setItem('dida_grupper_from_www', JSON.stringify({ at: new Date().toISOString(), entries }));
    }, old);
    // Beskeden står i 5 sek. og kommer ~0,1 sek. efter indlæsningen. Firefox
    // kan melde siden indlæst senere end det, så der kigges fra første øjeblik.
    await page.goto('/', { waitUntil: 'commit' });

    await expect(page.locator('.toast.success').filter({ hasText: 'hentet fra www.dida.dk' })).toBeVisible({ timeout: 15000 });
    expect(await legacyKeys(page)).toEqual([]);
    const after = await grupdkKeys(page);
    const file = JSON.parse(after.grupdk_classes)[0].filename;
    expect(JSON.parse(after[`grupdk_groups_${file}`]).standard).toEqual(
        JSON.parse(saved[`grupdk_groups_${JSON.parse(saved.grupdk_classes)[0].filename}`]).standard);
    expect(JSON.parse(after[`grupdk_history_${file}`])).toHaveLength(1);
});

test('en rå skrivning under det gamle navn til den RIGTIGE klasses grupper overskriver intet', async ({ page, context }) => {
    test.setTimeout(120000);
    const saved = await classWithEverything(page);
    const file = JSON.parse(saved.grupdk_classes)[0].filename;
    const other = await context.newPage();
    await other.goto('/privatliv.html');
    await other.evaluate((key) => localStorage.setItem(key, '{"standard":[]}'), `GroupEng_Groups_${file}`);
    // Den nye fane har hørt det — og lader begge udgaver stå (uafgjort).
    await page.waitForTimeout(500);
    expect(await page.evaluate((f) => localStorage.getItem(`grupdk_groups_${f}`), file)).toBe(saved[`grupdk_groups_${file}`]);
    expect(await legacyKeys(page)).toEqual([`GroupEng_Groups_${file}`]);
    await expect(page.locator('.toast').filter({ hasText: 'ændret i en anden fane' })).toHaveCount(0);
    await other.close();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// En RIGTIG gammel fane: den byggede Grupper fra 1dfb70c1 — den sidste med de
// gamle nøglenavne, altså den kode lærerne har åben, når navneskiftet deployes —
// hentet med git archive og serveret på /gammel/ på samme adresse. Fast commit,
// ikke "main": efter merge ville main være den NYE kode. Intet lægges i repoet.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const OLD_BUILD = (() => {
    const dir = mkdtempSync(join(tmpdir(), 'grupper-main-'));
    execSync(`git -C ${JSON.stringify(resolve(import.meta.dirname, '..', '..'))} archive 1dfb70c1 public/grupper | tar -x -C ${JSON.stringify(dir)}`);
    return join(dir, 'public', 'grupper');
})();

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
async function serveOldBuild(context) {
    await context.route(/\/gammel\//, (route) => {
        const path = new URL(route.request().url()).pathname.replace(/^\/gammel\/?/, '') || 'index.html';
        const file = join(OLD_BUILD, path);
        if (!existsSync(file)) return route.fulfill({ status: 404, body: 'ukendt' });
        route.fulfill({ status: 200, body: readFileSync(file), headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } });
    });
}

test('en rigtig gammel fane lægger klassen ind igen efter flytningen — den rigtige mister intet', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'kun chromium: den gamle udgave serveres fil for fil');
    test.setTimeout(240000);
    await serveOldBuild(context);
    const saved = await classWithEverything(page);
    const realFile = JSON.parse(saved.grupdk_classes)[0].filename;
    await putBackAsBefore(page, saved);

    // 1. Den gamle fane er åben FØR opdateringen, med klassen fremme.
    const oldTab = await context.newPage();
    await oldTab.addInitScript(() => { try { localStorage.setItem('grupper-opskrift-guide-set', '1'); localStorage.setItem('grupper-elevliste-guide-set', '1'); } catch { /* */ } });
    await oldTab.goto('/gammel/');
    await oldTab.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true, null, { timeout: 30000 });
    await expect(oldTab.getByRole('button', { name: `Klasse ${CLASS_NAME}` })).toBeVisible({ timeout: 15000 });

    // 2. Den nye udgave åbnes i en anden fane og flytter lageret.
    await page.goto('/');
    await expect.poll(() => legacyKeys(page)).toEqual([]);
    await expect(oldTab.locator('.toast').filter({ hasText: 'slettet' }).first()).toBeVisible({ timeout: 15000 });

    // 3. Læreren gendanner klassen fra en backup i den GAMLE fane.
    const file = JSON.parse(saved.grupdk_classes)[0];
    const backup = JSON.stringify([{
        ...file.content, filename: file.filename, name: file.name, rules: [],
        groups: JSON.parse(saved[`grupdk_groups_${realFile}`]),
        groupTopics: {}, history: [], sessions: {},
    }]);
    await oldTab.getByRole('button', { name: 'Import & backup' }).click();
    await oldTab.getByRole('button', { name: 'Importér', exact: true }).click();
    await oldTab.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await oldTab.setInputFiles('input[type=file]', { name: 'gammel_backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await oldTab.getByRole('button', { name: /Importér Filer/i }).click();
    await expect.poll(() => page.evaluate(() =>
        JSON.parse(localStorage.getItem('grupdk_classes') || '[]').map((c: any) => c.name)), { timeout: 15000 })
        .toEqual([CLASS_NAME, `${CLASS_NAME} (kopi)`]);

    // 4. Den nye fane genindlæses (oprydningen ved opstart kører).
    await page.reload();
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true);
    const after = await grupdkKeys(page);
    const list = JSON.parse(after.grupdk_classes);
    const real = list.find((c: any) => c.filename === realFile);
    const copy = list.find((c: any) => c.legacyFilename === realFile);
    // Den rigtige klasse: præcis som før — regler, grupper, emner, historik og sessionerne.
    // (last_modified må gerne være ny: appen gemmer klassen, når den åbnes.)
    expect(real.content).toEqual(JSON.parse(saved.grupdk_classes)[0].content);
    expect(real.content.rules.length).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(saved)) {
        if (k === 'grupdk_classes' || k === 'grupdk_last_class' || k === 'grupdk_last_class_index') continue;
        expect(after[k], k).toBe(v);
    }
    // Kopien har sine egne nøgler.
    expect(copy.name).toBe(`${CLASS_NAME} (kopi)`);
    expect(after[`grupdk_groups_${copy.filename}`]).toBeTruthy();
    expect(await legacyKeys(page)).toEqual([]);
    await oldTab.close();
});
