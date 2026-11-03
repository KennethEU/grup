# Kontrakten: hvad den nye gruppemotor får, og hvad den skal give tilbage

*Kontraktversion 2 — 3/11 2026. Skrevet af den kendte side til den rene side.*

**Ændret fra version 1** (efter den rene sides gennemlæsning, punkt 22–32):
matrix "Fuld" er mindst én fra hver kilde (2.2); flere Opdel giver puljer af
kombinationen, og `pool` får `poolValues` (3.4); nye beskedkoder og
`unavoidable` på `rule-not-met` (3.4); `{gruppe:N}` i teksterne, og låste
grupper har deres nummer med (2.2, 3.4); Stop giver et svar med den foreløbig
bedste, `status: "stopped"` (3.2, 5); stopbetingelsen og 30 sekunder over 100
elever (2.2); `met: null` er "ikke målt" (3.5); én besked pr. umulig Skal
sammen-blok (3.4); en afskåret afspilning slutter stadig i grupperne (3.6);
fremgangen har `rulesNotMet` og `atBestPossible` (4).

Hører sammen med idédokumentet og svar-dokumentet
(`svar.md` og `svar2.md`). Svar-dokumentet siger, hvad reglerne
**betyder** (fx hvornår Klyng er opfyldt). Kontrakten her siger kun, **hvordan
data ser ud** på vej ind og ud af motoren, og hvem der gør hvad: motoren eller
appen omkring den.

Kontrakten beskriver ikke, hvordan den nuværende motor regner, og den må ikke
læses sådan. Eksemplerne er opdigtede.

---

## 1. Overblik

Grupper (appen) kalder motoren én gang pr. gruppedannelse:

```
appen  ──input──▶  motoren
appen  ◀─fremgang─  motoren   (0 eller flere gange, mens den arbejder)
appen  ◀──svar────  motoren   (præcis én gang)
```

- Alt er JSON: tekst, tal, lister og objekter. Ingen funktioner, datoer eller
  særlige typer krydser grænsen.
- Motoren kører i sin egen tråd (en Web Worker) i lærerens browser. Den må
  aldrig kontakte nettet (dida.dk's regel: browseren taler kun med dida.dk, og
  motoren har ingen grund til at tale med nogen).
- Feltnavnene er engelske (som al kode i projektet); teksterne til læreren er
  danske.
- Hvert input og hvert svar har `contractVersion: 2`. Ændres formatet, så det
  ikke længere passer, tælles tallet op.

---

## 2. Hvad motoren får (input)

### 2.1 Et helt eksempel

En stamgruppe-dannelse med 8 frie elever, tre regler, én aftale af hver
slags, én låst gruppe med 2 elever og to emner:

```json
{
  "contractVersion": 2,
  "view": "home",
  "students": [
    { "_rowId": "r1",  "Køn": "Pige",   "Niveau": "Høj",    "Karakter": "7" },
    { "_rowId": "r2",  "Køn": "Dreng",  "Niveau": "Middel", "Karakter": "10" },
    { "_rowId": "r3",  "Køn": "pige",   "Niveau": "Lav",    "Karakter": "4" },
    { "_rowId": "r4",  "Køn": "Dreng",  "Niveau": "",       "Karakter": "02" },
    { "_rowId": "r5",  "Køn": "Pige",   "Niveau": "Høj",    "Karakter": "Fritaget" },
    { "_rowId": "r6",  "Køn": " Dreng", "Niveau": "Middel", "Karakter": "7,5" },
    { "_rowId": "r7",  "Køn": "Pige",   "Niveau": "Lav",    "Karakter": "12" },
    { "_rowId": "r8",  "Køn": "",       "Niveau": "Middel", "Karakter": "4" }
  ],
  "rules": [
    { "type": "distribute", "column": "Køn" },
    { "type": "balance",    "column": "Niveau" },
    { "type": "separate",   "column": "Karakter", "values": ["12", "10"] }
  ],
  "columnOrders": {
    "Niveau": ["Lav", "Middel", "Høj"]
  },
  "agreements": {
    "together": [["r1", "r4"]],
    "avoid":    [["r2", "r6"]]
  },
  "lockedGroups": [
    { "id": "L1", "number": 2, "name": "Gruppe 2", "members": ["r9", "r10"], "topic": "Klima" }
  ],
  "size": { "mode": "perGroup", "target": 3, "adjust": "plus" },
  "topics": ["Klima", "Migration"],
  "matrix": null,
  "budget": { "maxSeconds": 10, "maxAttempts": 20, "minAttempts": 3 },
  "seed": null
}
```

### 2.2 Felterne ét for ét

**`view`** — `"home"` (stamgrupper) eller `"matrix"` (matrixgrupper).

**`students`** — de elever, der skal fordeles i denne dannelse.

- Hver elev er ét objekt. `_rowId` er elevens identitet: en tekst, der er unik
  i klassen og aldrig ændrer sig. Alt, hvad motoren siger om elever, siger den
  med `_rowId`.
- De øvrige felter er klassens kolonner med lærerens egne kolonnenavne. Appen
  sender **kun de kolonner, en regel bruger** (ingen navne, intet andet). En
  kolonne kan altså hedde hvad som helst, også noget med mellemrum eller "æøå".
- **Værdierne er altid tekst**, præcis som læreren har skrevet dem. En tom
  celle er `""` (aldrig `null`, og feltet mangler aldrig). Appen har IKKE
  rettet stavemåder, store og små bogstaver eller mellemrum: `"pige"`,
  `"Pige"` og `" Pige "` kan alle forekomme, og det er motorens job at se dem
  som samme værdi (svar 10). Tekst er NFC-normaliseret ("å" er ét tegn).
- Om en celle er et tal, afgør motoren (svar 10: `"7,5"` er 7,5, `"02"` er 2,
  `"Fritaget"` er ikke et tal).
- **Fraværende elever er allerede taget ud.** De findes ingen steder i input.
- **Elever i låste grupper er ikke med** i `students`. De står kun i
  `lockedGroups` (se nedenfor).
- Rækkefølgen er klassens rækkefølge. Den betyder ingenting for resultatet,
  men samme input og samme `seed` skal give samme svar.
- Der er altid mindst én elev (appen kalder ikke motoren uden).

**`rules`** — lærerens regler i opskriftens rækkefølge. Første regel står
øverst i opskriften og vejer tungest inden for samme slags (svar-dokumentet,
beslutning 1). Hver regel:

| `type` | Lærerens navn | `values` |
|---|---|---|
| `distribute` | Fordel | — |
| `separate` | Adskil | 1 eller flere værdier |
| `strict_separate` | Adskil altid | 1 eller flere værdier |
| `cluster` | Klyng | — |
| `balance` | Balancér | — |
| `minimizediff` | Ensartede | — |
| `group_sort` | Saml | — |
| `aggregate` | Opdel | — |

- `column` er altid en kolonne, der findes i `students`.
- `values` findes kun på de to Adskil-typer. Værdierne er skrevet, som de står
  i rullelisten; sammenlign dem på samme måde som cellerne (store og små
  bogstaver og mellemrum i enderne tæller ikke).
- Den samme regel kan stå to gange, og to regler kan trække hver sin vej. Det
  er motorens job at sige det (se beskederne).
- `rules` kan være tom: så dannes grupper kun efter størrelse, aftaler og emner.
- **Flere Opdel-regler:** puljerne er kombinationen af alle Opdel-værdierne
  (en elev med "2.a" og "Klima" er i puljen "2.a + Klima"). Det er en
  forbedring i forhold til i dag (svar 4, "Kan forbedres").
- En regels plads i listen (0, 1, 2 …) er dens **regelnummer**. Beskeder og
  fremgang peger på regler med det nummer. Det er pladsen i den liste, der
  blev SENDT: appen springer regler uden kolonne over, og den holder selv
  styr på, hvilken linje i opskriften et nummer svarer til.

**`columnOrders`** — rækkefølgen af tekstværdier, som læreren har sat
("Lav < Middel < Høj"), fra lavest til højest. Kun for kolonner, en
`balance`-, `minimizediff`- eller `group_sort`-regel bruger. Med rækkefølgen
kan de tre regler regne på tekst: første værdi er laveste trin. Sammenlign
uden hensyn til store og små bogstaver og mellemrum. En celle, hvis værdi
ikke står i listen, tælles som tom, og motoren siger det (beskeden
`unranked-values`). Tomt objekt `{}`, når der ingen er.

**`agreements`** — lærerens aftaler om bestemte elever, som lister af `_rowId`:

- `together` ("Skal sammen"): hver liste er elever, der skal i samme gruppe.
  Kan aldrig brydes (svar 1). To lister, der deler en elev, er én blok.
- `avoid` ("Undgå hinanden"): hver liste er elever, der ikke skal i samme
  gruppe. Vejer som Adskil (svar 1).
- `together` sendes som samlede blokke (lister, der delte en elev, er lagt
  sammen). Fraværende er taget ud. **Låste elever bliver stående** i en blok,
  så motoren kan se, at blokken går på tværs af en låst gruppe
  (`together-across-lock`). En blok, hvor alle er låste, er allerede opfyldt
  og sendes ikke.
- `avoid`: fraværende og låste er taget ud.
- En liste med under to elever tilbage er ikke sendt med.
- I matrix er `together` altid tom (Skal sammen gælder kun stamgrupper);
  `avoid` gælder også i matrix.

**`lockedGroups`** — grupper, læreren har låst. De dannes ikke om.

