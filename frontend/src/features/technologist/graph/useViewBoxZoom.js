// Z1 TOBE-UX — React-хук zoom/pan поверх viewBox для SVG-канваса.
// Инкапсулирует: состояние вида (null = fit), wheel-zoom (non-passive,
// React вешает wheel как passive — нужен прямой addEventListener),
// кнопки ±/fit/1:1, pan по фону, центрирование на узле.
// Математика — pure viewBoxZoom.js. Использование: см. OverlayGraphCanvas.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  MAX_ZOOM_OUT_FACTOR,
  WHEEL_ZOOM_STEP,
  ZOOM_STEP,
  centerOn,
  formatViewBox,
  panBy,
  zoomAroundCenter,
  zoomAroundPoint,
  zoomPercent,
  zoomToActualSize,
} from "./viewBoxZoom";

export default function useViewBoxZoom({ fitView, resetKey = "", svgRef }) {
  // view === null → следуем fitView (пользователь ещё не зумил)
  const [userView, setUserView] = useState(null);
  const view = userView || fitView;
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitRef = useRef(fitView);
  fitRef.current = fitView;
  const panRef = useRef(null);

  // смена сессии/шаблона → сброс вида на fit
  useEffect(() => { setUserView(null); }, [resetKey]);

  const maxW = useMemo(() => (fitView?.w || 100) * MAX_ZOOM_OUT_FACTOR, [fitView]);

  const applyZoom = useCallback((factor, px, py) => {
    const v = viewRef.current;
    const f = fitRef.current;
    setUserView(zoomAroundPoint(v, factor, px ?? v.x + v.w / 2, py ?? v.y + v.h / 2, { maxW: (f?.w || 100) * MAX_ZOOM_OUT_FACTOR }));
  }, []);

  const zoomIn = useCallback(() => applyZoom(ZOOM_STEP), [applyZoom]);
  const zoomOut = useCallback(() => applyZoom(1 / ZOOM_STEP), [applyZoom]);
  const fit = useCallback(() => setUserView(null), []);

  const actualSize = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect?.();
    if (!rect) return;
    setUserView(zoomToActualSize(viewRef.current, rect.width, rect.height));
  }, [svgRef]);

  const focusOn = useCallback((px, py, targetW) => {
    setUserView(centerOn(viewRef.current, px, py, targetW, fitRef.current?.w));
  }, []);

  // wheel-zoom вокруг курсора; non-passive — иначе preventDefault игнорируется
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof svg.addEventListener !== "function") return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const v = viewRef.current;
      if (!rect.width || !rect.height) return;
      const px = v.x + ((event.clientX - rect.left) / rect.width) * v.w;
      const py = v.y + ((event.clientY - rect.top) / rect.height) * v.h;
      const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
      const f = fitRef.current;
      setUserView(zoomAroundPoint(v, factor, px, py, { maxW: (f?.w || 100) * MAX_ZOOM_OUT_FACTOR }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [svgRef]);

  // pan по фону канваса (drag на пустом месте); узлы обрабатываются своим drag
  const panStart = useCallback((event) => {
    const svg = svgRef.current;
    if (!svg || event.target !== svg) return false;
    panRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      view: viewRef.current,
      moved: false,
    };
    return true;
  }, [svgRef]);

  // возвращает true, если pan сместился (надо подавить click)
  const panMove = useCallback((event) => {
    const pan = panRef.current;
    const svg = svgRef.current;
    if (!pan || !svg) return false;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const dx = ((event.clientX - pan.clientX) / rect.width) * pan.view.w;
    const dy = ((event.clientY - pan.clientY) / rect.height) * pan.view.h;
    if (!pan.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return false;
    pan.moved = true;
    setUserView(panBy(pan.view, -dx, -dy));
    return true;
  }, [svgRef]);

  const panEnd = useCallback(() => {
    const moved = Boolean(panRef.current?.moved);
    panRef.current = null;
    return moved;
  }, []);

  return {
    view,
    viewBox: formatViewBox(view),
    isFit: userView === null,
    percent: zoomPercent(view, fitView),
    zoomIn,
    zoomOut,
    fit,
    actualSize,
    focusOn,
    panStart,
    panMove,
    panEnd,
  };
}
