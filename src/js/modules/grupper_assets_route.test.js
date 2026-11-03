// @vitest-environment node
// routes/grupper-assets.js med den rigtige Express, compression-middleware og
// express.static bag sig — præcis rækkefølgen i app.js. Filerne ligger i /tmp.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { request } from 'node:http';
import { brotliCompressSync, brotliDecompressSync, gunzipSync } from 'node:zlib';

const routeURL = new URL('../../../../routes/grupper-assets.js', import.meta.url);
const require = createRequire(routeURL);
const express = require('express');
const compression = require('compression');
const source = readFileSync(routeURL, 'utf8');
const body = Buffer.from('console.log("Grupper");\n'.repeat(400));
const packed = brotliCompressSync(body);
let directory, server, origin;

function fetchAsset(name, headers = {}) {
    // node:http pakker ikke selv ud, så vi ser de bytes der faktisk blev sendt.
    return new Promise((resolve, reject) => {
        const req = request(`${origin}/grupper/assets/${name}`, { headers: { Connection: 'close', ...headers } }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.end();
    });
}

beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'grupper-assets-'));
    const assets = join(directory, 'public/grupper/assets');
    mkdirSync(assets, { recursive: true });
    writeFileSync(join(assets, 'index-abc.js'), body);
    writeFileSync(join(assets, 'index-abc.js.br'), packed);
    // Et build uden pakning, eller en .br der ikke kom med op.
    writeFileSync(join(assets, 'small-abc.js'), body);
    const module = { exports: {} };
    // Kun __dirname erstattes. Routen, Express og filstreamingen er uændrede.
    runInNewContext(source, { require, module, __dirname: join(directory, 'routes'), console });
    const app = express();
    app.use(compression());
    app.use('/grupper/assets', module.exports());
    app.use('/grupper', express.static(join(directory, 'public/grupper')));
    app.use((req, res) => res.status(404).send('404'));
    server = await new Promise((resolve, reject) => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
        listening.on('error', reject);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
});

describe('Grupper-assets: færdigpakket brotli', () => {
    it('sender .br-filen, når browseren tager brotli', async () => {
        const res = await fetchAsset('index-abc.js', { 'Accept-Encoding': 'gzip, deflate, br, zstd' });
        expect(res.status).toBe(200);
        expect(res.headers['content-encoding']).toBe('br');
        expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8');
        expect(res.headers['cache-control']).toContain('immutable');
        expect(res.headers.vary).toContain('Accept-Encoding');
        expect(res.body).toEqual(packed);
    });

    it.each(['gzip', 'br;q=0, gzip'])('falder tilbage til gzip undervejs: %s', async (accepted) => {
        const res = await fetchAsset('index-abc.js', { 'Accept-Encoding': accepted });
        expect(res.status).toBe(200);
        expect(res.headers['content-encoding']).toBe('gzip');
        expect(res.headers.vary).toContain('Accept-Encoding');
        expect(gunzipSync(res.body)).toEqual(body);
    });

    // Mangler .br-filen, tager den almindelige vej over: compression pakker
    // den rå fil undervejs. Brotli-headeren fra routen må ikke hænge ved —
    // så ville en ukomprimeret krop blive sendt som "br", og siden gik i stå.
    it('mangler .br-filen, pakker middlewaren den rå fil undervejs', async () => {
        const res = await fetchAsset('small-abc.js', { 'Accept-Encoding': 'br, gzip' });
        expect(res.status).toBe(200);
        expect(res.headers['content-encoding']).toBe('br');
        expect(brotliDecompressSync(res.body)).toEqual(body);
    });

    it('mangler .br-filen, og browseren vil ingen pakning, kommer den rå fil', async () => {
        const res = await fetchAsset('small-abc.js', { 'Accept-Encoding': 'identity' });
        expect(res.status).toBe(200);
        expect(res.headers['content-encoding']).toBeUndefined();
        expect(res.body).toEqual(body);
    });

    it('en fil der ikke findes, giver en ærlig 404', async () => {
        const res = await fetchAsset('nope-abc.js', { 'Accept-Encoding': 'br' });
        expect(res.status).toBe(404);
        expect(res.headers['content-encoding']).toBeUndefined();
    });
});
