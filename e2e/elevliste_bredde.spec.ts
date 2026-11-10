import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Elevlistens bredde (4/11 2026).
//
// Få kolonner: tabellen går ud til kanten, men kolonnerne er kun så brede som
// indholdet — slet-kolonnen tager resten, så krydset står yderst til højre.
// Mange kolonner: tabellen ruller vandret, og slet-krydset står FAST i højre
// kant, så man ikke skal rulle for at finde det. Til venstre står Aftale,
// Mødt og Vis-kolonnen fast, så man kan se, hvis række krydset sidder på.
// Vis-kolonnen står altid først (efter Mødt). Stregerne ved de faste kolonner
// (.cut-left, .cut-right) kommer kun, når noget er rullet ind under dem.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MANY = ['Navn', 'Køn', 'Fagligt niveau', 'Aktivitetsniveau', 'Sprog', 'Rolle', 'Klasse', 'Emne',
    'Ønske 1', 'Ønske 2', 'Valgfag', 'Bemærkning', 'Fravær', 'Gruppe sidst', 'Mentor', 'Studieretning'];
const manyRow = (name: string) => [name, 'P', '8', 'Middel', 'Fransk', 'Ordstyrer', '2a', 'Klima',
    'Ida', 'Noah', 'Musik', 'Har brug for ro', '2', '3', 'KM', 'Samf-Eng'].join(',');

async function measure(page) {
    return page.locator('#table-container').evaluate(el => {
        const box = el.getBoundingClientRect();
        const x = el.querySelector('td.cell-delete button')!.getBoundingClientRect();
        const cells = [...el.querySelectorAll('tbody tr:first-child td')].slice(0, 3);
        return {
            leftCells: cells.map(td => Math.round(td.getBoundingClientRect().left)),
            firstName: (cells[2].textContent || '').trim(),
            cutLeft: el.classList.contains('cut-left'),
            scrolls: el.scrollWidth > el.clientWidth,
            xInView: x.left >= box.left && x.right <= box.right,
            xFromRight: Math.round(box.right - x.right),
            cutRight: el.classList.contains('cut-right'),
        };
    });
}

test('få kolonner: ingen rulning, krydset yderst til højre og ingen streg', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await createClass(page, 'Få kolonner', 'Navn,Køn,Niveau\nEmma Hansen,P,8\nOliver Nielsen,D,6');
    const m = await measure(page);
    expect(m.scrolls).toBe(false);
    expect(m.xInView).toBe(true);
    // Krydset har 8 px luft i sin knap + 24 px cellepolstring = 32 px fra kanten
    expect(Math.abs(m.xFromRight - 24)).toBeLessThanOrEqual(2);
    expect(m.cutRight).toBe(false);
});

test('mange kolonner: tabellen ruller, og slet-krydset står fast i højre kant', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await createClass(page, 'Mange kolonner',
        [MANY.join(','), manyRow('Emma Hansen'), manyRow('Oliver Nielsen')].join('\n'));
    const box = page.locator('#table-container');

    const start = await measure(page);
    expect(start.scrolls).toBe(true);
    expect(start.xInView).toBe(true);
    expect(start.cutRight).toBe(true);

    expect(start.cutLeft).toBe(false);

    await box.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await expect(box).not.toHaveClass(/cut-right/);
    await expect(box).toHaveClass(/cut-left/);
    const end = await measure(page);
    expect(end.xInView).toBe(true);
    expect(end.xFromRight).toBe(start.xFromRight);
    // De tre faste kolonner står samme sted som før rulningen (± 1 px: deres
    // faste plads er rundet ned, så der ikke er en sprække imellem), og navnet ses
    end.leftCells.forEach((left, i) => expect(Math.abs(left - start.leftCells[i])).toBeLessThanOrEqual(1));
    expect(end.firstName).toBe('Emma Hansen');

    // Krydset kan stadig bruges uden at rulle tilbage
    await box.evaluate(el => { el.scrollLeft = 0; });
    await page.locator('td.cell-delete button').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
});

test('Vis-kolonnen står først og bliver stående til venstre', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await createClass(page, 'Vis først',
        [MANY.join(','), manyRow('Emma Hansen'), manyRow('Oliver Nielsen')].join('\n'));
    await page.locator('#id-column-select').selectOption('Mentor');
    const box = page.locator('#table-container');
    const firstHeader = box.locator('thead th.col-header').first();
    await expect(firstHeader).toContainText('MENTOR');
    // Klassens egen rækkefølge er urørt: Navn står stadig lige efter
    await expect(box.locator('thead th.col-header').nth(1)).toContainText('NAVN');

    await box.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    const pinned = await box.evaluate(el => {
        const td = el.querySelector('tbody tr:first-child td:nth-child(3)')!;
        const r = td.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        return { text: (td.textContent || '').trim(), inView: r.left >= b.left && r.right <= b.right };
    });
    expect(pinned).toEqual({ text: 'KM', inView: true });
});

// Tastaturet (gennemsyn 4/11 2026): browserne ruller kun en celle frem, når
// den er HELT ude af syne, og ved ikke, at de faste kolonner dækker kanten.
// Med Skift+Tab landede fokus i en celle bag Vis-kolonnen (og med Tab bag
// slet-krydset), så man skrev i en celle, man ikke kunne se.
test('Tab og Skift+Tab: den fokuserede celle står aldrig bag de faste kolonner', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await createClass(page, 'Tab gennem rækken',
        [MANY.join(','), manyRow('Emma Hansen'), manyRow('Oliver Nielsen')].join('\n'));
    await page.locator('tbody tr').first().locator('td.cell-data').first().click();
    const covered = () => page.evaluate(() => {
        const cell = (document.activeElement as HTMLElement).closest('td')!;
        const cells = cell.parentElement!.children;
        const i = Array.prototype.indexOf.call(cells, cell);
        if (i < 3 || i === cells.length - 1) return '';
        const r = cell.getBoundingClientRect();
        const left = cells[2].getBoundingClientRect().right;
        const right = cells[cells.length - 1].getBoundingClientRect().left;
        return r.left < left - 1 || r.right > right + 1 ? (cell.textContent || '').trim() : '';
    });
    const hidden: string[] = [];
    for (const key of [...Array(17).fill('Tab'), ...Array(17).fill('Shift+Tab')]) {
        await page.keyboard.press(key);
        const name = await covered();
        if (name) hidden.push(`${key}: ${name}`);
    }
    expect(hidden).toEqual([]);
});
