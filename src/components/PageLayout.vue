
<template>
  <div class="page-container">
    <slot></slot>
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px;
  max-inline-size: 900px; /* Samme bredde på alle infosider */
  margin-inline: auto;
  line-height: 1.6;
}

/* Fælles stil for infosiderne, så de ligner hinanden */
:deep(h1) {
  text-align: center;
  margin-block-end: 30px;
  color: var(--text-main);
}

:deep(h2) {
  color: var(--text-main);
  margin-block-start: 0;
}

:deep(p) {
  color: var(--text-muted);
}

/* Sidens titel, undertitel og links — ens på Hjælp, guiden og GDPR.
   Stod før ord for ord i alle tre sider (scoped, så de ikke kunne dele). */
:deep(.view-title) {
    margin-top: 0;
    color: var(--text-heading);
    display: flex;
    align-items: center;
    gap: 8px;
}
:deep(.title-icon) { vertical-align: -4px; }

:deep(.view-subtitle) {
    font-size: 1.1em;
    color: var(--text-muted);
    margin-bottom: 30px;
}

:deep(.content-link) {
    color: var(--text-link);
    text-decoration: none;
    font-weight: 500;
}
:deep(.content-link:hover) { text-decoration: underline; }

:deep(.card) {
  background: var(--bg-surface);
  border: 1px solid var(--border-medium);
  border-radius: 8px;
  padding: 30px;
  margin-block-end: 30px;
  /* Skyggen SKAL komme fra tokenet, ikke fra en fast rgba. Her stod
     "0 1px 3px rgba(0,0,0,0.2)" — en mørk-tema-værdi, der lå fast i BEGGE
     temaer. Hjælp, guiden og GDPR-siden er de tre eneste flader, der bruger
     PageLayout, og deres kort stod derfor under en skygge 2,5 gange så
     kraftig som alle andre kort i lyst tema (0,20 mod 0,08) — og en
     LETTERE end de andre i mørkt (0,20 mod 0,25). (Gennemsyn 2026-09-06.) */
  box-shadow: var(--shadow-card);
}
</style>
