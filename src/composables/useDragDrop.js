// useDragDrop.js — træk-og-slip af elever mellem gruppekortene: den fælles
// tilstand og logikken bag. (Afløste den gamle enableDragAndDrop() i
// interactions.js.)

import { ref } from 'vue';
import { reactiveState } from '../js/modules/reactiveState.js';
import { pushUndo } from '../js/modules/state.js';
import { saveGroupsToStorage } from '../js/modules/storage.js';
import { autoSave } from '../js/modules/classActions.js';

// Trækningens tilstand — én for hele siden, delt af alle kort
export const draggingMemberId = ref(null);
export const draggingFromGroup = ref(null);
export const isDragging = ref(false);

/**
 * Start en trækning. Kaldes fra GroupCards @dragstart.
 */
export function startDrag(memberId, sourceGroup) {
    // En trækning overtager: en tidligere markering ville ellers blive
    // stående med "Flyt hertil"-knapper på alle kort.
    cancelPickUp();
    draggingMemberId.value = memberId;
    draggingFromGroup.value = sourceGroup;
    isDragging.value = true;
    document.body.classList.add('is-global-dragging');
}

/**
 * Afslut en trækning. Kaldes fra GroupCards @dragend.
 */
export function endDrag() {
    draggingMemberId.value = null;
    draggingFromGroup.value = null;
    isDragging.value = false;
    swapTarget.value = null;
    document.body.classList.remove('is-global-dragging');
}

// ─── Byt to elever ──────────────────────────────────────────────────────────
// Et træk FLYTTER som udgangspunkt eleven ind i en anden gruppe. Holder
// læreren den trukne elev stille over en elev i en anden gruppe et øjeblik
// (SWAP_DWELL_MS), skifter visningen til et BYT: de to elever skifter gruppe.
// Trækker hun væk fra navnet igen, er det en flytning igen. Det er GroupCard,
// der måler, hvor musen står; her ligger tilstanden og selve byttet.

/** Så længe skal musen hvile over et navn, før et træk bliver til et byt. */
export const SWAP_DWELL_MS = 600;

// Eleven, den trukne elev vil bytte med: { groupName, memberId, name }.
// null = trækket er en almindelig flytning.
export const swapTarget = ref(null);

// De to elever, der lige har byttet. Deres rækker markeres et øjeblik, så
// læreren kan se begge ender af byttet — også den i gruppen, hun trak FRA.
export const justSwappedIds = ref(new Set());
let justSwappedTimer = null;

export function setSwapTarget(target) {
    swapTarget.value = target;
}

export function clearSwapTarget() {
    swapTarget.value = null;
}

/**
 * Byt to elever mellem to grupper. Hver elev tager den andens plads i
 * listen, så rækkefølgen i begge grupper ellers er uændret.
 *
 * Samme låse-tjek som moveMember(): en låst gruppe hverken afgiver eller
 * modtager. Et byt inden for SAMME gruppe giver ingen mening (det er bare en
 * ny rækkefølge) og afvises.
 *
 * @returns {boolean} true hvis byttet skete
 */
export function swapMembers(groupA, groupB, idA, idB) {
    if (!groupA || !groupB || groupA === groupB) return false;
    if (groupA.locked || groupB.locked) return false;

    const iA = groupA.members.findIndex(m => resolveMemberId(m) === String(idA));
    const iB = groupB.members.findIndex(m => resolveMemberId(m) === String(idB));
    if (iA === -1 || iB === -1) return false;

    const memberA = groupA.members[iA];
    groupA.members[iA] = groupB.members[iB];
    groupB.members[iB] = memberA;

    saveGroupsToStorage();

    // Markeringen af de to rækker slukker af sig selv igen.
    justSwappedIds.value = new Set([String(idA), String(idB)]);
    clearTimeout(justSwappedTimer);
    justSwappedTimer = setTimeout(() => { justSwappedIds.value = new Set(); }, 1500);
    return true;
}

