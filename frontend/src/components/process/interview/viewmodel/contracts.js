/**
 * @typedef {"success"|"fail"|"unknown"} Outcome
 * Outcome represents factual process result at terminal point.
 * It is independent from tier (P0/P1/P2), which represents path quality.
 */

/**
 * @typedef {Object} TimelineStepItem
 * @property {"step"} kind
 * @property {string} id
 * @property {Object} step
 */

/**
 * @typedef {Object} TimelineBetweenBranchesItem
 * @property {"between_branches"} kind
 * @property {string} id
 * @property {string} anchorStepId
 * @property {Object} between
 */

/**
 * @typedef {Object} InterviewVMStep
 * @property {string} id
 * @property {number} order_index
 * @property {string} graph_no
 * @property {string} title
 * @property {string} lane_id
 * @property {string} lane_name
 * @property {string|null} bpmn_ref
 * @property {string} node_id
 * @property {string} node_kind
 * @property {"P0"|"P1"|"P2"|"None"} tier
 * @property {number} work_duration_sec
 * @property {number} wait_duration_sec
 * @property {number} duration_sec
 * @property {number} cumulative_sec
 */

/**
 * @typedef {Object} InterviewVMLoopGroup
 * @property {"loop"} kind
 * @property {string} entry_node_id
 * @property {string} back_to_node_id
 * @property {string} reason
 * @property {number} expected_iterations
 */

/**
 * @typedef {Object} InterviewVMScenarioDiff
 * @property {Array<Object>} differing_gateway_decisions
 * @property {Array<Object>} additional_steps
 * @property {number} additional_time_sec
 * @property {number} ideal_total_time_sec
 * @property {number} scenario_total_time_sec
 */

/**
 * @typedef {Object} InterviewVM
 * @property {"InterviewVM.v1"} version
 * @property {Array<Object>} scenarios // each scenario contains outcome: Outcome, prepared rows[] with required order_index, optional diff_from_ideal
 * @property {Array<InterviewVMStep>} steps
 * @property {Array<Object>} groups
 * @property {Object} metrics
 * @property {Object} quality
 * @property {Object} linear
 * @property {Array<string>} warnings
 */

export const __INTERVIEW_VIEWMODEL_CONTRACTS__ = true;
