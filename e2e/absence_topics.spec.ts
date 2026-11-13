import { test, expect, Page } from '@playwright/test';
import { createClass, createClassAndGoToGroups, goToGroups, generateGroups, addTopics, goToMatrix, setGroupSize } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fravær, efternølere og klasse-emner — dækker de adfærds-fixes der er
// beskrevet i NEWS 2026-06-10: fraværende elever tæller ikke med, en
// tilbagevendende elev ender aldrig i to grupper, og emner runder
// gruppe-antallet (samme tal i hint-banner og generering).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Toggle the attendance checkbox (2nd checkbox) in a student's row. */
async function setAbsent(page: Page, name: string) {
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    const row = page.locator('tr').filter({ hasText: name });
    await row.locator('.cell-checkbox input').nth(1).uncheck();
}

/** Open the latecomer modal, tick one student, confirm. */
async function addLatecomer(page: Page, name: string) {
    await page.getByRole('button', { name: 'Tilføj efternøler' }).click();
    // Vælg på det VISTE navn, ikke på checkboxens value: siden elev-identitet
    // blev skilt fra visningsnavnet, er value'en elevens interne id (r4), og
    // navnet står kun i etiketten ved siden af.
    await page.locator('.student-item').filter({ hasText: name })
        .locator('input[type="checkbox"]').check();
    await page.locator('.btn-confirm').click();
}

test('En fraværende elev er ude af dannelsen og kommer tilbage i præcis én gruppe', async ({ page }) => {
    await createClass(page, 'Fravær Test');

    // Marker David fraværende FØR dannelsen
    await setAbsent(page, 'David');

    await goToGroups(page);
    await generateGroups(page);

    // David må ikke sidde i nogen gruppe
    await expect(page.locator('.group-members-list li').filter({ hasText: 'David' })).toHaveCount(0);

    // David kommer — tilføj via efternøler-vinduet (vejen for en elev, der vender tilbage)
    await addLatecomer(page, 'David');

    // David sidder nu i PRÆCIS én gruppe
    await expect(page.locator('.group-members-list li').filter({ hasText: 'David' })).toHaveCount(1);
});

test('En elev, der kommer tilbage og stadig sidder i en gruppe, flyttes og dubleres ikke', async ({ page }) => {
    await createClass(page, 'Dublet Test');

    // Dan grupper med alle til stede — David lander i en gruppe
    await goToGroups(page);
    await generateGroups(page);
    await expect(page.locator('.group-members-list li').filter({ hasText: 'David' })).toHaveCount(1);

    // NU markeres David fraværende (grupperne beholder ham — de dannes ikke om)
    await setAbsent(page, 'David');

    // Tilbage på Grupper: tilføj ham igen via efternøler-vinduet.
    // Før rettelsen sad han derefter i TO grupper på én gang.
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await addLatecomer(page, 'David');

    await expect(page.locator('.group-members-list li').filter({ hasText: 'David' })).toHaveCount(1);
});

test('Klassens emner runder gruppeantallet og står på kortene — hintet passer med resultatet', async ({ page }) => {
    await createClass(page, 'Emne Test');
    await goToGroups(page);

    // To emner i opskriften
    await addTopics(page, ['EmneA', 'EmneB']);

    // Beskeden fortæller om emnerne: 12 elever i "4+" giver 3 grupper på 4.
    // Et multiplum af de 2 emner ville give 2 på 6 eller 4 på 3, og begge er
    // uden for valget, så de 3 grupper bliver stående (ændret 1/11 2026).
    // Beskeden står ved størrelsen i opskriften.
    const hint = page.locator('dialog.recipe-dialog[open] .recipe__hints');
    await expect(hint).toContainText('3 grupper går ikke lige op med 2 emner');

    // Og afrundingen må kun siges ÉT sted. Toasten efter kørslen sagde det
    // samme tal i en anden formulering; banneret ejer beskeden nu.
    await expect(page.locator('.toast, .notification')
        .filter({ hasText: 'Antal grupper justeret' })).toHaveCount(0);

    await generateGroups(page);

    // The generated count matches the hint exactly (banner og algoritme
    // deler computeTopicAdjustedTarget — det må aldrig drifte)
    await expect(page.locator('.group-card')).toHaveCount(3);

    // LPT auto-assignment: emnerne fordeles jævnt over grupperne. Hvert kort
    // har en emne-SELECT hvis muligheder rummer alle klassens emner, så der
    // måles på den VALGTE værdi — ikke på kortets tekst, der altid rummer
    // begge.
    const topicSelects = page.locator('.group-card select.topic-select');
    await expect(topicSelects).toHaveCount(3);
    const values = [
        await topicSelects.nth(0).inputValue(),
        await topicSelects.nth(1).inputValue(),
        await topicSelects.nth(2).inputValue(),
    ];
    expect(values.sort()).toEqual(['EmneA', 'EmneA', 'EmneB']);
});