// ─── Markering: flyt en elev uden mus ───────────────────────────────────────
// Træk-og-slip findes ikke på touch (iPad/smartboard) og kan ikke betjenes
// fra tastaturet. Derfor kan en elev også MARKERES (klik/tap/Enter) og
// derefter placeres i en anden gruppe med en knap på gruppekortet.
// Tilstanden er bevidst adskilt fra draggingMemberId, så en igangværende
// trækning og en markering aldrig kan blive forvekslet.
export const pickedMemberId = ref(null);
export const pickedFromGroup = ref(null);
export const pickedMemberName = ref('');
// Hvilken klasse og hvilken visning markeringen blev sat i. Uden de to
// oplysninger overlever markeringen et klasseskift eller et skift til Matrix
// — og gruppenavne ("Group 1") og elev-id'er ("r7") går igen BEGGE steder.
// "Flyt hertil" ville derfor slå op på navn i det forkerte gruppesæt og
// flytte en helt anden elev, med den markerede elevs navn på knappen.
export const pickedView = ref(null);
export const pickedClass = ref(null);

/** Den klasse markeringen hører til — filnavnet er klassens identitet. */
function currentClassKey() {
    return reactiveState.currentClass?.filename || null;
}

/**
 * Peger markeringen stadig på den klasse og den visning, den blev sat i?
 * Bruges BÅDE af "Flyt hertil"-knappen (så den slet ikke vises) og af
 * movePickedTo() (så en flytning aldrig kan udføres i det forkerte sæt).
 */
export function pickIsInContext() {
    if (!pickedMemberId.value) return false;
    return pickedView.value === reactiveState.activeView
        && pickedClass.value === currentClassKey();
}

/** Markér en elev (eller fortryd, hvis den samme elev markeres igen). */
export function pickUpMember(memberId, sourceGroup, displayName = '') {
    if (sourceGroup?.locked) return;
    if (pickedMemberId.value === String(memberId)
        && pickedFromGroup.value?.name === sourceGroup?.name) {
        cancelPickUp();
        return;
    }
    pickedMemberId.value = String(memberId);
    pickedFromGroup.value = sourceGroup;
    pickedMemberName.value = displayName || String(memberId);
    pickedView.value = reactiveState.activeView;
    pickedClass.value = currentClassKey();
}

/** Ryd markeringen (Escape, klik igen, eller efter en gennemført flytning). */
export function cancelPickUp() {
    pickedMemberId.value = null;
    pickedFromGroup.value = null;
    pickedMemberName.value = '';
    pickedView.value = null;
    pickedClass.value = null;
}

/**
 * Den markerede elevs kildegruppe, som den står LIGE NU — eller null (og
 * markeringen ryddet, hvis den ikke længere hører til skærmen).
 * Fælles for movePickedTo() og excludePicked().
 */
function pickedSourceGroup() {
    if (!pickedMemberId.value || !pickedFromGroup.value) return null;

    // Er læreren skiftet klasse eller visning, siden eleven blev markeret,
    // hører markeringen ikke til det, der står på skærmen nu. Så ryd den —
    // ellers ville opslaget nedenfor finde en tilfældig navnefælle i det nye
    // gruppesæt og flytte hende i stedet.
    if (!pickIsInContext()) { cancelPickUp(); return null; }

    // Kildegruppen slås op i den AKTUELLE tilstand ved navn: har en
    // regenerering udskiftet gruppelisten, mens eleven var markeret, peger
    // den gemte reference på et forladt objekt, og flytningen ville ske et
    // sted der aldrig bliver gemt.
    const groups = reactiveState.activeView === 'matrix'
        ? (reactiveState.storedMatrixGroups || [])
        : (reactiveState.storedStandardGroups || []);
    const source = groups.find(g => g.name === pickedFromGroup.value.name);
    if (!source) { cancelPickUp(); return null; }
    return source;
}

/**
 * Flyt den markerede elev til targetGroup. Samme vej gennem moveMember() som
 * træk-og-slip, så de to betjeningsmåder ikke kan drive fra hinanden.
 * @returns {boolean} true hvis eleven blev flyttet
 */
export function movePickedTo(targetGroup, insertIndex = -1) {
    const source = pickedSourceGroup();
    if (!source) return false;

    const ok = moveMember(source, targetGroup, pickedMemberId.value, insertIndex);
    if (ok) cancelPickUp();
    return ok;
}

/**
 * Flyt ét medlem fra én gruppe til en anden.
 *
 * ÉN funktion for både træk-og-slip og markering — låse-tjek, opslag og
 * indsættelse må kun findes ét sted, ellers kan de to betjeningsmåder
 * komme til at opføre sig forskelligt (fx låse-tjekket).
 *
 * @returns {boolean} true hvis flytningen skete
 */
