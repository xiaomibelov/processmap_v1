import { useEffect, useMemo, useState } from "react";

import App from "./App";
import { AuthProvider, useAuth } from "./features/auth/AuthProvider";
import LoginModal from "./features/auth/LoginModal";
import LoginPage from "./features/auth/LoginPage";
import PublicHomePage from "./features/auth/PublicHomePage";

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

function AppRoutes() {
  const { isAuthed, loading, reauthRequired, setReauthRequired } = useAuth();
  const [loc, setLoc] = useState(() => readLocation());
  const [loginModalOpen, setLoginModalOpen] = useState(false);

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

  const nextFromQuery = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("next") || "";
  }, [search]);

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
    if (!loading && pathname.startsWith("/app") && !isAuthed && reauthRequired) {
      setLoginModalOpen(true);
    }
    if (isAuthed) {
      setLoginModalOpen(false);
      setReauthRequired(false);
    }
  }, [isAuthed, loading, pathname, reauthRequired, setReauthRequired]);

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
        <App />
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
