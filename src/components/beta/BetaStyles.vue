<script setup>
// Beta's fælles stil: hentes én gang og er med på alle faner i beta.
// Komponenten tegner intet. Den findes, fordi stilarkene til Elevliste,
// Historik, Import & backup, vinduerne og infosiderne (screens/) og beskedernes udseende kun skal
// hentes i beta — App.vue indlæser den kun dér (defineAsyncComponent).
//
// Indtil 26/10 2026 var det et synligt mærke nederst til venstre ("BETA ·
// Tilbage til den almindelige · Hent kopi af klasserne"). Det er fjernet efter
// ønske: beta skal ikke se ud som en prøve. Backup ligger stadig under Import &
// backup → Eksporter.
import './screens/elevliste.css';
import './screens/historik-filer.css';
import './screens/vinduer.css';
import './screens/info-sider.css';
</script>

<template>
    <span hidden></span>
</template>

<style>
/* ── Beskederne i beta (NotificationManager.vue) ────────────────────────────
   Ikke scoped: de gælder hele appen i beta, og denne komponent er den
   eneste beta-komponent, der altid er med. I den almindelige Grupper er en besked et
   stort kort med en 4 px farvet kant og fuld tekst; efter en kørsel stod der
   tre afsnit om Fordel og Balancér hen over fjerde spalte. Her er de smallere
   og stillere, og en lang besked viser sine første linjer, til musen eller
   tastaturet er på den. */
html.beta .notification-container { max-inline-size: min(92vw, 400px); }
/* Nederst til højre, lige over bundlinjen (52 px): foroven dækkede beskeden
   gruppekortenes titler (øverste højre kort) og knapperne i bjælken. Nederst
   er der kun luft. Stakken står ikke under bjælken (den vokser nedefra), men
   `--toast-top` (bjælkens bund + 2 px, målt af NotificationManager) er dens
   LOFT: 10/11 2026 nåede fem blivende fejlbeskeder (det højeste antal) op over bjælken over
   grupperne og dækkede "Dan grupper igen", "Vis for klassen" og
   "Matrix-runde" — loftet regnede kun med topbjælken (64/112 px), ikke med
   bjælken under den. Regnestykket: 62 px bundlinje + 20 px polstring
   (kassen er content-box), så kassens top står præcis på `--toast-top`. */
html.beta .notification-container {
    inset-block-start: auto;
    inset-block-end: 62px;
    max-block-size: calc(100dvh - var(--toast-top, calc(var(--header-height, 64px) + 2px)) - 82px);
}
html.beta .toast {
    padding: 10px 10px 10px 12px;
    border: 1px solid var(--rule);
    border-inline-start: 2px solid var(--ink-4);
    border-radius: 8px;
    background: var(--paper);
    backdrop-filter: none;
    box-shadow: 0 6px 18px oklch(0 0 0 / 8%);
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-2);
}
html.beta .toast.success { border-inline-start-color: var(--color-success); }
html.beta .toast.error { border-inline-start-color: var(--color-error); }
html.beta .toast.info { border-inline-start-color: var(--primary); }
html.beta .toast.info .toast-icon { color: var(--ink-3); }
/* En lang besked ruller i stedet for at blive klippet med "…": browserens
   ellipse efter en sætning, der selv slutter med punktum, blev til "....",
   og en fejl skal kunne læres i sin helhed. */
html.beta .toast .toast-message {
    display: block;
    max-block-size: 9em;
    overflow-y: auto;
}
/* Aldrig oven på "Vis for klassen" (ClassShow.vue) */
html.class-showing .notification-container { display: none; }

/* ── Papirkurven i bundlinjen ───────────────────────────────────────────────
   Den er et MÅL for træk (en elev slippes på den for at blive meldt fraværende),
   ikke en knap — men stod den der hele tiden, lignede den en knap, der ikke
   gjorde noget. I beta vises den kun, mens en elev trækkes, yderst i linjen, så
   knapperne ikke flytter sig under musen. */
html.beta .floating-action-bar .trash-zone-floating { display: none; }
html.beta .floating-action-bar .trash-zone-floating.dragging {
    display: flex;
    position: absolute;
    inset-inline-end: 24px;
    inset-block-start: 50%;
    translate: 0 -50%;
}

/* ── Tags: altid under navnet ───────────────────────────────────────────────
   Tags stod nogle gange ved siden af navnet (til højre) og nogle gange på egen
   linje (til venstre), alt efter hvor meget plads der var — det så tilfældigt
   ud. I beta står de altid under navnet, venstrestillet. */
html.beta .group-members-list li:not(.picked) .member-name { flex: 1 1 100%; }
html.beta .group-members-list .student-tags {
    flex: 1 1 100%;
    justify-content: flex-start;
}

/* ── Skrift i knapper og felter ─────────────────────────────────────────────
   Knapper og felter bruger browserens egen skrift (Arial) i stedet for
   siden, medmindre en klasse selv sætter den. Her arver de. `:where()` gør
   reglen svagere end enhver klasse, så de steder der med vilje er mono
   (stepperens tal, mærker) beholder det. */