export function moveMember(sourceGroup, targetGroup, memberId, insertIndex = -1) {
    if (!sourceGroup || !targetGroup) return false;
    if (sourceGroup.locked || targetGroup.locked) return false;

    // Find eleven og tag den ud af den gamle gruppe
    const sourceIdx = sourceGroup.members.findIndex(m => resolveMemberId(m) === String(memberId));
    if (sourceIdx === -1) return false;

    const [member] = sourceGroup.members.splice(sourceIdx, 1);

    // Sæt eleven ind i den nye
    if (insertIndex >= 0 && insertIndex < targetGroup.members.length) {
        targetGroup.members.splice(insertIndex, 0, member);
    } else {
        targetGroup.members.push(member);
    }

    // Tomme grupper bevares med vilje — læreren kan slette dem selv med
    // knappen "Slet gruppe?", som vises, når members.length === 0.
    saveGroupsToStorage();
    return true;
}

/**
 * Håndtér et slip på en gruppes medlemsliste.
 * Flytter det trukne medlem fra kildegruppen til målgruppen på den givne plads.
 */
export function dropOnGroup(targetGroup, insertIndex = -1) {
    if (!draggingMemberId.value || !draggingFromGroup.value) return;
    // Viser kortet et byt lige nu, er det dét, læreren slipper på.
    const swap = swapTarget.value;
    if (swap && swap.groupName === targetGroup.name) {
        swapMembers(draggingFromGroup.value, targetGroup, draggingMemberId.value, swap.memberId);
        return;
    }
    moveMember(draggingFromGroup.value, targetGroup, draggingMemberId.value, insertIndex);
}

/**
 * Meld én elev fraværende og tag hende ud af grupperne.
 *
 * ÉN funktion for både papirkurven og markeringen — samme begrundelse som
 * moveMember(): låse-tjekket, oprydningen i det ANDET gruppesæt og
 * `_excluded` må kun findes ét sted, ellers kan de to betjeningsmåder komme
 * til at gøre hver sit.
 *
 * @returns {boolean} true hvis eleven blev meldt fraværende
 */
export function excludeMember(sourceGroup, memberId, idColumn) {
    if (!sourceGroup || !memberId) return false;
    if (sourceGroup.locked) return false;

    // Tag hende ud af kildegruppen
    const idx = sourceGroup.members.findIndex(m => resolveMemberId(m) === String(memberId));
    if (idx > -1) {
        sourceGroup.members.splice(idx, 1);
    }

    // Markér eleven som fraværende i klassens data.
    //
    // FORTRYD-STAKKEN SKAL MED: `_excluded` ER elevdata, og fortryd-stakken
    // i elevlisten gemmer netop elevrækkerne. Ændrer vi dem uden et snapshot,
    // springer stakken en handling over — og så fortryder ét Ctrl+Z TO ting.
    // Målt: ret en celle i elevlisten, gå til Grupper, træk en elev i
    // papirkurven, gå tilbage og tryk Ctrl+Z. Uden snapshottet blev
    // celleredigeringen rullet tilbage OG eleven meldt til stede igen — mens
    // hun stadig var ude af gruppen. Med snapshottet tager det første Ctrl+Z
    // præcis papirkurven, som fluebenet i elevlisten allerede kunne.
    //
    // Kun når fluebenet faktisk vender: en elev der ALLEREDE er fraværende,
    // kan stadig sidde i en gruppe (fraværende medlemmer bliver stående), og
    // et snapshot uden en ændring ville bare skubbe en rigtig ændring ud af
    // de 50 pladser.
    if (reactiveState.currentClass && idColumn) {
        const student = reactiveState.currentClass.data.find(
            s => String(s[idColumn]) === String(memberId)
        );
        if (student && !student._excluded) {
            pushUndo();
            student._excluded = true;
        }
    }

    // Og ud af det ANDET gruppesæt (stam/matrix)
    const otherGroups = reactiveState.activeView === 'matrix'
        ? reactiveState.storedStandardGroups
        : reactiveState.storedMatrixGroups;

    if (otherGroups) {
        otherGroups.forEach(g => {
            // Samme lock-tjek som sourceGroup ovenfor — uden den kunne en
            // elev der trækkes til papirkurven fra den UNLÅSTE visning
            // stille blive fjernet fra sin LÅSTE gruppe i den ANDEN visning
            // (stam/Matrix), selvom kun sourceGroup's egen lock-status
            // nogensinde blev tjekket.
            if (g.locked) return;
            const i = g.members.findIndex(m => resolveMemberId(m) === String(memberId));
            if (i > -1) g.members.splice(i, 1);
        });
    }

    saveGroupsToStorage();
    autoSave(); // Gem `_excluded` i klassefilen
    return true;
}

