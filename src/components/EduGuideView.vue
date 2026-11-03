
<script setup>
import PageLayout from './PageLayout.vue';
import { BookOpen, Library, Tag, Wrench, Lock, Hand, BarChart3, Ban, AlertTriangle,
         Lightbulb, ArrowDownWideNarrow, Undo2, UserPlus, ShieldX, Save,
         FileText, Clipboard, Link2, Share2 } from 'lucide-vue-next';
import { UI_NAMES } from '../js/modules/beta.js';
import RuleMark from './beta/RuleMark.vue';
</script>

<template>
  <PageLayout id="view-edu-guide" class="content-view">
    <div class="card">
        <h2 class="view-title"><BookOpen :size="22" class="title-icon" />Pædagogisk vejledning</h2>
        <p class="view-subtitle">
            Denne guide hjælper dig med at oversætte dine pædagogiske mål til indstillinger i systemet.
        </p>

        <h2 class="section-heading">Hvordan virker det?</h2>
        <div class="info-box info-box--blue">
            <h3 class="info-box__title">Nøgleforståelse: reglerne arbejder SAMMEN</h3>
            Programmet prøver at opfylde alle dine regler på én gang — de konkurrerer ikke om
            pladsen. Du kan altså roligt sætte <em>Balancér (Karakter)</em> og
            <em>Fordel (Køn)</em> på samtidig; målt giver det både en jævn karakterfordeling
            <strong>og</strong> lige mange drenge og piger i hver gruppe.<br>

            <strong class="info-box__label info-box__label--blue">Kan to regler ikke opfyldes samtidig, bestemmer TYPEN</strong>
            <p class="muted-text muted-text--tight">
                Først dér, hvor der skal vælges, træder en fast rangorden i kraft. Den er den
                samme, uanset hvilke regler du har valgt:
            </p>
            <p class="muted-text muted-text--tight">
                <strong>"Skal sammen" er en særskilt aftale — ikke en almindelig regel.</strong>
                Den holder bestemte elever samlet i stamgrupper, før de øvrige regler finjusterer
                fordelingen. Aftalen gælder ikke automatisk i Matrix.
            </p>
            <!-- Samme trin som i gruppeopskriften (RecipeRules.vue / RULE_TIERS i recipe.js).
                 Undgå hinanden er en aftale, ikke en regel i opskriften, men motoren
                 vejer den lige efter Adskil altid (levelPlan i motor/engine/rules.js). -->
            <ol class="info-box__list">
                <li><strong>Deles op først</strong> — <strong>Opdel</strong> deler klassen i adskilte puljer</li>
                <li><strong>Brydes kun, hvis intet andet er muligt</strong> — <strong>Adskil altid</strong></li>
                <li><strong>Lige efter</strong> — aftalerne om, at bestemte elever skal <strong>undgå hinanden</strong>. De står ikke i opskriften, men vejer tungere end Klyng og Adskil</li>
                <li><strong>Vejer tungt</strong> — <strong>Klyng</strong> (ingen sidder alene) og <strong>Adskil</strong> (fx personkonflikter)</li>
                <li><strong>Mål</strong> — <strong>Fordel</strong> (spreder en egenskab jævnt ud), <strong>Balancér</strong> (jævner gennemsnittet ud) og <strong>Ensartede</strong> (samler dem, der ligner hinanden)</li>
                <li><strong>Hvis det kan lade sig gøre</strong> — <strong>Saml</strong> (sorterer grupperne indbyrdes)</li>
            </ol>
            <p class="muted-text muted-text--tight">
                <em>Bemærk at <strong>Saml</strong> ligger nederst, ikke øverst: den arbejder på
                grupperne som helhed, når alt det andet er faldet på plads.</em>
            </p>

            <strong class="info-box__label info-box__label--blue">Typen bestemmer trinnet — inden for trinnet bestemmer du</strong>
            <p class="muted-text muted-text--tight">
                Gruppeopskriften viser reglerne i de trin, de vejer i. Inden for et trin er
                rækkefølgen en prioritering, og <strong>den øverste vejer mest</strong>: to regler
                i "Vejer tungt", der ikke kan holdes samtidig, afgøres altid til fordel for den
                øverste, og målene trækker alle, men den øverste mest, den næste lidt mindre, og så
                videre. Har du fx to <em>Fordel</em>-regler — på køn og på niveau — så træk den
                vigtigste op med pilene eller med musen. En regel kan ikke flyttes til et andet
                trin: står der en <em>Klyng</em> under en <em>Fordel</em> i din liste, vejer Klyng
                alligevel tungest.
            </p>

            <strong class="info-box__label info-box__label--blue">"Opdel" laver rum — og reglerne gælder INDE i rummet</strong>
            <p class="muted-text muted-text--tight">
                Bruger du <strong>Opdel</strong>, deles klassen først i adskilte puljer (ét pr.
                værdi), og grupperne dannes derefter inde i hver pulje for sig. Uden Opdel er der
                ét rum: hele klassen.
            </p>
            <p class="muted-text muted-text--tight">
                <strong>Opdel bryder ikke dine andre regler — den begrænser dem.</strong> De
                bliver stadig opfyldt, bare inde i hver pulje. To elever der skal undgå hinanden,
                men ligger i hver sin pulje, kan aldrig mødes; den regel er opfyldt på forhånd.
                Skal tre elever i den SAMME pulje adskilles, kræver det, at netop den pulje får
                mindst tre grupper. Advarslerne regner derfor pr. pulje og siger hvilken det
                gælder (<em>"3 elever skal adskilles inden for 'Klima'"</em>).
            </p>
            <p class="muted-text muted-text--tight">
                <strong>Undtagelsen er, når to regler rører den SAMME kolonne.</strong> Sætter du
                <em>Opdel (Køn)</em> og <em>Fordel (Køn)</em> på samtidig, beder du om at samle og
                sprede det samme. Opdel vinder totalt — du får rene drenge- og pigegrupper, og
                Fordel gør ingenting. Det siger programmet til om, men det retter det ikke for dig.
                Er de to regler derimod på hver sin kolonne — <em>Opdel (Hold)</em> og
                <em>Fordel (Køn)</em> — bliver de begge opfyldt: hvert hold for sig, med drenge og
                piger blandet inden i.
            </p>
            <p class="muted-text muted-text--tight">
                <strong>Der kan kun være ÉN Opdel, og den ligger altid øverst i listen.</strong>
                Det er ikke en begrænsning, programmet har fundet på — det er sådan, opdelingen
                virker: klassen deles i puljer én gang, og alt andet sker inde i puljerne. Derfor
                kan Opdel ikke trækkes ned under en anden regel, og har du allerede en, er
                muligheden slået fra i menuen. Skal der deles op efter <em>to</em> ting på én gang,
                så lav en kolonne der kombinerer dem — fx <em>"A-drenge", "A-piger", "B-drenge"
                …</em> — og opdel efter den.
            </p>

            <!-- Indtil 3/11 2026 stod her "Der sorteres kun efter ÉN kolonne": den gamle
                 motor byggede grupperne efter én af Balancér/Ensartede/Saml. Den nye
                 motor regner dem alle med, i trinene ovenfor. -->
            <strong class="info-box__label info-box__label--blue">Flere talregler på én gang</strong>
            <p class="muted-text muted-text--tight">
                Du kan godt have flere af <strong>Balancér</strong>, <strong>Ensartede</strong> og
                <strong>Saml</strong> på én gang — fx balancere både karakter og fravær. Balancér og
                Ensartede er mål og regnes med sammen med Fordel, den øverste mest; Saml kommer
                altid sidst. Kan de ikke alle gå op, giver den nederste efter først — så træk den
                vigtigste op. En talregel på en <em>tekst</em>kolonne kan ikke regne: giv kolonnen
                en rækkefølge først (se afsnittet om rangering nedenfor).
                <br><br>
                To ting er værd at vide. <strong>Balancér og Ensartede på den SAMME kolonne</strong>
                arbejder mod hinanden — den ene blander værdierne, den anden samler dem — og det
                siger programmet til om. Og <strong>Ensartede på en rangeret tekstkolonne</strong>
                (Lav &lt; Middel &lt; Høj) vejer let ved siden af fx karakterer, fordi den kun
                regner i trinene 1, 2, 3. Vil du samle ens niveauer, gør <strong>Saml</strong>
                det tydeligere.
            </p>

            <strong class="info-box__label info-box__label--blue">Matrixen står uden for begge</strong>
            <p class="muted-text muted-text--tight">
                Når du danner matrixgrupper (Runde 2), får hver elev et usynligt mærke efter den
                stamgruppe, eleven kom fra, og systemet spreder de mærker ud. Det arbejde går forud
                for dine egne regler — det er hele pointen med en matrix.
            </p>
            <p class="muted-text muted-text--tight">
                En "Skal sammen"-aftale kan derfor godt være opfyldt i stamgruppen og derefter
                blive brudt i Matrix. Det er forventet: Matrixens formål er netop at blande elever
                fra stamgrupperne på ny.
            </p>
        </div>

        <h3 class="section-heading-lg">
            <Wrench :size="22" />Før du trykker {{ UI_NAMES.generate }}
        </h3>

        <div class="info-panel">
            <div class="two-col-grid">
                <div>
                    <strong class="step-label step-label--teal">"Vis:" — hvad der står på kortene</strong>
                    <p class="muted-text">
                        Vælgeren yderst til venstre over elevlisten bestemmer, hvilken kolonne
                        elevernes navne læses fra. Den behøver hverken være unik eller udfyldt —
                        programmet holder selv styr på, hvem der er hvem, uanset hvad du vælger.
                        Har to elever samme navn, bliver de altså ikke blandet sammen. Vælger du
                        en anden kolonne, skifter teksten på gruppekortene, på udskriften og i
                        det du kopierer.
                    </p>
                </div>
                <div>
                    <strong class="step-label step-label--purple">Elever pr. gruppe eller Antal grupper</strong>
                    <p class="muted-text">
                        Klik på tallet i opskriftens første linje for at vælge.
                        <strong>Elever pr. gruppe</strong> = "cirka 4 i hver" — antallet af grupper regnes ud.
                        <strong>Antal grupper</strong> = "præcis 6 grupper" — størrelsen regnes ud.
                        Har du emner på, rundes antallet, så hvert emne får lige mange grupper,
                        men kun når størrelsen stadig holder. Der er altid mindst én gruppe pr. emne.
                    </p>
                </div>
            </div>
        </div>

        <h3 class="section-heading-lg">
            <Library :size="22" />Pædagogiske opskrifter
        </h3>

        <!-- Opskrifterne -->
        <div class="recipes-grid">

            <!-- OPSKRIFT 1 -->
            <div class="recipe-card">
                <div class="recipe-card__header">
                    <h4 class="recipe-card__title">1. Niveau-matrixen (spredt &#x2192; samlet)</h4>
                    <p class="recipe-card__desc">Den avancerede model: Trygge, blandede stamgrupper - men knivskarpe, niveaudelte arbejdsgrupper.</p>
                </div>
                <div class="recipe-card__body">
                    <div class="recipe-steps">
                        <div>
                            <strong class="step-label step-label--teal">Trin 1: Stamgrupper</strong>
                            <ul class="step-list">
                                <li>Brug regel: <strong>Balancér ... (Karakter)</strong></li>
                                <li class="muted-text">Står der <em>ord</em> i kolonnen (Lav/Middel/Høj) i stedet for tal, så giv den en rækkefølge først — se afsnittet nedenfor.</li>
                            </ul>
                        </div>
                        <div>
                            <strong class="step-label step-label--purple">Trin 2: {{ UI_NAMES.matrix }}</strong>
                            <ul class="step-list">
                                <li><strong>Fjern</strong> reglen "Balancér" med krydset ud for den.</li>
                                <li>Tilføj ny regel: <strong>Ensartede ... (Karakter)</strong></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <!-- OPSKRIFT 2 -->
            <div class="recipe-card">
                <div class="recipe-card__header">
                    <h4 class="recipe-card__title">2. Ekspert-modellen (klassisk Jigsaw)</h4>
                    <p class="recipe-card__desc">Klassikeren: Bliv klog i stamgruppen, undervis de andre i matrix.</p>
                </div>
                <div class="recipe-card__body">
                    <ul class="step-list">
                        <li><strong>Stamgrupper:</strong> Skriv emnerne i linjen <strong>"Grupperne får …"</strong> i gruppeopskriften — så fordeles de automatisk til grupperne, når du trykker <strong>"{{ UI_NAMES.generate }}"</strong>.</li>
                        <li><strong>Matrixgrupper:</strong> Tryk <strong>"{{ UI_NAMES.matrix }}"</strong>. Systemet splitter eksperterne ad, så hver matrixgruppe får én fra hvert emne.</li>
                    </ul>
                    <p class="muted-text" style="font-size: 0.82em; margin-top: 10px; opacity: 0.8;">
                        <em>Har dine elever selv valgt et emne? Lav en kolonne med deres ønsker (fx "Emneønske") i Elevliste, og brug reglen <strong>Ensartede... (Emneønske)</strong> i stedet.</em>
                    </p>
                </div>
            </div>

             <!-- OPSKRIFT 3 -->
             <div class="recipe-card">
                <div class="recipe-card__header">
                    <h4 class="recipe-card__title">3. Trygheds-modellen (Ingen alene)</h4>
                    <p class="recipe-card__desc">Fokus på trivsel: Ingen må sidde som "eneste pige" eller "eneste fra 1.g".</p>
                </div>
                <div class="recipe-card__body">
                     <ul class="step-list">
                         <li>Brug <strong>Klyng ... (Køn)</strong>. Garanterer mindst 2 af samme slags.</li>
                     </ul>
                </div>
            </div>

            <!-- OPSKRIFT 4 -->
            <div class="recipe-card">
                <div class="recipe-card__header">
                    <h4 class="recipe-card__title">4. Den fredelige klasse (to der ikke skal sidde sammen)</h4>
                    <p class="recipe-card__desc">Når det ikke er en egenskab, men to bestemte elever, der er problemet.</p>
                </div>
                <div class="recipe-card__body">
                    <ul class="step-list">
                        <li>Markér de to (eller flere) elever i <strong>Elevliste</strong>, tryk <strong>"Lav aftale"</strong> og vælg <strong>"Undgå hinanden"</strong>.</li>
                        <li>Det er ikke en regel på en kolonne — det er en aftale om lige præcis de elever, og den bliver stående, til du fjerner den under <strong>Aftaler → Undgå hinanden</strong>.</li>
                        <li>Ender de alligevel sammen, står de <strong>med rødt på gruppekortet</strong>, og der kommer en besked over grupperne med navnene. Det sker, hvis du selv har flyttet den ene, hvis gruppen er <strong>låst</strong> (så springer gruppedannelsen undgåelsen over — der er ingen at flytte), eller hvis du har hentet en gemt session frem fra dengang undgåelsen ikke fandtes. Flyt den ene, så forsvinder markeringen.</li>
                        <li>Bruger du <strong>Opdel</strong>, dannes grupperne inde i hvert emne for sig. Har de to valgt <em>samme</em> emne, og er der kun én gruppe dér, kan de ikke skilles ad — det siger programmet før kørslen, men det kan ikke løses uden at give dem hvert sit emne eller flere grupper.</li>
                    </ul>
                    <p class="muted-text" style="font-size: 0.82em; margin-top: 10px; opacity: 0.8;">
                        <em>Brug reglen <strong>Adskil</strong> i stedet, når det er en hel kategori der skal spredes — fx "aldrig to fra samme folkeskole".</em>
                    </p>
                </div>
            </div>

            <div class="recipe-card">
                <div class="recipe-card__header">
                    <h4 class="recipe-card__title">Elever der skal følges ad</h4>
                    <p class="recipe-card__desc">Et fast makkerpar eller en lille samling elever, mens resten af gruppen kan skifte.</p>
                </div>
                <div class="recipe-card__body">
                    <ul class="step-list">
                        <li>Markér mindst to elever i <strong>Elevliste</strong>, tryk <strong>"Lav aftale"</strong> og vælg <strong>"Skal sammen"</strong>.</li>
                        <li>Dan stamgrupper. Eleverne holdes samlet, uden at du behøver låse hele deres gruppe.</li>
                        <li>Aftalen bliver gemt, til du fjerner den under <strong>Aftaler → Skal sammen</strong>. Den følger med i backup.</li>
                        <li>Overlap gælder samlet: Anna + Bo og Bo + Sara betyder alle tre sammen. Er Bo fraværende, følges Anna og Sara stadig ad.</li>
                        <li>Kan aftalerne ikke passe med størrelserne, en undgåelse, Opdel eller låste grupper, får du en forklaring. De eksisterende grupper bliver stående.</li>
                        <li>Flytter du selv en elev eller henter gamle grupper frem, kan aftalen blive brudt. Det vises over stamgrupperne. Saml eleverne, dan grupper igen, eller fjern aftalen.</li>
                        <li>Aftalen gælder <strong>stamgrupper</strong>. Matrixgrupper følger deres egne regler og kan skille makkerne ad.</li>
                    </ul>
                </div>
            </div>

            <!-- OPSKRIFT 5 -->
            <div class="recipe-card">
                <div class="recipe-card__header">
                    <h4 class="recipe-card__title">5. Nye makkere hver gang</h4>
                    <p class="recipe-card__desc">Over et forløb: ingen skal arbejde med den samme to gange.</p>
                </div>
                <div class="recipe-card__body">
                    <ul class="step-list">
                        <li><strong>Efter hver gang:</strong> tryk <strong>"Gem"</strong> → <strong>"Gem som kolonne i elevlisten"</strong> og gem dagens opdeling, fx <em>Uge 34</em>.</li>
                        <li><strong>Næste gang:</strong> læg reglen <strong>Fordel ... (Uge 34)</strong> på. Den spreder hver gammel gruppe ud over de nye, så makkerne bliver skiftet ud.</li>
                        <li>Har du flere uger, kan du lægge en regel på hver — men husk at de så konkurrerer indbyrdes, og de nederste ofres først.</li>
                    </ul>
                    <p class="muted-text" style="font-size: 0.82em; margin-top: 10px; opacity: 0.8;">
                        <em>Elever der var fraværende, får en tom celle i kolonnen. En tom celle er "ikke udfyldt" — ikke en gruppe — så de bliver hverken spredt eller samlet på grund af den dag, de manglede.</em>
                    </p>
                </div>
            </div>

            <!-- OPSKRIFT 6 -->
            <div class="recipe-card">
                <div class="recipe-card__header">
                    <h4 class="recipe-card__title">6. Samme grupper som sidste uge</h4>
                    <p class="recipe-card__desc">Et forløb der strækker sig over flere moduler — uden at sætte grupperne op i hånden igen.</p>
                </div>
                <div class="recipe-card__body">
                    <ul class="step-list">
                        <li><strong>Da du dannede dem:</strong> tryk <strong>"Gem"</strong> nederst på Grupper-fanen, vælg <strong>"Gem som kolonne i elevlisten"</strong>, og giv opdelingen et navn, fx <em>Vismandsgrupper</em>.</li>
                        <li><strong>Næste modul:</strong> tryk <strong>"Gendan"</strong> og peg på den kolonne. Grupperne er tilbage.</li>
                        <li>Har du i stedet en liste liggende i Word eller Lectio, kan du lime den ind under fanen <strong>"Fra tekst"</strong>.</li>
                    </ul>
                </div>
            </div>
        </div>


        <h3 class="section-heading-lg">
            <ArrowDownWideNarrow :size="22" />Når kolonnen indeholder ord i stedet for tal
        </h3>

        <div class="info-panel">
            <p class="info-panel__intro">
                Tre af reglerne — <strong>Balancér</strong>, <strong>Ensartede</strong> og
                <strong>Saml</strong> — regner. De skal kunne se, at én værdi er højere end en
                anden. Står der <em>tal</em> i kolonnen (karakterer, fraværsprocent), går det af
                sig selv. Står der <em>ord</em> — Lav, Middel, Høj — kan programmet ikke vide,
                hvad der er mest, og reglen ville gøre bogstaveligt talt ingenting.
            </p>

            <div class="two-col-grid">
                <div>
                    <strong class="step-label step-label--teal">1. Fortæl rækkefølgen</strong>
                    <p class="muted-text">Tryk <strong>"Ranger"</strong> i værktøjslinjen over elevlisten, vælg kolonnen, og skub ordene op og ned, til de står rigtigt. Øverst er lavest.</p>
                </div>
                <div>
                    <strong class="step-label step-label--purple">2. Brug reglen som normalt</strong>
                    <p class="muted-text">Nu kan Balancér, Ensartede og Saml arbejde med kolonnen, præcis som var det tal.</p>
                </div>
            </div>

            <div class="info-box info-box--yellow" style="margin-top: 24px;">
                <strong class="info-box__label info-box__label--yellow">Du får besked, hvis du glemmer det</strong>
                <p class="muted-text muted-text--tight">
                    Sætter du en af de tre regler på en tekstkolonne uden rækkefølge, dukker der en
                    advarsel op med en knap, der åbner rangeringen på netop den kolonne. Advarslen
                    forsvinder, når rækkefølgen er gemt — men kun hvis den passer på nogen: skifter
                    du senere klasselisten ud med en, der bruger andre ord, kommer den igen.
                </p>
            </div>

            <p class="muted-text" style="margin-top: 16px; font-size: 0.85em; opacity: 0.8;">
                <em>Rangeringen hører til kolonnen, ikke til en enkelt gruppedannelse — den bliver
                stående, også når du henter en tidligere kørsel frem.</em>
            </p>
        </div>

        <h3 class="section-heading-lg">
            <Tag :size="22" />Arbejde med emner
        </h3>

        <div class="info-panel">
            <p class="info-panel__intro">
                Definér klassens emner ét sted — så fordeler systemet dem automatisk til grupperne ved generering. Det sikrer optimal matrix-fordeling, også når elever er fraværende.
            </p>

            <div class="two-col-grid">
                <div>
                    <strong class="step-label step-label--teal">1. Skriv emnerne én gang</strong>
                    <p class="muted-text">Klik på ordet i linjen <strong>"Grupperne får …"</strong> i gruppeopskriften, og skriv emnerne, fx <em>Liberalismen</em>, <em>Konservatismen</em>, <em>Socialismen</em>. Tryk Enter eller "Tilføj" for hvert emne.</p>
                </div>
                <div>
                    <strong class="step-label step-label--purple">2. {{ UI_NAMES.generate }}</strong>
                    <p class="muted-text">Emnerne fordeles ligeligt, og din gruppestørrelse holder. Går antallet af grupper ikke op med emnerne, siger grup.dk det og tilbyder et antal, der gør.</p>
                </div>
            </div>

            <div class="info-box info-box--yellow" style="margin-top: 24px; margin-bottom: 16px;">
                <strong class="info-box__label info-box__label--yellow">Fravær har to indgange — og de gør ikke det samme</strong>
                <p class="muted-text muted-text--tight" style="margin-top: 8px;">
                    <strong>Fluebenet "til stede"</strong> i elevlisten markerer eleven som
                    fraværende. Eleven bliver <em>stående</em> på gruppekortet, men mærket — og
                    tælles ikke med, næste gang du genererer. Det er den skånsomme vej:
                    du kan sætte fluebenet tilbage, uden at noget er gået tabt.<br><br>
                    <strong>Papirkurven</strong> i værktøjslinjen er vejen <em>ud af gruppen</em>.
                    Træk eleven derhen, så forsvinder navnet fra kortet. Det er den du skal bruge,
                    når gruppen skal arbejde videre uden eleven i dag.
                </p>
                <p class="muted-text muted-text--tight" style="margin-top: 8px;">
                    <em>Tidligere gjorde fluebenet ingen af delene synligt på grupperne, så man
                    kunne stå og lede efter en elev, der var meldt fraværende. Nu kan det ses
                    både på kortene, på udskriften og i det du kopierer.</em>
                </p>
            </div>

            <div class="info-box info-box--blue" style="margin-top: 24px; margin-bottom: 16px;">
                <strong class="info-box__title">Robust mod fravær</strong>
                <p class="muted-text" style="margin: 8px 0 0;">Hvis 3 elever pludselig mangler: fjern fluebenet i <strong>"til stede"</strong>-kolonnen i Elevliste og klik <strong>"{{ UI_NAMES.generate }}"</strong> igen. Systemet justerer gruppestørrelser og emne-tildelinger, så matrix-fordelingen forbliver optimal.</p>
            </div>

            <strong class="step-label step-label--teal">Styr retningen: én elev ekstra eller én elev mindre</strong>
            <p class="muted-text muted-text--tight">Opskriftens første linje slutter med "Går det ikke op, får nogle grupper …". Klik på ordet for at skifte:</p>
            <ul class="step-list" style="margin-bottom: 12px;">
                <li><strong>én elev ekstra</strong> → færre, lidt større grupper (fx 6 grupper a 4-5 elever)</li>
                <li><strong>én elev mindre</strong> → flere, lidt mindre grupper (fx 9 grupper a 3 elever)</li>
            </ul>
            <p class="muted-text muted-text--tight">Begge giver stadig optimal matrix-fordeling — kun gruppe-størrelsen ændrer sig.</p>

            <p class="muted-text" style="margin-top: 20px; font-size: 0.85em; opacity: 0.8;">
                <em>Bemærk: Hvis du ikke definerer emner (i linjen "Grupperne får …" i gruppeopskriften), virker det klassiske flow stadig — du kan skrive et emne direkte på hver gruppe.</em>
            </p>
        </div>

        <h3 class="section-heading-lg">
            <Wrench :size="22" />Finjustering
        </h3>

        <div class="two-col-grid two-col-grid--spaced">
            <div class="tip-box tip-box--amber">
                <strong class="tip-box__title">1. Lås grupper <Lock :size="16" style="vertical-align:-2px; margin-left:4px;" /></strong>
                <p class="tip-box__desc">Er 3 ud af 5 grupper perfekte? Lås dem med hængelåsen og generér igen. De låste bliver stående uændret, og resten dannes forfra.</p>
            </div>
            <div class="tip-box tip-box--green">
                <strong class="tip-box__title">2. Flyt en elev <Hand :size="16" style="vertical-align:-2px; margin-left:4px;" /></strong>
                <p class="tip-box__desc">Du bestemmer altid til sidst. Træk eleven fra én gruppe til en anden — de øvrige skubber sig til side undervejs, så du kan se, hvor eleven lander. Holder du eleven stille over en elev i en anden gruppe, står der <strong>"byt"</strong>: slipper du dér, bytter de to elever gruppe.</p>
            </div>
            <div class="tip-box tip-box--green">
                <strong class="tip-box__title">3. Uden mus — på tavlen eller en iPad <Hand :size="16" style="vertical-align:-2px; margin-left:4px;" /></strong>
                <p class="tip-box__desc">Træk-og-slip findes ikke på en touchskærm. Tryk i stedet på eleven — så bliver eleven markeret, og hvert af de andre kort får en <strong>"Flyt hertil"</strong>-knap forneden. I elevens egen række kommer der samtidig <strong>"Meld fraværende"</strong> og et lille kryds, der fortryder. Escape eller et tryk mere på navnet fortryder også.</p>
            </div>
            <div class="tip-box tip-box--amber">
                <strong class="tip-box__title">4. Efternølere <UserPlus :size="16" style="vertical-align:-2px; margin-left:4px;" /></strong>
                <p class="tip-box__desc">Kom der en elev for sent, efter grupperne er dannet? Tryk på <strong>personknappen</strong> i værktøjslinjen og vælg eleven. Placeringen falder dér, hvor den passer bedst — emnefordelingen vejer tungest, og du får besked, hvis en undgåelse ikke kan overholdes.</p>
            </div>
            <div class="tip-box tip-box--amber">
                <strong class="tip-box__title">5. Undgåelser <ShieldX :size="16" style="vertical-align:-2px; margin-left:4px;" /></strong>
                <p class="tip-box__desc">Markér to elever i Elevliste, tryk <strong>"Lav aftale"</strong> og vælg <strong>"Undgå hinanden"</strong>. Aftalen gælder lige de elever og bliver stående på tværs af gruppedannelser, indtil du fjerner den igen under <strong>Aftaler → Undgå hinanden</strong>.</p>
            </div>
            <div class="tip-box tip-box--green">
                <strong class="tip-box__title">6. Skal sammen <Link2 :size="16" style="vertical-align:-2px; margin-left:4px;" /></strong>
                <p class="tip-box__desc">Markér mindst to elever i Elevliste, tryk <strong>"Lav aftale"</strong> og vælg <strong>"Skal sammen"</strong>. De holdes i samme stamgruppe, mens resten af gruppen gerne må skifte. Aftalen bliver stående, til du fjerner den under <strong>Aftaler → Skal sammen</strong>.</p>
            </div>
        </div>

        <h3 class="section-heading-lg">
            <Undo2 :size="22" />Fortryd og gem
        </h3>

        <div class="info-panel">
            <p class="info-panel__intro">
                Ingen gruppedannelse er endelig. Der er tre forskellige veje tilbage, og de gør
                ikke det samme.
            </p>

            <div class="two-col-grid">
                <div>
                    <strong class="step-label step-label--teal">Tidligere kørsler <Undo2 :size="14" style="vertical-align:-2px;" /></strong>
                    <p class="muted-text">Knappen <strong>"{{ UI_NAMES.runHistory }}"</strong> nederst på Grupper-fanen gemmer de <strong>fem seneste</strong> gruppedannelser. Peg på et tal, og kortene viser den kørsel med det samme — der bliver ikke gemt noget, før du klikker. Har du flyttet elever i hånden siden, bliver du spurgt først, og den fordeling du forlader, lægges øverst i menuen, så du kan hente den tilbage igen.</p>
                </div>
                <div>
                    <strong class="step-label step-label--purple">Gemte sessioner <Save :size="14" style="vertical-align:-2px;" /></strong>
                    <p class="muted-text">Tryk <strong>"Gem"</strong> → <strong>"Gem i Historik"</strong> for at lægge en gruppedannelse til side med et navn. Den ligger under <strong>Historik</strong> og forsvinder ikke, når du danner nye grupper. Brug den til noget du skal bruge igen om tre uger — kørselshistorikken rækker kun over de seneste fem.</p>
                </div>
            </div>

            <div class="info-box info-box--blue" style="margin-top: 24px;">
                <strong class="info-box__title">Gem som kolonne — den mest holdbare</strong>
                <p class="muted-text" style="margin: 8px 0 0;">
                    Tryk <strong>"Gem"</strong> → <strong>"Gem som kolonne i elevlisten"</strong>, og opdelingen skrives ind i elevlisten som en
                    ganske almindelig kolonne. Den følger med ud i Excel-eksporten, den kan læses
                    tilbage med <strong>"Gendan"</strong>, og den overlever, at du rydder alt andet.
                    Skal en gruppeopdeling holde et helt forløb, er det den vej at gå.
                </p>
            </div>

            <p class="muted-text" style="margin-top: 20px; font-size: 0.85em; opacity: 0.8;">
                <em>Ctrl+Z fortryder ændringer i <strong>elevlisten</strong> — ikke gruppedannelser.
                Står der et vindue åbent, gør genvejen ingenting; dér er det knappen "Annuller".</em>
            </p>
        </div>

        <div class="info-panel">
            <h3 class="info-panel__title">
                <BarChart3 :size="22" />Forstå resultatet
            </h3>

            <p class="info-panel__intro">Når du klikker <strong>"{{ UI_NAMES.generate }}"</strong>, forsøger systemet at opfylde dine regler bedst muligt.</p>

            <div class="info-box info-box--blue">
                <strong class="info-box__label info-box__label--blue">Hvad gik op? Se i opskriften</strong>
                <p class="muted-text muted-text--tight">Efter en dannelse står der et lille mærke ved hver regel i gruppeopskriften:</p>
                <ul class="muted-list">
                    <li><RuleMark :mark="{ state: 'met', label: 'Opfyldt' }" /> <strong>Flueben:</strong> reglen er opfyldt.</li>
                    <li><RuleMark :mark="{ state: 'best', label: 'Det bedst mulige' }" /> <strong>Blå streg:</strong> ikke helt, men det bedst mulige med netop den klasse — fx 9 stærke elever, der skal adskilles i 7 grupper.</li>
                    <li><RuleMark :mark="{ state: 'open', label: 'Ikke opfyldt' }" /> <strong>Blå pil rundt:</strong> ikke opfyldt, men en ny dannelse kan måske gøre det bedre.</li>
                    <li><RuleMark :mark="{ state: 'fix', label: 'Skal rettes' }" /> <strong>Rødt kryds:</strong> noget, du kan rette i opskriften, fx en regel, der ikke kan gå op.</li>
                </ul>
                <p class="muted-text muted-text--tight">
                    Ved aftalerne står "alle holdt" eller fx "1 brudt". Under opskriften står
                    <strong>Sidste dannelse</strong>: det, systemet fandt ud af om din opsætning, fx
                    hvorfor en regel ikke kunne gå helt op. Mærkerne og teksten bliver stående til næste
                    dannelse — ændrer du opskriften, forsvinder de, for så passer de ikke længere.
                </p>
                <p class="muted-text muted-text--tight">
                    Under <strong>"Se kørslen"</strong> (filmklappen ved siden af
                    "{{ UI_NAMES.runHistory }}") står fx "Forsøg 7 af 12 – det bedste.": systemet
                    prøvede 12 fordelinger, og den syvende blev den bedste. Står der
                    også, at andre forsøg endte lige så godt, var der flere lige gode fordelinger at vælge
                    imellem.
                </p>
            </div>

            <div class="result-boxes">
                <div class="info-box info-box--yellow">
                    <strong class="info-box__label info-box__label--yellow">Ting at holde øje med</strong>
                    <p class="muted-text muted-text--tight">Hvis resultatet ikke ser rigtigt ud, kan det skyldes:</p>
                    <ul class="muted-list">
                        <li><strong><Ban :size="12" style="vertical-align:-2px;" /> Umulige regler:</strong> F.eks. 5 elever skal adskilles, men der er kun 3 grupper.</li>
                        <li><strong><AlertTriangle :size="12" style="vertical-align:-2px;" /> Modstridende regler:</strong> F.eks. "Klyng" + "Fordel" på samme kolonne (samle OG sprede samtidig).</li>
                        <li><strong><AlertTriangle :size="12" style="vertical-align:-2px;" /> En regel der ikke rører noget:</strong> Står kolonnen tom for alle elever — eller indeholder den ord, hvor reglen har brug for tal — gør reglen ingenting. Det siger programmet nu, i stedet for at lade den se ud til at virke.</li>
                        <li><strong><AlertTriangle :size="12" style="vertical-align:-2px;" /> En matrix der er blevet skæv:</strong> Flytter du en elev i hånden, efter matrixen er dannet, passer den ikke længere til stamgrupperne. Du får et hint med en knap, der danner den igen — men du bestemmer, om den skal trykkes.</li>
                        <li><strong><AlertTriangle :size="12" style="vertical-align:-2px;" /> En Skal sammen-aftale er brudt:</strong> Det kan ske, hvis du flytter en elev manuelt eller henter gamle grupper frem. Saml eleverne igen, dan stamgrupperne på ny, eller fjern aftalen — knappen <strong>"Vis aftalen"</strong> i advarslen åbner den direkte.</li>
                        <li><strong><AlertTriangle :size="12" style="vertical-align:-2px;" /> En aftale kan ikke gå op:</strong> For små grupper, låste grupper, Opdel eller en Undgå hinanden-aftale kan gøre en Skal sammen-aftale umulig. Programmet forklarer problemet og lader de eksisterende grupper stå. Advarslen har to knapper: <strong>"Vis aftalen"</strong>, og — når en Undgå hinanden-aftale, en Adskil-regel eller en låst gruppe står i vejen — <strong>"Dan grupper uden aftalen"</strong>, der springer aftalen over denne ene gang. Aftalen bliver liggende.</li>
                        <li><strong><AlertTriangle :size="12" style="vertical-align:-2px;" /> Skal sammen og Adskil på samme elever:</strong> Skal to elever være sammen, men holder en Adskil-regel dem adskilt, stopper programmet kun, hvis parret virkelig giver flere par i samme gruppe, end klassen alligevel er nødt til. Ellers dannes grupperne: opskriften nævner parret med en blå note før dannelsen og under Sidste dannelse bagefter.</li>
                    </ul>
                </div>
            </div>

            <p class="tip-note">
                <Lightbulb :size="14" style="vertical-align:-2px; margin-right:4px;" /><strong>Tip:</strong> Systemet prøver mange mulige fordelinger og sammenligner dem trin for trin efter rangordenen øverst på siden: det øverste trin vejer mest. Det stopper, når det ved, at det ikke kan gøres bedre, eller efter omkring 10 sekunder (30 sekunder for hold over 100 elever). Trykker du Stop undervejs, beholder du de bedste grupper, det har fundet indtil da.
            </p>
        </div>

        <h3 class="section-heading-lg">
            <FileText :size="22" />Ud til eleverne
        </h3>

        <div class="info-panel">
            <p class="info-panel__intro">
                Grupperne gør først gavn, når klassen kan se dem. Der er tre veje ud, og de
                viser alle sammen elevernes navne — ikke programmets interne numre.
            </p>

            <div class="two-col-grid">
                <div>
                    <strong class="step-label step-label--teal">Del <Share2 :size="14" style="vertical-align:-2px;" /></strong>
                    <p class="muted-text">Åbner en ren udskrift, du kan sende til printeren, gemme som PDF eller vise på tavlen — eller henter grupperne som en Excel-fil med én kolonne eller én række pr. gruppe, klar til Lectio. Fraværende elever er markeret, så ingen leder efter en, der ikke er der.</p>
                </div>
                <div>
                    <strong class="step-label step-label--purple">Kopiér <Clipboard :size="14" style="vertical-align:-2px;" /></strong>
                    <p class="muted-text">Lægger opdelingen på udklipsholderen som almindelig tekst — klar til at lime ind i Lectio, en mail eller et dokument.</p>
                </div>
            </div>

            <div class="info-box info-box--blue" style="margin-top: 24px;">
                <strong class="info-box__title">Excel — hele klassen med grupperne i</strong>
                <p class="muted-text" style="margin: 8px 0 0;">
                    Under <strong>Import &amp; backup → Eksportér</strong> får du hver klasse som
                    sit eget regneark: alle dine kolonner, en "Til stede"-kolonne, og — hvis du
                    har dannet grupper — en <strong>Stamgruppe</strong>- og en
                    <strong>Matrixgruppe</strong>-kolonne. Kolonnerne står i den rækkefølge, du
                    har givet dem under "Flyt".
                </p>
            </div>

            <div class="info-box info-box--yellow" style="margin-top: 16px;">
                <strong class="info-box__label info-box__label--yellow">Backup: det ligger kun hos dig</strong>
                <p class="muted-text muted-text--tight">
                    Alt — klasser, regler, grupper, emner, Skal sammen-aftaler og gemte sessioner — ligger i din
                    browser på denne computer. Der er ingen server med en kopi. Skifter du
                    computer, eller rydder browseren sine data, er det væk. Tag en
                    <strong>backup-fil</strong> (samme sted som eksporten), når du har lagt
                    arbejde i noget, du ikke vil lave om.
                </p>
            </div>
        </div>

        <h3 class="section-faq-title">Hvorfor gør den ikke som jeg vil?</h3>
        <p>Hvis du oplever, at en regel ikke overholdes, er der som regel én af fire forklaringer.</p>

        <div class="example-box">
            <strong>1. En anden regel låser systemet.</strong> Du vil sprede "Niveau", men også klynge "Køn". Er de eneste piger stærke fagligt, tvinges de sammen, og niveau-balancen ryger: Klyng vejer tungere end Fordel. Se trinnene øverst på siden, eller tryk <strong>"Hvorfor?"</strong> under reglerne i gruppeopskriften. Mærket ved reglen viser, om den ikke kunne gå op med klassen (blå streg), eller om noget skal rettes (rødt kryds).
        </div>

        <div class="example-box">
            <strong>2. Reglen har intet at arbejde med.</strong> Regner reglen (Balancér, Ensartede, Saml), skal kolonnen indeholde tal — eller have fået en rækkefølge under "Ranger". Er kolonnen tom for alle elever, gør reglen heller ingenting. Begge dele siger programmet nu højt.
        </div>

        <div class="example-box">
            <strong>3. Du kigger på det andet gruppesæt.</strong> Stamgrupper og matrixgrupper er to forskellige fordelinger med hver sine regler. Skifter du mellem <strong>"Matrix-runde"</strong> og <strong>"← Stamgrupperne"</strong> uden at danne grupper, ser du den anden — og reglerne du lige har rettet, hører måske til den, du ikke kigger på.
        </div>

        <div class="example-box">
            <strong>4. En Skal sammen-aftale har en anden forklaring.</strong> Aftalen gælder stamgrupper, ikke Matrix. Den kan også blive brudt af en manuel flytning eller af gamle grupper, du har hentet frem. Se beskeden over stamgrupperne: den fortæller, om du skal danne grupperne igen, samle eleverne manuelt eller fjerne aftalen.
        </div>
    </div>
  </PageLayout>
</template>

<style scoped>
/* Overskrifter, bokse, kort og paneler får deres udseende fra infosidernes ark
   (beta/screens/info-sider.css), som vinder over de scoped regler. Her står
   kun det, arket ikke sætter: opbygningen og teksternes størrelser. */

/* Infobokse */
.info-box__label { display: block; }
.info-box__list {
    margin: 10px 0 0 20px;
}

/* Opskrifterne */
.recipes-grid {
    display: grid;
    gap: 30px;
    margin-bottom: 50px;
}
.recipe-card {
    overflow: hidden;
}
.recipe-card__title {
    margin: 0;
    color: var(--text-heading);
    font-size: 1.1em;
}
.recipe-card__desc {
    margin: 5px 0 0;
    font-size: 0.9em;
    color: var(--text-muted);
}
.recipe-steps {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}
@media (max-width: 600px) {
    .recipe-steps { grid-template-columns: 1fr; }
}

/* Trin */
.step-label {
    display: block;
    margin-bottom: 8px;
    font-weight: 600;
}
.step-label--teal { color: var(--color-success); }
.step-label--purple { color: var(--primary); }
.step-list {
    padding-left: 20px;
    margin: 0;
    font-size: 0.95em;
    color: var(--text-main);
}

.info-panel__intro { margin-top: 0; }

/* To spalter */
.two-col-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
    margin-top: 20px;
}
.two-col-grid--spaced { margin-bottom: 40px; }
@media (max-width: 600px) {
    .two-col-grid { grid-template-columns: 1fr; }
}

/* Tips */
.tip-box__title {
    font-size: 1.1em;
    font-weight: 600;
}
.tip-box__desc {
    font-size: 0.9em;
    color: var(--text-muted);
    margin-top: 5px;
    margin-bottom: 0;
}

/* Resultater */
.result-boxes {
    display: grid;
    grid-template-columns: 1fr;
    gap: 15px;
    margin-top: 15px;
}

/* Diverse */
.muted-text { font-size: 0.9em; color: var(--text-muted); }
.muted-text--tight { margin: 5px 0 0; }
.muted-list { font-size: 0.88em; color: var(--text-muted); margin: 8px 0 0 16px; padding: 0; }
.tip-note {
    margin-top: 15px;
    font-style: italic;
    font-size: 0.9em;
    color: var(--text-muted);
}
.example-box {
    color: var(--text-main);
}
</style>
