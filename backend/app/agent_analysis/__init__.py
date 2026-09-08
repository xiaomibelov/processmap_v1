"""Background agent-analysis pipeline.

Product contour: architecture/autopass-agent-migration-v1 (Phase 1).
Live-safety contract:
- save-path enqueue is fire-and-forget (pattern: analytics_aggregator.publisher);
- the worker reads a DB snapshot and writes only bpmn_meta.agent_analysis_v1
  (never bpmn_xml / live canvas);
- feature is disabled by default (no llm_feature_flags row -> no work).
"""

from .processor import run_agent_analysis
from .publisher import publish_agent_analysis_scheduled

__all__ = ["publish_agent_analysis_scheduled", "run_agent_analysis"]
