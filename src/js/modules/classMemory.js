// classMemory.js — alt det om ÉN klasse, der kun findes i hukommelsen.
//
// HVORFOR ET MODUL: Grupper har ingen server. Det meste af det, læreren
// arbejder med, ligger i localStorage under klassens filnavn og hentes frem
// igen ved et klasseskift. Men en håndfuld ting lever KUN i `state` og hører
// alligevel til én bestemt klasse: fortryd-stakken, kørselshistorikken,
// optagelsen af sidste kørsel, en afspilning der er i gang. De følger ikke med
// over af sig selv — de bliver bare stående, og så beskriver de en klasse, der
// ikke er på skærmen længere.
//
// Listen stod før spredt i `selectClass()` i AppTopbar.vue, og hver ny funktion
// skulle huske at melde sig dér. Det gik galt to gange:
//
//   - `matrixGroupsStale` (flaget "matrixen skal dannes forfra") overlevede
//     skiftet. Danner læreren stamgrupper i 2.a, skifter til 3.b og klikker
//     "Matrix", så SER switchGroupMode() et sat flag og danner 3.b's matrix om
//     med det samme — oven i den matrix hun havde rettet til i hånden. Ingen
//     spørger om lov, for programmet tror, hun selv bad om det.
//   - Optagelsen (`lastRecording`) og en igangværende afspilning overlevede
//     også. Afspilleren viser så 2.a's kørsel i 3.b's gruppekort, og når
//     aftrykket ikke passer, siger den "Grupperne er ændret, siden optagelsen
//     blev lavet" — om en klasse, hvor intet er ændret.
//
// Derfor ét sted at læse, hvad der skal ryddes. Tilføjer nogen en ny ting i
// `state`, der beskriver ÉN klasse, hører den hjemme her.
//
// PRØVEN PÅ, OM NOGET HØRER TIL: overlever det en genindlæsning af siden? Gør
// det ikke, så er tomt netop den tilstand, læreren ville have haft, hvis hun
// var kommet ind på klassen med F5 — og så skal det ryddes her.

import { state, clearUndoHistory } from './state.js';
import { clearRuns } from './runHistory.js';
import { clearColorRegistry } from './utils.js';
import * as replay from './replay.js';
import { cancelPickUp } from '../../composables/useDragDrop.js';
import { clearSetupNotices } from './setupNotices.js';
import { lastRunStatus } from './nextEngine.js';

/**
 * Ryd al hukommelses-tilstand, der hører til den klasse, vi forlader.
 *
 * Kaldes fra `selectClass()` FØR den nye klasse hentes — så er der ingen
 * mellemtilstand, hvor den gamle klasses optagelse står side om side med den
 * nye klasses grupper.
 */
export function clearClassMemory() {
    // Elevlistens fortryd-stak. Uden den skrev Ctrl+Z den FORRIGE klasses
    // elevrækker ind i den nuværende.
    clearUndoHistory();

    // Kørselshistorikken ("gå tilbage til forrige kørsel") og de tre aftryk,
    // der beskriver, hvor grupperne på skærmen kom fra. Uden den kunne en
    // kørsel fra 2.a hentes ind i 3.b.
    clearRuns();

    // Forhåndsvisningen af en tidligere kørsel. Historik-menuen rydder den
    // selv, når fokus eller musen forlader den, men et klasseskift kan komme
    // fra en genvej, hvor ingen af de to ting sker.
    state.previewRunIndex = null;

    // Optagelsen af sidste kørsel og aftrykket af de grupper, den hører til.
    // Begge dele lever kun i hukommelsen (se state.js), så tomt er præcis det,
    // en genindlæsning ville give.
    state.lastRecording = { standard: null, matrix: null };
    state.lastRecordingFingerprint = { standard: null, matrix: null };

    // En afspilning der kører. `stop()` frem for `state.replay = null`, fordi
    // den også slukker timeren — ellers tikker den videre til næste billede,
    // opdager at afspilningen er væk, og først dér giver op.
    replay.stop();

    // Visningen. Matrix betyder kun noget i en klasse, der HAR stamgrupper, og
    // knappen til den tegnes derfor kun dér. Stod visningen tilbage på matrix i
    // en klasse uden stamgrupper, mødte læreren et matrix-farvet bånd, hvor
    // ingen af de to knapper så valgte ud. En genindlæsning giver 'standard'
    // (visningen gemmes ingen steder), så det er også svaret her.
    state.activeView = 'standard';

    // "Matrixen skal dannes forfra". Et flag fra den FORRIGE klasse ville
    // danne den nye klasses matrix om uden at spørge. Flaget gemmes med hver
    // klasses grupper, så selectClass() sætter det igen fra den nye klasses
    // eget lager, når grupperne hentes — her nulstilles det bare.
    state.matrixGroupsStale = false;

    // En markeret elev hører til den klasse, hun blev markeret i. Både
    // gruppenavne ("Group 1") og elev-id'er ("r7") går igen fra klasse til
    // klasse, så en markering der overlevede skiftet, kunne flytte en helt
    // anden elev i den nye klasse.
    state.showAgreementsModal = false;
    state.agreementTab = 'together';
    state.agreementHighlight = [];
    state.selectedForAction.clear();
    cancelPickUp();

    // Gruppekortenes farver tildeles i den rækkefølge, grupperne dukker op.
    // Uden en nulstilling arver den nye klasse den gamles fordeling.
    clearColorRegistry();

    // Hvilke beskeder om opsætningen læreren har set — de handlede om den
    // FORRIGE klasse. Den nye skal have sine egne første gang (setupNotices.js).
    clearSetupNotices();

    // Mærkerne i opskriften fra sidste dannelse (flueben pr. regel) og
    // aftrykket af det, motoren fik. En KOPI af en klasse har de samme
    // elev-id'er og dermed præcis samme aftryk, så uden rydningen kunne
    // kopien svare "ja, sidste dannelse handler om det, der står nu" om en
    // dannelse, der blev lavet i originalen (nextEngine.js, runStatusFor og
    // lastRunInputIsCurrent). En genindlæsning giver ingen mærker.
    lastRunStatus.standard = null;
    lastRunStatus.matrix = null;
}
