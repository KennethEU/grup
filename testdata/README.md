# Testdata til Grupper

Fælles testdata, som vitest og e2e læser fra **samme fil**.
Mappen ligger uden for `public/`, så den hverken bygges med ud eller uploades.

**Alle navne her er opdigtede.** Kommer der et eksempel fra en rigtig klasse
(fx en Lectio-liste), bruges det kun som FORMAT — navnene skiftes ud, før
noget gemmes her. Rigtige elevnavne må aldrig ligge i repo'et.

## `realistisk_klasse.json` — en klasse som de ser ud i virkeligheden

De gamle testklasser er pæne: køn skiftevis 50/50, karakterer i fast
cyklus, ingen tomme celler. Med dem ses fx aldrig beskeden om, at "Fordel"
ikke kan gå helt op, og en fejl i motoren kan gemme sig bag et mønster, der
giver perfekte grupper af sig selv. Denne klasse har det, rigtige hold har:

| Kolonne | Hvad den prøver af |
|---|---|
| Navn | To elever der begge hedder "Emil Hansen", et navn med komma ("Hansen, Bo"), bindestreg, æøå og et meget langt navn |
| Køn | Skævt: 17 piger, 9 drenge, 1 "Andet" — plus "dreng" med lille d og "Pige " med mellemrum til sidst |
| Karakter | Den danske skala som tekst: "02", "00", "-3" — én "Fritaget" og én tom celle |
| Snit | Decimaltal med komma ("7,5") og én tom celle |
| Niveau | Lav/Middel/Høj, én "høj" med lille h og én tom celle |
| Sprog | En sjælden værdi: kun én elev har "Spansk" |
| Emne | Ulige store emner: 10, 8, 5 og 4 elever |
| Bemærkning | Mest tomme celler, "(syg, fritaget)" (parentes + komma) og en celle med linjeskift |

`scenario` er en hverdagstilstand oven på klassen: tre fraværende, én
"Skal sammen" og to undgåelser. Eleverne peges på med **rækkenummer**
(0-baseret), fordi to elever hedder det samme.

**Brugt af:** `src/js/modules/realistiskKlasse.test.js`, `e2e/realistisk_klasse.spec.ts`.

**Ændrer du klassen**, så tjek at testene stadig måler det, deres kommentarer
siger — flere af dem regner med de præcise tal ovenfor.

## `lectio_elevliste.txt` — sådan ser en liste kopieret fra Lectio ud

Én elev pr. linje: `Fornavn Mellemnavn Efternavn, <hold> <nr> (<hold>)`.
To til fire navneled, æøå, bindestreg og elevnumre med to og tre cifre.
Formatet er taget fra en rigtig liste (september 2026); navnene er opdigtede.

**Brugt af:** `src/js/modules/lectio.test.js`, `e2e/realistisk_klasse.spec.ts`.

## `kontrakt/` — input i den nye motors format

Testklasser i formatet fra `docs/grupper-js-motor-kontrakt.md` (version 2, afsnit 2):
kontraktens eget eksempel, den realistiske klasse som stamgrupper og som
matrix, en låst gruppe med et forældet emne, og en Skal sammen-blok, der er
for stor. Ingen navne — kun `_rowId` og reglernes kolonner. (Adapteren, der
kørte den gamle Python-motor på dem, er fjernet 3/11 2026.)

## `svaer_testklasse.json` — Kenneths svære testklasse (backup-format)

30 opdigtede elever med fem regler (Adskil "Ordstyrer" i Rolle, Klyng på
Sprog, Fordel på Køn, Balancér på Fagligt niveau, Fordel på
Aktivitetsniveau), to Skal sammen og to Undgå hinanden. Gendannes som en
backup (Import & backup). Kenneth lavede den 3/11 2026 til at prøve den nye
motor af.

**Brugt af:** `e2e/motor_beta.spec.ts` ("hvad blev opfyldt").
