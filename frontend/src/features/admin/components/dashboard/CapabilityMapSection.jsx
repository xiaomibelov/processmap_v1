import { useState } from "react";
import SectionCard from "../common/SectionCard";
import { asArray, toText } from "../../utils/adminFormat";
import { dashboardDict } from "./dashboardI18n";

const STORAGE_KEY = "pm-admin-capability-map";

const STATUS_TONE = {
  ok: "bg-emerald-100 text-emerald-700",
  pilot: "bg-sky-100 text-sky-700",
  off: "bg-slate-200 text-slate-600",
  attention: "bg-amber-100 text-amber-700",
  no_data: "bg-slate-100 text-slate-500",
};

function readStoredExpanded() {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persistExpanded(ids) {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    }
  } catch {
    // sessionStorage может быть недоступен — состояние просто не персистится.
  }
}

function CapabilityRow({ cap, capId, status, statusLabel, d, onNavigate }) {
  const label = toText(cap?.label) || capId;
  const fact = toText(cap?.fact);
  const href = toText(cap?.href);
  const clickable = Boolean(href) && typeof onNavigate === "function";
  const badgeClass = `inline-flex w-24 shrink-0 justify-center truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[status] || STATUS_TONE.no_data}`;
  const cells = (
    <>
      <span className="min-w-0 truncate text-sm text-slate-800">{label}</span>
      <span data-testid={`capability-status-${capId}`} className={badgeClass}>
        {statusLabel}
      </span>
      <span className="min-w-0 truncate text-xs text-slate-500">{fact}</span>
      {clickable ? (
        <span aria-hidden="true" className="shrink-0 text-xs font-medium text-emerald-700">→</span>
      ) : (
        <span aria-hidden="true" className="shrink-0 text-xs text-slate-300">—</span>
      )}
    </>
  );
  const className = "grid w-full grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)_auto] items-center gap-x-2 px-3 text-left";
  if (clickable) {
    return (
      <li data-testid={`capability-row-${capId}`}>
        <button
          type="button"
          data-testid={`capability-link-${capId}`}
          aria-label={`${d.openSection}: ${label}`}
          title={href}
          className={`${className} min-h-[44px] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500`}
          onClick={() => onNavigate(href)}
        >
          {cells}
        </button>
      </li>
    );
  }
  return (
    <li data-testid={`capability-row-${capId}`} className={`${className} min-h-[36px] py-1`}>
      {cells}
    </li>
  );
}

export default function CapabilityMapSection({ groups = [], onNavigate }) {
  const d = dashboardDict();
  const domains = asArray(groups);
  // stored === null → пользователь ещё не раскрывал группы: дефолт = первая раскрыта.
  const [stored, setStored] = useState(readStoredExpanded);

  const domainId = (domain, index) => toText(domain?.domain) || `domain-${index}`;

  function isExpanded(id, index) {
    if (stored) return stored.includes(id);
    return index === 0;
  }

  function toggle(id) {
    const base = stored || (domains.length ? [domainId(domains[0], 0)] : []);
    const next = base.includes(id) ? base.filter((row) => row !== id) : [...base, id];
    setStored(next);
    persistExpanded(next);
  }

  return (
    <SectionCard eyebrow={d.capabilitiesEyebrow} title={d.capabilitiesTitle} subtitle={d.capabilitiesSubtitle}>
      {domains.length === 0 ? (
        <div className="text-sm text-slate-500" data-testid="capability-empty">{d.capabilitiesEmpty}</div>
      ) : (
        <div className="space-y-2">
          {domains.map((domain, index) => {
            const id = domainId(domain, index);
            const expanded = isExpanded(id, index);
            const capabilities = asArray(domain?.capabilities);
            return (
              <div key={id} className="rounded-2xl border border-slate-200">
                <button
                  type="button"
                  data-testid={`capability-domain-${id}`}
                  aria-expanded={expanded}
                  aria-controls={`capability-domain-panel-${id}`}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  onClick={() => toggle(id)}
                >
                  <span className="text-sm font-semibold text-slate-950">{toText(domain?.label) || id}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{capabilities.length}</span>
                    <span aria-hidden="true" className="text-xs text-slate-400">{expanded ? "▾" : "▸"}</span>
                  </span>
                </button>
                {expanded ? (
                  <ul id={`capability-domain-panel-${id}`} className="divide-y divide-slate-100 border-t border-slate-100 py-1">
                    {capabilities.map((cap) => {
                      const capId = toText(cap?.id) || toText(cap?.label);
                      const status = toText(cap?.status) || "no_data";
                      const statusLabel = d.status[status] || d.status.no_data;
                      return (
                        <CapabilityRow
                          key={capId}
                          cap={cap}
                          capId={capId}
                          status={status}
                          statusLabel={statusLabel}
                          d={d}
                          onNavigate={onNavigate}
                        />
                      );
                    })}
                    {capabilities.length === 0 ? (
                      <li className="px-3 py-1 text-xs text-slate-400">{d.capabilitiesEmpty}</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
