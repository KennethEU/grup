import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

// Et tryk der starter i et felt og slippes på det slørede overlay (man trækker
// for at markere tekst og overskyder) er IKKE et klik udenfor. Browseren sender
// klikket til overlayet, og vinduet lukkede med det indtastede. Nu tæller kun et
// tryk der både starter og slutter på overlayet (useModalFocus → onBackdropClick).
test('at trække ud af et felt lukker ikke vinduet — et rigtigt klik udenfor gør', async ({ page }) => {
    await createClass(page, 'Traek Udenfor');

    await page.locator('#add-col-btn').click();
    const heading = page.getByRole('heading', { name: 'Ny kolonne' });
    await expect(heading).toBeVisible();

    const input = page.locator('.modal-overlay input[type="text"]');
    await input.fill('Runde 2');
    const box = (await input.boundingBox())!;

    // Ned i feltet, op på overlayet (øverste venstre hjørne er altid overlay).
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(5, 5);
    await page.mouse.up();
    await expect(heading).toBeVisible();
    await expect(input).toHaveValue('Runde 2');

    // Et almindeligt klik på overlayet lukker stadig.
    await page.mouse.click(5, 5);
    await expect(heading).toBeHidden();
});
