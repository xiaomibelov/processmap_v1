#!/usr/bin/env bash
set -euo pipefail

# UI/UX Pro Max — Auto-enrichment for agent prompts
# Usage: pm-uiux-auto-enrich.sh <command> <args>
#
# Automatically detects UI contours, generates DESIGN_SYSTEM.md via ui-ux-pro-max skill,
# and injects it into agent prompts.

ROOT="/opt/processmap-test"
UI_UX_SKILL_DIR="${PROCESSMAP_UI_UX_PRO_MAX_DIR:-$HOME/.codex/skills/ui-ux-pro-max}"
SEARCH_PY="$UI_UX_SKILL_DIR/scripts/search.py"

# ---------------------------------------------------------------------------
# Detect UI contour by name or plan content
# ---------------------------------------------------------------------------
is_ui_contour() {
  local cid="$1"

  local ui_keywords="ui|ux|frontend|design|component|page|style|css|tailwind|react|visual|theme|registry|panel|modal|form|table|chart|dashboard|layout|color|font|typography|animation|responsive|accessibility|a11y|svg|icon|button|card|skeleton|badge|dropdown|toast|tooltip|sidebar|navbar|header|footer|hero|landing|marketing|onboarding|wizard|stepper|tabs|accordion|dialog|drawer|sheet|popover|menu|breadcrumbs|pagination|toolbar|progress|spinner|loader|empty-state|error-state|warning|alert|notification|banner|tag|chip|avatar|carousel|slider|switch|checkbox|radio|toggle|input|textarea|select|search|filter|date-picker|calendar|timeline|kanban|grid|list|tree|draggable|resizable|collapsible|editable|virtualized|infinite|lazy|critical|viewport|visible|hidden|shadow-dom|web-component|custom-element|mockup|wireframe|blueprint|spec"

  # Check contour name
  if echo "$cid" | grep -qiE "$ui_keywords"; then
    return 0
  fi


  return 1
}

# ---------------------------------------------------------------------------
# Determine product type from contour name
# ---------------------------------------------------------------------------
infer_product_type() {
  local cid="$1"

  if echo "$cid" | grep -qiE "(dashboard|analytics|data|chart|report|metric|kpi|insight)"; then
    echo "Analytics Dashboard"
  elif echo "$cid" | grep -qiE "(financial|finance|fintech|crypto|bank|money|payment|wallet)"; then
    echo "Financial Dashboard"
  elif echo "$cid" | grep -qiE "(health|medical|clinic|patient|doctor|healthcare)"; then
    echo "Healthcare App"
  elif echo "$cid" | grep -qiE "(education|learning|course|school|training|student)"; then
    echo "Educational App"
  elif echo "$cid" | grep -qiE "(game|gaming|play|entertainment|esports)"; then
    echo "Gaming"
  elif echo "$cid" | grep -qiE "(mobile|app|ios|android|flutter|react-native)"; then
    echo "Micro SaaS"
  elif echo "$cid" | grep -qiE "(ecommerce|shop|store|retail|product|buy|sell|commerce)"; then
    echo "E-commerce"
  elif echo "$cid" | grep -qiE "(social|community|network|chat|message|forum)"; then
    echo "Social Media App"
  elif echo "$cid" | grep -qiE "(productivity|task|project|workflow|collaboration|tool)"; then
    echo "Productivity Tool"
  elif echo "$cid" | grep -qiE "(design|creative|agency|portfolio|art|media|studio)"; then
    echo "Creative Agency"
  elif echo "$cid" | grep -qiE "(ai|ml|chatbot|gpt|llm|machine-learning|automation)"; then
    echo "AI/Chatbot Platform"
  elif echo "$cid" | grep -qiE "(government|public|service|civic|official)"; then
    echo "Government/Public Service"
  else
    echo "SaaS (General)"
  fi
}

