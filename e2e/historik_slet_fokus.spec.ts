import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HISTORIK MED TASTATUR (167. gennemsyn, tematik 195).
//
// Efter "Slet" forsvandt rækken og med den den knap, vinduet gav fokus
// tilbage til. Fokus stod så på <body>, og med tastatur eller skærmlæser
// begyndte læreren forfra øverst på siden. Bekræftelsen sagde kun "denne
// session", mens vinduet dækkede listen. Nu nævnes sessionen ved navn, og
// fokus lander på slet-knappen i den række, der rykker op.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function seedSessions(page, names: string[], { withPayload = true } = {}) {
    const file = await page.evaluate(() => (window as any).appDebug.state.currentClass.filename);
    await page.evaluate(({ filename, names, withPayload }) => {
        // Nyeste først i tabellen: den første i `names` får den nyeste dato.
        const entries = names.map((name, i) => ({
            id: `s${i}`, name, date: new Date(Date.now() - i * 3600000).toISOString(),
            type: 'STANDARD_ONLY', stats: { groupCount: 1, matrixCount: 0 },
        }));
        if (withPayload) {
            for (const e of entries) {
                localStorage.setItem(`grupdk_session_${e.id}`, JSON.stringify({
                    ...e, groups: [{ name: 'Gruppe 1', members: [] }], matrixGroups: [], activeRules: [],
                }));
            }
        }
        localStorage.setItem(`grupdk_history_${filename}`, JSON.stringify([...entries].reverse()));
    }, { filename: file, names, withPayload });
}

const focusedLabel = (page) => page.evaluate(() =>
    document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.id ?? document.activeElement?.tagName);

test('efter Slet står fokus på rækken, der rykker op — og bekræftelsen nævner sessionen', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await createClass(page, '7h');
    await seedSessions(page, ['Mandag', 'Tirsdag', 'Onsdag']);
    await page.locator('.nav-tab').filter({ hasText: 'Historik' }).click();

    const slet = (name: string) => page.getByRole('button', { name: `Slet ${name}`, exact: true });
    const confirm = async (name: string) => {
        const dialog = page.locator('.modal-overlay[role="dialog"]').filter({ hasText: 'Slet session' });
        await expect(dialog).toContainText(`"${name}"`);
        await dialog.getByRole('button', { name: 'Slet', exact: true }).click();
        await expect(dialog).toHaveCount(0);
    };

    // Midterste række: den under rykker op.
    await slet('Tirsdag').focus();
    await page.keyboard.press('Enter');
    await confirm('Tirsdag');
    await expect(slet('Tirsdag')).toHaveCount(0);
    await expect.poll(() => focusedLabel(page)).toBe('Slet Onsdag');

    // Nederste række: fokus går til den, der nu er nederst.
    await page.keyboard.press('Enter');
    await confirm('Onsdag');
    await expect.poll(() => focusedLabel(page)).toBe('Slet Mandag');

    // Den sidste: listen selv får fokus.
    await page.keyboard.press('Enter');
    await confirm('Mandag');
    await expect(page.getByText('Ingen gemte sessioner')).toBeVisible();
    await expect.poll(() => focusedLabel(page)).toBe('history-list-view');
    expect(errors).toEqual([]);
});

test('en session, der ikke kan læses, kan forhåndsvises, men ikke gendannes derfra', async ({ page }) => {
    await createClass(page, '7i');
    await seedSessions(page, ['Uden indhold'], { withPayload: false });
    await page.locator('.nav-tab').filter({ hasText: 'Historik' }).click();
    await page.getByRole('button', { name: 'Forhåndsvis Uden indhold' }).click();
    const dialog = page.locator('.modal-overlay[role="dialog"]').filter({ hasText: 'Forhåndsvisning' });
    await expect(dialog).toContainText('Kunne ikke indlæse sessionen.');
    await expect(dialog.getByRole('button', { name: 'Gendan denne session' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Luk', exact: true }).last()).toBeVisible();
});
