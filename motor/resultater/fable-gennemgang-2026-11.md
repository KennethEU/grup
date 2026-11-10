# Kan gruppemotoren blive bedre? (gennemgang 10/11 2026)

*Trin 1: en rapport, før der bygges noget. Målt på motoren, som den ligger på
main (76dddaca). Alle målinger er lavet uden frø, som appen kører, med appens
budget (10 s, 30 s over 100 elever, mindst 20 forsøg), fem hovedfrø pr. input,
i Node på én kerne pr. dannelse og 4 dannelser ad gangen. Værktøjerne ligger i
`tools/fable/`, så alt kan køres igen. Trin 2 (det, der blev bygget) står
nederst, i afsnit 8.*

## Kort

- **Kvaliteten kan næsten ikke blive bedre på almindelige klasser.** En dyb
  søgning (10 gange så mange forsøg plus en helt anden søgemetode) fandt noget
  bedre end motorens svar i 19 af 1180 svar i sæt 1 og 2 af 1020 i sæt 2
  (klasser op til 60 elever). Aldrig på de tunge regler. Én gang på målene
  (tredje decimal). Resten er Saml (12 svar i 3 input) og Fordels "dagens
  test" (8 svar i 5 input).
- **Tiden kan blive bedre.** En klasse på 20–32 elever med 4–6 regler tager
  1,5–10 s på én kerne. Næsten al tiden går med at flytte elever frem og
  tilbage for at prøve et bytte. Det kan regnes uden at flytte nogen.
- **Én besked lover for meget.** "Fordel … går ikke helt op i 2 grupper. Det
  kunne ikke undgås" står også, når 1 gruppe var nok. Motoren har kun bevist,
  at *mindst én* gruppe må falde uden om, ikke hvor mange. Fund 1 i
  `kodegennemgang.md` er rettet (eksemplet giver "opfyldt" i 40 af 40 frø),
  men denne mildere udgave står tilbage.
- **Regelrækkefølgen virker, som læreren forventer.** Den samme regel klarer
  sig aldrig dårligere øverst end nederst (0 af 360 sammenligninger).

## 1. Sådan er der målt

| Værktøj | Hvad det gør |
|---|---|
| `tools/run-set.mjs … --unseeded --seeds 1,2,3,4,5` | Motoren som appen, fem hovedfrø |
| `tools/fable/analyse-run.mjs` | Spredning mellem frø, afstand til det bedst mulige, tid, beskeder |
| `tools/fable/deep.mjs` | Dyb søgning: 200 forsøg uden stop før tid, plus 6 runder simuleret udglødning (en anden metode, der også tager dårligere bytninger undervejs) |
| `tools/fable/compare-deep.mjs` | Motorens svar mod den dybe søgning, trin for trin i rangordenen |
| `tools/fable/order-test.mjs` | Vender målenes rækkefølge om og ser, om den øverste regel vinder |
| `tools/fable/stale-test.mjs` | Færre ryst-runder pr. forsøg: hvad koster det? |
| `tools/fable/misses-bound.mjs` | Prøver en grænse for Fordels dagens test mod det, der faktisk kan findes |
| `tools/fable/attempt-cost.mjs` | Tid og antal afprøvede bytninger pr. forsøg |

Den dybe søgning er ikke et bevis for det bedst mulige. Men finder den noget
bedre end motoren, har motoren tabt. Finder to forskellige metoder med ti
gange så meget arbejde det samme som motoren, er der næppe mere at hente.

## 2. Kvalitet

### 2.1 Er frøene enige?

Hvis fem hovedfrø ender forskellige steder, har mindst ét af dem tabt.
Antal input, hvor frøene ikke endte samme sted:

| Elever | Sæt 1: input | tunge | mål | kun Saml | Sæt 2: input | tunge | mål | kun Saml |
|---|---|---|---|---|---|---|---|---|
| 8–19 | 106 | 0 | 0 | 0 | 88 | 0 | 1* | 0 |
| 20–32 | 121 | 0 | 1 | 0 | 109 | 0 | 2* | 0 |
| 33–60 | 10 | 0 | 0 | 2 | 11 | 0 | 0 | 0 |
| 61–100 | 11 | 0 | 0 | 0 | 19 | 1 | 4 | 0 |
| over 100 | 23 | 1 | 3 | 2 | 26 | 0 | 2 | 2 |

