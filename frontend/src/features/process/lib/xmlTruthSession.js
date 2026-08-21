/**
 * FIX-BPMN-IMPORT-SAVE: единая точка определения XML-truth сессии на клиенте.
 *
 * Бэкенд считает сессию BPMN-XML-truth по непустому `bpmn_xml`
 * (backend/app/_legacy_main.py:906, guard `_reject_draft_graph_write_on_xml_session`):
 * для таких сессий nodes/edges — мёртвая draft-модель, запись отклоняется
 * 409 DRAFT_GRAPH_READ_ONLY_XML_TRUTH, истина живёт в bpmn_xml (PUT /bpmn).
 * Клиент обязан определять тип по ТОМУ ЖЕ признаку и не отправлять
 * nodes/edges в PATCH /api/sessions/{id} для XML-truth сессий.
 */

/**
 * @param {unknown} draftRaw — draft/сессия из стора
 * @returns {boolean} true, если сессия XML-truth (bpmn_xml непустой)
 */
export function isXmlTruthSessionDraft(draftRaw) {
  const draft = draftRaw && typeof draftRaw === "object" ? draftRaw : {};
  return String(draft.bpmn_xml || "").trim() !== "";
}

/**
 * Удалить nodes/edges из PATCH-пayload для XML-truth сессии.
 * Возвращает НОВЫЙ объект (вход не мутируется).
 *
 * @param {unknown} patchRaw
 * @param {boolean} isXmlTruthSession
 * @returns {{patch: Object, stripped: string[]}}
 */
export function stripDraftGraphKeysFromSessionPatch(patchRaw, isXmlTruthSession) {
  const patch = patchRaw && typeof patchRaw === "object" ? { ...patchRaw } : {};
  const stripped = [];
  if (isXmlTruthSession === true) {
    for (const key of ["nodes", "edges"]) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        delete patch[key];
        stripped.push(key);
      }
    }
  }
  return { patch, stripped };
}
