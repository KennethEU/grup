import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

test('Ufuldstændig backup downloades med synlig advarsel og læsbare elever', async ({ page }) => {
    await createClass(page, 'Backup Integrity');
    await page.evaluate(() => {
        const filename = (window as any).appDebug.state.currentClass.filename;
        // Ødelæg kun emnekortet efter opstartens oprydning.
        localStorage.setItem(`grupdk_topics_${filename}`, '{');
    });
    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Eksportér', exact: true }).click();
    await page.getByRole('button', { name: /Vælg alle/i }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download backup/i }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream!) chunks.push(chunk);
    const backup = JSON.parse(Buffer.concat(chunks).toString());
    expect(backup[0].data).toHaveLength(12);
    expect(backup[0].groupTopics).toEqual({});
    await expect(page.getByText(/Filen er ufuldstændig:.*emner kunne ikke læses/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Download backup/i })).toBeEnabled();
    await page.locator('.toast.error').screenshot({ animations: 'disabled', path: `/tmp/grupper-backup-warning-${test.info().project.name}.png` });
});

test('Manglende session giver delvis gendannelse i brugerfladen', async ({ page }) => {
    await createClass(page, 'Restore Integrity');
    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    const backup = [{ filename: 'missing_session.csv', data: [{ Navn: 'Anna', _rowId: 'r1' }],
        id_column: 'Navn', history: [{ id: 'missing', name: 'Modul 1' }], sessions: {} }];
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.setInputFiles('input[type=file]', {
        name: 'missing.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
    });
    await page.getByRole('button', { name: /Importér Filer/i }).click();
    await expect(page.getByText(/for missing_session.csv kom den gemte session ikke med/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('grupdk_history_missing_session.csv'))).toBeNull();
});

// Målt 3/11 i Chromium: en gendannelse i en browser med næsten fuldt lager
// fik 3 af 12 sessioner ind, og det var de tre ÆLDSTE. Nu skrives de nyeste
// først, og kvitteringen siger tallet i stedet for "historik kunne ikke
// gendannes". Kun Chromium: kvoten er forskellig fra browser til browser,
// og det er Chromium, fundet blev målt i.
test('Gendannelse i et næsten fuldt lager beholder de nyeste sessioner', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Kvoten måles kun i Chromium');
    test.setTimeout(60_000);
    await createClass(page, 'Kvote');
    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();

    const PAYLOAD = 20_000;
    // Fyld lageret helt op med filler_-nøgler (store, så små), og frigør
    // derefter plads til cirka tre sessioner plus klassen og listen.
    await page.evaluate((size) => {
        const fill = (prefix: string, chunk: number) => {
            const value = 'x'.repeat(chunk);
            for (let i = 0; ; i++) {
                try { localStorage.setItem(`filler_${prefix}_${i}`, value); } catch { return; }
            }
        };
        fill('big', size);
        fill('small', 100);
        for (let i = 0; i < 3; i++) localStorage.removeItem(`filler_big_${i}`);
        for (let i = 0; i < 60; i++) localStorage.removeItem(`filler_small_${i}`);
    }, PAYLOAD);

    const DAY = 24 * 3600 * 1000;
    const history = [];
    const sessions: Record<string, unknown> = {};
    for (let i = 1; i <= 12; i++) {
        const id = `s${i}`;
        history.push({ id, name: `Modul ${i}`, date: new Date(Date.now() - (13 - i) * DAY).toISOString() });
        sessions[id] = { id, name: `Modul ${i}`, groups: [], pad: 'x'.repeat(PAYLOAD - 200) };
    }
    const backup = [{ filename: 'kvote_backup.csv', data: [{ Navn: 'Anna', _rowId: 'r1' }],
        id_column: 'Navn', history, sessions }];

    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.setInputFiles('input[type=file]', {
        name: 'kvote.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
    });
    await page.getByRole('button', { name: /Importér Filer/i }).click();

    const receipt = page.getByText(/for kvote_backup\.csv kom kun \d+ af de 12 gemte sessioner med/);
    await expect(receipt).toBeVisible();
    const kept = Number((await receipt.textContent())!.match(/kom kun (\d+) af/)![1]);

    const list = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('grupdk_history_kvote_backup.csv') || '[]'));
    // Det er de NYESTE, der kom ind — og kvitteringen tæller rigtigt.
    expect(list.length).toBe(kept);
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(12);
    expect(list.map((e: any) => e.name))
        .toEqual(Array.from({ length: kept }, (_, i) => `Modul ${12 - kept + 1 + i}`));
    // Hver indgang i listen kan åbnes.
    const payloadsPresent = await page.evaluate((ids: string[]) =>
        ids.every(id => localStorage.getItem(`grupdk_session_${id}`) !== null), list.map((e: any) => e.id));
    expect(payloadsPresent).toBe(true);

    await page.evaluate(() => {
        Object.keys(localStorage).filter(k => k.startsWith('filler_')).forEach(k => localStorage.removeItem(k));
    });
});

for (const alreadyExists of [true, false]) {
    test(`Importér som kopi bevarer hver klasse ved navnekollisioner (eksisterende: ${alreadyExists})`, async ({ page }) => {
        await createClass(page, 'Collision Integrity');
        const backup = await page.evaluate((alreadyExists) => {
            const filename = alreadyExists ? (window as any).appDebug.state.currentClass.filename : 'new_class.csv';
            Date.now = () => 1234;
            return ['Bo', 'Cecilie'].map(name => ({ filename, data: [{ Navn: name, _rowId: 'r1' }], id_column: 'Navn' }));
        }, alreadyExists);
        await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
        await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
        await page.setInputFiles('input[type=file]', {
            name: 'collisions.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
        });
        await page.getByRole('button', { name: /Importér Filer/i }).click();
        await page.locator('dialog[open]').screenshot({ animations: 'disabled',
            path: `/tmp/grupper-backup-dialog-${alreadyExists}-${test.info().project.name}.png` });
        await page.getByRole('button', { name: /Importér som kopi/i }).click();
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('grupdk_classes') || '[]').length)).toBe(3);
        const classes = await page.evaluate(() => JSON.parse(localStorage.getItem('grupdk_classes') || '[]'));
        expect(classes.map((entry: any) => entry.content.data[0].Navn).sort()).toEqual(['Anna', 'Bo', 'Cecilie']);
    });

}
