// Som Grupper vil gøre: motoren i en Web Worker. Motoren starter selv sine
// ekstra workers fra engine/worker.js. Beskeden { cancel: true } er Stop.
import { run } from '../../engine/engine.js';

let cancelled = false;

self.onmessage = async (event) => {
  if (event.data && event.data.cancel) {
    cancelled = true;
    return;
  }
  cancelled = false;
  const answer = await run(event.data, {
    onProgress: (p) => self.postMessage(p),
    isCancelled: () => cancelled,
  });
  self.postMessage({
    status: answer.status,
    groups: answer.groups ? answer.groups.length : null,
    members: answer.groups ? answer.groups.reduce((n, g) => n + g.members.length, 0) : null,
    cores: answer.stats?.cores ?? null,
    attempts: answer.stats?.attempts ?? null,
    seconds: answer.stats?.seconds ?? null,
    messages: (answer.messages || []).length,
    detail: answer.detail || null,
  });
};