/**
 * Slip på papirkurven — meld den TRUKNE elev fraværende.
 */
export function dropOnTrash(idColumn) {
    cancelPickUp();
    if (!draggingMemberId.value || !draggingFromGroup.value) return;
    excludeMember(draggingFromGroup.value, draggingMemberId.value, idColumn);
    // Trækket er slut her — ligesom i GroupCards onDrop. Rækken, trækket
    // startede fra, forsvinder i selve slippet (eleven er ude af gruppen), og
    // en browser sender ikke altid `dragend` til en række, der ikke længere
    // står på siden. Uden oprydningen stod papirkurven og lyste rødt.
    endDrag();
}

/**
 * Meld den MARKEREDE elev fraværende — papirkurven uden mus.
 *
 * Papirkurven er en slip-zone og kun det: den kan hverken tappes på en iPad
 * eller nås fra tastaturet. Værktøjstippet på en fraværende elev sagde oven i
 * købet "træk til papirkurven for at tage hende ud af gruppen" — en
 * anvisning, halvdelen af de skærme Grupper bruges på, ikke kan følge.
 *
 * Samme to værn som movePickedTo(): markeringen skal stadig høre til den
 * klasse og den visning, den blev sat i, og kildegruppen slås op i CURRENT
 * state ved navn, så en regenerering undervejs ikke får os til at rette i et
 * forladt objekt, der aldrig bliver gemt.
 *
 * @returns {boolean} true hvis eleven blev meldt fraværende
 */
export function excludePicked(idColumn) {
    const source = pickedSourceGroup();
    if (!source) return false;

    const memberId = pickedMemberId.value;
    const ok = excludeMember(source, memberId, idColumn);
    if (ok) cancelPickUp();
    return ok;
}

/**
 * Udregn indsætningspladsen ud fra Y-koordinaten i en beholder.
 *
 * Svaret er en plads i listen UDEN den trukne elev — den samme plads, som
 * moveMember() sætter hende ind på, efter at hun er taget ud. `skipId` er den
 * trukne elevs id: står hun i den liste, der måles på (læreren flytter rundt
 * inden for sit eget kort), tæller hendes række ikke med.
 *
 * Før talte rækken med i de første 250 ms (mens den var ved at forsvinde,
 * Vues leave-overgang med display: none) og derefter ikke, mens kortet trak
 * én fra, som om den altid talte. Trak læreren en elev NEDAD i sit eget kort,
 * stod pladsholderen derfor én række for højt, og eleven landede ét sted
 * længere nede, end pladsholderen havde vist.
 */
export function getInsertIndex(containerEl, clientY, skipId = null) {
    // Vigtigt: pladsholderen selv holdes ude af udregningen. Ellers flytter
    // dens tilstedeværelse listen og skaber en feedback-løkke (rystelser).
    // Rækker på vej ud (list-leave-active) har display: none og ingen plads.
    const children = [...containerEl.querySelectorAll('li:not(.placeholder-item):not(.list-leave-active)')]
        .filter(el => skipId === null || el.dataset.id !== String(skipId));

    let insertIndex = children.length; // standard: sæt til sidst

    for (let i = 0; i < children.length; i++) {
        const box = children[i].getBoundingClientRect();
        // Almindeligt midtpunkts-tjek (50 %).
        // Fordi den flyttende pladsholder holdes ude, bytter de andre elever
        // plads rent omkring markøren uden at "se" hullet.
        const offset = clientY - box.top - (box.height / 2);
        if (offset < 0) {
            insertIndex = i;
            break;
        }
    }
    return insertIndex;
}

/**
 * Elevens id som tekst, uanset om medlemmet er en tekst eller et objekt.
 * GroupCard bruger den samme, så kortets data-id og trækkets opslag er enige.
 * (IKKE det samme som utils.memberIdStr: den bruger ?? og trim.)
 */
export function resolveMemberId(m) {
    if (typeof m === 'object' && m !== null) {
        return String(m.id || m.name || '');
    }
    return String(m);
}
