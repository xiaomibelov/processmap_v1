/**
 * @typedef {Object} InterviewStepNode
 * @property {"step"} kind
 * @property {string} id
 * @property {string} bpmnId
 * @property {string} title
 * @property {string} graphNo
 * @property {string} lane
 */

/**
 * @typedef {Object} InterviewContinueNode
 * @property {"continue"} kind
 * @property {string} targetBpmnId
 * @property {string} targetGraphNo
 * @property {string} title
 */

/**
 * @typedef {Object} InterviewLoopNode
 * @property {"loop"} kind
 * @property {string} targetBpmnId
 * @property {string} targetGraphNo
 * @property {string} title
 */

/**
 * @typedef {Object} InterviewDecisionBranch
 * @property {string} key
 * @property {string} label
 * @property {Array<InterviewStepNode|InterviewContinueNode|InterviewLoopNode|InterviewDecisionNode>} children
 */

/**
 * @typedef {Object} InterviewDecisionNode
 * @property {"decision"} kind
 * @property {string} id
 * @property {string} anchorNodeId
 * @property {string} graphNo
 * @property {InterviewDecisionBranch[]} branches
 * @property {string} primaryBranchKey
 */

/**
 * @typedef {Object} InterviewParallelNode
 * @property {"parallel"} kind
 * @property {string} id
 * @property {string} anchorNodeId
 * @property {string} graphNo
 * @property {InterviewDecisionBranch[]} branches
 */

/**
 * @typedef {Object} InterviewSubprocessNode
 * @property {"subprocess"} kind
 * @property {string} id
 * @property {string} bpmnId
 * @property {string} title
 * @property {string} graphNo
 * @property {boolean} collapsed
 * @property {InterviewStepNode[]} children
 */

export const __INTERVIEW_MODEL_CONTRACTS__ = true;