- `id` er en tekst, appen genkender gruppen på. Den betyder intet for motoren.
- `number` er det nummer, læreren ser på gruppen (`2` for "Gruppe 2"), og
  `name` er navnet, som det står på kortet. Nye grupper får de ledige numre
  1, 2, 3 … i den rækkefølge, de står i `groups`, uden om de låstes numre
  (afsnit 3.3). Derfor kan motoren selv regne ud, hvilket nummer hver ny
  gruppe får, og ordne lige store grupper efter nummer i emnefordelingen
  (svar 2: fast rækkefølge).
- `members` er gruppens tilstedeværende elever (`_rowId`). De er ikke i
  `students`, så motoren kender ikke deres celler.
- `topic` er gruppens emne eller `null`. Kun stamgrupper har emner.
- Låste grupper tæller med i lærerens antal grupper (svar 5) og i emnernes
  fordeling (svar 2). Ellers rører motoren dem ikke.

**`size`** — hvor store grupperne skal være. Tre former:

```json
{ "mode": "perGroup", "target": 4, "adjust": "plus" }
{ "mode": "count", "count": 6 }
{ "mode": "full" }
```

- `perGroup`: "4 elever pr. gruppe". `adjust` er lærerens "+1" (`"plus"`:
  grupperne er målet eller én over) eller "-1" (`"minus"`: målet eller under).
  Regnes på eleverne i `students`, ikke de låste (svar 12).
- `count`: "6 grupper". **Tallet er lærerens samlede antal, med de låste
  grupper.** Med 6 og 2 låste skal motoren danne 4 nye (svar 5). Er tallet
  ikke større end antallet af låste grupper, kalder appen ikke motoren.
- `full`: kun i matrix, se `matrix`.
- `target` og `count` er hele tal fra 1 til 999.

**`topics`** — klassens emner som tekst, i lærerens rækkefølge. Tom liste, når
der ingen er, og altid tom i matrix.

**`matrix`** — `null` for stamgrupper. For matrixgrupper:

```json
{
  "source": "topic",
  "homeGroups": [
    { "id": "S1", "members": ["r1", "r2", "r3", "r4"], "topic": "Klima" },
    { "id": "S2", "members": ["r5", "r6", "r7"],       "topic": "Migration" },
    { "id": "S3", "members": ["r8", "r11", "r12"],     "topic": null }
  ]
}
```

- `homeGroups` er de stamgrupper, der står på skærmen lige nu, med deres
  tilstedeværende elever og emne. Alle stamgrupper er med, også låste.
- `source` siger, hvad "én fra hver" betyder: `"topic"` (én fra hvert emne;
  en stamgruppe uden emne er sit eget emne) eller `"homeGroup"` (én fra hver
  stamgruppe).
- Med `size.mode = "full"` er antallet af matrixgrupper antallet af elever i
  den mindste kilde (svar 11). Hver matrixgruppe får **mindst én fra hver
  kilde**; kilder med flere elever end det har ekstra elever, og de spredes
  jævnt, så grupperne højst er én elev forskellige i størrelse. Med
  `perGroup` eller `count` er "højst én fra hver kilde" et tungt hensyn, ikke
  et krav.
- En elev i `students`, som ikke står i nogen stamgruppe (fx en efternøler
  tilføjet bagefter), skal stadig placeres, og motoren siger det
  (beskeden `not-in-home-group`).

**`budget`** — hvor længe motoren må arbejde:

- `maxSeconds`: 10, eller **30 ved over 100 elever**. Start ikke flere
  forsøg, når tiden er gået, og `minAttempts` er nået.
- `maxAttempts` (20): højst så mange forsøg.
- `minAttempts` (3, eller 2 ved over 60 elever): mindst så mange forsøg, også
  hvis det tager længere end `maxSeconds`.
- Motoren må stoppe før, når **alle regler har nået det bedst mulige** (ikke
  kun "alle er opfyldt": en regel, der ikke kan gå helt op, kan stadig være
  så god, som den kan blive).

Et "forsøg" er motorens egen enhed; den bestemmer selv, hvad det er. Det
vigtige er: små klasser får flere chancer, store klasser venter ikke
urimeligt, og læreren kan se fremgangen undervejs (afsnit 4).

**`seed`** — et heltal eller `null`. Med et tal skal samme input give præcis
samme svar hver gang (til test og dommeren). Med `null` vælger motoren selv,
så "Dan grupper igen" giver nye grupper (svar 14). Appen sender altid `null`.
Med et seed må tiden ikke kunne ændre svaret: lad `maxAttempts` og
`minAttempts` styre, ikke `maxSeconds`, så en langsom maskine giver det samme
som en hurtig.

---

## 3. Hvad motoren giver tilbage (svaret)

### 3.1 Et helt eksempel

Svaret på input i 2.1:

```json
{
  "contractVersion": 2,
  "status": "ok",
  "groups": [
    { "members": ["r1", "r4", "r2", "r8"], "topic": "Migration" },
    { "members": ["r3", "r6", "r5", "r7"], "topic": "Klima" }
  ],
  "lockedTopics": {},
  "messages": [
    {
      "type": "note",
      "code": "non-numeric-cells",
      "rule": null,
      "column": "Karakter",
      "pool": null,
      "poolValues": null,
      "students": ["r5"],
      "values": ["Fritaget"],
      "text": "1 elev har en værdi i \"Karakter\", der ikke er et tal (\"Fritaget\")."
    }
  ],
  "rules": [
    { "rule": 0, "met": true },
    { "rule": 1, "met": false },
    { "rule": 2, "met": true }
  ],
  "playback": {
    "best": 0,
    "attempts": [
      {
        "deal": [["r1", 0], ["r4", 0], ["r3", 1], ["r6", 1], ["r2", 0], ["r5", 1], ["r7", 0], ["r8", 1]],
        "moves": [
          { "swap": ["r7", "r8"], "rule": 2, "effect": "better" }
        ],
        "groups": [["r1", "r4", "r2", "r8"], ["r3", "r6", "r5", "r7"]],
        "cut": false
      }
    ]
  },
  "stats": { "attempts": 3, "seconds": 0.08 }
}
```

### 3.2 `status`

| `status` | Betyder | Appen gør |
|---|---|---|
| `"ok"` | Grupperne er dannet. Beskederne kan sige, at noget ikke gik helt op. | Viser grupperne og beskederne. |
| `"impossible"` | Lærerens opsætning kan ikke lade sig gøre (fx en Skal sammen-blok, der er større end den største gruppe). Ingen grupper. | Viser beskederne. Grupperne på skærmen bliver stående. **Falder IKKE tilbage** til den gamle motor: svaret er rigtigt, opsætningen er umulig. |
| `"unsupported"` | Motoren kan ikke klare netop denne opsætning endnu (fx matrix er ikke bygget). | Kører den nuværende motor i stedet og siger det til læreren. |
| `"error"` | Noget gik i stykker inde i motoren. | Som `unsupported`, og skriver `error` i udviklerkonsollen. |
| `"stopped"` | Læreren trykkede Stop, og motoren svarer med den foreløbig bedste deling (afsnit 5). | Viser grupperne som en almindelig dannelse og siger, at den blev stoppet før tid. |

Ved `unsupported` og `error` står der også:

```json
{ "status": "unsupported", "reason": { "code": "not-built", "text": "Den er ikke bygget endnu." } }
```

`text` er én dansk sætning om motoren selv ("Den er ikke bygget endnu.",
"Den kan ikke danne matrixgrupper endnu."). Den vises til læreren i
beskeden om tilbagefaldet og må ikke nævne kode, filer eller tekniske ord.

Kaster motoren en fejl i stedet for at svare, behandler appen det som
`"error"`.

### 3.3 `groups`

- En liste med de **nye** grupper. De låste grupper er ikke med.
- Hver elev i `students` står i præcis én gruppe. Ingen andre elever, ingen
  tomme grupper.
- **Rækkefølgen af grupperne er den, læreren ser:** appen giver dem numrene
  1, 2, 3 … i den rækkefølge, men springer de numre over, som låste grupper
  allerede har (`lockedGroups[].number`). Med låste nr. 2 og 4 får de nye
  grupper altså 1, 3, 5, 6 …
- Rækkefølgen af medlemmerne inde i en gruppe er den rækkefølge, de står på
  gruppekortet.
- `topic`: gruppens emne (en tekst fra `topics`) eller `null`, når klassen
  ingen emner har. I matrix altid `null`.

**`lockedTopics`** — nye emner til låste grupper, hvis emne ikke længere står
på klassens liste (svar 2): `{ "L1": "Migration" }`. Tomt objekt, når ingen
skal have nyt emne.

### 3.4 `messages` — beskederne til læreren

Hver besked:

| Felt | Indhold |
|---|---|
| `type` | `"impossible"` (rødt: kan ikke lade sig gøre), `"conflict"` (to ting trækker hver sin vej), `"note"` (godt at vide) |
| `code` | En fast kode fra listen nedenfor. Appen kender beskeden på koden, aldrig på teksten. |
| `rule` | Regelnummeret (plads i `rules`), eller `null`, når beskeden ikke handler om én regel. |
| `column` | Kolonnens navn, eller `null`. |
| `pool` | Når der er Opdel-regler: puljens navn til læreren. Én Opdel: værdien (`"Klima"`). Flere: værdierne i opskriftens rækkefølge, sat sammen med `" + "` (`"2.a + Klima"`). En tom celle skrives `ikke udfyldt`. Ellers `null`. |
| `poolValues` | Puljens værdier hver for sig, i opskriftens rækkefølge (`["2.a", "Klima"]`; `""` for en tom celle), eller `null`. |
| `students` | De elever, beskeden handler om (`_rowId`), ellers `[]`. |
| `values` | Værdier, beskeden nævner (højst 3 eksempler), ellers `[]`. |
| `text` | Beskeden på dansk, skrevet til læreren. |
| `unavoidable` | Kun på `rule-not-met`: `true`, når resultatet er det bedst mulige (det kan ikke gå bedre op), `false`, når en ny dannelse måske kan gøre det bedre. |

