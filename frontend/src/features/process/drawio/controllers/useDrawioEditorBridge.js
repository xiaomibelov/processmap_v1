import { useCallback, useEffect, useMemo, useState } from "react";
import { getDrawioOverlayStatus } from "../domain/drawioVisibility";
import { extractDrawioElementIdsFromSvg } from "../drawioSvg";

function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolvePrimaryLayerId(metaRaw = {}) {
  const meta = asObject(metaRaw);
  const activeLayerId = toText(meta.active_layer_id);
  if (activeLayerId) return activeLayerId;
  const firstLayerId = toText(asObject(asArray(meta.drawio_layers_v1)[0]).id);
  if (firstLayerId) return firstLayerId;
  return "DL1";
}

function buildElementsFromSvg(prevMetaRaw, svgRaw) {
  const prevMeta = asObject(prevMetaRaw);
  const ids = extractDrawioElementIdsFromSvg(svgRaw);
  const prevById = new Map();
  asArray(prevMeta.drawio_elements_v1).forEach((rowRaw) => {
    const row = asObject(rowRaw);
    const id = toText(row.id);
    if (!id || prevById.has(id)) return;
    prevById.set(id, row);
  });
  if (!ids.length) return asArray(prevMeta.drawio_elements_v1);
  const layerId = resolvePrimaryLayerId(prevMeta);
  const nextRows = ids.map((id, index) => {
    const prev = asObject(prevById.get(id));
    return {
      ...prev,
      id,
      layer_id: toText(prev.layer_id) || layerId,
      visible: prev.visible !== false,
      locked: prev.locked === true,
      deleted: false,
      opacity: Number.isFinite(Number(prev.opacity)) ? Number(prev.opacity) : 1,
      offset_x: Number.isFinite(Number(prev.offset_x ?? prev.offsetX)) ? Number(prev.offset_x ?? prev.offsetX) : 0,
      offset_y: Number.isFinite(Number(prev.offset_y ?? prev.offsetY)) ? Number(prev.offset_y ?? prev.offsetY) : 0,
      z_index: Number.isFinite(Number(prev.z_index)) ? Number(prev.z_index) : index,
    };
  });
  return nextRows;
}

