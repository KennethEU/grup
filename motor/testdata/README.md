# Testdata

Opdigtede klasser til at afprøve den nye motor og dommeren. **Alle navne er
opdigtede** — rigtige elevnavne må aldrig ligge her. Filerne er data, ikke
kode, og er kopieret ind fra Grupper.

## `realistisk_klasse.json` — en klasse, som de ser ud i virkeligheden

27 elever med de skævheder, rigtige hold har, så en fejl ikke kan gemme sig
bag pæne tal:

| Kolonne | Hvad den prøver af |
|---|---|
| Navn | To elever, der begge hedder "Emil Hansen", et navn med komma, bindestreg, æøå og et meget langt navn |
| Køn | Skævt: 17 piger, 9 drenge, 1 "Andet", plus "dreng" med lille d og "Pige " med mellemrum til sidst |
| Karakter | Den danske skala som tekst ("02", "00", "-3"), én "Fritaget" og én tom celle |
| Snit | Decimaltal med komma ("7,5") og én tom celle |
| Niveau | Lav/Middel/Høj, én "høj" med lille h og én tom celle |
| Sprog | En sjælden værdi: kun én elev har "Spansk" |
| Emne | Ulige store emner: 10, 8, 5 og 4 elever |
| Bemærkning | Mest tomme celler, parenteser og komma, og en celle med linjeskift |

`scenario` er en hverdag oven på klassen: tre fraværende, én "Skal sammen"
og to "Undgå hinanden". Eleverne peges på med **rækkenummer** (fra 0), fordi
to elever hedder det samme.

## `elever_29.csv` — en pæn klasse på 29

Navn, Alder, Karakter, Aktivitetsniveau (Høj/Middel/Lav), Emne, Køn,
Tidligere_gruppe og Sprog. Jævne fordelinger; godt som "nem" klasse.

## `fordel_gamle_grupper_16.csv` — 16 elever med fem tidligere grupperinger

Hver kolonne er en gammel gruppedannelse ("Gruppe 1" … eller bare et tal).
Lærerne bruger den slags med en Fordel-regel pr. kolonne for at undgå, at
eleverne kommer sammen med de samme igen (se svar 15 i `spec/svar.md`).

## `gen/` — generatoren af testklasser

Laver kontrakt-input (version 2), som appen ville sende dem: fraværende og
låste elever er taget ud, aftalerne er renset, og kun de kolonner, en regel
bruger, er med. Alt laves ud fra faste frø, og hvert input tjekkes mod
kontrakten (`judge/validate.mjs`), før det skrives.

| Fil | Hvad den laver |
|---|---|
| `random-class.mjs` | Tilfældige klasser på 8–300 elever. De har skæve fordelinger, tomme celler, decimalkomma og rod i skrivemåden. Niveau (Lav/Middel/Høj) kommer med og uden rangering, og der er sjældne værdier. Opskrifterne er tilfældige med 1–6 regler, aftaler, fravær, låste grupper, emner og matrix |
| `planted.mjs` | "Plantede" klasser: først en perfekt deling, så data, der passer til den. Den plantede deling giver 0 på alle regler |
| `boundary.mjs` | Grænsetilfælde. Fx præcis så mange at adskille, som der er grupper, og én for mange; blokke, der lige passer, og blokke, der ikke kan pakkes; Klyng med mange enlige; matrix med ulige og tomme kilder |
| `real.mjs` | De tre filer ovenfor lavet om til input med opskrifter, en lærer kunne lave |
| `build-set.mjs` | Bygger det faste sæt 1 |

## `saet-1/` — det faste sæt til sammenligningen

300 input. Hvert input er én fil, og `_index.json` beskriver dem. Sættet
indeholder:

- 22 fra de rigtige klasser,
- 34 grænsetilfælde,
- 48 plantede klasser,
- 173 tilfældige stamgruppe-dannelser,
- 23 tilfældige matrix-dannelser.

Sættet laves igen med `node testdata/gen/build-set.mjs`, og en test sikrer, at
det bliver præcis det samme. I `saet-1-facit/` ligger den plantede deling for
hver plantet klasse (i kontraktens svarformat).

Den nuværende motors svar på sættet kommer i `saet-1-nuvaerende/`. De kommer
som data fra den kendte side, aldrig som kode. Et svar skal hedde som sit input,
eventuelt med frøet bagefter: `001-…json` eller `001-….seed3.json`.

## `saet-2/` — et sæt, motoren aldrig er indstillet efter

300 nye input med helt andre frø end sæt 1. Frøene laves af sættets navn. Der
er de samme slags tilfældige, plantede og matrix-klasser som i sæt 1, men ikke
de rigtige klasser og grænsetilfældene, for de er ens i alle sæt. Sættet
indeholder:

- 48 plantede klasser,
- 230 tilfældige stamgruppe-dannelser,
- 22 tilfældige matrix-dannelser.

Ingen klasse findes også i sæt 1. Facit til de plantede ligger i
`saet-2-facit/`.

Sættet laves igen med `node testdata/gen/build-set.mjs saet-2`, og en test
sikrer, at det bliver præcis det samme.

Den nuværende motors svar kommer i `saet-2-nuvaerende/`. Den nye motor må først
køres på sættet, når de svar ligger der, så sammenligningen er fair.
