// classShape.js — de former, en klasses regler, aftaler og grupper skal have.
//
// HVORFOR DEN FINDES (121. gennemsyn, tematik 112): en backup-fil er tekst,
// som alle kan rette i — en kollega, der har delt sin fil, et regneark, der
// har gemt den om, eller en fil, der er gået i stykker undervejs. Gendannelsen
// tjekkede kun den yderste form ("rules er en liste"), ikke hvad der stod I
// listen. En sonde med 23 forkerte former fandt fire, der gav en grøn
// kvittering ("1 klasse gendannet") og en klasse, der ikke virkede:
//
//   - en regel, der ikke er et objekt (fx `null`), eller hvis type ikke er
//     tekst: Grupper-fanen fik en fejl i beskederne, og "Dan grupper" kunne
//     ikke trykkes;
//   - en "Undgå hinanden"-aftale, der ikke er et objekt med en liste af id'er:
//     hver eneste gruppedannelse fejlede;
//   - gemte grupper, der ikke er lister af grupper med en elevliste: klassen
//     kunne slet ikke åbnes ("Fejl ved indlæsning af klasse");
//   - emner pr. gruppe, der ikke er tekst: emnerne kunne hverken læses eller
//     gemmes, så længe klassen var åben.
//
// Reglen er den samme som resten af backuppen: elevlisten er det vigtigste og
// gendannes altid. Det, der ikke har den rigtige form, lades ude, og
// kvitteringen siger hvad. Samme tjek bruges, når en klasse ÅBNES, så en
// klasse, der allerede ligger sådan i lageret (fra en gendannelse før denne
// rettelse), kan åbnes igen.

