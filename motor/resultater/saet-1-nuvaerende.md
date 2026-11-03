# Den nuværende motor på testsæt 1: dommerens karakter

*3/11 2026, opdateret efter svar7. Dommeren har bedømt den nuværende motors 300 svar på sæt 1 alene
ud fra "hvem er i hvilken gruppe". Alle tal står i
[saet-1-nuvaerende.json](saet-1-nuvaerende.json). Det er målestokken, den nye
motor senere skal holdes op imod.*

## Kort fortalt

- **300 svar:** 268 med grupper, 32 stoppet som "umulig".
- **Alle 32 stop var rigtige.** Dommeren finder selv en grund i hvert eneste.
- **5 af de 268 bryder et fast krav, og alle 5 er forklaret.**
  - 3 er en kendt fejl i dag: antallet af grupper, når der er både emner og
    Opdel. Den nye motor skal gøre det rigtigt (svar7 40).
  - 2 er matrix "Fuld".
  - Et sjette svar (164) er godkendt efter svar7 41.
- **De tunge regler klares godt.** Adskil altid og Undgå hinanden når det bedst
  mulige i alle tilfælde. Alle tunge regler når det bedst mulige i 183 af 206
  input.
- **Alle 48 plantede klasser løses perfekt** (0 på alle regler).
- **Svagest er Fordel med dagens "opfyldt"-test og Klyng.** Fordel er fuldt
  opfyldt i 30 %, Klyng i 51 %.
- **Tid i alt ca. 291 sekunder.** Det længste svar tog 27 sekunder; hold over
  100 elever tog i snit 6 sekunder.

## 1. Faste krav: 5 svar fejler, alle forklaret

| Svar | Hvad dommeren fandt | Hvem tager fejl? |
|---|---|---|
| `143-tilfaeldig-39` | 7 grupper i stedet for 8; i "2.b" grupper på 4, 4, 4, 5 med "4 pr. gruppe −1" | **Den nuværende motor, en kendt fejl** (svar7 40). Med emner regner den antallet for hele klassen og deler det bagefter mellem Opdel-puljerne. Den nye motor regner pr. pulje: **bevidst forbedring** |
| `207-tilfaeldig-103` | 5 grupper i stedet for 7; grupper på 4 med "2 pr. gruppe +1" | Samme: bevidst forbedring |
| `274-tilfaeldig-170` | 3 grupper i stedet for 4; én gruppe på 7 med "5 pr. gruppe +1" | Samme: bevidst forbedring |
| `213-matrix-109` | Matrix "Fuld": to af kilderne er slet ikke med i den ene matrixgruppe | **Den nuværende motor.** "Mindst én fra hver kilde" er en garanti i dag (svar2 7). Klassen er ekstrem (258 elever, 65 stamgrupper, 2 matrixgrupper), men garantien er brudt |
| `194-matrix-90` | Matrix "Fuld": emnet "Medier" fordelt 1, 3, 2 i stedet for jævnt | **Ingen fejl i dag.** Jævnhed pr. kilde er et nyt krav (svar5 34); i dag er det kun et hensyn. Den nye motor skal gøre det bedre her |

`164-tilfaeldig-60` stod her før. Den nuværende motor giver 5 grupper på 4–5
(21 elever, 6 pr. gruppe "−1", 5 emner). Det er rigtigt: ved "−1" får hvert
emne én gruppe, når størrelsen ellers ville give færre grupper end emner
(svar7 41). Dommeren godtager det nu.

Dommeren selv har vist sig at regne rigtigt i alle tilfælde: de afvigelser,
den melder, er der faktisk. De 5 input står i
[kendte-forskelle.json](kendte-forskelle.json). I sammenligningen er den
nuværende motors svar dér ikke en målestok; den nye motor skal blot overholde
de faste krav.

Ved Opdel med "antal grupper" fulgte den nuværende motor reglen ved lighed
mellem puljer (svar6 37) i alle 11 tilfælde, hvor den gjaldt.

## 2. De 32 "umulige": dommeren er enig i alle

| Grund (kontraktens kode) | Antal |
|---|---|
| Skal sammen-blok for stor til en gruppe (`together-too-big`) | 9 |
| Blok mod en Adskil- eller Adskil altid-regel (`together-vs-separate`) | 9 |
| Blok på tværs af Opdel-puljer (`together-across-pool`) | 8 |
| Blok mod Undgå hinanden (`together-vs-avoid`) | 4 |
| Blok på tværs af en låst gruppe (`together-across-lock`) | 3 |
| Matrix-kilde uden elever (`matrix-empty-source`) | 2 |
| Blokkene kan ikke pakkes (`together-cannot-pack`) | 1 |

Nogle input har flere grunde. Omvendt stoppede motoren ingen steder, hvor den
ikke skulle: ingen af de 268 svar med grupper burde have stoppet.

## 3. Reglerne én for én (de 268 svar med grupper)

"Opfyldt" er lærerens opfyldt / ikke opfyldt. "Ved det bedst mulige" betyder,
at tallet er lig dommerens nedre grænse. **Grænsen er ikke altid til at nå**,
især når to tunge regler konkurrerer. "Ikke ved grænsen" betyder derfor:
måske kan det gøres bedre, ikke nødvendigvis at motoren har fejlet.

