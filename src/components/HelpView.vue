
<script setup>
import { computed } from 'vue';
import PageLayout from './PageLayout.vue';
import { HelpCircle } from 'lucide-vue-next';
import { NEWS } from '../js/modules/news.js';

// Her stod "Version 1.0" hårdkodet. Grupper HAR ikke versionsnumre — tallet
// blev aldrig rørt, mens der kom 218 nyheder, og en lærer der læste det,
// fik at vide at hun sad med den allerførste udgave.
//
// Datoen på den nyeste nyhed kan ikke blive gammel: hver eneste user-facing
// ændring SKAL have en entry (se news.js), så listens top følger altid med
// af sig selv. Kan datoen mod forventning ikke læses, viser vi ingenting
// frem for at gætte.
const lastUpdated = computed(() => {
    const newest = NEWS[0] && NEWS[0].date;
    if (!newest) return '';
    const d = new Date(newest + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('da-DK', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
});
</script>

<template>
  <PageLayout id="view-help" class="content-view">
    <div class="card">
        <h2 class="view-title"><HelpCircle :size="24" class="title-icon" /> Om grup.dk</h2>
        <p class="view-subtitle">
            Intelligent gruppedannelse direkte i din browser — en del af <strong>dida.dk</strong>.
        </p>

      <h2 class="section-heading">Hvordan virker det?</h2>
      <p class="content-text">
          grup.dk danner grupperne med en <strong>gruppemotor i JavaScript</strong>, der kører direkte
          i din browser — på flere af computerens kerner ad gangen. Det betyder, at selvom programmet
          bruger avancerede algoritmer, sker al beregning lokalt hos dig.
      </p>
      <p class="content-text content-text--spaced"><strong>Dine data forlader aldrig din computer.</strong></p>

      <div class="credits-box">
          <h2 class="credits-box__title">Credits &amp; Licens</h2>
          <p class="content-text">
              Motoren, der danner grupperne, er grup.dk's egen. Den er skrevet i JavaScript og kører i din browser.
          </p>
          <p class="content-text">
              grup.dk er fri software under
              <a href="https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12" target="_blank" rel="noopener noreferrer"
                 class="content-link">Den Europæiske Unions Offentlige Licens (EUPL v. 1.2)</a>.
          </p>
          <p class="content-text">
              Tidligere udgaver (indtil november 2026) byggede på open-source projektet <strong>GroupEng</strong> af
              <a href="https://github.com/tdimiduk" target="_blank" rel="noopener noreferrer" class="content-link">Tom Dimiduk</a>
              — med tak til forfatteren.
          </p>
          <p class="ai-credit">
              Teknisk implementering er udført i samarbejde med AI-assistenten
              <strong>Claude</strong> (Anthropic).
          </p>

          <div class="repo-info">
              <p class="repo-info__line repo-info__line--last"><strong>Det tidligere projekt, GroupEng:</strong> <a
                      href="https://github.com/tdimiduk/groupeng" target="_blank" rel="noopener noreferrer"
                      class="content-link">github.com/tdimiduk/groupeng</a></p>
          </div>
      </div>

      <div v-if="lastUpdated" class="version-footer">
          Sidst opdateret {{ lastUpdated }}
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
/* Afsnitsoverskrifter, Credits-boksen og farverne står i infosidernes ark
   (beta/screens/info-sider.css), som vinder over de scoped regler. */
.content-text--spaced {
    margin-bottom: 30px;
}

.ai-credit {
    margin-top: 15px;
    font-style: italic;
    color: var(--text-muted);
    font-size: 0.95em;
}

.repo-info {
    margin-top: 20px;
    font-size: 0.9em;
    color: var(--text-main);
}
.repo-info__line { margin: 0 0 5px 0; }
.repo-info__line--last { margin: 0; }

.version-footer {
    margin-top: 30px;
    padding-top: 20px;
}
</style>
