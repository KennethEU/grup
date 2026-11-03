import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { notificationState, notificationActions } from './notificationState.js';

describe('notificationState', () => {
    beforeEach(() => {
        // Clear all notifications
        while (notificationState.notifications.length > 0) {
            notificationActions.remove(notificationState.notifications[0].id);
        }
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starter uden beskeder', () => {
        expect(notificationState.notifications.length).toBe(0);
    });

    it('add() opretter en besked', () => {
        notificationActions.add('Test message', 'info', 0);
        expect(notificationState.notifications.length).toBe(1);
        expect(notificationState.notifications[0].message).toBe('Test message');
        expect(notificationState.notifications[0].type).toBe('info');
    });

    it('remove() sletter en besked ud fra id', () => {
        notificationActions.add('Msg', 'info', 0);
        const id = notificationState.notifications[0].id;
        notificationActions.remove(id);
        expect(notificationState.notifications.length).toBe(0);
    });

    it('remove() med et ukendt id gør intet', () => {
        notificationActions.add('Msg', 'info', 0);
        notificationActions.remove(99999);
        expect(notificationState.notifications.length).toBe(1);
    });

    it('forsvinder selv efter sin varighed', () => {
        notificationActions.add('Temp', 'info', 1000);
        expect(notificationState.notifications.length).toBe(1);

        vi.advanceTimersByTime(1000);
        expect(notificationState.notifications.length).toBe(0);
    });

    it('notifySuccess giver typen success og 5 sek.', () => {
        notificationActions.notifySuccess('Great!');
        expect(notificationState.notifications[0].type).toBe('success');

        vi.advanceTimersByTime(4999);
        expect(notificationState.notifications.length).toBe(1);

        vi.advanceTimersByTime(1);
        expect(notificationState.notifications.length).toBe(0);
    });

    it('notifyError bliver stående, til læreren lukker den', () => {
        // Fejl auto-forsvinder bevidst IKKE (duration 0): vigtige beskeder
        // skal kunne læses i ro. Kun manuel remove() fjerner dem.
        notificationActions.notifyError('Oops!');
        expect(notificationState.notifications[0].type).toBe('error');

        vi.advanceTimersByTime(60_000);
        expect(notificationState.notifications.length).toBe(1);

        notificationActions.remove(notificationState.notifications[0].id);
        expect(notificationState.notifications.length).toBe(0);
    });

    it('notifyInfo står mindst 8 sek. ved korte beskeder', () => {
        notificationActions.notifyInfo('FYI'); // 3 tegn → max(8000, 180) = 8000
        expect(notificationState.notifications[0].type).toBe('info');

        vi.advanceTimersByTime(7999);
        expect(notificationState.notifications.length).toBe(1);

        vi.advanceTimersByTime(1);
        expect(notificationState.notifications.length).toBe(0);
    });

    it('notifyInfo står længere jo længere beskeden er (60 ms pr. tegn)', () => {
        const msg = 'x'.repeat(200); // 200 × 60 = 12000ms > 8000-minimum
        notificationActions.notifyInfo(msg);

        vi.advanceTimersByTime(11_999);
        expect(notificationState.notifications.length).toBe(1);

        vi.advanceTimersByTime(1);
        expect(notificationState.notifications.length).toBe(0);
    });

    it('forlænger ældre beskeder, så ingen forsvinder før en nyere', () => {
        notificationActions.add('Kort', 'info', 1000);
        notificationActions.add('Lang', 'info', 5000);

        // 'Kort' ville være udløbet ved 1000ms, men forlænges til 'Lang's udløb
        vi.advanceTimersByTime(4999);
        expect(notificationState.notifications.length).toBe(2);

        vi.advanceTimersByTime(1);
        expect(notificationState.notifications.length).toBe(0);
    });

    it('den nyeste besked skubbes aldrig ud af sin egen ankomst', () => {
        // Fejl er klæbende, så fem af dem på skærmen er en almindelig
        // eftermiddag. Før åd den nye besked sig selv: den var den eneste af
        // sin slags og blev derfor fundet som "den mindst værdifulde".
        for (let i = 1; i <= 5; i++) notificationActions.notifyError('Fejl ' + i);
        notificationActions.notifySuccess('Grupperne er dannet');

        expect(notificationState.notifications.length).toBe(5);
        expect(notificationState.notifications.some(n => n.message === 'Grupperne er dannet')).toBe(true);
        // Den ældste fejl er den, der gav plads.
        expect(notificationState.notifications.some(n => n.message === 'Fejl 1')).toBe(false);
    });

    it('en fejl, der bliver stående, overlever en byge af info-beskeder', () => {
        notificationActions.notifyError('Reglerne kan ikke opfyldes');
        for (let i = 1; i <= 5; i++) notificationActions.notifyInfo('Info ' + i);

        expect(notificationState.notifications.length).toBe(5);
        expect(notificationState.notifications.some(n => n.type === 'error')).toBe(true);
        expect(notificationState.notifications.some(n => n.message === 'Info 5')).toBe(true);
    });

    it('en gentaget besked starter sit ur forfra i stedet for at stå to gange', () => {
        notificationActions.add('Vælg mindst én elev', 'info', 8000);
        vi.advanceTimersByTime(7000);

        notificationActions.add('Vælg mindst én elev', 'info', 8000);
        expect(notificationState.notifications.length).toBe(1);

        // Uden omstilling var den væk efter 1000 ms mere.
        vi.advanceTimersByTime(7999);
        expect(notificationState.notifications.length).toBe(1);
        vi.advanceTimersByTime(1);
        expect(notificationState.notifications.length).toBe(0);
    });

    it('en gentaget fejl bliver stadig stående', () => {
        notificationActions.notifyError('Lagerplads fuld');
        notificationActions.notifyError('Lagerplads fuld');
        expect(notificationState.notifications.length).toBe(1);

        vi.advanceTimersByTime(600_000);
        expect(notificationState.notifications.length).toBe(1);
    });

    it('flere beskeder lægger sig oven på hinanden', () => {
        notificationActions.add('A', 'info', 0);
        notificationActions.add('B', 'success', 0);
        notificationActions.add('C', 'error', 0);
        expect(notificationState.notifications.length).toBe(3);
    });

    it('hver besked får sit eget id', () => {
        notificationActions.add('A', 'info', 0);
        notificationActions.add('B', 'info', 0);
        const ids = notificationState.notifications.map(n => n.id);
        expect(new Set(ids).size).toBe(2);
    });

    it('notificationState er skrivebeskyttet (push ignoreres stille)', () => {
        // Vue readonly() silently ignores mutations and emits a dev warning
        const countBefore = notificationState.notifications.length;
        notificationState.notifications.push({ id: 999 });
        // Push is silently blocked — length stays the same
        expect(notificationState.notifications.length).toBe(countBefore);
    });

    it('funktionerne er lagt på window', () => {
        expect(typeof window.notifySuccess).toBe('function');
        expect(typeof window.notifyError).toBe('function');
        expect(typeof window.notifyInfo).toBe('function');
        expect(typeof window.notify).toBe('function');
    });
});
