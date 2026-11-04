// groupExport.js — grupperne ud af programmet: som liste og som Excel-fil.
//
// HVORFOR ÉN MODEL: "Kopiér" og Del-menuens Excel-filer skal vise præcis de
// samme navne, emner og fraværs-markeringer. Stod logikken to steder, ville
// de før eller siden drive fra hinanden — det skete for udskriften, for
// sessionerne og for Excel-eksporten inden for samme uge (se docs/grupper.md
// → "Udgangene"). `buildGroupTable()` er derfor den ENESTE, der bestemmer,
// hvad der står om en gruppe. Kopi-teksten og regnearket er bare to måder at
// lægge den samme tabel ud på.
//
// BEMÆRK: kopi-teksten læses tilbage af "Gendan" (restoreGroups.js →
// cleanMemberLine), så dens format må ikke ændres et tegn — heller ikke
// rækkefølgen "(kilde) (fraværende)" bag navnet.

import { state } from './state.js';
import * as storage from './storage.js';
import { EXCEL_UNAVAILABLE_MESSAGE, reportPartUnavailable } from './newBuild.js';
import {
    memberDisplayName, memberIdStr, isMemberAbsent, groupDisplayName, groupShortName,
    todayStamp, safeFileName,
} from './utils.js';

/** Navnene på de to gruppesæt, som de står på fanerne i Excel-filen. */
export const SET_LABELS = { standard: 'Stamgrupper', matrix: 'Matrixgrupper' };

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Grupperne i ét sæt, som de skal stå på en udgang.
 *
 * @param {boolean} isMatrix        matrix- eller stamgrupper
 * @param {boolean} includeSource   sæt elevens stamgruppe i parentes (kun matrix)
 * @returns {Array<{heading: string, members: string[]}>|null}
 *   én post pr. gruppe — overskriften er "Gruppe 1 - Emne" (eller bare
 *   "Gruppe 1"), og hver elev er én færdig linje. null hvis der ingen grupper er.
 */
export function buildGroupTable(isMatrix, includeSource = false) {
    const groups = isMatrix ? state.storedMatrixGroups : state.storedStandardGroups;
    if (!groups || groups.length === 0) return null;

    const topicPrefix = isMatrix ? 'M_' : 'S_';
    const nameOf = (m) => memberDisplayName(
        m, state.currentClass?.data, state.displayColumn);

    // Opslaget "hvilken stamgruppe kom eleven fra" sker på IDENTITET (_rowId),
    // ikke på navnet — to elever må gerne hedde det samme.
    let sourceById = null;
    if (includeSource && isMatrix && state.storedStandardGroups) {
        sourceById = new Map();
        state.storedStandardGroups.forEach(sg => {
            const sName = groupShortName(sg.name);
            const sTopic = storage.getTopic(sg.name, 'S_')
                || ((sg.topic && sg.topic.trim().length > 0) ? sg.topic.trim() : null);
            const info = sTopic ? `${sName} - ${sTopic}` : sName;
            (sg.members || []).forEach(m => {
                const id = memberIdStr(m);
                // Første fund vinder — samme som den tidligere break-løkke.
                if (id && !sourceById.has(id)) sourceById.set(id, info);
            });
        });
    }

    return groups.map(g => {
        const resolvedTopic = storage.getTopic(g.name, topicPrefix) || g.topic || '';
        // 'MATRIX' og 'M_' er pladsholdere på et matrixkort uden emne, ikke emner.
        const topic = (resolvedTopic && resolvedTopic !== 'MATRIX' && resolvedTopic !== 'M_')
            ? resolvedTopic : '';
        const name = groupDisplayName(g.name);

        const members = (g.members || []).map(m => {
            let line = nameOf(m);
            const info = sourceById ? sourceById.get(memberIdStr(m)) : null;
            if (info) line += ` (${info})`;
            // Fraværende elever står stadig i gruppen — kun papirkurven tager
            // dem ud. Uden markeringen lægger læreren en liste på Lectio med
            // elever, der ikke er der. Samme regel som kortet og udskriften.
            if (isMemberAbsent(m, state.currentClass?.data)) line += ' (fraværende)';
            return line;
        });

        return { heading: topic ? `${name} - ${topic}` : name, members };
    });
}

/**
 * Er der en matrix, der kan komme med ud?
 *
 * 'stale' er en matrix, der hører til de FORRIGE stamgrupper (se
 * matrixGroupsStale i state.js). Udskriften og Excel-eksporten udelader den
 * af samme grund, og det skal Del-menuen også.
 *
 * @returns {'ok'|'stale'|'none'}
 */
