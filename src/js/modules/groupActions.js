import { state } from './state.js';
import * as storage from './storage.js';
import { buildGroupTable } from './groupExport.js';
import { autoSave } from './classActions.js';
import { modalActions } from './modalState.js';
import { handleGenerate as _handleGenerate } from './generation.js';
import { cancelPickUp } from '../../composables/useDragDrop.js';

export function handleGenerate() {
    _handleGenerate();
}

export function handleGlobalLock() {
    const isMatrix = state.activeView === 'matrix';
    const groups = isMatrix ? state.storedMatrixGroups : state.storedStandardGroups;

    if (!groups || groups.length === 0) return;

    const allLocked = groups.every(g => g.locked);
    const newState = !allLocked;

    groups.forEach(g => g.locked = newState);

    state.lastGeneratedGroups = groups;
    storage.saveGroupsToStorage();
}

/**
 * Byg den tekst der lægges i udklipsholderen.
 *
 * Ligger her — og ikke i CopyOptionsModal — fordi stam- og matrix-kopiering
 * skal skrive de SAMME navne. Da modalen havde sin egen kopi af logikken,
 * arvede den ikke skiftet fra "id-værdi" til visningsnavn, og matrix-kopien
 * endte med at levere interne _rowId'er ("r7") i stedet for elevnavne.
 *
 * @param {boolean} isMatrix        matrix- eller stamgrupper
 * @param {boolean} includeSource   sæt elevens stamgruppe i parentes (kun matrix)
 * @returns {string|null}           teksten, eller null hvis der ingen grupper er
 */
export function buildGroupsClipboardText(isMatrix, includeSource = false) {
    // Hvad der står om hver gruppe — navne, emne, kilde, fravær — bestemmes
    // af buildGroupTable() i groupExport.js. Del-menuens Excel-filer lægges
    // ud fra den samme tabel. Formatet her læses tilbage af "Gendan"
    // (restoreGroups.js) og må ikke ændres.
    const table = buildGroupTable(isMatrix, includeSource);
    if (!table) return null;

    let text = '';
    table.forEach(g => {
        text += `${g.heading}\n`;
        g.members.forEach(line => { text += `${line}\n`; });
        text += '\n';
    });

    return text;
}

/** Læg teksten i udklipsholderen og kvittér over for læreren. */
export function writeGroupsToClipboard(text) {
    // navigator.clipboard findes ikke i en usikker kontekst (http, en
    // fil-URL, en ældre browser). Uden det her tjek kastede kaldet en
    // TypeError FØR der var et løfte at fange fejlen på: knappen gjorde
    // ingenting, modalen blev stående, og der kom ikke en eneste besked.
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        if (window.notifyError) window.notifyError(
            'Browseren vil ikke give adgang til udklipsholderen her. ' +
            'Brug "Del" → "Udskriv" og kopiér derfra, eller åbn siden via https.'
        );
        return Promise.resolve(false);
    }

    return navigator.clipboard.writeText(text).then(() => {
        if (window.notifySuccess) window.notifySuccess("Grupper kopieret til udklipsholder!");
        return true;
    }).catch(err => {
        console.error('Kunne ikke kopiere:', err);
        if (window.notifyError) window.notifyError("Fejl ved kopiering.");
        return false;
    });
}

export function copyGroupsToClipboard() {
    const isMatrix = state.activeView === 'matrix';

    if (isMatrix) {
        modalActions.openCopyOptions();
        return;
    }

    const text = buildGroupsClipboardText(false);
    if (text === null) {
        if (window.notifyInfo) window.notifyInfo("Ingen grupper at kopiere.");
        return;
    }

    writeGroupsToClipboard(text);
}

