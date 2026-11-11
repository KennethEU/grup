import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// En elevrække, hvor en celle mangler helt (et "hul").
//
// I dag skriver alt en celle i hver kolonne, men en klasse fra en ældre
// udgave eller en håndredigeret backup kan have huller. Hedder kolonnen som
// noget, JavaScript selv bruger ("constructor"), læste elevlisten en
// indbygget funktion på hullet: cellen viste "function Object() { [native
// code] }", og motoren fik det som elevens værdi. Når klassen åbnes, fyldes
// hullerne nu med en tom celle (fillMissingCells), og kolonnerne bliver
// stående, hvor de var. (94. gennemsyn.)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CSV = 'Navn\tconstructor\tHold\nAnna\tA\t1\nBo\tB\t2';

const columns = (page) =>
    page.evaluate(() => [...((window as any).appDebug.state.currentClass?.columns || [])]);

test('et hul i en kolonne kaldt "constructor" vises tomt og gemmes som en tom celle', async ({ page }) => {
    await createClass(page, 'Hul', CSV);
    await expect.poll(() => columns(page)).toEqual(['Navn', 'constructor', 'Hold']);

    // Lav hullet direkte i lageret, som en gammel klasse ville have det:
    // den første elev mangler cellen i den midterste kolonne.
    await page.evaluate(() => {
        const list = JSON.parse(localStorage.getItem('grupdk_classes') || '[]');
        const cls = list.find((c: any) => c.name === 'Hul');
        const row = cls.content.data.find((r: any) => r.Navn === 'Anna');
        delete row.constructor;
        localStorage.setItem('grupdk_classes', JSON.stringify(list));
    });

    await page.reload();
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true, null, { timeout: 120000 });
    await expect(page.locator('tr').filter({ hasText: 'Anna' })).toBeVisible();

    // Ingen funktionstekst i elevlisten.
    await expect(page.locator('table')).not.toContainText('native code');
    // Kolonnerne står, hvor de stod.
    await expect.poll(() => columns(page)).toEqual(['Navn', 'constructor', 'Hold']);

    // Hullet er gemt som en tom celle, på sin plads.
    await expect.poll(() => page.evaluate(() => {
        const list = JSON.parse(localStorage.getItem('grupdk_classes') || '[]');
        const row = list.find((c: any) => c.name === 'Hul').content.data.find((r: any) => r.Navn === 'Anna');
        return Object.hasOwn(row, 'constructor') ? Object.keys(row).filter(k => !k.startsWith('_')) : null;
    })).toEqual(['Navn', 'constructor', 'Hold']);

    // Og efter endnu en genindlæsning står rækkefølgen stadig.
    await page.reload();
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true, null, { timeout: 120000 });
    await expect.poll(() => columns(page)).toEqual(['Navn', 'constructor', 'Hold']);
    await expect(page.locator('table')).not.toContainText('native code');
});
