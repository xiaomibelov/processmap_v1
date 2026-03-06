import { useEffect, useMemo, useRef, useState } from "react";
import {
  getHybridUiStorageKey,
  loadHybridUiPrefs,
  normalizeHybridLayerMap,
  normalizeHybridUiPrefs,
  saveHybridUiPrefs,
} from "../hybridLayerUi.js";
import { docToComparableJson, normalizeHybridV2Doc } from "../hybridLayerV2.js";
import { normalizeDrawioMeta, serializeDrawioMeta } from "../../drawio/drawioMeta.js";
import { pushDeleteTrace } from "../../stage/utils/deleteTrace";
import {
  hasKnownHybridV2Session,
  markKnownHybridV2Session,
  serializeHybridLayerMap,
  toText,
} from "../../stage/utils/processStageHelpers.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function useHybridStore({
  sid,
  draftBpmnMeta,
  userId,
}) {
  const hybridLayerDragRef = useRef(null);
  const hybridLayerMapRef = useRef({});
  const hybridLayerPersistedMapRef = useRef({});
  const hybridAutoFocusGuardRef = useRef("");
  const hybridV2DocRef = useRef(normalizeHybridV2Doc({}));
  const hybridV2PersistedDocRef = useRef(normalizeHybridV2Doc({}));
  const drawioMetaRef = useRef(normalizeDrawioMeta({}));
  const drawioPersistedMetaRef = useRef(normalizeDrawioMeta({}));
  const hybridV2MigrationGuardRef = useRef("");

  const [hybridUiPrefs, setHybridUiPrefs] = useState(() => normalizeHybridUiPrefs({}));
  const [hybridPeekActive, setHybridPeekActive] = useState(false);
  const [hybridLayerByElementId, setHybridLayerByElementId] = useState({});
  const [hybridLayerActiveElementId, setHybridLayerActiveElementId] = useState("");
  const [hybridV2Doc, setHybridV2Doc] = useState(() => normalizeHybridV2Doc({}));
  const [hybridV2BindPickMode, setHybridV2BindPickMode] = useState(false);
  const [drawioMeta, setDrawioMeta] = useState(() => normalizeDrawioMeta({}));
  const [drawioEditorOpen, setDrawioEditorOpen] = useState(false);

  const hybridLayerMapFromDraft = useMemo(
    () => normalizeHybridLayerMap(asObject(asObject(draftBpmnMeta).hybrid_layer_by_element_id)),
    [draftBpmnMeta],
  );
  const hybridV2FromDraft = useMemo(
    () => normalizeHybridV2Doc(asObject(asObject(draftBpmnMeta).hybrid_v2)),
    [draftBpmnMeta],
  );
  const drawioFromDraft = useMemo(
    () => normalizeDrawioMeta(asObject(asObject(draftBpmnMeta).drawio)),
    [draftBpmnMeta],
  );
  const hybridStorageKey = useMemo(() => getHybridUiStorageKey(toText(userId)), [userId]);

  const hybridVisible = !!hybridUiPrefs.visible || !!hybridPeekActive;
  const drawioVisible = !!drawioMeta.enabled && !!toText(drawioMeta.svg_cache);
  const overlayLayerVisible = hybridVisible || drawioVisible;
  const hybridModeEffective = hybridVisible
    ? (hybridPeekActive ? "view" : (hybridUiPrefs.mode === "edit" && !hybridUiPrefs.lock ? "edit" : "view"))
    : "hidden";
  const hybridOpacityValue = Number(hybridUiPrefs.opacity || 60) / 100;

  useEffect(() => {
    setHybridPeekActive(false);
    setHybridLayerActiveElementId("");
    const emptyV2 = normalizeHybridV2Doc({});
    setHybridV2Doc(emptyV2);
    hybridV2DocRef.current = emptyV2;
    hybridV2PersistedDocRef.current = emptyV2;
    hybridV2MigrationGuardRef.current = "";
    setHybridV2BindPickMode(false);
    const emptyDrawio = normalizeDrawioMeta({});
    setDrawioMeta(emptyDrawio);
    drawioMetaRef.current = emptyDrawio;
    drawioPersistedMetaRef.current = emptyDrawio;
    setDrawioEditorOpen(false);
  }, [sid]);

  useEffect(() => {
    const incoming = normalizeHybridLayerMap(hybridLayerMapFromDraft);
    const incomingSig = serializeHybridLayerMap(incoming);
    const currentSig = serializeHybridLayerMap(hybridLayerMapRef.current);
    const persistedSig = serializeHybridLayerMap(hybridLayerPersistedMapRef.current);
    if (incomingSig === persistedSig && currentSig !== incomingSig) return;
    setHybridLayerByElementId(incoming);
    hybridLayerMapRef.current = incoming;
    hybridLayerPersistedMapRef.current = incoming;
  }, [hybridLayerMapFromDraft]);

  useEffect(() => {
    hybridLayerMapRef.current = normalizeHybridLayerMap(hybridLayerByElementId);
  }, [hybridLayerByElementId]);

  useEffect(() => {
    const incoming = normalizeHybridV2Doc(hybridV2FromDraft);
    const incomingSig = docToComparableJson(incoming);
    const currentDoc = normalizeHybridV2Doc(hybridV2DocRef.current);
    const persistedDoc = normalizeHybridV2Doc(hybridV2PersistedDocRef.current);
    const currentSig = docToComparableJson(currentDoc);
    const persistedSig = docToComparableJson(persistedDoc);
    const incomingCount = Number(asArray(incoming.elements).length) + Number(asArray(incoming.edges).length);
    const currentCount = Number(asArray(currentDoc.elements).length) + Number(asArray(currentDoc.edges).length);
    const persistedCount = Number(asArray(persistedDoc.elements).length) + Number(asArray(persistedDoc.edges).length);
    if (incomingSig === persistedSig && currentSig !== incomingSig) return;
    if (incomingCount <= 0 && incomingSig !== currentSig && (currentCount > 0 || persistedCount > 0)) return;
    setHybridV2Doc(incoming);
    hybridV2DocRef.current = incoming;
    hybridV2PersistedDocRef.current = incoming;
  }, [hybridV2FromDraft]);

  useEffect(() => {
    hybridV2DocRef.current = normalizeHybridV2Doc(hybridV2Doc);
  }, [hybridV2Doc]);

  useEffect(() => {
    const incoming = normalizeDrawioMeta(drawioFromDraft);
    const incomingSig = serializeDrawioMeta(incoming);
    const currentMeta = normalizeDrawioMeta(drawioMetaRef.current);
    const persistedMeta = normalizeDrawioMeta(drawioPersistedMetaRef.current);
    const currentSig = serializeDrawioMeta(currentMeta);
    const persistedSig = serializeDrawioMeta(persistedMeta);
    if (incomingSig === persistedSig && currentSig !== incomingSig) {
      pushDeleteTrace("drawio_hydrate_skip", {
        reason: "incoming_equals_persisted_current_differs",
        incomingSvg: Number(String(incoming?.svg_cache || "").length || 0),
        currentSvg: Number(String(currentMeta?.svg_cache || "").length || 0),
      });
      return;
    }
    if (!incoming.doc_xml && !incoming.svg_cache && (currentMeta.doc_xml || currentMeta.svg_cache)) {
      pushDeleteTrace("drawio_hydrate_skip", {
        reason: "incoming_empty_while_current_has_payload",
        incomingSvg: Number(String(incoming?.svg_cache || "").length || 0),
        currentSvg: Number(String(currentMeta?.svg_cache || "").length || 0),
      });
      return;
    }
    pushDeleteTrace("drawio_hydrate_apply", {
      incomingSvg: Number(String(incoming?.svg_cache || "").length || 0),
      incomingElements: Number(Array.isArray(incoming?.drawio_elements_v1) ? incoming.drawio_elements_v1.length : 0),
      currentSvg: Number(String(currentMeta?.svg_cache || "").length || 0),
    });
    setDrawioMeta(incoming);
    drawioMetaRef.current = incoming;
    drawioPersistedMetaRef.current = incoming;
  }, [drawioFromDraft]);

  useEffect(() => {
    drawioMetaRef.current = normalizeDrawioMeta(drawioMeta);
  }, [drawioMeta]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const count = Number(asArray(hybridV2Doc?.elements).length || 0) + Number(asArray(hybridV2Doc?.edges).length || 0);
    if (count <= 0 || !sid) return;
    markKnownHybridV2Session(window.localStorage, sid);
  }, [hybridV2Doc, sid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loaded = normalizeHybridUiPrefs(
      loadHybridUiPrefs(window.localStorage, hybridStorageKey, toText(userId)),
    );
    setHybridUiPrefs((prevRaw) => {
      const prev = normalizeHybridUiPrefs(prevRaw);
      const loadedIsDefault = (
        !loaded.visible
        && loaded.mode === "view"
        && Number(loaded.opacity || 60) === 60
        && !loaded.lock
        && !loaded.focus
      );
      const prevHasUserState = (
        prev.visible
        || prev.mode === "edit"
        || Number(prev.opacity || 60) !== 60
        || prev.lock
        || prev.focus
      );
      if (loadedIsDefault && prevHasUserState) return prev;
      return loaded;
    });
  }, [hybridStorageKey, sid, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    saveHybridUiPrefs(window.localStorage, hybridStorageKey, hybridUiPrefs, toText(userId));
  }, [hybridStorageKey, hybridUiPrefs, userId]);

  const hasKnownV2Session = useMemo(() => {
    if (typeof window === "undefined") return false;
    return hasKnownHybridV2Session(window.localStorage, sid);
  }, [sid, hybridV2Doc]);

  return {
    hybridLayerDragRef,
    hybridLayerMapRef,
    hybridLayerPersistedMapRef,
    hybridAutoFocusGuardRef,
    hybridV2DocRef,
    hybridV2PersistedDocRef,
    drawioMetaRef,
    drawioPersistedMetaRef,
    hybridV2MigrationGuardRef,
    hybridUiPrefs,
    setHybridUiPrefs,
    hybridPeekActive,
    setHybridPeekActive,
    hybridLayerByElementId,
    setHybridLayerByElementId,
    hybridLayerActiveElementId,
    setHybridLayerActiveElementId,
    hybridV2Doc,
    setHybridV2Doc,
    hybridV2BindPickMode,
    setHybridV2BindPickMode,
    drawioMeta,
    setDrawioMeta,
    drawioEditorOpen,
    setDrawioEditorOpen,
    hybridLayerMapFromDraft,
    hybridV2FromDraft,
    drawioFromDraft,
    hybridStorageKey,
    hybridVisible,
    drawioVisible,
    overlayLayerVisible,
    hybridModeEffective,
    hybridOpacityValue,
    hasKnownV2Session,
  };
}
