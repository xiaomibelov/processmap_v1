# 2026-05-07 - feature/admin-ai-provider-settings-and-product-actions-prompt-v1

- Admin -> AI modules now shows an editable DeepSeek provider block:
  - API key password input;
  - Base URL input;
  - Save button;
  - Verify availability button;
  - statuses for saved key, not configured, successful verification and verification error.
- API key input is cleared after save and existing key is not rendered back.
- `ai.product_actions.suggest` prompt version is visible through the existing prompt registry/module table.
- Product Actions panel maps controlled AI setup errors to Admin-facing copy, pointing users to Admin -> AI modules.
- Registry diagnostic warning was not changed in this contour.
