import { describe, it, expect, afterEach } from 'vitest';
import { createApp, defineComponent, h, ref, nextTick } from 'vue';
import { useModalFocus } from './useModalFocus.js';

// Siden bagved et vindue skal være inert (useModalFocus' syncInert): ellers
// kan en skærmlæsers læsemarkør vandre uden om fokusfælden og ned i siden.
// Det svære er ikke at sætte inert, men at FÅ DET AF IGEN i den rigtige
// rækkefølge — en side, der bliver hængende inert, kan ikke bruges overhovedet.

// Et vindue, som det ser ud i appen: et overlay med en knap, der kalder
// useModalFocus. Monteres på `host`, så vi selv bestemmer, hvor det ligger.
const Modal = defineComponent({
    setup() {
        const el = ref(null);
        useModalFocus(el, { onEscape: () => {} });
        return () => h('div', { ref: el, class: 'modal-overlay', role: 'dialog' }, [h('button', 'OK')]);
    },
});

const apps = [];
function mountModal(host) {
    const app = createApp(Modal);
    app.mount(host);
    apps.push(app);
    return app;
}

// Byg en side som appens: #app med en knap, beskederne og en plads til
// vinduerne (ModalsRoot), plus en <datalist> og et værktøjstip i <body>.
function buildPage() {
    document.body.innerHTML = `
        <div id="app">
            <div class="layout">
                <div id="vue-modals">
                    <div class="notification-container" data-modal-keep></div>
                    <div id="modal-slot"></div>
                </div>
                <main><button id="opener">Åbn</button><div id="grid" inert></div></main>
            </div>
        </div>
        <datalist id="topics-datalist"></datalist>
        <div id="global-tooltip" data-modal-keep></div>
        <div id="body-slot"></div>`;
    const opener = document.getElementById('opener');
    opener.focus();
    return opener;
}

const inertIds = () => [...document.querySelectorAll('[inert]')].map(el => el.id || el.className || el.tagName);

afterEach(() => {
    while (apps.length) apps.pop().unmount();
    document.body.innerHTML = '';
});

describe('useModalFocus — siden bagved er inert', () => {
    it('låser alt uden for vinduet, men ikke vinduet, beskederne eller værktøjstippet', async () => {
        const opener = buildPage();
        mountModal(document.getElementById('modal-slot'));
        await nextTick(); await nextTick();

        const overlay = document.querySelector('.modal-overlay');
        expect(overlay.closest('[inert]')).toBeNull();
        expect(opener.closest('[inert]')).not.toBeNull();         // <main> er inert
        expect(document.getElementById('body-slot').hasAttribute('inert')).toBe(true);
        expect(document.querySelector('.notification-container').hasAttribute('inert')).toBe(false);
        expect(document.getElementById('global-tooltip').hasAttribute('inert')).toBe(false);
        expect(document.getElementById('topics-datalist').hasAttribute('inert')).toBe(false);
        expect(overlay.contains(document.activeElement)).toBe(true);
    });

    it('tager kun sit eget inert af igen og giver fokus tilbage til knappen', async () => {
        const opener = buildPage();
        const app = mountModal(document.getElementById('modal-slot'));
        await nextTick(); await nextTick();

        app.unmount(); apps.pop();
        // Gitteret var inert FØR vinduet (Vue styrer det) — det skal blive ved
        expect(inertIds()).toEqual(['grid']);
        expect(document.activeElement).toBe(opener);
    });

    it('et vindue oven på et andet: lukkes det øverste, låses der for det nederste', async () => {
        buildPage();
        const outer = mountModal(document.getElementById('modal-slot'));
        await nextTick(); await nextTick();
        const outerButton = document.querySelector('.modal-overlay button');
        expect(document.activeElement).toBe(outerButton);

        // Det indre ligger i <body> ved siden af #app (som ConfirmModal)
        const inner = mountModal(document.getElementById('body-slot'));
        await nextTick(); await nextTick();
        expect(document.getElementById('app').hasAttribute('inert')).toBe(true);

        inner.unmount(); apps.splice(apps.indexOf(inner), 1);
        // #app er levende igen, det ydre vindue har fokus, og dets søskende er låst
        expect(document.getElementById('app').hasAttribute('inert')).toBe(false);
        expect(document.activeElement).toBe(outerButton);
        expect(document.querySelector('main').hasAttribute('inert')).toBe(true);

        outer.unmount(); apps.splice(apps.indexOf(outer), 1);
        expect(inertIds()).toEqual(['grid']);
    });

    it('åbnet og lukket i samme øjeblik efterlader ingen inert side', async () => {
        buildPage();
        const app = mountModal(document.getElementById('modal-slot'));
        app.unmount(); apps.pop();           // før useModalFocus' nextTick
        await nextTick(); await nextTick();
        expect(inertIds()).toEqual(['grid']);
    });
});
