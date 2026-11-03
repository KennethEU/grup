import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Kan teksten læses? Målt, ikke vurderet med øjet.
//
// Gennemsynet 24/9 målte hver synlig tekst i begge temaer og fandt
// vejledninger, rangnumre og en knaptekst ("+ Tilføj regel") på 2,5:1 i
// LYST tema — det tema, Grupper starter i. De stod i --text-subtle, som er
// ment til ikoner. I mørkt tema stod den aktive fane og Gem-knappen på 3,6:1.
// Ingen af dem kunne ses i en kodelæsning: farven er et token, og tokenet
// ser fint ud, indtil man regner det ud mod den flade, det står på.
//
// Kravet er WCAG AA: 4,5:1 for almindelig tekst, 3:1 for stor tekst
// (24 px, eller 18,66 px fed).
//
// HVAD DEN IKKE MÅLER — og hvorfor:
//   - slået-fra knapper og felter (WCAG undtager dem)
//   - bevidst nedtonede elementer (opacity < 1): fraværende elever i
//     tabellen er TONET NED for at sige "ikke med i dag"
//   - tekst på en gradient: baggrunden er ikke én farve og kan ikke regnes ud
//   - enkelttegn der ikke er tal ("×", "→"): de er ikoner, og ikoner skal
//     kun nå 3:1 — det gør --text-subtle nu
//   - datoen i Nyheder: docs/grupper.md har valgt at den er "kulisse"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Miss = { el: string; text: string; ratio: number; need: number };

/** Kører i siden: alle synlige tekster, der ligger under kravet. */
const scanPage = () => {
    // Browseren omregner selv hvilken som helst farve (hex, rgb, oklch,
    // color-mix) til sRGB, når den tegner den på et lærred.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (c: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
    };
    const over = (top: number[], below: number[]) => {
        const a = top[3];
        return [0, 1, 2].map(i => top[i] * a + below[i] * (1 - a)).concat(1);
    };
    const lum = (c: number[]) => {
        const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const misses: Miss[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        if (el.closest('svg, script, style, option')) continue;
        const text = [...el.childNodes]
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent!.trim()).join(' ').trim();
        if (!text) continue;
        if (text.length === 1 && !/\d/.test(text)) continue;
        if (el.matches('.news-date, [class*="brand-"]')) continue;
        if (el.closest(':disabled, [aria-disabled="true"]')) continue;
        if (!el.checkVisibility({ visibilityProperty: true })) continue;
        const box = el.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) continue;

        // Baggrunden: læg forældrenes farver oven på hinanden, til en er dækkende.
        let opacity = 1, gradient = false;
        const layers: number[][] = [];
        for (let a: HTMLElement | null = el; a; a = a.parentElement) {
            const s = getComputedStyle(a);
            opacity *= parseFloat(s.opacity);
            if (s.backgroundImage !== 'none' && !s.backgroundImage.startsWith('url(')) gradient = true;
            const bg = rgba(s.backgroundColor);
            if (bg[3] > 0) { layers.push(bg); if (bg[3] >= 1) break; }
        }
        if (opacity < 1 || gradient) continue;
        let bg = [255, 255, 255, 1];
        for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);

        const cs = getComputedStyle(el);
        const fg = over(rgba(cs.color), bg);
        const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        const ratio = (hi + 0.05) / (lo + 0.05);
        const size = parseFloat(cs.fontSize);
        const need = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700) ? 3 : 4.5;
        if (ratio < need) {
            misses.push({
                el: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
                    ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
                text: text.slice(0, 40),
                ratio: Math.round(ratio * 100) / 100,
                need,
            });
        }
    }
    return misses;
};

/** Mål den flade, der står fremme nu. Kun lyst tema: mørk tilstand er fjernet
 *  26/10 2026 og kan ikke længere vælges. */
async function expectReadable(page: Page, surface: string) {
    const misses = await page.evaluate(scanPage);
    expect(misses, `${surface}, lyst tema`).toEqual([]);
}

test('elevlisten og dens vinduer kan læses i begge temaer', async ({ page }) => {
    await createClass(page, 'Kontrast');
    await expectReadable(page, 'Elevliste');

    for (const [id, name] of [['#rank-btn', 'Ranger værdier'], ['#cat-btn', 'Kategorisér'],
                              ['#col-layout-btn', 'Flyt kolonner']]) {
        await page.locator(id).click();
        await expect(page.locator('.modal-overlay')).toBeVisible();
        await expectReadable(page, name);
        await page.keyboard.press('Escape');
        await expect(page.locator('.modal-overlay')).toBeHidden();
    }
});

test('grupperne og nyhederne kan læses i begge temaer', async ({ page }) => {
    await createClass(page, 'Kontrast');
    await goToGroups(page);
    await generateGroups(page);
    await expectReadable(page, 'Grupper');

    await page.getByRole('button', { name: 'Nyheder & opdateringer' }).click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await expectReadable(page, 'Nyheder');
});