:where(html.beta) :where(button, input, select, textarea) { font-family: inherit; }

/* ── Bundlinjen: én størrelse, og Gem er blød ───────────────────────────────
   36 px / radius 8 som knapperne i bjælken øverst, i Elevliste og i vinduerne.
   Gem var fyldt blå ved siden af "Dan grupper igen" — to hovedhandlinger på
   samme skærm. Dan grupper er hovedhandlingen; Gem er en blød knap. */
html.beta .floating-action-bar .action-pill-group :is(.action-pill, .trash-zone-floating) {
    block-size: 36px;
    border-radius: 8px;
}
html.beta .floating-action-bar .action-pill.icon-only,
html.beta .floating-action-bar .trash-zone-floating { inline-size: 36px; }
html.beta .floating-action-bar .action-pill.primary-pill {
    background: var(--paper-3);
    color: var(--ink);
    box-shadow: none;
}
html.beta .floating-action-bar .action-pill.primary-pill:hover:not(:disabled) {
    background: var(--rule);
    color: var(--ink);
}

/* ── Matrix: samme luft under bjælken som stamgrupperne ─────────────────────
   #matrix-display nulstiller sin polstring (assets/style.css, specificitet
   med id), så de 12 px som .group-grid får i BetaGroupsTab faldt væk. */
html.beta #matrix-display { padding-block-start: 12px; }

/* ── Tom tilstand i Grupper ─────────────────────────────────────────────────
   Før der er grupper: ikke en stiplet grå kasse, men tekst direkte på arket
   — som Historiks tomme tilstand (screens/historik-filer.css). */
html.beta .group-grid .empty-state {
    background: transparent;
    border: 0;
    border-radius: 0;
    padding-block: 96px;
    gap: 6px;
    color: var(--ink-3);
}
html.beta .group-grid .empty-state > svg {
    color: var(--ink-4);
    /* `!important` fordi ikonets opacity står i et style-attribut i markup'en */
    opacity: 1 !important;
    stroke-width: 1.5;
    margin-block-end: 10px;
}
html.beta .group-grid .empty-state strong { color: var(--ink); font-size: 15px; font-weight: 600; }
html.beta .group-grid .empty-state span { color: var(--ink-3); font-size: 13px; line-height: 1.6; }
html.beta .group-grid .empty-state span strong { font-size: inherit; color: var(--ink-2); }
/* "… eller gendan grupper": en tekstknap, ikke en knap med ramme og flade */
html.beta .group-grid .empty-restore-btn {
    margin-block-start: 10px;
    padding: 6px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink-2);
    font-size: 13px;
    font-weight: 500;
}
html.beta .group-grid .empty-restore-btn:hover:not(:disabled) { background: var(--paper-3); color: var(--ink); }

/* ── Menuer der svæver (Del, Optag og afspil, kørselshistorik) ──────────────
   Samme udseende som opskriftens menuer (.rtok__pop): papir, 1 px hårlinje,
   radius 12 og den samme lille skygge. Ikoner i ink-3, ikke blå, og ingen
   knapper med ramme inde i dem. Menuernes egen stil er scoped (0,2,0); disse
   har en prik mere. */
html.beta .share-menu,
html.beta .replay-menu,
html.beta .run-menu {
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 12px;
    box-shadow: 0 12px 32px oklch(0 0 0 / 12%);
}
html.beta .share-menu .arrow,
html.beta .replay-menu .arrow,
html.beta .run-menu .arrow {
    background: var(--paper);
    border-color: var(--rule);
}
html.beta .share-menu .share-item { border-color: transparent; }
html.beta .share-menu .share-item:hover:not(:disabled),
html.beta .share-menu .share-item:focus-visible {
    background: var(--paper-2);
    border-color: transparent;
}
html.beta .share-menu .share-icon { color: var(--ink-3); }
html.beta .share-menu .share-title { font-size: 13px; font-weight: 600; color: var(--ink); }
html.beta .share-menu .share-desc { font-size: 12px; color: var(--ink-3); }
html.beta .share-menu .share-sep { background: var(--rule); }
html.beta .share-menu .share-heading {
    font: 500 10px var(--mono, 'JetBrains Mono', ui-monospace, Menlo, monospace);
    letter-spacing: 0.14em;
    color: var(--ink-3);
}
/* Valget af gruppesæt: samme segment som i opskriftens menuer (.recipe-seg) —
   blød bund, den valgte er en hvid flade med ink-tekst, ikke fyldt blå */
