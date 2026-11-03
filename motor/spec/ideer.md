# En ny gruppemotor til Grupper, skrevet i JavaScript fra bunden — idérunde

*3/11 2026. Kun idéer og anbefalinger; der er ingen kode i dette dokument.*

## Hvordan dokumentet er blevet til (ren-rums-reglen)

Dokumentet er skrevet **alene ud fra en beskrivelse af, hvad Grupper gør set
udefra** (specifikationen står i afsnit 9). Under arbejdet er der ikke åbnet
én eneste fil i repoet: ikke `GroupEng_Glassmorphism/`, ikke `public/pylib/`,
ikke tests, ikke docs, og heller ikke de noter, de andre sessioner har lagt i
den fælles notemappe (de handler om den nuværende motor). Det originale
GroupEng-projekt og anden kode til gruppedannelse er heller ikke set.

Det, der er brugt, er almindelig viden om algoritmer: lokal søgning,
"simulated annealing", grafiske farvelægningsproblemer, constraint solving og
den slags, som står i enhver lærebog.

For en fuldstændig redegørelse: projektets generelle regelfil (CLAUDE.md) og
et register af korte arbejdsnoter var automatisk med i sammenhængen. De
beskriver projektet og arbejdsgangen (fx at Pyodide fylder ca. 4,5 MB, at der
findes en realistisk testklasse, og at mutationstest bruges), ikke hvordan
motoren virker. Ingen kodefiler og ingen docs-filer blev åbnet.

Hvorfor det betyder noget: en del af den nuværende motor bygger på GroupEng,
som er AGPL-licenseret. Skal den nye motor være vores egen, skal den være
designet ud fra *hvad* programmet skal kunne, ikke ud fra *hvordan* den gamle
kode gør det. Det dokument her og specifikationen kan bruges som bevis på,
hvor idéerne kom fra. (Det er ikke juridisk rådgivning; se afsnit 8.)

---

## 1. Kort fortalt — anbefalingen

1. **Lav ét fælles "regel-sprog" først**, før selve motoren: hver regel
   (Adskil, Klyng, Fordel …) bliver et lille modul, der kan tre ting:
   - *måle* en færdig gruppedeling ("hvor meget er reglen brudt?"),
   - *forudsige* det bedst mulige på forhånd ("hvor lidt KAN den brydes?"),
   - *formulere* den danske besked til læreren.

   Det løser problemet med de to steder, beskederne regnes i i dag: opskriften
   og motoren spørger det samme modul.

2. **Sammenlign løsninger i rangorden, ikke med vægte.** En løsning, der
   bryder én "Adskil altid" mindre, er altid bedre, uanset hvad der sker med
   Fordel. Det er præcis den rækkefølge, Grupper lover i dag, og der er ingen
   vægte at finjustere (og intet for læreren at indstille).

3. **Motoren: byg grådigt, og forbedr så med bytninger** (forslag C nedenfor,
   med forbedringsdelen fra forslag A). Det er den enkleste motor, der er hurtig
   nok, og den er nem at forklare og at teste.

4. **Bevis, at den er bedre, med en uafhængig dommer**: en målestok skrevet ud
   fra specifikationen, som giver karakter til *både* den gamle og den nye
   motors grupper på de samme hundredvis af klasser. Den nye skal aldrig være
   dårligere på de tunge regler, og mindst lige så god på målene.

Resten af dokumentet forklarer hvorfor, og hvordan.

---

## 2. Fælles grundlag for alle forslag

Uanset hvilken motor man vælger, er der fire ting, der skal bygges på samme
måde. Det er også dem, der gør det muligt at skifte motor senere uden at røre
resten.

### 2.1 Fra klasseliste til "opgave"

Før motoren går i gang, laves klasselisten og opskriften om til én ren
"opgave" (et dataobjekt). Det er her, alle de små regler om data bor, så
motoren aldrig selv skal tænke på dem:

- **Tekst gøres ens:** små/store bogstaver og mellemrum foran og bagved
  fjernes, før værdier sammenlignes. "Pige", " pige" og "PIGE" er samme
  værdi.
- **Tomme celler er "ikke udfyldt"** — aldrig en kategori for sig. En elev med
  tom celle tæller hverken med i Fordel, Adskil eller Klyng på den kolonne.
- **Tal med komma:** "7,5" bliver tallet 7,5. Man skal passe på med tusindtal
  ("1.000") og med kolonner, hvor kommaet faktisk er et skilletegn; det er et
  sted, hvor der hører et bevidst valg til (spørgsmål til Kenneth i afsnit 7).
- **Rangering:** hvis læreren har sat en rækkefølge på tekstværdier (Lav <
  Middel < Høj), bliver de til tallene 1, 2, 3. Elever med en værdi uden for
  rangeringen behandles som "ikke udfyldt" for netop den regel — de placeres
  frit, men tæller ikke med i gennemsnittet.
- **Fraværende elever** fjernes helt fra opgaven.
- **Aftaler** ("Undgå hinanden", "Skal sammen") ryddes op: slettede og
  fraværende elever fjernes fra dem, og en aftale med under 2 elever tilbage
  forsvinder.