\* De tre i sæt 2 er regnestøj, ikke forskelle (se 2.4).

På almindelige klasser ender alle frø samme sted. Spredningen ligger på de
store hold, hvor tiden løber ud, før forsøgene er færdige. De to "tunge" er
295 (sæt 1, 286 elever) og 172 (sæt 2, matrix, 78 elever), begge kendt fra
`motor-runde-kenneth.md`.

### 2.2 Mod den dybe søgning (klasser op til 60 elever)

Antal svar (fem pr. input), hvor den dybe søgning fandt noget bedre:

| | Svar | Tunge | Mål | Saml | Kun dagens test | Ens |
|---|---|---|---|---|---|---|
| Sæt 1, 8–19 | 525 | 0 | 0 | 0 | 2 | 523 |
| Sæt 1, 20–32 | 605 | 0 | 1 | 5 | 4 | 595 |
| Sæt 1, 33–60 | 50 | 0 | 0 | 7 | 0 | 42 |
| Sæt 2, 8–19 | 430 | 0 | 0 | 0 | 0 | 430 |
| Sæt 2, 20–32 | 535 | 0 | 0 | 0 | 2 | 533 |
| Sæt 2, 33–60 | 55 | 0 | 0 | 0 | 0 | 55 |

- **Tunge regler: 0 af 2200.** Motoren finder det samme som den dybe søgning.
- **Mål: 1 af 2200** (116, frø 3: 1,4488 mod 1,4420).
- **Saml: 12 svar i 3 input** (110, 127, 153, alle sæt 1). I 110 og 153 er
  det Saml på tekst: tallet er "antal forskellige værdier i gruppen", og det
  ændrer sig sjældent ved ét bytte, så søgningen går på en flad slette. I 153
  ender alle fem frø på 3 + 3 for meget, hvor 2 + 2 kan findes, og to af
  frøene siger "nok det bedste".
- **Dagens test: 8 svar i 5 input.** Se afsnit 4.
- Den simulerede udglødning fandt aldrig noget, motorens egne forsøg ikke
  fandt. Det bedste blev fundet i **første forsøg i 425 af 445 input** og
  inden for fem forsøg i 438.

### 2.3 Afstand til det bedst mulige

Regler, der i det dårligste frø ligger ved den kendte grænse (alle
klassestørrelser):

| Regel | Sæt 1 | Sæt 2 |
|---|---|---|
| Adskil altid | 73 af 73 | 71 af 71 |
| Undgå hinanden | 93 af 93 | 88 af 88 |
| Adskil | 116 af 116 | 127 af 131 |
| Klyng | 56 af 69 | 67 af 88 |
| Fordel (retfærdigt antal) | 238 af 271 | 214 af 239 |
| Balancér (grænsen fra `bounds.js`) | 36 af 78 | 53 af 104 |
| Saml | 29 af 48 | 26 af 38 |
| Ensartede | ingen grænse kendt | ingen grænse kendt |

Tallene er som i `motor-trin-7.md`. Hvor grænsen ikke nås, er det næsten
altid grænsen, der er for lav, ikke motoren, der er for dårlig: den dybe
søgning når heller ikke længere (2.2). Det gælder også Klyng: 0 svar, hvor
den dybe søgning fandt færre enlige.

### 2.4 Regnestøj på fælles skala (ikke en fejl i grupperne)

Fem input (121 i sæt 1; 112, 208, 277, 300 i sæt 2) har en Balancér, hvor
hver pulje kun har én gruppe. Afstanden er så 0, men regnes som 10⁻¹⁵, og en
tilfældig deling giver også 10⁻¹⁵. På fælles skala bliver det "7,3 mod 0",
selvom grupperne er de eneste mulige. Det er taget ud af tabellerne ovenfor.
Det findes også i dommeren (`judge/rank.mjs` deler med samme tal), så det
kan ikke rettes i motoren alene. Forslag i afsnit 6, idé 7.

