import React, { useCallback, useEffect, useState } from "react";

import { apiRequest } from "../../../lib/apiCore";
import { t } from "../i18n";
import "./AuditHistory.css";

// E8.3 — поимённый diff двух опубликованных версий рецепта
// (GET /api/recipes/{id}/diff?from=<v>&to=<v>).
export function VersionDiff({ recipeId }) {
  const [versions, setVersions] = useState([]);
  const [fromVersion, setFromVersion] = useState("");
  const [toVersion, setToVersion] = useState("");
  const [lines, setLines] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!recipeId) return undefined;
    let canceled = false;
    apiRequest(`/api/recipes/${encodeURIComponent(recipeId)}/versions`).then((r) => {
      if (canceled) return;
      const list = r?.ok && Array.isArray(r.data) ? r.data : [];
      setVersions(list);
      // по умолчанию: последняя vs предыдущая
      setToVersion(list[0] ? String(list[0].version || "") : "");
      setFromVersion(list[1] ? String(list[1].version || "") : "");
    }).catch(() => {});
    return () => {
      canceled = true;
    };
  }, [recipeId]);

  const loadDiff = useCallback(async () => {
    if (!recipeId || !toVersion) {
      setLines([]);
      return;
    }
    setError("");
    const params = new URLSearchParams();
    if (fromVersion) params.set("from", fromVersion);
    params.set("to", toVersion);
    const r = await apiRequest(`/api/recipes/${encodeURIComponent(recipeId)}/diff?${params.toString()}`);
    if (r?.ok && r.data) setLines(Array.isArray(r.data.lines) ? r.data.lines : []);
    else {
      setLines([]);
      setError(t("diff.error"));
    }
  }, [recipeId, fromVersion, toVersion]);

  useEffect(() => {
    loadDiff();
  }, [loadDiff]);

  if (!recipeId) return null;
  if (versions.length === 0) {
    return (
      <div className="audit-diff" data-testid="version-diff-empty">
        <div className="audit-history__hint">{t("diff.empty")}</div>
      </div>
    );
  }

  return (
    <div className="audit-diff" data-testid="version-diff">
      <div className="audit-diff__head">
        <label className="audit-diff__field">
          <span>{t("diff.from")}</span>
          <select data-testid="diff-from" value={fromVersion} onChange={(e) => setFromVersion(e.target.value)}>
            <option value="">{t("diff.none")}</option>
            {versions.map((v) => (
              <option key={`from_${v.version}`} value={String(v.version)}>
                v{String(v.version)}
              </option>
            ))}
          </select>
        </label>
        <span className="audit-diff__arrow">→</span>
        <label className="audit-diff__field">
          <span>{t("diff.to")}</span>
          <select data-testid="diff-to" value={toVersion} onChange={(e) => setToVersion(e.target.value)}>
            {versions.map((v) => (
              <option key={`to_${v.version}`} value={String(v.version)}>
                v{String(v.version)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <div className="audit-history__error" role="alert">
          {error}
        </div>
      ) : null}
      {!error && lines.length === 0 ? <div className="audit-history__hint">{t("diff.noChanges")}</div> : null}
      {lines.map((line, idx) => (
        <div className="audit-diff__line" data-testid="version-diff-line" key={`diff_${idx}`}>
          {line}
        </div>
      ))}
    </div>
  );
}

export default VersionDiff;