html.beta .share-menu .seg {
    border: 0;
    border-radius: 8px;
    background: var(--paper-3);
    padding: 3px;
    gap: 2px;
}
html.beta .share-menu .seg-opt {
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--ink-3);
}
html.beta .share-menu .seg-opt.checked {
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 1px 2px oklch(0 0 0 / 8%);
}
/* Optag og afspil: knapperne er bløde flader uden ramme */
html.beta .replay-menu .start,
html.beta .replay-menu .btn {
    border: 0;
    border-radius: 8px;
    background: var(--paper-3);
    color: var(--ink);
}
html.beta .replay-menu .start:hover:not(:disabled),
html.beta .replay-menu .btn:hover:not(:disabled) { background: var(--rule); }
/* Kørselshistorik: tallene er bløde felter, den valgte har en let tone */
html.beta .run-menu .chip {
    border-radius: 8px;
    border-color: transparent;
}
html.beta .run-menu .chip:hover,
html.beta .run-menu .chip:focus-visible {
    background: var(--paper-3);
    border-color: transparent;
    color: var(--ink);
}
html.beta .run-menu .chip.active {
    background: var(--paper-3);
    border-color: transparent;
    color: var(--ink);
    font-weight: 700;
}
html.beta .run-menu .chip.active .dot { background: color-mix(in oklch, var(--color-warning), var(--ink) 40%); }
html.beta .run-menu .k-back,
html.beta .run-menu .k-alt {
    border: 0;
    border-radius: 8px;
    background: var(--paper-3);
    color: var(--ink-2);
}
html.beta .run-menu .k-back:hover,
html.beta .run-menu .k-alt:hover { background: var(--rule); color: var(--ink); border-color: transparent; }
html.beta .run-menu .btn-primary-confirm { border: 0; border-radius: 8px; }

/* ── Nyheder (NewsDialog.vue) ───────────────────────────────────────────────
   Samme sprog som de andre vinduer: papir, radius 14, mono-etiket i hovedet,
   hårlinjer mellem nyhederne. Mærkerne ("Ny funktion", "Bugfix") er tekst
   med en lille farvet prik, ikke farvede piller. Stilen er scoped (0,2,0);
   disse har en prik mere. */
html.beta .news-dialog::backdrop {
    background: oklch(0.20 0.012 250 / 28%);
    backdrop-filter: none;
}
html.beta .news-content {
    background: var(--paper);
    border-radius: 14px;
    box-shadow: 0 20px 50px oklch(0 0 0 / 18%);
    color: var(--ink);
}
html.beta .news-content .news-header {
    padding: 20px 24px 4px 28px;
    border-block-end: 0;
}
html.beta .news-content .news-header h2 {
    gap: 10px;
    min-block-size: 32px;
    font: 500 10.5px var(--mono, 'JetBrains Mono', ui-monospace, Menlo, monospace);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-3);
}
html.beta .news-content .news-header h2::before {
    content: "";
    inline-size: 20px;
    block-size: 1px;
    background: var(--primary);
}
/* Etiketten har sin egen blå streg; ikonet ved siden af er overflødigt */
html.beta .news-content .news-header .title-icon { display: none; }
html.beta .news-content .close-btn {
    inline-size: 32px;
    block-size: 32px;
    padding: 0;
    border-radius: 8px;
    justify-content: center;
    align-items: center;
    color: var(--ink-3);
}
html.beta .news-content .close-btn:hover { background: var(--paper-3); color: var(--ink); }
html.beta .news-content .news-intro {
    padding: 8px 28px 0;
    font-size: 14px;
    line-height: 1.55;
    color: var(--ink-2);
}
/* Luft og en hårlinje under filteret, så listen ikke ser ud til at glide ind
   under knapperne, når man ruller. */
html.beta .news-content .news-filter { padding: 12px 28px; gap: 4px; border-block-end: 1px solid var(--rule); }
/* Filteret: stille bløde knapper — den valgte er en let flade med ink-tekst */
html.beta .news-content .filter-btn {
    border: 0;
    border-radius: 8px;
    padding: 6px 10px;
    background: transparent;
    color: var(--ink-3);
    font-size: 13px;
    font-weight: 500;
}
html.beta .news-content .filter-btn:hover:not(.active) { background: var(--paper-3); color: var(--ink); }
html.beta .news-content .filter-btn.active { background: var(--paper-3); color: var(--ink); font-weight: 600; }
html.beta .news-content .filter-note { color: var(--ink-3); }
html.beta .news-content .news-list { padding: 12px 28px 24px; }
html.beta .news-content .news-entry { border-block-end: 1px solid var(--rule); }
html.beta .news-content .news-entry:last-child { border-block-end: 0; }
html.beta .news-content .news-date {
    font: 500 11px var(--mono, 'JetBrains Mono', ui-monospace, Menlo, monospace);
    letter-spacing: 0.02em;
    color: var(--ink-3);
}
html.beta .news-content .news-entry .news-tag,
html.beta .news-content .news-entry.is-fix .news-tag {
    padding: 0;
    border-radius: 0;
    background: transparent;
    gap: 6px;
    font: 500 10px var(--mono, 'JetBrains Mono', ui-monospace, Menlo, monospace);
    letter-spacing: 0.12em;
    color: var(--ink-3);
}
html.beta .news-content .news-tag svg { display: none; }
html.beta .news-content .news-tag::before {
    content: "";
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--primary);
}
html.beta .news-content .news-entry.is-fix .news-tag::before { background: var(--color-warning); }
html.beta .news-content .news-entry h3 { font-size: 14px; font-weight: 600; color: var(--ink); }
html.beta .news-content .news-entry p,
html.beta .news-content .news-items { font-size: 13px; color: var(--ink-2); }
html.beta .news-content .news-items li::marker { color: var(--ink-4); }
</style>