// Fundet 12/11 2026 (gennemsyn 96): appen havde sit eget regnestykke for
// antal grupper, og det var uenigt med motoren, når størrelsen gav færre
// grupper end emner ved "én elev ekstra". 12 elever i grupper på 5 og 5 emner:
// opskriften skrev "ca. 5 grupper" og "der skal være mindst 5 grupper", mens
// motoren dannede 2 og selv skrev, at tre emner ingen gruppe fik — to beskeder,
// der modsagde hinanden. Nu regner appen med motorens egen funktion.
test('Færre grupper end emner ved "én elev ekstra": skønnet, beskeden og grupperne siger det samme', async ({ page }) => {
    await createClass(page, 'Emner og størrelse');
    await goToGroups(page);
    await addTopics(page, ['A', 'B', 'C', 'D', 'E']);
    await setGroupSize(page, 5);

    const dialog = page.locator('dialog.recipe-dialog[open]');
    // Skønnet i størrelses-ordet
    await dialog.locator('.rtok__btn[aria-label^="Gruppernes størrelse:"]').click();
    await expect(dialog.locator('.rtok__pop .recipe-pop-note')).toHaveText('ca. 2 grupper af 12 elever');
    await page.keyboard.press('Escape');
    await expect(dialog.locator('.rtok__pop')).toHaveCount(0);

    // Appen lover ikke én gruppe pr. emne — motoren siger, hvad der sker.
    await expect(dialog).not.toContainText('mindst 5 grupper');
    await expect(dialog).toContainText('Der er 5 emner, men kun 2 grupper');

    await generateGroups(page);
    await expect(page.locator('.group-card')).toHaveCount(2);
});

// Matrixgrupper dannes PÅ TVÆRS af stamgrupperne. Tilføjer læreren en elev
// mens hun står i matrixvisningen, placerer modalen kun i matrixen — eleven
// har så ingen stamgruppe, står uden oprindelses-mærke på matrixkortet, og
// i stamgruppe-visningen står hun slet ikke. Det skal siges højt.
test('En elev tilføjet i matrixvisningen får besked om at hun mangler en stamgruppe', async ({ page }) => {
    await createClass(page, 'Matrix efternøler');
    await goToGroups(page);
    await generateGroups(page);

    // Marker David fraværende og dan matrixen uden ham.
    await setAbsent(page, 'David');
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await goToMatrix(page);
    await generateGroups(page);

    // Tag ham også ud af stamgruppen, så han står helt uden.
    await page.evaluate(() => {
        const st = (window as any).appDebug.state;
        const id = st.currentClass.data.find((r: any) => r.Navn === 'David')._rowId;
        (st.storedStandardGroups || []).forEach((g: any) => {
            const i = g.members.findIndex((m: any) => (typeof m === 'object' ? m.id : m) === id);
            if (i > -1) g.members.splice(i, 1);
        });
    });

    await addLatecomer(page, 'David');

    await expect(page.getByText(/i ingen stamgruppe/)).toBeVisible({ timeout: 10000 });
});

// Emnenavne er nøgler i et opslag, og læreren bestemmer dem. Et almindeligt
// `{}` arver constructor/toString/valueOf fra Object, så `if (!topicCounts[key])`
// svarede med en arvet funktion i stedet for undefined: nulstillingen blev
// sprunget over, `+=` lagde tallet oven på funktionens tekst, og Math.min() på
// den blanding er NaN. Forhåndsvisningen lovede altså "NaN grupper". Målt i
// browseren 31/8 — med `{}` fejler denne test.
test('et emne der hedder som et Object-felt giver ikke NaN i matrix-forhåndsvisningen', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Emne Proto');
    await generateGroups(page);

    await page.evaluate(() => {
        const s: any = (window as any).appDebug.state;
        s.currentClass.topics = ['constructor', 'Klima'];
        (s.storedStandardGroups || []).forEach((g: any, i: number) => {
            g.topic = i % 2 === 0 ? 'constructor' : 'Klima';
        });
    });

    await goToMatrix(page);
    const dialog = page.locator('dialog.recipe-dialog[open]');
    await expect(dialog.locator('.recipe__note')).toContainText(/\d+ matrixgrupper/);
    await expect(dialog).not.toContainText('NaN');
});
