# Node-Path Module Pilot Contract

This pilot is only for one selected node's node-path metadata: `{ paths, sequence_key }`.

## Adapter must provide
- `readSharedSnapshot(nodeId)` or legacy alias `read(nodeId)`
- `applyDraft({ nodeId, draft })` or legacy alias `apply(...)`
- `clearSharedSnapshot({ nodeId })` or legacy alias `reset(...)`
- optional `subscribe(nodeId, onSnapshotChange)` for same-node external refresh
- optional `subscribeConnectivity(listener)` if connectivity comes from outside the browser fallback
- if the backing store is shared, adapter-owned document identity must stay scoped to the current module context (for example current session + node), not bare `nodeId`
- if the backing store uses consumer-specific runtime identity, a second consumer needs the adapter's persisted auth/bootstrap material in addition to any shared document id

## Controller owns
- local draft
- shared snapshot
- trust-state derivation: `saved/local/syncing/error/offline/attention`
- apply/reset/accept-shared lifecycle
- failure state
- dirty-entry drift detection for the same node

## UI consumes
- normalized `paths`
- normalized `sequenceKey`
- trust-state
- busy/error/info
- `toggleTag`, `updateSequenceKey`, `apply`, `reset`, `acceptShared`

## Intentionally outside this module
- BPMN XML/runtime truth
- sibling flow normalization semantics
- Robot Meta / Camunda / AI / notes
- whole sidebar orchestration
- backend transport details behind the adapter

## Experimental Jazz spike
- The current internal adapter remains the default path.
- A second experimental Jazz adapter may satisfy the same contract behind an explicit adapter-mode flag.
- The controller/UI contract stays the source of truth; the adapter implementation is replaceable.