export function setViewMode(mode) {
    if (mode === state.activeView) return;

    // En markeret elev hører til det gruppesæt, eleven blev markeret i. Bliver
    // markeringen stående efter skiftet, står læreren i Matrix med et bånd om
    // en elev fra stamgrupperne — og "Flyt hertil" ville ramme forbi.
    cancelPickUp();

    if (state.currentClass) autoSave();

    state.activeView = mode === 'matrix' ? 'matrix' : 'standard';

    if (state.currentClass) {
        if (!state.currentClass.settings) state.currentClass.settings = {};
        if (!state.currentClass.matrixSettings) state.currentClass.matrixSettings = {};
        if (!state.currentClass.rules) state.currentClass.rules = [];
        if (!state.currentClass.matrixRules) state.currentClass.matrixRules = [];
    }

    // Et skift til Matrix danner aldrig noget af sig selv. Opskriften
    // (MatrixRecipePanel) åbner sit vindue, når der ingen — eller en forældet —
    // matrix er, og læreren trykker selv "Dan matrixgrupper".
}

export function toggleTags() {
    state.showGroupTags = !state.showGroupTags;
}

export function handleSaveAsColumn() {
    if (!state.currentClass || !state.lastGeneratedGroups) {
        if (window.notifyInfo) window.notifyInfo("Du skal generere grupper først!");
        return;
    }
    modalActions.openSaveColumn();
}

/**
 * Tilføj en ny, tom gruppe til det aktuelle gruppesæt.
 * Finder det næste ledige gruppenummer (fx "Group 6") og sætter den ind.
 */
export function addEmptyGroup() {
    const isMatrix = state.activeView === 'matrix';
    const groups = isMatrix ? state.storedMatrixGroups : state.storedStandardGroups;
    if (!groups) return;

    // Find det højeste eksisterende gruppenummer
    let maxNum = 0;
    groups.forEach(g => {
        const m = g.name.match(/^Group\s*(\d+)$/i);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });

    const newName = `Group ${maxNum + 1}`;
    // Fjern et forældet emne i localStorage fra en tidligere session med samme gruppenavn
    storage.saveTopic(newName, null, isMatrix ? 'M_' : 'S_');
    const newGroup = { name: newName, members: [], locked: false, topic: null };
    groups.push(newGroup);

    if (isMatrix) state.storedMatrixGroups = [...groups];
    else state.storedStandardGroups = [...groups];

    storage.saveGroupsToStorage();
    autoSave();
}

/**
 * Slet en bestemt gruppe ud fra navnet. Kun tilladt, når gruppen er tom OG
 * ulåst.
 *
 * LÅSEN GÆLDER OGSÅ HER. Resten af gruppekortet retter sig efter den —
 * `moveMember()` og `excludeMember()` i useDragDrop.js siger fra, `pickUpMember()`
 * markerer ikke, "Flyt hertil" vises ikke, og emnegrebet er skjult — men
 * sletningen spurgte ikke. Og en TOM gruppe er ikke ligegyldig: den er en
 * plads læreren har sat af (til en efternøler), og generereringen regner med
 * den, jf. `neededNewGroups = totalTarget - lockedGroups.length` i
 * generation.js. Ét klik på "Slet gruppe?" tog den uden at spørge.
 *
 * Reglen står HER og ikke kun i skabelonen: knappen er affordancen, det her
 * er beslutningen, og et fremtidigt kaldested skal ikke kunne gå udenom.
 */
export function deleteGroup(groupName) {
    const isMatrix = state.activeView === 'matrix';
    const groups = isMatrix ? state.storedMatrixGroups : state.storedStandardGroups;
    if (!groups) return;

    const idx = groups.findIndex(g => g.name === groupName);
    if (idx === -1) return;
    if (groups[idx].locked) return;             // Sikring: slet aldrig en låst gruppe
    if (groups[idx].members.length > 0) return; // Sikring: slet aldrig en gruppe med elever

    groups.splice(idx, 1);

    if (isMatrix) state.storedMatrixGroups = [...groups];
    else state.storedStandardGroups = [...groups];

    storage.saveGroupsToStorage();
    autoSave();
}
