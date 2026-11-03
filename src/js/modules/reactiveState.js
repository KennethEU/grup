// reactiveState.js - sender tilstanden fra state.js videre.
// state.js eksporterer selv en reactive()-proxy, så filen her er bare et
// andet navn for den samme, som Vue-komponenterne bruger.
//
// Komponenterne kan importere fra begge filer:
//   import { state } from './state.js'           // samme proxy
//   import { reactiveState } from './reactiveState.js'  // samme proxy

import { state } from './state.js';

export const reactiveState = state;
