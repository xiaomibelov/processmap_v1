import { useState } from "react";
import SectionCard from "../common/SectionCard";
import { asArray, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

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

function CapabilityLink({ href, capabilityId, label, onNavigate }) {
  if (!toText(href)) return null;
  if (typeof onNavigate === "function") {
    return (
      <button
        type="button"
        data-testid={`capability-link-${capabilityId}`}
        className="text-xs font-medium text-emerald-700 hover:underline"
        onClick={() => onNavigate(href)}
      >
        {label} →
      </button>
    );
  }
  return (
    <a href={href} data-testid={`capability-link-${capabilityId}`} className="text-xs font-medium text-emerald-700 hover:underline">
      {label} →
    </a>
  );
}

export default function CapabilityMapSection({ groups = [], onNavigate }) {
  const d = ru.admin.dashboardPage;
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
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                  onClick={() => toggle(id)}
                >
                  <span className="text-sm font-semibold text-slate-950">{toText(domain?.label) || id}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{capabilities.length}</span>
                    <span aria-hidden="true" className="text-xs text-slate-400">{expanded ? "▾" : "▸"}</span>
                  </span>
                </button>
                {expanded ? (
                  <ul id={`capability-domain-panel-${id}`} className="space-y-1 border-t border-slate-100 px-3 py-2">
                    {capabilities.map((cap) => {
                      const capId = toText(cap?.id) || toText(cap?.label);
                      const status = toText(cap?.status) || "no_data";
                      const statusLabel = d.status[status] || d.status.no_data;
                      return (
                        <li key={capId} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1" data-testid={`capability-row-${capId}`}>
                          <span className="text-sm text-slate-800">{toText(cap?.label) || capId}</span>
                          <span data-testid={`capability-status-${capId}`} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[status] || STATUS_TONE.no_data}`}>
                            {statusLabel}
                          </span>
                          {toText(cap?.fact) ? <span className="text-xs text-slate-500">{toText(cap?.fact)}</span> : null}
                          <CapabilityLink href={cap?.href} capabilityId={capId} label={d.openSection} onNavigate={onNavigate} />
                        </li>
                      );
                    })}
                    {capabilities.length === 0 ? (
                      <li className="py-1 text-xs text-slate-400">{d.capabilitiesEmpty}</li>
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
