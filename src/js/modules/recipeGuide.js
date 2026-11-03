// Den lille guide til gruppeopskriften (og elevlisten): de rene regler uden DOM.
//
// Hvorfor en separat fil: placeringen af kortet og "har læreren set den?" er
// de to steder, hvor guiden kan gå galt uden at man ser det (kortet uden for
// skærmen, guiden der kommer igen og igen). De kan prøves uden en browser.

export const GUIDE_KEY = 'grupper-opskrift-guide-set';
// Elevlisten har sin egen guide og husker den for sig: at have set den ene
// siger intet om den anden.
export const STUDENT_GUIDE_KEY = 'grupper-elevliste-guide-set';

// Hvis browserens lager ikke virker (privat fane, blokeret), husker vi det her
// i stedet — så guiden stadig kun kommer én gang pr. sideindlæsning.
const seenThisLoad = new Set();

/** Har guiden været vist i denne browser? Rører aldrig lageret uden try/catch. */
export function hasSeenGuide(storage, key = GUIDE_KEY) {
    if (seenThisLoad.has(key)) return true;
    try {
        return !!(storage || globalThis.localStorage)?.getItem(key);
    } catch {
        return false;
    }
}

/** Husk at guiden er vist. */
export function markGuideSeen(storage, key = GUIDE_KEY) {
    seenThisLoad.add(key);
    try {
        (storage || globalThis.localStorage)?.setItem(key, '1');
    } catch {
        // Lageret afviste det — seenThisLoad dækker resten af sidevisningen.
    }
}

/** Kun til tests: glem hukommelsen for denne sideindlæsning. */
export function resetGuideMemory() {
    seenThisLoad.clear();
}

/** Gør et mål lidt større, så udskæringen ikke klemmer sig ind på ordene. */
export function padRect(rect, pad) {
    return {
        left: rect.left - pad,
        top: rect.top - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
    };
}

/**
 * Hvor skal kortet stå? Prøver under, over, til højre og til venstre for målet
 * (i den rækkefølge) og tager den første side, hvor kortet er helt på skærmen.
 * Passer ingen, lægges kortet i bunden af skærmen. Sidelæns klemmes det altid
 * ind, så det aldrig stikker ud.
 *
 * target/card: {left, top, width, height}. viewport: {width, height}.
 */
export function placeCard(target, card, viewport, gap = 14, margin = 16) {
    const maxLeft = Math.max(margin, viewport.width - card.width - margin);
    const maxTop = Math.max(margin, viewport.height - card.height - margin);
    const clampX = (x) => Math.min(Math.max(x, margin), maxLeft);
    const clampY = (y) => Math.min(Math.max(y, margin), maxTop);
    const centerX = target.left + target.width / 2 - card.width / 2;
    const centerY = target.top + target.height / 2 - card.height / 2;

    const below = target.top + target.height + gap;
    if (below + card.height <= viewport.height - margin) {
        return { side: 'below', left: clampX(centerX), top: below };
    }
    const above = target.top - gap - card.height;
    if (above >= margin) {
        return { side: 'above', left: clampX(centerX), top: above };
    }
    const right = target.left + target.width + gap;
    if (right + card.width <= viewport.width - margin) {
        return { side: 'right', left: right, top: clampY(centerY) };
    }
    const left = target.left - gap - card.width;
    if (left >= margin) {
        return { side: 'left', left, top: clampY(centerY) };
    }
    return { side: 'bottom', left: clampX(centerX), top: maxTop };
}

/** Næste trin ud fra et tal, aldrig uden for 0..count-1. */
export function clampStep(index, delta, count) {
    return Math.min(Math.max(index + delta, 0), Math.max(count - 1, 0));
}
