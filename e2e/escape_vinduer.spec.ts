import { test, expect } from '@playwright/test';
import { createClass, createClassAndGoToGroups, generateGroups, openSaveSession } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ESCAPE — ét sted, og alle vinduer med.
//
// Escape lå før to steder: en kæde i ModalsRoot.vue med ét flag pr. vindue,
// plus fire vinduer der havde deres egen lytter oveni. Kæden skulle holdes i
// sync i hånden, og et vindue der ikke stod i den, fik i STILHED ingen
// Escape. Præcis dét var sket for Undgåelser-vinduet, som oveni lå uden for
// alle "ligger der et vindue ovenpå?"-tjek, fordi det ikke hedder
// .modal-overlay.
//
// Nu lukker hvert vindue sig selv gennem useModalFocus(). Testene her går
// efter dét, en kæde ikke kan garantere: at tasten virker i HVERT vindue, og
// at intet andet reagerer på den samtidig.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Escape lukker vinduerne i elevlisten — og lægger fokus tilbage', async ({ page }) => {
    await createClass(page, 'Escape Elevliste');

    // Fire vinduer fra værktøjslinjen, hver med sin egen luk-vej.
    const openDialogs = [
        { selector: '#cat-btn', heading: 'Kategorisér Data' },
        { selector: '#rank-btn', heading: 'Ranger værdier' },
        { selector: '#col-layout-btn', heading: 'Flyt kolonner' },
    ];

    for (const v of openDialogs) {
        const openButton = page.locator(v.selector);
        // Åbnet med TASTATURET, ikke med et klik. WebKit giver ikke en knap
        // fokus, når den klikkes med musen (macOS-konventionen), og så er der
        // ingenting at lægge fokus tilbage på bagefter. Løftet om at fokus
        // vender tilbage gælder den, der navigerer med tastaturet — så det er
        // dér, det skal måles. Gælder alle tre browsere.
        await openButton.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('heading', { name: v.heading })).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(page.getByRole('heading', { name: v.heading })).toBeHidden();
        // Fokus skal tilbage på knappen der åbnede vinduet — ellers står
        // markøren på <body>, og næste Tab starter forfra i toppen af siden.
        await expect(openButton).toBeFocused();
    }
});

