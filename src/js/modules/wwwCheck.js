// wwwCheck.js — ligger der klasser på www.dida.dk?
//
// dida.dk og www.dida.dk er to adresser med hvert sit lager. Mellemsiden på
// www flytter klasserne, når nogen åbner www (se adoptWww.js) — men en lærer,
// der fremover går direkte til dida.dk, kommer aldrig forbi den. Har Grupper
// ingen klasser, spørger forsiden derfor selv: den viser www.dida.dk/flyt-
// send.html i en skjult iframe, og siden svarer med sine Grupper-nøgler.
//
// iframe'en er same-site (dida.dk og www.dida.dk har samme registrerbare
// domæne), så browserne giver den www's rigtige lager — ikke et partitioneret.

export const WWW_ORIGIN = 'https://www.dida.dk';
export const APEX_ORIGIN = 'https://dida.dk';

/**
 * Hent Grupper-nøglerne fra www.dida.dk.
 *
 * Kører KUN på https://dida.dk — lokalt, i tests og på www er der intet at
 * spørge om, og en iframe mod det rigtige websted ville være forkert.
 *
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs]  hvor længe der ventes på svar
 * @returns {Promise<Object|null>} nøgle → rå streng, eller null (intet svar,
 *   forkert adresse, lager slået fra)
 */
export function fetchWwwGrupperEntries({ timeoutMs = 8000 } = {}) {
    if (typeof window === 'undefined' || window.location.origin !== APEX_ORIGIN) {
        return Promise.resolve(null);
    }
    return new Promise((resolve) => {
        const frame = document.createElement('iframe');
        frame.hidden = true;
        frame.title = 'Leder efter klasser på www.dida.dk';
        frame.src = `${WWW_ORIGIN}/flyt-send.html`;

        let settled = false;
        let timer = null;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            window.removeEventListener('message', onMessage);
            frame.remove();
            resolve(value);
        };
        const onMessage = (e) => {
            // Kun VORES iframe på www.dida.dk.
            if (e.origin !== WWW_ORIGIN || e.source !== frame.contentWindow) return;
            const msg = e.data || {};
            if (msg.type === 'dida-send-ready') {
                frame.contentWindow.postMessage({ type: 'dida-fetch-grupper' }, WWW_ORIGIN);
            } else if (msg.type === 'dida-grupper-reply') {
                finish(msg.entries && typeof msg.entries === 'object' ? msg.entries : null);
            }
        };

        window.addEventListener('message', onMessage);
        timer = setTimeout(() => finish(null), timeoutMs);
        document.body.appendChild(frame);
    });
}
