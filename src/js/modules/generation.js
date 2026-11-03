// generation.js — indgangen til gruppedannelsen fra knapperne.
//
// Selve dannelsen sker i nextEngine.js (input → motoren i motor/engine →
// svaret på skærmen). Her står kun knappernes vagter: ingen ny kørsel oveni
// en, der er i gang; matrix kræver stamgrupper; Stop; og en ydre fanger, så
// en fejl aldrig efterlader overlayet tændt.
//
// (Indtil 3/11 2026 lå den gamle Python-motor her ved siden af — Pyodide i en
// Web Worker, med sin egen forberedelse af reglerne. Den er fjernet; alt går
// gennem motoren i motor/engine.)

import { state } from './state.js';
import { tryNextEngine, isNextEngineRunning, stopNextEngine, STOPPED_TEXT, NEED_HOME_GROUPS } from './nextEngine.js';

export async function generateMatrixGroups() {
    // En kørsel er allerede i gang: en ny oveni ville nulstille activeJobId og
    // lade det første resultat falde tavst væk (samme vagt som i
    // generateWithoutTogether).
    if (!state.currentClass || state.isGenerating) return;
    // Samme vagt som handleGenerate: matrixgrupper dannes PÅ TVÆRS af
    // stamgrupperne, så uden dem er der intet at fordele.
    if (!state.storedStandardGroups || state.storedStandardGroups.length === 0) {
        window.notifyInfo(NEED_HOME_GROUPS);
        return;
    }
    executeGeneration(true);
}

/**
 * Stop en gruppedannelse der er i gang.
 *
 * Kører motoren, beder Stop om den foreløbig bedste deling: motoren svarer
 * inden for ca. et sekund, og svaret lander gennem tryNextEngine() —
 * overlayet står imens med "Stopper …". Ellers (fx en kørsel, der hænger, før
 * motoren er startet) nulstilles det hele, og grupperne fra sidste kørsel
 * bliver stående.
 */
export function cancelGeneration() {
    if (!state.isGenerating) return;
    if (isNextEngineRunning()) {
        stopNextEngine();
        return;
    }
    // (Ingen motor-tråd at afbryde her: isNextEngineRunning() var falsk.)
    state.activeJobId = null;
    state.isGenerating = false;
    window.notifyInfo(STOPPED_TEXT);
}

export async function handleGenerate(overrideSettings = null) {
    // Se generateMatrixGroups: ingen ny kørsel oveni en der er i gang.
    if (!state.currentClass || state.isGenerating) return;

    const isMatrix = state.activeView === 'matrix';

    // Skift til fanen med grupperne, så resultatet kan ses
    state.classViewTab = 'groups';

    if (isMatrix && (!state.storedStandardGroups || state.storedStandardGroups.length === 0)) {
        window.notifyInfo(NEED_HOME_GROUPS);
        return;
    }
    executeGeneration(isMatrix, overrideSettings);
}

/**
 * Dan stamgrupper ÉN gang uden en bestemt Skal sammen-aftale.
 *
 * Kan en aftale ikke lade sig gøre (en undgåelse, en Adskil-regel eller en
 * låst gruppe står i vejen), stopper Dan grupper. Advarslen over grupperne
 * tilbyder så læreren at tilsidesætte aftalen — kun i denne kørsel. Aftalen
 * bliver stående i klassen og gælder igen næste gang, så en beslutning om to
 * elever ikke forsvinder, fordi den var i vejen én dag.
 *
 * @param {string[]} ids elevernes _rowId i den aftale, der skal springes over
 */
export function generateWithoutTogether(ids) {
    if (!state.currentClass || state.isGenerating || !ids?.length) return;
    state.classViewTab = 'groups';
    return executeGeneration(false, null, { skipTogether: ids });
}

/**
 * Ydre vagt om kørslen: kaster noget, der ikke selv er fanget, slukkes
 * overlayet, grupperne står urørte, og læreren får en rolig besked.
 */
export async function executeGeneration(isMatrix, overrideSettings = null, options = {}) {
    try {
        await tryNextEngine(isMatrix, overrideSettings, options);
    } catch (e) {
        console.error('[Gruppemotor]', e);
        state.isGenerating = false;
        state.activeJobId = null;
        window.notifyError?.('Grupperne kunne ikke dannes: der skete en fejl. Dine nuværende grupper er urørte. '
            + 'Prøv igen — og genindlæs siden, hvis det sker igen.');
    }
}
