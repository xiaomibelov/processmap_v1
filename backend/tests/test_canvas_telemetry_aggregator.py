"""Тесты агрегатора витрины canvas_event_read (G1–G6 по TESTS.md контура)."""

from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _raw_event(event_id, kind, ts, session_id="s_1", payload=None):
    return {
        "session_id": session_id,
        "event_id": event_id,
        "seq": 1,
        "ts": ts,
        "kind": kind,
        "project_id": "p_1",
        "user_id": "u_1",
        "org_id": "org_1",
        "payload": payload or {},
    }


def _err_422(event_id, ts, op_type="move"):
    return _raw_event(
        event_id, "error", ts,
        payload={
            "http": {"status": 422, "latencyMs": 87},
            "error": {"code": "OPERATION_UNSUPPORTED", "opId": "op_x", "opType": op_type, "reason": "bpmn_xml_parse_error"},
            "versions": {"clientBase": 41, "clientTracked": 41},
        },
    )


def _err_full_save(event_id, ts, status=409, code="DIAGRAM_STATE_CONFLICT"):
    """Ошибка full-save пути (P1 rawXml): pipeline-поле, versions без serverAck."""
    return _raw_event(
        event_id, "error", ts,
        payload={
            "http": {"status": status, "latencyMs": 120, "endpoint": "/api/sessions/s_1/bpmn"},
            "save": {"pipeline": "rawXml"},
            "error": {"code": code, "message": "conflict"},
            "versions": {"clientBase": 36, "clientTracked": 36, "serverCurrent": 37},
        },
    )


def _save_status(event_id, ts, state="saved", ops_stage="ops-saved", versions=None):
    payload = {"ux": {"state": state, "opsStage": ops_stage}}
    if versions:
        payload["versions"] = versions
    return _raw_event(event_id, "save_status", ts, payload=payload)


class CanvasTelemetryClassifyTest(unittest.TestCase):
    def setUp(self):
        from app.save_services.canvas_telemetry_aggregator.classify import classify_event

        self.classify = classify_event

    # -- G1: классификация --------------------------------------------------
    def test_classify_ops_422(self):
        cls = self.classify({"kind": "error", "http": {"status": 422}, "error": {"code": "OPERATION_UNSUPPORTED"}})
        self.assertEqual(cls, "ops_422")

    def test_classify_ops_409(self):
        cls = self.classify({"kind": "error", "http": {"status": 409}, "error": {"code": "DIAGRAM_STATE_CONFLICT"}})
        self.assertEqual(cls, "ops_409")

    def test_classify_network(self):
        cls = self.classify({"kind": "error", "http": {"status": 0}})
        self.assertEqual(cls, "network")

    def test_classify_timeout(self):
        cls = self.classify({"kind": "error", "http": {"status": 0, "latencyMs": 10050}})
        self.assertEqual(cls, "timeout")

    def test_classify_non_finite_di(self):
        cls = self.classify({"kind": "error", "error": {"code": "canvas_nonfinite_render_error"}})
        self.assertEqual(cls, "non_finite_di")

    def test_classify_unknown(self):
        cls = self.classify({"kind": "error", "error": {"code": "WAT"}})
        self.assertEqual(cls, "unknown")


class CanvasTelemetryAggregateTest(unittest.TestCase):
    def setUp(self):
        from app.domains.storage.canvas_telemetry import repository as repo

        repo._reset_schema_flag_for_tests()
        self.repo = repo

    def _append(self, rows):
        return self.repo.append_canvas_events(rows)

    def _aggregate(self):
        from app.save_services.canvas_telemetry_aggregator.aggregate import aggregate_pending_sessions

        return aggregate_pending_sessions()

    def _groups(self, session_id="s_1"):
        return self.repo.list_error_groups(session_id=session_id)

    # -- G2: converged=true --------------------------------------------------
    def test_converged_true_when_ack_versions_match(self):
        self._append([
            _raw_event("e1", "command", 1000, payload={"command": {"type": "shape.move"}}),
            _err_422("e2", 1100),
            _raw_event("e3", "ack", 1200, payload={"versions": {"clientTracked": 42, "serverAck": 42}}),
        ])
        self._aggregate()
        groups = self._groups()
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["error_class"], "ops_422")
        self.assertEqual(groups[0]["converged"], 1)

    # -- G3: converged=false -------------------------------------------------
    def test_converged_false_without_ack(self):
        self._append([
            _raw_event("e1", "command", 1000),
            _err_422("e2", 1100),
        ])
        self._aggregate()
        groups = self._groups()
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["converged"], 0)

    def test_converged_false_when_versions_diverge(self):
        self._append([
            _err_422("e1", 1000),
            _raw_event("e2", "ack", 1100, payload={"versions": {"clientTracked": 41, "serverAck": 44}}),
        ])
        self._aggregate()
        self.assertEqual(self._groups()[0]["converged"], 0)

    # -- G4: дедуп/upsert ----------------------------------------------------
    def test_repeat_aggregation_idempotent(self):
        self._append([_err_422("e1", 1000), _err_422("e2", 2000)])
        self._aggregate()
        first = self._groups()
        self._aggregate()
        second = self._groups()
        self.assertEqual(len(first), 1)
        self.assertEqual(len(second), 1)
        self.assertEqual(first[0]["id"], second[0]["id"])
        self.assertEqual(first[0]["first_seen"], second[0]["first_seen"])
        self.assertEqual(first[0]["count"], second[0]["count"])

    # -- G5: контекст ---------------------------------------------------------
    def test_context_window_ends_with_error(self):
        rows = [_raw_event(f"e{i}", "command", 1000 + i) for i in range(25)]
        rows.append(_err_422("e_err", 9999))
        self._append(rows)
        self._aggregate()
        group = self._groups()[0]
        context = json.loads(group["context_json"])
        self.assertLessEqual(len(context), 20)
        self.assertEqual(context[-1]["kind"], "error")

    # -- G6: идемпотентность результата ---------------------------------------
    def test_aggregate_result_stable(self):
        self._append([_err_422("e1", 1000)])
        r1 = self._aggregate()
        r2 = self._aggregate()
        self.assertEqual(r1["sessions"], 1)
        self.assertEqual(r2["sessions"], 0)  # нечего нового обрабатывать
        self.assertEqual(len(self._groups()), 1)


