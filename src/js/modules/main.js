// FØRST: lageret på plads (gamle nøglenavne flyttes, klasser fra dida.dk
// tages imod). Moduler kører i importrækkefølge, så intet nedenfor når at
// læse lageret før — se storageStartup.js.
import './storageStartup.js';
import { createApp } from 'vue';
import App from '../../components/App.vue';
import { undo, redo, state, undoShortcut } from './state.js';
import { autoSave, flushPendingWrites } from './classActions.js';
import { initGlobalTooltip } from './tooltip.js';
import { isModalOpen } from '../../composables/useModalFocus.js';
import { pyBridge } from './py_bridge.js';
import { initApiAdapter } from './api_adapter.js';
import { watchForNewBuild } from './newBuild.js';
import { prepareBetaPage } from './beta.js';

// --- INITIALIZATION ---
// Initialize Global Tooltip
initGlobalTooltip();

// En ny udgave lagt op, mens fanen stod åben — se newBuild.js
watchForNewBuild();

// Initialize Backend Bridge
initApiAdapter();

// Valget af gruppemotor fra afprøvningen (grup.dk/?beta, november 2026) —
// der er kun én motor nu, så nøglen ryddes, hvor den ligger.
try { localStorage.removeItem('grupper-motor'); } catch { /* uden lager: intet at rydde */ }

// Expose Debug Helper
window.appDebug = { pyBridge, state, undo, redo };

// grup.dk/beta: samme app, ny skærm til gruppedannelsen (se beta.js). Kaldes
// efter AppTopbar har sat lærerens eget tema, så beta's Rolig-tema vinder.
prepareBetaPage();

// Mount Root Vue App
const app = createApp(App);
app.mount('#app');

// --- GLOBAL EVENT LISTENERS ---

// Sidste chance for at gemme, når fanen lukkes eller genindlæses.
//
// HVORFOR ÉT STED: flere flader udskyder deres skrivning et øjeblik (celler i
// elevtabellen, regler og indstillinger på Grupper-fanen), og elevtabellen var
// den eneste, der selv huskede at skrive ned ved lukning. En regel tilføjet
// og en fane lukket i samme sekund var væk — og der er ingen server med en
// kopi. Her gælder det uanset hvilken fane læreren står på.
//
// BÅDE `pagehide` OG `beforeunload`: `beforeunload` er den, der findes overalt,
// men den springes over på iOS/Safari, når fanen ryddes væk. `pagehide` fyrer
// begge steder. At gemme to gange koster ingenting — autoSave skriver bare
// det samme igen.
window.addEventListener('pagehide', flushPendingWrites);
window.addEventListener('beforeunload', flushPendingWrites);

// Undo/Redo keyboard shortcuts
document.addEventListener('keydown', (e) => {
    const action = undoShortcut(e);
    if (!action) return;

    // Felter med deres EGEN fortryd-historik passer sig selv: et tekstfelt i
    // et vindue, og cellen man står og skriver i (StudentTable har sin egen
    // tastaturhåndtering dér).
    //
    // Et flueben har INGEN egen historik, så det tæller ikke med. Chrome,
    // Edge og Safari giver fluebenet fokus, når man klikker det — og før
    // sprang genvejen derfor over ALLE <input>: klik en elev fraværende i
    // elevlisten, tryk Ctrl+Z, og intet skete. Firefox på Mac fokuserer ikke
    // fluebenet, så dér virkede det.
    const active = document.activeElement;
    const tag = active?.tagName;
    const isToggle = tag === 'INPUT' && (active.type === 'checkbox' || active.type === 'radio');
    if ((tag === 'INPUT' && !isToggle) || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.target.isContentEditable) return;

    // Herfra er der INGEN redigering i gang — og så skal browserens egen
    // fortryd holdes væk fra elevlisten, uanset om vi selv gør noget.
    //
    // HVORFOR: cellerne i elevlisten ER contenteditable, og Chromium fører
    // sin egen fortryd-historik for dem på hele dokumentet. Lod vi tasten
    // gå videre, rullede browseren den seneste indtastning tilbage i DOM'en,
    // uden at hverken Vue eller `currentClass.data` opdagede det: teksten i
    // cellen og værdien i klassen kom fra hinanden, og appens egen
    // fortryd-stak fik oveni et snapshot af en ændring, der aldrig skete.
    // Målt med et åbent vindue, hvor vi netop IKKE vil fortryde noget.
    e.preventDefault();

    // Ligger der et vindue over elevlisten, må Ctrl+Z ikke fortryde noget i
    // tabellen bagved. Målt: rediger en celle, åbn "Flyt kolonner", tryk
    // Ctrl+Z — den forrige, helt urelaterede ændring blev rullet tilbage bag
    // et vindue der dækkede den, og læreren så det først ved at lukke.
    // Vinduerne har deres egen fortryd-vej: knappen "Annuller".
    // `isModalOpen()` frem for et klasse-opslag: Undgåelser-vinduet hedder
    // ikke `.modal-overlay`, og var derfor det ENE vindue, hvor Ctrl+Z stadig
    // kunne rulle en usynlig celleredigering tilbage bagved.
    if (isModalOpen() || document.querySelector('dialog[open]')) return;

    // Og fortryd hører til ELEVLISTEN — det er kun elevrækkerne, stakken
    // gemmer. Står læreren på Dashboard, på Grupper, i kørselshistorikken
    // eller i hjælpen, er der intet på skærmen et Ctrl+Z kan ændre, men det
    // rullede alligevel den seneste celleredigering tilbage ét skærmbillede
    // væk. Samme fejltype som vinduerne ovenfor: en ændring man ikke kan se
    // ske, og som først opdages når man går tilbage til listen.
    if (state.navView !== 'class' || state.classViewTab !== 'students') return;

    if (action === 'undo') {
        if (undo()) autoSave();
    } else {
        if (redo()) autoSave();
    }
});
