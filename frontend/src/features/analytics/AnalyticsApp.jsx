import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import AnalyticsPage from "./AnalyticsPage.jsx";
import {
  buildAnalyticsPath,
  parseAnalyticsPath,
  readLegacyAnalyticsRedirect,
} from "../../app/processMapRouteModel.js";

function readLocation() {
  if (typeof window === "undefined") {
    return { pathname: "/analytics", search: "" };
  }
  return {
    pathname: window.location.pathname || "/analytics",
    search: window.location.search || "",
  };
}

export default function AnalyticsApp() {
  const { activeOrgId } = useAuth();
  const [loc, setLoc] = useState(readLocation);

  useEffect(() => {
    function onPopState() {
      setLoc(readLocation());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const redirect = readLegacyAnalyticsRedirect(window.location);
    if (redirect && redirect.scope && redirect.scopeId) {
      const target = buildAnalyticsPath(redirect.scope, redirect.scopeId, redirect.module);
      if (target !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState({}, "", target);
        setLoc(readLocation());
      }
    }
  }, []);

  const parsed = useMemo(() => parseAnalyticsPath(loc.pathname), [loc.pathname]);

  if (!parsed || !parsed.scopeId) {
    return (
      <div className="analyticsHubPage">
        <div className="analyticsHubSurface">
          <h1>Аналитика</h1>
          <p className="mt-2 text-muted">Выберите workspace, проект или сессию для просмотра аналитики.</p>
        </div>
      </div>
    );
  }

  return (
    <AnalyticsPage
      key={`${parsed.scope}-${parsed.scopeId}-${parsed.module}`}
      scope={parsed.scope}
      scopeId={parsed.scopeId}
      module={parsed.module}
      orgId={activeOrgId}
    />
  );
}
