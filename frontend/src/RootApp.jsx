import { useEffect, useMemo, useState } from "react";

import App from "./App";
import AdminApp from "./features/admin/AdminApp";
import ApiDocsPage from "./features/apiDocs/ApiDocsPage";
import { AuthProvider, useAuth } from "./features/auth/AuthProvider";
import { FeatureFlagsProvider } from "./features/config/featureFlagsContext";
import LoginModal from "./features/auth/LoginModal";
import LoginPage from "./features/auth/LoginPage";
import PublicHomePage from "./features/auth/PublicHomePage";
import AnalyticsApp from "./features/analytics/AnalyticsApp.jsx";
import ImportBpmn from "./features/technologist/import/ImportBpmn";
import TechnologistCatalog from "./features/technologist/catalog/Catalog";
import TechnologistConstructor from "./features/technologist/constructor/Constructor";
import TransformReview from "./features/technologist/transform/TransformReview";
import TechnologistRecipes from "./features/technologist/recipes/Recipes";
import TechnologistAudit from "./features/technologist/audit/AuditPage";
import TechnologistPilots from "./features/technologist/pilots/Pilots";
import TechnologistHome from "./features/technologist/home/Home";
import { canAccessAdminConsole, canOpenOrgSettings } from "./features/admin/adminUtils";
import {
  buildAnalyticsPath,
  readLegacyAnalyticsRedirect,
} from "./app/processMapRouteModel.js";
import { ru } from "./shared/i18n/ru";

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
  if (!src.startsWith("/app") && !src.startsWith("/admin") && !src.startsWith("/technologist")) return "/app";
  return src;
}

