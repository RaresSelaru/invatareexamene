#!/usr/bin/env python3
"""Extract multiple-choice questions from DOCX files.

Correct answers are detected when an option contains text that is both italic
and highlighted.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

from docx import Document


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value).strip("-").lower()
    return slug or "quiz-pack"


def clean_text(value: str) -> str:
    value = " ".join(value.replace("\xa0", " ").split())
    replacements = {
        "ordinulului": "ordinului",
        "coclient conţine:": "contul client conţine:",
        "trimp": "timp",
        "creerii": "creării",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    return value


def append_text(existing: str, piece: str) -> str:
    piece = clean_text(piece)
    if not piece:
        return existing
    if not existing:
        return piece
    if existing.endswith(("-", "–")):
        return f"{existing}{piece}"
    return f"{existing} {piece}"


def paragraph_has_correct_mark(paragraph: object) -> bool:
    return any(
        run.italic is True and run.font.highlight_color is not None
        for run in paragraph.runs
        if run.text.strip()
    )


def extract_questions(docx_path: Path) -> list[dict[str, object]]:
    document = Document(docx_path)
    questions: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    current_option: int | None = None

    for paragraph in document.paragraphs:
        text = clean_text(paragraph.text)
        if not text:
            continue

        question_match = re.match(r"^(\d+)\.\s*(.*)$", text)
        option_match = re.match(r"^([a-d])\.\s*(.*)$", text, flags=re.IGNORECASE)

        if question_match:
            if current:
                questions.append(current)
            current = {
                "id": int(question_match.group(1)),
                "text": question_match.group(2).strip(),
                "options": [],
                "_correct_flags": [],
            }
            current_option = None
            continue

        if option_match and current:
            current_option = len(current["options"])
            current["options"].append(option_match.group(2).strip())
            current["_correct_flags"].append(paragraph_has_correct_mark(paragraph))
            continue

        if not current:
            continue

        if current_option is None:
            current["text"] = append_text(str(current["text"]), text)
            continue

        current["options"][current_option] = append_text(
            str(current["options"][current_option]),
            text,
        )
        if paragraph_has_correct_mark(paragraph):
            current["_correct_flags"][current_option] = True

    if current:
        questions.append(current)

    clean_questions: list[dict[str, object]] = []
    problems: list[str] = []

    for expected_id, question in enumerate(questions, start=1):
        correct_flags = question.pop("_correct_flags")
        correct_indexes = [index for index, correct in enumerate(correct_flags) if correct]
        options = question["options"]

        if question["id"] != expected_id:
            problems.append(f"question id {question['id']} appears where {expected_id} was expected")
        if len(options) != 4:
            problems.append(f"question {question['id']} has {len(options)} options")
        if len(correct_indexes) != 1:
            problems.append(f"question {question['id']} has {len(correct_indexes)} marked answers")

        question["answerIndex"] = correct_indexes[0] if len(correct_indexes) == 1 else None
        clean_questions.append(question)

    if problems:
        joined = "\n".join(f"- {problem}" for problem in problems)
        raise ValueError(f"Could not safely extract all questions:\n{joined}")

    return clean_questions


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("docx", type=Path)
    parser.add_argument("--title", default=None)
    parser.add_argument("--subject", default=None)
    parser.add_argument("--id", default=None)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    title = args.title or args.docx.stem
    pack = {
        "id": args.id or slugify(title),
        "title": title,
        "subject": args.subject or title,
        "source": args.docx.name,
        "questions": extract_questions(args.docx),
    }

    payload = "window.QUIZ_PACKS = [\n"
    payload += json.dumps(pack, ensure_ascii=False, indent=2)
    payload += "\n];\n"
    args.output.write_text(payload, encoding="utf-8")

    print(f"Wrote {len(pack['questions'])} questions to {args.output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"extract-highlighted-docx-quiz: {exc}", file=sys.stderr)
        raise SystemExit(1)
