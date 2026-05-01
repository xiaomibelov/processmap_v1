import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import App from "./App";
import AdminApp from "./features/admin/AdminApp";
import { AuthProvider, useAuth } from "./features/auth/AuthProvider";
import LoginModal from "./features/auth/LoginModal";
import LoginPage from "./features/auth/LoginPage";
import PublicHomePage from "./features/auth/PublicHomePage";
import { canAccessAdminConsole } from "./features/admin/adminUtils";
import { resolveBpmn123Route } from "./features/bpmn123/bpmn123RouteModel";
import { ru } from "./shared/i18n/ru";

const Bpmn123GameShell = lazy(() => import("./features/bpmn123/Bpmn123GameShell.jsx"));

function readLocation() {
  if (typeof window === "undefined") {
    return { pathname: "/", search: "", hash: "" };
  }
  return {
    pathname: window.location.pathname || "/",
    search: window.location.search || "",
    hash: window.location.hash || "",
  };
}

function sanitizeNextPath(raw) {
  const src = String(raw || "").trim();
  if (!src.startsWith("/")) return "/app";
  if (!src.startsWith("/app") && !src.startsWith("/admin")) return "/app";
  return src;
}

function navigate(to, { replace = false } = {}) {
  if (typeof window === "undefined") return;
  const target = String(to || "/");
  if (replace) window.history.replaceState({}, "", target);
  else window.history.pushState({}, "", target);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function normalizeOrgMemberships(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function OrgSelectScreen({ orgs, activeOrgId, busy, onSelect }) {
  const items = normalizeOrgMemberships(orgs);
  return (
    <div className="flex h-screen items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-panel p-5 shadow-panel">
        <h1 className="text-lg font-semibold text-fg">{ru.admin.orgSelect.title}</h1>
        <p className="mt-1 text-sm text-muted">{ru.admin.orgSelect.description}</p>
        <div className="mt-4 space-y-2">
          {items.map((item, idx) => {
            const id = String(item?.org_id || "").trim();
            const title = String(item?.name || id || `Org ${idx + 1}`).trim();
            const role = String(item?.role || "").trim();
            const selected = id && id === String(activeOrgId || "").trim();
            return (
              <button
                key={`${id || "org"}_${idx}`}
                type="button"
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selected
                    ? "border-accent bg-accentSoft/30 text-fg"
                    : "border-border bg-panel2/40 text-fg hover:border-accent/45 hover:bg-accentSoft/10"
                }`}
                disabled={busy || !id}
                onClick={() => onSelect?.(id)}
              >
                <div className="truncate text-sm font-semibold">{title}</div>
                <div className="mt-0.5 text-xs text-muted">{`${ru.admin.orgSelect.rolePrefix}: ${role || ru.admin.orgSelect.defaultRole}`}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const {
    user,
    isAuthed,
    loading,
    reauthRequired,
    setReauthRequired,
    orgs,
    activeOrgId,
    switchOrg,
    refreshOrgs,
  } = useAuth();
  const [loc, setLoc] = useState(() => readLocation());
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [orgSwitchBusy, setOrgSwitchBusy] = useState(false);
  const [orgChoiceDone, setOrgChoiceDone] = useState(false);

  useEffect(() => {
    function onPopState() {
      setLoc(readLocation());
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const pathname = String(loc.pathname || "/");
  const search = String(loc.search || "");
  const hash = String(loc.hash || "");
  const bpmn123Route = useMemo(() => resolveBpmn123Route(pathname), [pathname]);
  const wantsBpmn123 = bpmn123Route.isBpmn123Route;
  const orgItems = useMemo(() => normalizeOrgMemberships(orgs), [orgs]);
  const orgChoiceKey = useMemo(() => {
    const uid = String(user?.id || "").trim();
    if (!uid) return "";
    return `fpc_org_choice_done:${uid}`;
  }, [user?.id]);
  const activeOrg = String(activeOrgId || "").trim();
  const shouldSelectOrg = Boolean(isAuthed && pathname.startsWith("/app") && orgItems.length > 1 && !orgChoiceDone);
  const canAccessAdmin = useMemo(() => canAccessAdminConsole(user, orgItems), [orgItems, user]);

  const nextFromQuery = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("next") || "";
  }, [search]);
  const inviteToken = useMemo(() => {
    const params = new URLSearchParams(search);
    return String(params.get("token") || "").trim();
  }, [search]);

  useEffect(() => {
    if (loading) return;

    if (isAuthed && (pathname === "/" || pathname === "/login" || pathname === "/accept-invite")) {
      navigate("/app", { replace: true });
      return;
    }

    if (!isAuthed && !wantsBpmn123 && (pathname.startsWith("/app") || pathname.startsWith("/admin")) && !reauthRequired) {
      const next = encodeURIComponent(`${pathname}${search}${hash}`);
      navigate(`/?next=${next}`, { replace: true });
    }
  }, [hash, isAuthed, loading, pathname, reauthRequired, search, wantsBpmn123]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!orgChoiceKey) {
      setOrgChoiceDone(false);
      return;
    }
    try {
      setOrgChoiceDone(window.sessionStorage?.getItem(orgChoiceKey) === "1");
    } catch {
      setOrgChoiceDone(false);
    }
  }, [orgChoiceKey]);

  useEffect(() => {
    if (loading || !isAuthed) return;
    if (orgItems.length !== 1) return;
    const onlyOrgId = String(orgItems[0]?.org_id || "").trim();
    if (!onlyOrgId || onlyOrgId === activeOrg) return;
    let canceled = false;
    setOrgSwitchBusy(true);
    void switchOrg(onlyOrgId, { refreshMe: false }).finally(() => {
      if (!canceled) setOrgSwitchBusy(false);
    });
    return () => {
      canceled = true;
    };
  }, [activeOrg, isAuthed, loading, orgItems, switchOrg]);

  useEffect(() => {
    const privateRoute = (pathname.startsWith("/app") && !wantsBpmn123) || pathname.startsWith("/admin");
    if (!loading && !privateRoute && !isAuthed && reauthRequired) {
      setLoginModalOpen(true);
    }
    if (isAuthed || privateRoute) {
      setLoginModalOpen(false);
    }
    if (isAuthed) {
      setReauthRequired(false);
    }
  }, [isAuthed, loading, pathname, reauthRequired, setReauthRequired, wantsBpmn123]);

  function resolvePostLoginPath() {
    if (pathname.startsWith("/app")) return `${pathname}${search}${hash}`;
    if (nextFromQuery) return sanitizeNextPath(nextFromQuery);
    return "/app";
  }

  function handleLoginSuccess() {
    setLoginModalOpen(false);
    setReauthRequired(false);
    navigate(resolvePostLoginPath(), { replace: true });
  }

  function handleModalClose() {
    setLoginModalOpen(false);
    if (!isAuthed && (pathname.startsWith("/app") || pathname.startsWith("/admin"))) {
      setReauthRequired(false);
      navigate("/", { replace: true });
    }
  }

  async function handleOrgSelect(orgId) {
    const next = String(orgId || "").trim();
    if (!next) return;
    setOrgSwitchBusy(true);
    try {
      await switchOrg(next, { refreshMe: false });
      setOrgChoiceDone(true);
      if (typeof window !== "undefined" && orgChoiceKey) {
        try {
          window.sessionStorage?.setItem(orgChoiceKey, "1");
        } catch {
          // ignore storage errors
        }
      }
      if (pathname !== "/app" && !wantsBpmn123) navigate("/app", { replace: true });
    } finally {
      setOrgSwitchBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="rounded-xl border border-border bg-panel px-4 py-3 text-sm text-muted">Проверяем сессию...</div>
      </div>
    );
  }

  const wantsWorkspace = pathname.startsWith("/app");
  const wantsAdmin = pathname.startsWith("/admin");
  const showWorkspace = wantsWorkspace && isAuthed;
  const showAdmin = wantsAdmin && isAuthed;

  return (
    <>
      {wantsBpmn123 ? (
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center">
              <div className="rounded-xl border border-border bg-panel px-4 py-3 text-sm text-muted">Загружаем BPMN 123...</div>
            </div>
          }
        >
          <Bpmn123GameShell levelId={bpmn123Route.levelId} />
        </Suspense>
      ) : showAdmin ? (
        isAuthed ? (
          canAccessAdmin ? (
            <AdminApp pathname={pathname} search={search} onNavigate={navigate} />
          ) : (
            <div className="flex min-h-screen items-center justify-center px-4">
              <div className="w-full max-w-lg rounded-2xl border border-border bg-panel p-6">
                <h1 className="text-xl font-semibold text-fg">{ru.admin.accessDenied.title}</h1>
                <p className="mt-2 text-sm text-muted">
                  {ru.admin.accessDenied.description}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="primaryBtn h-10 min-h-0 px-4 py-0 text-sm"
                    onClick={() => navigate("/app", { replace: true })}
                  >
                    {ru.admin.accessDenied.back}
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          <LoginPage
            onBack={() => navigate("/")}
            onSuccess={() => {
              setReauthRequired(false);
            }}
          />
        )
      ) : wantsAdmin ? (
        <LoginPage
          onBack={() => navigate("/")}
          onSuccess={() => {
            setReauthRequired(false);
            navigate(resolvePostLoginPath(), { replace: true });
          }}
        />
      ) : showWorkspace ? (
        isAuthed && shouldSelectOrg ? (
          <OrgSelectScreen orgs={orgItems} activeOrgId={activeOrg} busy={orgSwitchBusy} onSelect={handleOrgSelect} />
        ) : (
          <App />
        )
      ) : wantsWorkspace ? (
        <LoginPage
          onBack={() => navigate("/")}
          onSuccess={() => {
            setReauthRequired(false);
            navigate(resolvePostLoginPath(), { replace: true });
          }}
        />
      ) : pathname === "/login" ? (
        <LoginPage
          onBack={() => navigate("/")}
          onSuccess={() => {
            setReauthRequired(false);
            navigate(resolvePostLoginPath(), { replace: true });
          }}
        />
      ) : (
        <PublicHomePage
          onOpenLogin={() => setLoginModalOpen(true)}
          onOpenWorkspace={() => {
            if (isAuthed) navigate("/app");
            else setLoginModalOpen(true);
          }}
          onOpenLoginPage={() => navigate("/login")}
          initialInviteToken={inviteToken}
          onAccessActivated={() => {
            setReauthRequired(false);
            navigate("/app", { replace: true });
          }}
        />
      )}

      <LoginModal
        open={loginModalOpen}
        locked={Boolean(((pathname.startsWith("/app") && !wantsBpmn123) || pathname.startsWith("/admin")) && !isAuthed)}
        onClose={handleModalClose}
        onSuccess={handleLoginSuccess}
      />
    </>
  );
}

export default function RootApp() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