Om `text`:

- **Teksten må aldrig indeholde en elevs navn eller `_rowId`.** Motoren kender
  ikke navnene. Skal teksten nævne eleverne, skriver motoren `{elever}`, og
  appen sætter navnene ind ("Ali, Bo og Cecilie"). Eleverne står i `students`.
- Skal teksten nævne en gruppe, skriver motoren `{gruppe:N}`, hvor N er
  gruppens plads i `groups` (0, 1, 2 …). Appen sætter det navn ind, læreren
  ser ("Gruppe 3"). En låst gruppe nævnes med sit `name` direkte.
- Kolonnenavne og værdier skrives i anførselstegn: `"Køn"`, `"Fritaget"`.
  Værdier skrives i den hyppigste stavemåde i klassen (svar 10).
- Ingen tekniske ord (regelnavnene er de danske: Fordel, Adskil, Adskil
  altid, Klyng, Balancér, Ensartede, Saml, Opdel, Skal sammen, Undgå
  hinanden).

Koderne (version 2). Motoren må tilføje flere; appen viser en ukendt kode med
dens tekst.

| `code` | `type` | Hvornår |
|---|---|---|
| `together-too-big` | impossible | En Skal sammen-blok har flere elever, end den største gruppe har pladser. |
| `together-cannot-pack` | impossible | Blokkene kan tilsammen ikke pakkes ind i grupperne. |
| `together-vs-avoid` | impossible | Elever i en blok har også en Undgå hinanden-aftale med hinanden. |
| `together-vs-separate` | impossible | En Adskil- eller Adskil altid-regel står imod en blok. `rule` er reglen. |
| `together-across-lock` | impossible | En blok går på tværs af en låst gruppe. |
| `together-across-pool` | impossible | En blok går på tværs af Opdel-puljer. `pool` er tom; `values` er puljerne. |
| `separate-unavoidable` | impossible | En Adskil- eller Adskil altid-regel kan ikke opfyldes (for mange med værdien til for få grupper). |
| `avoid-unavoidable` | impossible | En Undgå hinanden-aftale kan ikke opfyldes. `students` er aftalen. |
| `rule-not-met` | note | En regel kunne ikke gå helt op (fx Fordel, når tallene ikke kan deles). Har `unavoidable`. |
| `cluster-unavoidable` | impossible | En Klyng-regel kan ikke opfyldes (fx en værdi, som kun én elev har). |
| `opposing-rules` | conflict | To regler trækker hver sin vej på samme kolonne (fx Balancér og Ensartede). `rule` er den nederste; `values` er tom. |
| `duplicate-rule` | conflict | Den samme regel står to gange. `rule` er den nederste. |
| `extra-split-rule` | note | Mere end én Opdel: kun den første deler i puljer. **Sendes ikke af den nye motor** (den deler efter kombinationen); kun den nuværende kan sige det. |
| `extra-sort-rule` | note | Flere Balancér/Ensartede/Saml, og de kan ikke vægtes lige. **Sendes ikke af den nye motor.** |
| `split-empty-cells` | note | Elever med tom celle i en Opdel-kolonne er deres egen pulje ("ikke udfyldt"). `students` er dem; `rule` er Opdel-reglen. |
| `small-pool` | note | En pulje har færre elever, end en gruppe skal have, så dens gruppe bliver mindre. `pool` er puljen. |
| `fewer-groups-than-pools` | note | Læreren bad om færre grupper, end der er puljer; hver pulje får mindst én, så der blev flere (svar 4). |
| `non-numeric-cells` | note | En talregel møder celler, der ikke er tal. |
| `text-only-column` | note | En talregel står på en kolonne helt uden tal og uden rækkefølge. |
| `unranked-values` | note | Celler, hvis værdi ikke står i `columnOrders`. |
| `fewer-groups-than-asked` | note | Færre grupper end læreren bad om (fx flere grupper end elever). Teksten siger begge tal. |
| `more-groups-than-asked` | note | Flere grupper end bedt om (fx fordi hver Opdel-pulje skal have mindst én). |
| `more-topics-than-groups` | note | Flere emner end grupper: et emne får ingen gruppe. |
| `topic-rounding` | note | Antallet af grupper er rundet efter emnerne (svar 12). |
| `matrix-limited-by` | note | Én kilde har færre elever end de andre og sætter loftet for "Fuld". `values`: kildens emne eller stamgruppens id. |
| `matrix-empty-source` | impossible | En kilde har ingen elever, så "Fuld" giver 0 grupper. |
| `not-in-home-group` | note | Elever i matrix, som ikke står i nogen stamgruppe. |