/** Et almindeligt objekt (ikke null, ikke en liste). */
export function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Felterne i en regel, som appen behandler som tekst (`.toLowerCase()`,
// kolonnenavne). Mangler de, er det i orden — så er reglen bare tom.
const RULE_TEXT_FIELDS = ['type', 'name', 'column', 'attribute'];

/** Har reglen en form, appen kan regne på? */
export function isRuleShape(rule) {
    return isRecord(rule)
        && RULE_TEXT_FIELDS.every(key => rule[key] == null || typeof rule[key] === 'string');
}

/**
 * En "Undgå hinanden"-aftale: `{ ids: [...] }`. Kun selve listen kræves —
 * det var en aftale, der var `null`, eller `ids` som tekst, der væltede
 * dannelsen. Hvad der står I listen (id'er, eller elevnavne i en gammel
 * klasse, måske et tal fra en Excel-celle) tåler appen allerede (String(id)),
 * og en aftale må ikke forsvinde, fordi ét navn har en uventet form.
 */
export function isSeparationShape(sep) {
    return isRecord(sep) && Array.isArray(sep.ids);
}

/**
 * Del en liste i det brugbare og det, der ikke har formen.
 * Er `list` slet ikke en liste, er der intet at beholde og intet at tælle.
 *
 * @returns {{ kept: Array, dropped: number }}
 */
export function keepShaped(list, isShaped) {
    if (!Array.isArray(list)) return { kept: [], dropped: 0 };
    const kept = list.filter(item => isShaped(item));
    return { kept, dropped: list.length - kept.length };
}

/**
 * Én gruppeliste (stam- eller matrixgrupper). Bevidst rummelig: en gruppe
 * skal bare være et objekt med en elevliste uden huller. Navnet må være
 * hvad som helst (groupDisplayName laver det om til tekst), og et medlem må
 * være et id ("r7") eller et objekt fra en gammel session ({ id, name }).
 * For streng her ville skjule rigtige grupper — og et senere gem ville så
 * skrive dem væk.
 */
export function isGroupList(value) {
    return Array.isArray(value) && value.every(g => isRecord(g)
        && Array.isArray(g.members) && g.members.every(m => m != null));
}

/** Det, der ligger under klassens gruppenøgle: `{ standard, matrix, … }` eller null. */
export function isStoredGroups(value) {
    return value === null || (isRecord(value)
        && ['standard', 'matrix'].every(key => value[key] == null || isGroupList(value[key])));
}

/** Emnet pr. gruppe: `{ "S_Group 1": "Klima", … }` — kun tekst eller null. Samme krav som getTopicMap(). */
export function isTopicMap(value) {
    return isRecord(value)
        && Object.values(value).every(topic => topic === null || typeof topic === 'string');
}

// ─── Gruppenavne (122. gennemsyn, tematik 113) ───────────────────────────
//
// Gruppens navn ("Group 3") er dens IDENTITET i appen, ikke bare en
// overskrift: kortene tegnes med `:key="group.name"`, træk-og-slip finder
// kildegruppen på navnet, og emnekortet gemmer emnet under "S_Group 3".
// To grupper med samme navn, eller en gruppe uden navn, gav derfor kort, der
// byttede indhold, et træk der landede i den forkerte gruppe, og et emne, der
// ikke blev gemt. Sådan et navn kan kun komme udefra: en gemt session eller
// en backup, der er rettet i hånden. Appen selv navngiver altid "Group N".

/** Navnet som tekst, hvis det kan bruges som navn — ellers null. */
function nameText(name) {
    if (typeof name === 'string') return name.trim() ? name : null;
    if (typeof name === 'number' && Number.isFinite(name)) return String(name);
    return null;
}

/**
 * Giv hver gruppe et brugbart navn, der ikke findes to gange.
 *
 * Et navn, der allerede er tekst og ikke er taget, bliver stående (også
 * emnet, der hører til det). Mangler navnet, er det ikke tekst, eller er det
 * taget af en gruppe før, får gruppen det første ledige "Group N" — ledigt
 * også blandt de navne, der kommer SENERE i listen, så en ny "Group 2" ikke
 * støder ind i en rigtig "Group 2" længere nede.
 *
 * Rettes på stedet (grupperne er nylæste kopier).
 *
 * @returns {number} hvor mange grupper der fik et nyt navn
 */
export function giveUsableGroupNames(groups) {
    if (!Array.isArray(groups)) return 0;
    const used = new Set(groups.map(g => (isRecord(g) ? nameText(g.name) : null)).filter(Boolean));
    const seen = new Set();
    let next = 1;
    let renamed = 0;
    groups.forEach(g => {
        if (!isRecord(g)) return;
        const name = nameText(g.name);
        if (name !== null && !seen.has(name)) {
            seen.add(name);
            if (g.name !== name) g.name = name;   // et tal bliver til tekst
            return;
        }
        while (used.has(`Group ${next}`)) next++;
        g.name = `Group ${next}`;
        used.add(g.name);
        seen.add(g.name);
        renamed++;
    });
    return renamed;
}

/**
 * Et gruppeemne som tekst. Tekst bliver stående, et tal bliver til tekst,
 * alt andet (et objekt, en liste) er intet emne. Før blev et objekt til
 * emnet "[object Object]" — også i klassens emneliste.
 */
export function topicText(topic) {
    if (typeof topic === 'string') return topic;
    if (typeof topic === 'number' && Number.isFinite(topic)) return String(topic);
    return '';
}

/**
 * Kan gruppestørrelsen (`settings.groupTarget`) bruges som tal? Mangler den,
 * er det i orden — så viser opskriften sin standard. Er den der, skal den
 * være et tal på mindst 1 (tekst som "5" er fint; det er sådan, den gemmes).
 *
 * HVORFOR (121. gennemsyn, småting (a); rettet i 122.): en backup med
 * `groupTarget: "abc"` gav et tomt talfelt i opskriften, og "Dan grupper"
 * sendte `clampTarget("abc")` = 1 til motoren — grupper af én elev, uden
 * en besked.
 */
export function isUsableTarget(value) {
    if (value == null) return true;
    if (typeof value !== 'number' && typeof value !== 'string') return false;
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 1;
}
