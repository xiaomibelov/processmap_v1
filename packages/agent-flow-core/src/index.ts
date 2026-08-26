export type {
  ApprovalGate,
  ArtifactChip,
  BuildLayoutOptions,
  ContourModel,
  LayoutEdge,
  LayoutNode,
  LayoutViewport,
  RawEvent,
  RegulationStep,
  ScannedFile,
} from "./types.js";

export { parseEventLine, parseEventLog, isKnownEventType } from "./parser.js";

export {
  foldEvents,
  foldEventsTo,
  emptyModel,
  REGULATION_STEPS,
} from "./fold.js";

export { Timeline } from "./timeline.js";

export { buildLayout } from "./layout.js";

export {
  selectLiveContours,
  selectCompletedContours,
  selectBlockedContours,
  selectBlockedApprovals,
  selectArtifactsForStep,
} from "./selectors.js";

export {
  buildContourFromScan,
  buildContoursFromScan,
  determineStatus,
  mapArtifactKind,
  artifactStepKind,
} from "./scanner-model.js";

export type { ScannedFileInfo, ScannedContourInput } from "./scanner-model.js";