**Skal sammen og "Dan uden aftalen":** motoren sender **én `together-…`-besked
for hver blok**, der ikke kan lade sig gøre (med blokkens elever i
`students`), ikke kun den første. Appen viser en knap "Dan grupper uden
aftalen", som fjerner ALLE de umulige blokke fra `agreements.together` på én
gang og kalder motoren igen (det er appens job). Motoren ved intet om knappen.

**Sådan viser appen beskederne** (fase 5): under "Sidste dannelse" i
opskriften, de røde (`impossible`) øverst, derefter `conflict` og `note`.
Teksten er motorens, med `{elever}` og `{gruppe:N}` udfyldt. For kendte
koder kan appen vælge sin egen formulering eller lægge en knap til (fx "Dan
grupper uden aftalen", eller "Dan igen" ved `rule-not-met` med
`unavoidable: false`). Med `code`, `rule` og `column` ser appen, om
opskriften allerede har sagt det samme før kørslen, så det ikke står to
gange.

### 3.5 `rules` — opfyldt eller ej

Én linje pr. regel i input, i samme rækkefølge: `{ "rule": 0, "met": true }`.
`met` er lærerens "opfyldt / ikke opfyldt" i hele klassen (svar 8 og 9 siger,
hvornår hver regel er opfyldt). `met: null` betyder **ikke målt**: reglen
havde intet at regne på (fx Balancér eller Ensartede på en kolonne uden tal
og uden rækkefølge). Må have flere felter (fx `"share": 0.83`); appen læser
kun `met` i version 2.

### 3.6 `playback` — trinene til afspilningen

Læreren kan afspille en dannelse bagefter: eleverne deles ud én ad gangen, og
så ses de bytninger, der gjorde grupperne bedre. Motoren skriver derfor ned,
hvad den gjorde.

- `attempts`: ét element pr. forsøg, motoren vil vise. Mindst det forsøg, hvis
  grupper blev resultatet. `best` er dets plads i listen.
- `deal`: uddelingen, i den rækkefølge eleverne blev lagt: `[elev, gruppe]`,
  hvor gruppe er et nummer 0, 1, 2 … i forsøgets egne `groups`.
- `moves`: trinene derefter, i rækkefølge. Hvert trin er ét af:
  - `{ "swap": ["r7", "r2"] }` — to elever bytter plads.
  - `{ "move": "r7", "to": 2 }` — én elev flytter til gruppe 2.
  - `{ "swaps": [["r1", "r5"], ["r4", "r6"]] }` — flere bytninger, der skal
    ses som ét trin (en Skal sammen-blok, der flytter samlet).

  Og må have:
  - `rule`: regelnummeret, trinnet var for (eller `null`). Afspilningen viser
    "Fordel på Køn".
  - `effect`: `"better"` (gruppedelingen blev bedre), `"worse"` (motoren gør det
    værre med vilje for at komme videre), `"same"`.
- `groups`: forsøgets grupper til sidst. **Uddelingen plus alle trin skal give
  præcis de grupper.** For det bedste forsøg er de lig `groups` i svaret.
- `cut`: `true`, hvis der var for mange trin (fx over 20.000). Så **lægges de
  sidste trin sammen til ét `swaps`-trin**, så afspilningen stadig slutter i
  `groups`. Appen siger, at slutningen er samlet i ét spring.

`playback` må være `null`. Så har læreren ingen afspilning af den dannelse.

### 3.7 `stats`

`{ "attempts": 3, "seconds": 0.08 }` — hvor mange forsøg og hvor lang tid.
Kun til udviklerkonsollen og dommeren.

---

## 4. Fremgang undervejs

Læreren skal kunne se, at der sker noget (svar 13). Mens motoren arbejder,
sender den fremgangs-beskeder:

```json
{
  "contractVersion": 2,
  "progress": {
    "seconds": 2.4,
    "attempt": 3,
    "rulesMet": 4,
    "rulesTotal": 6,
    "rulesNotMet": [1, 3],
    "atBestPossible": false,
    "heavyBroken": 0,
    "best": [["r1", "r4", "r2", "r8"], ["r3", "r6", "r5", "r7"]],
    "text": "Forsøg 3 af højst 20"
  }
}
```

- `rulesMet` / `rulesTotal`: hvor mange af lærerens regler den foreløbig
  bedste deling opfylder.
- `rulesNotMet`: regelnumrene på dem, der ikke er opfyldt endnu (`[1, 3]`).
- `atBestPossible`: `true`, når alle regler har nået det bedst mulige; flere
  forsøg kan så ikke gøre det bedre.
- `heavyBroken`: antal brud på de tunge regler (Adskil altid, Undgå
  hinanden, Adskil, Klyng) i den foreløbig bedste.
- `best`: den foreløbig bedste deling (som `groups`, men kun medlemmerne).
  Må udelades, hvis den ikke har ændret sig siden sidst.
