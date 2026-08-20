#!/usr/bin/env python3
"""Lightweight secret-leak scanner for local pre-commit and CI.

This is a defense-in-depth check, not a replacement for gitleaks/trufflehog.
It scans staged files (or the files given on the command line) for common
high-entropy secret patterns and known token formats.

Exit codes:
    0 - no suspicious strings found
    1 - potential secrets detected
    2 - runtime error
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Iterable

logging.basicConfig(level=logging.INFO, format="%(message)s")
_logger = logging.getLogger(__name__)

# File/path patterns that are never scanned.
ALLOWLIST_PATHS = {
    re.compile(r"\.env\.example$"),
    re.compile(r"(^|/)(node_modules|\.venv|venv|__pycache__|\.git|dist|build|\.pytest_cache)/"),
    re.compile(r"\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|mp4|webm|zip|tar|gz|sqlite3?)$"),
    re.compile(r"(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|Gemfile\.lock)$"),
    # Planning/docs artifacts contain git shas, filenames and masked values that
    # look like secrets but are not actual credentials.
    re.compile(r"(^|/)\.planning/"),
    re.compile(r"(^|/)docs/"),
    re.compile(r"(^|/)\.github/workflows/deploy-"),
    re.compile(r"(^|/)(archive|backups|server-backup)/"),
}

# Lines that match these patterns are allowed even if they look like secrets.
# Used for example files, tests that intentionally use dummy values, etc.
ALLOWLIST_LINES = {
    # Example/placeholder values
    re.compile(r"^[A-Z_]*(SECRET|TOKEN|KEY|PASSWORD)=\s*$"),
    re.compile(r"^[A-Z_]*(SECRET|TOKEN|KEY|PASSWORD)=\s*#"),
    # Comments describing env vars
    re.compile(r"^\s*#.*\b(secret|token|key|password)\b", re.IGNORECASE),
    # Test fixtures with obviously fake values
    re.compile(r"\b(test-secret|unit-test-secret|fake-secret|dummy|example|changeme)\b", re.IGNORECASE),
    # AWS well-known example access key ID (used in scanner self-tests).
    re.compile(r"AKIAIOSFODNN7EXAMPLE"),
}

# Patterns that indicate a likely secret. Each tuple is (name, regex).
SECRET_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("AWS access key ID", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    (
        "AWS secret access key",
        re.compile(
            r"(?i)(aws[_-]?secret[_-]?access[_-]?key|secret[_-]?access[_-]?key|aws[_-]?secret)\s*[=:]\s*['\"]?[A-Za-z0-9/+=]{40}['\"]?"
        ),
    ),
    (
        "private key block",
        re.compile(r"-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----"),
    ),
    ("GitHub classic token", re.compile(r"\bghp_[A-Za-z0-9_]{36}\b")),
    ("GitHub fine-grained token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{22}_[A-Za-z0-9]{59}\b")),
    ("GitHub OAuth token", re.compile(r"\bgho_[A-Za-z0-9_]{36}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}(-[a-zA-Z0-9]{24})?\b")),
    ("OpenAI API key", re.compile(r"\bsk-[a-zA-Z0-9]{20,48}\b")),
    ("DeepSeek API key", re.compile(r"\bds-[a-zA-Z0-9]{20,64}\b")),
    (
        "generic high-entropy secret assignment",
        re.compile(
            r"(?i)(api[_-]?key|secret[_-]?key|auth[_-]?token|access[_-]?token|"
            r"private[_-]?key|password|passwd|pwd)\s*[=:]\s*['\"][A-Za-z0-9_\-]{32,}['\"]"
        ),
    ),
]

# Generic high-entropy heuristic: base64-ish strings that are too long to be
# random code identifiers and sit next to secret-looking keywords.
HIGH_ENTROPY_RE = re.compile(
    r"(?i)\b(api[_-]?key|secret[_-]?key|auth[_-]?token|access[_-]?token|"
    r"private[_-]?key|secret|token|password)\b\s*[=:]\s*['\"]?"
    r"([A-Za-z0-9_\-/+=]{32,})['\"]?"
)


def _is_allowlisted(path: Path, line: str) -> bool:
    path_s = str(path).replace("\\", "/")
    for pattern in ALLOWLIST_PATHS:
        if pattern.search(path_s):
            return True
    for pattern in ALLOWLIST_LINES:
        if pattern.search(line):
            return True
    return False


def _list_staged_files() -> list[Path]:
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git failed: {result.stderr}")
    paths: list[Path] = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if line:
            paths.append(Path(line))
    return paths


MAX_FILE_SIZE = 1 * 1024 * 1024  # Skip files larger than 1 MB in CI scans.


def _scan_file(path: Path) -> list[tuple[int, str, str]]:
    findings: list[tuple[int, str, str]] = []
    try:
        size = path.stat().st_size
    except Exception as exc:
        _logger.warning("Could not stat %s: %s", path, exc)
        return findings
    if size > MAX_FILE_SIZE:
        _logger.debug("Skipping large file %s (%d bytes)", path, size)
        return findings
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        _logger.warning("Could not read %s: %s", path, exc)
        return findings

    for lineno, raw_line in enumerate(text.splitlines(), start=1):
        if _is_allowlisted(path, raw_line):
            continue
        line = raw_line.strip()
        if not line:
            continue
        for name, pattern in SECRET_PATTERNS:
            if pattern.search(line):
                findings.append((lineno, name, line))
                break
        else:
            match = HIGH_ENTROPY_RE.search(line)
            if match:
                value = match.group(2)
                # Skip lines that are clearly not secrets (e.g. environment variable
                # declarations without a value, or short placeholders).
                if len(value) >= 32 and not re.search(r"\b(example|dummy|test|fake|changeme)\b", value, re.IGNORECASE):
                    findings.append((lineno, "high-entropy secret-like value", line))
    return findings


def _scan_files(paths: Iterable[Path]) -> dict[Path, list[tuple[int, str, str]]]:
    results: dict[Path, list[tuple[int, str, str]]] = {}
    for path in paths:
        if not path.is_file():
            continue
        findings = _scan_file(path)
        if findings:
            results[path] = findings
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scan files for potential secret leaks.")
    parser.add_argument(
        "files",
        nargs="*",
        help="Files to scan. If omitted, scans git staged files.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Scan all tracked files (CI mode).",
    )
    args = parser.parse_args(argv)

    if args.all:
        result = subprocess.run(
            ["git", "ls-files"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            _logger.error("git ls-files failed: %s", result.stderr)
            return 2
        files = [Path(line.strip()) for line in result.stdout.splitlines() if line.strip()]
    elif args.files:
        files = [Path(f) for f in args.files]
    else:
        try:
            files = _list_staged_files()
        except RuntimeError as exc:
            _logger.error("%s", exc)
            return 2

    if not files:
        _logger.info("No files to scan.")
        return 0

    results = _scan_files(files)
    if not results:
        _logger.info("No potential secrets found in %d file(s).", len(files))
        return 0

    _logger.error("Potential secrets detected:")
    total = 0
    for path, findings in sorted(results.items(), key=lambda x: str(x[0])):
        for lineno, name, line in findings:
            total += 1
            # Mask the suspected value so we never re-print a real secret.
            masked = re.sub(r"[A-Za-z0-9_\-/+=]{16,}", lambda m: m.group(0)[:4] + "***" + m.group(0)[-4:], line)
            _logger.error("  %s:%d  %s  %s", path, lineno, name, masked)
    _logger.error("%d finding(s) in %d file(s).", total, len(results))
    return 1


if __name__ == "__main__":
    sys.exit(main())
