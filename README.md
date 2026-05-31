# Site Grile

Site static pentru rezolvat grile cu progres salvat în browser. Întrebările stau separat în `data/grile.js`, ca să poți schimba rapid materia.

## Rulează local

```bash
python3 -m http.server 4173
```

Apoi deschide `http://localhost:4173`.

## Adaugă alt set

În `data/grile.js`, adaugă încă un obiect în `window.QUIZ_PACKS` cu forma:

```js
{
  id: "materie-noua",
  title: "Materie nouă",
  subject: "Semestrul 2",
  source: "fisier.pdf",
  questions: [
    {
      id: 1,
      text: "Întrebarea?",
      options: ["A", "B", "C", "D", "E"],
      answerIndex: 0
    }
  ]
}
```

Pentru DOCX-uri în care răspunsurile corecte sunt italic și highlighted:

```bash
/Users/raresselaru/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 tools/extract-highlighted-docx-quiz.py "/cale/catre/grile.docx" --title "Managementul Vânzărilor" --output data/grile.js
```

Pentru PDF-uri similare, unde răspunsurile corecte sunt bold:

```bash
/Users/raresselaru/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 tools/extract-bold-pdf-quiz.py /cale/catre/grile.pdf --title "Titlu materie" --output data/grile.js
```
