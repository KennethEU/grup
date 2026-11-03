# Kodegennemgang af den nye motor (`engine/`)

*3/11 2026. En uafhængig gennemgang, før motoren bruges bredere. Grundlaget
er `spec/specifikation.md` (den vinder), `spec/kontrakt.md`, dommeren i
`judge/`, testsæt 1 og 2 og de tidligere målinger i `resultater/`.
Gennemgået er motoren, som den lå i mappen under gennemgangen: commit
`de1b29c` plus de ændringer, den anden session var i gang med samtidig
(`bounds.js`, "nok det bedste"-beskeden, budget uden frø). Intet i `engine/`,
`judge/` eller `spec/` er ændret. Alle tjek ligger som små scripts i
`gennemgang/`, så de kan køres igen.*

## Kort

Motoren er sund. De to ting, der nemmest gemmer fejl, holder:

- **Tællerne** (ændring ved bytning) giver præcis samme tal som en måling
  forfra, i alle 520 input i sæt 1 og 2, efter byg, forbedring, ryst,
  flytninger og blokbytninger. 0 afvigelser.
- **Dommeren** finder 0 brud på de faste krav i 600 svar, og motorens egne
  felter (`rules[].met`, beskederne) stemmer med dommeren i alle 600.

Der er **ét fund, der rammer læreren** (Fordel kan sige "Det kunne ikke
undgås", selvom en anden deling ville være opfyldt), **ét fund i et hjørne,
appen måske aldrig rammer** (matrix "Fuld" + Opdel), og en håndfuld små ting.
Ingen af dem giver forkerte grupper i de faste krav.

| Alvor | Antal | Det vigtigste |
|---|---|---|
| Middel | 1 | Fordel: "uundgåeligt" kan være forkert, og motoren søger ikke efter "opfyldt" (fund 1) |
| Lav | 4 | Matrix "Fuld" + Opdel blander puljer uden besked (fund 2); "umulig" uden besked ved ugyldigt input (3); fremgangens `rulesMet` tæller "ikke målt" som opfyldt (4); én test fra den anden session fejler (5) |
| Usikre | 2 | "1 000" med mellemrum er ikke et tal (6); dubleret `_rowId` (7) |

Derefter forslag til forbedringer (afsnit 3) og en liste over alt, der er
tjekket, og hvordan (afsnit 4).

---

## 1. Fund, sorteret efter alvor

### Fund 1 (middel) — Fordel siger "Det kunne ikke undgås", selvom det kunne

**Hvad læreren oplever.** Hun får beskeden *Fordel på "Køn" går ikke helt op
i 1 gruppe (Gruppe 2). Det kunne ikke undgås med denne klasse.* og reglen står
som "ikke opfyldt" — men trykker hun "Dan igen" nogle gange, kommer der en
deling, hvor reglen ER opfyldt. Beskeden lover altså for meget, og knappen
"Dan igen" bliver ikke tilbudt (appen må gerne skjule den ved
`unavoidable: true`).

**Hvorfor.** Fordel har to mål, der ikke er enige:

- *Tallet*, motoren søger efter (spec. 16): afstanden fra det "retfærdige
  antal" (⌊f⌋…⌈f⌉). Det bedst mulige er 0.
- *Opfyldt*, som læreren ser (spec. 6.6, "som i dag"): ingen værdi mere end
  ⌈størrelse / antal værdier⌉ gange, og alle værdier med.

Flere delinger kan have tallet 0 (de er lige gode for motoren), men kun nogle
af dem består dagens test. Motoren vælger tilfældigt blandt dem, og når
tallet er 0, siger `messages.js` "uundgåeligt" (`fairReached`,
[messages.js:475](../engine/messages.js:475)).

**Eksempel** (`gennemgang/fund-1.json`): 9 elever, 5 A og 4 B, 4 pr. gruppe
"+1" → grupper på 5 og 4. Delingen AAABB + AABB er opfyldt. Delingen
AABBB + AAAB har også tallet 0, men 3 A i en gruppe på 4 er for mange
(⌈4/2⌉ = 2), så den er ikke opfyldt. Motoren ser dem som lige gode:

```bash
node gennemgang/fund-1.mjs
```

giver (40 frø): *31 frø: AAABB + AABB → met true* og *9 frø: AABBB + AAAB
→ met false, besked "… Det kunne ikke undgås med denne klasse." (unavoidable
true)*.

**Hvor ofte.** `gennemgang/fordel-uundgaaeligt.mjs` prøver alle små
klasser udtømmende: i 134 af 1269 sammensætninger (4–9 elever, 2–3
grupper) findes en opfyldt deling, selvom tallet 0 kan nås uden. I sæt 1 og
2 hviler 321 af de 600 svars "uundgåeligt"-beskeder på netop dette (tallet
er 0, dagens test fejler). De fleste er rigtige (skæve klasser, hvor
dagens test aldrig kan bestås), men motoren kan ikke selv se forskel. Blandt
de 22 svar, hvor Fordel er eneste regel (så enhver deling er lovlig), fandt en
simpel søgning en opfyldt deling i 1 (`171-tilfaeldig-67`, 18 elever, 5
grupper):

```bash
node gennemgang/fund-1-saet.mjs testdata/saet-1 <svar-mappe>
```

**Forslag.** Lad dagens test tælle med, så den ikke er usynlig for søgningen:
læg et lille tillæg på Fordels tal for hver gruppe, der ikke består dagens
test (fx 0,001 pr. gruppe, i `modules.js` `distributeModule.value` og i
`rules.js` `measureDistribute`). Så er to delinger med samme retfærdige antal
ikke længere lige gode, motoren foretrækker de opfyldte, og "uundgåeligt"
kommer kun, når tallet er præcis 0, dvs. både retfærdigt OG opfyldt. Ellers
får læreren "Prøv at danne igen" (eller "nok det bedste", når mange forsøg
ender samme sted). Det ændrer ikke de tunge regler og koster intet i tid.

### Fund 2 (lav; usikkert om appen kan sende det) — matrix "Fuld" + Opdel

**Hvad sker der.** Har matrixopskriften en Opdel-regel og "Fuld", ser motoren
helt bort fra puljerne: ved "Fuld" er hele opgaven én pulje
([sizes.js:68](../engine/sizes.js:68)), og grupperne blander Opdel-værdierne.
Svaret er `status: "ok"`, Opdel-reglen står som `met: false`, og der kommer
**ingen besked**. Dommeren melder brud på de faste krav ("Gruppe … blander 2
Opdel-puljer").

```bash
node gennemgang/fund-2.mjs
```

*motor: ok [[r2,r1],[r0,r3]] rules [{rule 0, met false}] beskeder [] ·
dommer: ["Gruppe på plads 0 blander 2 Opdel-puljer.", …]*

Opdel og "én fra hver kilde" trækker hver sin vej, så det kan ikke lade sig
gøre, og det bør siges. Spec. 9.1 siger, at matrix har "deres eget regelsæt
(med samme regler)", så Opdel er ikke udelukket, men kontrakten og
testgeneratoren (`testdata/gen/random-class.mjs`, linje 205) holder Opdel ude
af matrix "Fuld". **Spørgsmål til Kenneth:** kan appen sende en Opdel-regel i
en matrixopskrift? Hvis ja: svar `unsupported` (eller en `conflict`-besked og
se bort fra Opdel). Hvis nej: skriv det i kontrakten, så det er bevidst.

### Fund 3 (lav) — "umulig" uden besked ved ugyldigt input

`run()` svarer `status: "impossible"` med en **tom** `messages`, når
opdelingen giver 0 grupper ([engine.js:25](../engine/engine.js:25)): fx
`size.mode: "full"` i stamgrupper eller `students: []`. Kontrakten siger, at
appen ved `impossible` viser beskederne og *ikke* falder tilbage — så
læreren ser ingenting og får ingen grupper. Appen sender ikke sådan et input i
dag, men svaret bør være `error`/`unsupported` med en `reason`, så
tilbagefaldet virker. (`gennemgang/kant.mjs`, tilfældene "mode full i
stamgrupper" og "students tom".)

### Fund 4 (lav) — fremgangens `rulesMet` tæller "ikke målt" som opfyldt

I `progressMessage` ([solve.js:300](../engine/solve.js:300)) tælles alt, der
ikke er `met === false`, som opfyldt: også `met: null` ("ikke målt", fx
Balancér på en kolonne uden tal) og Opdel. Skærmen kan altså vise "4 af 4
regler opfyldt", mens svaret bagefter viser én som ikke målt. Kosmetisk;
tæl `null` for sig (eller tag dem ud af `rulesTotal`).

### Fund 5 (lav) — én test fejler i den nuværende mappe

`node --test 'tests/*.test.mjs'` giver 1 fejl: `tests/bounds.test.mjs:45`
("Balancér: grænsen er aldrig over det, gyldige svar faktisk når") stopper
med *kun 29 tjekket*. Testen er ny fra den anden session og ser ud til at
forvente flere svarfiler, end der ligger i mappen. Ikke en fejl i motoren,
men den skal rettes, før testsuiten er grøn igen.

### Usikre (ikke efterprøvet som fejl)

**6. "1 000" med mellemrum er ikke et tal.** Spec. 3.2 siger, at en celle er
et tal, når den "kun består af cifre, evt. fortegn, højst ét decimaltegn og
evt. mellemrum". `values.js` tillader kun mellemrum mellem fortegn og cifre,
så "1 000" bliver tekst og læreren får *1 elev har en værdi i "T", der ikke
er et tal ("1 000")*. Dommeren gør det samme, så det er konsekvent, men det
kan være en anden læsning af spec'en end Kenneths. Omvendt læses "7." og
",5" som tal. Spørgsmål til spec'en, ikke en fejl.

**7. Dubleret `_rowId`.** To elever med samme `_rowId` giver et svar, hvor
id'et står to gange; appen afviser det som kontraktbrud og falder tilbage.
Kontrakten lover unikke id'er, så det er appens ansvar. Nævnt for
fuldstændighedens skyld.

---

## 2. Hvad der IKKE er fundet (og som jeg ledte efter)

- **Tællerne er rigtige.** Ingen afvigelse mellem ændring-ved-bytning og
  måling forfra: ikke efter byg, ikke efter tusindvis af forbedringer,
  ryst-runder, flytninger (hvor gruppestørrelsen ændres) eller
  blok-mod-enkelte-bytninger. Det gælder også Fordels cache og Saml på tekst
  (med det faste fradrag). Saml med tal er en kendt tilnærmelse i tællerne
  (grupper uden tal), men i alle 72 + 60 målinger i sættene var tallet
  alligevel præcis det samme.
- **Ingen forkerte grupper.** 0 brud på de faste krav i 600 svar: størrelser,
  puljer, blokke, låste, matrix "Fuld" (mindst én fra hver kilde, jævnt pr.
  kilde, højst én i forskel), emner.
- **Stop og grunde** er de samme som dommerens i alle input (32 i sæt 1, 48 i
  sæt 2), og alle fejlende blokke nævnes i én omgang.
- **Beskederne lyver ikke om de tunge regler.** Ingen "uundgåeligt" på
  Adskil, Adskil altid, Undgå hinanden, Klyng eller kilder, hvor dommeren kan
  se et bedre tal. Ingen regel "ikke opfyldt" uden besked, ingen besked uden
  grund.
- **Afspilningen** ender i svarets grupper i alle 520 input, både det hele
  spor og et afskåret spor (lille loft).
- **Fremgang og Stop** holder kontrakten på de største hold (262–286 elever,
  uden frø, 30 s): første fremgang efter 0,02–0,03 s, aldrig over 1,3 s
  imellem, og Stop besvaret inden for ca. 0,2 s med en hel deling (også efter
  0,3 s, før noget forsøg var færdigt).
- **Rangordenen** er den rigtige: Adskil altid (opskriftens rækkefølge) →
  Undgå hinanden → (matrix) én fra hver kilde → Adskil/Klyng i opskriftens
  rækkefølge → målene trinvist vægtet → Saml. Motorens rangordens-række er
  den samme, dommeren regner (`tests/rules-vs-judge.test.mjs` og
  sammenligningen).
- **Samme frø, samme svar**, også på flere kerner (workeren regner nu også
  Balancér-grænsen selv, så den stopper samme sted som hovedtråden).

---

## 3. Forslag til forbedringer (ikke fejl)

1. **Fordel: lad dagens test tælle med** (fund 1). Det er det, der batter
   mest for læreren.
2. **Klyng når ikke det bedst mulige** i 13 af 69 (sæt 1) og 18 af 87 (sæt
   2) regler — det samme som den nuværende motor, men to ting kan hjælpe:
   (a) "bedst mulige" kender kun de værdier, én elev har; overslaget "plads
   til par" (`messages.js` `ruleLimitMessages`) kunne også lægges i `best`,
   så beskeden kan sige "uundgåeligt" og motoren stoppe i tide; (b) i
   opbygningen lægges Klyng-elever kun to og to for den *første* Klyng-regel
   (`search.js` `studentOrder`).
3. **Saml med tal** ligger ved det bedst mulige i 29 af 48 (sæt 1) og 26 af
   38 (sæt 2). Den er sidst i rangordenen, så det er ventet; men tællerne
   bruger en tilnærmelse for grupper uden tal. Det er ufarligt nu (målingen
   forfra afgør vinderen), men hvis Saml skal bedre, bør tællerne regne det
   faste fradrag med.
4. **"Umulig" bør altid have en besked** (fund 3), og `together-cannot-pack`
   fra selve kørslen (`engine.js` `cannotPack`) nævner alle blokke i alle
   puljer med `pool: null`; den fra tjekket før kørslen nævner kun puljens.
5. **Med frø følger arbejdet ikke uret** (spørgsmål 42): på en travl maskine
   tog ét svar i sæt 2 45 s med 10 s-budget. Appen sender intet frø, så det
   rammer kun test og dommer; men det gør sammenligninger af tid sværere.
6. **`rulesMet`** (fund 4).
7. **Beskeden ved emnerunding, der IKKE sker.** Spec. 4.4: "Opskriften viser,
   hvad det andet valg ville give." Motoren sender kun `topic-rounding`, når
   der rundes; appen må selv regne det andet ud. Det kunne stå i `check()`.

---

## 4. Hvad der er tjekket, og hvordan

Alle scripts ligger i `gennemgang/` og køres fra projektets rod. `<svar>`
er en mappe med motorens svar på et sæt (`node tools/run-set.mjs
testdata/saet-1 <svar> --seeds 1 --max-seconds 10`).

### 4.1 Specifikationen

| Emne | Hvordan | Resultat |
|---|---|---|
| Størrelser (+1/−1, aldrig flere grupper end elever, jævnt, eksemplerne i 4.1, 4.2 og 4.4, låste, "færre grupper end puljer", emnerunding kun når størrelsen holder, "-1" med færre grupper end emner) | `gennemgang/stoerrelser.mjs`: alle n ≤ 120, t ≤ 12 mod spec'ens ord, plus eksemplerne. Uafhængigt af dommeren (dens `sizes.mjs` er samme kode) | 0 afvigelser |
| Opdel pr. pulje, kombination af flere Opdel, tomme celler = egen pulje, lille pulje | Læst (`task.js`, `sizes.js`); dommerens faste krav på 600 svar; `kant.mjs` | Som spec'en |
| Skal sammen: for stor, pakning (med loft, aldrig stop ved loftet), mod Undgå, mod Adskil/Adskil altid, på tværs af låst, på tværs af pulje; alle fejlende blokke i én besked; aftaler, der deler en elev, lægges sammen | Læst (`feasibility.js`); `kant.mjs` (8 tilfælde); dommeren: samme stop-grunde i alle 600 | Som spec'en |
| Rangordenen (7.1–7.3) | Læst (`rules.js` `levelPlan`, `evaluate`); motorens række = dommerens på 600 svar | Som spec'en |
| Matrix "Fuld": mindst én fra hver kilde, jævnt pr. kilde, højst én i forskel; elever uden stamgruppe; tom kilde; "højst én fra hver" som tungt hensyn uden "Fuld" | Læst (`search.js` `buildMatrixFull`, `sourceOk`); dommeren på alle matrix-input; `kant.mjs` | Som spec'en, på nær fund 2 |
| Værdier: store/små bogstaver, mellemrum, komma/punktum, "1.000" = 1, "02", "-3", rangering (også "høj " og "LAV"), værdier uden for rangeringen, tomme celler, blandet kolonne, kun tekst | `kant.mjs` | Som spec'en; "1 000" er usikker (6) |
| Emner: størst først, lige store efter nummer, færrest elever, låst med forældet emne | Læst (`topics.js`); dommerens emnekontrol på 600 svar; `kant.mjs` | Som spec'en |

### 4.2 Tællerne (`modules.js`, `state.js`)

`gennemgang/taellere.mjs testdata/saet-1 testdata/saet-2` — for hvert
input ét forsøg (byg → forbedr → 4 × ryst/forbedr) med 60.000 afprøvede
bytninger, og ved hvert af 6 tidspunkter tre tjek:
(a) `state.totals` = summen af modulernes værdier nu (bogføringen),
(b) hvert moduls værdi pr. gruppe = et frisk modul bygget op fra de samme
grupper (tællerne selv, inkl. Fordels cache),
(c) `state.totals` = `evaluate()` fra `rules.js` trin for trin (Saml på
tekst med fradraget lagt til). Desuden "prøv" = "gør" for flytninger,
bytninger og blok-mod-enkelte. **520 input, 0 problemer.** (Motorens egen
`tests/state.test.mjs` tjekker kun 60 bytninger efter byg og springer Saml
over; dette går længere.)

### 4.3 Søgning og budget (`search.js`, `solve.js`)

- `gennemgang/stop-tid.mjs <input> 0.3 1.5 6` på de største hold: fremgang
  og Stop som beskrevet i afsnit 2.
- Frø: `tests/engine.test.mjs` og `tests/cores.test.mjs` (samme svar på én
  og flere kerner); læst, at vinderen vælges efter rangorden og laveste
  forsøgsnummer, og at "alle ved det bedst mulige" kun stopper, når alle
  lavere numre er færdige.
- Budget uden frø (ny ændring): mindst `minAttempts`, mindst `maxAttempts`
  medmindre alt er ved det bedst mulige, derefter til det bedste holder op
  med at blive bedre eller tiden er gået; aldrig over 10.000. Læst, ingen
  fejl set; 262 elever gav 12 forsøg på 31,9 s med 30 s-budget.
- Kanttilfælde (`kant.mjs`): 1 gruppe, alle i én blok, n = 1, mål større
  end klassen, 20 grupper til 8 elever, 2 låste af 3, tom opskrift, tomt
  budget.
- Balancér-grænsen (`bounds.js`): læst; den er en gyldig nedre grænse
  (slækkelse af den rigtige opgave), og den dyreste i sættene tager 0,28 s.

### 4.4 Beskeder (`messages.js`)

`gennemgang/doem.mjs testdata/saet-1 <svar>` (og sæt 2): dommeren på hvert
svar, og motorens egne felter mod dommerens: `rules[].met` ens i 600 af
600; ingen regel "ikke opfyldt" uden `rule-not-met`, ingen `rule-not-met`
uden grund; `unavoidable: true` modsiger aldrig dommerens "bedst mulige"
for de tunge regler og Undgå/kilder. Fordelingen af slutninger i sæt 1: 251
"uundgåeligt", 106 "nok det bedste", 15 "Prøv at danne igen". Fund 1 er
den eneste svaghed.

### 4.5 Robusthed (`kant.mjs`)

Tomt kolonnenavn, `constructor`, `__proto__`, emoji i kolonnenavn, regel på
kolonne, eleverne ikke har, 5000 tegn lange værdier, linjeskift, dubleret
`_rowId`, blok kun med ukendte elever, Undgå med én kendt elev, Adskil-værdier
med mellemrum og store bogstaver, samme regel to gange, Balancér + Ensartede
på samme kolonne. Motoren kaster aldrig; alt svarer fornuftigt (fund 3 og 7
undtaget).

### 4.6 Afspilning (`playback.js`)

`gennemgang/afspil.mjs testdata/saet-1 testdata/saet-2`: uddeling + trin
genafspillet og sammenlignet med grupperne, både hele sporet og et spor
afskåret til halvdelen. 520 input, 0 problemer.

### 4.7 Sammenligning med den nuværende motor (frø 1, 10 s)

`node tools/summary.mjs <svar> --set 1`: tunge regler bedre 8 · lige 287 ·
dårligere 0; mål bedre 74 · lige 220 · dårligere 1 (117, kendt). Sæt 2:
tunge 12 · 287 · 1 (107, den nuværendes fejl, se
`resultater/saet-2-sammenligning.md`); mål 85 · 210 · 5. Det er de samme tal
som i `motor-trin-7.md` og `saet-2-sammenligning.md`, så de ændringer, den
anden session var i gang med, har ikke gjort noget dårligere.

### 4.8 Motorens egne tests

`node --test 'tests/*.test.mjs'`: alle grønne på nær `tests/bounds.test.mjs:45`
(fund 5).