- **"Skal sammen" lægges sammen til blokke:** hvis Ali skal sammen med Bo, og Bo
  skal sammen med Cem, så er {Ali, Bo, Cem} én blok. Motoren flytter blokken
  som én enhed. Dermed kan "Skal sammen" slet ikke brydes undervejs, kun hvis
  blokken selv er umulig (for stor til en gruppe, eller på tværs af en Opdel).
- **Låste grupper** tages ud af opgaven: deres elever er ikke med i fordelingen,
  og deres pladser tæller ikke.
- **Puljer:** Opdel deler eleverne i puljer efter værdi (fx "2.a" og "2.b"). Hver
  pulje er en selvstændig, mindre opgave. Det gør også motoren hurtigere.

### 2.2 Gruppestørrelser: en ren regneregel

Antallet af grupper og deres størrelser regnes ud *før* motoren, ud fra antal
elever i puljen, lærerens valg ("elever pr. gruppe" eller "antal grupper") og
"+1"/"-1". Eksempel: 26 elever, 4 pr. gruppe:

- "+1": 6 grupper; 2 af dem får 5 (6·4 + 2 = 26).
- "-1": 7 grupper; 2 af dem får 3 (5·4 + 2·3 = 26).

Det er en lille, ren funktion, der kan testes for alle tal fra 1 til 300 på et
sekund. **Emner** passes ind her: man prøver at runde antallet af grupper til
et multiplum af antal emner, men kun hvis alle grupper stadig har en tilladt
størrelse; ellers får nogle emner én gruppe mere. Motoren får bare en liste af
"pladser" (gruppe 1 har plads til 4, gruppe 2 til 5 …) og skal aldrig selv tænke
på størrelser.

### 2.3 Hver regel er ét modul med tre funktioner

| Funktion | Spørgsmål den svarer på | Bruges af |
|---|---|---|
| **mål** | "Hvor meget er reglen brudt i *denne* gruppedeling?" (et tal ≥ 0; 0 = perfekt) | motoren, beskederne efter kørslen, sammenligningen med den gamle motor |
| **bedst mulige** | "Hvor lille kan tallet *højst* blive, uanset hvad?" (en nedre grænse) | advarslerne i opskriften, før der køres |
| **besked** | "Hvad skal læreren have at vide?" | opskriften og resultatet |

Desuden en fjerde, som kun motoren bruger: **ændring ved bytning** — "hvor
meget ændrer tallet sig, hvis elev X og Y bytter grupper?" Den regnes ud fra
små tællere pr. gruppe (antal piger, sum af karakterer …) i stedet for at måle
hele klassen igen. Det er det, der gør motoren hurtig.

### 2.4 Rangorden i stedet for vægte

En løsning får ikke ét tal, men en **række af tal i fast rækkefølge**, og to
løsninger sammenlignes som ord i en ordbog: først det første tal, kun ved
lighed det næste osv.

| Plads | Hvad tælles | Svarer til i dag |
|---|---|---|
| 1 | Brud på "Adskil altid" og "Undgå hinanden" (antal par i samme gruppe) | tungest af alt |
| 2 | Brud på "Skal sammen" (normalt altid 0, fordi blokke ikke kan splittes) | — se spørgsmål |
| 3 | Brud på Adskil og Klyng (antal "for mange" og antal "alene") | tunge |
| 4 | Fordel + Balancér + Ensartede, hver gjort om til en skala 0–1 og lagt sammen | mål |
| 5 | Saml | lettest |

Fordelen: præcedensen *er* koden. Der er ingen vægt, der ved et uheld får tre
Fordel-forbedringer til at "købe" ét Adskil-brud. Ulempen: inden for plads 4
skal Fordel, Balancér og Ensartede stadig vejes mod hinanden, og det kræver, at
hver af dem gøres om til samme skala. Forslag: hver regel deles med "hvor
dårligt ville en tilfældig gruppedeling være på netop denne regel" (regnes én
gang i starten). Så betyder 0,5 "halvt så skævt som tilfældigt" for alle tre.

---

## 3. Sådan klares hver regel og funktion — én for én

Dette afsnit er fælles for alle forslag: det beskriver, hvad der *måles*, og
hvordan umuligheder *opdages på forhånd*. Forslagene i afsnit 4 er kun
forskellige i, hvordan de *leder efter* en god løsning.

**k** = antal grupper i puljen, **m** = antal elever, reglen handler om.

### Opdel
- Ikke en vægt, men en opdeling (afsnit 2.1). Hver pulje løses for sig.
- *På forhånd:* en "Skal sammen"-blok med elever fra to forskellige puljer kan
  ikke opfyldes → besked. En pulje med færre elever end den mindste
  gruppestørrelse → besked (fx "Opdel på "Hold": 'Valgfag' har kun 2 elever").
- Flere Opdel-regler: puljen er kombinationen af værdierne ("2.a + Klima").

