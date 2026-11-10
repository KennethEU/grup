// Motoren i en Web Worker, som i Grupper. Hvilken udgave (before, swap, after)
// står i adressen: bench-worker.js?engine=after
const version = new URL(self.location.href).searchParams.get('engine');
const { run } = await import(`./${version}/engine/engine.js`);
self.onmessage = async (event) => {
  const t0 = performance.now();
  const answer = await run(event.data, { onProgress: () => {}, isCancelled: () => false });
  self.postMessage({ status: answer.status, cores: answer.stats?.cores ?? null, attempts: answer.stats?.attempts ?? null, ms: performance.now() - t0, detail: answer.detail || null });
};
self.postMessage({ ready: true });
