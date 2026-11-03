
export function initGlobalTooltip() {
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'custom-tooltip';
    tooltipEl.id = 'global-tooltip';
    document.body.appendChild(tooltipEl);

    let activeTooltipTarget = null;

    // Er et træk-og-slip i gang? Så vises intet tip (se dragstart nedenfor).
    let dragInProgress = false;

    // Se hideTooltipIfGone() nedenfor. Kører KUN mens et tip er fremme, så den
    // ikke ligger og lytter med på en app, der tegner om hele tiden.
    let goneWatcher = null;

    // Tager musevejens to lyttere (følg musen + ryd op ved mouseleave) af det
    // element, de sidder på. Der findes højst ÉT sådant par ad gangen, og det
    // husker selv sit element.
    //
    // Før stod oprydningen KUN i `mouseleave`, og et tip der blev skjult på
    // anden vis — elementet blev dækket af et vindue, eller det forsvandt —
    // efterlod lytterne siddende: følgeren regnede en position ud til et tip,
    // ingen kunne se, ved hver eneste musebevægelse (og hver udregning måler
    // elementets kasse, som tvinger browseren til at lægge siden ud igen).
    //
    // Senere rettelse (24/9) — to huller mere i samme mønster:
    //  1. mouseleave-lytteren blev siddende, når tippet var skjult på anden
    //     vis, og næste mouseover på SAMME element lagde et nyt par oveni.
    //     Generér dækker sin egen knap med kørsels-vinduet, så med musen i ro
    //     voksede knappen med et par pr. tryk — målt ca. 400 ekstra lyttere efter
    //     200 tryk, og hver holdt det gamle kørsels-vindue fast i hukommelsen.
    //  2. Tog TASTATURET tippet over (Tab til en anden knap), blev følgeren på
    //     knappen under musen siddende, og hideTooltip() prøvede at tage den af
    //     det FORKERTE element. Den mindste musebevægelse skrev så knappens
    //     tekst ind i det tip, der hørte til elementet med fokus.
    let detachMouse = null;

    function detachMouseListeners() {
        if (detachMouse) {
            detachMouse();
            detachMouse = null;
        }
    }

    // Flytter en almindelig `title` over i `data-tooltip`, så vi selv bestemmer
    // hvordan tippet tegnes.
    //
    // VIGTIGT (tilgængelighed): i det øjeblik vi fjerner `title`, mister en
    // ikon-knap, der kun havde den, sit navn. Derfor spejles teksten samtidig i
    // `aria-label` (medmindre der allerede står et), så navnet bliver stående
    // for skærmlæsere, stemmestyring og Windows' højkontrast-tilstand.
    //
    // SKIFTE-KNAPPER: mange knapper har en `title`, der ÆNDRER SIG med knappens
    // tilstand (":title=allLocked ? 'Lås alle op' : 'Lås alle'"). Vue skriver
    // den nye tekst tilbage i `title`, og næste gang musen er forbi, opdaterer
    // vi `data-tooltip` — men et aria-label vi allerede havde sat, blev aldrig
    // rørt igen. Målt på temaknappen: tippet sagde "Skift til lys tema", mens
    // aria-label blev ved med at sige "Skift til mørkt tema" resten af
    // besøget. Skærmlæsere og stemmestyring læser aria-label, ikke tippet, så
    // navnet var permanent forkert efter det første tryk.
    //
    // Derfor markerer vi de labels vi SELV har sat (data-tooltip-label="auto")
    // og holder dem i sync. Et aria-label skrevet i skabelonen er komponentens
    // eget og bliver aldrig overskrevet.
    //
    // KUN IKON-KNAPPER (fundet ved gennemsynet 9/9). Reglen ovenfor blev
    // skrevet for knapper der KUN har et ikon — dem der mister deres navn i
    // det øjeblik `title` ryger. Men den spurgte aldrig, om elementet havde et
    // navn i forvejen, og et `aria-label` VINDER over elementets egen tekst.
    // Så snart musen havde strejfet en knap med skrift på, hed den noget
    // andet: målt på gruppeskærmen skiftede 38 betjeningsflader navn — knappen
    // "Generér" hed "Dan nye grupper", "Kopiér" hed "Kopiér holdopdeling", og
    // hver eneste elevrække på hvert eneste gruppekort hed det SAMME, "Klik
    // for at flytte eleven til en anden gruppe". Elevens navn var væk fra
    // tilgængelighedstræet, og 28 rækker kunne ikke skelnes fra hinanden.
    //
    // Det rammer også stemmestyring: navnet skal indeholde de ord, der står på
    // knappen, ellers finder "klik Generér" ingenting (WCAG 2.5.3).
    //
    // Har elementet tekst, ER teksten navnet, og vi holder fingrene væk.
    function hasOwnText(el) {
        return (el.textContent || '').trim().length > 0;
    }

    function syncAutoLabel(el, titleText) {
        const isOurs = el.dataset.tooltipLabel === 'auto';
        if (hasOwnText(el)) {
            // Har vi sat et label dengang elementet stod uden tekst, skal det
            // væk igen — ellers bliver den gamle tekst ved med at vinde.
            if (isOurs) {
                el.removeAttribute('aria-label');
                delete el.dataset.tooltipLabel;
            }
            return;
        }
        if (!titleText.trim()) return;
        if (!isOurs && el.hasAttribute('aria-label')) return;
        el.setAttribute('aria-label', titleText);
        el.dataset.tooltipLabel = 'auto';
    }

    function convertTitle(el) {
        if (el && el.hasAttribute('title')) {
            const titleText = el.getAttribute('title');
            el.setAttribute('data-tooltip', titleText);
            syncAutoLabel(el, titleText);
            el.removeAttribute('title');
        }
    }

    // ─── Skifte-knapper UDEN mus (fundet ved dobbelttjekket 4/9) ─────────────
    // Rettelsen ovenfor holdt kun, så længe musen var i spil: `followMouse`
    // kalder convertTitle ved hver eneste musebevægelse, så en ny `title`
    // bliver hentet ind med det samme. Tastaturvejen havde ingen sådan puls.
    //
    // Målt på "Lås alle": Tab hen til knappen (aria-label bliver "Lås alle"),
    // tryk Enter. Vue skriver `title="Lås alle op"` tilbage, men fokus har
    // ikke rørt sig, så hverken mouseover eller focusin fyrer igen —
    // `aria-label` OG det synlige tip blev ved med at sige "Lås alle" resten
    // af besøget. Det er præcis den fejl, rettelsen 27/8 skulle lukke; den
    // nåede bare kun den ene af de to veje ind.
    //
    // Observatøren lytter efter ÆNDRINGER i `title` og rører KUN elementer, vi
    // allerede har overtaget (`data-tooltip`). Et element vi aldrig har haft
    // fingre i, beholder sin `title` og opfører sig som før — ellers ville vi
    // rive titler ud af siden, længe før nogen har peget på dem.
    function watchTitleChanges() {
        if (typeof MutationObserver !== 'function') return;
        const titleWatcher = new MutationObserver((records) => {
            for (const r of records) {
                const el = r.target;
                if (!el.hasAttribute || !el.hasAttribute('data-tooltip')) continue;
                convertTitle(el);
                // Står tippet fremme for netop dette element, skal teksten på
                // skærmen skifte med det samme — også uden en musebevægelse.
                if (el === activeTooltipTarget) {
                    const latest = el.getAttribute('data-tooltip');
                    if (latest && latest !== tooltipEl.textContent) tooltipEl.textContent = latest;
                }
            }
        });
        titleWatcher.observe(document.body, {
            attributes: true,
            attributeFilter: ['title'],
            subtree: true,
        });
    }

    // Forsvinder elementet under musen, affyres `mouseleave` ALDRIG — og så
    // blev tippet hængende midt på skærmen med en tekst om noget, der ikke er
    // der mere. Set i praksis: hold musen over trække-håndtaget i "Ranger" og
    // luk vinduet med Escape; teksten "Flyt "D" — eller brug pil op/ned" blev
    // stående. Gruppekortene tegnes om ved hver generering, så det samme kunne
    // ske dér.
    //
    // Musen behøver ikke bevæge sig for at elementet kan forsvinde, så et tjek
    // ved næste mouseover er ikke nok. En observatør er det eneste, der fanger
    // det med musen i ro — og den slukkes igen, så snart tippet er væk.
    //
    // At blive DÆKKET tæller på samme måde som at forsvinde: åbner knappen
    // under musen et vindue, lægger overlayet sig ovenpå, uden at musen har
    // rørt sig — så affyres `mouseleave` heller ikke her, og tippet blev
    // hængende oven på værktøjslinjen, indtil man rørte musen igen. Gælder
    // hver eneste knap med et tip der åbner et vindue ("Gendan", "Tilføj
    // efternøler", "Gem session" …). Et tip der hører til noget INDE i
    // vinduet er ikke dækket og skal blive stående — derfor `closest()`.
    function hideTooltipIfGone() {
        if (!activeTooltipTarget) return;

        if (!activeTooltipTarget.isConnected) {
            hideTooltip(activeTooltipTarget);
            return;
        }

        // Begge vindues-slags med: Undgåelser-vinduet hedder ikke
        // `.modal-overlay`, og et tip bag DET blev hængende.
        const MODALS = '.modal-overlay, .avoid-modal-backdrop';
        if (document.querySelector(MODALS)
            && !activeTooltipTarget.closest(MODALS)) {
            hideTooltip(activeTooltipTarget);
        }
    }

    // Viser tippet for et element. `positionFn` sørger for den første
    // placering: musen bruger markørens position, tastaturet elementets kasse.
    function showTooltip(target, positionFn) {
        if (!target || target === activeTooltipTarget) return;
        // Intet tip mens læreren trækker — se dragstart-lytteren nedenfor.
        if (dragInProgress) return;

        const tooltipText = target.getAttribute('data-tooltip');
        if (!tooltipText || !tooltipText.trim()) return;

        // Et nyt tip — uanset om det kommer fra musen eller tastaturet —
        // overtager fra det gamle, så det gamles muselyttere skal af nu.
        detachMouseListeners();
        activeTooltipTarget = target;
        // Et åbent <dialog> ligger i browserens øverste lag, og alt uden for
        // det står UNDER det — uanset z-index. Sidder knappen i et vindue,
        // flyttes tippet derind, ellers stod det skjult bag vinduet.
        const home = target.closest('dialog[open]') || document.body;
        if (tooltipEl.parentNode !== home) home.appendChild(tooltipEl);
        tooltipEl.textContent = tooltipText;
        tooltipEl.classList.add('visible');
        positionFn();

        if (typeof MutationObserver === 'function') {
            if (!goneWatcher) goneWatcher = new MutationObserver(hideTooltipIfGone);
            goneWatcher.observe(document.body, { childList: true, subtree: true });
        }
    }

    // Skjuler tippet, hvis `target` er det, der står fremme lige nu.
    function hideTooltip(target) {
        if (target !== activeTooltipTarget) return;
        tooltipEl.classList.remove('visible');
        detachMouseListeners();
        activeTooltipTarget = null;
        if (goneWatcher) goneWatcher.disconnect();
    }

    document.body.addEventListener('mouseover', (e) => {
        // Find elementet med data-tooltip ELLER title, og konvertér det. Efter
        // konverteringen HAR det data-tooltip, så det er også tippets mål.
        const target = e.target.closest('[data-tooltip], [title]');
        convertTitle(target);
        if (target && target !== activeTooltipTarget) {
            // Musevejen: placér ved markøren, og følg den.
            showTooltip(target, () => positionTooltip(e));

            // Stop her, hvis showTooltip afviste et tomt tip.
            if (target !== activeTooltipTarget) return;

            // Følg musen. Undervejs holdes teksten også ved lige: klikker
            // læreren på "Lås alle" UDEN at flytte musen væk, skriver Vue en
            // ny title, men mouseover er for længst affyret. Uden det her
            // blev tippet stående med den gamle tekst, indtil musen forlod
            // knappen og kom tilbage.
            const followMouse = (ev) => {
                convertTitle(target);
                const latest = target.getAttribute('data-tooltip');
                if (latest && latest !== tooltipEl.textContent) tooltipEl.textContent = latest;
                positionTooltip(ev);
            };
            // Musen forlader elementet: skjul tippet. Begge lyttere tages af
            // samme sted (detachMouseListeners), også når tippet skjules på
            // anden vis — så står de aldrig og venter på en mouseleave, der
            // måske aldrig kommer.
            const onLeave = () => hideTooltip(target);
            target.addEventListener('mousemove', followMouse);
            target.addEventListener('mouseleave', onLeave);
            detachMouse = () => {
                target.removeEventListener('mousemove', followMouse);
                target.removeEventListener('mouseleave', onLeave);
            };
        }
    });

    // Tastaturet: vis tippet, når et element får fokus (Tab) — samme opførsel
    // som med musen. focusin/focusout bobler, så ét par lyttere på
    // document.body dækker alle elementer (som mouseover ovenfor).
    document.body.addEventListener('focusin', (e) => {
        // Konvertér title -> data-tooltip præcis som musevejen gør.
        const target = e.target.closest('[data-tooltip], [title]');
        convertTitle(target);
        // Tastaturvejen: der er ingen markør, så tippet hænges op under det
        // element, der har fokus, ud fra dets kasse.
        //
        // KUN når fokus kom fra TASTATURET. Appen flytter selv fokus flere
        // steder — modalvinduerne til deres første knap, afspilningsmenuen til
        // Pause, når afspilleren tager over — og et tip hører ikke til dér:
        // læreren har ikke navigeret hen til knappen, hun trykkede på en anden.
        // Målt: klik "Se kørslen", og den sorte "Afspil"-etiket parkerede sig
        // oven på menuens eget ms-felt og blev stående, også når musen gik væk
        // (tippet skjules først, når fokus forlader elementet).
        //
        // `:focus-visible` ER browserens eget svar på "kom fokus fra
        // tastaturet?" — den matcher ved Tab og ikke ved et museklik eller et
        // .focus() vi selv har lavet. Kender browseren den ikke, viser vi
        // tippet som før.
        if (target && cameFromKeyboard(e.target)) {
            showTooltip(target, () => positionTooltipForElement(target));
        }
    });

    /** Matcher elementet :focus-visible? Ukendt selektor => ja, som før. */
    function cameFromKeyboard(el) {
        if (!el || typeof el.matches !== 'function') return true;
        try {
            return el.matches(':focus-visible');
        } catch {
            return true;
        }
    }

    document.body.addEventListener('focusout', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (target) hideTooltip(target);
    });

    // Et træk skjuler tippet. Under træk-og-slip sender browseren ingen
    // musehændelser — heller ikke `mouseleave` — så tippet over den række,
    // man greb fat i, blev stående midt på gruppekortet trækket igennem,
    // oven på navnene på de andre elever ("Klik for at flytte eleven …").
    // Gælder alle lister, man kan trække i: elever, regler og kolonner.
    //
    // Senere rettelse (3/11): at skjule tippet ÉN gang var ikke nok. Firefox
    // sender et `mouseover` + `mousemove` lige EFTER dragstart, og Safari
    // sender `mouseover` undervejs — så tippet kom igen og hang under den
    // række, læreren trak i (set på et skærmbillede fra en lærer: et mørkt tip
    // stak frem under den løftede elev). Derfor husker vi nu, at et træk er
    // i gang, og showTooltip() viser intet, før det er slut.
    //
    // Lytterne sidder på `document` i CAPTURE-fasen: gruppekortets drop-
    // handler kalder stopPropagation(), og rækken, trækket startede fra,
    // kan være fjernet fra siden, når `dragend` kommer — så når det aldrig
    // op til body. Et nyt museklik nulstiller også, så tippene ikke er væk
    // resten af timen, hvis både `drop` og `dragend` skulle gå tabt.
    //
    // Dobbelttjek 3/11: `dragend` når næsten ALDRIG op til document. Et træk
    // begynder over elevens eget kort, og dér tager pladsholderen rækkens
    // plads — så rækken er fjernet fra siden, når trækket slutter. Et slip på
    // et kort giver `drop` (det fanges), men et AFBRUDT træk — Esc, eller et
    // slip ved siden af kortene — giver kun `dragend`, og det sendes til den
    // fjernede række og ikke længere. Målt i alle tre browsere: intet tip
    // nogen steder, før læreren klikkede. Derfor sættes en lytter direkte på
    // rækken, trækket startede fra: den får sin `dragend`, også løsrevet.
    const endDragState = () => { dragInProgress = false; };
    document.addEventListener('dragstart', (e) => {
        dragInProgress = true;
        if (activeTooltipTarget) hideTooltip(activeTooltipTarget);
        const source = e.target;
        source.addEventListener?.('dragend', endDragState, { once: true });
        // Afviser en handler trækket (preventDefault — fx en låst gruppe),
        // kommer der hverken `dragend` eller `drop`. Vi lytter i capture-
        // fasen, før handlerne har kørt, så svaret kigges der på bagefter.
        setTimeout(() => {
            if (!e.defaultPrevented) return;
            dragInProgress = false;
            source.removeEventListener?.('dragend', endDragState);
        });
    }, true);
    document.addEventListener('dragend', endDragState, true);
    document.addEventListener('drop', endDragState, true);
    document.addEventListener('mousedown', endDragState, true);

    watchTitleChanges();

    function positionTooltip(e) {
        // Mål tippet FRA VENSTRE KANT. Et `position: fixed` element med kun
        // `left` sat kan aldrig blive bredere end resten af vinduet: står det
        // tæt på højre kant, klemmer browseren teksten sammen i en høj, smal
        // søjle — og målingen nedenfor ville så tro, at tippet ER så smalt, og
        // regne en forkert placering ud. Fra 0 får vi den bredde, tippet
        // faktisk vil have (bundet af max-width i stylesheetet). Det males
        // aldrig, for der er ingen overgang på `left`, og resten af funktionen
        // kører i samme greb.
        tooltipEl.style.left = '0px';
        const rect = tooltipEl.getBoundingClientRect();

        const MARGIN = 8; // luft til vinduets kanter

        // Til højre for og under markøren, medmindre der ikke er plads.
        let x = e.clientX + 10;
        if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - 10;

        let y = e.clientY + 10;
        if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - 10;

        // Er der ikke plads på NOGEN af siderne — et langt tip i et smalt
        // vindue — peger begge udregninger ud af skærmen. Sådan så det ud på
        // et bredt vindue, før tippet fik en max-width: teksten blev skubbet
        // til venstre for musen, landede på en negativ venstrekant, og de
        // første ord kunne slet ikke læses. Klem det ind i stedet.
        tooltipEl.style.left = clamp(x, MARGIN, window.innerWidth - rect.width - MARGIN) + 'px';
        tooltipEl.style.top = clamp(y, MARGIN, window.innerHeight - rect.height - MARGIN) + 'px';
    }

    /** Holder v inden for [lo, hi]. Er tippet større end vinduet, vinder lo. */
    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(v, hi));
    }

    // Placér tippet i forhold til det fokuserede elements kasse (der er ingen
    // markør at gå efter). Hænges op nede til venstre for elementet og
    // genbruger samme kant-tjek som positionTooltip().
    function positionTooltipForElement(el) {
        const elRect = el.getBoundingClientRect();
        // Vi opdigter et markør-punkt i elementets nederste venstre hjørne og
        // sender det videre til positionTooltip, så begge veje deler kant-tjekket.
        positionTooltip({ clientX: elRect.left, clientY: elRect.bottom });
    }
}