export function matrixAvailability() {
    const matrix = state.storedMatrixGroups;
    if (!Array.isArray(matrix) || matrix.length === 0) return 'none';
    return state.matrixGroupsStale ? 'stale' : 'ok';
}

/**
 * Én kolonne pr. gruppe: overskriften i første række, eleverne nedenunder.
 * Kortere grupper fyldes op med tomme celler, så arket er et rektangel.
 */
export function toColumnsSheet(table) {
    const height = table.reduce((max, g) => Math.max(max, g.members.length), 0);
    const rows = [table.map(g => g.heading)];
    for (let i = 0; i < height; i++) rows.push(table.map(g => g.members[i] ?? ''));
    return rows;
}

/** Én række pr. gruppe: overskriften i første celle, eleverne ud til højre. */
export function toRowsSheet(table) {
    return table.map(g => [g.heading, ...g.members]);
}

/**
 * Kolonnebredder efter indholdet.
 *
 * Uden dem åbner Excel arket med sin standardbredde, og "Gruppe 3 - Globalisering"
 * står klippet af, indtil læreren selv trækker kolonnen bredere. Loftet på 40
 * tegn holder et meget langt emne fra at skubbe resten ud af billedet — teksten
 * står der stadig i sin helhed, den ombrydes bare ikke.
 */
function columnWidths(rows) {
    const widths = [];
    for (const row of rows) {
        row.forEach((cell, i) => {
            widths[i] = Math.max(widths[i] || 0, String(cell ?? '').length);
        });
    }
    return widths.map(w => ({ wch: Math.min(40, Math.max(10, w + 2)) }));
}

/** "3_a - stamgrupper - 2026-09-12.xlsx" — klassens navn gjort lovligt som filnavn. */
function workbookFileName(sheets) {
    const what = sheets.length > 1 ? 'grupper' : sheets[0].name.toLowerCase();
    return `${safeFileName(state.currentClass?.name)} - ${what} - ${todayStamp()}.xlsx`;
}

/**
 * Hent grupperne som en Excel-fil.
 *
 * @param {Object} opts
 * @param {Array<'standard'|'matrix'>} opts.sets  hvilke gruppesæt — ét ark pr. sæt
 * @param {'columns'|'rows'} opts.layout          grupperne i kolonner eller rækker
 * @returns {Promise<boolean>} true når filen er givet til browseren
 */
export async function downloadGroupsWorkbook({ sets, layout }) {
    const sheets = [];
    for (const set of sets) {
        const isMatrix = set === 'matrix';
        // Menuen tilbyder ikke en forældet matrix, men funktionen stoler ikke
        // på, at kalderen har spurgt først.
        if (isMatrix && matrixAvailability() !== 'ok') continue;
        const table = buildGroupTable(isMatrix);
        if (!table) continue;
        const rows = layout === 'rows' ? toRowsSheet(table) : toColumnsSheet(table);
        sheets.push({ name: SET_LABELS[set], rows });
    }

    if (sheets.length === 0) {
        window.notifyInfo?.('Der er ingen grupper at lægge i en Excel-fil.');
        return false;
    }

    // Excel-biblioteket er stort (knap 500 kB) og hentes først her, når
    // læreren faktisk beder om en fil. Se src/vendor/README.md for hvorfor det
    // ligger i repo'et i stedet for at komme fra npm.
    let XLSX;
    let saveAs;
    try {
        XLSX = await import('../../vendor/xlsx.mjs');
        ({ saveAs } = await import('file-saver'));
    } catch (e) {
        console.error(e);
        await reportPartUnavailable(e, EXCEL_UNAVAILABLE_MESSAGE);
        return false;
    }

    try {
        const wb = XLSX.utils.book_new();
        for (const sheet of sheets) {
            // aoa_to_sheet skriver strenge som tekst-celler: et navn der
            // begynder med "=" bliver stående som tekst, ikke som en formel.
            const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
            ws['!cols'] = columnWidths(sheet.rows);
            XLSX.utils.book_append_sheet(wb, ws, sheet.name);
        }
        const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        saveAs(new Blob([bytes], { type: XLSX_MIME }), workbookFileName(sheets));
    } catch (e) {
        console.error(e);
        window.notifyError?.('Excel-filen kunne ikke laves.');
        return false;
    }

    window.notifySuccess?.('Excel-filen er hentet.');
    return true;
}