| Regel | Antal | Fuldt opfyldt | Ved det bedst mulige | Gns. afstand til grænsen |
|---|---|---|---|---|
| Adskil altid | 72 | 56 (78 %) | **72 (100 %)** | 0 |
| Undgå hinanden (input med aftaler) | 93 | 83 (89 %) | **93 (100 %)** | 0 |
| Adskil | 112 | 75 (67 %) | 107 (96 %) | 0,42 par |
| Klyng | 69 | 35 (51 %) | 53 (77 %) | 0,52 elever |
| Matrix: højst én fra hver kilde | 25 | – | 19 (76 %) | – |
| Fordel | 267 | 79 (30 %) med dagens test | 199 (75 %) | 0,73 |
| Balancér | 92 (9 ikke målt) | 60 af 83 (72 %) | – (ingen kendt grænse) | – |
| Ensartede | 83 (7 ikke målt) | 52 af 76 (68 %) | – | – |
| Saml | 61 | 37 (61 %) med det nye mål | 29 af 48 (60 %) | 2,15 |
| Opdel | 47 | 47 (100 %) | 47 (100 %) | 0 |

Ved Balancér og Ensartede findes ingen nedre grænse, så der er tallet holdt op
mod en tilfældig deling i stedet:

- Balancér ligger på ca. 7 % af det tilfældige (midterste værdi).
- Ensartede ligger på ca. 15 %.
- Saml med tal ligger på ca. 64 %, altså kun lidt bedre end tilfældigt.

## 4. Rangordenen: hvor ofte når motoren det bedst mulige på de tunge regler?

| Trin | Ved det bedst mulige |
|---|---|
| 1. Adskil altid | 72 af 72 regler |
| 2. Undgå hinanden | 93 af 93 input |
| 3. Matrix, én fra hver kilde | 19 af 25 matrix-input |
| 4. Adskil og Klyng | 160 af 181 regler |
| **Alle tunge trin på én gang** | **183 af 206 input med tunge regler (89 %)** |

## 5. De vigtigste fund

1. **Dagens Fordel-test kan sjældent nås.** Dagens "opfyldt" kræver, at alle
   værdier er med i hver gruppe, og ingen står for mange gange. Det sker i kun
   30 % af Fordel-reglerne. Det nye "retfærdige antal" er nået i 75 %. I 122
   tilfælde er grupperne så jævne, som klassen tillader, men dagens test siger
   alligevel "ikke opfyldt". Det er den skæve fordeling, vi kender:
   motorens egen besked siger "det er klassens sammensætning".
2. **Den nederste regel får mindre opmærksomhed.** Når der er flere
   Balancér/Ensartede-regler, er den første på ca. 37 % af en tilfældig
   deling, de senere på ca. 48 %. Det passer med dagens besked om, at kun den
   første styrer. Det er her, de trinvise vægte skal gøre det bedre.
3. **Adskil med mange elever giver plads til forbedring.** I tre store hold
   ligger Adskil klart over grænsen:
   - `278`: 105 par mod 73,
   - `161`: 25 mod 20,
   - `271`: 21 mod 13.

   I `271` er der kun en Fordel-regel ved siden af, så grænsen burde kunne
   nås næsten.
4. **Klyng når grænsen i 77 %, men kun opfyldt i 51 %.** Ofte er det
   uundgåeligt: en værdi, som kun én elev har. I 16 regler er der mere at
   hente, især hvor to Klyng-regler eller en Skal sammen-blok konkurrerer.
5. **Matrix "Fuld" holder ikke altid kilderne jævne.** Det sker i 2 af 25
   matrix-input (`194`, `213`), og i `213` bryder den endda garantien "mindst
   én fra hver kilde".

## 6. Hvad det betyder for kravet "aldrig dårligere på de tunge regler"

- **Målestokken er nu fastlagt pr. input.** Den nye motors *dårligste* frø
  skal være mindst lige så god som denne baseline på trin 1–4. Det tjekkes med
  `compare`. (Den nuværende motor er kørt med ét frø pr. input.)
- **I 183 af 206 input er den nuværende motor allerede ved grænsen** på alle
  tunge regler. Her skal den nye motor *også* nå grænsen. Det er det strengeste
  sted i kravet: der er ingen plads til at være lidt dårligere.
- **I de 23 input, hvor den nuværende motor ikke når grænsen**, må den nye
  ikke være dårligere end den nuværende. Den kan forhåbentlig blive bedre.
- **De 5 svar med fejl i de faste krav** er ikke en målestok
  ([kendte-forskelle.json](kendte-forskelle.json)). Den nye motor skal
  overholde specifikationen dér. I 143, 207 og 274 skal den give andre
  grupper end i dag, og det er meningen.
- **Alle 32 stop skal den nye motor også lave**, og med samme grund. Den må
  ikke stoppe andre steder.
- **På målene** (Fordel, Balancér, Ensartede, Saml) skal den nye motor være
  bedre eller lige i langt de fleste. Det største potentiale er de lavere
  sorteringsregler (fund 2).

## Sådan laves rapporten igen

```bash
node judge/tools/grade-set.mjs testdata/saet-1 testdata/saet-1-nuvaerende resultater/saet-1-nuvaerende.json --known resultater/kendte-forskelle.json
```

Senere, når den nye motors svar findes:

```bash
node judge/cli.mjs compare testdata/saet-1 <ny-motors-svar> testdata/saet-1-nuvaerende --known resultater/kendte-forskelle.json
```
