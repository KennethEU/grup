import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "Tilføj efternøler" og Skal sammen-aftaler (fund 23/9).
//
// Vinduet advarede om en brudt aftale for hver partner, der ikke stod i
// målgruppen — også en SLETTET partner (som ingen gruppe har) og en partner,
// der blev placeret lige efter i samme tryk. Læreren fik "OBS — en aftale
// kunne ikke overholdes … (uden navn)", mens eleverne sad præcis rigtigt.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.setTimeout(120000);

async function setAbsent(page: Page, names: string[]) {
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    for (const name of names) {
        const row = page.locator('tr').filter({ hasText: name });
        await row.locator('.cell-checkbox input').nth(1).uncheck();
    }
}

async function addLatecomers(page: Page, names: string[]) {
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    // En besked kan nå at forsvinde af sig selv, mens løkken lukker de andre.
    for (const close of await page.locator('.toast .toast-close').all()) await close.click({ timeout: 2000 }).catch(() => {});
    await page.getByRole('button', { name: 'Tilføj efternøler' }).click();
    for (const name of names) {
        await page.locator('.student-item').filter({ hasText: name })
            .locator('input[type="checkbox"]').check();
    }
    await page.locator('.btn-confirm').click();
}

/** Aftalerne sættes direkte — det er placeringen, ikke oprettelsen, vi tester. */
async function setTogether(page: Page, groups: Array<Array<string>>) {
    await page.evaluate((groups) => {
        const state = (window as any).appDebug.state;
        const idOf = (name: string) =>
            state.currentClass.data.find((s: any) => s.Navn === name)?._rowId ?? name;
        state.currentClass.togetherGroups = groups.map(names => ({ ids: names.map(idOf) }));
    }, groups);
}

const sameCard = (page: Page, a: string, b: string) =>
    page.locator('.group-card').filter({ hasText: a }).filter({ hasText: b });

test('En slettet partner i aftalen giver ingen falsk advarsel', async ({ page }) => {
    await createClass(page, 'Efternøler slettet partner');
    // Anna+Bo og Bo+Clara, hvor Bo er slettet: Anna og Clara skal stadig
    // sammen (togetherComponents), men Bo sidder ingen steder.
    const ghost = 'r-00000000000000000000000000000000';
    await setTogether(page, [['Anna', ghost], [ghost, 'Clara']]);
    await goToGroups(page);
    await generateGroups(page);
    await expect(sameCard(page, 'Anna', 'Clara')).toHaveCount(1);

    await setAbsent(page, ['Anna']);
    await addLatecomers(page, ['Anna']);

    await expect(page.locator('.toast').filter({ hasText: 'Tilføjet' })).toHaveCount(1);
    await expect(sameCard(page, 'Anna', 'Clara')).toHaveCount(1);
    await expect(page.locator('.toast').filter({ hasText: 'kunne ikke overholdes' })).toHaveCount(0);
});

test('To partnere tilføjet i samme tryk ender sammen uden advarsel', async ({ page }) => {
    await createClass(page, 'Efternøler to partnere');
    await setTogether(page, [['Anna', 'Clara']]);
    // Begge væk FØR grupperne dannes — så står ingen af dem i en gruppe.
    await setAbsent(page, ['Anna', 'Clara']);
    await goToGroups(page);
    await generateGroups(page);
    await expect(page.locator('.group-members-list li').filter({ hasText: 'Anna' })).toHaveCount(0);

    await addLatecomers(page, ['Anna', 'Clara']);

    await expect(page.locator('.toast').filter({ hasText: 'Tilføjet' })).toHaveCount(1);
    await expect(sameCard(page, 'Anna', 'Clara')).toHaveCount(1);
    await expect(page.locator('.toast').filter({ hasText: 'kunne ikke overholdes' })).toHaveCount(0);
});

test('En partner i en låst gruppe giver stadig advarslen', async ({ page }) => {
    await createClass(page, 'Efternøler låst partner');
    await setTogether(page, [['Anna', 'Clara']]);
    await goToGroups(page);
    await generateGroups(page);
    // Lås Claras gruppe, og meld Anna fraværende og ud af sin gruppe.
    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const idOf = (name: string) => state.currentClass.data.find((s: any) => s.Navn === name)._rowId;
        const anna = idOf('Anna');
        const clara = idOf('Clara');
        state.storedStandardGroups.forEach((g: any) => {
            g.members = g.members.filter((m: any) => String(m?.id ?? m) !== anna);
            if (g.members.some((m: any) => String(m?.id ?? m) === clara)) g.locked = true;
        });
    });
    await setAbsent(page, ['Anna']);
    await addLatecomers(page, ['Anna']);

    await expect(page.locator('.toast').filter({ hasText: 'kunne ikke overholdes' }))
        .toContainText('Anna skulle sammen med Clara');
});

// 108. gennemsyn (13/11 2026): en Adskil-regel, der må brydes, gav ingen
// advarsel — placeringen vejer den som en undgåelse, men vinduet advarede kun
// om undgåelser og aftaler. Her er kun én gruppe ulåst, og den har allerede
// en ordstyrer, så Anna (også ordstyrer) MÅ sættes dér.
test('En Adskil-regel, der må brydes, giver en advarsel', async ({ page }) => {
    await createClass(page, 'Efternøler adskil');
    await goToGroups(page);
    await generateGroups(page);
    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const cls = state.currentClass;
        const idOf = (name: string) => cls.data.find((s: any) => s.Navn === name)._rowId;
        const anna = idOf('Anna');
        // Anna ud af sin gruppe; den første ANDEN gruppe er den eneste ulåste.
        state.storedStandardGroups.forEach((g: any) => {
            g.members = g.members.filter((m: any) => String(m?.id ?? m) !== anna);
        });
        const open = state.storedStandardGroups.find((g: any) => g.members.length > 0);
        state.storedStandardGroups.forEach((g: any) => { g.locked = g !== open; });
        const mate = String(open.members[0]?.id ?? open.members[0]);
        cls.data.forEach((s: any) => {
            s.Rolle = (s._rowId === anna || s._rowId === mate) ? 'Ordstyrer' : 'Referent';
        });
        cls.rules = [{ type: 'strict_separate', column: 'Rolle', values: ['Ordstyrer'] }];
    });
    await setAbsent(page, ['Anna']);
    await addLatecomers(page, ['Anna']);

    await expect(page.locator('.toast').filter({ hasText: 'Tilføjet' })).toHaveCount(1);
    await expect(page.locator('.toast').filter({ hasText: 'kunne ikke overholdes' }))
        .toContainText('"Adskil altid" på "Rolle"');
});
