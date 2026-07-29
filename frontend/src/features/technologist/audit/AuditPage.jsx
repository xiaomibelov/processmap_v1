import React from "react";

import AuditHistory from "./AuditHistory";
import "./AuditHistory.css";

// E8.3 — standalone-страница журнала аудита (/technologist/audit):
// хронология событий recipe/template с фильтрами.
export function AuditPage() {
  return (
    <div className="audit-page">
      <h1 className="audit-page__title">Журнал аудита</h1>
      <AuditHistory showFilters />
    </div>
  );
}

export default AuditPage;
