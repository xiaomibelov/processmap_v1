import { useCallback, useEffect, useRef, useState } from "react";

// Holds the To-Be documents layer state: the document list shown on the
// canvas, plus a ref mirror the save pipeline reads when serializing the
// session draft (`to_be_documents`). Hydration happens once per session —
// later draft updates must not clobber locally added documents.
export function useTobeLayer({ sessionId, draftDocuments } = {}) {
  const [documents, setDocumentsState] = useState([]);
  const documentsRef = useRef([]);
  const hydratedSessionRef = useRef("");

  useEffect(() => {
    const sid = String(sessionId || "").trim();
    if (!sid || hydratedSessionRef.current === sid) return;
    hydratedSessionRef.current = sid;
    const next = Array.isArray(draftDocuments) ? draftDocuments : [];
    documentsRef.current = next;
    setDocumentsState(next);
  }, [sessionId, draftDocuments]);

  const setDocuments = useCallback((nextRaw) => {
    const next = typeof nextRaw === "function" ? nextRaw(documentsRef.current) : nextRaw;
    const list = Array.isArray(next) ? next : [];
    documentsRef.current = list;
    setDocumentsState(list);
  }, []);

  return { documents, documentsRef, setDocuments };
}
