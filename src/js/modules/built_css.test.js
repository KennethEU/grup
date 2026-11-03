// @vitest-environment node
// Det BYGGEDE stilark i public/grupper/assets/ — det, lærerne faktisk henter.
//
// Kilden kan være fin, mens bygget ikke er: minifieren skriver om efter de
// browsere, den får at vide (cssTarget i vite.config.js). Uden målet blev
// `max-width` til range-syntaks, som Safari før 16.4 ikke forstår, og
// `backdrop-filter` stod uden det `-webkit-`, Safari kræver før 18.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../../../../public/grupper/assets/', import.meta.url);
const sheets = readdirSync(dir)
    .filter(name => name.endsWith('.css'))
    .map(name => ({ name, css: readFileSync(new URL(name, dir), 'utf8') }));

describe('de byggede stylesheets', () => {
    it('findes', () => {
        expect(sheets.length).toBeGreaterThan(0);
    });

    it.each(sheets.map(s => [s.name, s.css]))('%s has no media range syntax', (_name, css) => {
        // (width<=640px), (width < 1100px), (400px <= width) …
        expect(css).not.toMatch(/@media[^{]*\(\s*[\d.]*\w*\s*[<>]=?\s*(width|height)|@media[^{]*\((width|height)\s*[<>]/);
    });

    it.each(sheets.map(s => [s.name, s.css]))('%s pairs every backdrop-filter with -webkit-', (_name, css) => {
        const plain = css.match(/(?<![-\w])backdrop-filter:/g) || [];
        const prefixed = css.match(/-webkit-backdrop-filter:/g) || [];
        expect(prefixed.length).toBe(plain.length);
    });
});
