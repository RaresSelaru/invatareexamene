#!/usr/bin/env python3
"""Extract multiple-choice questions from PDFs where correct answers are bold."""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

from pypdf import PdfReader


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value).strip("-").lower()
    return slug or "quiz-pack"


def is_bold(font_dict: object) -> bool:
    if not font_dict:
        return False
    font = str(font_dict.get("/BaseFont") or font_dict.get("/Name") or "")
    return any(token in font.lower() for token in ("bold", "black", "semibold", "demi"))


def add_text(existing: str, piece: str) -> str:
    piece = " ".join(piece.replace("\xa0", " ").split())
    if not piece:
        return existing
    if not existing:
        return piece
    if piece in {"-", "–", "—"}:
        return f"{existing}-"
    if existing.endswith("-"):
        return f"{existing}{piece}"
    if piece[0] in ",.;:!?)]}":
        return f"{existing}{piece}"
    return f"{existing} {piece}"


def extract_questions(pdf_path: Path) -> list[dict[str, object]]:
    reader = PdfReader(str(pdf_path))
    questions: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    current_option: int | None = None
    pending_number_prefix = ""

    def start_question(raw: str) -> None:
        nonlocal current, current_option
        if current:
            questions.append(current)
        match = re.match(r"^(\d+)\.\s*(.*)$", raw)
        if not match:
            raise ValueError(f"Could not parse question heading: {raw}")
        current = {
            "id": int(match.group(1)),
            "text": match.group(2).strip(),
            "options": [],
            "_correct_flags": [],
        }
        current_option = None

    def visitor(text: str, cm: object, tm: object, font_dict: object, font_size: float) -> None:
        nonlocal current, current_option, pending_number_prefix
        raw = " ".join(text.replace("\xa0", " ").split())
        if not raw:
            return

        bold = is_bold(font_dict)

        # Some PDFs split a question number like "21." into "2" + "1. ...".
        if bold and re.fullmatch(r"\d+", raw):
            pending_number_prefix += raw
            return

        if pending_number_prefix:
            if re.match(r"^\d+\.\s*", raw):
                raw = f"{pending_number_prefix}{raw}"
            pending_number_prefix = ""

        question_match = re.match(r"^(\d+)\.\s*(.*)$", raw)
        option_match = re.match(r"^([a-e])\)\s*(.*)$", raw, flags=re.IGNORECASE)

        if question_match:
            start_question(raw)
            return

        if option_match and current:
            body = option_match.group(2).strip()
            current_option = len(current["options"])
            current["options"].append(body)
            current["_correct_flags"].append(bool(bold and body))
            return

        if not current:
            return

        if current_option is None:
            current["text"] = add_text(str(current["text"]), raw)
            return

        current["options"][current_option] = add_text(
            str(current["options"][current_option]),
            raw,
        )
        if bold:
            current["_correct_flags"][current_option] = True

    for page in reader.pages:
        page.extract_text(visitor_text=visitor)

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
        if len(options) != 5:
            problems.append(f"question {question['id']} has {len(options)} options")
        if len(correct_indexes) != 1:
            problems.append(f"question {question['id']} has {len(correct_indexes)} bold answers")

        question["answerIndex"] = correct_indexes[0] if len(correct_indexes) == 1 else None
        clean_questions.append(question)

    if problems:
        joined = "\n".join(f"- {problem}" for problem in problems)
        raise ValueError(f"Could not safely extract all questions:\n{joined}")

    return clean_questions


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--title", default=None)
    parser.add_argument("--subject", default=None)
    parser.add_argument("--id", default=None)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    title = args.title or args.pdf.stem
    pack = {
        "id": args.id or slugify(title),
        "title": title,
        "subject": args.subject or title,
        "source": args.pdf.name,
        "questions": extract_questions(args.pdf),
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
        print(f"extract-bold-pdf-quiz: {exc}", file=sys.stderr)
        raise SystemExit(1)
