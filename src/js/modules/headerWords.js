// headerWords.js — ord, der kun står øverst i en kolonne, aldrig som en elev.
//
// Bruges af importData.js (er første linje kolonnenavne?) og lectio.js (en
// linje med kolonnenavne ved siden af en Lectio-liste er ikke en elev). De lå
// før i importData.js, men lectio.js kan ikke importere den: importData.js
// importerer selv lectio.js.

// Ord, der kun står øverst i en kolonne, aldrig som en elev. Små bogstaver.
// Danske og de almindelige engelske (testene og nogle eksporter bruger "Name").
export const HEADER_WORDS = new Set([
    'navn', 'navne', 'fornavn', 'fornavne', 'efternavn', 'fulde navn', 'elev', 'elever',
    'elevnavn', 'køn', 'klasse', 'hold', 'niveau', 'id', 'nr', 'nr.', 'nummer', 'e-mail',
    'email', 'mail', 'karakter', 'karakterer', 'gruppe', 'emne', 'info', 'bemærkning',
    'bemærkninger', 'studieretning', 'alder', 'fødselsdag', 'type',
    // Engelske kolonnenavne (fx en eksport fra et engelsksproget system).
    'name', 'names', 'first name', 'last name', 'surname', 'full name', 'student',
    'students', 'gender', 'sex', 'class', 'group', 'level', 'grade', 'age',
]);
