import useScrubberVisibilityPreference from "./useScrubberVisibilityPreference";
import useViewportScrubberModel from "./useViewportScrubberModel";

export default function BottomViewportScrubber({
  active = true,
  canvasApi,
  avoidCoverageMinimap = false,
} = {}) {
  const visibility = useScrubberVisibilityPreference();
  const scrubberModel = useViewportScrubberModel({
    active: active && visibility.visible,
    canvasApi,
  });

  if (!active) return null;

  const rightInset = avoidCoverageMinimap ? "min(340px, 46vw)" : "12px";

  return (
    <div
      className="bpmnViewportScrubberLayer"
      style={{ "--fpc-scrubber-right-inset": rightInset }}
      data-testid="bpmn-viewport-scrubber-layer"
    >
      {visibility.visible ? (
        <div className="bpmnViewportScrubber" data-testid="bpmn-viewport-scrubber">
          <button
            type="button"
            className="bpmnViewportScrubberToggle"
            onClick={visibility.hide}
            title="Скрыть навигацию по области"
            aria-label="Скрыть нижнюю навигацию"
          >
            <span className="bpmnViewportScrubberControlIcon" aria-hidden="true">v</span>
            <span className="bpmnViewportScrubberControlText">Hide scrubber</span>
          </button>

          <div
            className={`bpmnViewportScrubberTrack ${scrubberModel.canScroll ? "isInteractive" : "isDisabled"}`}
            ref={scrubberModel.setTrackRef}
            aria-label="Горизонтальная навигация по диаграмме"
            role="group"
            aria-disabled={!scrubberModel.canScroll}
            title={scrubberModel.canScroll ? "Drag thumb or click track to move viewport" : "Entire diagram fits current viewport width"}
            data-testid="bpmn-viewport-scrubber-track"
          >
            <button
              type="button"
              className={`bpmnViewportScrubberThumb ${scrubberModel.canScroll ? "" : "isDisabled"}`}
              style={scrubberModel.thumbStyle}
              ref={scrubberModel.setThumbRef}
              disabled={!scrubberModel.canScroll}
              role="slider"
              aria-orientation="horizontal"
              aria-keyshortcuts="ArrowLeft ArrowRight Home End"
              aria-valuemin={scrubberModel.thumbAria.valueMin}
              aria-valuemax={scrubberModel.thumbAria.valueMax}
              aria-valuenow={scrubberModel.thumbAria.valueNow}
              aria-valuetext={scrubberModel.thumbAria.valueText}
              onKeyDown={scrubberModel.onThumbKeyDown}
              data-scrubber-thumb="true"
              aria-label="Перетащить видимую область"
              data-testid="bpmn-viewport-scrubber-thumb"
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="bpmnViewportScrubberHandle"
          onClick={visibility.show}
          title="Показать нижнюю навигацию"
          aria-label="Показать нижнюю навигацию"
          data-testid="bpmn-viewport-scrubber-show"
        >
          <span className="bpmnViewportScrubberControlIcon" aria-hidden="true">^</span>
          <span className="bpmnViewportScrubberControlText">Show scrubber</span>
        </button>
      )}
    </div>
  );
}
