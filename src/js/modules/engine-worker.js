// engine-worker.js — den nye motors egen tråd.
//
// Hører til appen, ikke til motoren: den pakker motorens engine.js
// (grup.dk/motor/engine/) ind, så motoren kan regne i ro uden at fryse
// skærmen. Ændres noget i motor/engine, skal motorens egne tests og dommeren
// bestå (npm run test:motor — se docs/grupper.md).
//
//   ind:  { type: 'run', input }     dan grupper
//         { type: 'cancel' }         læreren trykkede Stop
//         { type: 'check', id, input }  opskriftens advarsler (motorens check())
//   ud:   { type: 'checked', id, answer }  svaret på 'check' (null, hvis den kastede)
//         { type: 'progress', progress }
//         { type: 'answer', answer } også efter Stop: så er status "stopped"
//                                    med den foreløbig bedste deling
//         { type: 'crash', message } motoren kastede en fejl, eller den taler
//                                    en anden kontraktversion end appen
//
// Selve tidsgrænsen og Stop ligger i js/modules/nextEngine.js.
//
// check() kører OGSÅ her og ikke på siden: importerer siden selv engine.js,
// skriver Vite 8 ikke motorens indlejrede trådfil (worker-XXXX.js) ud, og
// motoren kører på én kerne (fundet 3/11 2026 — sådan var det fra 50a7ac52).

import { run, check, ENGINE_INFO } from '../../../motor/engine/engine.js';

let cancelled = false;

self.onmessage = async (e) => {
    const msg = e.data || {};
    if (msg.type === 'cancel') {
        // Motoren ser det via isCancelled() og svarer med den bedste indtil nu.
        cancelled = true;
        return;
    }
    if (msg.type === 'check') {
        let answer = null;
        // Ingen advarsler hellere end en død tråd — men fejlen skal kunne ses.
        try { answer = check(msg.input); } catch (err) { console.error('[Gruppemotor] check() kastede:', err); }
        self.postMessage({ type: 'checked', id: msg.id, answer });
        return;
    }
    if (msg.type !== 'run') return;

    if (!ENGINE_INFO || ENGINE_INFO.contractVersion !== (msg.input && msg.input.contractVersion)) {
        self.postMessage({ type: 'crash', message: `Motoren taler kontraktversion ${ENGINE_INFO && ENGINE_INFO.contractVersion}, appen ${msg.input && msg.input.contractVersion}.` });
        return;
    }

    cancelled = false;
    try {
        const answer = await run(msg.input, {
            onProgress: (p) => {
                if (!cancelled) self.postMessage({ type: 'progress', progress: p && p.progress ? p.progress : p });
            },
            isCancelled: () => cancelled,
        });
        self.postMessage({ type: 'answer', answer });
    } catch (err) {
        self.postMessage({ type: 'crash', message: err && err.message ? err.message : String(err) });
    }
};
