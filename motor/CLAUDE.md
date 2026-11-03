# CLAUDE.md — grup.dk's gruppemotor

Motoren, der danner grupperne i grup.dk. Den er en del af dida.dk-projektet,
og projektets CLAUDE.md (øverst i dida.dk) gælder også her.

## Ren-rummet er slut (3/11 2026)

Motoren blev skrevet i et rent rum i sit eget projekt (`~/Documents/AI/grup-motor`):
kun ud fra `spec/`, uden at se Grupper's eller GroupEng's kode. Historikken
til og med fde41c2 dokumenterer det. Kenneth lukkede opdelingen 3/11 2026 for
enkelhedens skyld, og motoren bor nu her i `grup.dk/motor/`. Alle må læse og
rette den.

## Regel: en ændring i `engine/` skal bestå tests og dommer

Fra `grup.dk/`: `npm run test:motor` (motorens tests og dommeren). Sæt 1 og 2
måles kun igen, når søgningen eller rangordenen ændres. Appens egne tests
(vitest og e2e i `grup.dk/`) skal også bestå. Se README.md og
`docs/grupper.md` ("Motoren bor i grup.dk/motor/").

## Stil

- Ren JavaScript (ES-moduler), ingen tredjepartsbiblioteker i `engine/`. Den
  skal kunne køre i en Web Worker i browseren.
- Kode på engelsk, kommentarer og dokumentation på dansk.
- `spec/` og `resultater/` er historisk dokumentation; ret dem ikke.
