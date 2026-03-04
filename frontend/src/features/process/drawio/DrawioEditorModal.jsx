import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Modal from "../../../shared/ui/Modal";

const DRAWIO_EMBED_SRC = "https://embed.diagrams.net/?embed=1&proto=json&spin=1&configure=1&libraries=1&ui=atlas";
const EMPTY_DRAWIO_DOC = "<mxfile host=\"ProcessMap\" version=\"1\"><diagram id=\"page-1\" name=\"Page-1\"><mxGraphModel dx=\"960\" dy=\"720\" grid=\"1\" gridSize=\"10\" guides=\"1\" tooltips=\"1\" connect=\"1\" arrows=\"1\" fold=\"1\" page=\"1\" pageScale=\"1\" pageWidth=\"1169\" pageHeight=\"827\" math=\"0\" shadow=\"0\"><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/></root></mxGraphModel></diagram></mxfile>";

function toText(value) {
  return String(value || "").trim();
}

function parseEditorMessage(dataRaw) {
  if (dataRaw && typeof dataRaw === "object") return dataRaw;
  const text = toText(dataRaw);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function DrawioEditorModal({
  open,
  initialXml,
  title = "Draw.io Editor",
  onSave,
  onClose,
}) {
  const iframeRef = useRef(null);
  const loadedXmlRef = useRef("");
  const pendingSaveXmlRef = useRef("");
  const [status, setStatus] = useState("Инициализация редактора…");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const startXml = useMemo(() => toText(initialXml) || EMPTY_DRAWIO_DOC, [initialXml]);

  const postMessageToEditor = useCallback((payload) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return false;
    win.postMessage(JSON.stringify(payload), "*");
    return true;
  }, []);

  const loadDocument = useCallback(() => {
    const xml = toText(loadedXmlRef.current) || EMPTY_DRAWIO_DOC;
    setStatus("Загружаем draw.io…");
    postMessageToEditor({
      action: "load",
      xml,
      autosave: 0,
      modified: "unsavedChanges",
      saveAndExit: 0,
      noExitBtn: 1,
    });
  }, [postMessageToEditor]);

  useEffect(() => {
    if (!open) return;
    loadedXmlRef.current = startXml;
    pendingSaveXmlRef.current = "";
    setReady(false);
    setSaving(false);
    setStatus("Инициализация редактора…");
  }, [open, startXml]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    const onMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = parseEditorMessage(event.data);
      if (!msg) return;
      const evtName = toText(msg.event || msg.action).toLowerCase();
      if (evtName === "configure") {
        postMessageToEditor({
          action: "configure",
          config: {},
        });
        return;
      }
      if (evtName === "init") {
        setReady(true);
        loadDocument();
        return;
      }
      if (evtName === "load") {
        setStatus("Редактор готов.");
        return;
      }
      if (evtName === "save") {
        pendingSaveXmlRef.current = toText(msg.xml || msg.data) || loadedXmlRef.current || EMPTY_DRAWIO_DOC;
        setSaving(true);
        setStatus("Экспортируем SVG…");
        postMessageToEditor({
          action: "export",
          format: "svg",
          xml: pendingSaveXmlRef.current,
          spinKey: "saving",
        });
        return;
      }
      if (evtName === "export") {
        const nextXml = toText(pendingSaveXmlRef.current) || loadedXmlRef.current || EMPTY_DRAWIO_DOC;
        const svgCache = toText(msg.data);
        loadedXmlRef.current = nextXml;
        pendingSaveXmlRef.current = "";
        setSaving(false);
        setStatus("Сохранено.");
        onSave?.({
          docXml: nextXml,
          svgCache,
        });
        return;
      }
      if (evtName === "exit") {
        onClose?.();
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [loadDocument, onClose, onSave, open, postMessageToEditor]);

  return (
    <Modal
      open={open}
      title={title}
      onClose={() => {
        if (!saving) onClose?.();
      }}
      footer={(
        <div className="flex w-full items-center justify-between gap-2">
          <div className="text-xs text-muted" data-testid="drawio-editor-status">{status}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="secondaryBtn h-9 px-3 text-sm"
              onClick={onClose}
              disabled={saving}
            >
              Закрыть
            </button>
            <button
              type="button"
              className="primaryBtn h-9 px-3 text-sm"
              onClick={() => {
                setStatus("Запрашиваем сохранение…");
                setSaving(true);
                postMessageToEditor({ action: "save" });
              }}
              disabled={!ready || saving}
              data-testid="drawio-editor-save"
            >
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </div>
      )}
    >
      <div className="flex h-[75vh] min-h-[560px] flex-col">
        <iframe
          ref={iframeRef}
          title="Embedded Draw.io"
          src={DRAWIO_EMBED_SRC}
          className="h-full w-full rounded-xl border border-border bg-white"
          allow="clipboard-read; clipboard-write"
          data-testid="drawio-editor-iframe"
        />
      </div>
    </Modal>
  );
}
