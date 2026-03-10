import { ADMIN_NAV_ITEMS } from "../constants/adminNav";
import { ru } from "../../../shared/i18n/ru";

export default function AdminSidebar({
  section = "dashboard",
  onNavigate,
}) {
  return (
    <aside className="adminSidebar flex h-full min-h-0 w-full flex-col border-r border-border bg-slate-950 text-slate-100 lg:w-72">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">ProcessMap</div>
        <div className="mt-2 text-xl font-semibold">{ru.admin.sidebar.title}</div>
        <div className="mt-1 text-xs text-slate-400">{ru.admin.sidebar.subtitle}</div>
      </div>
      <nav className="flex-1 space-y-1 overflow-auto px-3 py-4">
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                active
                  ? "bg-emerald-500/12 text-white ring-1 ring-emerald-400/35"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
              onClick={() => onNavigate?.(item.href)}
              data-testid={`admin-nav-${item.id}`}
            >
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-xs font-semibold ${
                active ? "bg-emerald-400/15 text-emerald-200" : "bg-white/5 text-slate-400"
              }`}
              >
                {item.shortLabel}
              </span>
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-400">
        {ru.admin.sidebar.footer}
      </div>
    </aside>
  );
}
