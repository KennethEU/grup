// api_adapter.js
// Opfanger fetch-kald til /api/ og svarer via pyBridge (klasserne i
// localStorage), som om der var en backend. Der er ingen server: alt bliver
// i browseren.
//
// (Indtil 3/11 2026 lå gruppedannelsen her også, som job til den gamle
// Python-motor: /api/generate_groups og /api/jobs/<id>. Grupperne dannes nu
// af nextEngine.js direkte.)

import { pyBridge } from './py_bridge.js';

let isInitialized = false;

export function initApiAdapter() {
    if (isInitialized) return;
    isInitialized = true;

    const originalFetch = window.fetch;

    // Det absolutte /api/-præfiks regnes ud én gang, så hver ikke-API-fetch
    // (Vite-chunks, skrifttyper) kun koster et tjek på starten af strengen
    // i stedet for new URL() + pathname.
    const apiAbsolutePrefix = window.location.origin + '/api/';

    function isApiUrl(urlString) {
        // Hurtig vej: de fleste fetches er enten absolutte (https://...) eller
        // app-relative (/api/...). Spring URL-konstruktøren over, når
        // strengen tydeligt ikke peger på /api/.
        if (urlString.startsWith('/api/')) return true;
        if (urlString.startsWith(apiAbsolutePrefix)) return true;
        // Relativ uden foranstillet skråstreg (sjælden) går videre til
        // URL-tolkning, så svaret stadig er rigtigt.
        if (urlString.startsWith('http://') || urlString.startsWith('https://')) {
            // Absolut til en anden oprindelse — er helt sikkert ikke /api/.
            return false;
        }
        try {
            const u = new URL(urlString, window.location.origin);
            return u.pathname.startsWith('/api/');
        } catch (e) {
            return false;
        }
    }

    window.fetch = async (input, init) => {
        // Find URL-strengen sikkert (billigt — kun strengoperationer)
        let urlString;
        if (typeof input === 'string') {
            urlString = input;
        } else if (input instanceof Request) {
            urlString = input.url;
        } else if (input instanceof URL) {
            urlString = input.toString();
        } else {
            urlString = String(input);
        }

        // Hurtigt forfilter: ikke-API-adresser sendes direkte videre uden
        // parsing. Før kørte new URL() for
        // hver eneste Vite-chunk, skrifttype og billede.
        if (!isApiUrl(urlString)) {
            return originalFetch(input, init);
        }

        const jsonResponse = (data, status = 200) => {
            return new Response(JSON.stringify(data), {
                status: status,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        // Find stien til routingen
        let pathname;
        try {
            const u = new URL(urlString, window.location.origin);
            pathname = u.pathname;
        } catch (e) {
            pathname = urlString; // reserve
        }

        // Lav options, hvis input var et Request
        const options = init || {};
        if (input instanceof Request) {
            if (!options.method) options.method = input.method;
            // Bemærk: at læse body fra et Request er asynkront (input.text()).
            // Appen sender altid eksplicitte strenge i 'init', så options bruges
            // reelt kun til metodetjek. Begynder appen at sende POST som
            // Request-objekter til /api/, skal det her udvides.
        }

        if (import.meta.env.DEV) console.log(`[Adapter] Intercepted ${options.method || 'GET'} ${pathname}`);

        // Routingen herunder bruger pathname
        const url = pathname;

        try {
                // 1. GET /api/classes
                if (url === '/api/classes' && (!options.method || options.method === 'GET')) {
                    const classes = pyBridge.getClasses();
                    const summary = classes.map(c => ({
                        filename: c.filename,
                        name: c.name || c.filename,
                        last_modified: c.last_modified
                    }));
                    return jsonResponse(summary);
                }

                // 2. POST /api/classes (Upload) — FJERNET 2026-08-25.
                //    Ruten havde ingen kaldere, og den skrev klassen forkert
                //    i lageret. Al import går gennem /api/classes/paste →
                //    pyBridge.createClass(). Se py_bridge.js, hvor
                //    saveClass() lå, for den fulde begrundelse.

                // 3. GET /api/classes/<filename>
                if (url.startsWith('/api/classes/') && (!options.method || options.method === 'GET')) {
                    const filename = decodeURIComponent(url.split('/').pop());
                    const cls = pyBridge.getClass(filename);

                    if (!cls) return jsonResponse({ error: 'Class not found' }, 404);

                    // Flad struktur, som frontenden forventer
                    // Lager: { filename, content: { data, rules... } }
                    // Frontend: { filename, data, rules... }
                    const flattened = {
                        filename: cls.filename,
                        name: cls.name,
                        last_modified: cls.last_modified,
                        ...cls.content // indholdet (data, regler osv.) lægges på øverste niveau
                    };
                    return jsonResponse(flattened);
                }

                // 4. DELETE /api/classes/<filename>
                if (url.startsWith('/api/classes/') && options.method === 'DELETE') {
                    const filename = decodeURIComponent(url.split('/').pop());
                    // Videregiv resultatet som-det-er ({success:true} ELLER
                    // {error}) — pakket ind i endnu et {success:…} ville et
                    // fejl-objekt blive sandt, og kalderen ville tro at
                    // klassen var slettet.
                    return jsonResponse(pyBridge.deleteClass(filename));
                }

                // 5. POST /api/classes/paste
                if (url === '/api/classes/paste' && options.method === 'POST') {
                    const body = JSON.parse(options.body);
                    const hasHeaders = body.has_headers !== false; // standard: ja
                    const result = pyBridge.createClass(body.name, body.content, hasHeaders);
                    return jsonResponse(result);
                }

                // 6. PUT /api/classes/<filename> (Save Data)
                if (url.startsWith('/api/classes/') && options.method === 'PUT') {
                    const filename = decodeURIComponent(url.split('/').pop());
                    const body = JSON.parse(options.body);

                    // PyBridge.updateClass tager hvert felt for sig
                    const result = pyBridge.updateClass(
                        filename,
                        body.data,
                        body.rules,
                        body.id_column,
                        body.separations,
                        body.settings,
                        body.matrixSettings || {},
                        body.matrixRules || [],
                        body.topics || [],          // emner på klasseniveau
                        body.columnOrders || {},    // Rangering af tekstkolonner
                        // Kun gendannelse fra backup må oprette en klasse her
                        // — og kun den sender et navn med.
                        {
                            allowCreate: body.allowCreate === true,
                            name: typeof body.name === 'string' ? body.name : undefined,
                            togetherGroups: body.togetherGroups,
                            hiddenColumns: body.hiddenColumns
                        }
                    );

                    return jsonResponse(result);
                }

                // 6b. POST /api/classes/<filename>/rename
                if (url.endsWith('/rename') && options.method === 'POST') {
                    const parts = url.split('/');
                    const filename = decodeURIComponent(parts[parts.length - 2]);
                    const body = JSON.parse(options.body);

                    const result = pyBridge.renameClass(filename, body.name);

                    if (result.error) return jsonResponse(result, 400);
                    return jsonResponse(result);
                }

                return jsonResponse({ error: 'Unknown API Route: ' + url }, 404);

        } catch (adapterErr) {
            console.error("[Adapter] Unexpected error:", adapterErr);
            return jsonResponse({ error: 'Intern fejl: ' + adapterErr.message }, 500);
        }
    };

    if (import.meta.env.DEV) console.log("[Adapter] API Adapter Loaded. Hijacking fetch.");
}
