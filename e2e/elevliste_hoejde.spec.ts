import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Elevlistens højde, når værktøjslinjen står på to rækker (10/11 2026).
//
// Før: tabellens højde var `100dvh - 122px` — regnet med én række (49 px).
// Ved 1.024 px med et langt navn i "Vis:" og en aftale bryder linjen over to
// rækker (81 px), og så stod tabellens bund og dens vandrette rullebjælke
// 24 px under vindueskanten; siden skulle rulles for at se den. Under 700 px
// (topbjælken 112 px) var det endnu mere.
// Nu: StudentsTab.vue måler linjen og sætter --students-toolbar-h.
// Tabellen slutter 8 px over kanten. (En dag 10/11 2026 var det 32 px, over
// privatlivslinket nederst til højre; det felt er fjernet, se
// e2e/privatlivslinket.spec.ts.)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function addAgreement(page) {
    for (const n of ['Anna', 'Bob']) {
        await page.getByRole('checkbox', { name: `${n} med i aftale`, exact: true }).check();
    }
    await page.locator('#create-agreement-btn').click();
    await page.locator('.agreement-menu').getByRole('menuitem', { name: /Skal sammen/ }).click();
    await page.keyboard.press('Escape');
}

function measure(page) {
    return page.evaluate(() => {
        const main = document.querySelector('.main-content');
        const bar = document.querySelector('.students-header-sticky').getBoundingClientRect();
        const table = document.querySelector('.table-container').getBoundingClientRect();
        const gap = window.innerHeight - table.bottom;
        return {
            toolbar: Math.round(bar.height),
            // 8 px luft; 7-9 tillades, for et brøkdels-mål rundes op i koden
            gapOk: gap >= 7 && gap <= 9 ? true : gap,
            pageScroll: main.scrollHeight - main.clientHeight,
        };
    });
}

// 40 elever, så tabellen er højere end vinduet og fylder det ud
const rows = Array.from({ length: 40 }, (_, i) => `Elev ${i + 1}\tK\t${(i % 12) + 1}`).join('\n');

test('to rækker i værktøjslinjen: tabellens bund står stadig over vindueskanten', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await createClass(page, '3.g Samfundsfag A',
        `Fornavn og efternavn på eleven\tKøn\tKarakter\nAnna\tK\t10\nBob\tM\t7\n${rows}`);
    await addAgreement(page);

    // Én række ved 1.280, to ved 1.024, to rækker topbjælke under 900 px
    // (800 og 650 px — siden 10/11 er topbjælken to rækker allerede under 900)
    for (const width of [1280, 1024, 800, 650]) {
        await page.setViewportSize({ width, height: 700 });
        await expect.poll(async () => {
            const m = await measure(page);
            return { gapOk: m.gapOk, pageScroll: m.pageScroll };
        }, { message: `${width} px` }).toEqual({ gapOk: true, pageScroll: 0 });
    }
    // Sonden skal faktisk have ramt to rækker ved 1.024 px
    await page.setViewportSize({ width: 1024, height: 700 });
    await expect.poll(async () => (await measure(page)).toolbar).toBeGreaterThan(70);

    // Tilbage fra en anden fane: målet sættes igen
    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    await expect.poll(async () => {
        const m = await measure(page);
        return { gapOk: m.gapOk, pageScroll: m.pageScroll };
    }).toEqual({ gapOk: true, pageScroll: 0 });
});
