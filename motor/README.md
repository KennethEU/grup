# grup.dk's gruppemotor

Motoren, der danner grupperne i grup.dk. Ren JavaScript (ES-moduler), ingen
tredjepartsbiblioteker; den kører i browseren i Web Workers.

| Mappe | Indhold |
|-------|---------|
| `engine/` | Selve motoren. Appen henter den herfra (`grup.dk/src/js/modules/engine-worker.js`) |
| `tests/` | Motorens egne tests (`node --test`) |
| `judge/` | Dommeren: bedømmer et svar uafhængigt af motoren (se `judge/README.md`) |
| `testdata/` | Testklasserne, bl.a. sæt 1 og 2 |
| `spec/`, `resultater/`, `gennemgang/` | Specifikationen og målingerne — dokumentation |
| `tools/` | Hjælpescripts til målinger |

## Regel: en ændring i `engine/` skal bestå tests og dommer

Fra `grup.dk/`:

```bash
npm run test:motor
```

Det kører `node --test` på `tests/` og `judge/test/` (fra denne mappe, for
testene finder `testdata/` ud fra den). Sæt 1 og 2 måles kun igen, når
søgningen eller rangordenen ændres. Appens egne tests (vitest og e2e i
`grup.dk/`) skal også bestå.

## Historie

Motoren blev skrevet i et rent rum: kun ud fra `spec/`, uden at se Grupper's
kode. Projektet lå for sig selv (`grup-motor`) frem til fde41c2 og blev 3/11
2026 lagt ind i dida.dk med hele sin historik (`git subtree add`), da Kenneth
lukkede opdelingen. Den historik er dokumentationen for, at motoren er vores
egen.