### 2.5 Regelrækkefølgen

`order-test.mjs` på sæt 1: 90 input med mindst to mål og 16–40 elever. Målene
vendes om, og reglen, der står øverst i den ene udgave og nederst i den
anden, sammenlignes med sig selv (to frø, 360 sammenligninger):

- bedre øverst: 40 · ens: 320 · **dårligere øverst: 0**,
- i snit 0,15 øverst mod 0,25 nederst (1 = som en tilfældig deling).

Løftet "den øverste regel vejer tungest" holder altså. Det andet åbne spor,
"fair andel", er bygget ind i den nye motors mål for Fordel (spec. 16:
afstanden til det retfærdige antal), så den gamle prototype er ikke
relevant længere.

## 3. Tid

Tid pr. svar i sekunder, én kerne i Node (appen bruger op til 8 kerner, så
læreren venter kortere; en skolecomputer er omvendt langsommere end den Mac,
der er målt på):

| Elever | Sæt 1: median | 90 % | højst | Sæt 2: median | 90 % | højst |
|---|---|---|---|---|---|---|
| 8–19 | 0,00 | 0,44 | 2,15 | 0,00 | 0,35 | 0,88 |
| 20–32 | 0,03 | 1,89 | 10,41 | 0,10 | 2,37 | 10,41 |
| 33–60 | 0,04 | 10,08 | 10,35 | 0,00 | 1,80 | 5,94 |
| 61–100 | 0,10 | 7,26 | 10,35 | 5,72 | 10,56 | 10,89 |
| over 100 | 0,91 | 31,55 | 32,00 | 9,46 | 31,68 | 33,10 |

- Halvdelen af svarene kommer med det samme, fordi alle regler er ved det
  bedst mulige efter første forsøg.
- Resten kører mindst 20 forsøg. En almindelig klasse med 4–6 regler bruger
  70–500 ms pr. forsøg: 009 og 010 (den realistiske klasse, 24 elever) 2,0 og
  2,8 s; 116 (28 elever) 3,4–10 s; 167 (31 elever) 10 s; 186 (34 elever) 7 s.
- **Hvor går tiden hen?** Et forsøg prøver 20.000–130.000 bytninger, og hvert
  koster 0,8–4,4 µs. Profilen (`node --cpu-prof` på 010, 020 og 186) viser,
  at ca. 95 % af tiden er selve "prøv et bytte": begge elever tages ud af
  deres gruppe og sættes ind i den anden (alle reglers tællere rettes), tallet
  læses, og det hele gøres om igen. Otte tæller-rettelser pr. regel for at
  læse to tal.
- **Færre ryst-runder er ikke gratis** (`stale-test.mjs`, sæt 1, 474 kørsler
  à 20 forsøg): med 30 i stedet for 60 runder uden fremgang halveres arbejdet,
  men målene bliver dårligere i 2 kørsler; med 20 i 6, med 10 i 7. Aldrig
  bedre. Indstillingen er altså ikke for forsigtig, og den røres ikke.

## 4. Ærlighed: Fordel og "Det kunne ikke undgås"

Fund 1 i `kodegennemgang.md` gælder ikke længere i sin oprindelige form:
`node gennemgang/fund-1.mjs` giver "opfyldt" i 40 af 40 frø.

Tilbage står dette. `bounds.js` beviser pr. pulje, at dagens test ikke kan
bestås i *alle* grupper. Når det er bevist, og det retfærdige antal er nået,

- siger beskeden "går ikke helt op i N grupper. Det kunne ikke undgås", uanset N,
- og motoren stopper efter første forsøg, uanset N.

Men beviset siger kun N ≥ 1. Eksempler fra basislinjen, alle stoppet efter
1 forsøg:

