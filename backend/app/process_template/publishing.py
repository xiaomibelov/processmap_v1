"""E7.2 — publish flow шаблона процесса.

Поток (locked decisions PO):
  (а) обязательный dry-run (E6 validate R1–R7): errors → 422 {findings};
  (б) pre-check по целевым кухням (target_kitchen_ids или весь реестр):
      strict + verdict=blocked → 422; warning → публикуем, warnings
      записываются в version artifact (precheck_report);
  (в) bpmn_xml — из генератора E7.1 (camunda:properties dialect);
  (г) сохранение версии в process_template_version + bump
      process_template.version (patch авто, minor/major по параметру)
      + status=published + audit_log(action='publish').

Публикация возможна только из черновика: published-шаблон сначала
переводится в новый черновик через new_draft().
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..kitchens.repository import KitchenRepository
from ..validation.precheck import precheck_with_catalog
from ..validation.service import validate_with_catalog
from .bpmn_export import generate_bpmn
from .repository import ProcessTemplateRepository
from .version_repository import ProcessTemplateVersionRepository


class PublishError(Exception):
    """Ошибка публикации с HTTP-статусом и detail-пэйлоадом."""

    def __init__(self, status_code: int, detail: Any) -> None:
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


def write_publish_audit(
    *,
    actor_user_id: str,
    org_id: str,
    entity_type: str,
    entity_id: str,
    meta: Dict[str, Any],
) -> None:
    """E7.6 — запись publish в audit_log (best-effort, не роняет publish)."""
    try:
        from ..storage import append_audit_log

        append_audit_log(
            actor_user_id=str(actor_user_id or "-"),
            org_id=str(org_id or "").strip() or "-",
            action="publish",
            entity_type=entity_type,
            entity_id=str(entity_id or "-"),
            status="ok",
            meta=meta,
        )
    except Exception as exc:  # pragma: no cover - audit не должен ронять publish
        print(f"[AUDIT] publish write_failed entity={entity_type}:{entity_id} err={exc}")


class PublishService:
    def __init__(self) -> None:
        self.templates = ProcessTemplateRepository()
        self.versions = ProcessTemplateVersionRepository()
        self.kitchens = KitchenRepository()

    # ------------------------------------------------------------------ utils

    def _template_or_404(self, template_id: str) -> Dict[str, Any]:
        template = self.templates.get_by_id(template_id)
        if not template:
            raise PublishError(404, "Template not found")
        return template

    def run_precheck(
        self,
        ui_model: Dict[str, Any],
        *,
        target_kitchen_ids: Optional[List[str]] = None,
        mode: str = "warning",
    ) -> Dict[str, Any]:
        kitchens = self.kitchens.list_kitchens()
        if target_kitchen_ids:
            wanted = {str(k) for k in target_kitchen_ids}
            kitchens = [k for k in kitchens if str(k.get("id") or "") in wanted]
        return precheck_with_catalog(ui_model, kitchens, mode=mode)

    # ----------------------------------------------------------------- publish

    def publish_template(
        self,
        template_id: str,
        *,
        actor_user_id: str,
        org_id: str = "",
        target_kitchen_ids: Optional[List[str]] = None,
        mode: str = "warning",
        bump: str = "patch",
    ) -> Dict[str, Any]:
        template = self._template_or_404(template_id)
        if str(template.get("status") or "") == "published":
            raise PublishError(
                409,
                {
                    "message": "Шаблон опубликован — создайте новый черновик "
                    "(POST /api/process-templates/{id}/new-draft) перед следующей публикацией",
                },
            )
        mode = (mode or "warning").strip().lower()
        if mode not in ("strict", "warning"):
            raise PublishError(422, "mode must be 'strict' or 'warning'")
        ui_model = template.get("ui_model") or {}

        # (а) обязательный dry-run
        dry_run = validate_with_catalog(ui_model, check_reachability=True)
        if dry_run["summary"]["errors"] > 0:
            raise PublishError(
                422,
                {
                    "message": "Dry-run валидация не пройдена — публикация запрещена",
                    "stage": "dry_run",
                    "findings": dry_run["findings"],
                    "summary": dry_run["summary"],
                },
            )

        # (б) pre-check по целевым кухням
        precheck = self.run_precheck(ui_model, target_kitchen_ids=target_kitchen_ids, mode=mode)
        if mode == "strict" and precheck["summary"]["blocked"] > 0:
            raise PublishError(
                422,
                {
                    "message": "Pre-check (strict): кухни не покрывают требования шаблона",
                    "stage": "precheck",
                    "precheck": precheck,
                },
            )

        # (в) bpmn_xml из генератора
        bpmn_xml = generate_bpmn(
            ui_model,
            template_name=str(template.get("name") or ""),
            template_id=str(template.get("id") or ""),
        )

        # (г) сохранение версии + bump версии шаблона
        new_version = self.versions.next_version(
            template_id, str(template.get("version") or ""), bump=bump
        )
        warnings_count = int(precheck["summary"].get("warning", 0)) + int(
            dry_run["summary"].get("warnings", 0)
        )
        self.versions.retire_published(template_id)
        version_row = self.versions.create(
            {
                "template_id": template_id,
                "version": new_version,
                "status": "published",
                "ui_model": ui_model,
                "bpmn_xml": bpmn_xml,
                "precheck_report": precheck,
                "dry_run_report": dry_run,
                "created_by": actor_user_id,
            }
        )
        updated = self.templates.publish(template_id, version=new_version)

        diff_summary = (
            f"nodes={dry_run['summary'].get('nodes', 0)} "
            f"flows={dry_run['summary'].get('flows', 0)} bump={bump}"
        )
        write_publish_audit(
            actor_user_id=actor_user_id,
            org_id=org_id,
            entity_type="process_template",
            entity_id=template_id,
            meta={
                "version": new_version,
                "diff_summary": diff_summary,
                "warnings_count": warnings_count,
            },
        )
        return {
            "template": updated,
            "version": version_row,
            "precheck": precheck,
            "dry_run": {"summary": dry_run["summary"], "findings": dry_run["findings"]},
            "warnings_count": warnings_count,
        }

    # --------------------------------------------------------------- new draft

    def new_draft(self, template_id: str) -> Dict[str, Any]:
        """«Создать новую версию»: published → draft, version = next patch."""
        template = self._template_or_404(template_id)
        next_version = self.versions.next_version(
            template_id, str(template.get("version") or ""), bump="patch"
        )
        updated = self.templates.update(
            template_id, {"status": "draft", "version": next_version}
        )
        if not updated:
            raise PublishError(404, "Template not found")
        return updated

    # ---------------------------------------------------------------- versions

    def list_versions(self, template_id: str) -> List[Dict[str, Any]]:
        """Версии со статусами: draft (текущий черновик) + published/retired."""
        template = self._template_or_404(template_id)
        out: List[Dict[str, Any]] = []
        if str(template.get("status") or "") == "draft":
            out.append(
                {
                    "id": None,
                    "template_id": template_id,
                    "version": template.get("version"),
                    "status": "draft",
                    "created_by": template.get("created_by"),
                    "created_at": template.get("updated_at"),
                }
            )
        out.extend(self.versions.list_for_template(template_id))
        return out

    def version_bpmn(self, template_id: str, version: str) -> str:
        row = self.versions.get_by_version(template_id, version)
        if not row:
            raise PublishError(404, "Version not found")
        return str(row.get("bpmn_xml") or "")