class CanvasTelemetryClassificationTest(unittest.TestCase):
    """F1 (fix/save-telemetry-full-coverage-v1): converged через save_status
    с versions + классификатор «потеря данных vs шум» (поле classification)."""

    def setUp(self):
        from app.domains.storage.canvas_telemetry import repository as repo

        repo._reset_schema_flag_for_tests()
        self.repo = repo

    def _append(self, rows):
        return self.repo.append_canvas_events(rows)

    def _aggregate(self):
        from app.save_services.canvas_telemetry_aggregator.aggregate import aggregate_pending_sessions

        return aggregate_pending_sessions()

    def _groups(self, session_id="s_1"):
        return self.repo.list_error_groups(session_id=session_id)

    # -- converged оживает: save_status с versions ---------------------------
    def test_converged_true_when_save_status_saved_versions_match(self):
        self._append([
            _err_full_save("e1", 1000),
            _save_status("e2", 1100, versions={"clientTracked": 42, "serverAck": 42}),
        ])
        self._aggregate()
        group = self._groups()[0]
        self.assertEqual(group["converged"], 1)

    def test_converged_false_when_save_status_saved_versions_diverge(self):
        self._append([
            _err_full_save("e1", 1000),
            _save_status("e2", 1100, versions={"clientTracked": 41, "serverAck": 44}),
        ])
        self._aggregate()
        self.assertEqual(self._groups()[0]["converged"], 0)

    def test_converged_false_when_save_status_saved_without_versions(self):
        """Старые строки без versions: ветка мертва, converged не выставляется."""
        self._append([
            _err_full_save("e1", 1000),
            _save_status("e2", 1100),
        ])
        self._aggregate()
        self.assertEqual(self._groups()[0]["converged"], 0)

    # -- classification: transient_noise --------------------------------------
    def test_classification_transient_noise_after_ack(self):
        self._append([
            _err_422("e1", 1000),
            _raw_event("e2", "ack", 1100, payload={
                "http": {"status": 200, "latencyMs": 90},
                "versions": {"clientTracked": 41, "serverAck": 44},
            }),
        ])
        self._aggregate()
        self.assertEqual(self._groups()[0]["classification"], "transient_noise")

    def test_classification_transient_noise_after_save_status_saved(self):
        """Подтверждение save_status saved (даже без versions) = шум."""
        self._append([
            _err_full_save("e1", 1000),
            _save_status("e2", 1100),
        ])
        self._aggregate()
        self.assertEqual(self._groups()[0]["classification"], "transient_noise")

    # -- classification: data_loss --------------------------------------------
    def test_classification_data_loss_without_confirmation(self):
        self._append([_err_full_save("e1", 1000)])
        self._aggregate()
        self.assertEqual(self._groups()[0]["classification"], "data_loss")

    def test_classification_data_loss_when_only_ops_local(self):
        """ops-local (offline) — НЕ серверное подтверждение: потеря остаётся."""
        self._append([
            _err_422("e1", 1000),
            _save_status("e2", 1100, state="saved", ops_stage="ops-local"),
        ])
        self._aggregate()
        self.assertEqual(self._groups()[0]["classification"], "data_loss")

    def test_classification_ignores_confirmation_before_error(self):
        self._append([
            _raw_event("e1", "ack", 900, payload={"http": {"status": 200}}),
            _err_422("e2", 1000),
        ])
        self._aggregate()
        self.assertEqual(self._groups()[0]["classification"], "data_loss")

    def test_full_save_error_then_confirm_converged_and_noise(self):
        """Сценарий инцидента: 409 full-save → последующее сохранение подтвердилось."""
        self._append([
            _err_full_save("e1", 1000),
            _save_status("e2", 1100, versions={"clientTracked": 42, "serverAck": 42}),
        ])
        self._aggregate()
        group = self._groups()[0]
        self.assertEqual(group["converged"], 1)
        self.assertEqual(group["classification"], "transient_noise")

    def test_classification_per_group_after_group_last_seen(self):
        """Подтверждение между ошибками двух групп классифицирует только первую."""
        self._append([
            _err_422("e1", 1000, op_type="move"),
            _raw_event("e2", "ack", 1100, payload={"http": {"status": 200}}),
            _err_422("e3", 1200, op_type="resize"),
        ])
        self._aggregate()
        groups = {g["op_type"]: g for g in self._groups()}
        self.assertEqual(groups["move"]["classification"], "transient_noise")
        self.assertEqual(groups["resize"]["classification"], "data_loss")

    def test_classification_recomputed_on_repeat_aggregation(self):
        """Идемпотентность: повторный прогон с новым ack обновляет классификацию."""
        self._append([_err_422("e1", 1000)])
        self._aggregate()
        self.assertEqual(self._groups()[0]["classification"], "data_loss")
        self._append([
            _raw_event("e2", "ack", 1100, payload={"http": {"status": 200}}),
        ])
        self._aggregate()
        self.assertEqual(self._groups()[0]["classification"], "transient_noise")


if __name__ == "__main__":
    unittest.main()
