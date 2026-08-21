import { ADMIN_NAV_ITEMS } from "../constants/adminNav";
import { ru } from "../../../shared/i18n/ru";

export default function AdminSidebar({
  section = "dashboard",
  onNavigate,
}) {
  return (
    <aside className="adminSidebar flex h-full min-h-0 w-full flex-col border-r border-border bg-slate-950 text-slate-100 lg:w-56">
      <div className="border-b border-white/10 px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">ProcessMap</div>
        <div className="mt-1 text-base font-semibold">{ru.admin.sidebar.title}</div>
      </div>
      <nav className="flex-1 space-y-1 overflow-auto px-2 py-2">
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition ${
                active
                  ? "bg-emerald-500/12 text-white ring-1 ring-emerald-400/35"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
              onClick={() => onNavigate?.(item.href)}
              data-testid={`admin-nav-${item.id}`}
            >
              <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold ${
                active ? "bg-emerald-400/15 text-emerald-200" : "bg-white/5 text-slate-400"
              }`}
              >
                {item.shortLabel}
              </span>
              <span className="truncate text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-3 py-2 text-[10px] text-slate-400">
        {ru.admin.sidebar.footer}
      </div>
    </aside>
  );
}
