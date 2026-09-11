"""Workspace TO BE overview (feature/workspace-as-is-tobe-overview) — §7 плана.

Unit + contract тесты агрегации AS IS/TO BE:
- counters/stage_badges/tobe.last_updated_at/tobe_coverage в GET /api/explorer;
- те же поля в дереве сессий (GET /api/projects/{id}/explorer?tree=true)
  и в flat/root_only выборках;
- фильтр ?stage (OR; оба значения = без фильтра; path_only; пустая выборка;
  глобальные counters под фильтром; meta.matched_*);
- deleted_at: живые-only счётчики; удалённая TO BE не даёт to_be у AS IS;
- dismiss баннера через единый /api/users/me/preferences
  (whitelist-ключ explorer.tobe_banner.dismissed_at, CAS, 409 LWW).
- feature flag workspace_tobe_overview default off.

Прогон: python -m pytest tests/test_workspace_tobe_overview.py
"""

import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in __import__("sys").path:
    import sys

    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str, is_admin: bool = False):
        self.state = SimpleNamespace(
            auth_user=user,
            active_org_id=active_org_id,
            org_id=active_org_id,
            is_admin=is_admin,
        )
        self.headers = {}


class WorkspaceTobeOverviewTest(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        from app.auth import create_user
        from app.routers.explorer import (
            CreateFolderBody,
            CreateProjectBody,
            create_folder,
            create_project_in_folder,
            get_explorer_page,
            get_project_explorer,
        )
        from app.storage import (
            get_default_org_id,
            get_storage,
            list_org_workspaces,
            upsert_org_membership,
        )

        self.get_explorer_page = get_explorer_page
        self.get_project_explorer = get_project_explorer

        self.storage = get_storage()
        self.org_id = get_default_org_id()
        self.admin = create_user("tobe_overview_admin@local", "admin", is_admin=True)
        self.admin_id = str(self.admin.get("id") or "")
        upsert_org_membership(self.org_id, self.admin_id, "org_admin")

        self.workspace_id = str(list_org_workspaces(self.org_id)[0].get("id") or "")

        # Дерево: раздел A → (проект P1, папка B → проект P2, проект P3).
        self.section_a = create_folder(
            self.workspace_id,
            CreateFolderBody(name="Раздел А"),
            self._req(self.admin),
        )
        self.section_a_id = str(self.section_a.get("id") or "")
        self.folder_b = create_folder(
            self.workspace_id,
            CreateFolderBody(name="Папка Б", parent_id=self.section_a_id),
            self._req(self.admin),
        )
        self.folder_b_id = str(self.folder_b.get("id") or "")

        self.project_p1 = self._create_project("Проект P1", self.section_a_id)
        self.project_p2 = self._create_project("Проект P2", self.folder_b_id)
        self.project_p3 = self._create_project("Проект P3", self.section_a_id)

        # Сессии:
        #   P1: S1 (as_is) + T1 (to_be, derived от S1)  → проект в обоих контурах
        #   P2: S2 (as_is)                              → только AS IS
        #   P3: S3 (as_is) + T2 (to_be, derived от S3)
        #       S4 (as_is, soft-deleted)                → исключён из счётчиков
        #       S5 (as_is) + T3 (to_be derived от S5, soft-deleted)
        #                                                 → S5 без to_be-бейджа
        self.s1 = self._make_session("S1", self.project_p1)
        self.t1 = self._make_session("T1", self.project_p1, process_layer="to_be", derived_from_session_id=self.s1)
        self.s2 = self._make_session("S2", self.project_p2)
        self.s3 = self._make_session("S3", self.project_p3)
        self.t2 = self._make_session("T2", self.project_p3, process_layer="to_be", derived_from_session_id=self.s3)
        self.s4 = self._make_session("S4 (deleted)", self.project_p3)
        self.s5 = self._make_session("S5", self.project_p3)
        self.t3 = self._make_session("T3 (deleted tobe)", self.project_p3, process_layer="to_be", derived_from_session_id=self.s5)
        self._soft_delete([self.s4, self.t3])

    def tearDown(self):
        self._restore_env("PROCESS_STORAGE_DIR", self.old_sessions_dir)
        self._restore_env("PROJECT_STORAGE_DIR", self.old_projects_dir)
        self._restore_env("PROCESS_DB_PATH", self.old_db_path)
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _restore_env(self, key, value):
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value

    def _req(self, user, *, is_admin=True):
        return _DummyRequest(user, active_org_id=self.org_id, is_admin=is_admin)

    def _create_project(self, name, folder_id):
        from app.routers.explorer import CreateProjectBody, create_project_in_folder

        project = create_project_in_folder(
            folder_id,
            CreateProjectBody(name=name),
            self._req(self.admin),
            workspace_id=self.workspace_id,
        )
        pid = str(project.get("id") or "")
        self.assertTrue(pid)
        return pid

    def _make_session(self, title, project_id, *, process_layer="as_is", derived_from_session_id=""):
        sid = self.storage.create(
            title,
            project_id=project_id,
            process_layer=process_layer,
            derived_from_session_id=derived_from_session_id,
            user_id=self.admin_id,
            org_id=self.org_id,
        )
        return str(sid)

    def _soft_delete(self, session_ids):
        import app.storage as storage_module

        db_path = storage_module._db_path()
        with sqlite3.connect(str(db_path)) as con:
            for sid in session_ids:
                con.execute("UPDATE sessions SET deleted_at = 12345 WHERE id = ?", (sid,))
            con.commit()

    def _explorer_items(self, **kwargs):
        kwargs.setdefault("folder_id", "")
        page = self.get_explorer_page(self._req(self.admin), workspace_id=self.workspace_id, **kwargs)
        return page.items, page.meta

    def _section_items(self, **kwargs):
        """Дети раздела А: папка Б + проекты P1, P3."""
        return self._explorer_items(folder_id=self.section_a_id, **kwargs)

    def _all_level_items(self, **kwargs):
        """Раздел А + папка Б — все проекты фикстуры на их уровнях."""
        section_items, meta = self._section_items(**kwargs)
        folder_items, _ = self._explorer_items(folder_id=self.folder_b_id, **kwargs)
        return list(section_items) + list(folder_items), meta

    def _item_by_id(self, items, item_id):
        for item in items:
            if str(item.get("id")) == str(item_id):
                return item
        return None

    # ─── Агрегация counters/stage_badges/tobe/tobe_coverage ─────────────────

    def test_explorer_project_counters_exact_counts(self):
        items, _ = self._all_level_items()
        p1 = self._item_by_id(items, self.project_p1)
        p2 = self._item_by_id(items, self.project_p2)
        p3 = self._item_by_id(items, self.project_p3)
        # P1: 1 AS IS + 1 TO BE; P2: только AS IS; P3: S3+S5 живые AS IS (S4 удалён), 1 TO BE.
        self.assertEqual(p1["counters"], {"as_is": 1, "to_be": 1})
        self.assertEqual(p1["stage_badges"], ["as_is", "to_be"])
        self.assertEqual(p2["counters"], {"as_is": 1, "to_be": 0})
        self.assertEqual(p2["stage_badges"], ["as_is"])
        self.assertEqual(p3["counters"], {"as_is": 2, "to_be": 1})
        self.assertIsNotNone(p3["tobe"]["last_updated_at"])
        self.assertIsNone(p2["tobe"]["last_updated_at"])

    def test_explorer_counters_match_direct_db_count(self):
        """AC1: счётчики совпадают с прямым COUNT по БД (только живые)."""
        import app.storage as storage_module

        db_path = storage_module._db_path()
        with sqlite3.connect(str(db_path)) as con:
            row = con.execute(
                """
                SELECT project_id,
                       SUM(CASE WHEN process_layer = 'to_be' THEN 1 ELSE 0 END) AS to_be,
                       SUM(CASE WHEN COALESCE(process_layer, 'as_is') != 'to_be' THEN 1 ELSE 0 END) AS as_is
                  FROM sessions
                 WHERE project_id IN (?, ?, ?)
                   AND COALESCE(parent_session_id, '') = ''
                   AND (deleted_at = 0 OR deleted_at IS NULL)
                 GROUP BY project_id
                """,
                (self.project_p1, self.project_p2, self.project_p3),
            ).fetchall()
        direct = {r[0]: {"as_is": r[2], "to_be": r[1]} for r in row}
        items, _ = self._all_level_items()
        for pid in (self.project_p1, self.project_p2, self.project_p3):
            item = self._item_by_id(items, pid)
            self.assertEqual(item["counters"], direct[pid], f"counters mismatch for {pid}")

    def test_explorer_folder_rollup_and_coverage(self):
        items, _ = self._explorer_items()
        section = self._item_by_id(items, self.section_a_id)
        self.assertIsNotNone(section)
        section_items, _ = self._section_items()
        folder_b = self._item_by_id(section_items, self.folder_b_id)
        self.assertIsNotNone(folder_b)
        # Раздел A: P1 (1/1) + P2 через папку Б (1/0) + P3 (2/1) = as_is 4, to_be 2.
        self.assertEqual(section["counters"], {"as_is": 4, "to_be": 2})
        self.assertEqual(section["stage_badges"], ["as_is", "to_be"])
        self.assertEqual(section["tobe_coverage"], {"with_tobe": 2, "total": 3})
        self.assertEqual(folder_b["counters"], {"as_is": 1, "to_be": 0})
        self.assertEqual(folder_b["tobe_coverage"], {"with_tobe": 0, "total": 1})
        # MAX(updated_at) по поддереву раздела = max(T1.updated_at, T2.updated_at).
        import app.storage as storage_module

        db_path = storage_module._db_path()
        with sqlite3.connect(str(db_path)) as con:
            expected_max = con.execute(
                "SELECT MAX(updated_at) FROM sessions WHERE id IN (?, ?)",
                (self.t1, self.t2),
            ).fetchone()[0]
        self.assertEqual(section["tobe"]["last_updated_at"], expected_max)

    def test_explorer_sessions_count_excludes_deleted(self):
        """D1: старый sessions_count больше не считает soft-deleted сессии."""
        items, _ = self._section_items()
        p3 = self._item_by_id(items, self.project_p3)
        # P3: S3, T2, S5 живые; S4, T3 удалены → 3 живые root-сессии.
        self.assertEqual(p3["sessions_count"], 3)
        section = self._item_by_id(self._explorer_items()[0], self.section_a_id)
        # Раздел А: P1=2 (S1,T1) + P2=1 (S2) + P3=3 (S3,T2,S5) = 6 живых root-сессий.
        self.assertEqual(section["descendant_sessions_count"], 6)

    def test_explorer_meta_workspace_counts(self):
        _, meta = self._explorer_items()
        self.assertEqual(meta["workspace_counts"], {"as_is": 4, "to_be": 2})
        self.assertEqual(meta["matched_branches"], len(self.get_explorer_page(
            self._req(self.admin), workspace_id=self.workspace_id, folder_id=""
        ).items))

    # ─── Дерево сессий (?tree=true) ──────────────────────────────────────────

    def _tree_page(self, project_id, **kwargs):
        return self.get_project_explorer(
            project_id,
            self._req(self.admin),
            workspace_id=self.workspace_id,
            tree=True,
            **kwargs,
        )

    def _tree_node(self, nodes, sid):
        for node in nodes:
            if str(node.id) == str(sid):
                return node
            found = self._tree_node(node.children or [], sid)
            if found is not None:
                return found
        return None

    def test_tree_leaf_overview_and_deleted_tobe_excluded(self):
        page = self._tree_page(self.project_p1)
        s1 = self._tree_node(page.sessions, self.s1)
        t1 = self._tree_node(page.sessions, self.t1)
        # Лист AS IS с живой связанной TO BE: двойной бейдж.
        self.assertEqual(s1.process_layer, "as_is")
        self.assertEqual(s1.counters, {"as_is": 1, "to_be": 1})
        self.assertEqual(s1.stage_badges, ["as_is", "to_be"])
        self.assertIsNotNone(s1.tobe["last_updated_at"])
        # Лист TO BE: собственный updated_at.
        self.assertEqual(t1.process_layer, "to_be")
        self.assertEqual(t1.counters, {"as_is": 0, "to_be": 1})
        self.assertIsNotNone(t1.tobe["last_updated_at"])

        page3 = self._tree_page(self.project_p3)
        s5 = self._tree_node(page3.sessions, self.s5)
        # Удалённая TO BE (T3) не даёт to_be у родительской AS IS (S5).
        self.assertEqual(s5.counters, {"as_is": 1, "to_be": 0})
        self.assertEqual(s5.stage_badges, ["as_is"])
        self.assertIsNone(s5.tobe["last_updated_at"])
        # Удалённые сессии (S4, T3) отсутствуют в дереве вообще.
        self.assertIsNone(self._tree_node(page3.sessions, self.s4))
        self.assertIsNone(self._tree_node(page3.sessions, self.t3))

    def test_tree_max_updated_at_rollup_on_non_leaf(self):
        # Подпроцесс: S1 получает ребёнка C1 (as_is) → у S1 counters.as_is=2.
        child = self._make_session("C1 subprocess", self.project_p1)
        import app.storage as storage_module

        db_path = storage_module._db_path()
        with sqlite3.connect(str(db_path)) as con:
            con.execute(
                "UPDATE sessions SET parent_session_id = ? WHERE id = ?",
                (self.s1, child),
            )
            con.commit()
        page = self._tree_page(self.project_p1)
        s1 = self._tree_node(page.sessions, self.s1)
        self.assertEqual(s1.counters, {"as_is": 2, "to_be": 1})

    # ─── Flat/root_only выборки: поля листа ──────────────────────────────────

    def test_root_only_listing_has_overview_fields(self):
        page = self.get_project_explorer(
            self.project_p1,
            self._req(self.admin),
            workspace_id=self.workspace_id,
            root_only=True,
            include_children_meta=True,
        )
        by_id = {s.id: s for s in page.sessions}
        self.assertEqual(by_id[self.s1].process_layer, "as_is")
        self.assertEqual(by_id[self.s1].counters, {"as_is": 1, "to_be": 1})
        self.assertEqual(by_id[self.s1].stage_badges, ["as_is", "to_be"])
        self.assertIsNotNone(by_id[self.s1].tobe["last_updated_at"])
        self.assertEqual(by_id[self.t1].process_layer, "to_be")

    # ─── Фильтр stage ─────────────────────────────────────────────────────────

    def test_stage_filter_or_semantics(self):
        items_to_be, meta_to_be = self._all_level_items(stage=["to_be"])
        ids_to_be = {str(i["id"]) for i in items_to_be}
        # P2 (только AS IS) скрыт; папка Б сохраняется как путь (внутри P2 только AS IS —
        # папка Б сама без TO BE, но её дети... P2 скрыт → папка Б тоже скрыта).
        self.assertNotIn(self.project_p2, ids_to_be)
        self.assertNotIn(self.folder_b_id, ids_to_be)
        self.assertIn(self.project_p1, ids_to_be)
        self.assertIn(self.project_p3, ids_to_be)
        self.assertEqual(meta_to_be["matched_counts"]["to_be"], 2)

        items_as_is, meta_as_is = self._all_level_items(stage=["as_is"])
        self.assertIn(self.project_p2, {str(i["id"]) for i in items_as_is})
        self.assertIn(self.folder_b_id, {str(i["id"]) for i in items_as_is})
        self.assertEqual(meta_as_is["matched_counts"]["as_is"], 4)

        # Оба значения = отсутствие фильтра.
        items_both, _ = self._all_level_items(stage=["as_is", "to_be"])
        items_none, _ = self._all_level_items()
        self.assertEqual(
            sorted(str(i["id"]) for i in items_both),
            sorted(str(i["id"]) for i in items_none),
        )

    def test_stage_filter_counters_stay_global(self):
        """AC9: счётчики узлов под фильтром остаются глобальными."""
        items, _ = self._section_items(stage=["to_be"])
        p1 = self._item_by_id(items, self.project_p1)
        self.assertEqual(p1["counters"], {"as_is": 1, "to_be": 1})

    def test_stage_filter_empty_selection_meta(self):
        # Папка Б: только AS IS → stage=to_be на уровне папки Б даёт пустую выборку.
        items, meta = self._explorer_items(folder_id=self.folder_b_id, stage=["to_be"])
        self.assertEqual(items, [])
        self.assertEqual(meta["matched_branches"], 0)
        self.assertEqual(meta["matched_counts"], {"as_is": 0, "to_be": 0})

    def test_tree_stage_filter_path_only_keeps_parent_chain(self):
        # Цепочка в P2: S2(as_is) → C1(as_is subprocess) + T4(to_be derived от C1).
        # Фильтр to_be: T4 показана (свой контур), C1 и S2 — path_only
        # (родительская цепочка без собственных TO BE).
        c1 = self._make_session("C1 subprocess", self.project_p2)
        t4 = self._make_session("T4", self.project_p2, process_layer="to_be", derived_from_session_id=c1)
        import app.storage as storage_module

        db_path = storage_module._db_path()
        with sqlite3.connect(str(db_path)) as con:
            con.execute(
                "UPDATE sessions SET parent_session_id = ? WHERE id = ?",
                (self.s2, c1),
            )
            con.commit()
        page = self._tree_page(self.project_p2, stage=["to_be"])
        t4_node = self._tree_node(page.sessions, t4)
        c1_node = self._tree_node(page.sessions, c1)
        s2_node = self._tree_node(page.sessions, self.s2)
        self.assertIsNotNone(t4_node)
        self.assertFalse(t4_node.path_only)
        # C1 — владелец связи TO BE (T4 derived от C1) → matched-узел, не path_only.
        self.assertIsNotNone(c1_node)
        self.assertFalse(c1_node.path_only)
        # S2 — родитель без собственных TO BE → сохраняется как path_only.
        self.assertIsNotNone(s2_node)
        self.assertTrue(s2_node.path_only)
        self.assertIsNotNone(page.meta)
        # matched_counts по собственным бейджам: T4 (схема TO BE) + C1 (AS IS со связью TO BE).
        self.assertEqual(page.meta["matched_counts"]["to_be"], 2)

        # Оба значения = без фильтра: все живые root-сессии на месте (S3, T2, S5).
        page_both = self._tree_page(self.project_p3, stage=["as_is", "to_be"])
        self.assertEqual(len(page_both.sessions), 3)

    # ─── Backward compat ──────────────────────────────────────────────────────

    def test_backward_compat_old_fields_unchanged(self):
        items, _ = self._all_level_items()
        p1 = self._item_by_id(items, self.project_p1)
        for key in ("id", "type", "name", "sessions_count", "status", "dod_percent", "updated_at"):
            self.assertIn(key, p1)
        page = self._tree_page(self.project_p1)
        s1 = self._tree_node(page.sessions, self.s1)
        for key in ("id", "name", "status", "has_children", "subprocesses_count"):
            self.assertTrue(hasattr(s1, key), f"missing legacy field {key}")

    # ─── Per-user предпочтения баннера через users_preferences API (AC6) ───────
    # Единый механизм /api/users/me/preferences (whitelist-ключ
    # explorer.tobe_banner.dismissed_at) — дублирующий /api/me/ui-preferences
    # удалён по ревью F2 (REVIEW_FAIL 2026-09-11).

    def _with_scope(self):
        from app.storage import push_storage_request_scope

        return push_storage_request_scope(self.admin_id, True, self.org_id)

    def test_tobe_banner_dismiss_roundtrip_and_org_scope(self):
        from app.routers.users_preferences import (
            PreferencesPatchBody,
            get_my_preferences,
            patch_my_preferences,
        )
        from app.storage import pop_storage_request_scope

        tokens = self._with_scope()
        self.addCleanup(pop_storage_request_scope, tokens)
        req = self._req(self.admin)
        snap = get_my_preferences(req)
        self.assertEqual(snap["preferences"], {})
        base_version = int(snap["version"])

        patch = patch_my_preferences(
            req,
            PreferencesPatchBody(
                base_version=base_version,
                set={"explorer.tobe_banner.dismissed_at": "1699999999"},
            ),
        )
        self.assertEqual(patch["preferences"]["explorer.tobe_banner.dismissed_at"], "1699999999")

        # Персистентно: повторный GET из «другого запроса» отдаёт значение.
        again = get_my_preferences(self._req(self.admin))
        self.assertEqual(again["preferences"]["explorer.tobe_banner.dismissed_at"], "1699999999")

        # Другой org-scope — изоляция.
        req_other_org = _DummyRequest(self.admin, active_org_id="org_other")
        other = get_my_preferences(req_other_org)
        self.assertEqual(other["preferences"], {})

        # unset удаляет.
        patch = patch_my_preferences(
            req,
            PreferencesPatchBody(
                base_version=int(again["version"]),
                unset=["explorer.tobe_banner.dismissed_at"],
            ),
        )
        self.assertNotIn("explorer.tobe_banner.dismissed_at", patch["preferences"])

    def test_tobe_banner_dismiss_cas_and_validation(self):
        from fastapi.responses import JSONResponse

        from app.routers.users_preferences import (
            PreferencesPatchBody,
            get_my_preferences,
            patch_my_preferences,
        )
        from app.storage import pop_storage_request_scope

        tokens = self._with_scope()
        self.addCleanup(pop_storage_request_scope, tokens)
        req = self._req(self.admin)
        snap = get_my_preferences(req)

        # Stale base_version → 409 с актуальным снапшотом (клиент решает LWW).
        conflict = patch_my_preferences(
            req,
            PreferencesPatchBody(base_version=int(snap["version"]) + 5, set={}),
        )
        self.assertIsInstance(conflict, JSONResponse)
        self.assertEqual(conflict.status_code, 409)

        # Unknown key → 422.
        bad = patch_my_preferences(
            req,
            PreferencesPatchBody(base_version=int(snap["version"]), set={"nope.key": "1"}),
        )
        self.assertIsInstance(bad, JSONResponse)
        self.assertEqual(bad.status_code, 422)

        # Слишком длинное значение whitelisted-ключа → 422.
        long_value = "x" * 300
        bad_value = patch_my_preferences(
            req,
            PreferencesPatchBody(
                base_version=int(snap["version"]),
                set={"explorer.tobe_banner.dismissed_at": long_value},
            ),
        )
        self.assertIsInstance(bad_value, JSONResponse)
        self.assertEqual(bad_value.status_code, 422)

    # ─── Feature flag (AC7) ───────────────────────────────────────────────────

    def test_workspace_tobe_overview_flag_default_off(self):
        from app.routers.feature_flags import _DEFAULT_FLAGS, _get_flags

        self.assertEqual(_DEFAULT_FLAGS.get("workspace_tobe_overview"), "0")
        flags = _get_flags(self.org_id)
        self.assertIn("workspace_tobe_overview", flags)
        self.assertFalse(flags["workspace_tobe_overview"])


if __name__ == "__main__":
    unittest.main()