# ---------------------------------------------------------------------------
# Generate DESIGN_SYSTEM.md
# ---------------------------------------------------------------------------
generate_design_system() {
  local cid="$1"
  local out="$dir/DESIGN_SYSTEM.md"

  echo "[ui-ux-orchestrate] Generating DESIGN_SYSTEM.md for contour: $cid" >&2

  local product_type
  product_type=$(infer_product_type "$CID")

  if [ ! -f "$SEARCH_PY" ]; then
    echo "[ui-ux-orchestrate] WARN: search.py not found at $SEARCH_PY" >&2
    return 1
  fi

  # Generate design system
  if python3 "$SEARCH_PY" "$product_type" --design-system -p "ProcessMap" --format markdown > "$out" 2>/dev/null; then
    echo "$out"
  else
    echo "[ui-ux-orchestrate] WARN: Failed to generate design system for $cid (product_type=$product_type)" >&2
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Inject DESIGN_SYSTEM.md into prompt file
# ---------------------------------------------------------------------------
enrich_prompt() {
  local cid="$1"
  local prompt_file="$2"
  local dir="$ROOT/.planning/contours/$cid"
  local ds="$dir/DESIGN_SYSTEM.md"

  if ! is_ui_contour "$cid"; then
    echo "[ui-ux-orchestrate] Contour $cid is not a UI contour. Skipping enrichment." >&2
    return 0
  fi

  # Generate if missing
  if [ ! -f "$ds" ]; then
    generate_design_system "$cid" "$dir" || return 0
  fi

  # Check if already enriched (avoid double injection)
  if head -n 5 "$prompt_file" 2>/dev/null | grep -q "UI/UX Design System (auto-generated"; then
    echo "[ui-ux-orchestrate] Prompt already enriched. Skipping." >&2
    return 0
  fi

  local tmp="${prompt_file}.uiux-enriched.tmp.$$"
  {
    echo "# UI/UX Design System (auto-generated by ui-ux-pro-max skill)"
    echo ""
    echo "> Contour: \`$cid\` | Product Type: $(infer_product_type "$CID")"
    echo "> Skill: \`$UI_UX_SKILL_DIR\`"
    echo ""
    cat "$ds"
    echo ""
    echo "---"
    echo ""
    echo "# Agent Prompt (original below)"
    echo ""
    cat "$prompt_file"
  } > "$tmp"

  mv "$tmp" "$prompt_file"
  echo "[ui-ux-orchestrate] Enriched $prompt_file with DESIGN_SYSTEM.md ($(wc -l < "$ds") lines)" >&2
}

# ---------------------------------------------------------------------------
# Pre-generate DESIGN_SYSTEM.md for a contour (used by agent-create-contour)
# ---------------------------------------------------------------------------
pre_generate() {
  local cid="$1"
  local dir="$ROOT/.planning/contours/$cid"

  if ! is_ui_contour "$cid"; then
    echo "[ui-ux-orchestrate] Not a UI contour. No pre-generation needed." >&2
    return 0
  fi

  if [ -f "$dir/DESIGN_SYSTEM.md" ]; then
    echo "[ui-ux-orchestrate] DESIGN_SYSTEM.md already exists." >&2
    echo "$dir/DESIGN_SYSTEM.md"
    return 0
  fi

  generate_design_system "$cid" "$dir"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
CMD="${1:-}"
CID="${2:-}"
PROMPT_FILE="${3:-}"

case "$CMD" in
  enrich)
    if [[ -z "$CID" || -z "$PROMPT_FILE" ]]; then
      echo "Usage: pm-uiux-auto-enrich.sh enrich <contour-id> <prompt-file>" >&2
      exit 2
    fi
    enrich_prompt "$CID" "$PROMPT_FILE"
    ;;
  pre-generate)
    if [[ -z "$CID" ]]; then
      echo "Usage: pm-uiux-auto-enrich.sh pre-generate <contour-id>" >&2
      exit 2
    fi
    pre_generate "$CID"
    ;;
  check)
    if [[ -z "$CID" ]]; then
      echo "Usage: pm-uiux-auto-enrich.sh check <contour-id>" >&2
      exit 2
    fi
    if is_ui_contour "$CID"; then
      echo "UI_CONTOUR=true"
      infer_product_type "$CID"
    else
      echo "UI_CONTOUR=false"
    fi
    ;;
  *)
    cat <<USAGE >&2
Usage: pm-uiux-auto-enrich.sh <command> <args>

Commands:
  enrich <contour-id> <prompt-file>   Inject DESIGN_SYSTEM.md into prompt file
  pre-generate <contour-id>           Generate DESIGN_SYSTEM.md if UI contour
  check <contour-id>                  Check if contour is UI and infer product type

Environment:
  PROCESSMAP_UI_UX_PRO_MAX_DIR  Override skill directory (default: ~/.codex/skills/ui-ux-pro-max)
USAGE
    exit 2
    ;;
esac
