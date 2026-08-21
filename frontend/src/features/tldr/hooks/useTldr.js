import { useMemo } from "react";
import { buildTldrFromSession } from "../selectors/buildTldrFromSession";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function useTldr(draftRaw) {
  const draft = asObject(draftRaw);
  const bpmnMeta = asObject(draft?.bpmn_meta);
  const interview = asObject(draft?.interview);

  return useMemo(
    () => buildTldrFromSession({
      session_id: draft?.session_id,
      updated_at: draft?.updated_at,
      updatedAt: draft?.updatedAt,
      nodes: draft?.nodes,
      bpmn_meta: {
        node_path_meta: bpmnMeta?.node_path_meta,
        flow_meta: bpmnMeta?.flow_meta,
        hybrid_v2: bpmnMeta?.hybrid_v2,
        hybrid_layer_by_element_id: bpmnMeta?.hybrid_layer_by_element_id,
        updated_at: bpmnMeta?.updated_at,
        updatedAt: bpmnMeta?.updatedAt,
      },
      interview: {
        steps: interview?.steps,
        path_spec: interview?.path_spec,
        pathSpec: interview?.pathSpec,
        report_versions: interview?.report_versions,
        reportVersions: interview?.reportVersions,
      },
    }),
    [
      draft?.session_id,
      draft?.updated_at,
      draft?.updatedAt,
      draft?.nodes,
      bpmnMeta?.node_path_meta,
      bpmnMeta?.flow_meta,
      bpmnMeta?.hybrid_v2,
      bpmnMeta?.hybrid_layer_by_element_id,
      bpmnMeta?.updated_at,
      bpmnMeta?.updatedAt,
      interview?.steps,
      interview?.path_spec,
      interview?.pathSpec,
      interview?.report_versions,
      interview?.reportVersions,
    ],
  );
}

export default useTldr;