### Adskil altid og "Undgå hinanden"
- Begge betyder: disse elever må ikke være i samme gruppe. De samles i én
  "må-ikke-mødes"-graf (eleverne er prikker, forbudene er streger). Det er
  matematisk et farvelægningsproblem: kan prikkerne farves med k farver
  (grupper), så ingen streg har samme farve i begge ender?
- *Mål:* antal par af forbudte elever i samme gruppe.
- *På forhånd:* (1) et sæt på m elever, der alle skal adskilles, med m > k er
  umuligt. Det bedst mulige er at sprede de m elever så jævnt som muligt på de
  k grupper; en gruppe med n af dem giver n·(n−1)/2 par. Eksempel: 9 elever i 4
  grupper bliver bedst 3/2/2/2, altså 3+1+1+1 = 6 par (ikke 9 − 4 = 5). Beskeden
  bygges af den jævne spredning ("5 elever skal adskilles, men der er
  kun 4 grupper. Mindst to ender i samme gruppe."). (2) Overlappende sæt kan
  være umulige, selv om hvert sæt for sig er fint; en hurtig farvelægning
  (DSatur — en kendt lærebogsmetode) giver svaret i langt de fleste tilfælde,
  og for de små grafer, der forekommer i en klasse, kan man prøve alle
  muligheder systematisk og være helt sikker. (3) Elever i samme "Skal
  sammen"-blok, som også skal undgå hinanden → modstridende aftaler.

### Skal sammen
- Blokke (afsnit 2.1). Kan ikke brydes af motoren.
- *På forhånd:* blokken er større end den største gruppe → umulig, og
  beskeden siger det. Blokke fylder pladser; en blok på 4 i grupper á 4 skal
  have en gruppe for sig, og flere store blokke end grupper er umuligt (et lille
  "pakke-problem", som tjekkes ved at prøve at lægge de største blokke først).

### Adskil (på værdi)
- *Mål:* for hver gruppe: antal elever med den valgte værdi ud over 1; summen.
- *På forhånd:* m elever med værdien og k grupper → mindst m − k for mange.
  Er k mindre end m, siger beskeden præcis det, og efter kørslen kan motoren
  sige "det bedst mulige blev nået" (ellers er det en fejl i motoren, se 6).

### Klyng
- *Mål:* antal elever, der er den eneste i gruppen med deres værdi.
- *På forhånd:* (1) en værdi, kun én elev har, kan ikke klynges → besked. (2)
  Flere forskellige værdier end grupper: med k grupper og fx 2 pladser pr.
  værdi kan man regne ud, hvor mange værdier der højst kan få et par; overskud
  → besked. Det er et pakke-spørgsmål; et grådigt overslag er nok til beskeden,
  og efter kørslen måles det faktiske tal.

### Fordel
- *Mål:* for hver værdi og hver gruppe: hvor langt antallet ligger fra det
  "retfærdige" antal (værdiens andel × gruppens størrelse). Kun afvigelse *ud
  over* det uundgåelige tæller: har klassen 13 piger i 6 grupper, er 2 eller 3
  piger pr. gruppe perfekt.
- *På forhånd:* går tallet ikke op, kan det ikke blive helt lige → den milde
  besked ("Fordel på "Køn": 13 piger i 6 grupper — nogle får 3, andre 2").

### Balancér
- *Mål:* hvor meget gruppernes gennemsnit spreder sig (fx den største minus
  den mindste, eller summen af afstandene til klassens gennemsnit). Tomme
  celler og ikke-rangerede værdier tæller ikke med i gennemsnittet.
- *På forhånd:* ingen hård grænse; men en kolonne med tekst uden rangering →
  besked ("Balancér på "Niveau" kræver tal eller en rækkefølge").

### Ensartede
- *Mål:* hvor meget medlemmerne af hver gruppe adskiller sig fra deres egen
  gruppes gennemsnit, lagt sammen.
- *Fin detalje:* er Ensartede den eneste regel, findes det perfekte svar
  direkte: sortér eleverne efter værdien og skær i grupper. Det kan bruges
  både som startløsning og som facit i testene.
- *På forhånd:* Balancér og Ensartede på *samme* kolonne trækker i hver sin
  retning (den ene vil blande, den anden samle) → beskeden om modstridende
  regler. Samme besked ved Adskil og Saml/Klyng på samme værdi.

### Saml
- *Mål:* for hver værdi: i hvor mange grupper den er spredt, minus det mindst
  mulige. Lettest i rangordenen, så den aldrig kan ødelægge noget andet.

### Tekst i talregler
- Håndteres i 2.1 (rangering). Beskeden kommer fra regelmodulet: "3 elever har
  en værdi, der ikke er i rækkefølgen, og placeres frit."

### Låste grupper
- Taget ud før kørslen (2.1). Motoren rører dem aldrig, og testene tjekker, at
  de kommer ud uændret.

### Emner
- Antallet af grupper pr. emne regnes i 2.2. Hvis eleverne fordeles på emner,
  før de deles i grupper, er hvert emne en pulje, og beskeder får "inden for
  'Klima'". (Hvordan en elev havner i et emne, er et åbent spørgsmål i 7.)

### Matrixgrupper ("Én fra hver")
- Elegant genbrug: når stamgrupperne er dannet, er matrixdannelsen *bare en ny
  kørsel af samme motor*, hvor stamgruppens nummer er en kolonne, og der
  automatisk er en "Adskil altid" på den kolonne (ingen to fra samme stamgruppe).
  Matrixgruppernes egne regler lægges ovenpå.
- *På forhånd:* en matrixgruppe større end antal stamgrupper er umulig at
  opfylde → besked. Ujævne stamgrupper (nogle på 5) giver flere elever "fra
  samme stamgruppe" end der er matrixgrupper → samme regnestykke som Adskil.

### Flere kørsler
- Alle forslag kører igen og igen inden for tidsbudgettet og beholder den bedste
  efter rangordenen. Tilfældigheden kommer fra et "frø" (et starttal), så en
  kørsel kan gentages præcis — godt for test og fejlsøgning.

### Beskeder fra ét sted
Alle beskeder bliver til som "fund" med samme form: *regel, pulje, slags, tal*.
Én funktion laver fundet om til dansk tekst.

- **Før kørslen** (opskriften) bruges "bedst mulige": "Mindst to ender i samme
  gruppe."
- **Efter kørslen** bruges "mål" med samme skabelon: "To ender i samme gruppe
  (gruppe 3)."
- Er det faktiske tal lig det bedst mulige, siger beskeden, at det var
  uundgåeligt. Er det *større*, har motoren ikke fundet det bedste — det vises
  mildt til læreren ("Prøv at danne igen") og tælles i testene som et svaghedstegn.

Da opskriften og motoren spørger samme modul, kan de ikke længere være uenige.

---

## 4. Tre forslag til selve motoren

Alle tre bruger fundamentet fra afsnit 2 og 3. De er forskellige i,
hvordan de leder.

### Forslag A — Lokal søgning med bytninger ("simulated annealing")

**Idéen:** start med en tilfældig gruppedeling, der overholder størrelserne.
Vælg så igen og igen to elever (eller blokke af samme størrelse) i hver sin
gruppe, og regn ud, hvad det ville betyde at bytte dem. Er det bedre, så byt.
Er det værre, så byt *nogle gange alligevel* — oftere i starten, sjældnere til
sidst. Det lyder mærkeligt, men det forhindrer motoren i at sidde fast i en
løsning, der ser god ud lokalt, men ikke er det bedste. (Navnet kommer fra
metallurgi: metal, der køles langsomt, får en bedre struktur.)

Når den har fået lov at "køle af", startes forfra med et nyt frø, så længe
tidsbudgettet rækker. Den bedste vinder.

**Rangordenen** passer ind sådan: en bytning, der gør plads 1 værre, accepteres
aldrig, når en løsning uden brud er fundet; "lov til at gøre det værre"-delen
gælder kun inden for samme plads.

- **Fordele:** én enkel idé, der klarer alle regler på samme måde. Nye regler
  kræver kun et nyt modul. Meget hurtig: en bytning koster nogle få
  tællerændringer, så JavaScript kan prøve hundredtusindvis pr. sekund — langt
  nok til 300 elever på 1–2 sekunder.
- **Ulemper:** tilfældig — giver to forskellige svar på samme klasse (det gør
  den nuværende også). "Afkølingen" har et par tal (starttemperatur, hastighed),
  der skal sættes én gang med fornuft; sættes de skævt, bliver resultatet
  dårligere, uden at noget fejler. Kan i sjældne, stramme tilfælde overse en
  løsning med 0 brud på de hårde regler, som findes.
- **Arbejde:** motoren selv er lille (2–4 dage med Claude). Det store er
  regelmodulerne og testene, som alle forslag deler.

### Forslag B — Først de hårde regler løses eksakt, derefter optimeres resten

**Idéen:** to trin. Trin 1 er et *constraint satisfaction*-trin: placér
eleverne én ad gangen, den mest begrænsede først (den med flest forbud og
færrest mulige grupper), og gå et skridt tilbage, hvis man løber ind i en
mur ("backtracking"). Resultatet er en deling uden brud på Adskil altid,
Undgå og Skal sammen — eller et *bevis* for, at det ikke kan lade sig gøre. Trin
2 er lokal søgning som i A, men den må kun lave bytninger, der holder de hårde
regler.

- **Fordele:** når en løsning uden hårde brud findes, finder den den — altid.
  Kan sige "det er umuligt" med fuld sikkerhed, ikke bare "vi fandt ingen".
  Den samme backtracking er præcis den, der bruges i analysen på forhånd (3),
  så den giver også de mest præcise advarsler.
- **Ulemper:** to motorer at vedligeholde. Backtracking kan i værste fald tage
  meget lang tid (problemet er af den slags, hvor det sker), så den skal have
  et loft og et "plan B". Trin 2 med låste hårde regler kan blive fanget, fordi
  mange bytninger er forbudt; det kan give lidt dårligere mål end A.
- **Arbejde:** A + 3–5 dage til trin 1 og dens tests.

### Forslag C — Byg grådigt, forbedr bagefter (anbefales)

**Idéen:** også to trin, men begge simple.
1. **Byg:** sortér eleverne efter, hvor svære de er at placere: først blokke og
   elever med forbud, så elever med værdier fra Adskil/Klyng, til sidst resten.
   Sæt hver i den gruppe, hvor den *lige nu* gør mindst skade efter rangordenen
   (og som har plads). Det giver på et øjeblik en god første løsning, og i
   letlavede klasser er den allerede færdig.
2. **Forbedr:** samme bytninger som i A, men enklere: kun bytninger, der
   gør det bedre, plus en "ryst"-runde (et par tilfældige bytninger), når
   den sidder fast. Gentag med nye frø (lidt tilfældighed i rækkefølgen i trin 1)
   inden for tidsbudgettet.

Hvis "Byg" i trin 1 ikke kan undgå et hårdt brud, *og* analysen på forhånd siger,
at det burde kunne undgås, kan man hente B's backtracking ind som reserve
kun for de hårde regler. Det sker sjældent, og så har man det bedste fra B uden at
skulle bygge alt om omkring det.

- **Fordele:** let at forstå og forklare ("de sværeste placeres først"), let at
  fejlsøge (man kan følge hver placering), og hurtig. Starten er god, så
  forbedringen har mindre at gøre, og resultaterne svinger mindre fra kørsel til
  kørsel end i A. Ingen svære indstillingstal.
- **Ulemper:** ren "kun bedre"-forbedring kan sidde fast oftere end A; rystelserne
  og de mange genstarter skal opveje det. Grådig opbygning kan være blind for
  sammenhænge mellem regler (fx Klyng, der kræver *par*); derfor skal Klyng-elever
  placeres to og to i trin 1.
- **Arbejde:** 3–5 dage for motoren; som A er resten fælles.

### Fravalgt: et færdigt matematisk optimeringsbibliotek (heltalsprogrammering)

Det giver de bedste svar på papiret, men det kræver et stort bibliotek, som skulle
hostes på dida.dk, er svært at forstå for en begynder, og regler som
"gennemsnit" og "ensartethed" passer dårligt ind. Ikke pengene værd her.

### Sammenligning

| | A: annealing | B: hårdt først | C: grådig + forbedr |
|---|---|---|---|
| Finder 0 hårde brud, når det kan lade sig gøre | næsten altid | altid (inden for loft) | næsten altid; med B-reserve altid |
| Kvalitet på målene | højest | lidt lavere | høj |
| Svinger fra kørsel til kørsel | mest | middel | mindst |
| Indstillingstal | 2–3 | få | ingen |
| Let at forstå og fejlsøge | middel | svær | let |
| Hastighed for 300 elever | 1–2 sek. | 1–3 sek. (loft på trin 1) | under 1–2 sek. |
| Motorens egen størrelse | lille | størst | lille |

**Anbefaling: C**, med A's "accepter nogle gange en dårligere bytning" som en
mulig senere forbedring, hvis målingerne i afsnit 6 viser, at C sidder fast, og
B's backtracking som reserve til de hårde regler. Fordi regelmodulerne og
rangordenen er fælles, er det nemt at prøve A og C mod hinanden i samme
testopstilling og lade tallene afgøre det.

---

## 5. Hastighed

- **Ingen Python mere:** i dag skal Pyodide (ca. 4,5 MB) hentes og startes, før
  den første gruppe dannes. En ren JavaScript-motor er få hundrede kilobyte og
  starter med det samme. Det alene gør Grupper markant hurtigere første gang.
- **Web Worker:** motoren kører i baggrunden som i dag, så siden aldrig fryser.
  Den sender "foreløbig bedste" tilbage undervejs, så læreren kan se fremgang
  og stoppe tidligt.
- **Tidsbudget:** motoren får et antal millisekunder (fx 1500), kører genstart
  efter genstart og stopper, når tiden er gået, *eller* når løsningen er lig med
  det bedst mulige på alle regler (så findes der ikke noget bedre).
- **Regnestykket:** 300 elever i grupper á 4 er 75 grupper. En bytning kræver,
  at hver regel opdaterer nogle tællere for to grupper. Med 5–10 regler er det
  under et mikrosekund i en moderne browser, altså hundredtusindvis af
  bytninger i sekundet. En typisk klasse på 25 bliver færdig på brøkdele af et
  sekund.
- **Puljer hjælper:** Opdel og emner deler opgaven i mindre stykker, der kan løses
  hver for sig.
- **Forsigtighed:** tal skal måles på en ældre skolecomputer, ikke kun på en ny
  Mac (se 7).

---

## 6. Sådan beviser vi, at den nye motor er mindst lige så god

Kenneths ønske — "Det er vigtigt at programmet kun bliver bedre" — kræver et
måleapparat, ikke en mavefornemmelse.

### 6.1 En uafhængig dommer

Regelmodulernes **mål**-funktioner (afsnit 2.3) er dommeren. De er skrevet ud
fra specifikationen, ikke ud fra den gamle kode, og de giver karakter til en
*færdig gruppedeling*, uanset hvilken motor der har lavet den. Dommeren læser
kun "hvem er i hvilken gruppe", så den kan bedømme den gamle motors resultater
præcis som den nyes.

Karakteren er rangordens-rækken fra 2.4, plus hvert enkelt regeltal for sig, så
man kan se *hvor* en motor er bedre eller dårligere.

### 6.2 Den gamle motor som "sort boks"

Den gamle motor køres uden at kigge i den: man giver den en klasse og en opskrift
gennem Grupper selv og gemmer de grupper, der kommer ud. For at holde ren-rums-
reglen bør **en anden person/session end den, der skriver den nye motor**, lave den
lille "adapter", der får den gamle motor til at køre fra kommandolinjen og gemme
resultaterne i et fælles, simpelt format (elev-id → gruppenummer). Den nye motors
forfatter ser kun formatet og resultaterne, aldrig koden.

### 6.3 Mange klasser

- **Opdigtede klasser fra en generator**, fra 8 til 300 elever, med tilfældige
  kolonner (køn, karakter med komma, niveau Lav/Middel/Høj, tomme celler,
  skæve fordelinger) og tilfældige opskrifter med 1–6 regler, aftaler, låste
  grupper, fravær, emner og matrix. Tusindvis på en nat.
- **Den realistiske testklasse** og lignende "typiske" opskrifter, som en lærer
  faktisk ville lave.
- **"Plantede" klasser:** først laves en perfekt gruppedeling, *så* opfindes
  data, der passer til den (fx præcis 2 piger pr. gruppe). Så ved man, at
  svaret 0 findes, og kan se, om motoren finder det.
- **Grænsetilfælde:** præcis så mange elever, der skal adskilles, som der er
  grupper; én for mange; blokke, der lige akkurat passer; Klyng med mange
  enlige værdier.
- Ingen rigtige elevnavne — alt er opdigtet, og intet forlader computeren.

### 6.4 Sammenligningen

For hver klasse køres begge motorer med **samme tidsbudget** og 5–10 forskellige
frø (fordi begge er tilfældige). Så sammenlignes:

1. **Hårde regler (plads 1–3):** den nye må *aldrig* have flere brud end den
   gamle på samme klasse (sammenlign den nyes dårligste frø med den gamles
   bedste for at være streng). Ét tilfælde, hvor den er dårligere, er en fejl,
   der skal undersøges, før man går videre.
2. **Mål (plads 4–5):** gennemsnit og "hvor mange klasser blev bedre/lige/værre"
   pr. regel. Kravet: bedre eller lige i langt de fleste, og ingen, hvor den er
   markant værre.
3. **Afstand til det bedst mulige:** analysen fra afsnit 3 giver en nedre grænse.
   Hvor tæt kommer hver motor på den? Det fortæller, om der er mere at hente,
   uden at skulle sammenligne med nogen.
4. **Stabilitet:** hvor meget svinger resultatet mellem frø? Mindre er bedre for
   læreren.
5. **Tid:** hvor længe tager det at nå det endelige resultat, især for 250–300?

### 6.5 Faste kontroller (altid sande)

Uafhængigt af kvalitet tjekkes for hver eneste kørsel: hver tilstedeværende elev er
i præcis én gruppe; fraværende i ingen; låste grupper uændrede; alle grupper har
en tilladt størrelse; Opdel-grupper er "rene"; "Skal sammen"-blokke er hele;
matrixgrupper har højst én fra hver stamgruppe.

Desuden **mutationstest** af dommeren: man ødelægger med vilje én regel i en
kopi og tjekker, at testene opdager det. En dommer, der ikke kan fange en fejl,
beviser ingenting.

### 6.6 Overgang

Når tallene er i orden: en periode, hvor begge motorer kan vælges (fx via en
skjult indstilling), så Kenneth kan bruge den nye i egne klasser og se, om
grupperne *føles* rigtige. Først derefter fjernes den gamle.

Ærlig begrænsning: med tilfældighed kan man ikke love "bedre i hver eneste kørsel".
Man kan love: aldrig dårligere på de tunge regler, og bedre eller lige på
målene i de allerfleste klasser — målt, ikke gættet.

---

## 7. Åbne spørgsmål til Kenneth

Alle punkter, hvor specifikationen ikke var nok. Jeg har *ikke* slået svarene
op i koden; de skal komme fra Kenneth (eller fra en, der må se koden, og som så
skriver svaret som en beskrivelse af *hvad*, ikke *hvordan*).

1. **Skal sammen:** hvor tungt vejer den — som Adskil altid (aldrig brudt, hvis
   det kan undgås), eller lettere? Og hvad skal ske, hvis en blok er for stor til
   en gruppe: deles den, eller gives en større gruppe? Det samme for **Undgå
   hinanden**: specifikationen giver rækkefølgen for reglerne, men ikke for
   aftalerne. Dokumentet antager, at "Undgå hinanden" vejer som Adskil altid
   (plads 1 i 2.4) — er det rigtigt?
2. **Emner:** hvordan havner en elev i et emne? Er der en kolonne (elevens ønske),
   fordeles de tilfældigt, eller får grupperne bare et emne-mærke bagefter? Og
   gælder reglerne inden for hvert emne for sig (beskeden "inden for 'Klima'"
   tyder på det)?
3. **Opdel og tomme celler:** hvad sker med en elev, hvis Opdel-celle er tom —
   egen pulje, fri placering, eller en besked?
4. **Opdel og gruppestørrelse:** regnes antal grupper pr. pulje (hver pulje sin
   egen størrelsesberegning), eller fordeles et samlet antal grupper på puljerne?
5. **Låste grupper:** tæller de med i reglerne? Fx: skal "Adskil altid" mellem en
   elev i en låst gruppe og en ufri elev være relevant (det er den ikke, hvis
   låste elever slet ikke er med)? Og tæller de med i "antal grupper"?
6. **Adskil med flere valgte værdier:** betyder "højst én pr. gruppe" højst én
   med *nogen* af værdierne, eller højst én *af hver* værdi?
7. **Klyng:** er "mindst to sammen" nok, eller skal de helst være så mange
   sammen som muligt? Og hvad er rigtigt for en værdi med 3 elever og grupper á 4?
8. **Balancér og Ensartede:** hvad tæller mest — at den værste gruppe er god nok
   (største minus mindste), eller at det samlet set er godt (summen)? Det giver
   forskellige grupper.
9. **Fordel med mange værdier** (fx 8 forskellige fag): skal alle værdier fordeles,
   eller kun de valgte?
10. **Tal med komma:** skal "1.000" være tusind? Hvad med en kolonne, hvor nogle
    celler er tal og andre tekst?
11. **Matrix:** hvilken størrelse vælger læreren typisk, og hvad skal ske med
    fraværende og med elever fra låste stamgrupper?
12. **"+1"/"-1" og meget små klasser:** hvad skal ske ved fx 5 elever og 4 pr.
    gruppe med "-1" (to grupper på 3 og 2)?
13. **Tidsbudget:** hvor længe er læreren villig til at vente — 1 sekund, 3
    sekunder? Og hvilken computer er den langsomste, der skal virke godt?
14. **Gentagelighed:** skal "Dan igen" give nye grupper hver gang (som nu), og vil
    du gerne kunne gemme et "frø" for at genskabe præcis samme deling?
15. **Tidligere grupper** (en kolonne med "sidste gang"): er det bare en
    almindelig kolonne med Adskil, eller er der en særlig regel for "ikke med de
    samme som sidst" (par-historik)? Specifikationen nævner kolonnen, men ingen
    særregel.

---

## 8. Risici på tværs

- **Ren-rums-processen skal være synlig:** behold dette dokument og
  specifikationen i git som udgangspunkt; den, der skriver motoren, må ikke åbne
  den gamle kode; adapteren til den gamle motor laves af en anden. Det styrker
  sagen, men er ikke en juridisk garanti; er der tvivl om licensen, bør en jurist
  se på det.
- **Skjulte løfter:** den gamle motor gør sikkert små ting, der ikke står i
  specifikationen (fx noget med rækkefølgen af grupper eller hvordan uafgjort
  afgøres). Lærerne vil opdage forskelle. Svar: de åbne spørgsmål ovenfor, og
  prøveperioden med begge motorer.
- **Beskeder skifter ordlyd:** hvis beskederne nu kommer fra ét sted, kan nogle
  ord ændre sig. Det er meningen, men det skal tjekkes, at hver besked stadig
  findes.
- **Vægtning inden for målene** (plads 4) er det eneste sted med en "smagssag".
  Den skal afprøves med rigtige klasser og Kenneths øje.
- **Dommeren kan have fejl:** hvis både motoren og dommeren bygger på samme
  misforståelse af en regel, ser alt fint ud. Derfor: de "plantede" klasser, hvor
  svaret er kendt, og mutationstest af dommeren.

### Groft overslag over arbejdet (med Claude, i arbejdsdage)

| Del | Dage |
|---|---|
| Opgaven fra klasseliste (2.1) og gruppestørrelser (2.2) | 2–3 |
| Regelmodulerne (mål, bedst mulige, besked, ændring ved bytning) | 5–8 |
| Analysen på forhånd og beskederne fra ét sted | 3–5 |
| Motoren (forslag C) inkl. matrix og flere kørsler | 3–5 |
| Testgenerator, dommer-kørsel, sammenligning med den gamle | 4–6 |
| Indbygning i Grupper (Web Worker, opskriftens advarsler), prøveperiode | 3–5 |
| **I alt** | **ca. 20–32 dage** |

Forslag A sparer ingen dage; forslag B lægger 3–5 til.

---

## 9. Specifikationen, dokumentet bygger på

*(Som modtaget fra den session, der satte arbejdet i gang, oversat til dansk. Det er den
eneste kilde til, hvad motoren skal kunne.)*

**Input:** en klasseliste som tabel. Hver række er en elev; kolonnerne er dem,
læreren har (navn, køn, karakter, niveau som Lav/Middel/Høj, emne, tidligere
grupper osv.). Celler kan være tekst eller tal, og tomme celler betyder "ikke
udfyldt" (aldrig en kategori for sig). Tekstværdier sammenlignes uden hensyn til
store/små bogstaver og mellemrum foran og bagved. Tal kan have decimalkomma. Hver
elev har et fast internt id.

**Størrelse:** læreren vælger enten "elever pr. gruppe" eller "antal grupper"
plus, hvad der sker, når det ikke går op: "+1" (nogle grupper får én elev mere)
eller "-1" (nogle får én mindre). Grupperne skal være så tæt på den valgte
størrelse som muligt.

**Regler** (læreren kan tilføje flere, også flere af samme slags på forskellige
kolonner):
- **Opdel:** hver gruppe får kun elever med samme værdi i en kolonne. Klassen
  deles først i puljer, og alle andre regler virker inden for hver pulje.
  Strukturel, ikke en vægt.
- **Adskil altid:** bestemte elever må aldrig være i samme gruppe. Tungest af
  alt; brydes kun, hvis intet andet er muligt.
- **Adskil:** spreder elever med en valgt værdi (én eller flere værdier i en
  kolonne), så der højst er én af dem i hver gruppe. Vejer tungt.
- **Klyng:** elever med samme værdi må ikke ende alene; mindst to med samme
  værdi sammen. Vejer tungt.
- **Fordel:** spreder en egenskab jævnt, fx lige mange drenge og piger i hver
  gruppe. Et mål.
- **Balancér:** gør gruppernes gennemsnit i en talkolonne ens, fx samme
  karaktergennemsnit. Et mål.
- **Ensartede:** gør medlemmerne af hver gruppe så ens som muligt i en
  talkolonne (fx samme niveau sammen). Et mål.
- **Saml:** prøver blødt at sætte elever med samme værdi i samme gruppe. Det
  letteste mål; viger for alt andet.
- Rækkefølgen i dag: Opdel først; så Adskil altid; så Klyng og Adskil (tunge);
  så Fordel, Balancér og Ensartede (mål); Saml til sidst. Læreren kan ikke sætte
  vægte, og det er bevidst.
- **Tekst i talregler:** har en kolonne tekstværdier (Lav/Middel/Høj), kan
  læreren give værdierne en rækkefølge ("rangering"), og Balancér/Ensartede
  virker så på den rækkefølge. Elever, hvis værdi ikke er i rangeringen,
  placeres frit.

**Aftaler mellem navngivne elever:**
- **Undgå hinanden:** et sæt på 2 eller flere elever, der alle skal i
  forskellige grupper.
- **Skal sammen:** et sæt elever, der skal i samme gruppe.
- En aftale, hvor en elev er slettet eller fraværende, gælder kun for dem, der
  er tilbage (under 2 tilbage = den gør ingenting).

**Fravær:** en elev markeret fraværende placeres ikke.

**Låste grupper:** læreren kan låse en gruppe; den beholder sine medlemmer, og
kun de øvrige elever fordeles på de resterende grupper.

**Emner:** læreren kan give grupperne emner (fx Klima, EU, Medier), og emnerne
fordeles på grupperne. Antallet af grupper kan rundes til et multiplum af antal
emner, men kun så længe grupperne holder den valgte størrelse; ellers får nogle
emner én gruppe mere end andre.

**To slags grupper:**
- **Stamgrupper:** de almindelige grupper.
- **Matrixgrupper:** nye grupper dannet ud fra stamgrupperne, så hver
  matrixgruppe får højst én fra hver stamgruppe ("Én fra hver", klassiske
  ekspert-/puslespilsgrupper). Matrixgrupper har deres eget regelsæt og deres
  egen størrelse.

**Flere kørsler:** motoren danner grupper flere gange inden for et tidsbudget og
beholder det bedste resultat.

**Beskeder til læreren**, på dansk uden fagudtryk:
- når en regel ikke kan opfyldes, fx "Adskil på "Niveau": 5 elever skal
  adskilles, men der er kun 4 grupper. Mindst to ender i samme gruppe."
- når Klyng har flere forskellige værdier, end der er grupper
- når Fordel ikke kan gå helt lige op
- når to regler trækker i hver sin retning
- når talregler møder tekst
- Er der emner eller Opdel, siger beskeden, hvilken pulje den gælder ("inden for
  'Klima'").
- I dag regnes beskederne to steder (i opskriften før kørslen og i motoren efter
  kørslen), og det er en fejlkilde. Et nyt design skal kunne give dem fra ÉT
  sted, både før og efter.

**Ramme:** alt kører i lærerens browser (ingen server, og elevlisten må ikke
forlade computeren), i dag i en Web Worker. Ingen tredjepartsbiblioteker fra
andre værter; alt serveres fra dida.dk selv. Typisk klasse 20–30 elever; de
største hold har 250–300. Læreren bruger mus på en computer.
