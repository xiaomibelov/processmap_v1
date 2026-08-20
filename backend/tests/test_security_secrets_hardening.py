"""Regression tests for secrets-hardening fixes (PM-SEC-001, PM-SEC-004, PM-SEC-015, PM-SEC-016)."""

from __future__ import annotations

import base64
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest import mock

import pytest


def _load_scan_secrets_module():
    spec = importlib.util.spec_from_file_location(
        "scan_secrets",
        Path(__file__).resolve().parents[2] / "tools" / "security" / "scan-secrets.py",
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["scan_secrets"] = module
    spec.loader.exec_module(module)
    return module


class TestJwtSecretFailFast:
    """PM-SEC-004: JWT secret must be configured and strong; algorithm is pinned."""

    def test_jwt_secret_missing_raises(self):
        from app.auth import AuthError, jwt_secret

        with mock.patch.dict(os.environ, {"JWT_SECRET": ""}, clear=False):
            with pytest.raises(AuthError, match="JWT_SECRET is not configured"):
                jwt_secret()

    def test_jwt_secret_too_short_raises(self):
        from app.auth import AuthError, jwt_secret

        with mock.patch.dict(os.environ, {"JWT_SECRET": "short"}, clear=False):
            with pytest.raises(AuthError, match="JWT_SECRET is too short"):
                jwt_secret()

    def test_validate_jwt_secret_on_boot_ok(self):
        from app.auth import validate_jwt_secret_on_boot

        # conftest sets a valid test secret.
        validate_jwt_secret_on_boot()

    def test_jwt_rejects_alg_none(self):
        from app.auth import AuthError, _jwt_decode

        # Token with alg=none and a dummy empty signature.
        header = base64.urlsafe_b64encode(
            json.dumps({"alg": "none", "typ": "JWT"}).encode("utf-8")
        ).decode("utf-8").rstrip("=")
        payload = base64.urlsafe_b64encode(
            json.dumps({"sub": "user", "exp": 9999999999, "type": "access"}).encode("utf-8")
        ).decode("utf-8").rstrip("=")
        token = f"{header}.{payload}."
        with pytest.raises(AuthError, match="invalid_algorithm"):
            _jwt_decode(token)

    def test_jwt_rejects_hs512(self):
        from app.auth import AuthError, _jwt_decode

        header = base64.urlsafe_b64encode(
            json.dumps({"alg": "HS512", "typ": "JWT"}).encode("utf-8")
        ).decode("utf-8").rstrip("=")
        payload = base64.urlsafe_b64encode(
            json.dumps({"sub": "user", "exp": 9999999999, "type": "access"}).encode("utf-8")
        ).decode("utf-8").rstrip("=")
        token = f"{header}.{payload}.aaaa"
        with pytest.raises(AuthError, match="invalid_algorithm"):
            _jwt_decode(token)

    def test_jwt_validates_issuer_and_audience(self):
        from app.auth import AuthError, _jwt_decode, create_access_token

        token = create_access_token("user")
        # Should pass with configured iss/aud.
        _jwt_decode(token)

        with mock.patch.dict(os.environ, {"JWT_ISSUER": "other-issuer"}, clear=False):
            with pytest.raises(AuthError, match="invalid_issuer"):
                _jwt_decode(token)


class TestLlmSettingsEncryption:
    """PM-SEC-015/016: persisted LLM settings are encrypted at rest."""

    def test_llm_encryption_key_missing_raises(self):
        from app.settings import validate_llm_encryption_key_on_boot

        with mock.patch.dict(os.environ, {"LLM_SETTINGS_ENCRYPTION_KEY": ""}, clear=False):
            with pytest.raises(RuntimeError, match="LLM_SETTINGS_ENCRYPTION_KEY is not configured"):
                validate_llm_encryption_key_on_boot()

    def test_llm_settings_roundtrip_encrypted(self):
        from app.settings import load_llm_settings, save_llm_settings

        with tempfile.TemporaryDirectory() as tmp:
            old_storage = os.environ.get("PROCESS_STORAGE_DIR")
            os.environ["PROCESS_STORAGE_DIR"] = tmp
            try:
                save_llm_settings("my-secret-api-key", "https://example.com")
                p = Path(tmp) / "_llm_settings.json"
                assert p.exists()
                # File must not contain the plaintext API key.
                raw = p.read_bytes()
                assert b"my-secret-api-key" not in raw

                loaded = load_llm_settings()
                assert loaded["api_key"] == "my-secret-api-key"
                assert loaded["base_url"] == "https://example.com"
            finally:
                if old_storage is None:
                    os.environ.pop("PROCESS_STORAGE_DIR", None)
                else:
                    os.environ["PROCESS_STORAGE_DIR"] = old_storage

    def test_llm_settings_backwards_compatible_plaintext(self):
        from app.settings import load_llm_settings

        with tempfile.TemporaryDirectory() as tmp:
            old_storage = os.environ.get("PROCESS_STORAGE_DIR")
            os.environ["PROCESS_STORAGE_DIR"] = tmp
            try:
                p = Path(tmp) / "_llm_settings.json"
                p.write_text(
                    json.dumps({"api_key": "legacy-key", "base_url": "https://legacy.example.com"}),
                    encoding="utf-8",
                )
                loaded = load_llm_settings()
                assert loaded["api_key"] == "legacy-key"
                assert loaded["base_url"] == "https://legacy.example.com"
            finally:
                if old_storage is None:
                    os.environ.pop("PROCESS_STORAGE_DIR", None)
                else:
                    os.environ["PROCESS_STORAGE_DIR"] = old_storage


class TestSecretLeakScanner:
    """PM-SEC-001: pre-commit/CI secret scanner finds common leak patterns."""

    def test_scanner_flags_aws_key(self):
        scan_secrets = _load_scan_secrets_module()

        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "leak.txt"
            p.write_text("aws_access_key_id = AKIAIOSFODNN7EXAMPLE\n", encoding="utf-8")
            findings = scan_secrets._scan_file(p)
        assert findings
        assert findings[0][1] == "AWS access key ID"

    def test_scanner_allows_env_example_empty_values(self):
        scan_secrets = _load_scan_secrets_module()

        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / ".env.example"
            p.write_text("JWT_SECRET=\nAGENT_SVC_INTERNAL_TOKEN=\n", encoding="utf-8")
            findings = scan_secrets._scan_file(p)
        assert not findings

    def test_scanner_cli_all_mode_passes_on_clean_repo(self):
        repo_root = Path(__file__).resolve().parents[2]
        result = subprocess.run(
            [sys.executable, str(repo_root / "tools" / "security" / "scan-secrets.py"), "--all"],
            cwd=repo_root,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr
