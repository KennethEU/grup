import { test, expect } from '@playwright/test';
import { createClass, goToGroups, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lange tekster må ikke sprænge layoutet (gennemsynet 24/9 2026).
// Et langt klassenavn brød pillen i topbjælken over fire linjer ved 1024 px,
// og emnemærket på gruppekortene mistede sin pil og viste aldrig hele emnet.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LONG_CLASS = 'Samfundsfag A 2.x Erhvervsøkonomi og innovation hold B 2026/27';
const LONG_TOPIC = 'Globalisering og internationale samarbejdsorganisationer';

test('et langt klassenavn bliver på én linje og gør aldrig siden bredere', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await createClass(page, LONG_CLASS);

    const pill = page.locator('.class-trigger');
    const box = await pill.boundingBox();
    // Én linje: pillen er lige så høj som med et kort navn (39px), ikke 80+.
    expect(box!.height).toBeLessThan(50);
    expect(box!.y).toBeGreaterThanOrEqual(0);

    const widths = await page.evaluate(() =>
        [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);

    // Den fulde tekst er stadig navnet (afkortningen er kun visuel) …
    await expect(pill).toContainText(LONG_CLASS);
    // … og menuen viser det helt, over flere linjer i stedet for "…".
    await pill.click();
    const item = page.locator('.class-item .name').first();
    expect(await item.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
});

test('et langt emne beholder sin pil og viser hele emnet i sit tip', async ({ page }) => {
    await createClass(page);
    await goToGroups(page);
    await page.evaluate((topic) => {
        (window as any).appDebug.state.currentClass.topics = [topic, 'Kort'];
    }, LONG_TOPIC);
    await generateGroups(page);

    const select = page.locator('.group-card .topic-select').filter({ has: page.locator(`option:checked`, { hasText: LONG_TOPIC }) }).first();
    await expect(select).toBeVisible();
    const style = await select.evaluate(e => {
        const c = getComputedStyle(e);
        return { image: c.backgroundImage, overflow: c.textOverflow };
    });
    expect(style.image).toContain('svg');
    expect(style.overflow).toBe('ellipsis');
    // title flyttes af tooltip.js til data-tooltip ved første hover; før det
    // står teksten i title.
    const tip = await select.evaluate(e => e.getAttribute('title') || e.getAttribute('data-tooltip'));
    expect(tip).toContain(LONG_TOPIC);
});

test('aftaler: et navn ombrydes samlet, og et navn uden mellemrum skubber aldrig fjern-knappen ud', async ({ page }) => {
    const csv = 'Navn\tKøn\nAnna Kristine Holm-Sørensen\tK\nMads Ærø Christiansen\tM\nEmil Hansen\tM\n'
        + 'Sofie Marie Lindberg Østergaard\tK\nX' + 'y'.repeat(70) + '\tK\nBo\tM';
    await createClass(page, 'Lange navne i aftaler', csv);
    await page.evaluate(() => {
        const cls = (window as any).appDebug.state.currentClass;
        cls.togetherGroups = [
            { ids: cls.data.slice(0, 4).map(s => s._rowId), timestamp: 1 },
            { ids: [cls.data[4]._rowId, cls.data[5]._rowId], timestamp: 2 },
        ];
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#together-list-btn').click();
    const dialog = page.getByRole('dialog', { name: 'Aftaler', exact: true });
    await expect(dialog).toBeVisible();
    // Før: 287 px ud over vinduet, og fjern-knappen på den række var væk.
    const overflow = await dialog.evaluate(d => {
        const box = d.querySelector('.avoid-table-container')!;
        return box.scrollWidth - box.clientWidth;
    });
    expect(overflow).toBe(0);
    for (const btn of await dialog.getByRole('button', { name: 'Fjern aftale' }).all()) {
        await expect(btn).toBeInViewport({ ratio: 1 });
    }
    // Hvert navn står samlet: ét navn = én boks, og for- og efternavn på samme
    // linje, når navnet kan være der.
    const split = await dialog.evaluate(d => [...d.querySelectorAll('.member-name')]
        .filter(el => el.textContent!.includes(' ') && el.getClientRects().length > 1).length);
    expect(split).toBe(0);
});

// En bærbar på 1366×768 med 150 % zoom er 911 CSS-pixel bred. Dér fik
// klassenavnet 7 px af pillen: "2.a (testdata)" stod som "2" uden "…", og det
// lignede et helt navn. Nu skjules ordet "Klasse" visuelt under 1100 px.
test('klassenavnet kan læses ved 911px (1366x768 med 150 % zoom)', async ({ page }) => {
    await page.setViewportSize({ width: 911, height: 433 });
    await createClass(page, '2.a Samfundsfag');

    const name = page.locator('.class-trigger .class-name');
    // Mindst ~6 tegn plads — ikke bare det første bogstav.
    expect((await name.boundingBox())!.width).toBeGreaterThan(60);
    // Ordet "Klasse" er stadig en del af knappens navn for en skærmlæser.
    await expect(page.getByRole('button', { name: /Klasse\s*2\.a Samfundsfag/ })).toBeVisible();
    const widths = await page.evaluate(() =>
        [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);
});