| Svar | Beskeden | Den dybe søgning |
|---|---|---|
| sæt 1, 142, frø 1 | Fordel på "Niveau" … i 2 grupper. Det kunne ikke undgås | 1 gruppe |
| sæt 1, 152, frø 1 | Fordel på "Køn" … i 5 grupper (to regler: 10 i alt) | 8 i alt |
| sæt 1, 182, frø 1 | "Niveau" 2 grupper, "Sprog" 3 grupper (7 i alt) | 5 i alt |
| sæt 1, 249, frø 4 | Fordel på "Sprog" … i 5 grupper | 4 grupper |
| sæt 2, 219, frø 1 | Fordel på "Sprog" … i 6 grupper | 5 grupper |

Det er 8 af 2200 svar, hvor det påviseligt kunne være bedre. Men beskeden
*påstår* det uden bevis langt oftere: i basislinjen har 646 (sæt 1) og 675
(sæt 2) "kunne ikke undgås"-beskeder for Fordel 2 eller flere grupper.

En nedre grænse for *antallet* kan regnes med de samme to tælleregler, som
`bounds.js` allerede bruger (plads og dækning), bare spurgt "hvor mange
grupper skal mindst falde uden om, før det går op?". Prøvet i
`misses-bound.mjs`: grænsen er aldrig over det, den dybe søgning fandt (255
input), og den rammer præcist i 89 af 140 (sæt 1) og 65 af 115 (sæt 2). De
øvrige er opskrifter, hvor højere regler koster ekstra grupper.

## 5. Store hold (ikke afgørende, men de må ikke blive dårligere)

Over 60 elever løber tiden ud, og frøene ender forskellige steder (2.1). Her
er hvert forsøg 0,3–3 s, så motoren når 2–20 forsøg på én kerne. Alt, der gør
et forsøg billigere, giver flere forsøg på samme tid og dermed bedre svar.
Ingen af idéerne nedenfor gør et forsøg dyrere.

## 6. Idéer, sorteret efter gevinst i forhold til risiko og arbejde

| # | Idé | Gevinst | Risiko | Arbejde |
|---|---|---|---|---|
| 1 | Prøv et bytte uden at flytte eleverne | Tid: skønnet 2–4 gange hurtigere forsøg, samme svar | Lav: kan vises at give præcis samme grupper med frø | Middel |
| 2 | Fordel: "kunne ikke undgås" kun, når antallet er bevist | Ærlighed, og færre grupper uden om i de svar, der i dag stopper for tidligt | Lav. Koster tid i de svar, der ikke længere stopper efter 1 forsøg | Lille |
| 3 | Saml på tekst: en hjælpende hånd på den flade slette | Kvalitet på Saml i få input (3 af 237 i sæt 1) | Middel: ændrer søgningens vej, så andre svar kan flytte sig | Lille–middel |
| 4 | Stop, når de første forsøg er enige | Tid: 425 af 445 input fandt det bedste i første forsøg | Kræver ændring af kontrakten | Lille |
| 5 | Klyng: "plads til par" med i det bedst mulige | Ærlighed ("kunne ikke undgås" i stedet for "nok det bedste") og stop før tid | Lav | Lille–middel |
| 6 | En grænse for Ensartede (sortér og skær) | Stop før tid, når Ensartede er eneste mål | Lav | Middel |
| 7 | Regnestøj på fælles skala | Pænere tal i målinger; intet for læreren | Rører dommeren | Lille |

### Idé 1: prøv et bytte uden at flytte eleverne