- `text`: valgfri kort dansk tekst til skærmen.
- **Den første fremgang skal komme inden for 1 sekund, og derefter mindst
  hvert 2. sekund.** Appen regner motoren for gået i stå efter 20 sekunder
  uden et livstegn (fremgang eller svar) og falder så tilbage til den
  nuværende motor.
- En hurtig dannelse (under 1 sekund) må svare direkte uden fremgang.

---

## 5. Stop og fejl

**Stop.** Læreren kan trykke Stop, fx når fremgangen viser, at grupperne er
gode nok ("stop, når jeg er tilfreds"). Så:

- Motoren svarer **inden for ca. 1 sekund** med `status: "stopped"` og den
  foreløbig bedste deling i `groups` (efter de samme regler som et "ok"-svar:
  alle elever præcis én gang), med beskeder og `rules` for den deling.
  `playback` må være `null`.
- Har motoren endnu ingen hel deling, svarer den `status: "stopped"` med
  `groups: null`. Så bliver grupperne på skærmen stående.
- Appen (fase 5) viser de stoppede grupper som en almindelig dannelse og
  siger, at den blev stoppet før tid. Kommer der intet svar inden for ca. 2
  sekunder, afbryder appen tråden og beholder grupperne på skærmen.
- Stop er ikke en fejl, så appen falder ikke tilbage til den gamle motor.

**Fejl.** Alt, der ikke er et gyldigt svar, falder tilbage til den nuværende
motor, og læreren får beskeden *"Den nye motor kunne ikke danne grupperne.
(Grunden.) Grupperne dannes med den nuværende motor i stedet."*:

- `status: "error"` eller `"unsupported"`
- en fejl, motoren kaster
- 20 sekunder uden livstegn
- et svar, der bryder kontrakten (en elev mangler, står to gange, eller er ukendt)

En time må aldrig gå i stå på grund af den nye motor.

---

## 6. Hvem gør hvad: appen eller motoren

| Opgave | Hvem | Kommentar |
|---|---|---|
| Fraværende elever ud | **Appen** | Motoren ser dem aldrig. |
| Låste elever ud af `students` | **Appen** | De står i `lockedGroups`. |
| Adskil-værdier, som kun låste elever har | **Appen** | Fjernes fra `values`; står ingen værdi tilbage, sendes reglen ikke (svar 5). |
| Aftalerne renset (fraværende ud; låste ud af Undgå, men bliver i Skal sammen) | **Appen** | Lister under 2 elever sendes ikke. |
| "Dan uden aftalen" | **Appen** | Fjerner aftalen fra input og kalder igen. |
| Ingen elever at fordele / alle låst / antal ≤ låste | **Appen** | Appen kalder slet ikke motoren og siger det selv. |
| Kun regler, der har en kolonne | **Appen** | En regel uden valgt kolonne sendes ikke. |
| Store/små bogstaver, mellemrum, tal med komma | **Motoren** | Svar 10. |
| Tekstværdiernes rækkefølge (`columnOrders`) | **Motoren** | Appen sender kun listen. |
| Antal grupper og deres størrelser (+1/-1, låste, loftet: aldrig flere grupper end elever) | **Motoren** | Svar 4, 5 og 12. |
| Afrunding efter emner | **Motoren** | Svar 12. |
| Opdel og puljer | **Motoren** | Svar 3 og 4. |
| Om en Skal sammen-blok kan lade sig gøre | **Motoren** | Svar 1. Svaret er `status: "impossible"` med en `together-…`-besked. (I dag gør appen nogle af tjekkene selv; med den nye motor er det motorens.) |
| Emner til grupperne (og nyt emne til låste med forældet emne) | **Motoren** | Svar 2. Fast rækkefølge ved lige store grupper. |
| Matrix: kilder, antal ved "Fuld" (mindst én fra hver), "højst én fra hver" | **Motoren** | Svar 11 og afsnit 2.2. |
| Alle beskeder om reglerne, aftalerne og grupperne | **Motoren** | Afsnit 3.4. |
| Elevernes navne og gruppernes numre i beskederne | **Appen** | Sætter ind for `{elever}` og `{gruppe:N}`. |
| Gruppernes navne og numre ("Gruppe 3") | **Appen** | Afsnit 3.3. |
| Gemme, historik, "Tidligere kørsler", fortryd | **Appen** | |
| Afspilningens tegning af kortene | **Appen** | Motoren leverer kun trinene. |
| Beskeder om ting omkring motoren (fuldt lager, klasseskift under kørslen, Stop, faldet tilbage) | **Appen** | |
| Advarsler i opskriften FØR læreren trykker | **Appen** (i dag) | Se åbne punkter. |
| Efternølere (placér én elev i færdige grupper) | **Appen** (i dag) | Ikke en del af version 2. |

---

## 7. Indgangen i koden

Den rene side leverer én mappe med JavaScript (ES-moduler, ingen
afhængigheder udefra, intet byggetrin). Mappen har en fil `engine.js`, der
eksporterer:

