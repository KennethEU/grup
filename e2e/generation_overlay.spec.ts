import { test, expect } from '@playwright/test';
import { createClass, gotoAppReady } from './helpers';

/**
 * Udgangen ud af en kørsel.
 *
 * Motoren arbejder i sine egne tråde, og en gruppedannelse på et sammenlagt
 * hold kan tage op til et halvt minut. "Generér" er slået fra imens, og overlayet dækker resten
 * af skærmen — så uden en stop-knap er genindlæsning af fanen det eneste svar
 * på "jeg valgte forkert", og på en motor der er gået i stå uden at sige det.
 */
test('overlayet har en vej ud — og motoren er klar igen bagefter', async ({ page }) => {
    await gotoAppReady(page);

    // Rejs overlayet direkte. En rigtig kørsel er enten for hurtig til at nå
    // at klikke i, eller for langsom til at være en test.
    await page.evaluate(() => { (window as any).appDebug.state.isGenerating = true; });

    const overlay = page.locator('.processing-overlay');
    await expect(overlay).toBeVisible();

    const stop = overlay.getByRole('button', { name: 'Stop' });
    await expect(stop).toBeVisible();
    await stop.click();

    // Overlayet er væk, og læreren får det at vide.
    await expect(overlay).toBeHidden({ timeout: 10000 });
    await expect(page.locator('.toast.info')).toContainText('stoppet');

    // Et stop må ikke efterlade en app der ikke kan danne grupper igen.
    expect(await page.evaluate(() => (window as any).appDebug.state.isGenerating)).toBe(false);
});

/**
 * Overlayet skal dække skærmen — også når læreren har rullet ned.
 *
 * Det gjorde det ikke. Fladen lå med `position: absolute` inde i
 * `.main-content`, som selv ruller, så `top: 0` var toppen af INDHOLDET og
 * ikke af skærmen. Målt i browseren med 60 elever: rul 600 px ned midt i en
 * kørsel, og overlayet stod fra -535 til 120 px — altså over skærmkanten.
 * Fra 120 px og ned lå elevtabellen fri, og `elementFromPoint()` svarede
 * `td.cell-data "Elev 16"`: læreren kunne rette et navn, sætte flueben ved
 * fraværende eller slette en elev, mens motoren regnede på netop den liste.
 * Samtidig var "Stop" rullet ud af skærmen, så en lang kørsel ikke kunne
 * standses uden først at rulle op igen.
 *
 * Testen ruller med vilje og spørger skærmen, ikke stylesheetet: hvad ligger
 * øverst på de punkter, læreren ville klikke på?
 */
test('overlayet dækker skærmen, også når der er rullet ned', async ({ page }) => {
    // Nok elever til at elevlisten kan rulle på enhver skærmhøjde.
    const rows = ['Navn\tKøn\tKarakter'];
    for (let i = 1; i <= 60; i++) {
        rows.push(`Elev ${i}\t${i % 2 ? 'M' : 'K'}\t${(i % 12) + 1}`);
    }
    await createClass(page, 'Rul E2E', rows.join('\n'));

    await page.evaluate(() => {
        const mc = document.querySelector('.main-content') as HTMLElement;
        mc.scrollTop = 600;
        (window as any).appDebug.state.isGenerating = true;
    });

    const overlay = page.locator('.processing-overlay');
    await expect(overlay).toBeVisible();

    // Stop-knappen skal være INDE i skærmen, ikke bare i DOM'en.
    const stop = overlay.getByRole('button', { name: 'Stop' });
    await expect(stop).toBeInViewport();

    // Hvad rammer et klik? Fem punkter ned gennem skærmen — topbaren øverst
    // og elevtabellen nedenunder — skal alle ligge PÅ fladen. `closest()`
    // frem for et opslag på klassenavnet: midt på skærmen rammer man
    // snurrehjulet og teksten, som er fladens egne børn.
    const hits = await page.evaluate(() => {
        const h = window.innerHeight;
        return [0.05, 0.25, 0.5, 0.75, 0.95].map(f => {
            const el = document.elementFromPoint(window.innerWidth / 2, Math.round(h * f));
            if (!el) return 'ingenting';
            if (el.closest('.processing-overlay')) return 'overlay';
            return el.tagName + '.' + String((el as HTMLElement).className);
        });
    });
    expect(hits).toEqual(['overlay', 'overlay', 'overlay', 'overlay', 'overlay']);
});