export default function useDrawioEditorBridge({
  sid,
  drawioMetaRef,
  drawioEditorOpen,
  normalizeDrawioMeta,
  isDrawioXml,
  readFileText,
  setDrawioEditorOpen,
  setInfoMsg,
  setGenErr,
  downloadTextFile,
  applyDrawioMutation,
}) {
  const [editorLifecycle, setEditorLifecycle] = useState({
    key: "idle",
    lastSavedAt: "",
  });

  const openEmbeddedDrawioEditor = useCallback(() => {
    const current = normalizeDrawioMeta(drawioMetaRef.current);
    if (current.locked === true) {
      setInfoMsg("Draw.io overlay заблокирован. Снимите lock, чтобы редактировать.");
      setGenErr("");
      return false;
    }
    setDrawioEditorOpen(true);
    setEditorLifecycle((prev) => ({ ...prev, key: "opened" }));
    return true;
  }, [drawioMetaRef, normalizeDrawioMeta, setDrawioEditorOpen, setGenErr, setInfoMsg]);

  const closeEmbeddedDrawioEditor = useCallback(() => {
    setDrawioEditorOpen(false);
    setEditorLifecycle((prev) => ({
      ...prev,
      key: prev.key === "saved" ? "saved" : "closed",
    }));
  }, [setDrawioEditorOpen]);

  const handleDrawioEditorSave = useCallback(async (payloadRaw = {}) => {
    const payload = asObject(payloadRaw);
    const docXml = toText(payload.docXml || payload.doc_xml || payload.xml);
    const svgCache = toText(payload.svgCache || payload.svg_cache || payload.svg);
    if (!isDrawioXml(docXml)) {
      setGenErr("Draw.io вернул некорректный документ.");
      return false;
    }
    const result = applyDrawioMutation((prev) => {
      const next = {
        ...prev,
        enabled: true,
        doc_xml: docXml,
        svg_cache: svgCache,
        last_saved_at: new Date().toISOString(),
      };
      next.drawio_layers_v1 = asArray(next.drawio_layers_v1).length
        ? asArray(next.drawio_layers_v1)
        : [{ id: "DL1", name: "Default", visible: true, locked: false, opacity: 1 }];
      next.active_layer_id = toText(next.active_layer_id) || resolvePrimaryLayerId(next);
      next.drawio_elements_v1 = buildElementsFromSvg(next, svgCache);
      return next;
    }, {
      source: "drawio_editor_save",
      playbackStage: "drawio_editor_save",
      persist: true,
    });
    if (!result.changed) return true;
    const persisted = await Promise.resolve(result.persistPromise).catch((error) => ({
      ok: false,
      error: String(error?.message || error || "drawio_persist_failed"),
    }));
    if (!persisted?.ok) {
      setGenErr("Не удалось сохранить Draw.io в session meta.");
      return false;
    }
    setDrawioEditorOpen(false);
    setEditorLifecycle({
      key: "saved",
      lastSavedAt: toText(asObject(result.next).last_saved_at) || new Date().toISOString(),
    });
    setInfoMsg(svgCache ? "Draw.io сохранён." : "Draw.io сохранён без SVG preview.");
    setGenErr("");
    return true;
  }, [applyDrawioMutation, isDrawioXml, setDrawioEditorOpen, setGenErr, setInfoMsg]);

  const exportEmbeddedDrawio = useCallback(() => {
    const current = normalizeDrawioMeta(drawioMetaRef.current);
    const xml = toText(current.doc_xml);
    if (!xml) {
      setInfoMsg("Draw.io документ пока пуст. Сначала открой редактор и нажми Save.");
      setGenErr("");
      return false;
    }
    const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) || Date.now();
    const ok = downloadTextFile(`drawio_${sid || "session"}_${stamp}.drawio`, xml, "application/xml;charset=utf-8");
    if (ok) {
      setEditorLifecycle((prev) => ({ ...prev, key: "exported" }));
      setInfoMsg("Draw.io экспортирован (.drawio).");
      setGenErr("");
      return true;
    }
    setGenErr("Не удалось экспортировать Draw.io.");
    return false;
  }, [downloadTextFile, drawioMetaRef, normalizeDrawioMeta, setGenErr, setInfoMsg, sid]);

  const handleDrawioImportFile = useCallback(async (fileRaw) => {
    const file = fileRaw instanceof File ? fileRaw : null;
    if (!file) return false;
    const text = toText(await readFileText(file).catch(() => ""));
    if (!isDrawioXml(text)) {
      setGenErr("Импорт Draw.io ожидает файл .drawio / <mxfile>.");
      return false;
    }
    applyDrawioMutation((prev) => ({
      ...prev,
      enabled: true,
      doc_xml: text,
      svg_cache: prev.svg_cache,
    }), {
      source: "drawio_import_stage",
      playbackStage: "drawio_import_stage",
      persist: true,
    });
    setDrawioEditorOpen(true);
    setEditorLifecycle((prev) => ({ ...prev, key: "imported" }));
    setInfoMsg("Файл Draw.io загружен. Нажми Save в редакторе, чтобы обновить preview.");
    setGenErr("");
    return true;
  }, [applyDrawioMutation, isDrawioXml, readFileText, setDrawioEditorOpen, setGenErr, setInfoMsg]);

  const status = useMemo(() => {
    const current = normalizeDrawioMeta(drawioMetaRef.current);
    const overlay = getDrawioOverlayStatus(current);
    const persistedSavedAt = toText(current.last_saved_at);
    const lastSavedAt = persistedSavedAt || toText(editorLifecycle.lastSavedAt);
    const previewStatus = overlay.hasPreview ? "available" : "missing";
    const editorStatus = drawioEditorOpen ? "opened" : (editorLifecycle.key || "idle");
    return {
      editorAvailable: current.locked !== true,
      overlay,
      overlayEnabled: overlay.enabled === true,
      overlayStatusKey: overlay.key,
      overlayStatusLabel: overlay.label,
      previewAvailable: overlay.hasPreview,
      previewStatus,
      docAvailable: toText(current.doc_xml).length > 0,
      editorOpened: !!drawioEditorOpen,
      editorStatus,
      lastSavedAt,
      saved: editorStatus === "saved" && lastSavedAt.length > 0,
    };
  }, [drawioEditorOpen, drawioMetaRef, editorLifecycle, normalizeDrawioMeta]);

  const setOpacityForBridge = useCallback((valueRaw) => {
    const opacity = Math.max(0.05, Math.min(1, Number(valueRaw || 1)));
    applyDrawioMutation((prev) => ({
      ...prev,
      opacity,
    }), {
      source: "drawio_opacity_change",
      playbackStage: "drawio_opacity_change",
      persist: true,
    });
  }, [applyDrawioMutation]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const e2eApi = {
      openEditor() {
        setDrawioEditorOpen(true);
      },
      savePayload(payloadRaw = {}) {
        return handleDrawioEditorSave(payloadRaw);
      },
      importXml(xmlRaw, filenameRaw = "e2e.drawio") {
        if (typeof File !== "function") return false;
        return handleDrawioImportFile(
          new File([String(xmlRaw || "")], String(filenameRaw || "e2e.drawio"), {
            type: "application/xml",
          }),
        );
      },
      setOpacity(valueRaw) {
        setOpacityForBridge(valueRaw);
      },
      readMeta() {
        return normalizeDrawioMeta(drawioMetaRef.current);
      },
    };
    window.__FPC_E2E_DRAWIO__ = e2eApi;
    return () => {
      if (window.__FPC_E2E_DRAWIO__ === e2eApi) {
        window.__FPC_E2E_DRAWIO__ = null;
      }
    };
  }, [drawioMetaRef, handleDrawioEditorSave, normalizeDrawioMeta, setDrawioEditorOpen, setOpacityForBridge]);

  return {
    status,
    openEmbeddedDrawioEditor,
    closeEmbeddedDrawioEditor,
    handleDrawioEditorSave,
    exportEmbeddedDrawio,
    handleDrawioImportFile,
  };
}
