import { useCallback, useState } from "react";

export default function useAppShellController({
  initialOrgSettingsOpen = false,
  initialOrgSettingsTab = "members",
  initialLeftHidden = false,
  initialLeftCompact = false,
  initialStepTimeUnit = "min",
  normalizeOrgSettingsTab,
  normalizeStepTimeUnit,
  writeStepTimeUnit,
  leftPanelOpenKey = "ui.sidebar.left.open",
  leftPanelCompactKey = "fpc_leftpanel_compact",
  setSidebarActiveSection,
  setSidebarShortcutRequest,
}) {
  const [orgSettingsOpen, setOrgSettingsOpen] = useState(initialOrgSettingsOpen);
  const [orgSettingsTab, setOrgSettingsTab] = useState(initialOrgSettingsTab);
  const [orgSettingsOperationKey, setOrgSettingsOperationKey] = useState("");
  const [orgSettingsDictionaryOnly, setOrgSettingsDictionaryOnly] = useState(false);
  const [orgPropertyDictionaryRevision, setOrgPropertyDictionaryRevision] = useState(0);

  const [leftHidden, setLeftHidden] = useState(initialLeftHidden);
  const [leftCompact, setLeftCompact] = useState(initialLeftCompact);
  const [stepTimeUnit, setStepTimeUnit] = useState(initialStepTimeUnit);

  const handleStepTimeUnitChange = useCallback((nextUnitRaw) => {
    const nextUnit = normalizeStepTimeUnit(nextUnitRaw);
    setStepTimeUnit((prev) => {
      if (prev === nextUnit) return prev;
      writeStepTimeUnit(nextUnit);
      return nextUnit;
    });
  }, [normalizeStepTimeUnit, writeStepTimeUnit]);

  const handleToggleLeft = useCallback((source = "button") => {
    const rawSource = String(source || "button");
    const shortcutPrefix = "global_handle:";
    const shortcutId = rawSource.startsWith(shortcutPrefix)
      ? String(rawSource.slice(shortcutPrefix.length) || "").trim()
      : "";
    setLeftHidden((prev) => {
      const next = !prev;
      let persisted = 0;
      try {
        window.sessionStorage?.setItem(leftPanelOpenKey, next ? "0" : "1");
        persisted = 1;
      } catch {
        persisted = 0;
      }
      if (prev && !next) {
        setLeftCompact(false);
        try {
          window.localStorage?.setItem(leftPanelCompactKey, "0");
        } catch {
        }
      }
      if (prev && !next && shortcutId && shortcutId !== "open") {
        setSidebarShortcutRequest(shortcutId);
        setSidebarActiveSection(shortcutId);
      }
      // eslint-disable-next-line no-console
      console.debug(`[UI] sidebar.toggle next=${next ? 1 : 0} source=${rawSource} persisted=${persisted}`);
      return next;
    });
  }, [leftPanelOpenKey, leftPanelCompactKey, setSidebarActiveSection, setSidebarShortcutRequest]);

  const handleSidebarCompact = useCallback((nextValue, source = "sidebar") => {
    const next = typeof nextValue === "boolean" ? nextValue : !leftCompact;
    setLeftCompact(next);
    try {
      window.localStorage?.setItem(leftPanelCompactKey, next ? "1" : "0");
    } catch {
    }
    // eslint-disable-next-line no-console
    console.debug(`[UI] sidebar.compact next=${next ? 1 : 0} source=${String(source || "sidebar")}`);
  }, [leftCompact, leftPanelCompactKey]);

  const closeLeftSidebar = useCallback((source = "sidebar_close") => {
    setLeftHidden((prev) => {
      if (prev) return true;
      try {
        window.sessionStorage?.setItem(leftPanelOpenKey, "0");
      } catch {
      }
      // eslint-disable-next-line no-console
      console.debug(`[UI] sidebar.force_close source=${String(source || "sidebar_close")}`);
      return true;
    });
    setLeftCompact(false);
    try {
      window.localStorage?.setItem(leftPanelCompactKey, "0");
    } catch {
    }
  }, [leftPanelOpenKey, leftPanelCompactKey]);

  const openOrgSettings = useCallback((options = {}) => {
    const nextTab = normalizeOrgSettingsTab(options?.tab);
    const nextDictionaryOnly = nextTab === "dictionary" && !!options?.dictionaryOnly;
    setOrgSettingsTab(nextTab);
    setOrgSettingsOperationKey(String(options?.operationKey || options?.operation_key || "").trim());
    setOrgSettingsDictionaryOnly(nextDictionaryOnly);
    setOrgSettingsOpen(true);
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const pathname = String(url.pathname || "");
      url.pathname = "/app/org";
      if (nextTab === "members") url.searchParams.delete("tab");
      else url.searchParams.set("tab", nextTab);
      const nextHref = `${url.pathname}${url.search}${url.hash}`;
      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextHref === currentHref && pathname.startsWith("/app/org")) return;
      window.history.pushState({}, "", nextHref);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
    }
  }, [normalizeOrgSettingsTab]);

  const closeOrgSettings = useCallback(() => {
    setOrgSettingsOpen(false);
    setOrgSettingsOperationKey("");
    setOrgSettingsDictionaryOnly(false);
    if (typeof window === "undefined") return;
    const pathname = String(window.location.pathname || "");
    if (!pathname.startsWith("/app/org")) return;
    try {
      const url = new URL(window.location.href);
      url.pathname = "/app";
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
    }
  }, []);

  const notifyOrgPropertyDictionaryChanged = useCallback(() => {
    setOrgPropertyDictionaryRevision((prev) => prev + 1);
  }, []);

  return {
    orgSettingsOpen,
    setOrgSettingsOpen,
    orgSettingsTab,
    setOrgSettingsTab,
    orgSettingsOperationKey,
    orgSettingsDictionaryOnly,
    setOrgSettingsDictionaryOnly,
    orgPropertyDictionaryRevision,
    openOrgSettings,
    closeOrgSettings,
    notifyOrgPropertyDictionaryChanged,
    leftHidden,
    setLeftHidden,
    leftCompact,
    stepTimeUnit,
    handleStepTimeUnitChange,
    handleToggleLeft,
    handleSidebarCompact,
    closeLeftSidebar,
  };
}
