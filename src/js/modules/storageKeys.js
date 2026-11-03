// storageKeys.js — navnene på Grupper's nøgler i browserens lager.
//
// ÉT sted for alle navne, så de ikke kan drive fra hinanden. Indtil
// november 2026 hed de noget andet (efter det projekt, Grupper engang byggede
// på). De gamle navne står KUN i migrateStorage.js, som flytter lærerens data
// over til navnene her.
//
// localStorage (bliver, til læreren sletter dem):
//   grupdk_classes               klasselisten (elevrækker, regler, aftaler …)
//   grupdk_groups_<filnavn>      grupperne, som de står lige nu
//   grupdk_topics_<filnavn>      emne pr. gruppe
//   grupdk_history_<filnavn>     listen over gemte sessioner
//   grupdk_session_<id>          den enkelte sessions indhold
//   grupdk_last_class(_index)    hvilken klasse der sidst var åben
//   grupdk_news_filter           filteret i Nyheder
// sessionStorage (kun mens fanen er åben):
//   grupdk_nav_view, grupdk_class_tab, grupdk_storage_warned

export const CLASSES_KEY = 'grupdk_classes';

export const GROUPS_PREFIX = 'grupdk_groups_';
export const TOPICS_PREFIX = 'grupdk_topics_';
export const HISTORY_PREFIX = 'grupdk_history_';
export const SESSION_PREFIX = 'grupdk_session_';

export const LAST_CLASS_KEY = 'grupdk_last_class';
export const LAST_CLASS_INDEX_KEY = 'grupdk_last_class_index';
export const NEWS_FILTER_KEY = 'grupdk_news_filter';

export const NAV_VIEW_KEY = 'grupdk_nav_view';
export const CLASS_TAB_KEY = 'grupdk_class_tab';
export const STORAGE_WARNED_KEY = 'grupdk_storage_warned';
