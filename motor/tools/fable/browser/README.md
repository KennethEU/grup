# Før og efter i browseren

`bench.html` kører hvert input som appen (uden frø, appens budget, motoren i
en Web Worker, der selv starter én worker pr. kerne) tre gange med hver udgave
af motoren og viser medianen.

Siden forventer denne mappe ved siden af sig (lav den i en midlertidig mappe):

```
index.html          ← bench.html
bench-worker.js
server.cjs
before/engine/      ← motoren før (fx `git archive 76dddaca engine`)
swap/engine/        ← motoren med det hurtige bytte (4687b440)
after/engine/       ← motoren nu
testdata/           ← de input, siden nævner (sæt 2's hedder s2-<navn>)
```

Start `node server.cjs 5311`, og åbn http://localhost:5311/. Fanen skal være
synlig: en skjult fane kan bremse timere og workers.