*Rører* `engine/modules.js` (hver regel får en funktion "hvad bliver
gruppens tal, hvis elev A går ud og elev B kommer ind?"), `engine/state.js`
(en ny `trySwap`) og `engine/search.js` (bytte af to enkelte elever bruger
den). Blokke og flytninger bruger den gamle vej.

*Måles sådan:* (a) en test, der for tilfældige bytninger i sæt 1 og 2
kræver præcis samme tal fra den nye og den gamle vej; (b) med frø skal
grupperne være præcis de samme som før i alle 3000 svar (arbejdet tælles i
bytninger, ikke i tid); (c) tid pr. forsøg før og efter med
`attempt-cost.mjs`; (d) uden frø, fem frø, sæt 1 og 2: kvalitet frø for frø
og tid i sekunder.

### Idé 2: Fordel, kun "kunne ikke undgås" med bevis for antallet

*Rører* `engine/bounds.js` (grænsen pr. pulje bliver et antal i stedet for
ja/nej), `engine/rules.js` (`atBestPossible`: stop kun, når antallet er
nået) og `engine/messages.js` (beskedens slutning). Kontrakten er uændret:
samme koder og felter, kun færre `unavoidable: true`.

*Måles sådan:* grænsen må aldrig være over det, noget gyldigt svar når
(facit, den nuværende motors svar, den dybe søgning); antal beskeder før og
efter; antal grupper uden om dagens test frø for frø (`compare-runs.mjs`
viser det); tid, fordi færre svar stopper efter første forsøg.

### Idé 3: Saml på tekst

Saml på tekst tæller forskellige værdier pr. gruppe. Flytter man én af tre
"Fodbold" over til de to andre, ændrer tallet sig først, når den sidste også
er flyttet. Søgningen ser derfor ingen forskel på vejen. Idéen er et ekstra
allersidste trin, som kun søgningen bruger (ikke rangordenen, ikke dommeren):
"hvor samlet står værdierne?". Vinderen vælges stadig på den rigtige række.

*Rører* `engine/modules.js` og `engine/rules.js` (`levelPlan`).
*Måles sådan:* Saml frø for frø på sæt 1 og 2, og at tunge regler og mål
ikke flytter sig mere end mellem to kørsler af samme motor. Forkastes, hvis
gevinsten kun findes i sæt 1.

### Idé 4: stop, når de første forsøg er enige (kræver kontrakten; ikke bygget)

Kontrakten siger, at `maxAttempts` (20) er et mindste antal uden frø. Det
bedste findes i første forsøg i 96 % af inputtene op til 60 elever, så fx
"stop efter 8, hvis alle 8 endte samme sted" ville mere end halvere tiden for
de fleste. Det er en ændring af, hvad `maxAttempts` betyder, så den er kun
beskrevet. Den simple vej uden kontraktændring er, at appen sender et lavere
`maxAttempts`; `motor-konvergens.md` har tallene for, hvad det koster (200
forsøg slog 20 i 5 af 520).

### Idé 5–7

- **5, Klyng.** `messages.js` regner allerede "flere værdier end plads til
  par" før kørslen, men tallet er ikke med i reglens bedst mulige. 150
  Klyng-beskeder i basislinjen siger "nok det bedste", og den dybe søgning
  fandt ikke færre enlige i nogen af dem.
- **6, Ensartede.** Er Ensartede eneste regel, giver "sortér og skær" det
  bedst mulige (spec. 6.8). Det kan bruges som grænse, så motoren stopper
  efter første forsøg og siger "kunne ikke undgås". Med flere regler er
  grænsen sjældent nået, så gevinsten er lille.
- **7, regnestøj.** Regn en tilfældig delings tal under 10⁻⁹ som 0 (spec. 7.3:
  "giver tilfældige delinger 0, tæller reglen 0"). Skal gøres ens i motoren
  og dommeren, så det er et spørgsmål til Kenneth, ikke noget jeg retter.

## 7. Prøvet og forkastet i trin 1

- **Færre ryst-runder pr. forsøg** (afsnit 3): halvt arbejde, men dårligere
  mål i 2 af 474 kørsler og aldrig bedre.
- **Simuleret udglødning som søgemetode**: fandt i ingen af 445 input noget,
  motorens egne forsøg ikke fandt.

---

## 8. Trin 2: det, der blev bygget (grenen `claude/fable-motor`)

Idé 1 og 2 er bygget, hver i sit commit. Idé 3 blev prøvet og forkastet.
Alle tal er fem hovedfrø pr. input, uden frø, appens budget, 4 dannelser ad
gangen på samme maskine, "før" og "efter" kørt lige efter hinanden. Tid er
én kerne i Node.

### 8.1 Idé 1: et bytte prøves uden at flytte eleverne (4687b440)

Hver regel har fået `after(gruppe, ud, ind)`: gruppens tal, hvis én elev gik
ud og en anden kom ind. `state.trySwap` spørger reglerne i stedet for at
flytte begge elever frem og tilbage. Blokke og flytninger af én elev bruger
den gamle vej.

**Samme svar.** Med frø (tre frø, 10 s budget) er **1800 af 1800 svar præcis
de samme** som før: samme grupper i samme rækkefølge, samme regler og
beskeder (`tools/fable/same-answers.mjs`). For at få det skulle den nye vej
også efterligne en bivirkning ved den gamle (eleven, der prøves, ender sidst
i sin gruppes liste; `state.moveLast`).

**Tid pr. forsøg** (`attempt-cost.mjs`, 10 forsøg, stille maskine):

| Input | Elever | Før | Efter | Gange hurtigere |
|---|---|---|---|---|
| 001 realistisk, Fordel Køn | 24 | 10,3 ms | 3,4 ms | 3,0 |
| 010 realistisk, seks regler | 24 | 102 ms | 37 ms | 2,8 |
| 020 fem Fordel på gamle grupper | 16 | 36 ms | 9,4 ms | 3,8 |
| 116 | 28 | 101 ms | 42 ms | 2,4 |
| 186 | 34 | 195 ms | 75 ms | 2,6 |
| 253 | 76 | 146 ms | 52 ms | 2,8 |

**Uden frø, frø for frø** (bedre / lige / dårligere end før):

| | Tunge regler | Mål og Saml | Tid, snit | Tid, over 100 elever |
|---|---|---|---|---|
| Sæt 1 | 1 / 1354 / **0** | 12 / 1342 / **0** | 1,37 → 0,78 s | 9,72 → 6,77 s |
| Sæt 2 | 2 / 1263 / **0** | 21 / 1242 / **0** | 1,78 → 0,81 s | 11,26 → 4,87 s |

De svar, der blev bedre, er store hold, som nu når flere forsøg, før tiden
er gået. Tid pr. svar efter klassestørrelse (median / 90 % / højst, sekunder):

| Elever | Sæt 1 før | Sæt 1 efter | Sæt 2 før | Sæt 2 efter |
|---|---|---|---|---|
| 8–19 | 0,00 / 0,41 / 1,99 | 0,00 / 0,16 / 0,72 | 0,00 / 0,39 / 0,95 | 0,00 / 0,13 / 0,39 |
| 20–32 | 0,03 / 1,89 / 10,32 | 0,02 / 0,60 / 5,66 | 0,09 / 2,45 / 10,77 | 0,04 / 0,80 / 5,49 |
| 33–60 | 0,03 / 10,10 / 10,42 | 0,02 / 5,09 / 8,45 | 0,00 / 1,93 / 6,05 | 0,00 / 0,53 / 1,61 |
| 61–100 | 0,11 / 8,28 / 10,56 | 0,03 / 2,24 / 3,82 | 5,52 / 10,33 / 10,89 | 1,33 / 10,09 / 10,25 |
| over 100 | 1,11 / 31,56 / 32,67 | 0,31 / 30,15 / 30,83 | 8,87 / 31,22 / 32,03 | 2,68 / 14,97 / 30,81 |

En almindelig klasse (20–32), der før tog 1,9–2,5 s i den langsomme ende,
tager nu 0,6–0,8 s.

*Tests:* `tests/swap.test.mjs`. Over 30.000 tilfældige bytninger i sæt 1 og
2 giver samme tal ad den nye og den gamle vej, også efter flytninger, der
ændrer gruppestørrelser; fire regler er regnet i hånden; og søgningen ender i
samme grupper ad begge veje. `tests/engine.test.mjs`: Stop-testen trykker nu
Stop efter 0,5 s, fordi kørslen ellers var færdig, før Stop kom.

### 8.2 Idé 2: Fordel, "kunne ikke undgås" kun med bevis for antallet (425d7150)

`bounds.js` regner nu, hvor mange grupper i hver pulje der *mindst* må falde
uden om dagens test (`minMisses`). Beskeden siger kun "kunne ikke undgås",
når antallet er nået, og motoren stopper kun før tid, når det er nået.
Kontrakten er uændret (samme koder og felter).

**Uden frø, frø for frø mod idé 1 alene:**

| | Tunge | Mål og Saml | Grupper uden om dagens test | Tid, snit |
|---|---|---|---|---|
| Sæt 1 | 0 / 1355 / 0 | 1 / 1352 / 2 | færre i 6, flere i 0 | 0,78 → 0,93 s |
| Sæt 2 | 0 / 1265 / 0 | 1 / 1260 / 4 | færre i 3, flere i 0 | 0,81 → 1,28 s |

- De 6 "dårligere" på målene er fire store hold (160, 206 i sæt 1; 064, 266
  i sæt 2; 77–242 elever), der bruger hele tiden. Forskellen er på tredje
  eller fjerde decimal. Før stoppede hvert forsøg tidligt, så de nåede flere
  forsøg (266: 47 mod 27 på 30 s).
- **Beskederne:** "kunne ikke undgås" 1350 → 1112 (sæt 1) og 1536 → 1191 (sæt
  2). De 583 beskeder siger nu "nok det bedste" (eller "Prøv at danne igen"),
  fordi antallet ikke er bevist.
- **Prisen er tid.** Svar, der før stoppede efter første forsøg, kører nu
  mindst 20. En klasse på 20–32: median 0,02 → 0,12 s og 90 % 0,60 → 1,29 s
  (sæt 1); 0,04 → 0,12 s og 0,80 → 1,12 s (sæt 2). Over 100 elever i sæt 2:
  median 2,68 → 5,38 s. Det er stadig hurtigere end før idé 1.
- Dommeren og beskederne er enige i alle 3000 svar (`gennemgang/doem.mjs`: 0
  uenigheder om opfyldt, 0 forkerte "uundgåelig", 0 manglende eller
  overflødige beskeder).

Gevinsten i grupperne er altså lille (9 af 2620 svar får færre grupper uden
om), og prisen er mærkbar på store hold. Det, der købes, er, at beskeden
ikke lover mere, end motoren ved.

*Tests:* `tests/fordel-misses.test.mjs`. Grænsen er regnet i hånden; den er
aldrig over det mindst mulige i alle små klasser (prøvet udtømmende) og
aldrig over facit eller den nuværende motors svar i sæt 1 og 2; og eksemplet
6 A + 1 B i grupper på 4 og 3 giver "kunne ikke undgås" for én gruppe uden
om, men ikke for to.

### 8.3 Begge idéer mod motoren før (det, der anbefales flettet)

| | Tunge regler | Mål og Saml | Tid, snit | Over 100 elever |
|---|---|---|---|---|
| Sæt 1 | 1 / 1354 / **0** | 12 / 1342 / **0** | 1,37 → 0,93 s | 9,72 → 7,03 s |
| Sæt 2 | 2 / 1263 / **0** | 20 / 1243 / **0** | 1,78 → 1,28 s | 11,26 → 8,51 s |

Grupper uden om Fordels dagens test: færre i 8 og flere i 1 (sæt 1), færre i
3 og flere i 4 (sæt 2). De 5 "flere" er store hold (82–211 elever), hvor
tunge regler eller mål samtidig blev bedre; dagens test er sidste trin og
viger for dem.

Mod den nuværende (gamle) motor med dommerens egen sammenligning (dårligste
frø mod den gamles svar): sæt 1 tunge 11 / 284 / 0 og mål 76 / 218 / 1; sæt 2
tunge 13 / 286 / 1 (107, den gamles fejl) og mål 84 / 210 / 6. Det er de
kendte tal. 0 brud på de faste krav.

`npm run test:motor`: 154 tests grønne. `npx vitest run`: 1300 grønne.
`npm run check`: intet at bemærke.

### 8.4 Mutationstest

`python3 tools/fable/mutate.py "$(pwd)" <tom mappe>` kopierer motoren,
ødelægger én ting ad gangen i kopien og kører de nye tests. **17 af 17
mutanter dræbt**: 10 fejl i reglernes `after` (én pr. regeltype), `trySwap`
der kun ser på den ene gruppe, `moveLast` fjernet, beskeden og stopreglen sat
tilbage til "mindst én er nok", og grænsen gjort for høj eller for lav på
tre måder. Første kørsel dræbte 16; den sidste (Saml på en talkolonne, hvor
samme tekst går ud og kommer ind i en gruppe uden tal) fik sin egen test.

### 8.5 Idé 3 (Saml på tekst): prøvet og forkastet

Et ekstra sidste trin, som kun søgningen så ("hvor samlet står værdierne?").
Målt på de input, der har en Saml-regel:

| | Mål og Saml: bedre / lige / dårligere | Tid, snit |
|---|---|---|
| Sæt 1 (62 input) | 10 / 273 / 2 | 0,93 → 1,22 s |
| Sæt 2 (84 input) | 1 / 378 / 1 | 1,28 → 1,89 s |

Gevinsten findes kun i sæt 1, som idéen blev fundet på. I sæt 2 er den væk,
og forsøgene bliver 30–50 % langsommere. Koden er ikke med på grenen.

### 8.6 I browseren (målt 10/11 2026)

`tools/fable/browser/bench.html`: motoren i en Web Worker som i Grupper,
uden frø og med appens budget, 8 kerner (motoren starter selv én worker pr.
kerne). Hvert input tre gange med hver udgave, skiftevis; tallet er medianen
i sekunder fra læreren trykker, til svaret er der. Chromium på samme Mac som
de andre målinger. Med 8 kerner sættes 8 forsøg i gang ad gangen, så
antallet af forsøg er typisk 28 i stedet for 21.

| Input | Elever | Før | Idé 1 | Idé 1 + 2 |
|---|---|---|---|---|
| 001 realistisk, Fordel Køn | 24 | 0,09 | 0,08 | 0,08 |
| 002 realistisk, Køn + Karakter | 24 | 0,22 | 0,23 | 0,16 |
| 009 realistisk, Adskil altid m.m. | 24 | 1,83 | 0,24 | 0,24 |
| 010 realistisk, seks regler | 24 | 0,73 | 0,36 | 0,37 |
| 015 elever29, Køn + Karakter | 29 | 0,24 | 0,12 | 0,12 |
| 020 fem Fordel på gamle grupper | 16 | 0,26 | 0,10 | 0,10 |
| 116 | 28 | 1,08 | 0,59 | 0,57 |
| 124 | 30 | 0,85 | 0,32 | 0,32 |
| 167 | 31 | 2,91 | 1,16 | 0,62 |
| 186 | 34 | 1,40 | 0,57 | 0,57 |
| sæt 2, 085 | 28 | 0,65 | 0,28 | 0,29 |
| sæt 2, 087 | 24 | 1,57 | 0,48 | 0,41 |
| sæt 2, 145 | 32 | 1,34 | 0,50 | 0,55 |
| sæt 2, 298 | 41 | 1,02 | 0,34 | 0,33 |
| 253 | 76 | 1,37 | 0,54 | 0,56 |
| 225 | 265 | 9,93 | 2,24 | 2,26 |

- Almindelige klasser med flere regler går fra 0,7–2,9 s til 0,3–0,6 s. De
  nemme (001, 002) var i forvejen under et kvart sekund.
- Det store hold (225) går fra 9,9 til 2,2 s.
- 167 og 087 svinger fra kørsel til kørsel, fordi de først stopper, når
  forsøgene er holdt op med at blive bedre (51–89 forsøg).
- Idé 2 kan ikke ses i disse input; ingen af dem stoppede før tid på en
  ubevist Fordel. Dens pris står i 8.2.

**Forbehold:** browserpanelet var ikke synligt under målingen (sessionen var
ikke åben i et vindue). Siden meldte selv, at den var synlig
(`document.hidden` var falsk), og tiderne ligner ikke en bremset fane (ingen
runde sekundtal, og før-tallene passer med Node delt med antal kerner). Men
det er ikke en måling på en skolecomputer; forholdet mellem før og efter er
det, tallene kan bruges til.

### 8.7 Ikke gjort

- `public/grupper/` er ikke bygget om. Det skal ske, før ændringen når
  lærerne (`npm run build` i `grup.dk/`).
- Idé 4–7 er kun beskrevet. Idé 4 (stop, når de første forsøg er enige) er
  den, der kan give mest tid, og den kræver en beslutning om kontrakten.
