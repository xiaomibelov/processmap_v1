import { useCallback } from "react";

import { resolveCanonicalDrawioElementId } from "../../drawio/domain/drawioSelectors.js";
import {
  readDrawioDocXmlCellGeometry,
  updateDrawioDocXmlCellGeometry,
  updateDrawioDocXmlCellStyle,
  updateDrawioDocXmlCellValue,
} from "../../drawio/drawioDocXml.js";
import {
  readDrawioElementSnapshot,
  readDrawioTextElementContent,
  updateDrawioElementAttributes,
  updateDrawioTextElementContent,
} from "../../drawio/drawioSvg.js";
import {
  normalizeRuntimeTextWidth,
  readRuntimeTextState,
  updateRuntimeTextLayout,
} from "../../drawio/drawioRuntimeText.js";
import {
  normalizeRuntimeResizeDimension,
  readRuntimeResizableSize,
  resolveRuntimeResizeSurface,
} from "../../drawio/drawioRuntimeGeometry.js";
import {
  getRuntimeStylePresets,
  resolveRuntimeStyleSurface,
} from "../../drawio/drawioRuntimeStylePresets.js";
import { asObject, patchElementById, toText } from "./drawioMutationShared.js";

export default function useDrawioElementContentMutationApi({
  drawioMetaRef,
  normalizeDrawioMeta,
  applyDrawioMutation,
  publishNormalization,
  setInfoMsg,
  setGenErr,
}) {
  const setDrawioElementText = useCallback((elementIdRaw, textRaw, source = "drawio_element_text") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
    if (!elementId) return false;
    const nextText = String(textRaw ?? "");
    let supported = false;
    let changed = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const docGeometry = readDrawioDocXmlCellGeometry(prev.doc_xml, elementId);
      const currentText = readDrawioTextElementContent(prev.svg_cache, elementId);
      if (currentText == null) return prev;
      supported = true;
      if (currentText === nextText) return prev;
      const nextLayout = updateRuntimeTextLayout(prev.svg_cache, elementId, {
        textRaw: nextText,
        docGeometryRaw: docGeometry,
      });
      const nextSvgCache = nextLayout.svg || updateDrawioTextElementContent(prev.svg_cache, elementId, nextText);
      if (nextSvgCache === toText(prev.svg_cache)) return prev;
      changed = true;
      const textPatch = patchElementById(prev.drawio_elements_v1, elementId, (row) => ({
        ...row,
        text: nextText,
        label: nextText,
      }));
      return {
        ...prev,
        svg_cache: nextSvgCache,
        doc_xml: updateDrawioDocXmlCellGeometry(
          updateDrawioDocXmlCellValue(prev.doc_xml, elementId, nextText),
          elementId,
          {
            width: nextLayout.state?.width ?? docGeometry?.width,
            height: nextLayout.state?.height ?? docGeometry?.height,
          },
        ),
        drawio_elements_v1: textPatch.elements,
      };
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (!supported) {
      setInfoMsg?.("Быстрое редактирование доступно только для текстовых draw.io объектов.");
      setGenErr?.("");
      return false;
    }
    if (result.changed) publishNormalization(source);
    return !!changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization, setGenErr, setInfoMsg]);

  const setDrawioElementTextWidth = useCallback((elementIdRaw, widthRaw, source = "drawio_element_text_width") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
    if (!elementId) return false;
    let supported = false;
    let changed = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const docGeometry = readDrawioDocXmlCellGeometry(prev.doc_xml, elementId);
      const currentState = readRuntimeTextState(prev.svg_cache, elementId, { docGeometryRaw: docGeometry });
      if (!currentState) return prev;
      supported = true;
      const nextWidth = normalizeRuntimeTextWidth(widthRaw, currentState.width);
      if (nextWidth === currentState.width) return prev;
      const nextLayout = updateRuntimeTextLayout(prev.svg_cache, elementId, {
        widthRaw: nextWidth,
        docGeometryRaw: docGeometry,
      });
      if (nextLayout.svg === toText(prev.svg_cache)) return prev;
      changed = true;
      return {
        ...prev,
        svg_cache: nextLayout.svg,
        doc_xml: updateDrawioDocXmlCellGeometry(prev.doc_xml, elementId, {
          width: nextLayout.state?.width ?? nextWidth,
          height: nextLayout.state?.height ?? currentState.height,
        }),
      };
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (!supported) {
      setInfoMsg?.("Быстрая настройка ширины доступна только для базовых runtime draw.io text объектов.");
      setGenErr?.("");
      return false;
    }
    if (result.changed) publishNormalization(source);
    return !!changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization, setGenErr, setInfoMsg]);

  const setDrawioElementStylePreset = useCallback((elementIdRaw, presetIdRaw, source = "drawio_element_style") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
    if (!elementId) return false;
    const presetId = toText(presetIdRaw).toLowerCase();
    let supported = false;
    let changed = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const snapshot = readDrawioElementSnapshot(prev.svg_cache, elementId);
      const surface = resolveRuntimeStyleSurface(snapshot);
      const preset = getRuntimeStylePresets(surface).find((row) => toText(row.id).toLowerCase() === presetId) || null;
      if (!snapshot || !surface || !preset) return prev;
      supported = true;
      const nextSvgCache = updateDrawioElementAttributes(prev.svg_cache, elementId, preset.svg);
      const nextDocXml = updateDrawioDocXmlCellStyle(prev.doc_xml, elementId, preset.doc);
      if (nextSvgCache === toText(prev.svg_cache) && nextDocXml === toText(prev.doc_xml)) return prev;
      changed = true;
      return {
        ...prev,
        svg_cache: nextSvgCache,
        doc_xml: nextDocXml,
      };
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (!supported) {
      setInfoMsg?.("Быстрые style presets доступны только для базовых runtime draw.io объектов.");
      setGenErr?.("");
      return false;
    }
    if (result.changed) publishNormalization(source);
    return !!changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization, setGenErr, setInfoMsg]);

  const setDrawioElementSize = useCallback((elementIdRaw, sizeRaw = {}, source = "drawio_element_resize") => {
    const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
    if (!elementId) return false;
    const size = asObject(sizeRaw);
    let supported = false;
    let changed = false;
    const result = applyDrawioMutation((prevRaw) => {
      const prev = normalizeDrawioMeta(prevRaw);
      const snapshot = readDrawioElementSnapshot(prev.svg_cache, elementId);
      const surface = resolveRuntimeResizeSurface(snapshot);
      const currentSize = readRuntimeResizableSize(snapshot);
      if (!snapshot || !surface || !currentSize) return prev;
      supported = true;
      const nextWidth = normalizeRuntimeResizeDimension(size.width, currentSize.width);
      const nextHeight = normalizeRuntimeResizeDimension(size.height, currentSize.height);
      if (nextWidth === currentSize.width && nextHeight === currentSize.height) return prev;
      const nextSvgCache = updateDrawioElementAttributes(prev.svg_cache, elementId, {
        width: String(nextWidth),
        height: String(nextHeight),
      });
      const nextDocXml = updateDrawioDocXmlCellGeometry(prev.doc_xml, elementId, {
        width: nextWidth,
        height: nextHeight,
      });
      if (nextSvgCache === toText(prev.svg_cache) && nextDocXml === toText(prev.doc_xml)) return prev;
      changed = true;
      return {
        ...prev,
        svg_cache: nextSvgCache,
        doc_xml: nextDocXml,
      };
    }, {
      source,
      playbackStage: source,
      persist: true,
    });
    if (!supported) {
      setInfoMsg?.("Быстрый resize доступен только для базовых runtime draw.io shape/container объектов.");
      setGenErr?.("");
      return false;
    }
    if (result.changed) publishNormalization(source);
    return !!changed;
  }, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization, setGenErr, setInfoMsg]);

  return {
    setDrawioElementSize,
    setDrawioElementStylePreset,
    setDrawioElementText,
    setDrawioElementTextWidth,
  };
}
