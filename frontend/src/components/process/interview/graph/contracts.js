/**
 * @typedef {Object} BpmnNode
 * @property {string} id
 * @property {string} type
 * @property {string} name
 * @property {string} [laneId]
 * @property {string} [defaultFlowId]
 * @property {"success"|"fail"|""} [outcomeHint]
 * @property {string[]} incoming
 * @property {string[]} outgoing
 * @property {string} [parentSubprocessId]
 * @property {boolean} [isSubprocessContainer]
 */

/**
 * @typedef {Object} BpmnFlow
 * @property {string} id
 * @property {string} sourceId
 * @property {string} targetId
 * @property {string} [name]
 * @property {string} [condition]
 */

/**
 * @typedef {Object} Graph
 * @property {Object.<string, BpmnNode>} nodesById
 * @property {Object.<string, BpmnFlow>} flowsById
 * @property {Object.<string, BpmnFlow[]>} outgoingByNode
 * @property {Object.<string, BpmnFlow[]>} incomingByNode
 * @property {string[]} startNodeIds
 * @property {string[]} endNodeIds
 * @property {string[]} splitGatewayIds
 * @property {string[]} joinGatewayIds
 * @property {Object.<string, {
 *   id: string,
 *   type: string,
 *   mode: "xor"|"inclusive"|"parallel"|"event"|"unknown",
 *   defaultFlowId?: string,
 *   incomingCount: number,
 *   outgoingCount: number,
 *   isSplit: boolean,
 *   isJoin: boolean,
 *   splitBranches: Array<{ flowId: string, targetId: string, condition?: string, name?: string, isDefault?: boolean }>,
 *   joinNodeId?: string
 * }>} gatewayById
 * @property {Object.<string, string[]>} subprocessBoundaries
 * @property {string[]} reachableNodeIds
 * @property {string[]} [fallbackStartNodeIds]
 * @property {"start_events"|"pseudo_start_incoming_zero"} [reachableSeedMode]
 * @property {"xml_sequence_flow"|"runtime_fallback"} [flowSourceMode]
 * @property {boolean} [hasXmlSequenceFlows]
 */

export const __INTERVIEW_GRAPH_CONTRACTS__ = true;
