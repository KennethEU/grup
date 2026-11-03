import { reactive } from 'vue';
import { state } from './state.js';

export const modalState = reactive({
    showCategory: false,
    showSaveSession: false,
    showLatecomer: false,
    showSaveColumn: false,
    showDeleteColumn: false,
    showCopyOptions: false,
    showPreviewSession: false,
    previewSessionId: '',
    showColumnOrder: false,
    // Kolonnen der skal rangeres. Sættes når vinduet åbnes fra en advarsel om
    // netop den kolonne — ellers tomt, og læreren vælger selv.
    columnOrderColumn: '',
    // Rækkefølgen på SPALTERNE i elevlisten. Ikke det samme som
    // showColumnOrder ovenfor, der handler om værdierne inde i én kolonne.
    showColumnLayout: false,
    showRestoreGroups: false,
    // Hvilken fane "Gendan grupper" åbner på. Tom-tilstanden i gruppepanelet
    // åbner direkte på 'column', fordi der ER ingen grupper at kopiere endnu.
    restoreGroupsTab: 'text',
    // Åbnede opskriften Aftaler-vinduet? Så skal opskriften åbne igen, når
    // Aftaler lukkes — ellers står læreren på siden uden den, hun kom fra.
    agreementsReturnToRecipe: false
});

export const modalActions = {
    openCategory: () => { modalState.showCategory = true; },
    closeCategory: () => { modalState.showCategory = false; },

    openSaveSession: () => { modalState.showSaveSession = true; },
    closeSaveSession: () => { modalState.showSaveSession = false; },

    openLatecomer: () => { modalState.showLatecomer = true; },
    closeLatecomer: () => { modalState.showLatecomer = false; },

    openSaveColumn: () => { modalState.showSaveColumn = true; },
    closeSaveColumn: () => { modalState.showSaveColumn = false; },

    openDeleteColumn: () => { modalState.showDeleteColumn = true; },
    closeDeleteColumn: () => { modalState.showDeleteColumn = false; },

    openCopyOptions: () => { modalState.showCopyOptions = true; },
    closeCopyOptions: () => { modalState.showCopyOptions = false; },

    openPreviewSession: (sessionId) => {
        modalState.previewSessionId = sessionId;
        modalState.showPreviewSession = true;
    },
    closePreviewSession: () => { modalState.showPreviewSession = false; },

    openRestoreGroups: (tab = 'text') => {
        modalState.restoreGroupsTab = tab === 'column' ? 'column' : 'text';
        modalState.showRestoreGroups = true;
    },
    closeRestoreGroups: () => { modalState.showRestoreGroups = false; },

    openColumnLayout: () => { modalState.showColumnLayout = true; },
    closeColumnLayout: () => { modalState.showColumnLayout = false; },

    openColumnOrder: (column = '') => {
        modalState.columnOrderColumn = column || '';
        modalState.showColumnOrder = true;
    },
    closeColumnOrder: () => { modalState.showColumnOrder = false; },

    // Aftaler-vinduet er ÉT vindue med to faner. Begge menupunkter skal føre
    // derhen; ellers ligger undgåelserne i et andet vindue end aftalerne, og
    // kun det ene af dem er dækket af Escape-testen. Tilstanden står i
    // state (ikke modalState), fordi classMemory nulstiller den ved klasseskift.
    //
    // `highlight` er elev-id'er: de aftaler, der rører dem, markeres og rulles
    // frem. Bruges af advarslen over grupperne ("Vis aftalen"), så læreren ikke
    // selv skal lede efter den aftale, advarslen handler om.
    openAgreements: (tab = 'together', highlight = [], returnToRecipe = false) => {
        modalState.agreementsReturnToRecipe = returnToRecipe;
        state.agreementTab = tab === 'separate' ? 'separate' : 'together';
        state.agreementHighlight = [...highlight].map(id => String(id).trim());
        state.showAgreementsModal = true;
    },

    // Luk alle vinduerne i ModalsRoot på én gang. Bruges, når browserens
    // Tilbage/Frem skifter fane (AppTopbar's onPopState): knappen, et swipe og
    // Alt+← sender intet tryk ind i siden, så vinduet blev ellers stående over
    // den nye fane — fx "Gendan grupper" over Elevlisten, hvor gendannelsen
    // skiftede grupperne ud, uden at læreren kunne se dem.
    //
    // Aftaler lukkes HER og ikke gennem closeAgreements() i ModalsRoot: kom
    // læreren fra opskriften, åbner den opskriften igen bagefter — og så ville
    // Tilbage ende med opskriften i stedet for den side, læreren bad om.
    closeAll: () => {
        for (const key of Object.keys(modalState)) {
            if (key.startsWith('show')) modalState[key] = false;
        }
        modalState.agreementsReturnToRecipe = false;
        state.showAgreementsModal = false;
        state.agreementHighlight = [];
    }
};