// PromptModal er det ENE vindue, der selv sætter fokus i sin onMounted (feltet
// markeres, så læreren kan skrive oven i forslaget). Den krog kørte FØR
// useModalFocus' egen, og så huskede useModalFocus feltet — ikke knappen —
// som "det der havde fokus før". Ved luk var feltet væk, og markøren endte på
// <body>. Gjaldt alle fem steder, vinduet bruges: ny klasse, omdøb klasse,
// ny kolonne, omdøb kolonne og omdøb session.
test('Escape lukker tekstvinduet — og lægger fokus tilbage på knappen', async ({ page }) => {
    await createClass(page, 'Escape Prompt');

    const openButton = page.locator('#add-col-btn');
    await openButton.focus();
    await page.keyboard.press('Enter');
    const heading = page.getByRole('heading', { name: 'Ny kolonne' });
    await expect(heading).toBeVisible();
    // Feltet skal stadig have fokus, når vinduet åbner — det er dét, PromptModal
    // selv sørger for, og rettelsen må ikke tage det fra den.
    await expect(page.getByPlaceholder('Navn på kolonne')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(heading).toBeHidden();
    await expect(openButton).toBeFocused();
});

// Enter i feltet opretter kolonnen og lukker vinduet. Før blev samme Enter
// til et "klik" på knappen bagved, når fokus vendte tilbage til den, så
// vinduet åbnede igen — og det næste man skrev, blev en ekstra kolonne.
test('Enter i tekstvinduet lukker det — og åbner det ikke igen', async ({ page }) => {
    await createClass(page, 'Enter Prompt');

    const openButton = page.locator('#add-col-btn');
    await openButton.focus();
    await page.keyboard.press('Enter');
    const heading = page.getByRole('heading', { name: 'Ny kolonne' });
    await expect(heading).toBeVisible();

    await page.getByPlaceholder('Navn på kolonne').fill('Enterkolonne');
    await page.keyboard.press('Enter');
    await expect(page.locator('thead th', { hasText: 'Enterkolonne' })).toHaveCount(1);
    await expect(heading).toBeHidden();
    // Vent et øjeblik: genåbningen skete EFTER lukningen.
    await page.waitForTimeout(300);
    await expect(heading).toBeHidden();
    await expect(openButton).toBeFocused();
});

test('Escape lukker Undgåelser-vinduet, og fokus fanges imens', async ({ page }) => {
    await createClass(page, 'Escape Undgaaelser');

    const openButton = page.locator('#together-list-btn');
    // Tastaturvejen — se kommentaren i testen ovenfor om WebKit og museklik.
    await openButton.focus();
    await page.keyboard.press('Enter');

    const dialogEl = page.locator('.avoid-modal-backdrop');
    await expect(dialogEl).toBeVisible();
    // Det er et rigtigt vindue nu — ikke en div med en tast på.
    await expect(dialogEl).toHaveAttribute('aria-modal', 'true');
    await expect(dialogEl).toHaveAttribute('role', 'dialog');

    // Fokus skal flytte IND. Før blev det siddende på knappen bagved, og
    // første Tab landede på næste knap i værktøjslinjen — under overlayet.
    await expect(dialogEl.getByRole('button', { name: 'Luk' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('.avoid-modal-backdrop :focus')).toHaveCount(1);

    // Og Escape lukker — uanset hvor markøren står i vinduet.
    await page.keyboard.press('Escape');
    await expect(dialogEl).toBeHidden();
    await expect(openButton).toBeFocused();
});

test('Ctrl+Z rører ikke elevlisten, mens Undgåelser-vinduet ligger over den', async ({ page }) => {
    await createClass(page, 'Escape CtrlZ');

    // Ret en celle, så der ER noget at fortryde.
    const firstCell = page.locator('tbody tr').first().locator('td.cell-data').first();
    await firstCell.dblclick();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Ændret');
    await page.keyboard.press('Enter');
    await expect(firstCell).toHaveText('Ændret');

    // Åbn vinduet oven på listen og fortryd. Fortrydelsen ville ske BAG et
    // vindue der dækker den — læreren ser det først, når hun lukker.
    await page.locator('#together-list-btn').click();
    await expect(page.locator('.avoid-modal-backdrop')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(200);

    await page.locator('.avoid-modal-backdrop').getByRole('button', { name: 'Luk' }).click();
    await expect(page.locator('.avoid-modal-backdrop')).toBeHidden();
    await expect(firstCell).toHaveText('Ændret');

    // Og når vinduet ER lukket, virker fortryd igen.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(firstCell).not.toHaveText('Ændret');
});

test('Ét Escape lukker ÉN ting — vinduet, ikke markeringen bagved', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Escape Een Ting');
    await generateGroups(page);

    // Markér en elev. Escape fortryder normalt markeringen.
    //
    // Slås op på det, læreren FAKTISK ser: den markerede række og "Flyt
    // hertil"-knapperne på de andre kort. Testen hang før i `.pick-status`,
    // som i dag er en usynlig aria-live-besked — den kunne altså sige
    // "synlig" om noget, ingen kan se.
    const studentRow = page.locator('.group-card .group-members-list li').first();
    await studentRow.click();
    await expect(studentRow).toHaveClass(/picked/);
    await expect(page.locator('.receive-picked-btn').first()).toBeVisible();

    // Åbn et vindue ovenpå og tryk Escape: vinduet ejer tasten, og
    // markeringen skal stå urørt bagefter. Begge lytter på document.
    await openSaveSession(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Gem session' })).toBeHidden();
    await expect(studentRow).toHaveClass(/picked/);

    // Og NU ejer markeringen tasten.
    await page.keyboard.press('Escape');
    await expect(studentRow).not.toHaveClass(/picked/);
    await expect(page.locator('.receive-picked-btn')).toHaveCount(0);
});
