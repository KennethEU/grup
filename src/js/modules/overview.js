
import { state } from './state.js';
import { escapeHtml, memberIdStr, memberDisplayName, isMemberAbsent, groupDisplayName, groupShortName } from './utils.js';
import { getTopic } from './storage.js';
import { UI_NAMES } from './beta.js';

// --- UDSKRIFTEN (Del → "Udskriv / gem som PDF") ---
// Åbner et nyt vindue med stamgrupperne og matrixen sat op som et DOKUMENT:
// et hoved med klassen, datoen og omfanget, og grupperne adskilt af tynde
// streger. Sort og gråt med vilje (12/9): Chrome printer uden baggrunds-
// farver som standard, og på skolens sort-hvide printer blev de farvede
// emne-mærkater alligevel til grå kasser. Emnet står nu som tekst under
// gruppenavnet, og matrixens oprindelse som diskret grå tekst.
export function openOverview() {
    // En forældet matrix hører til de FORRIGE stamgrupper. Den ligger stadig
    // i state (visningsskiftet danner den forfra — se matrixGroupsStale), men
    // på papiret stod den som "Runde 2" under de nye stamgrupper, med
    // oprindelses-mærkater regnet ud fra grupper, den aldrig kom fra.
    const matrixGroups = state.matrixGroupsStale ? null : state.storedMatrixGroups;
    const standardGroups = state.storedStandardGroups;
    if (!standardGroups && !matrixGroups) {
        window.notifyInfo(`Tryk ${UI_NAMES.generate} først, så der er grupper at udskrive.`);
        return;
    }

    const data = state.currentClass?.data;

    // Object.create(null): nøglerne er medlems-id'er, men i grupper gemt før
    // _rowId fandtes er de elevNAVNE. Et almindeligt objekt ville svare på
    // "constructor" med en arvet funktion, og eleven fik et mærkat med
    // maskinkode på den udskrevne gruppeliste.
    const studentTopicMap = Object.create(null);
    const standardGroupMap = Object.create(null);

    // Et medlem bæres rundt som _rowId. Id'et er NØGLEN (opslag i de to maps
    // nedenfor), navnet er det der skal STÅ på papiret — de to må ikke bytte
    // plads, ellers udskriver vi "r7" i stedet for "Anna".
    const memberId = (m) => memberIdStr(m);
    const memberName = (m) => memberDisplayName(m, data, state.displayColumn);

    // Sanitize helper — AL bruger-tekst går igennem den, også emner og
    // klassens navn.
    const esc = (str) => escapeHtml(String(str || ''));

    // Et emne, eller '' — 'MATRIX' og 'M_' er pladsholdere på et matrixkort
    // uden emne, ikke emner.
    const topicOf = (g, prefix) => {
        const t = getTopic(g.name, prefix) || g.topic || '';
        return (t === 'MATRIX' || t === 'M_') ? '' : t;
    };

    // Fraværende elever står stadig i gruppen (kun papirkurven fjerner dem),
    // men de skal ikke stå på papiret som om de er der. Samme regel som på
    // gruppekortet — se isMemberAbsent() i utils.js.
    const memberAbsent = (m) => isMemberAbsent(m, data);
    const memberLine = (m) => {
        const name = esc(memberName(m));
        return memberAbsent(m)
            ? `<span class="name"><span class="absent">${name}</span> <span class="absent-note">fraværende</span></span>`
            : `<span class="name">${name}</span>`;
    };

    (standardGroups || []).forEach(g => {
        const topic = topicOf(g, 'S_');
        (g.members || []).forEach(m => {
            const cleanM = memberId(m);
            studentTopicMap[cleanM] = topic;
            standardGroupMap[cleanM] = groupShortName(g.name);
        });
    });

    // Én gruppe: navnet, emnet (hvis der er et) og eleverne. I matrixen står
    // stamgruppens emne — eller dens forkortede navn — ude til højre.
    const groupBlock = (g, prefix, withOrigin) => {
        const topic = topicOf(g, prefix);
        const members = (g.members || []).map(m => {
            let origin = '';
            if (withOrigin) {
                const id = memberId(m);
                const text = studentTopicMap[id] || standardGroupMap[id] || '';
                if (text) origin = `<span class="origin">${esc(text)}</span>`;
            }
            return `<li>${memberLine(m)}${origin}</li>`;
        }).join('');
        return `<div class="group"><h3>${esc(groupDisplayName(g.name))}</h3>`
            + (topic ? `<p class="topic">${esc(topic)}</p>` : '')
            + `<ul>${members || '<li class="empty">Ingen elever</li>'}</ul></div>`;
    };

    // Omfanget i hovedet: "28 elever · 7 stamgrupper · 3 matrixgrupper".
    // Eleverne tælles i ét gruppesæt (en elev står i én stamgruppe OG i én
    // matrixgruppe — talt i begge ville hun tælle to gange).
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const counted = new Set();
    (standardGroups || matrixGroups || []).forEach(g =>
        (g.members || []).forEach(m => counted.add(memberId(m))));
    const absentCount = [...counted].filter(id => isMemberAbsent(id, data)).length;
    // Hver del i sit eget span, der ikke må brydes: med et langt klassenavn
    // blev linjen ellers delt midt i "4 / matrixgrupper" (målt 12/9).
    const meta = [
        plural(counted.size, 'elev', 'elever'),
        standardGroups ? plural(standardGroups.length, 'stamgruppe', 'stamgrupper') : null,
        matrixGroups ? plural(matrixGroups.length, 'matrixgruppe', 'matrixgrupper') : null,
        absentCount ? `${absentCount} fraværende` : null,
    ].filter(Boolean).map(part => `<span class="meta-part">${esc(part)}</span>`).join(' · ');

    // Skriften hentes fra dida.dk selv — IKKE fra Googles CDN.
    // Resten af siden gør allerede det (/fonts/fonts.css), og udskriften var
    // det sidste sted der stadig sendte lærerens IP-adresse til Google, hver
    // gang hen printede en klasses grupper. Det passer hverken med GDPR-siden
    // ("dine data forlader aldrig din computer") eller med en skole uden
    // internet: en blokeret CDN gav bare en anden skrifttype på papiret.
    //
    // Vinduet er about:blank, så en relativ sti ville pege på ingenting i
    // nogle browsere — derfor den fulde adresse.
    const fontHref = `${window.location.origin}/fonts/fonts.css`;

    // Dato på papiret. En udskrevet gruppeliste ligger i en mappe eller på et
    // bord sammen med den forrige — uden datoen kan læreren ikke se hvilken
    // runde hen står med. Skrives på lærerens eget sprog og tidszone.
    const printDate = new Date().toLocaleDateString('da-DK', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    const win = window.open('', '_blank');
    if (!win) {
        window.notifyError("Popup blev blokeret af browseren. Tillad popups for at se oversigten.");
        return;
    }
    // Siger vi ikke hvorfor, ligner en udskrift uden matrix en fejl.
    if (!matrixGroups && state.storedMatrixGroups && state.storedMatrixGroups.length) {
        window.notifyInfo('Matrixgrupperne er ikke med på oversigten: de er dannet ud fra dine forrige stamgrupper. Åbn "Matrix", så dannes de forfra.');
    }
    const title = esc(state.currentClass ? state.currentClass.name : 'Klasse');
    // "Runde 1/2" giver kun mening, når der ER to runder på papiret.
    const both = !!(standardGroups && matrixGroups);

    // BEMÆRK: alt herunder ligger i en template-streng, så der må IKKE stå et
    // backtick i CSS-kommentarerne — heller ikke omkring et egenskabsnavn.
    // "npm run check" fanger det som "syntaksfejl — Missing semicolon", en
    // besked der peger et helt andet sted hen end årsagen. Brug anførselstegn.
    let html = `
     <!DOCTYPE html>
     <html lang="da">
     <head>
        <meta charset="utf-8">
        <title>Gruppeoversigt – ${title}</title>
        <link href="${fontHref}" rel="stylesheet">
        <style>
            @page { size: A4; margin: 14mm 14mm 16mm; }
            * { box-sizing: border-box; }
            body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: oklch(0.2 0 0); background: oklch(1 0 0); margin: 0; padding: 32px; font-size: 13px; }

            /* Hovedet: klassen til venstre, datoen og omfanget til højre. */
            .doc-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-block-end: 10px; border-block-end: 2px solid oklch(0.2 0 0); margin-block-end: 22px; }
            .doc-title { min-inline-size: 0; }
            .kicker { display: block; margin-block-end: 3px; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: oklch(0.5 0 0); }
            h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.2; overflow-wrap: break-word; }
            .meta { flex: 0 1 auto; max-inline-size: 45%; font-size: 11px; line-height: 1.5; color: oklch(0.45 0 0); text-align: end; }
            .meta-part { white-space: nowrap; }

            h2 { margin: 0 0 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: oklch(0.45 0 0); }
            section.mtx { margin-block-start: 28px; }
            /* minmax(0, 1fr): uden nul-minimum kunne et langt ord i én
               gruppe gøre dens kolonne bredere end de to andre. */
            .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px 22px; }

            /* En gruppe: tynd streg foroven, navnet, emnet, eleverne. */
            .group { break-inside: avoid; min-inline-size: 0; border-block-start: 1px solid oklch(0.2 0 0); padding-block-start: 7px; }
            .group h3 { margin: 0; font-size: 14px; font-weight: 700; }
            /* Emnet er dét gruppen skal ARBEJDE med — det må aldrig klippes.
               Det stod før i et mærkat med max-width og ellipsis, og
               "Globalisering og ulighed i Danmark" blev til "Globalisering
               og ..." på papiret. Nu er det en almindelig linje, der ombryder
               mellem ord. */
            .topic { margin: 1px 0 0; font-size: 12px; font-weight: 500; line-height: 1.35; color: oklch(0.4 0 0); overflow-wrap: break-word; }
            ul { list-style: none; margin: 8px 0 0; padding: 0; }
            /* flex-wrap: kan navnet og oprindelsen ikke stå på samme linje,
               rykker oprindelsen ned under navnet, højrestillet. Så bliver
               NAVNET aldrig klemt — i forslaget uden wrap blev "Sebastian
               Holm" delt over to linjer af "Globalisering og ulighed". */
            li { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 8px; padding-block: 3px; border-block-end: 1px solid oklch(0.9 0 0); line-height: 1.35; }
            li:last-child { border-block-end: 0; }
            /* Et navn bredere end hele kolonnen (ét langt ord) må brydes
               hvor som helst — ellers ville det stikke ud over kanten. */
            .name { min-inline-size: 0; overflow-wrap: anywhere; }
            /* break-word, IKKE anywhere: oprindelsen ombryder mellem ORD, så
               "Klimapolitik" aldrig bliver til "Klimapo / litik". */
            .origin { margin-inline-start: auto; font-size: 10px; color: oklch(0.45 0 0); text-align: end; overflow-wrap: break-word; }
            .absent { color: oklch(0.5 0 0); text-decoration: line-through; }
            .absent-note { font-size: 10px; font-style: italic; color: oklch(0.45 0 0); }
            li.empty { font-style: italic; color: oklch(0.55 0 0); }

            .no-print { margin-block-start: 28px; text-align: center; }
            .print-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; font: inherit; font-size: 13px; cursor: pointer; background: oklch(0.2 0 0); color: oklch(1 0 0); border: none; border-radius: 6px; }
            @media print {
                body { padding: 0; }
                /* Sideskiftet giver kun mening, når der står stamgrupper FØR
                   matrixafsnittet. Er matrix det eneste på siden, ville det
                   skubbe hele udskriften ned og efterlade en blank forside. */
                .mtx.after-std { break-before: page; margin-block-start: 0; }
                .no-print { display: none; }
            }
        </style>
     </head>
     <body>
        <header class="doc-head">
            <div class="doc-title"><span class="kicker">Gruppeoversigt</span><h1>${title}</h1></div>
            <div class="meta">${esc(printDate)}<br>${meta}</div>
        </header>
        ${standardGroups ? `<section class="std"><h2>${both ? 'Runde 1 · ' : ''}Stamgrupper</h2>
        <div class="grid">${standardGroups.map(g => groupBlock(g, 'S_', false)).join('')}</div>
        </section>` : ''}
        ${matrixGroups ? `<section class="mtx${standardGroups ? ' after-std' : ''}"><h2>${both ? 'Runde 2 · ' : ''}Matrixgrupper</h2>
        <div class="grid">${matrixGroups.map(g => groupBlock(g, 'M_', true)).join('')}</div>
        </section>` : ''}
        <div class="no-print">
            <button class="print-btn" onclick="window.print()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg> Udskriv</button>
        </div>
     </body>
     </html>
     `;
    win.document.write(html);
    win.document.close();
}