function navigate(to, { replace = false } = {}) {
  if (typeof window === "undefined") return;
  const target = String(to || "/");
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (target === current) return;
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
  const orgItems = useMemo(() => normalizeOrgMemberships(orgs), [orgs]);
  const orgChoiceKey = useMemo(() => {
    const uid = String(user?.id || "").trim();
    if (!uid) return "";
    return `fpc_org_choice_done:${uid}`;
  }, [user?.id]);
  const activeOrg = String(activeOrgId || "").trim();
  const isWorkspaceLike = pathname.startsWith("/app") || pathname.startsWith("/analytics");
  const shouldSelectOrg = Boolean(isAuthed && isWorkspaceLike && orgItems.length > 1 && !orgChoiceDone);
  const canAccessAdmin = useMemo(() => canAccessAdminConsole(user, orgItems), [orgItems, user]);
  const canOpenApiDocs = useMemo(() => canOpenOrgSettings(user, orgItems, activeOrgId), [orgItems, user, activeOrgId]);

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

    if (!isAuthed && (pathname.startsWith("/app") || pathname.startsWith("/admin") || pathname.startsWith("/analytics") || pathname.startsWith("/technologist")) && !reauthRequired) {
      const next = encodeURIComponent(`${pathname}${search}${hash}`);
      navigate(`/?next=${next}`, { replace: true });
    }
  }, [hash, isAuthed, loading, pathname, reauthRequired, search]);

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
    const privateRoute = pathname.startsWith("/app") || pathname.startsWith("/admin");
    if (!loading && !privateRoute && !isAuthed && reauthRequired) {
      setLoginModalOpen(true);
    }
    if (isAuthed || privateRoute) {
      setLoginModalOpen(false);
    }
    if (isAuthed) {
      setReauthRequired(false);
    }
  }, [isAuthed, loading, pathname, reauthRequired, setReauthRequired]);

  function resolvePostLoginPath() {
    if (pathname.startsWith("/app") || pathname.startsWith("/technologist")) return `${pathname}${search}${hash}`;
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
      if (pathname !== "/app" && !pathname.startsWith("/analytics")) navigate("/app", { replace: true });
    } finally {
      setOrgSwitchBusy(false);
    }
  }

  const wantsWorkspace = pathname.startsWith("/app");
  const wantsAnalytics = pathname.startsWith("/analytics");
  const wantsAdmin = pathname.startsWith("/admin");
  const wantsTechnologistImport = pathname.startsWith("/technologist/import-bpmn");
  const wantsTechnologistCatalog = pathname.startsWith("/technologist/catalog");
  const wantsTechnologistConstructor = pathname.startsWith("/technologist/constructor");
  const wantsTechnologistTransform = pathname.startsWith("/technologist/transform");
  const wantsTechnologistRecipes = pathname.startsWith("/technologist/recipes");
  const wantsTechnologistAudit = pathname.startsWith("/technologist/audit");
  const wantsTechnologistPilots = pathname.startsWith("/technologist/pilots");
  const wantsTechnologistHome = pathname === "/technologist" || pathname === "/technologist/home";
  const wantsTechnologistWorkspace = pathname.startsWith("/technologist/workspace");

  useEffect(() => {
    if (!isAuthed || !wantsWorkspace) return;
    const redirect = readLegacyAnalyticsRedirect({ pathname, search });
    if (redirect && redirect.scope && redirect.scopeId) {
      navigate(buildAnalyticsPath(redirect.scope, redirect.scopeId, redirect.module), { replace: true });
    }
  }, [isAuthed, wantsWorkspace, pathname, search]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="rounded-xl border border-border bg-panel px-4 py-3 text-sm text-muted">Проверяем сессию...</div>
      </div>
    );
  }

  const showWorkspace = wantsWorkspace && isAuthed;

  // CL1: единая истина — TO BE на хост-канвасе /app; старый маршрут WS1 → redirect.
  if (wantsTechnologistWorkspace) {
    if (typeof window !== "undefined") {
      window.location.replace(`/app${search || ""}`);
    }
    return null;
  }

  // UX1/U3: главный экран технолога «Мои процессы».
  if (wantsTechnologistHome) {
    return (
      <>
        {isAuthed ? (
          <TechnologistHome />
        ) : (
          <LoginPage
            onBack={() => navigate("/")}
            onSuccess={() => {
              setReauthRequired(false);
              navigate("/technologist", { replace: true });
            }}
          />
        )}
        <LoginModal
          open={loginModalOpen}
          locked={!isAuthed}
          onClose={handleModalClose}
          onSuccess={handleLoginSuccess}
        />
      </>
    );
  }

  // E2: standalone technologist catalog page (same minimal mount as import page).
  if (wantsTechnologistCatalog) {
    return (
      <>
        {isAuthed ? (
          <TechnologistCatalog />
        ) : (
          <LoginPage
            onBack={() => navigate("/")}
            onSuccess={() => {
              setReauthRequired(false);
              navigate("/technologist/catalog", { replace: true });
            }}
          />
        )}
        <LoginModal
          open={loginModalOpen}
          locked={!isAuthed}
          onClose={handleModalClose}
          onSuccess={handleLoginSuccess}
        />
      </>
    );
  }

  // E4: standalone technologist process constructor page (same minimal mount as catalog).
  if (wantsTechnologistConstructor) {
    return (
      <>
        {isAuthed ? (
          <TechnologistConstructor />
        ) : (
          <LoginPage
            onBack={() => navigate("/")}
            onSuccess={() => {
              setReauthRequired(false);
              navigate(`/technologist/constructor${search}${hash}`, { replace: true });
            }}
          />
        )}
        <LoginModal
          open={loginModalOpen}
          locked={!isAuthed}
          onClose={handleModalClose}
          onSuccess={handleLoginSuccess}
        />
      </>
    );
  }

  // E5: standalone technologist recipes page (same minimal mount as constructor).
  if (wantsTechnologistRecipes) {
    return (
      <>
        {isAuthed ? (
          <TechnologistRecipes />
        ) : (
          <LoginPage
            onBack={() => navigate("/")}
            onSuccess={() => {
              setReauthRequired(false);
              navigate(`/technologist/recipes${search}${hash}`, { replace: true });
            }}
          />
        )}
        <LoginModal
          open={loginModalOpen}
          locked={!isAuthed}
          onClose={handleModalClose}
          onSuccess={handleLoginSuccess}
        />
      </>
    );
  }

  // E9.6: standalone technologist pilots page (same minimal mount as recipes).
  if (wantsTechnologistPilots) {
    return (
      <>
        {isAuthed ? (
          <TechnologistPilots />
        ) : (
          <LoginPage
            onBack={() => navigate("/")}
            onSuccess={() => {
              setReauthRequired(false);
              navigate(`/technologist/pilots${search}${hash}`, { replace: true });
            }}
          />
        )}
        <LoginModal
          open={loginModalOpen}
          locked={!isAuthed}
          onClose={handleModalClose}
          onSuccess={handleLoginSuccess}
        />
      </>
    );
  }

  // E8: standalone technologist audit log page (same minimal mount as recipes).
  if (wantsTechnologistAudit) {
    return (
      <>
        {isAuthed ? (
          <TechnologistAudit />
        ) : (
          <LoginPage
            onBack={() => navigate("/")}
            onSuccess={() => {
              setReauthRequired(false);
              navigate(`/technologist/audit${search}${hash}`, { replace: true });
            }}
          />
        )}
        <LoginModal
          open={loginModalOpen}
          locked={!isAuthed}
          onClose={handleModalClose}
          onSuccess={handleLoginSuccess}
        />
      </>
    );
  }

  // E3.5: standalone transformation review page (same minimal mount as constructor).
  if (wantsTechnologistTransform) {
    return (
      <>
        {isAuthed ? (
          <TransformReview />
        ) : (
          <LoginPage
            onBack={() => navigate("/")}
            onSuccess={() => {
              setReauthRequired(false);
              navigate("/technologist/transform", { replace: true });
            }}
          />
        )}
        <LoginModal
          open={loginModalOpen}
          locked={!isAuthed}
          onClose={handleModalClose}
          onSuccess={handleLoginSuccess}
        />
      </>
    );
  }

  // E3.5: standalone technologist import page (no react-router; minimal top-level path check).
  if (wantsTechnologistImport) {
    return (
      <>
        {isAuthed ? (
          <ImportBpmn />
        ) : (
          <LoginPage
            onBack={() => navigate("/")}
            onSuccess={() => {
              setReauthRequired(false);
              navigate("/technologist/import-bpmn", { replace: true });
            }}
          />
        )}
        <LoginModal
          open={loginModalOpen}
          locked={!isAuthed}
          onClose={handleModalClose}
          onSuccess={handleLoginSuccess}
        />
      </>
    );
  }
  const showAnalytics = wantsAnalytics && isAuthed;
  const showAdmin = wantsAdmin && isAuthed;
  const wantsApiDocs = pathname === "/api-docs";

  // /api-docs — Swagger UI внутри SPA (право = как у кнопки, canOpenOrgSettings)
  if (wantsApiDocs) {
    if (!isAuthed) {
      return (
        <LoginPage
          onBack={() => navigate("/")}
          onSuccess={() => {
            setReauthRequired(false);
            navigate("/api-docs", { replace: true });
          }}
        />
      );
    }
    if (!canOpenApiDocs) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-panel p-6" data-testid="api-docs-access-denied">
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
      );
    }
    return <ApiDocsPage />;
  }

  return (
    <>
      {showAdmin ? (
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
      ) : showAnalytics ? (
        isAuthed && shouldSelectOrg ? (
          <OrgSelectScreen orgs={orgItems} activeOrgId={activeOrg} busy={orgSwitchBusy} onSelect={handleOrgSelect} />
        ) : (
          <AnalyticsApp />
        )
      ) : wantsWorkspace || wantsAnalytics ? (
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
        locked={Boolean((pathname.startsWith("/app") || pathname.startsWith("/admin")) && !isAuthed)}
        onClose={handleModalClose}
        onSuccess={handleLoginSuccess}
      />
    </>
  );
}

export default function RootApp() {
  return (
    <AuthProvider>
      <FeatureFlagsProvider>
        <AppRoutes />
      </FeatureFlagsProvider>
    </AuthProvider>
  );
}
