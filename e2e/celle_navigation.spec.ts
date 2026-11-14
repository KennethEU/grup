// Enter og pil op/ned i elevlisten markerer hele den næste celle — som i
// Excel. Før lå markøren forrest, og det man skrev, kom foran den gamle
// tekst ("Bob" blev til "XBob").
import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

function cell(page, row: number, col: number) {
    return page.locator('tbody tr').nth(row).locator('td.cell-data').nth(col);
}

test('Enter til næste celle: det man skriver, erstatter indholdet', async ({ page }) => {
    await createClass(page, 'Celle-navigation');
    await cell(page, 0, 0).click();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Bobby');
    await page.keyboard.press('Enter');
    await expect(cell(page, 1, 0)).toHaveText('Bobby');
});

test('Pil op markerer også hele cellen', async ({ page }) => {
    await createClass(page, 'Celle-navigation');
    await cell(page, 1, 2).click();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.type('11');
    await page.keyboard.press('ArrowDown');
    await expect(cell(page, 0, 2)).toHaveText('11');
});

test('Ctrl+Z tager den overskrevne værdi tilbage', async ({ page }) => {
    await createClass(page, 'Celle-navigation');
    await cell(page, 0, 0).click();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Bobby');
    await page.keyboard.press('Enter');
    await expect(cell(page, 1, 0)).toHaveText('Bobby');
    await page.locator('.settings-panel, body').first().click({ position: { x: 5, y: 5 } });
    await cell(page, 2, 1).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(cell(page, 1, 0)).toHaveText('Bob');
});

// 139. gennemsyn: Ctrl+Z midt i en rettelse tager det skrevne tilbage. Før lagde
// appens fortryd klassen tilbage, som den var ved første tastetryk (= urørt),
// cellen viste stadig det skrevne, og blur gemte det — Ctrl+Z gjorde intet.
test('Ctrl+Z midt i en rettelse tager det skrevne tilbage', async ({ page }) => {
    await createClass(page, 'Celle-fortryd');
    const first = cell(page, 0, 0);
    const before = await first.innerText();
    await first.click();
    await page.keyboard.press('End');
    await page.keyboard.type('xyz');
    await expect(first).toHaveText(before + 'xyz');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(first).toHaveText(before);
    // Og det gemte er det samme, når cellen forlades.
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() =>
        (window as any).appDebug.state.currentClass.data[0].Navn)).toBe(before);
    await expect(first).toHaveText(before);
});

test('Ctrl+Z midt i en rettelse bruger ikke den forrige ændring op', async ({ page }) => {
    await createClass(page, 'Celle-fortryd stak');
    // En rigtig ændring først: Bob bliver til Bobby.
    await cell(page, 0, 0).click();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Bobby');
    await page.keyboard.press('Enter');
    await expect(cell(page, 1, 0)).toHaveText('Bobby');
    // Så en rettelse, der fortrydes, mens der skrives.
    await page.keyboard.type('Zz');
    const stack = () => page.evaluate(() => (window as any).appDebug.state._undoStack.length);
    const before = await stack();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(cell(page, 2, 0)).not.toContainText('Zz');
    // Kun cellens eget billede er brugt: Bobby står der stadig (den globale
    // genvej i main.js må ikke fortryde én gang til på samme tryk).
    await expect(cell(page, 1, 0)).toHaveText('Bobby');
    expect(await stack()).toBe(before - 1);
    // Ét tryk mere tager Bobby tilbage til Bob.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(cell(page, 1, 0)).toHaveText('Bob');
});
