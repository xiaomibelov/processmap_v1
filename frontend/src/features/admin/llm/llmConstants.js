export const LLM_KNOWN_FEATURES = ["process_analysis", "as_is_transform", "schema_assistant"];

export const LLM_MODEL_CLASSES = ["primary", "cheap"];

export const LLM_PROMPT_STATUSES = ["draft", "active", "archive"];

// TestGen — белый список тегов OpenAPI-спеки (зеркало backend
// app/routers/admin_testgen.py::_ALLOWED_TAGS и workflow llm-testgen.yml).
export const TESTGEN_TAGS = [
  "admin", "analytics", "audit-log", "auto-pass", "clipboard",
  "deployment-notices", "dictionaries", "error-events", "explorer",
  "feature-flags", "health", "kitchens", "llm", "notes",
  "operation-catalog", "org-groups", "org-invites", "org-listing",
  "org-members", "org-property-dictionary", "organizations",
  "process-properties-registry", "process-templates",
  "product-actions-ai", "product-actions-registry",
  "project-analytics", "projects", "rag", "recipes",
  "reference-resolver", "reports", "save-status", "session-events",
  "sessions", "sku-bindings", "system", "templates",
  "transformation", "version",
];

export const TESTGEN_LIMIT_OPTIONS = [1, 3, 5, 10, 15, 20];

export const TESTGEN_ACTIVE_STATUSES = ["queued", "running"];

export const TESTGEN_POLL_INTERVAL_MS = 12000;
