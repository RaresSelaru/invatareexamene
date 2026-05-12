# Site grile

Site static pentru rezolvat grile cu progres salvat în browser. Întrebările stau separat în `data/grile.js`, ca să poți adăuga rapid alte materii.

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

Pentru PDF-uri similare, unde răspunsurile corecte sunt bold, extractorul poate genera fișierul de date:

```bash
/Users/raresselaru/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 tools/extract-bold-pdf-quiz.py /cale/catre/grile.pdf --title "Titlu materie" --output data/grile.js
```
