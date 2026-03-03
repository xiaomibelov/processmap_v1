import { useEffect, useMemo, useRef, useState } from "react";

import App from "./App";
import { AuthProvider, useAuth } from "./features/auth/AuthProvider";
import LoginModal from "./features/auth/LoginModal";
import LoginPage from "./features/auth/LoginPage";
import PublicHomePage from "./features/auth/PublicHomePage";
import { apiAcceptInviteToken } from "./lib/api";

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
  if (!src.startsWith("/app")) return "/app";
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

function mapInviteAcceptError(result) {
  const status = Number(result?.status || 0);
  const marker = String(result?.error || "").toLowerCase();
  if (status === 409 && marker.includes("email")) return "Email аккаунта не совпадает с приглашением.";
  if (status === 410) return "Срок действия приглашения истёк.";
  if (status === 404) return "Приглашение не найдено или уже недоступно.";
  if (status === 401) return "Требуется вход в систему.";
  if (status === 429) return "Слишком много попыток. Попробуйте позже.";
  if (status >= 500) return "Ошибка сервера при принятии приглашения.";
  return "Не удалось принять приглашение.";
}

function OrgSelectScreen({ orgs, activeOrgId, busy, onSelect }) {
  const items = normalizeOrgMemberships(orgs);
  return (
    <div className="flex h-screen items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-panel p-5 shadow-panel">
        <h1 className="text-lg font-semibold text-fg">Выберите организацию</h1>
        <p className="mt-1 text-sm text-muted">Текущий workspace откроется в выбранном org-контексте.</p>
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
                <div className="mt-0.5 text-xs text-muted">{role ? `Role: ${role}` : "Role: viewer"}</div>
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
  const [acceptInviteBusy, setAcceptInviteBusy] = useState(false);
  const [acceptInviteError, setAcceptInviteError] = useState("");
  const acceptInviteAttemptRef = useRef("");

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
  const shouldSelectOrg = Boolean(isAuthed && pathname.startsWith("/app") && orgItems.length > 1 && !orgChoiceDone);

  const nextFromQuery = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("next") || "";
  }, [search]);
  const inviteToken = useMemo(() => {
    const params = new URLSearchParams(search);
    return String(params.get("token") || "").trim();
  }, [search]);
  const isAcceptInviteRoute = pathname === "/accept-invite";

  useEffect(() => {
    if (loading) return;

    if (isAuthed && (pathname === "/" || pathname === "/login")) {
      navigate("/app", { replace: true });
      return;
    }

    if (!isAuthed && pathname.startsWith("/app") && !reauthRequired) {
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
    if (!loading && pathname.startsWith("/app") && !isAuthed && reauthRequired) {
      setLoginModalOpen(true);
    }
    if (isAuthed) {
      setLoginModalOpen(false);
      setReauthRequired(false);
    }
  }, [isAuthed, loading, pathname, reauthRequired, setReauthRequired]);

  useEffect(() => {
    if (!isAcceptInviteRoute) {
      acceptInviteAttemptRef.current = "";
      setAcceptInviteBusy(false);
      setAcceptInviteError("");
      return;
    }
    if (loading || !isAuthed) return;
    if (!inviteToken) {
      setAcceptInviteError("В ссылке отсутствует token приглашения.");
      return;
    }
    const attemptKey = `${String(user?.id || "").trim()}::${inviteToken}`;
    if (acceptInviteAttemptRef.current === attemptKey) return;
    acceptInviteAttemptRef.current = attemptKey;
    let canceled = false;
    setAcceptInviteBusy(true);
    setAcceptInviteError("");
    void (async () => {
      const accepted = await apiAcceptInviteToken(inviteToken);
      if (!accepted?.ok) {
        if (!canceled) {
          setAcceptInviteBusy(false);
          setAcceptInviteError(mapInviteAcceptError(accepted));
        }
        return;
      }
      const acceptedOrgId = String(accepted?.membership?.org_id || accepted?.invite?.org_id || "").trim();
      await refreshOrgs();
      if (acceptedOrgId) {
        await switchOrg(acceptedOrgId, { refreshMe: false, allowMissing: true });
      }
      if (!canceled) {
        setAcceptInviteBusy(false);
        setReauthRequired(false);
        navigate("/app", { replace: true });
      }
    })();
    return () => {
      canceled = true;
    };
  }, [inviteToken, isAcceptInviteRoute, isAuthed, loading, refreshOrgs, setReauthRequired, switchOrg, user?.id]);

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
    if (!isAuthed && pathname.startsWith("/app")) {
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
      if (pathname !== "/app") navigate("/app", { replace: true });
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

  const showWorkspace = pathname.startsWith("/app") && (isAuthed || reauthRequired);

  return (
    <>
      {showWorkspace ? (
        isAuthed && shouldSelectOrg ? (
          <OrgSelectScreen orgs={orgItems} activeOrgId={activeOrg} busy={orgSwitchBusy} onSelect={handleOrgSelect} />
        ) : (
          <App />
        )
      ) : isAcceptInviteRoute ? (
        isAuthed ? (
          <div className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-lg rounded-2xl border border-border bg-panel p-6">
              <h1 className="text-xl font-semibold text-fg">Принятие приглашения</h1>
              {acceptInviteBusy ? <p className="mt-2 text-sm text-muted">Применяем приглашение к вашему аккаунту…</p> : null}
              {acceptInviteError ? (
                <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {acceptInviteError}
                </div>
              ) : null}
              {!acceptInviteBusy && !acceptInviteError ? <p className="mt-2 text-sm text-muted">Готово. Переходим в рабочую зону…</p> : null}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="secondaryBtn h-10 min-h-0 px-4 py-0 text-sm"
                  onClick={() => navigate("/app", { replace: true })}
                >
                  В рабочую зону
                </button>
                {acceptInviteError ? (
                  <button
                    type="button"
                    className="primaryBtn h-10 min-h-0 px-4 py-0 text-sm"
                    onClick={() => {
                      acceptInviteAttemptRef.current = "";
                      setAcceptInviteError("");
                    }}
                  >
                    Повторить
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <LoginPage
            onBack={() => navigate("/")}
            onSuccess={() => {
              setReauthRequired(false);
            }}
          />
        )
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
        />
      )}

      <LoginModal
        open={loginModalOpen}
        locked={Boolean(pathname.startsWith("/app") && !isAuthed)}
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
