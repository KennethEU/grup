import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

// "Kategoriser" må ikke dele lærerens egen værdi op.
//
// Værdierne blev før skrevet i ét fritekstfelt med kommaer imellem, og
// apply() delte dem på komma. En celleværdi der SELV indeholder et komma —
// den danske decimalkarakter "7,5", et efternavn først ("Hansen, Bo"), et
// svar som "Ja, med støtte" — blev derfor til to værdier, der ingen af dem
// findes i klassen. Kolonnen blev fyldt med "Andet", og intet sagde hvorfor.
//
// Nu vælges værdierne blandt dem, der faktisk står i kolonnen.
const CSV =
    'Navn\tSnit\n' +
    'Anna\t7,5\nBob\t7,5\nClara\t2,5\nDavid\t2,5';

test('Kategoriser rammer en værdi med komma i', async ({ page }) => {
    await createClass(page, 'Kategori-komma E2E', CSV);

    await page.locator('#cat-btn').click();
    await expect(page.getByRole('heading', { name: 'Kategorisér Data' })).toBeVisible();

    await page.locator('#kat-kilde').selectOption('Snit');

    // Værdien står som ÉN mærkat — ikke som "7" og "5".
    const chips = page.locator('.value-chip');
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toHaveText('2,5');
    await expect(chips.nth(1)).toHaveText('7,5');

    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');

    // Den samme værdi kan ikke bruges i to regler.
    await page.locator('.btn.dashed').click();
    const secondRow = page.locator('.mapping-row').nth(1);
    await expect(secondRow.locator('.value-chip').nth(1)).toBeDisabled();

    await page.locator('#kat-navn').fill('Niveau');
    await page.locator('.map-input.label').first().fill('Høj');
    await page.getByRole('button', { name: 'Opret kolonne' }).click();

    // 7,5 rammer "Høj"; 2,5 er ikke valgt og bliver "Andet".
    await expect(page.locator('th').filter({ hasText: 'Niveau' })).toBeVisible();
    const values = await page.evaluate(() =>
        ((window as any).appDebug?.state?.currentClass?.data || []).map((r: any) => r.Niveau));
    expect(values).toEqual(['Høj', 'Høj', 'Andet', 'Andet']);
});

// En tom celle er "ikke udfyldt", ikke en kategori (invariant i
// docs/grupper.md). "Kategoriser" gjorde den til "Andet" — og så samlede
// Fordel og Klyng eleverne uden værdi, som var "Andet" et rigtigt svar.
test('Kategoriser lader en tom celle være tom', async ({ page }) => {
    await createClass(page, 'Kategori-tom E2E',
        'Navn\tSnit\nAnna\t7,5\nBob\t\nClara\t2,5');

    await page.locator('#cat-btn').click();
    await page.locator('#kat-kilde').selectOption('Snit');
    await page.locator('.value-chip').filter({ hasText: '7,5' }).click();
    await page.locator('#kat-navn').fill('Niveau');
    await page.locator('.map-input.label').first().fill('Høj');
    await page.getByRole('button', { name: 'Opret kolonne' }).click();

    await expect(page.locator('th').filter({ hasText: 'Niveau' })).toBeVisible();
    const values = await page.evaluate(() =>
        ((window as any).appDebug?.state?.currentClass?.data || []).map((r: any) => r.Niveau));
    expect(values).toEqual(['Høj', '', 'Andet']);
});

// Værdier klikket, men kategoriens navn glemt: rækken blev sprunget stille
// over, og HELE kolonnen blev "Andet" med "oprettet!" som kvittering.
test('Kategoriser siger fra, når en regel mangler sit navn', async ({ page }) => {
    await createClass(page, 'Kategori-navn E2E',
        'Navn\tSnit\nAnna\t7,5\nBob\t2,5');

    await page.locator('#cat-btn').click();
    await page.locator('#kat-kilde').selectOption('Snit');
    await page.locator('.value-chip').filter({ hasText: '7,5' }).click();
    await page.locator('#kat-navn').fill('Niveau');
    await page.getByRole('button', { name: 'Opret kolonne' }).click();

    // Vinduet bliver stående, beskeden forklarer, og kolonnen findes ikke.
    await expect(page.getByText('Regel 1 mangler et navn på kategorien')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Kategorisér Data' })).toBeVisible();
    const columns = await page.evaluate(() =>
        (window as any).appDebug?.state?.currentClass?.columns || []);
    expect(columns).not.toContain('Niveau');
});
