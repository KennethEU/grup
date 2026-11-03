import { test, expect } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups } from './helpers';

// Låsen på et gruppekort er lærerens beslutning om, at netop DEN gruppe skal
// stå stille. Hele kortet retter sig efter den: eleverne kan ikke trækkes ud,
// kan ikke markeres, "Flyt hertil" vises ikke, og emnegrebet er skjult.
//
// Sletningen var det ene sted, låsen ikke gjaldt. En tom gruppe er ikke
// ligegyldig — den er en plads, læreren har sat af (til en efternøler, eller
// som den ekstra gruppe genereringen skal regne med: `neededNewGroups =
// totalTarget - lockedGroups.length`). "Slet gruppe?" tog den uden at spørge.
//
// BEMÆRK locatoren: kortet slås op på `data-group-id`, ikke på sin tekst.
// "Slet gruppe?" er PRÆCIS det, der skal forsvinde, så en tekst-filtrering
// ville miste kortet i det øjeblik, rettelsen virker.
//
// Selve reglen — at deleteGroup() siger fra — står i groupActions.test.js.
// Her prøves affordancen: at knappen slet ikke er der at trykke på.

test('En låst gruppe kan ikke slettes, heller ikke når den er tom', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Lock E2E');
    await generateGroups(page);

    const cards = page.locator('.group-card');
    const countBefore = await cards.count();

    // Tilføj en tom gruppe — den er tom, og har derfor "Slet gruppe?" på sig.
    await page.locator('.action-pill.icon-only[title="Tilføj gruppe"]').click();
    await expect(cards).toHaveCount(countBefore + 1);

    const emptyId = await cards.last().getAttribute('data-group-id');
    const emptyCard = page.locator(`.group-card[data-group-id="${emptyId}"]`);
    await expect(emptyCard.locator('.delete-group-btn')).toBeVisible();

    // Lås den. Nu skal sletteknappen være væk.
    await emptyCard.locator('.lock-btn').click();
    await expect(emptyCard).toHaveAttribute('data-locked', 'true');
    await expect(emptyCard.locator('.delete-group-btn')).toHaveCount(0);
    await expect(cards).toHaveCount(countBefore + 1);

    // Lås op igen — så må den gerne slettes.
    await emptyCard.locator('.lock-btn').click();
    await expect(emptyCard).toHaveAttribute('data-locked', 'false');
    await emptyCard.locator('.delete-group-btn').click();
    await expect(cards).toHaveCount(countBefore);
});
