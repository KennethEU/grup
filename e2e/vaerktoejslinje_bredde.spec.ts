import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Værktøjslinjen over elevlisten og topbjælken på en smal skærm (9/11 2026).
//
// Før: ved 1.024-1.180 px med en aftale og et langt navn i "Vis:" stod "Flyt"
// og "Slet kolonne" uden for vinduet (bjælken kan ikke rulle) og kunne slet
// ikke nås, og "Import & backup" i topbjælken brød over tre linjer.
// Nu: bjælken bryder hellere end at skære af, og med et almindeligt navn
// ("Navn") er den stadig på én række ved 1.024 px.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function addAgreement(page) {
    for (const n of ['Anna', 'Bob']) {
        await page.getByRole('checkbox', { name: `${n} med i aftale`, exact: true }).check();
    }
    await page.locator('#create-agreement-btn').click();
    await page.locator('.agreement-menu').getByRole('menuitem', { name: /Skal sammen/ }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#together-list-btn .avoid-badge')).toHaveText('1');
}

function measure(page) {
    return page.evaluate(() => {
        const items = [...document.querySelectorAll('.settings-panel .id-selector-wrapper, .settings-panel button')]
            .filter(el => !el.closest('.agreement-menu'))
            .map(el => {
                const b = el.getBoundingClientRect();
                return { name: (el.textContent || '').trim(), left: b.left, right: b.right, top: Math.round(b.top) };
            });
        // Linjer i hver fane: én tekstlinje = ét rektangel
        const tabLines = [...document.querySelectorAll('.nav-tab')].map(el => {
            const r = document.createRange();
            r.selectNodeContents(el);
            return { name: (el.textContent || '').trim(), lines: r.getClientRects().length };
        });
        return { vw: window.innerWidth, items, tabLines };
    });
}

test('langt navn i "Vis:" og langt klassenavn: alle knapper kan ses, fanerne er på én linje', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await createClass(page, '3.g Samfundsfag A med Erhvervsøkonomi B og ekstra lang titel',
        'Fornavn og efternavn på eleven\tKøn\tKarakter\nAnna\tK\t10\nBob\tM\t7\nClara\tK\t12\nDavid\tM\t4');
    await addAgreement(page);

    for (const width of [1024, 1100, 1180, 1280]) {
        await page.setViewportSize({ width, height: 700 });
        await expect.poll(async () => {
            const m = await measure(page);
            const outside = m.items.filter(i => i.left < 0 || i.right > m.vw - 16).map(i => i.name);
            const wrapped = m.tabLines.filter(t => t.lines !== 1).map(t => t.name);
            return { outside, wrapped };
        }, { message: `${width} px` }).toEqual({ outside: [], wrapped: [] });
    }
});

test('almindeligt navn ved 1.024 px: hele bjælken på én række', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    await createClass(page, 'Én række',
        'Navn\tKøn\tKarakter\nAnna\tK\t10\nBob\tM\t7\nClara\tK\t12\nDavid\tM\t4');
    await addAgreement(page);
    const m = await measure(page);
    expect(new Set(m.items.map(i => i.top)).size).toBe(1);
    expect(m.items.every(i => i.right <= m.vw - 16)).toBe(true);
});
