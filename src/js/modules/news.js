// news.js — den lærervendte ændringslog for Grupper.
//
// Ligger i sit eget modul, fordi TO steder skal læse den: nyhedsvinduet
// (NewsDialog.vue) viser listen, og "Om Grupper" (HelpView.vue) viser datoen
// på den nyeste entry som "sidst opdateret". Dér stod før et hårdkodet
// "Version 1.0", som ikke var blevet rørt i 218 nyheder.
//
// 🔔 OBLIGATORISK: tilføj en entry ØVERST ved HVER user-facing ændring.
// Se retningslinjerne (forbudte ord, tone, hvornår der IKKE skal laves en
// entry) i docs/grupper.md → "Nyheder-dialog".
//
// Format: { date: 'YYYY-MM-DD', title, type: 'feature'|'fix', body }
//
// Små rettelser samles pr. dato i ÉN fix-entry ('N rettelser: ...', én linje
// pr. ændring, adskilt af \n). Kun features og store rettelser får egen entry.

// Newest first. Skrevet til lærere uden koderfaring — fokus på hvad du
// ser og kan gøre, ikke teknik. Når du tilføjer en ny entry, hold den
// kort og konkret: "Hvad er nyt?" + "Hvornår er det nyttigt?"
export const NEWS = [
    {
        date: '2026-11-13',
        title: 'Alle advarsler står ét sted i gruppeopskriften',
        type: 'feature',
        body: 'Det, programmet sagde ved sidste dannelse (fx at Fordel på "Køn" ikke går helt op), står nu øverst i gruppeopskriften sammen med de andre advarsler, i stedet for nederst under "Sidste dannelse". Låser du en gruppe eller retter en celle bagefter, forsvinder det, og opskriften prøves igen i baggrunden, så du kan se, om resten kan gå op.\nHenter du en tidligere kørsel frem med samme opskrift som dengang, kommer det, den kørsel sagde, tilbage sammen med mærkerne ved reglerne. Praktisk, når du vil sammenligne to kørsler.',
    },
    {
        date: '2026-11-13',
        title: 'Gem eller slet en klasseliste, der ikke kunne læses',
        type: 'feature',
        body: 'Kunne browseren engang ikke læse din klasseliste, har Grupper lagt den gamle liste til side, så dine klasser kunne reddes. Den indeholder elevnavne. Ligger der sådan en, står der nu en boks øverst under "Import & backup", hvor du kan gemme den som fil og slette den.',
    },
    {
        date: '2026-11-13',
        title: 'Rettelse: matrix-runden tæller de låste grupper, og "EU" og "eu" er samme emne',
        type: 'fix',
        body: 'Havde du låst en matrixgruppe og valgt "Én fra hver", kunne opskriften vise et forkert antal matrixgrupper, fx "4 matrixgrupper", hvor der blev dannet 3. Nu tæller skønnet de låste grupper med og regner kun på de elever, der skal fordeles.\nStod samme emne med forskellige store og små bogstaver på to stamgrupper (fx "EU" og "eu"), blev de regnet som to emner, når matrixgrupperne blev dannet på emner. Så kom der færre matrixgrupper, end opskriften viste, og to fra samme emne i hver. Nu er det ét emne.\nEn låst stamgruppe beholder også sit emne, når det er stavet med andre store og små bogstaver end på klassens emneliste.\nBad du om flere grupper, end der er elever, kunne der stå "ca. 0,3 elever pr. gruppe" i opskriften. Nu regner skønnet på det antal grupper, der bliver dannet.\nHavde du en "Adskil"-regel på en værdi (fx "Dreng") og en låst gruppe, kunne reglen blive sprunget over, hvis værdien stod med andre store og små bogstaver hos eleverne uden for den låste gruppe ("dreng"). Nu gælder reglen for dem.\nStod der tal i nogle få celler i en kolonne med ord, sagde advarslen, at "Balancér" eller "Ensartede" på kolonnen "gør ingenting". Reglen virker for de elever, der har et tal, og det siger advarslen nu.\nHavde du givet en kolonnes værdier en rækkefølge (fx Lav, Middel, Høj) og siden skiftet klasselisten ud, så kolonnen nu har tal eller helt andre ord, blev den gamle rækkefølge stadig brugt. Så gjorde "Balancér", "Ensartede" og "Saml" på kolonnen ingenting, også når kolonnen var tal, og der stod to advarsler om det samme. Nu ses der bort fra en rækkefølge, som ingen elev har en værdi fra.\nLåste du grupper, efter at grupperne var dannet, kunne en ny advarsel i opskriften mangle (fx at seks elever nu skal adskilles i kun to grupper), fordi resultatet fra sidste dannelse handlede om samme regel. Nu kommer advarslen, så snart det, der skal dannes, er et andet end sidst.\nSkiftede du i matrix-runden mellem "Stamgruppe" og "Emne", eller fjernede du en "Undgå hinanden"-aftale, blev resultatet fra sidste dannelse stående i opskriften, selv om det handlede om det gamle valg. Nu forsvinder det, når opskriften er en anden.\nHavde stamgrupperne ingen emner, kunne matrix-opskriften efter "Ja, tag alt med" i kørselshistorikken sige "én fra hvert emne". Der blandes på stamgrupperne, og det står der nu.\nHavde du omdøbt en kolonne efter en dannelse og hentede den gamle kørsel med "Ja, tag alt med", kom reglen tilbage på kolonnens gamle navn og gjorde ingenting. Nu følger omdøbningen med. Spørgsmålet i kørselshistorikken siger også, om det er reglerne, indstillingerne eller aftalerne, der er ændret, så en ny aftale ikke forsvinder uden varsel.\nHentede du en tidligere kørsel, kunne der under "Sidste dannelse" stå, at to elever endte i samme gruppe i fx Gruppe 3, selv om det handlede om den kørsel, du forlod. Nu forsvinder de noter, når andre grupper hentes frem.\nTilføjer du en efternøler, og er der kun plads i en gruppe, der bryder en "Adskil"-regel (fx to ordstyrere i samme gruppe), får du nu en advarsel. Før skete det uden besked.\nTilføjer du en efternøler, holdes efternøleren nu først og fremmest væk fra dem, en "Adskil altid"-regel skal holde den fra, ligesom når grupperne dannes. Før kunne en efternøler i matrix-runden blive sat ved en ordstyrer for at undgå to fra samme stamgruppe.\nStod der en "Opdel"-regel i matrix-runden fra en ældre udgave af Grupper, gjorde den ingenting, men lignede en regel i opskriften. Nu siger opskriften det, linjen står gennemstreget, og en knap fjerner den.\nGendannede du en gemt session og hentede bagefter en tidligere kørsel, kunne spørgsmålet sige "Reglerne er ændret siden", selv om du ikke havde rettet noget (fx fordi en tom regellinje stod i opskriften). Nu kommer spørgsmålet kun, når noget faktisk er ændret.\nLukkede du en advarsel fra sidste dannelse med krydset, kunne den komme igen, når du gendannede en gemt session. Nu bliver den lukket.\nTrykkede du "Prøv med testdata", mens browserens lager var fuldt, stod der "Testklasse oprettet", selv om den ikke blev det. Nu står der, at det ikke lykkedes.\nOmdøbte du en klasse, der lige var slettet i en anden fane, kom fejlen på engelsk. Nu står der, hvad der er sket.\nStod der Balancér eller Ensartede på en kolonne med tal, og var alle elever med et tal fraværende eller låst fast i en gruppe, gjorde reglen ingenting uden at sige det. Nu står der en advarsel i opskriften.\nHavde du givet en kolonne med tal en rækkefølge (fx 3, 2, 1), viste gruppekortets snit et gennemsnit af tallene, selv om grupperne var balanceret efter rækkefølgen. Nu står der intet snit for den kolonne.',
    },
    {
        date: '2026-11-12',
        title: 'Opskriften prøves, mens du skriver den',
        type: 'feature',
        body: 'Når du har ændret noget i gruppeopskriften og holder en kort pause, prøver Grupper nu opskriften af i baggrunden. Ved hver regel kommer et dæmpet mærke, der viser, om reglen kunne holdes, og det, der ikke gik op, står sammen med de andre advarsler øverst i opskriften. Så kan du se det, før du trykker Dan grupper.\nPrøvekørslen danner ikke dine grupper. De dannes først, når du trykker Dan grupper, og dér leder Grupper længere, så resultatet kan blive bedre end prøven.',
    },
    {
        date: '2026-11-12',
        title: 'Rettelse: opskriften viser det antal grupper, der faktisk bliver dannet',
        type: 'fix',
        body: 'Havde klassen flere emner, end størrelsen gav grupper (fx 24 elever i grupper på 5 med "én elev ekstra" og 5 emner), stod der "ca. 5 grupper" i opskriften og en besked om, at der skulle være mindst 5 grupper. Men der blev dannet 4, og en anden besked sagde, at et emne ingen gruppe fik. Nu siger opskriften det, der sker: 4 grupper, og at et emne ikke får en gruppe. Vil du have en gruppe til hvert emne, så vælg "én elev mindre" eller et fast antal grupper.\nMed en "Opdel"-regel kunne "ca. … grupper" også være forkert, fordi hver del af klassen får sine egne grupper. Nu tæller skønnet og beskeden om emnerne hver del for sig.',
    },
    {
        date: '2026-11-11',
        title: 'Rettelse: et navn med komma i en liste fra Lectio, og kolonner i en klasse uden elever',
        type: 'fix',
        body: 'Indsatte du en elevliste fra Lectio, hvor du selv havde skrevet et navn med komma (fx "Hansen, Bo"), blev navnet delt i to, og hele klassen fik en ekstra, tom kolonne. Nu står navnet samlet i Navn-kolonnen.\nEn klasse gendannet fra en backup før maj 2026 kunne i sjældne tilfælde åbnes, men ikke gemmes, omdøbes eller slettes. Nu kan den.\nHavde du slettet alle elever i en klasse, blev en ny eller slettet kolonne ikke gemt: efter en genindlæsning stod kolonnerne, som før du rettede dem. Det samme skete, når en backup af en klasse uden elever blev gendannet. Nu gemmes kolonnerne også, når klassen er tom.',
    },
    {
        date: '2026-11-11',
        title: 'Rettelse: afspilningen og flytningen af elever kører jævnt, også med et stort hold',
        type: 'fix',
        body: 'Afspillede du en kørsel med et stort hold (fx 300 elever), kunne en langsommere computer ikke følge med, og afspilningen gik langsommere end den fart, du havde valgt. Nu tegnes kun de grupper om, hvor en elev flytter sig, så afspilningen kører jævnt.\nDet samme gælder, når du klikker på en elev for at flytte den, og når to elever bytter plads: kun de berørte grupper tegnes om, så klikket svarer med det samme. Det gælder nu også, når klassen har en aftale om at undgå hinanden, og når du melder en elev fraværende i Matrix-runden.',
    },
    {
        date: '2026-11-10',
        title: 'Grupperne dannes hurtigere',
        type: 'feature',
        body: 'Motoren, der danner grupperne, er blevet hurtigere og giver præcis de samme grupper som før. En klasse med flere regler og et stort hold får typisk deres grupper to til fire gange så hurtigt som før. Hvor mange sekunder det tager, afhænger af computeren: på vores testcomputer er en almindelig klasse med flere regler nu klar på under et sekund (før op til 3 sekunder).\nBeskeden ved Fordel, at noget "kunne ikke undgås", står nu kun, når det er sikkert. Før kunne den sige, at to grupper ikke kunne gå helt op, selvom det kunne lade sig gøre med kun én.',
    },
    {
        date: '2026-11-10',
        title: 'Rettelse: en backup i en næsten fuld browser beholder de nyeste gemte sessioner',
        type: 'fix',
        body: 'Gendannede du en backup i en browser, hvor der næsten ikke var plads tilbage, kom kun nogle af de gemte sessioner med, og det var de ældste. Beskeden sagde samtidig, at historikken ikke kunne gendannes, selvom nogle af sessionerne kom med. Nu kommer de nyeste sessioner med først, og beskeden siger, hvor mange der kom med, fx "kom kun 3 af de 12 gemte sessioner med". Behold backup-filen, og frigør plads (slet en gammel klasse eller ryd historikken), hvis du vil have resten med.',
    },
    {
        date: '2026-11-10',
        title: 'Privatlivspolitikken ligger nu bag skjoldet øverst til højre',
        type: 'feature',
        body: 'Linket "Privatlivspolitik" nederst til højre er væk, fordi det kunne ligge i vejen for krydset til at slette en elev i elevlistens nederste række. Nu finder du privatlivspolitikken øverst på siden bag skjoldet øverst til højre, der hedder "Privatliv & GDPR". Elevlisten går igen helt ned til bunden af skærmen.',
    },
    {
        date: '2026-11-10',
        title: 'Rettelse: lukker du en gammel fane med Grupper, sletter den ikke længere dine nye rettelser',
        type: 'fix',
        body: 'Havde du Grupper åben i to faner med samme klasse (fx fordi et link fra Lectio åbnede en ny), kunne den gamle fane slette det, du havde lavet i den nye. Det skete bare ved at lukke den gamle fane, klikke i en celle eller i gruppestørrelsen dér, åbne Matrix-runden eller tage en backup i den, selvom du ikke ændrede noget. Det skete især med en klasse, du ikke havde åbnet, siden Grupper sidst blev opdateret. Rettede navne, regler og emner fra den nye fane var så væk.\nNu gemmer en fane kun det, du faktisk har ændret i den. Retter du i begge faner, får du stadig en besked om, at den anden fane er gammel og skal genindlæses.\nValgte du en anden kolonne under "Vis:" og gik til Hjælp eller Import & backup og tilbage, stod den gamle kolonne der igen, og dit valg blev ikke altid gemt. Nu gemmes valget med det samme og bliver stående.\nLukkede du beskeden "Grupperne … er lige blevet ændret i en anden fane" med krydset, kom den ikke igen, hvis du dannede grupper endnu en gang i den anden fane. Så kunne et træk i den gamle fane slette de nye grupper uden en lyd. Nu kommer beskeden igen.\nGik du fra Grupper til en anden side og tilbage med browserens Tilbage-knap, kom beskeden heller ikke, hvis du havde dannet grupper i den anden fane imens. Nu kommer den, når du er tilbage.',
    },
    {
        date: '2026-11-10',
        title: '15 rettelser: elevlistens bund, knapperne øverst i Grupper, klassens navn på en mindre skærm, beskederne, beskederne ved vinduerne, nyhederne, stregen over grupperne, emnerne i en fuld browser og matrixgruppernes emner',
        type: 'fix',
        body: 'Stod knapperne over elevlisten på to linjer (fx på en lille bærbar med et langt navn i "Vis:"), gik listen lidt ned under skærmens kant, så du skulle rulle hele siden for at se bunden og rullebjælken. Nu passer listen til skærmen igen.\nPå en mindre skærm røg "Dan grupper igen" alene ned i venstre side under gruppeopskriften, mens "Matrix-runde" blev stående ovenover. Nu flytter knapperne ned sammen og står til højre, som de plejer.\nI et smalt vindue (fx Grupper på halvdelen af skærmen) kunne du ikke se, hvilken klasse der var åben, og klassevælgeren lå oven i ikonerne øverst til højre. Nu står fanerne på en linje for sig, så klassens navn kan læses. På en telefon står menuen med klasserne nu helt inde på skærmen.\nKom der mange fejlbeskeder på én gang, kunne de nederst til højre nå op over "Dan grupper igen", så du ikke kunne trykke på den, før du havde lukket nogle af dem. Nu stopper beskederne under knapperne, og du kan rulle i dem.\nÅbner du Gem-menuen eller "Lav aftale", mens der står mange beskeder, ligger menuen nu over dem, så du kan trykke på den.\nKom der en besked, mens gruppeopskriften var åben, lå den bag vinduet og kunne ikke lukkes. Nu står den i vinduet.\nStod der mange beskeder, mens du havde fx Aftaler eller "Gem session" åben, lå de nederst til højre oven på vinduets knapper, så du skulle lukke dem, før du kunne fjerne en aftale eller gemme. Nu stiller beskederne sig ved siden af eller under vinduet, når der er plads. På en lille skærm, hvor der ikke er plads, står de som før og kan lukkes med krydset.\nDet samme gælder nu gruppeopskriften og importens spørgsmål ("Disse klasser findes allerede" og valget af ark): mange beskeder lå over "Dan grupper" og over svarknapperne. Nu står de ved siden af eller under vinduet, når der er plads.\nLinket "Privatlivspolitik" nederst til højre lå oven på krydset til at slette en elev i elevlistens nederste række. Et tryk på krydset åbnede privatlivspolitikken i stedet. Nu slutter elevlisten over linket.\nEt tryk lige ved siden af en besked (fx "Klasse oprettet!") ramte beskedens kant i stedet for knappen bagved. Nu går trykket igennem; kun selve beskeden tager imod det.\nNyhederne er lettere at læse: står flere rettelser samlet, står de nu som punkter med luft imellem i stedet for én lang tekst.\nStregen over hver gruppe er væk, så der ikke længere står to streger lige under bjælken. Trækker du en elev hen over en gruppe, kommer en blå streg stadig frem.\nVar browserens lagerplads fuld, når du dannede grupper med emner, sagde beskeden, at grupperne stod uden emne. Men de nye grupper viste emnerne fra sidste gang, og matrix-runden brugte dem. Nu står grupperne med de emner, beskeden nævner, også i matrix-runden og efter en genindlæsning.\nDet samme gælder nu, når du henter en gemt session eller gendanner grupper: kunne emnerne ikke gemmes, viste grupperne sessionens emner, mens matrix-runden, udskriften og en session, du gemte bagefter, fik emnerne fra før. Nu står det samme alle steder, og beskeden siger, om det kun var emnerne, der ikke blev gemt.\nHavde du hentet en session med emner på matrixgrupperne, fik nye matrixgrupper de gamle emner på, når du lavede en ny matrix-runde. Nu starter nye matrixgrupper uden emne.',
    },
    {
        date: '2026-11-09',
        title: '2 rettelser: værktøjslinjen over elevlisten på en mindre skærm og elevlisten med skærmlæser',
        type: 'fix',
        body: 'På en mindre skærm (fx en lille bærbar eller med zoom) og med en aftale og et langt navn i "Vis:", stod "Flyt" og "Slet kolonne" uden for skærmen, og du kunne ikke nå dem. Nu rykker knapperne ned på en ekstra linje, når der ikke er plads, og et langt navn i "Vis:" slutter med "…". "Import & backup" øverst står også på én linje igen.\nElevlisten læses bedre med skærmlæser: tabellen hedder "Elevliste", en skjult celle læses som "Skjult" i stedet for fem prikker, kolonneoverskrifterne siger, hvilke taster de kan bruges med, og om indholdet er skjult, og pilen ved sorteringen læses ikke op to gange. Vinduet "Slet elev" nævner nu det samme navn som knappen (det, du har valgt under "Vis:").',
    },
    {
        date: '2026-11-04',
        title: '14 rettelser: en backup over en klasseliste, der ikke kunne læses, Excel-skabelonen, en del, der ikke kunne hentes, gamle sessioner, emneforslagene, to menuer, udskriften med skærmlæser, fremmødet i elevlisten, elevlistens bredde, Vis for klassen med skærmlæser, de andre vinduer med skærmlæser, matrix-beskederne, "kan ikke gå helt lige op" i opskriften og Tab gennem en bred elevliste',
        type: 'fix',
        body: 'Kunne browseren ikke læse din klasseliste, kunne det at gendanne en backup eller oprette en ny klasse skrive den gamle liste væk, og ved næste opstart forsvandt grupperne og historikken for de andre klasser. Nu gemmes den gamle liste til side først, og intet ryddes væk, mens den ligger der.\nKunne Excel-delen af programmet ikke hentes, skete der intet, når du trykkede "Download Excel-skabelon". Nu får du en besked.\nKunne en del af programmet ikke hentes (fx uden forbindelse), stod der "prøv igen" — men i Safari virker et nyt forsøg ikke, før siden er genindlæst. Nu står der, at du skal genindlæse siden — og efter en opdatering af grup.dk får du én besked i stedet for to.\nGemte sessioner i Historik over 90 dage blev kun ryddet væk, når du gemte en ny session i samme klasse. En klasse, du ikke har åbnet længe, beholdt dem. Nu ryddes de, når grup.dk åbnes, sådan som GDPR-siden siger.\nSkiftede du til en klasse uden grupper, foreslog emnefeltet den forrige klasses emner. Nu foreslår det kun klassens egne.\nTrykkede du igen på knappen til tidligere kørsler eller afspilningen, mens menuen stod åben, lukkede den ikke. Nu gør den.\nUdskriften (Del → Udskriv) læses bedre med skærmlæser: i matrixen siges "fra" foran stamgruppen, så den ikke lyder som en del af elevens navn, og ikonet på knappen Udskriv læses ikke længere op. Knappen har fået en tydelig ring, når du står på den med tastaturet. Papiret ser ud som før.\nI elevlisten melder du nu en elev væk med den runde knap lige foran navnet: ringen bliver tom, og navnet bliver gråt. Knappen øverst melder alle mødt eller væk på én gang. Kolonnen "Til stede" er væk, så Aftale-fluebenene står tættere på navnene. Excel-eksporten har stadig en kolonne "Til stede".\nHar klassen få kolonner, er kolonnerne i elevlisten ikke længere strakt ud over hele skærmen, så fx Køn står tæt på navnet i stedet for midt på skærmen.\nHar klassen mange kolonner, står Aftale, Mødt og navnet fast til venstre og slet-krydset fast til højre, når du ruller til siden. Så kan du altid se, hvis række du er i. Den kolonne, du har valgt under Vis, står altid først — i Flyt står den låst øverst.\nVis for klassen er bedre med skærmlæser: mens arket står, er siden bagved lukket helt af, så skærmlæseren ikke kan vandre ned i dine knapper bag arket, og knappen hedder bare "Luk" (Escape lukker stadig). Arket ser ud som før.\nDet samme gælder nu alle de andre vinduer (fx Kategorisér, Ranger værdier, Aftaler og "Ny kolonne") og "Danner grupper …": mens de står, kan skærmlæseren ikke vandre ned i siden bagved. Beskederne øverst kan stadig læses op og lukkes.\nBeskederne i Matrix-runden siger nu "stamgruppe" (eller "emne") i stedet for "kilde", forklarer hvorfor der bliver netop så mange matrixgrupper, og hvad du kan gøre, hvis du vil have præcis én fra hver.\nBeskeder som "Fordel på Køn kan ikke gå helt lige op" står ikke længere øverst i gruppeopskriften, men som et lille i ved selve reglen. Hold musen over det for at læse beskeden.\nHar elevlisten mange kolonner, og flyttede du dig gennem en række med Tab eller Skift+Tab, kunne du ende i en celle, der stod skjult bag navnet eller slet-krydset, og skrive i den uden at se det. Nu ruller listen cellen frem, så du altid kan se, hvor du skriver.',
    },
    {
        date: '2026-11-03',
        title: 'Ny gruppemotor: klar med det samme, og du kan se, hvad der lykkedes',
        type: 'feature',
        body: 'Grupper har fået en ny motor til at danne grupperne. Den skal ikke længere hente en stor beregningsmotor, når siden åbner, så Grupper er klar med det samme, og en almindelig klasse har sine grupper på få sekunder. Et stort hold (over 100 elever) kan bruge op til et halvt minut — du kan følge med undervejs og trykke Stop, så beholder du de bedste grupper, motoren har fundet.\nI gruppeopskriften kan du nu se, hvordan det gik ved sidste dannelse: et lille flueben ved hver regel, der blev opfyldt, en streg ved en regel, der ikke kunne gå helt op med klassen, og "alle holdt" eller fx "1 brudt" ved aftalerne. Aftalerne og Adskil altid holdes hver gang, det overhovedet kan lade sig gøre. Har du flere regler af samme slags, fx to gange Fordel, vejer den øverste mest, og du kan bytte om med pilene eller ved at trække i reglen.\nSkal to elever være sammen, men holder en Adskil-regel dem adskilt, stopper Grupper kun, hvis parret virkelig giver flere par i samme gruppe, end klassen alligevel er nødt til. Ellers dannes grupperne, og opskriften siger bagefter, hvilket par det gælder.\nKan grupperne ikke dannes, står dine grupper, som de stod, og du får at vide hvorfor.',
    },
    {
        date: '2026-11-03',
        title: 'Fortryd har fået en knap, og to faner kan dele grupperne',
        type: 'feature',
        body: 'I elevlisten står nu "Fortryd" og "Gentag" i værktøjslinjen. Før kunne du kun fortryde med Ctrl+Z (⌘ Z på Mac), og det skulle du vide. Knapperne er grå, når der ikke er noget at fortryde.\nHar du den samme klasse åben i to faner og danner grupper i den ene, siger den anden det som før. Nu kan du trykke "Hent de nye grupper" i beskeden, så står de samme grupper begge steder. Før skulle du genindlæse siden.\nEn advarsel om, at Klyng har flere forskellige værdier, end der er grupper, eller at for mange elever skal undgå hinanden, står nu i gruppeopskriften, før du trykker "Dan grupper", også første gang. Den står ikke længere én gang til efter dannelsen.',
    },
    {
        date: '2026-11-03',
        title: '12 rettelser: guiden i et smalt vindue, vejledningens knapnavne, en lang celle, markøren i opskriften, træk inden for et kort, et tip under trækket, et træk under afspilningen, Tilbage under afspilningen og med et vindue åbent, opskriften, der hoppede, backup-filens navn og programmets navn',
        type: 'fix',
        body: 'Åbnede du Grupper første gang i et smalt vindue (fx en halv skærm), forsvandt guiden til gruppeopskriften fra andet trin. Nu står den synligt hele vejen. Skiftede du fane, lige før guiden til elevlisten kom, kom den aldrig — nu kommer den næste gang.\nDen pædagogiske vejledning nævner nu de knapper, du ser i gruppeopskriften: "Gem som kolonne i elevlisten" i stedet for "Kolonne", "Elever pr. gruppe" og "Antal grupper", og "én elev ekstra / én elev mindre" i stedet for +1 og -1. Begrænser en lille stamgruppe matrixen, peger beskeden nu på "Emne" i stedet for "Stamgruppe" (under "Én fra hver").\nHavde en celle i elevlisten over 130.000 tegn, kunne grupperne ikke dannes, og beskeden var en blanding af dansk og engelsk. Nu står der på dansk, hvad der er galt, og hvad du kan gøre.\nKlikker du på emnerne i gruppeopskriften, står markøren nu i feltet, så du kan skrive et nyt emne med det samme. Bruger du tastaturet, forsvinder markøren ikke længere, når du fjerner et emne eller en regel: den går videre til den næste. "Flyt ned" kan trykkes flere gange i træk og flytter reglen hele vejen (før flyttede andet tryk den tilbage), og Tab ud af en lille menu lukker den. Det samme i Aftaler: fjerner du den sidste aftale på listen, eller rydder du dem op, der ikke gælder længere, bliver markøren i vinduet.\nTrækker du en elev længere ned i sin egen gruppe, lander eleven nu dér, hvor den stiplede plads viser. Før landede eleven en plads længere nede.\nTrækker du en elev, dukker den mørke hjælpetekst ("Klik for at flytte eleven …") ikke længere op under eleven, mens du trækker. Den kommer igen, når du har sluppet — også når du slipper ved siden af grupperne eller trykker Esc.\nGreb du en elev i grupperne, mens du så en kørsel blive afspillet, stoppede afspilningen, og i Chrome og Edge blev den elev, der sad på samme plads i dine rigtige grupper, trukket over i en anden gruppe. Nu flytter et træk, der begynder i afspilningen, ingen.\nGik du tilbage i browseren (fx med Tilbage-knappen) og frem igen, mens en kørsel blev afspillet, kunne Grupper vise et halvfærdigt billede af afspilningen, hvor du hverken kunne flytte elever eller stoppe afspilningen. Dine grupper var ikke ændret. Nu stopper afspilningen, når du forlader Grupper.\nGik du tilbage i browseren, mens et vindue som "Gendan grupper", "Gem i Historik" eller Aftaler stod åbent, blev vinduet stående over den anden fane. Nu lukker det, når du skifter fane på den måde.\nTrak du en regel op eller ned i gruppeopskriften, kunne vinduet hoppe op og ned undervejs. Nu står det stille, mens du trækker, og også når du flytter en regel med pilene.\nEn backup-fil hedder nu grupdk_backup_ og datoen. Dine gamle backup-filer kan gendannes som før.\nProgrammet hedder nu grup.dk overalt.',
    },
    {
        date: '2026-11-02',
        title: 'Den gamle udgave af Grupper er væk',
        type: 'fix',
        body: 'Gruppeopskriften er nu den eneste måde at danne grupper på. Den gamle udgave kunne vælges til og med 2. november, og knappen til at skifte er fjernet. Dine klasser, grupper og gemte sessioner er de samme som før.',
    },
    {
        date: '2026-11-02',
        title: '4 rettelser i gruppeopskriften, på kortene og i Vis for klassen',
        type: 'fix',
        body: 'Knapperne "Ranger værdierne…" og "Vis aftalen" i en advarsel i opskriften åbnede deres vindue bag opskriften, så du ikke kunne se det. Nu lukker opskriften først.\nGemte du en session, forsvandt beskeden "Session gemt i historikken!" i samme øjeblik. Nu bliver den stående.\nEmnet på et gruppekort har fået sin lille pil igen, så du kan se, at du kan klikke og vælge et andet.\nMens "Vis for klassen" var åben, kunne Ctrl+Enter (⌘+Enter på Mac) danne nye grupper bag arket, så eleverne så grupperne skifte. Nu sker der intet bag arket, og når du lukker det, står du på knappen igen.',
    },
    {
        date: '2026-11-01',
        title: '2 rettelser: dobbelt besked i opskriften og Vis for klassen',
        type: 'fix',
        body: 'Kunne en regel ikke gå helt op, stod forklaringen både øverst i opskriften og under "Sidste dannelse". Nu står den kun øverst.\nLukkede du "Vis for klassen" efter at have genindlæst siden, landede du på "Ingen klasse valgt". Nu står du stadig på Grupper.',
    },
    {
        date: '2026-11-01',
        title: 'Emner ændrer ikke længere din gruppestørrelse',
        type: 'fix',
        body: 'Før kunne emner lave 7 grupper på 4 om til 10 grupper på 2-3, så hvert emne fik lige mange. Nu rundes antallet kun, når grupperne stadig har den størrelse, du valgte. Ellers får nogle emner en gruppe mere end andre, og du kan vælge et antal, der går lige op, med ét klik. Er der færre grupper end emner, får hvert emne stadig en gruppe, og beskeden siger, hvad det koster i størrelse. Du kan vælge det færre antal grupper med ét klik, så udgår et emne.',
    },
    {
        date: '2026-10-30',
        title: 'Elevlisten har fået sin egen guide',
        type: 'feature',
        body: 'Første gang du åbner Elevlisten, viser en kort guide i 7 trin, hvad du kan her: skrive i cellerne, sortere, melde fravær, tilføje kolonner, kategorisere og lave aftaler. Du kan altid se den igen med "Vis guide". Knappen står nu samme sted på Elevliste og Grupper: øverst, lige før klassevælgeren.',
    },
    {
        date: '2026-10-29',
        title: '"Vis for klassen" passer til skærmen, og Tilbage lukker den',
        type: 'fix',
        body: 'Grupperne står nu i ét billede, også på en bærbar: luften i toppen er mindre, og teksten tilpasser sig skærmens højde, så du ikke skal rulle for at se den sidste gruppe. På en storskærm er navnene lige så store som før.\nTrykker du på browserens Tilbage-knap, lukker visningen, og du står på Grupper igen — i stedet for at blive sendt tilbage til Elevlisten.',
    },
    {
        date: '2026-10-29',
        title: '"Filer & Backup" hedder nu "Import & backup"',
        type: 'fix',
        body: 'Fanen i topmenuen hedder nu "Import & backup". Indholdet er det samme: her henter du klasser ind fra Excel, CSV eller indsat tekst, og her tager du en backup af dine klasser eller henter en ind igen.\nUnder "Importér" står "Indsæt tekst / Excel" nu først og er valgt, når du åbner fanen, for de fleste kopierer klasselisten fra Lectio eller Excel. Den anden knap hedder nu "Upload fil eller gendan backup".',
    },
    {
        date: '2026-10-27',
        title: 'Grupper har fået en ny udgave: gruppeopskriften',
        type: 'feature',
        body: 'Du danner nu grupper ved at udfylde en gruppeopskrift: sætninger, hvor du vælger reglerne, emnerne og antallet, og så trykker du "Dan grupper". Dine klasser og dit data er de samme som før, kun skærmen er ny.\nVil du bruge den gamle udgave lidt endnu, kan du vælge den, når Grupper spørger, og skifte tilbage med knappen øverst. Den gamle udgave kan bruges til og med 2. november.'
    },
    {
        date: '2026-10-27',
        title: '8 rettelser: Historik, elevlisten, import og tekster',
        type: 'fix',
        body: 'I Historik hedder det nu "Gendan" i stedet for "Genopliv", og typen står som "Stamgrupper" eller "Stamgrupper + matrixgrupper". Forhåndsvisningen skriver sessionens navn, som du har stavet det.\nI elevlisten står "Til stede" på én linje, og feltet er halvt afkrydset, når nogle er væk. Knappen "Slet" hedder nu "Slet kolonne", og "Lav aftale" står der altid — grå, indtil du har markeret to elever.\n"Kategoriser" starter på en brugbar kolonne (fx Køn) i stedet for navnene.\n"Flyt" har ikke længere numre på rækkerne, og mærket "Vis" hedder nu "Vises på kortene".\nUnder Filer & Backup hedder fanerne "Importér" og "Eksportér". Når du indlæser en backup, spørges der ikke længere om et klassenavn, og findes klasserne allerede, står deres navne i stedet for filnavne.\nBeskeder skriver "1 klasse" og "2 klasser" i stedet for "klasse(r)".\nÅbner du et vindue med musen, står der ikke længere en blå ring om feltet, før du skriver.\nHjælpetekster og beskeder nævner nu de knapper, du faktisk ser — fx "Tidligere kørsler" i stedet for "urskive-knappen".'
    },
    {
        date: '2026-10-26',
        title: '5 rettelser: lyst tema, vinduer, elevliste og indsæt fra Excel',
        type: 'fix',
        body: 'Knappen til mørkt tema øverst til højre er fjernet, og Grupper vises altid lyst. Havde du valgt det mørke tema, skifter siden selv tilbage til det lyse.\nVinduerne "Gendan grupper" og "Gem som kolonne" har fået en Annuller-knap, så du kan fortryde uden at lede efter krydset.\nKolonnen med afkrydsningsfelter i elevlisten har nu overskriften "Til stede".\nKnappen "Indsæt klasseliste fra Excel / Sheets" på forsiden (og i den tomme elevliste) åbner nu direkte på fanen, hvor du indsætter teksten, i stedet for på fil-upload.\nI vinduet "Kopieringsindstillinger" står markøren nu på "Kopiér nu", så du kan nøjes med Enter.'
    },
    {
        date: '2026-10-19',
        title: 'Grupper har fået sin egen adresse: grup.dk',
        type: 'feature',
        body: 'Grupper har nu sin helt egen adresse på grup.dk. Værktøjet fungerer præcis som hidtil, og åbner du den gamle adresse dida.dk/grupper, flyttes dine gemte klasser automatisk med over på grup.dk.'
    },
    {
        date: '2026-10-06',
        title: '6 rettelser: import, Nyheder, tastatur og gemning',
        type: 'fix',
        body: 'Stod der et enkelt anførselstegn midt i et navn eller en celle i din fil (fx 5" eller Jens "Jonny" Hansen), kunne resten af filen blive slugt ind i én celle. Nu læses tegnet bare som tegn, og alle elever kommer med.\nNyhedsvinduet lukker ikke længere, hvis du markerer tekst og slipper musen uden for vinduet.\nKolonneoverskrifterne i elevlisten kan nu bruges med tastaturet: Tab til overskriften, Enter sorterer, F2 omdøber og menutasten skjuler. Slet-knappen nævner eleven ved navn for skærmlæsere.\nVælgeren "Vis:" i værktøjslinjen viser nu en synlig ramme, når du når den med Tab, og låsen på et gruppekort nævner gruppen ved navn.\nHar din fil et anførselstegn, der aldrig bliver lukket, fortæller importen det nu, i stedet for tavst at miste elever.\nOg "Gem session" virker nu også, hvis siden åbnes uden https.'
    },
    {
        date: '2026-10-05',
        title: '6 rettelser: Vinduer, delhold, genopliv og dobbelt-start',
        type: 'fix',
        body: '– Et vindue lukker ikke længere, hvis du trækker ud af et tekstfelt for at markere tekst og slipper uden for det. Det du har skrevet, bliver stående.\n– Kan en gemt session ikke hentes med "Genopliv denne session", bliver du på den fane, du stod på.\n– Et delhold på kun én elev giver nu mindst én gruppe i stedet for ingen.\n– En klasseliste, hvor en kolonne mangler overskrift, læses ind med de rigtige kolonner.\n– Trykker du Generér igen, mens en gruppedannelse stadig kører, bliver den første ikke længere tavst kasseret.\n– Går noget galt, mens Generér gør klar, snurrer ventesymbolet ikke længere for evigt; du får en besked.'
    },
    {
        date: '2026-09-24',
        title: '28 rettelser: Safari, Ctrl+Z, regler, efternølere og beskeder',
        type: 'fix',
        body: '– Grupper ser rigtigt ud i ældre udgaver af Safari (fra før 2023).\n– Klassens navn kan læses i topbjælken på en bærbar med zoom.\n– Ctrl+Z fortryder også, når du lige har sat en elev fraværende.\n– Regler og Emner kan nås på en lav skærm og med zoom.\n– Genopliv en session nævner de elever, der ikke har en gruppe, ved navn.\n– Når du bytter to elever, vises den stiplede elev helt.\n– Gruppen, du trækker en elev hen over, får en blå kant.\n– Papirkurven holder op med at lyse, når du slipper en elev uden for et gruppekort.\n– Ctrl+Shift+Z gentager nu også på Windows, Chromebook og i Firefox.\n– Efternøler med Balancér virker på en rangeret kolonne som "Lav, Middel, Høj".\n– Efternøler med Balancér og Opdel sammenlignes kun med eleverne på sit eget hold.\n– Balancér sammen med Opdel vælger den mest jævne kørsel.\n– En efternøler havner ikke altid i Gruppe 1, når flere grupper passer lige godt.\n– Balancér og Ensartede giver nye grupper hver gang, du trykker Generér.\n– Forklaringsboblen viser teksten for den knap, du står på med Tab.\n– Grupper uden regler er helt tilfældige, også for elever, der står tæt i listen.\n– Er Grupper blevet opdateret, mens siden stod åben, siger programmet det.\n– Navne i Aftaler brydes pænt, og fjern-knappen bliver på skærmen.\n– "Dan grupper uden aftalen" skriver ikke "tilsidesat", når der ikke blev dannet grupper.\n– Lange klassenavne og emner kan læses.\n– Lectio-lister genkendes også, når holdet har mellemrum i navnet (fx "2a SA").\n– Enter i elevlisten markerer hele den næste celle, som i Excel.\n– Når grupperne ikke kan gå op, står der hvorfor i stedet for "Python-fejl".\n– Et omdøb, der ikke kunne gemmes, giver ikke en falsk advarsel om en anden fane.\n– "Århus" skrevet på to usynligt forskellige måder (fx kopieret fra en PDF) tæller som det samme ord.\n– Emnerne går på omgang i rækkefølge, også fra Gruppe 10 og op.\n– Svag grå tekst er gjort mørkere, så den kan læses.\n– Den samme ventetidsbesked gentages ikke ved hvert tryk på Generér.'
    },
    {
        date: '2026-09-24',
        title: 'Byt to elever: hold eleven over en anden elev',
        type: 'feature',
        body: 'Skal to elever bytte gruppe, kan du nu gøre det med ét træk. Træk den ene elev hen over den anden, og hold musen stille et øjeblik. Så får den anden elev to pile og ordet "byt", og navnet står stiplet dér, hvor den første elev kom fra. Slip, og de to bytter plads. Trækker du væk fra navnet igen, eller holder du musen i det grå mellemrum, flytter du bare eleven, som du plejer. Det er nyttigt, når en gruppe skal beholde sin størrelse: før skulle du flytte to elever hver for sig.'
    },
    {
        date: '2026-09-24',
        title: 'Gruppens snit: én linje pr. Balancér-regel, vises med Tags',
        type: 'feature',
        body: 'Bruger du Balancér, stod gruppens gennemsnit i overskriften på hvert gruppekort, men kun for den første Balancér-regel. Nu står snittet på sin egen linje under overskriften, med ét tal for hver kolonne, du balancerer på, fx "Karakter 7,5 · Fravær 3,2". Linjen vises og skjules sammen med elevernes tags med knappen Tags over grupperne. Elever, der er meldt fraværende, tæller ikke længere med i snittet. De står stadig på kortet, men snittet viser gruppen, som den er i dag.'
    },
    {
        date: '2026-09-24',
        title: 'En Skal sammen-aftale, der er i vejen, kan vises med ét klik — eller springes over én gang',
        type: 'feature',
        body: 'Kan en Skal sammen-aftale ikke lade sig gøre — fordi eleverne også skal undgå hinanden, fordi en Adskil-regel holder dem fra hinanden, eller fordi en låst gruppe står i vejen — står der en rød advarsel over grupperne. Den har nu to knapper. "Vis aftalen" åbner Aftaler med netop den aftale markeret, lige oven på grupperne, så du ikke skal skifte til Elevliste og lede. "Dan grupper uden aftalen" danner grupperne denne ene gang, som om aftalen ikke fandtes. Aftalen bliver liggende og gælder igen, næste gang du trykker Generér. Advarslen kommer også tilbage, hvis du havde lukket den og trykker Generér.'
    },
    {
        date: '2026-09-24',
        title: 'Skal sammen og Adskil på samme elever — nu med navne, før du trykker Generér',
        type: 'feature',
        body: 'Har to elever en Skal sammen-aftale, mens en Adskil-regel holder elever med deres værdi fra hinanden (fx to med "Formand" i en rolle-kolonne), kan begge dele ikke lade sig gøre. Før fik du det først at vide efter Generér — og uden at se hvilke elever det gjaldt. Nu står det i en advarsel over grupperne med det samme, med elevernes navne, kolonnen og værdien, så du ved, om det er aftalen eller reglen, der skal rettes. Står eleverne allerede sammen i en låst gruppe, siger den ingenting — dem rører Generér ikke.'
    },
    {
        date: '2026-09-23',
        title: '16 rettelser: Beskeder, regler og importer',
        type: 'fix',
        body: '– Den røde advarsel over grupperne står i programmets egen skrift.\n– Den pædagogiske vejledning siger det samme som programmet om Balancér og Ensartede.\n– Samme besked kommer ikke igen ved hvert tryk på Generér.\n– Generér-knappen bliver ikke skåret af i Matrix på en smal skærm.\n– Tilbage-knappen efter en slettet klasse lander på Oversigt.\n– Grupperne dannes hurtigere, når en regel ikke kan gå helt op.\n– Beskeder lægger sig ikke over Generér-knappen.\n– Når matrixen ikke kan dannes, peger beskeden på den rigtige gruppe.\n– "Adskil" på en værdi, som ingen elev har i dag, giver stadig grupper.\n– "Fordel" giver grupper, selv om en celle står i parentes med komma.\n– "Kategoriser" gør ikke længere tomme celler til "Andet".\n– Emnet står ikke tomt på gruppekortet efter "Tidligere kørsler" eller en gemt session.\n– Gendan grupper: en fraværende elev på listen bliver ikke meldt til stede.\n– Skærmlæseren siger ikke "grupper dannet" efter Stop.\n– "Tilføj efternøler" advarer ikke om aftaler, der er overholdt.\n– "Se kørslen" viser Skal sammen-aftaler flyttet samlet.'
    },
    {
        date: '2026-09-23',
        title: 'Balancér og Ensartede på hver sin kolonne virker nu begge',
        type: 'feature',
        body: 'Havde du fx Balancér på fagligt niveau og Ensartede på fravær, byggede programmet grupperne efter den ene og ignorerede den anden helt — og skrev, at de to regler "arbejder mod hinanden". Det passede ikke: på hver sin kolonne kan de sagtens opfyldes samtidig. Nu bliver begge forsøgt, og beskeden er en rolig bemærkning i stedet for en advarsel. Kun når de to står på SAMME kolonne, er de modstridende, og så siger programmet det stadig. Tip: vil du samle elever med samme niveau (Lav/Middel/Høj), virker "Saml" bedst — Ensartede regner i tal og vejer let, når niveauet kun har tre trin.'
    },
    {
        date: '2026-09-22',
        title: '"Skal sammen"-aftaler gennem en slettet elev blev kaldt ugyldige',
        type: 'fix',
        body: 'Havde du to Skal sammen-aftaler med en fælles elev — fx Anna + Bo og Bo + Carl — og slettede Bo fra klassen, holdes Anna og Carl stadig sammen, når du danner grupper. Men i Aftaler-vinduet stod der samtidig "Gælder ikke længere" på begge aftaler, og knappen "Fjern aftalerne, der ikke gælder længere" ville skille Anna og Carl. Nu står der kun, at aftalerne gælder gennem hinanden, og knappen tilbyder kun at fjerne aftaler, der virkelig ikke gør noget.'
    },
    {
        date: '2026-09-13',
        title: '2 rettelser: Backup og flytning fra www',
        type: 'fix',
        body: '– En gendannet backup åbner den klasse, du lige har gendannet.\n– Flytningen af klasser fra www.dida.dk er mere pålidelig med mange gemte sessioner.'
    },
    {
        date: '2026-09-12',
        title: 'Dine klasser fra www.dida.dk flyttes med til dida.dk',
        type: 'fix',
        body: 'Havde du dine klasser under www.dida.dk, kunne de ikke ses, når du åbnede dida.dk uden www — browseren gemmer dem hvert sit sted, og adresselinjen viser ikke forskellen. Nu sender www.dida.dk dig videre til dida.dk, og dine klasser, grupper og gemte sessioner flyttes med — og åbner du dida.dk uden klasser, spørger Grupper selv efter dem på www.dida.dk og tilbyder at hente dem. Hedder en klasse det samme begge steder, beholder du dem begge; den flyttede står med "(fra www.dida.dk)" efter navnet.'
    },
    {
        date: '2026-09-12',
        title: 'Udskriften af grupperne har fået et roligere udseende',
        type: 'feature',
        body: 'Når du udskriver grupperne eller gemmer dem som PDF (under "Del"), ligner papiret nu et almindeligt dokument: klassens navn, dato og antal elever øverst, og grupperne adskilt af tynde streger. Emnet står under gruppens navn i stedet for i et farvet mærkat, og det hele er sort og gråt, så det også ser pænt ud fra en sort-hvid printer.'
    },
    {
        date: '2026-09-12',
        title: '3 rettelser: Mørkt tema, tastatur og Excel',
        type: 'fix',
        body: '– Advarslen i "Tidligere kørsler" kan læses med mørkt tema.\n– Markøren vender tilbage til knappen, når et navne-vindue lukkes med tastaturet.\n– Excel-filer viser ikke gamle matrixgrupper og slettede emner.'
    },
    {
        date: '2026-09-12',
        title: 'Ny "Del"-knap: hent grupperne som Excel-fil',
        type: 'feature',
        body: '"Oversigt" nede i bunden af skærmen hedder nu "Del" og åbner en lille menu. Herfra kan du stadig udskrive grupperne eller gemme dem som PDF — og nu også hente dem som en Excel-fil med én kolonne eller én række pr. gruppe, klar til at lægge på Lectio. Har du matrixgrupper, vælger du selv, om filen skal have stamgrupperne, matrixgrupperne eller begge.'
    },
    {
        date: '2026-09-11',
        title: '4 rettelser: Samme navn, emner og fuld lagerplads',
        type: 'fix',
        body: '– To elever med samme navn bliver ikke til én, når en ældre session hentes.\n– "Ryd alle emner" siger fra, når lagerpladsen er fuld.\n– Et emne, der ikke kunne gemmes, bliver ikke brugt alligevel.\n– Et gammelt tastetryk kan ikke ændre emnet i en ny fordeling.'
    },
    {
        date: '2026-09-10',
        title: '4 rettelser: Matrix, Fordel og regel-listen',
        type: 'fix',
        body: '– Oversigten og "Gem session" tager ikke gamle matrixgrupper med.\n– En gendannet session melder ikke hele klassen som efternølere.\n– "Fordel" samler ikke tre fra samme gamle gruppe, når det kan undgås.\n– Regel-listen gentager ikke den samme forklaring, og "Opdel" klemmer ikke sin egen række.'
    },
    {
        date: '2026-09-09',
        title: '16 rettelser: Tastatur, skærmlæser og markering af elever',
        type: 'fix',
        body: '– Skærmlæser og stemmestyring bruger knappernes synlige navn.\n– Uden mus bliver markøren, hvor du arbejder, når du flytter elever.\n– Kolonner og rangeringer kan flyttes flere trin i træk med tastaturet.\n– Markøren bliver ikke væk, når du har lavet en aftale.\n– I høj kontrast kan du se, hvilket felt du står i.\n– Skjuler du indholdet i en kolonne, huskes det til næste gang.\n– "Flyt hertil" bliver ikke stående, når markeringen er væk efter Generér eller historik.\n– Roligere skærm, når du flytter en elev: ingen brede blå bjælker på de andre kort.\n– "Meld fraværende" og "Fortryd" sidder hos eleven selv.\n– Forklaringsboblen på en markeret elev siger det rigtige.\n– Stop gælder også, mens gruppedannelsen venter på motoren.\n– Gruppemotoren indlæses mere pålideligt på begrænsede netværk.\n– "Om Grupper" viser, hvornår programmet sidst blev opdateret.\n– Grupper sinker ikke de andre værktøjer, mens motoren hentes.\n– Lange værktøjstip bliver ikke bredere end skærmen.\n– Knappen på den tomme elevliste og menuen bag urskiven har programmets egen skrift.'
    },
    {
        date: '2026-09-09',
        title: 'Grupper henter ikke længere noget udefra — og virker nu på skoler, der blokerer eksterne sider',
        type: 'feature',
        body: 'Selve Python-motoren, der regner grupperne ud, blev hentet fra en ekstern tjeneste (jsDelivr), hver gang du åbnede værktøjet. Der gik ingen elevdata med — det var en ren download — men din IP-adresse var synlig for dem, og GDPR-siden nævnte det som den eneste undtagelse fra løftet om, at intet forlader din computer. Nu ligger motoren på dida.dk sammen med alt det andet, så din browser kontakter ingen andre end os. Det har to synlige følger: er du på en skole, hvor netværket blokerer eksterne sider, kunne Grupper slet ikke danne grupper — det virker nu. Og opstarten er lidt hurtigere, fordi filen kommer fra samme sted som resten af siden. Du skal ikke gøre noget; dine klasser og grupper er uberørte.'
    },
    {
        date: '2026-09-08',
        title: '8 rettelser: Regler, tal og tilføj elev',
        type: 'fix',
        body: '– Firefox: små pile i feltet med gruppestørrelse ændrer ikke tallet ved et uheld.\n– At slette eller omdøbe en klasse rører ikke den klasse, du arbejder i.\n– Måltallet kan tastes forfra uden et 1-tal med.\n– Elevlisten sorterer rigtigt på kolonner som telefonnumre.\n– "Skal sammen"-aftaler kan flytte samlet, og grupperne bliver bedre.\n– Værdifeltet er væk på de regler, hvor det ikke gjorde noget.\n– "Adskil" uden en valgt værdi siger fra.\n– "Tilføj elev" tager hensyn til alle dine regler og aftaler.'
    },
    {
        date: '2026-09-08',
        title: 'Du kan nu se, hvilke regler der vejer tungest',
        type: 'feature',
        body: 'Sætter du to regler på, der vil hver sin vej, afgør programmet selv hvilken der får lov. Det har det altid gjort — du kunne bare ikke se det. Under hver regel står der nu, hvor tungt den vejer: "Opdel" deler klassen op først, så de øvrige regler arbejder inde i hver del; "Klyng" og "Adskil" vejer tungt og viger kun, hvis de ikke kan gå op; "Fordel", "Balancér", "Ensartede" og "Saml" er mål, der viger for de tre andre. Det samme står i hjælpen bag spørgsmålstegnet ved Regler, som nu også nævner, at aftalerne under Elevliste vejer endnu tungere: "Skal sammen" bliver aldrig brudt, og en undgåelse viger kun, hvis intet andet er muligt.'
    },
    {
        date: '2026-09-07',
        title: '7 rettelser: Fortryd, låste grupper og aftaler',
        type: 'fix',
        body: '– Papirkurven og "Tilføj elev" kan fortrydes, og fortryd holder rækkefølgen.\n– En tom, låst gruppe kan ikke slettes ved et uheld.\n– En slettet elev bliver ikke ved med at være markeret.\n– Navnene i undgåelser og aftaler står i elevlistens rækkefølge.\n– Beskeden om reglernes rækkefølge passer til det, der faktisk sker.\n– Aftaler og gendannelse holder bedre fast i den rigtige elev.\n– Beskeden om en Skal sammen-aftale er mere præcis.'
    },
    {
        date: '2026-09-07',
        title: 'Ryd op i de aftaler, der ikke gælder længere',
        type: 'feature',
        body: 'En undgåelse eller en "Skal sammen"-aftale bliver stående, når du sletter en af eleverne — den kan jo være det eneste sted, en beslutning om to elever står skrevet. Er der under to af aftalens elever tilbage i klassen, kommer den bare aldrig i brug igen, og den talte alligevel med i tallet ved siden af "Aftaler". Nu står der øverst i vinduet en knap, der fjerner netop dem. Aftaler, hvor der stadig er to elever tilbage, bliver stående med det slettede navn synligt — de virker jo stadig mellem de øvrige. Og linjen under en død aftale siger nu "Gælder ikke længere" i stedet for "Gør ingenting lige nu", som er det, der står ved en aftale, hvor eleverne bare er fraværende i dag.'
    },
    {
        date: '2026-09-07',
        title: 'Klassens sidste kolonne kan ikke længere slettes ved et uheld',
        type: 'fix',
        body: 'Har du indsat en ren navneliste, har klassen kun én kolonne. "Slet kolonne" tilbød den alligevel — og slettede du den, forsvandt alle elevernes navne på én gang. Der kom ingen advarsel, og fortryd kunne ikke hente dem tilbage, fordi en sletning rydder fortryd-stakken. Nu siger programmet fra og forklarer hvorfor. Vil du alligevel af med kolonnen, så lav en ny først, eller dobbeltklik på overskriften og omdøb den.'
    },
    {
        date: '2026-09-06',
        title: 'Bestem hvilke elever der skal følges ad',
        type: 'feature',
        body: 'Markér mindst to elever i elevlisten, tryk "Lav aftale" og vælg "Skal sammen". De bliver holdt samlet, næste gang du danner stamgrupper, mens resten af gruppen gerne må skifte. Aftalen gemmes, til du fjerner den under "Aftaler". Fraværende elever springes over, og aftaler med fælles elever gælder samlet. Kan aftalen ikke passe med gruppestørrelsen, en undgåelse, Opdel eller en låst gruppe, får du besked, og de eksisterende grupper bliver stående. Matrixgrupper følger deres egne regler.'
    },
    {
        date: '2026-09-06',
        title: '8 rettelser: Komma i tal, beskeder og backup',
        type: 'fix',
        body: '– En karakter skrevet 7,5 tæller med i "Balancér".\n– Snittet på gruppekortet regner 7,5 som syv en halv.\n– En ny besked forsvinder ikke, fordi der lå fem fejl i forvejen.\n– Den nederste besked kan klikkes væk, også når stakken er højere end skærmen.\n– Den samme besked igen stiller uret om.\n– Dine klasser hedder det samme efter en gendannelse.\n– Backup siger til, hvis noget mangler.\n– "Importér som kopi" giver hver klasse sit eget navn.'
    },
    {
        date: '2026-09-06',
        title: 'I "Kategoriser" klikker du nu værdierne i stedet for at skrive dem',
        type: 'feature',
        body: 'Når du laver en ny kolonne med "Kategoriser", skulle du før skrive værdierne selv, med kommaer imellem: "10, 12". Kommaet var altså et skilletegn — og stod der et komma inde i selve værdien, gik det galt. En karakter skrevet 7,5 blev til "7" og "5", et navn skrevet "Hansen, Bo" blev til to, og et svar som "Ja, med støtte" ligeså. Ingen af delene findes i klassen, så hele kolonnen blev til "Andet", og der stod ikke noget om hvorfor. Nu står kolonnens egne værdier som mærkater, du klikker på — så kan kommaet aldrig misforstås, og du kan heller ikke komme til at skrive en værdi forkert. En værdi, du har brugt i én regel, er slået fra i de andre, for den kan kun høre til ét sted.'
    },
    {
        date: '2026-09-06',
        title: 'Testklassen bliver ikke erstattet, uden du bliver spurgt',
        type: 'fix',
        body: 'Knappen "Prøv med testdata" laver en klasse med 28 opdigtede elever, du kan lege med. Fandtes den allerede, blev den skrevet over uden et ord — sammen med de grupper, emner, historik og gemte sessioner, du havde bygget i den. Nu bliver du spurgt først, præcis som når to klasser støder sammen i en backup, og du kan vælge at beholde den, du har.'
    },
    {
        date: '2026-09-04',
        title: '12 rettelser: To faner, Stop, tastatur og gruppeantal',
        type: 'fix',
        body: '– "Stop" er der stadig, når du har rullet ned.\n– Du får besked, hvis grupperne bliver dannet i en anden fane.\n– En klasse, du har slettet i en anden fane, kommer ikke tilbage af sig selv.\n– Matrix siger, hvilken gruppe der sætter loftet.\n– Du kan ikke få flere gruppekort, end der er elever.\n– To beskeder om emner lover ikke mere, end de kan holde.\n– Du kan melde en elev fraværende uden at trække hende.\n– Afspilningen af "Se kørslen" slipper, når du går videre.\n– Med tastaturet mister du ikke stedet på skærmen i afspilleren og historikken.\n– Når du skifter klasse, følger den forrige klasses arbejde ikke med.\n– Programmet spilder ikke tid på en regel, det ikke kan opfylde.\n– "Se kørslen" siger, når en elev bytter med en tom plads.'
    },
    {
        date: '2026-09-03',
        title: '"Klyng" virker nu — især på store hold',
        type: 'fix',
        body: 'Bruger du reglen "Klyng" til at samle elever med samme værdi, har programmet indtil nu ofte efterladt en enkelt elev alene med sin værdi — præcis det, reglen skal forhindre. Det blev værre, jo større holdet var: på 22 elever blev reglen opfyldt i 86 procent af grupperne, på 60 elever kun 45 procent, og på 120 elever kun 17 procent. Årsagen var en fejl i den del af programmet, der flytter den ensomme elev: den kiggede på den forkerte elev nitten ud af tyve gange. Nu bliver kørsler med "Klyng" håndteret af programmets anden metode, som ikke har fejlen, og reglen bliver opfyldt fuldt ud i alle de hold jeg har målt — også de store. Det gør samtidig kørslen hurtigere: på et hold med 120 elever fra godt et sekund til godt et sekund, men med et resultat der er mange gange bedre. Du skal ikke gøre noget; det virker af sig selv.'
    },
    {
        date: '2026-09-03',
        title: 'Programmet prøver nu flere gange, hvis det kan betale sig',
        type: 'feature',
        body: 'Når du trykker Generér, laver programmet grupperne flere gange og beholder det bedste forsøg — og det stopper med det samme, hvis et forsøg opfylder alle dine regler fuldstændigt. Før prøvede den højst tre gange, og det betød, at du nogle gange nøjedes med en næstbedste fordeling, selv om en perfekt fandtes. Nu prøver den op til 20 gange eller i 10 sekunder, alt efter hvad der kommer først. På et rigtigt hold med 22 elever og seks regler gik det fra at ramme en perfekt fordeling i halvdelen af tilfældene til at ramme den hver gang — og ventetiden voksede kun fra 1,09 til 1,14 sekund, fordi den jo holder op i samme øjeblik den er i mål. Store hold mærker ingen forskel: dér tager ét forsøg flere sekunder, og programmet regner efter, om der overhovedet er tid til et forsøg mere, før det går i gang med det. Målt på 250 elever: 9,1 sekund før, 9,0 sekund nu.'
    },
    {
        date: '2026-09-03',
        title: 'Regel-vinduet viser nu, hvilken regel der giver efter',
        type: 'feature',
        body: 'Har du flere regler af samme slags — fx fem "Fordel"-regler — kan de sjældent alle gå op på én gang, og så er der én af dem, der må vige. Det har altid været den nederste i listen, men det kunne man ikke se. Nu står der et nummer ud for hver regel, og den nederste er markeret med gult: det er den, programmet ofrer først. Vil du hellere have en anden regel til at vige, trækker du bare i håndtaget og bytter om. Numrene dukker kun op, når rækkefølgen faktisk betyder noget. Bruger du "Balancér", "Ensartede", "Saml" eller "Opdel", vejer programmet nemlig alle regler samtidig — og så er rækkefølgen ligegyldig. Det er efterprøvet: med den slags regel giver det præcis samme grupper, uanset hvordan du sorterer listen, så der ville numrene bare love dig en styring, du ikke har.'
    },
    {
        date: '2026-09-03',
        title: 'Beskederne skubber ikke længere grupperne ned',
        type: 'feature',
        body: 'Når programmet havde en bemærkning til dig — fx at 4 grupper og 3 emner ikke går op — stod den som et bredt felt over gruppekortene og skubbede dem ned. Og jo flere bemærkninger, jo mindre plads var der til det, du faktisk ville se på. Nu står de dér, hvor de hører hjemme: handler beskeden om antallet af grupper, får selve talfeltet i båndet en gul ring og et lille ⓘ, du kan trykke på for at læse den. Det koster ingen plads i resultatet — og teksten står nu lige ved siden af det tal, du skulle ændre. Beskeden "Du har låst N grupper" er helt væk, for hængelåsen står jo allerede på kortene. Tilbage over grupperne står kun det, der betyder, at noget faktisk er galt: at dine regler ikke kan opfyldes, eller at eleverne står uden navn på kortene. Grupperne bliver altså kun skubbet ned, når der er en grund til det.'
    },
    {
        date: '2026-09-03',
        title: 'Se gruppedannelsen ske — trin for trin',
        type: 'feature',
        body: 'Der er kommet en ny knap i værktøjslinjen nederst, ved siden af den, der viser tidligere kørsler. Efter en gruppedannelse kan du trykke "Se kørslen" og se hele forløbet spille sig selv igennem i dine egne gruppekort. Den begynder fra ingenting: gruppekortene dukker op ét ad gangen, efterhånden som eleverne bliver delt ud, og bagefter kan du se programmet bytte rundt på dem, indtil det ikke kan gøre det bedre. De to elever, der lige har byttet plads, lyser op, og der står hvilken regel programmet var i gang med — fx "under Fordel på Køn". Du bestemmer selv farten (skriv et tal i millisekunder), kan sætte på pause, spole frem og tilbage, starte helt forfra og hoppe til slut. Det bedste ved det: næsten halvdelen af byttene er programmet, der med vilje gør fordelingen DÅRLIGERE et øjeblik for at slippe ud af en blindgyde — de bytter har deres egen farve, så man kan se det ske. Har programmet kørt flere forsøg, kan du vælge mellem dem og se, hvilket der vandt. Det virker både for almindelige grupper og for matrix, og du skal ikke slå noget til på forhånd — hver kørsel bliver optaget af sig selv og tager under to procent længere tid af det. Dine grupper bliver ikke rørt: mens du ser med, kan du ikke komme til at flytte noget, og når du lukker afspilleren, står de præcis, som de gjorde. Optagelsen gemmes ikke — genindlæser du siden, er den væk, og så skal du generere igen for at se den.'
    },
    {
        date: '2026-09-02',
        title: 'Nu står der hvorfor, når "Fordel" ikke kan gå helt op',
        type: 'feature',
        body: 'Har du en "Fordel"-regel på fx køn, og din klasse ikke er delt nogenlunde midt over, kan nogle grupper simpelthen ikke undgå at få et flertal. Det så du på kortene uden at kunne vide, om det var programmet eller din klasse. Nu står regnestykket der, med dine egne tal: "Fordel på Køn kan ikke gå helt op: 21 elever har værdien D, og der er kun plads til 16 (højst 2-3 pr. gruppe). 5 elever kan derfor ikke undgå at sidde i en gruppe, hvor D er i overtal." Beskeden kommer sammen med de andre bemærkninger efter en gruppedannelse, og den kommer kun, når det gælder mere end en enkelt gruppe — ellers ville den stå der næsten hver gang. Tallet er efterprøvet: siger den 5, er der 5 grupper med overtal. Og grupperne er stadig de bedst mulige — der er ikke noget, hverken du eller programmet kan gøre ved, at klassen ser ud, som den gør.'
    },
    {
        date: '2026-09-02',
        title: 'Store hold følger reglerne bedre — programmet skruede selv ned',
        type: 'fix',
        body: 'Bruger du KUN "Fordel", "Adskil" eller "Klyng", arbejder programmet med en anden metode end den, "Balancér" og "Ensartede" bruger. Den metode har et antal forsøg på at få reglerne til at gå op, og programmet skruede selv det tal ned, jo større holdet var — for at spare tid, troede den. Den sparede ikke noget: tiden bliver brugt et helt andet sted. Store hold fik altså færre forsøg uden grund. Målt på et sammenlagt hold på 250 elever gik regel-opfyldelsen fra 96,8 til 98,4 procent, og på 500 elever fra 97,1 til 98,4. Det koster mellem ét og tre sekunder mere på de allerstørste hold og under et halvt sekund på et almindeligt hold.'
    },
    {
        date: '2026-09-02',
        title: 'Gruppedannelsen er blevet omkring en tredjedel hurtigere',
        type: 'feature',
        body: 'Bruger du "Balancér", "Ensartede", "Saml" eller "Opdel", leder programmet efter den bedste fordeling ved at prøve elever af mod hinanden, par for par — og det er dét, ventetiden går med. Den søgning laver nu det samme arbejde med færre opslag undervejs. Målt på et sammenlagt hold på 250 elever: 14 sekunder før, 9 sekunder nu. På 120 elever: 4 sekunder før, 3 nu. Grupperne bliver de SAMME som før — det er ikke en anden fordeling, bare den samme, hurtigere. Det er efterprøvet på 240 forskellige klasser og regelsæt, hvor hver eneste gruppe skulle være elev for elev identisk.'
    },
    {
        date: '2026-09-01',
        title: '7 rettelser: Tabte ændringer, fortryd og kolon i overskrifter',
        type: 'fix',
        body: '– Et kolon i en kolonneoverskrift giver ikke længere nul grupper.\n– Når du bytter emne mellem to grupper, ender begge ikke med det samme.\n– En gendannet backup fortæller, hvis nogle gamle sessioner ikke kom med.\n– Det du lige har tastet, går ikke tabt, når du lukker fanen.\n– Har du Grupper åben i to faner, siger programmet til.\n– "Tilføj elev" regner ikke fraværende med, som om de sad i gruppen.\n– Fortryd (Ctrl+Z) virker i flere situationer, hvor den før svigtede.'
    },
    {
        date: '2026-08-31',
        title: '3 rettelser: Fejlbeskeder og Gendan grupper',
        type: 'fix',
        body: '– Fejlbeskeden om gruppe-motoren peger på den rigtige årsag.\n– Gendan grupper: en indsat tekst, der ikke er en gruppeliste, siger fra.\n– Et emne, der hed "constructor", giver ikke "NaN grupper".'
    },
    {
        date: '2026-08-30',
        title: '4 rettelser: Beskeder og undgåelser',
        type: 'fix',
        body: '– Færre gentagelser i beskederne, og et gruppenavn på dansk.\n– Beskeden om afrundede grupper står ét sted og siger, at du selv bestemmer.\n– Programmet siger til, når en undgåelse er brudt.\n– Undgåelses-listen viser, hvilke undgåelser der stadig gælder.'
    },
    {
        date: '2026-08-28',
        title: '3 rettelser: Reglernes rækkefølge',
        type: 'fix',
        body: '– Vejledningen siger rigtigt om reglernes rækkefølge.\n– Ved to Balancér-regler (eller to Ensartede eller Saml) står der, hvilken der gælder.\n– "Opdel" ligger fast øverst, og der kan kun være én.'
    },
    {
        date: '2026-08-27',
        title: '9 rettelser: Tastatur, skærmlæser og Gendan grupper',
        type: 'fix',
        body: '– Listerne skubber, mens du trækker, også i reglerne.\n– Ctrl+Z fortryder ikke noget bag et åbent vindue.\n– Klasserne står i alfabetisk rækkefølge.\n– Du kan skifte klasse uden mus.\n– Flere knapper og felter har fået et navn til skærmlæsere og stemmestyring.\n– Grupperne tegnes hurtigere op på store hold.\n– Gendan grupper siger fra, når noget ser forkert ud.\n– Et værktøjstip bliver ikke hængende, når et vindue åbner oven på knappen.\n– Gendan fra en kolonne gør ikke kolonnens værdier til klassens emner.'
    },
    {
        date: '2026-08-27',
        title: 'Du bestemmer selv, hvilken rækkefølge kolonnerne står i',
        type: 'feature',
        body: 'Kom regnearket med "Navn" som fjerde kolonne, måtte du hidtil leve med det. Tryk nu "Flyt" i værktøjslinjen over elevlisten, og skub kolonnerne op og ned, til de står som du vil have dem — med musen eller med piletasterne. Rækkefølgen bliver gemt, og den følger med, når du eksporterer til Excel. Fortryd-knappen (Ctrl+Z) tager flytningen tilbage, hvis du fortryder. Dine regler, dine skjulte kolonner og dine rangeringer er upåvirkede: de kender kolonnen på dens navn, ikke på hvor den står.'
    },
    {
        date: '2026-08-27',
        title: 'Du kan hente en gruppeopdeling tilbage — fra en liste eller fra en kolonne',
        type: 'feature',
        body: 'Skal klassen sidde som sidste uge, behøver du ikke sætte grupperne op i hånden. Tryk "Gendan" i værktøjslinjen over grupperne, og hent opdelingen tilbage på to måder: lim den liste ind, du kopierede dengang (den med "Gruppe 1" og navnene under), eller peg på en kolonne du har gemt med "Gem som kolonne" — fx "Vismandsgrupper". Før noget ændrer sig, viser programmet hvad der vil ske: hvor mange grupper der kommer, hvem der bliver markeret fraværende (alle dem der ikke står på listen), og hvem det ikke kunne finde. Er et navn stavet lidt forkert eller mangler et mellemnavn, foreslår programmet den elev det nok er, og du siger ja eller nej. Er eleven slet ikke i klassen, kan du tilføje hende med det samme. Hedder to elever det samme, gætter programmet aldrig — du vælger. Fortryd-knappen (Ctrl+Z) tager elevlisten tilbage, og den gamle opdeling ligger i "Tidligere kørsler".'
    },
    {
        date: '2026-08-25',
        title: 'Du kan nu skjule rettelserne og kun se de nye funktioner',
        type: 'feature',
        body: 'Der er efterhånden mange nyheder her, og langt de fleste er rettelser af småting. Vil du bare se hvad programmet er blevet i stand til — fx efter en ferie — kan du trykke "Kun nye funktioner" øverst, så forsvinder rettelserne fra listen. Programmet husker dit valg til næste gang, og "Alt" henter dem frem igen.'
    },
    {
        date: '2026-08-25',
        title: '15 rettelser: Tal, regler, gemning og kolonner',
        type: 'fix',
        body: '– Karakterkolonner med 00 og 02 får ikke længere programmet til at gå i stå.\n– Celler uden et rigtigt tal ("fritaget", "syg") bliver nævnt.\n– Ét enkelt tal i en tekstkolonne slukker ikke advarslen for hele klassen.\n– "Ranger værdier" foreslår en rigtig rækkefølge på tal.\n– "Klyng" og "Adskil" på samme kolonne advarer om, at de modarbejder hinanden.\n– En regel, der peger på en slettet kolonne, stopper ikke gruppedannelsen.\n– Klasselister fra Google Sheets med "nan" i felterne virker.\n– Henter du en gemt session, siger programmet til, hvis den ikke kunne gemmes.\n– En session, der ikke kunne gemmes, siger det i stedet for at kvittere.\n– To faner sletter ikke hinandens emner.\n– Omdøber du en kolonne, følger alt det med, der peger på den.\n– "Gem som kolonne" advarer, før den skriver oven i en eksisterende kolonne.\n– Et kolonnenavn må ikke begynde med en understreg.\n– Advarsler om modstridende regler forsvinder ikke, når kolonnen er rangeret.\n– En rækkefølge, der ikke passer på dine elever, siger tydeligere fra.'
    },
    {
        date: '2026-08-25',
        title: 'Gemte sessioner i Historik kan ikke længere blive slettet ved et uheld',
        type: 'fix',
        body: 'Alt hvad du laver i Grupper, ligger i din egen browser — der findes ingen kopi nogen andre steder. Blev listen over dine gemte sessioner beskadiget, ryddede programmet ved opstart alle sessionerne for klassen op, fordi det troede de var efterladenskaber. Nu rører det dem ikke, når det ikke kan læse listen. Samtidig fjernes de linjer i Historik, hvis indhold faktisk ER væk — dem der bare svarede "Kunne ikke hente session data!", hver gang du klikkede på dem.'
    },
    {
        date: '2026-08-25',
        title: 'Programmet åbner nu, også når browseren har slået lagring fra',
        type: 'fix',
        body: 'Nogle skolecomputere og browserprofiler er sat op til at blokere alt, hvad hjemmesider gemmer lokalt. På dem kom Grupper slet ikke frem — du fik en helt hvid side uden en forklaring. Nu åbner programmet som det skal. Vær opmærksom på, at klasser og grupper i så fald ikke kan huskes til næste gang, men du kan arbejde og eksportere som normalt.'
    },
    {
        date: '2026-08-24',
        title: 'Du kan nu give en tekstkolonne en rækkefølge',
        type: 'feature',
        body: 'Har du en kolonne med niveauer skrevet som ord — "Lav", "Middel", "Høj" — kunne reglerne "Ensartede" og "Balancér" ikke bruge den: de regner med tal. Nu kan du fortælle programmet rækkefølgen. Tryk "Ranger" i Elevliste, eller brug knappen i selve advarslen, sæt værdierne i den rigtige orden og gem. Så virker de tre regler på kolonnen — og "Saml" bliver klogere af det: den lægger hellere Lav og Middel sammen end Lav og Høj, fordi den nu ved hvad der ligger tæt på hinanden. Du behøver altså ikke længere skrive niveauet om til tal. Elever med en værdi, du ikke har taget med i rækkefølgen, placeres frit, og det får du besked om.'
    },
    {
        date: '2026-08-24',
        title: '8 rettelser: Regler og advarsler',
        type: 'fix',
        body: '– "Ensartede" og "Balancér" siger fra, når kolonnen er tekst.\n– En regel, der ikke virker, spolerer ikke en, der gør.\n– Advarslerne kigger inde i det enkelte emne.\n– Et emne, kun piger har valgt, trækkes ikke ned af manglende drenge.\n– "Saml" får det bedste ud af sine forsøg.\n– Advarslerne regner med det gruppeantal, du faktisk får.\n– Urskiven siger, hvad der ændrer sig, også det du ikke kan se.\n– Låste grupper giver ikke én kæmpegruppe, når klassen har emner.'
    },
    {
        date: '2026-08-23',
        title: 'Backup-filen indeholder nu også dine grupper og gemte sessioner',
        type: 'fix',
        body: 'Grupper gemmer alt i din egen browser — der findes ingen server med en kopi. Backup-filen indeholdt derfor det vigtigste, men ikke det hele: elever, regler og indstillinger kom med, mens de dannede grupper, emnerne på grupperne og alt i Historik-fanen blev ladt tilbage. Gendannede du filen på en ny computer, stod du med en tom Grupper-fane. Nu følger grupperne, emnerne og de gemte sessioner med i filen — og lægger sig tilbage på plads, når du henter den ind igen. Gamle backup-filer virker stadig; de indeholder bare ikke de nye dele.'
    },
    {
        date: '2026-08-23',
        title: 'Excel-filen viser hvem der endte i hvilken gruppe',
        type: 'feature',
        body: 'Eksporterer du en klasse som Excel-fil, får du nu to ekstra kolonner: "Stamgruppe" og "Matrixgruppe" — med emnet i parentes, hvis gruppen har et. Før indeholdt filen kun klasselisten, som den kom ind, så selve gruppedannelsen skulle skrives af i hånden. Kolonnerne kommer kun med, når du faktisk har dannet grupper, og hedder du selv en kolonne det samme, får vores et andet navn, så dine egne tal er i fred.'
    },
    {
        date: '2026-08-23',
        title: 'Datoen står på den udskrevne gruppeoversigt',
        type: 'feature',
        body: 'Klikker du "Oversigt" og printer, står dagens dato nu under klassens navn. To udskrifter fra samme klasse lignede ellers hinanden til forveksling, når de lå i mappen en uge senere.'
    },
    {
        date: '2026-08-21',
        title: 'Matrixen siger til, når stamgrupperne er ændret under den',
        type: 'feature',
        body: 'Matrixgrupper dannes på tværs af stamgrupperne — én elev fra hver. Flyttede du bagefter en elev i stamgrupperne, blev matrixen stående som den var, og var nu skæv: to elever fra samme stamgruppe i én matrixgruppe, og en anden stamgruppe uden nogen. Nu står der en advarsel øverst i Matrix-visningen med knappen "Dan matrixen igen". Vi danner den ikke om af os selv — har du rettet i matrixen i hånden, skal ét flyttet navn ikke rive det ned. Bemærk at en ny matrix kan ændre både sammensætningen OG antallet af matrixgrupper. At låse en stamgruppe tæller ikke som en ændring; det flytter jo ingen.'
    },
    {
        date: '2026-08-20',
        title: '10 rettelser: Genopliv, historik og efternølere',
        type: 'fix',
        body: '– Genopliv siger, at du kan fortryde.\n– En genoplivet session huskes med de regler, den blev lavet med.\n– Historik-fanen siger til, hvis lagerpladsen er fuld.\n– En markeret elev følger ikke med til Matrix eller en anden klasse.\n– Du advares også, når du har rettet et emne.\n– En elev, der kommer for sent, lander i en af de mindste grupper.\n– Indstillingerne står i båndet, når du henter en kørsel med "tag alt med".\n– Forhåndsvisningen lover ikke en matrix, kørslen ikke har.\n– Navnet på en slettet elev bliver stående, med et lille spøgelsesmærke.\n– En genoplivet session kan fortrydes.'
    },
    {
        date: '2026-08-19',
        title: 'Du kan gå tilbage til en tidligere gruppedannelse',
        type: 'feature',
        body: 'Trykkede du Generér igen og fortrød, var den forrige fordeling væk — medmindre du havde husket at gemme den først. Nu ligger de seneste fem gruppedannelser og venter bag urskive-knappen i bunden af skærmen. Peg på et tal, og gruppekortene viser med det samme, hvordan DEN fordeling så ud — der bliver ikke ændret noget, før du klikker. Har du ændret reglerne siden, bliver du spurgt, om de fra dengang også skal med; er der intet ændret, hentes kørslen bare. Den fordeling du forlader, bliver lagt øverst i listen, så du altid kan komme frem igen. Kørslerne findes kun så længe programmet er åbent — skal en gruppedannelse gemmes til i morgen, er det stadig "Gem" og Historik-fanen, du skal bruge.'
    },
    {
        date: '2026-08-19',
        title: '5 rettelser: Fortryd, fraværende og låste grupper',
        type: 'fix',
        body: '– Fortryd i elevlisten husker ikke den forrige klasse.\n– Besked, når en elev tilføjet i Matrix ikke har nogen stamgruppe.\n– Fraværende elever kan ses på gruppekortene.\n– Låste grupper er stadig låst, når du henter en gemt gruppedannelse.\n– En hentet matrixfordeling bliver ikke lavet om bag om ryggen på dig.'
    },
    {
        date: '2026-08-18',
        title: '4 rettelser: Import af regneark',
        type: 'fix',
        body: '– Danske bogstaver overlever en CSV-fil gemt fra Excel.\n– Har regnearket flere faneblade, bliver du spurgt, hvilket der er klassen.\n– En overskrift øverst i regnearket bliver opdaget.\n– En alt for stor fil bliver afvist med det samme.'
    },
    {
        date: '2026-08-16',
        title: 'Du kan stoppe en gruppedannelse undervejs',
        type: 'feature',
        body: 'Har du et stort hold og en af de tunge regler, kan det tage flere minutter at danne grupperne — og indtil nu var der ingen vej ud, hvis du kom til at trykke Generér med en forkert indstilling. Nu står der en "Stop"-knap under snurrehjulet. Trykker du på den, holder programmet op med at regne, og de grupper du havde i forvejen, står helt uændrede.'
    },
    {
        date: '2026-08-16',
        title: '16 rettelser: Opdel, Saml, Esc, udskrift og beskeder',
        type: 'fix',
        body: '– Skifter du klasse midt i en gruppedannelse, lander resultatet ikke i den forkerte klasse.\n– Du får det antal grupper, du beder om, også med "Opdel".\n– "Saml" virker sammen med "Balancér" og "Ensartede".\n– "Opdel" flytter de sidste elever på plads.\n– Vinduer og menuer kan lukkes med Esc.\n– Udskriften henter ikke længere skrifttypen udefra.\n– Advarslerne bruger de samme ord som menuen.\n– Tallene i de gule beskeder passer, når nogen er fraværende.\n– Ingen advarsel om et umuligt gruppearbejde, der er muligt.\n– Udskriften viser elevernes navne igen.\n– Excel-eksporten fortæller, hvis en klasse ikke kom med.\n– Beskeder dækker ikke knapperne øverst til højre.\n– Dine klasser kan ikke forsvinde uden varsel.\n– Gamle sessioner fylder ikke længere i det skjulte.\n– Elever uden svar bliver ikke spredt ud i hver sin gruppe.\n– Du får besked, hvis en regel peger på en tom kolonne.'
    },
    {
        date: '2026-08-16',
        title: 'Programmet fryser ikke længere, mens grupperne dannes',
        type: 'feature',
        body: 'Tidligere stod hele skærmen stille, mens grupperne blev regnet ud — knapperne reagerede ikke, og ved et stort hold kunne det vare flere minutter, hvor det lignede at programmet var gået ned. Nu foregår udregningen ved siden af, så du kan bladre videre i elevlisten eller skifte fane imens. Grupperne bliver præcis de samme.'
    },
    {
        date: '2026-08-16',
        title: 'Flyt elever uden at trække — også på tavlen og iPad\'en',
        type: 'feature',
        body: 'Indtil nu kunne du kun flytte en elev fra én gruppe til en anden ved at trække hende med musen — og det virker slet ikke på en tavle-pc, en iPad eller med tastaturet. Nu kan du klikke (eller trykke) på eleven: hun bliver markeret, og hvert af de andre gruppekort får en knap der hedder "Flyt Anna hertil". Tryk på den, og hun er flyttet. Fortryd med Esc eller ved at klikke på hende igen. Træk-og-slip virker præcis som før — det er en ekstra vej, ikke en erstatning.'
    },
    {
        date: '2026-08-16',
        title: 'Store hold dannes hurtigere — og du får besked, når det tager tid',
        type: 'feature',
        body: 'Bruger du "Balancér", "Ensartede", "Saml" eller "Opdel", regner programmet nu opgaven igennem cirka dobbelt så hurtigt som før. Grupperne bliver præcis de samme — det er kun ventetiden der er kortere. Har du samlet flere klasser til ét stort hold, får du desuden en besked inden gruppedannelsen går i gang, så du ved at det tager et stykke tid uden at der er noget galt.'
    },
    {
        date: '2026-08-16',
        title: 'Du får besked, før browserens lagerplads løber tør',
        type: 'feature',
        body: 'Alt om dine klasser ligger i browseren — der er ingen kopi andre steder. Før hørte du først om fuld lagerplads i det øjeblik, noget ikke kunne gemmes, og så var netop den ændring tabt. Nu kommer beskeden allerede, når der er en femtedel tilbage, sammen med hvad du kan gøre: gem en backup under Filer & Backup, og slet så en gammel klasse eller ryd historikken.'
    },
    {
        date: '2026-08-14',
        title: 'Du kan nu ændre rækkefølgen på dine regler',
        type: 'feature',
        body: 'Rækkefølgen har hele tiden haft betydning, men der var ingen måde at ændre den på. Nu har hver regel et greb, du kan trække i — og pile op og ned på grebet, så det også virker på tavle og telefon. Under listen står der, om rækkefølgen betyder noget for netop dine regler: bruger du kun Fordel, Adskil og Klyng, vinder den øverste ved konflikt.'
    },
    {
        date: '2026-08-14',
        title: '2 rettelser: Menu på telefon og fraværende fra i går',
        type: 'fix',
        body: '– Regler- og Emner-menuen bliver inde på skærmen på telefon.\n– Fraværende fra i går bliver ikke behandlet som en gruppe.'
    },
    {
        date: '2026-08-11',
        title: 'Du skal ikke længere vælge en ID-kolonne — kun hvad der skal vises',
        type: 'feature',
        body: 'Før skulle du udpege en kolonne som elevernes "ID", og den skulle helst være udfyldt og forskellig for alle. Nu giver programmet selv hver elev et usynligt nummer, og du vælger i stedet bare, hvad der skal stå på gruppekortene — typisk "Navn". Menuen hedder derfor "Vis:" i stedet for "ID:". Du kan skifte visning når som helst, uden at grupperne laves om.'
    },
    {
        date: '2026-08-11',
        title: '3 rettelser: Samme navn og import fra Excel',
        type: 'fix',
        body: '– To elever må gerne hedde det samme.\n– Tomme kolonner fra Excel kommer ikke med ind.\n– Du får besked med det samme, hvis en elev mangler navn.'
    },
    {
        date: '2026-07-19',
        title: 'Dine klasser forsvinder ikke længere på langsomt internet',
        type: 'fix',
        body: 'Åbnede du Grupper på en langsom forbindelse (fx trægt skole-wifi), kunne klasselisten ende helt tom — programmet opgav at hente den, selvom dine klasser lå der hele tiden. Nu vises dine klasser med det samme, uanset internethastighed, og kun selve gruppedannelsen venter på at programmet er helt klar. Går hentningen alligevel galt, får du en tydelig besked — og programmet prøver selv at hente motoren igen, næste gang du klikker "Generér grupper". Du behøver altså ikke genindlæse siden.'
    },
    {
        date: '2026-07-10',
        title: '3 rettelser: Saml, låste grupper og hjælp-tips',
        type: 'fix',
        body: '– "Saml (Blød klynge)" virker også på tekst-kolonner.\n– Låste grupper er beskyttet mod papirkurven.\n– Hjælp-tips regner rigtigt i Matrix-visningen.'
    },
    {
        date: '2026-07-09',
        title: '2 rettelser: Navne-kolonnen',
        type: 'fix',
        body: '– En tom celle i navne-kolonnen vælter ikke gruppedannelsen.\n– Gendannelse fra Historik bruger den rigtige navne-kolonne.'
    },
    {
        date: '2026-06-29',
        title: '6 rettelser: Menuer, beskeder og sessioner',
        type: 'fix',
        body: '– Oprydning i Regler- og Emner-menuerne.\n– Vigtige fejlbeskeder forsvinder ikke bag mindre beskeder.\n– Færre tomme gruppekort, når mange elever er fraværende.\n– Tydeligere besked, hvis matrix-grupper ikke kan dannes.\n– Klar besked, hvis en session ikke kunne gemmes.\n– "Lås alle"-knappen viser rigtigt, om grupperne er låst.'
    },
    {
        date: '2026-06-29',
        title: 'Reglerne forklarer nu sig selv i menuen',
        type: 'feature',
        body: 'Når du sætter regler op, står der nu en kort forklaring under hver regel om hvad den gør (fx "Spreder en egenskab jævnt ud — fx lige mange drenge og piger i hver gruppe"). Og "Hvad er regler?"-hjælpen øverst viser nu alle regeltyper med forklaring. Så er det nemmere at vælge den rigtige regel, også hvis du er ny i programmet.'
    },
    {
        date: '2026-06-29',
        title: 'Ny regel: "Adskil" — hold bestemte elever fra hinanden',
        type: 'feature',
        body: 'Du kan nu vælge "Adskil" i Regler-menuen, ved siden af Fordel og Balancér. Vælg en kolonne og en værdi (fx Niveau = C), så spredes de elever ud, så højst én af dem er i hver gruppe — praktisk hvis du fx ikke vil have alle med samme niveau samlet. Du kan stadig også bruge "Undgå hinanden" til at adskille helt bestemte navngivne elever.'
    },
    {
        date: '2026-06-29',
        title: 'Advarsel hvis dine karakterer bliver delt forkert op ved import',
        type: 'feature',
        body: 'Hvis du indsætter en liste hvor komma både adskiller kolonnerne og bruges i karakterer (fx "7,5"), kunne karaktererne før blive delt op i to celler — uden besked. Nu får du en advarsel med et tip om at gemme filen med semikolon som skilletegn, så decimaltallene bevares.'
    },
    {
        date: '2026-06-29',
        title: 'Færre, mere samlede beskeder når du danner grupper',
        type: 'feature',
        body: 'Når du dannede grupper, kunne du blive mødt af en hel stak små beskeder på én gang — det var nemt at miste overblikket. Nu samles de mindre vigtige bemærkninger til én besked med tydelige overskrifter, mens en virkelig alvorlig advarsel (en regel der ikke kan opfyldes) stadig står for sig selv, så du ikke overser den.'
    },
    {
        date: '2026-06-28',
        title: '5 rettelser: Kategorier, navne-kolonne og import',
        type: 'fix',
        body: '– Store og små bogstaver og mellemrum i en kategori tæller som det samme.\n– Færre fejl med kolonnen, der indeholder elevernes navne.\n– Bedre import af filer fra dansk Excel.\n– "Ryd alle emner" kræver to klik.\n– Tydelig besked, hvis der ikke er nogen elever at fordele.'
    },
    {
        date: '2026-06-28',
        title: 'Du får besked hvis to elever hedder præcis det samme',
        type: 'feature',
        body: 'Hvis to elever har det samme navn, kan programmet komme til at forveksle dem når der dannes grupper. Nu får du en venlig besked — både når du henter en klasse ind, og når du danner grupper — så du kan give dem hvert sit navn (fx tilføje et efternavn eller et tal).'
    },
    {
        date: '2026-06-28',
        title: 'Excel-eksport viser nu hvem der var til stede',
        type: 'feature',
        body: 'Når du eksporterer en klasse til Excel, får du nu en "Til stede"-kolonne (Ja/Nej), og programmets egne hjælpe-kolonner kommer ikke længere med i filen. Praktisk hvis du vil bruge listen videre i et regneark.'
    },
    {
        date: '2026-06-10',
        title: 'Matrix viser på forhånd hvor mange grupper du får',
        type: 'feature',
        body: 'Når du bruger "Fuld"-tilstanden i matrix, viser en lille grøn boks nu hvor mange matrixgrupper der bliver dannet, og cirka hvor mange elever der er i hver — beregnet ud fra dine stamgrupper og kun de elever der er til stede. Så ved du hvad du får, inden du trykker Generér.'
    },
    {
        date: '2026-06-10',
        title: '5 rettelser: Escape, fraværende og matrix',
        type: 'fix',
        body: '– Escape lukker alle vinduer.\n– Fraværende elever ender ikke i to grupper.\n– Emnet vejer tungest, når en elev tilføjes, og du advares ved undgåelser.\n– Matrix tæller ikke fraværende elever med.\n– Tallene i de blå tips passer med det, der genereres.'
    },
    {
        date: '2026-05-08',
        title: 'Generering går hurtigere på store klasser',
        type: 'feature',
        body: 'Programmet justerer nu selv hvor grundigt det optimerer baseret på klassens størrelse. Små klasser (under 30 elever) får lige så grundig en optimering som før. Store klasser (over 60 elever) optimeres mere effektivt — du undgår at skærmen står og fryser i 30-60 sekunder. Praktisk hvis du arbejder med flere store klasser eller årgange.'
    },
    {
        date: '2026-05-08',
        title: '2 rettelser: Spinner og regelværdier',
        type: 'fix',
        body: '– Spinneren hænger ikke fast, når noget fejler.\n– Komma-separerede regelværdier virker også med mellemrum.'
    },
    {
        date: '2026-05-08',
        title: 'Forskellige slags advarsler er nemmere at skelne',
        type: 'feature',
        body: 'Beskederne om umulige eller modstridende regler havde samme udseende som almindelige hjælp-tip — det var svært at se hvad der var alvorligt. Nu samles de under tydelige overskrifter ("Reglerne kan ikke opfyldes", "Modstridende regler" og så videre), og de alvorlige vises som en rød besked, mens noter og almindelige tip vises i en blå boks. Så er det nemmere at se hvad du skal kigge på først.'
    },
    {
        date: '2026-05-07',
        title: '5 rettelser: Import og backup',
        type: 'fix',
        body: '– Backup-import spørger, inden den overskriver dine klasser.\n– Du kan vælge, om din importfil har overskrifter.\n– Bedre fejlmeddelelser ved import.\n– Hjælp-tippet om antal grupper viser det rigtige tal.\n– Emner med store og små bogstaver behandles ens.'
    },
    {
        date: '2026-05-07',
        title: 'Du kan nu trække filer direkte til import-feltet',
        type: 'feature',
        body: 'Den store boks under "Upload fil / Backup" har altid sagt "Klik eller træk filer her" — men træk virkede faktisk ikke før, kun klik. Nu kan du trække en Excel- eller CSV-fil direkte fra dit skrivebord ind i boksen. Boksen lyser blåt op imens du trækker, så du kan se den er klar til at modtage filen.'
    },
    {
        date: '2026-05-07',
        title: 'Advarsel når du har flere emner end elever',
        type: 'feature',
        body: 'Hvis du har flere klasse-emner end elever til rådighed (fx 5 emner men kun 4 elever), får du nu en besked når du genererer. Programmet kan ikke fordele alle emner ud, og mindst ét emne får ingen gruppe — beskeden foreslår at du fjerner et emne eller tilføjer flere elever.'
    },
    {
        date: '2026-05-05',
        title: 'Gem matrix-grupper i din klasseliste',
        type: 'feature',
        body: 'Du kunne tidligere kun gemme stam-grupper som en ny kolonne i klasselisten. Nu kan du også gøre det med matrix-grupper: skift til Matrix-visningen, klik "Kolonne" nede i bunden af skærmen, og giv kolonnen et navn — så får hver elev sin matrix-gruppe ført ind ved siden af sit navn. Praktisk når du vil printe en oversigt eller eksportere til Excel.'
    },
    {
        date: '2026-05-05',
        title: 'Byt emner mellem grupper med et træk',
        type: 'feature',
        body: 'Har algoritmen fordelt emnerne anderledes end du ønskede? Du kan nu bytte to gruppers emner ved at trække det ene over på det andet. Tag fat i håndtaget (de små prikker ved siden af emnet) og træk det over på en anden gruppe — så bytter de plads. Klik stadig på selve emnet for at vælge fra listen som før.'
    },
    {
        date: '2026-05-05',
        title: 'Ryd alle emner på én gang',
        type: 'feature',
        body: 'Hvis du har en lang liste af klasse-emner og vil starte forfra, kan du nu rydde dem alle med én knap — i stedet for at skulle slette dem ét ad gangen. Knappen "Ryd alle emner" findes inde i "Emner"-menuen. Emnerne forsvinder også fra dine grupper med det samme.'
    },
    {
        date: '2026-05-05',
        title: 'Emner forsvinder når du fjerner dem',
        type: 'fix',
        body: 'Tidligere kunne et gammelt emne blive liggende på et gruppekort, selv efter at du havde slettet det fra klasse-emnerne — det forsvandt først når du genererede grupperne igen. Nu opdateres gruppekortene med det samme.'
    },
    {
        date: '2026-04-30',
        title: 'Indsæt klasseliste direkte fra Lectio',
        type: 'feature',
        body: 'Du kan nu kopiere en klasseliste i Lectio og indsætte den direkte i import-feltet. Klassekoderne (fx "3se3 01 (3se3)") fjernes automatisk, så kun navnene importeres. Programmet opdager selv, at det er Lectio-format, og giver dig besked.'
    },
    {
        date: '2026-04-30',
        title: 'Hurtigere i gang efter import',
        type: 'feature',
        body: 'Når du opretter eller importerer en ny klasse, springer programmet nu direkte til Elevliste-fanen for den klasse — i stedet for at lade dig stå tilbage i import-skærmen. Forsiden er også blevet ryddet op, så det er tydeligere hvordan du kommer i gang første gang.'
    },
    {
        date: '2026-04-30',
        title: 'Tomme grupper bliver liggende',
        type: 'feature',
        body: 'Hvis du flytter alle elever ud af en gruppe, forsvinder kortet ikke længere automatisk. Det bliver liggende med en "Slet gruppe?"-knap, så du selv bestemmer hvornår det forsvinder. Du kan også oprette nye tomme grupper med "+ Gruppe" og trække elever derind.'
    },
    {
        date: '2026-04-30',
        title: 'Klik på et emne for at vælge et andet',
        type: 'feature',
        body: 'Når du har defineret klasse-emner, kan du nu klikke direkte på en gruppes emne-badge og vælge et andet emne fra en lille liste. Praktisk hvis du vil overskrive den automatiske fordeling for en enkelt gruppe — uden at skulle generere alt forfra.'
    },
    {
        date: '2026-04-29',
        title: 'Få elever der mangler en gruppe på plads',
        type: 'feature',
        body: 'Hvis der er elever der ikke er i nogen gruppe — fordi de kommer ind senere, eller fordi en regel forhindrede dem i at blive placeret — åbner programmet nu et lille vindue, hvor du kan trække dem direkte ind i den gruppe, du vælger.'
    },
    {
        date: '2026-04-28',
        title: 'Tydeligere advarsler ved gruppedannelse',
        type: 'feature',
        body: 'Når dine valg kan give problemer (fx hvis matrix-fordelingen bliver skæv fordi ét emne har for få elever), får du nu en tydelig advarsel ved siden af "Generér"-knappen. Hver advarsel kan lukkes individuelt, så du kun ser dem du har brug for.'
    },
    {
        date: '2026-04-28',
        title: '3 rettelser: Beskeder, gruppeantal og advarsler',
        type: 'fix',
        body: '– Notifikationer kan læses i ro og mag.\n– Dit valgte gruppeantal respekteres.\n– Advarsler, du før kunne overse, er nu synlige.'
    },
    {
        date: '2026-04-27',
        title: 'Definér emner én gang for hele klassen',
        type: 'feature',
        body: 'Hvis du laver matrix-grupper, kan du nu definere en liste af emner for klassen (fx Liberalisme, Konservatisme, Socialisme). Programmet fordeler dem så retfærdigt på grupperne ved hver generering — og justerer antallet af grupper til et tal der passer med antallet af emner, så matrix-fordelingen bliver så lige som muligt, også selvom der er fraværende elever.'
    },
    {
        date: '2026-04-27',
        title: 'Hjælpsomme tip lige ved Generér-knappen',
        type: 'feature',
        body: 'Programmets små hjælpe-tip om regelkonflikter og skæv emne-fordeling vises nu lige ved siden af "Generér"-knappen, i stedet for som separate beskeder. Det gør det nemmere at se sammenhængen mellem dine valg og det resultat du får.'
    },
    {
        date: '2026-04-27',
        title: '2 rettelser: Matrix og backup',
        type: 'fix',
        body: '– Matrix-fordeling holder også med låste grupper.\n– Backups beholder klasse-emnerne.'
    },
    {
        date: '2026-04-25',
        title: 'Advarsel når regler modarbejder hinanden',
        type: 'feature',
        body: 'Hvis du opretter regler der trækker i hver sin retning — f.eks. både "fordel jævnt på køn" og "saml alle drenge i én gruppe" — får du nu en advarsel inden grupperne dannes, så du kan rette det inden det går galt. Programmet kender selv mønstrene fra tidligere fejl.'
    }
];