```js
export const ENGINE_INFO = { name: 'grup-motor', version: '0.1.0', contractVersion: 2 };

// input:  et objekt som i afsnit 2
// hooks.onProgress(p):  kaldes med { contractVersion, progress } (afsnit 4)
// hooks.isCancelled():  true, når læreren har trykket Stop
// svar:   et Promise med et objekt som i afsnit 3
export async function run(input, hooks) { … }
```

- `run` må aldrig røre DOM'en eller nettet. Den skal kunne køre både i en Web
  Worker i browseren og i Node 22 (til dommeren og testene), uden ændringer.
- Den kendte side lægger mappen ind i Grupper og pakker den selv i en worker
  med Stop, tidsgrænse og tilbagefald. Den rene side skal ikke bygge det.
- Flere kerner: vil motoren køre forsøg på flere kerner, må den selv starte
  workers fra filer i sin egen mappe (`new Worker(new URL('./x.js',
  import.meta.url), { type: 'module' })`). I Node skal den kunne køre på én
  kerne uden. Se åbne punkter.
- Filnavne må ikke begynde med to understregninger (de overlever ikke altid
  en upload).

---

## 8. Adapteren: den nuværende motors svar i samme format

Til dommeren kører den kendte side den nuværende motor på testklasserne og
afleverer svarene i formatet fra afsnit 3. Kommandoen tager input-filer i
formatet fra afsnit 2 og skriver én svar-fil pr. input og seed.
Samme input og samme seed giver samme grupper, så længe tidsbudgettet ikke
stopper kørslen (på store hold kan antallet af forsøg variere fra kørsel til
kørsel). **Budgettet er den nuværende motors eget, som i lærerens browser i
dag** (10 sekunder, 20 forsøg, mindst 3 eller 2), uanset `budget` i input:
svarene skal vise, hvad læreren får nu. Over 100 elever får den nye motor
altså 30 sekunder og den nuværende 10. Vil man give den nuværende samme tal
som input, findes en indstilling til det (`--budget-fra-input`). Et input, der ikke følger afsnit 2
(fx to elever med samme `_rowId`, en regel-kolonne, der mangler hos en elev,
eller over 500 elever), afvises med en forklaring i stedet for et svar.

Den nuværende motor kan ikke udfylde alt. I adapterens svar:

- `groups`, `lockedTopics`, `status` og `stats` er fuldt udfyldt.
- `messages` har `type` og `text`. `rule` og `column` er udfyldt, når de kan
  udledes; ellers `null`. `code`, `pool` og `poolValues` er altid `null`, og
  `unavoidable` mangler. Teksterne nævner ikke `{gruppe:N}`. `students` er kun udfyldt
  ved Skal sammen-beskeder og `values` kun ved `columnOrders`-beskeder;
  ellers er de tomme.
  **Dommeren skal bedømme grupperne, ikke beskedernes felter.**
- `rules` (opfyldt eller ej) er den nuværende motors egen vurdering. Kan den
  ikke kobles til en regel, er `met` `null` — her betyder det "ukendt", ikke
  kun "ikke målt".
- `playback` er `null`. Der kommer ingen fremgang, og `status: "stopped"`
  forekommer ikke.
- Flere Opdel følger den nuværende motor, ikke version 2: den deler kun
  efter den første Opdel (svar 4).
- `status: "impossible"` bruges, når den nuværende motor eller appen stopper
  dannelsen (fx en Skal sammen-blok, der ikke kan lade sig gøre).

---

## 9. Åbne punkter

1. **Beskeder før kørslen.** I dag beregner appen selv advarslerne i
   opskriften, før læreren trykker. En senere version kan give motoren en
   "tjek kun"-indgang, der svarer med beskederne uden grupper, så de kommer
   fra ét sted (idédokumentet). Ikke i version 2.
2. **Flere kerner.** Formen ovenfor er et forslag. Den kendte side tjekker, at
   workers fra motorens egen mappe kommer med i Grupper's byg, når motoren
   leveres.
3. **Efternølere** med samme regelmoduler (svar-dokumentet, "Det,
   specifikationen manglede", punkt 2) er en senere kontrakt.

---

## Note fra den koordinerende session (3/11 2026)

Version 2 retter spørgsmål 22–29, 31 og 32 fra `spoergsmaal.md`. Hvor
kontrakten og `specifikation.md` siger noget forskelligt om, hvad motoren skal
*kunne*, gælder specifikationen; om *formatet* gælder kontrakten.

- **Beskeder fra ét sted:** det står den rene side frit for at eksportere en
  ekstra funktion `check(input)` fra `engine.js`, der svarer med `messages`
  uden grupper. Appen tager den i brug, når den findes.
- **Efternølere** kommer i en senere kontraktversion. Byg regelmodulerne, så
  de kan bedømme "én elev i én gruppe", men lav ikke indgangen endnu.
