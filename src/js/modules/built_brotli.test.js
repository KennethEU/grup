// @vitest-environment node
// Det BYGGEDE program: passer .br-filerne til de rå filer ved siden af?
//
// routes/grupper-assets.js sender .br-filen til enhver browser, der tager
// brotli — uden at se på den rå fil. Var en .br-fil fra et ældre build blevet
// liggende, eller kom den ene halvdel af et build ikke med i committen, ville
// browseren få et andet program end det, filnavnet lover. Og manglede
// .br-filerne helt (fx efter `vite build --outDir …`, før 4/11 2026), gik det
// bare langsommere, uden at nogen opdagede det.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

const dir = new URL('../../../../public/grupper/assets/', import.meta.url);
const files = readdirSync(dir);
const names = new Set(files);
// Samme grænse som MIN_BYTES i vite.config.js
const MIN_BYTES = 10_000;
const raw = files.filter(name => /\.(js|css)$/.test(name));
const packed = files.filter(name => name.endsWith('.br'));

describe('brotli-filerne i det byggede program', () => {
    it('hver stor JS- og CSS-fil har en .br-fil', () => {
        const big = raw.filter(name => readFileSync(new URL(name, dir)).length >= MIN_BYTES);
        // Motorens to trådfiler er blandt dem — de hentes ved hver gruppedannelse.
        expect(big.some(name => /^engine-worker-/.test(name))).toBe(true);
        expect(big.some(name => /^worker-/.test(name))).toBe(true);
        for (const name of big) expect(names.has(name + '.br'), name).toBe(true);
    });

    it.each(packed)('%s pakker præcis den rå fil ud', (name) => {
        const original = name.slice(0, -'.br'.length);
        expect(names.has(original), `${original} mangler`).toBe(true);
        const unpacked = brotliDecompressSync(readFileSync(new URL(name, dir)));
        expect(unpacked.equals(readFileSync(new URL(original, dir)))).toBe(true);
    });
});
