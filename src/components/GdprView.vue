
<script setup>
import PageLayout from './PageLayout.vue';
import { ShieldCheck, CheckCircle, CloudOff, FolderOpen, Globe, FileText } from 'lucide-vue-next';
import { UI_NAMES } from '../js/modules/beta.js';
</script>

<template>
  <PageLayout id="view-gdpr" class="content-view">
    <div class="card">
        <h2 class="view-title"><ShieldCheck :size="22" class="title-icon" />GDPR &amp; datasikkerhed</h2>
        <p class="view-subtitle">
            Det korte svar: <strong>Elevernes oplysninger forlader aldrig din computer.</strong>
        </p>
        <!-- Privatlivspolitikken står øverst her, bag skjoldet "Privatliv & GDPR"
             i topbjælken. Før lagde den fælles /privacy-link.js et løst felt
             nederst til højre oven på Grupper; det er fjernet (10/11 2026).
             Relativ: grup.dk/privatliv.html (app.js) og dida.dk/grupper/privatliv.html -->
        <p class="content-text">
            <!-- Afstanden står i stilen: Vue fjerner mellemrummet mellem ikonet og
                 linket, når de står på hver sin linje -->
            <FileText :size="15" style="vertical-align:-2px; margin-inline-end:4px;" />
            <a href="privatliv.html" target="_blank" rel="noopener noreferrer"
                class="content-link">Læs privatlivspolitikken for grup.dk</a>
            (åbner i en ny fane).
        </p>

        <div class="feature-grid">
            <div class="feature-box feature-box--green">
                <h3 class="feature-box__title feature-box__title--green">
                    <CheckCircle :size="18" class="feature-icon" />Lokalt lager
                </h3>
                <p class="feature-box__text">Alle elever, klasser og indstillinger gemmes i din browsers <strong>"Local
                        Storage"</strong>. Det er en hukommelse, der kun findes i din browser på denne enhed.
                    Pladsen er omkring 5 MB.</p>
            </div>
            <div class="feature-box feature-box--blue">
                <h3 class="feature-box__title feature-box__title--blue">
                    <CloudOff :size="18" class="feature-icon" />Ingen cloud
                </h3>
                <p class="feature-box__text">Der er ingen server, database eller "sky", der modtager dine data. Selv når du trykker
                    "{{ UI_NAMES.generate }}", sker hele beregningen på din egen processor.</p>
            </div>
        </div>

        <h3 class="section-heading">Intet hentes udefra</h3>
        <p class="content-text">
            <Globe :size="15" style="vertical-align:-2px;" /> Din browser kontakter <strong>ingen andre end
            grup.dk</strong>, når du bruger programmet. Skrifttyper, kode, ikoner og selve gruppemotoren ligger
            her. Motoren er skrevet i JavaScript og kører i din browser. Det betyder også, at værktøjet virker på
            en skole, der blokerer eksterne CDN'er. Det står også i
            <!-- Relativ: grup.dk/privatliv.html (app.js) og dida.dk/grupper/privatliv.html -->
            <a href="privatliv.html" target="_blank" rel="noopener noreferrer"
                class="content-link">privatlivspolitikken</a>.
        </p>

        <h3 class="section-heading">Hvornår slettes data?</h3>
        <ul class="content-list">
            <li><strong>Af sig selv:</strong> Gemte sessioner i Historik ryddes automatisk — der beholdes højst
                50 pr. klasse, og ingen ældre end 90 dage. Selve klasserne og eleverne slettes <em>aldrig</em>
                automatisk.</li>
            <li><strong>Hvis du sletter browser-data:</strong> Rydder du historik/cache (webstedsdata) for grup.dk,
                forsvinder dataene.</li>
            <li><strong>Hvis du bruger "Privat/Inkognito":</strong> Dataene slettes, så snart du lukker
                vinduet. Nogle browsere afviser endda at gemme overhovedet i et privat vindue — så er arbejdet
                væk allerede ved næste genindlæsning. Brug ikke et privat vindue til noget, du vil beholde.</li>
            <li><strong>Manuelt:</strong> Du kan slette klasser enkeltvis i klassevælgeren øverst.</li>
        </ul>

        <h3 class="section-heading">Backup &amp; sikkerhed</h3>
        <p class="content-text">Da data kun ligger her, har vi ingen kopi, hvis din computer går i stykker.
            Brug knappen <strong>"<FolderOpen :size="14" style="vertical-align:-2px;" /> Import &amp; backup"</strong> i topmenuen og vælg "Eksportér" for at downloade en
            backup-fil til din computer, som du kan gemme sikkert (f.eks. på skolens drev).</p>
        <p class="content-text">Backup-filen er <strong>almindelig, ulåst tekst</strong> og indeholder elevernes
            navne og alle de kolonner, du har importeret. Den skal behandles som en klasseliste i et Excel-ark:
            gem den på skolens drev, ikke på en fælles usb-nøgle eller i en tilfældig delt mappe.</p>

        <p class="legal-note">
            Juridisk note: Da data opbevares lokalt på dit udstyr, fungerer dette værktøj ligesom et
            Excel-ark eller Word-dokument. Du er selv dataansvarlig for de oplysninger, du indtaster.
        </p>
    </div>
  </PageLayout>
</template>

<style scoped>
/* Afsnitsoverskrifter, de to bokse og farverne står i infosidernes ark
   (beta/screens/info-sider.css), som vinder over de scoped regler. */
.feature-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
}
@media (max-width: 600px) {
    .feature-grid { grid-template-columns: 1fr; }
}

.feature-box__title {
    margin-top: 0;
    display: flex;
    align-items: center;
    gap: 6px;
}
.feature-icon { flex-shrink: 0; }

.feature-box__text {
    margin: 0;
    font-size: 0.95em;
}

.content-list {
    margin-bottom: 20px;
    padding-left: 20px;
}
.content-list li { margin-bottom: 6px; }

.legal-note {
    margin-top: 30px;
    padding-top: 20px;
    font-style: italic;
    color: var(--text-muted);
    font-size: 0.9em;
}
</style>
