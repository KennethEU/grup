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

// 127. gennemsyn (14/11 2026): en brudt "Opdel" gav ingen advarsel. Her er
// kun én gruppe ulåst, og alle i den er på hold B, mens Anna er på hold A —
// så Anna MÅ sættes dér, og læreren skal have det at vide.
test('En Opdel-regel, der må brydes, giver en advarsel', async ({ page }) => {
    await createClass(page, 'Efternøler opdel');
    await goToGroups(page);
    await generateGroups(page);
    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const cls = state.currentClass;
        const anna = cls.data.find((s: any) => s.Navn === 'Anna')._rowId;
        state.storedStandardGroups.forEach((g: any) => {
            g.members = g.members.filter((m: any) => String(m?.id ?? m) !== anna);
        });
        const open = state.storedStandardGroups.find((g: any) => g.members.length > 0);
        state.storedStandardGroups.forEach((g: any) => { g.locked = g !== open; });
        cls.data.forEach((s: any) => { s.Hold = s._rowId === anna ? 'A' : 'B'; });
        cls.rules = [{ type: 'aggregate', column: 'Hold' }];
    });
    await setAbsent(page, ['Anna']);
    await addLatecomers(page, ['Anna']);

    await expect(page.locator('.toast').filter({ hasText: 'Tilføjet' })).toHaveCount(1);
    await expect(page.locator('.toast').filter({ hasText: 'kunne ikke overholdes' }))
        .toContainText('"Opdel" på "Hold"');
});

// 128. gennemsyn (14/11 2026): en fraværende, der er meldt væk med fluebenet,
// står stadig i sin gruppe. Kom to fraværende fra hver sin (lige store)
// gruppe tilbage i samme tryk, trak placeringen lod mellem deres to grupper,
// og halvdelen af gangene byttede de plads. Fire runder, så det gamle er rødt
// med 15/16 sandsynlighed.
test('To fraværende, der kommer tilbage, bliver i hver deres gruppe', async ({ page }) => {
    await createClass(page, 'Efternøler bliver');
    await goToGroups(page);
    await generateGroups(page);
    const pair = await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const cls = state.currentClass;
        const groups = state.storedStandardGroups;
        const nameOf = (m: any) => cls.data.find((s: any) => s._rowId === String(m?.id ?? m))?.Navn;
        for (let i = 0; i < groups.length; i++) {
            for (let j = i + 1; j < groups.length; j++) {
                if (groups[i].members.length === groups[j].members.length) {
                    return [
                        { name: nameOf(groups[i].members[0]), group: groups[i].name },
                        { name: nameOf(groups[j].members[0]), group: groups[j].name },
                    ];
                }
            }
        }
        return null;
    });
    expect(pair).not.toBeNull();
    const names = pair!.map(p => p.name);

    for (let round = 0; round < 4; round++) {
        await setAbsent(page, names);
        await addLatecomers(page, names);
        await expect(page.locator('.toast').filter({ hasText: 'Tilføjet' }).last())
            .toContainText(`${names[0]} bliver i`);
        const now = await page.evaluate((names) => {
            const state = (window as any).appDebug.state;
            const cls = state.currentClass;
            return names.map((n: string) => {
                const id = cls.data.find((s: any) => s.Navn === n)._rowId;
                return state.storedStandardGroups.find((g: any) =>
                    g.members.some((m: any) => String(m?.id ?? m) === id))?.name;
            });
        }, names);
        expect(now).toEqual(pair!.map(p => p.group));
        for (const close of await page.locator('.toast .toast-close').all()) await close.click({ timeout: 2000 }).catch(() => {});
    }
});

// 128. gennemsyn: trækker en "Skal sammen"-aftale eleven over på det andet
// hold, siger advarslen det — før stod der "der var ingen bedre plads",
// selvom der var plads på elevens eget hold.
test('En aftale, der trækker over Opdel, nævnes i advarslen', async ({ page }) => {
    await createClass(page, 'Efternøler aftale opdel');
    await goToGroups(page);
    await generateGroups(page);
    const partner = await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const cls = state.currentClass;
        const anna = cls.data.find((s: any) => s.Navn === 'Anna')._rowId;
        state.storedStandardGroups.forEach((g: any) => {
            g.members = g.members.filter((m: any) => String(m?.id ?? m) !== anna);
            g.locked = false;
        });
        // Den første gruppe er hold B, resten (og Anna) hold A.
        const bGroup = state.storedStandardGroups.find((g: any) => g.members.length > 0);
        const bIds = new Set(bGroup.members.map((m: any) => String(m?.id ?? m)));
        cls.data.forEach((s: any) => { s.Hold = bIds.has(s._rowId) ? 'B' : 'A'; });
        cls.rules = [{ type: 'aggregate', column: 'Hold' }];
        const mate = [...bIds][0];
        cls.togetherGroups = [{ ids: [anna, mate] }];
        return cls.data.find((s: any) => s._rowId === mate).Navn;
    });
    await setAbsent(page, ['Anna']);
    await addLatecomers(page, ['Anna']);

    await expect(sameCard(page, 'Anna', partner)).toHaveCount(1);
    await expect(page.locator('.toast').filter({ hasText: 'kunne ikke overholdes' }))
        .toContainText('"Skal sammen"-aftale vejer tungere');
});
