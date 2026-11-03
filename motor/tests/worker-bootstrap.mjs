// Kun til testene: lader engine/worker.js køre i Node's worker_threads, som
// om det var en Web Worker i browseren (self.onmessage / self.postMessage).
import { parentPort, workerData } from 'node:worker_threads';

const waiting = [];
globalThis.self = {
  postMessage: (m) => parentPort.postMessage(m),
  onmessage: null,
};
parentPort.on('message', (data) => {
  if (globalThis.self.onmessage) globalThis.self.onmessage({ data });
  else waiting.push(data);
});
await import(workerData.url);
for (const data of waiting.splice(0)) globalThis.self.onmessage({ data });
