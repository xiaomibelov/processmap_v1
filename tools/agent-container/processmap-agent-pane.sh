#!/usr/bin/env bash
set -euo pipefail

if [ "${PROCESSMAP_AGENT_SELF_COPY:-0}" != "1" ] && [ -f "$0" ]; then
  self_copy_dir="${TMPDIR:-/tmp}/processmap-agent-wrapper-copies"
  mkdir -p "$self_copy_dir"
  self_copy="$self_copy_dir/processmap-agent-pane-${USER:-$(id -un 2>/dev/null || echo 'user')}-$(date -u +%Y%m%dT%H%M%SZ)-$$.sh"
  cp "$0" "$self_copy"
  chmod 700 "$self_copy"
  exec env PROCESSMAP_AGENT_SELF_COPY=1 bash "$self_copy" "$@"
fi

AGENT="${1:?Usage: processmap-agent-pane.sh <0|1|2|3> [contour-id]}"
CID="${2:?Usage: processmap-agent-pane.sh <0|1|2|3> <contour-id>}"
SERVER="${PROCESSMAP_SERVER:-deploy@clearvestnic.ru}"
ROOT="${PROCESSMAP_ROOT:-/opt/processmap-test}"
RUN_ID="${PROCESSMAP_AGENT_RUN_ID:-manual-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
RUN_STARTED_AT="${PROCESSMAP_AGENT_RUN_STARTED_AT:-$(date +%s)}"
LLM="${PROCESSMAP_AGENT_LLM:-kimi}"
AGENT1_TASK="${PROCESSMAP_AGENT1_TASK:-}"
RAG_TOP_K="${PROCESSMAP_RAG_TOP_K:-5}"
PROMPT_PREVIEW_LINES="${PROCESSMAP_AGENT_PROMPT_PREVIEW_LINES:-0}"
LOCAL_RUN_STATE_DIR="${PROCESSMAP_LOCAL_STATE_DIR:-$HOME/.processmap-agent-run-state}/$RUN_ID"
LOCAL_STOP_FILE="$LOCAL_RUN_STATE_DIR/STOP_REQUESTED"
LOCAL_PID_FILE="$LOCAL_RUN_STATE_DIR/agent-$AGENT.pid"

validate_cid() {
  local value="$1"
  if [[ ! "$value" =~ ^[A-Za-z0-9_./-]+$ ]]; then
    echo "ERROR: invalid contour id: $value" >&2
    echo "Allowed characters: A-Z a-z 0-9 _ - / ." >&2
    exit 2
  fi
}

case "$AGENT" in
  0) TITLE="Agent 0 / Analytics" ;;
  1) TITLE="Agent 1 / Planner" ;;
  2) TITLE="Agent 2 / Worker" ;;
  3) TITLE="Agent 3 / Reviewer" ;;
  *)
    echo "Usage: processmap-agent-pane.sh <0|1|2|3> [contour-id]"
    exit 2
    ;;
esac

validate_cid "$CID"

if [[ ! "$RAG_TOP_K" =~ ^[0-9]+$ ]] || [ "$RAG_TOP_K" -lt 1 ] || [ "$RAG_TOP_K" -gt 10 ]; then
  echo "ERROR: invalid PROCESSMAP_RAG_TOP_K: $RAG_TOP_K" >&2
  echo "Allowed range: 1..10" >&2
  exit 2
fi

if [[ ! "$PROMPT_PREVIEW_LINES" =~ ^[0-9]+$ ]] || [ "$PROMPT_PREVIEW_LINES" -lt 0 ] || [ "$PROMPT_PREVIEW_LINES" -gt 200 ]; then
  echo "ERROR: invalid PROCESSMAP_AGENT_PROMPT_PREVIEW_LINES: $PROMPT_PREVIEW_LINES" >&2
  echo "Allowed range: 0..200" >&2
  exit 2
fi

if [ "$AGENT" != "0" ]; then
  case "$LLM" in
    kimi|codex|claude) ;;
    *)
      echo "ERROR: invalid PROCESSMAP_AGENT_LLM: $LLM" >&2
      echo "Allowed values: kimi, codex, claude" >&2
      exit 2
      ;;
  esac
fi

mkdir -p "$LOCAL_RUN_STATE_DIR"
printf '%s\n' "$$" > "$LOCAL_PID_FILE"

cleanup_local_pid() {
  rm -f "$LOCAL_PID_FILE" 2>/dev/null || true
}

terminate_process_tree() {
  local pid="$1"
  local child
  [ -n "$pid" ] || return 0
  [ "$pid" != "$$" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0

  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    terminate_process_tree "$child"
  done

  kill -TERM "$pid" 2>/dev/null || true
}

stop_downstream_agents() {
  [ "$AGENT" = "1" ] || return 0
  [ "${PROCESSMAP_DOWNSTREAM_STOP_SENT:-0}" != "1" ] || return 0
  PROCESSMAP_DOWNSTREAM_STOP_SENT=1

  mkdir -p "$LOCAL_RUN_STATE_DIR"
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$LOCAL_STOP_FILE"

  if [ "${PROCESSMAP_AGENT_DRY_RUN:-${PROCESSMAP_AGENTS_DRY_RUN:-0}}" = "1" ]; then
    echo "DRY RUN: would stop Agent 2 and Agent 3 for run $RUN_ID."
    return 0
  fi

  for downstream_agent in 2 3; do
    downstream_pid_file="$LOCAL_RUN_STATE_DIR/agent-$downstream_agent.pid"
    if [ -f "$downstream_pid_file" ]; then
      downstream_pid="$(cat "$downstream_pid_file" 2>/dev/null || true)"
      if [ -n "$downstream_pid" ] && kill -0 "$downstream_pid" 2>/dev/null; then
        echo "Stopping Agent $downstream_agent session for run $RUN_ID."
        terminate_process_tree "$downstream_pid"
      fi
    fi
  done
}

on_local_exit() {
  cleanup_local_pid
}

on_local_signal() {
  stop_downstream_agents
  cleanup_local_pid
  trap - EXIT HUP INT TERM
  exit 130
}

trap on_local_exit EXIT
trap on_local_signal HUP INT TERM

if [ "$AGENT" = "0" ]; then
  if [ "${PROCESSMAP_AGENT_LOCAL:-0}" = "1" ]; then
    while ! (test -d "$ROOT" && test -x "$ROOT/tools/pm-agent-status.sh"); do
      clear 2>/dev/null || true
      printf '%s\n' "Agent 0 / Analytics"
      printf '%s\n' "WAIT: server preflight is not ready."
      printf 'Server:  %s\n' "$SERVER"
      printf 'Root:    %s\n' "$ROOT"
      printf 'Contour: %s\n' "$CID"
      printf 'Run ID:  %s\n' "$RUN_ID"
      printf '%s\n' "Retrying in 15 seconds. This pane stays open and uses no LLM tokens."
      sleep 15
    done
  else
    while ! ssh -n -o BatchMode=yes -o ConnectTimeout=7 "$SERVER" "
      test -d '$ROOT' &&
      test -x '$ROOT/tools/pm-agent-status.sh'
    " >/dev/null 2>&1; do
      clear 2>/dev/null || true
      printf '%s\n' "Agent 0 / Analytics"
      printf '%s\n' "WAIT: server preflight is not ready."
      printf 'Server:  %s\n' "$SERVER"
      printf 'Root:    %s\n' "$ROOT"
      printf 'Contour: %s\n' "$CID"
      printf 'Run ID:  %s\n' "$RUN_ID"
      printf '%s\n' "Retrying in 15 seconds. This pane stays open and uses no LLM tokens."
      sleep 15
    done
  fi
else
  if [ "${PROCESSMAP_AGENT_LOCAL:-0}" = "1" ]; then
    preflight_ok=0
    for preflight_try in 1 2 3 4 5; do
      if test -d "$ROOT" &&
         test -x "$ROOT/tools/pm-agent1-planner.sh" &&
         test -x "$ROOT/tools/pm-agent2-executor-watch.sh" &&
         test -x "$ROOT/tools/pm-agent3-reviewer-watch.sh" &&
         test -x "$ROOT/tools/pm-agent-status.sh" &&
         PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/deploy/.local/bin" LLM="$LLM" bash -lc 'case "$LLM" in kimi) command -v kimi >/dev/null ;; codex) command -v codex >/dev/null ;; claude) command -v claude >/dev/null || command -v claude-code >/dev/null ;; *) exit 2 ;; esac'; then
        preflight_ok=1
        break
      fi
      echo "WARN: server preflight failed for Agent $AGENT; retry $preflight_try/5..."
      sleep 2
    done
  else
    preflight_ok=0
    for preflight_try in 1 2 3 4 5; do
      if ssh -tt -o BatchMode=yes -o ConnectTimeout=7 "$SERVER" "
        test -d '$ROOT' &&
        test -x '$ROOT/tools/pm-agent1-planner.sh' &&
        test -x '$ROOT/tools/pm-agent2-executor-watch.sh' &&
        test -x '$ROOT/tools/pm-agent3-reviewer-watch.sh' &&
        test -x '$ROOT/tools/pm-agent-status.sh' &&
        PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/deploy/.local/bin' LLM='$LLM' bash -lc 'case \"\$LLM\" in kimi) command -v kimi >/dev/null ;; codex) command -v codex >/dev/null ;; claude) command -v claude >/dev/null || command -v claude-code >/dev/null ;; *) exit 2 ;; esac'
      " >/dev/null 2>&1; then
        preflight_ok=1
        break
      fi
      echo "WARN: server preflight failed for Agent $AGENT; retry $preflight_try/5..."
      sleep 2
    done
  fi
  if [ "$preflight_ok" != "1" ]; then
    echo "ERROR: server preflight failed after retries for Agent $AGENT." >&2
    exit 255
  fi
fi

CID_Q="$(printf '%q' "$CID")"
ROOT_Q="$(printf '%q' "$ROOT")"
AGENT_Q="$(printf '%q' "$AGENT")"
DRY_Q="$(printf '%q' "${PROCESSMAP_AGENT_DRY_RUN:-${PROCESSMAP_AGENTS_DRY_RUN:-0}}")"
LLM_Q="$(printf '%q' "$LLM")"
RUN_ID_Q="$(printf '%q' "$RUN_ID")"
RUN_STARTED_AT_Q="$(printf '%q' "$RUN_STARTED_AT")"
RAG_TOP_K_Q="$(printf '%q' "$RAG_TOP_K")"
PROMPT_PREVIEW_LINES_Q="$(printf '%q' "$PROMPT_PREVIEW_LINES")"
AGENT1_TASK_Q="$(printf '%q' "$AGENT1_TASK")"
SERVER_Q="$(printf '%q' "$SERVER")"
TITLE_Q="$(printf '%q' "$TITLE")"
read -r -d '' REMOTE_CMD <<'REMOTE' || true
set -euo pipefail

: "${ROOT:?}"
: "${CID:?}"
: "${AGENT:?}"
: "${PROCESSMAP_AGENT_DRY_RUN:?}"
: "${LLM:?}"
: "${RUN_ID:?}"
: "${RUN_STARTED_AT:?}"
: "${RAG_TOP_K:?}"
: "${PROMPT_PREVIEW_LINES:?}"
AGENT1_TASK="${PROCESSMAP_AGENT1_TASK:-}"

export PATH="$ROOT/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/deploy/.local/bin:$PATH"
export PROCESSMAP_GSD_BIN="$ROOT/bin/gsd"
export PROCESSMAP_CODEX_GSD_TOOLS="/home/deploy/.codex/get-shit-done/bin/gsd-tools.cjs"
export PROCESSMAP_GSD_SKILLS_DIR="/home/deploy/.codex/skills"
export PROCESSMAP_GSD_AGENTS_DIR="/home/deploy/.codex/agents"
export PROCESSMAP_UI_UX_PRO_MAX_DIR="/home/deploy/.codex/skills/ui-ux-pro-max"
if [ -f "/home/deploy/.processmap/claude-env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "/home/deploy/.processmap/claude-env"
  set +a
fi

cd "$ROOT"
RUN_STATE_DIR="$ROOT/.agents/run-state/$RUN_ID"
RUN_CID_FILE="$RUN_STATE_DIR/CID"
STOP_FILE="$RUN_STATE_DIR/STOP_REQUESTED"
HIGHLIGHT_TOKEN_FILE="$RUN_STATE_DIR/highlight-agent-$AGENT.token"
mkdir -p "$RUN_STATE_DIR"

set_contour() {
  CID="${1:?contour id required}"
  DIR="$ROOT/.planning/contours/$CID"
  SLUG="${CID//\//__}"
  RUN_FILE="$DIR/AGENT_RUN_ID"
  WORKER_RUN_FILE="$DIR/WORKER_RUN_ID"
  REVIEW_RUN_FILE="$DIR/REVIEW_RUN_ID"
}

publish_contour() {
  mkdir -p "$RUN_STATE_DIR"
  printf '%s\n' "$CID" > "$RUN_CID_FILE"
}

sync_published_contour() {
  if [ -f "$RUN_CID_FILE" ]; then
    published_cid="$(cat "$RUN_CID_FILE" 2>/dev/null || true)"
    if [ -n "$published_cid" ] && [ "$published_cid" != "$CID" ]; then
      echo "Switching to run contour: $published_cid"
      set_contour "$published_cid"
    fi
  fi
}

set_contour "$CID"

stop_requested() {
  [ -f "$STOP_FILE" ]
}

request_downstream_stop() {
  [ "$AGENT" = "1" ] || return 0
  if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
    echo "DRY RUN: would request Agent 2/3 stop for run $RUN_ID."
    return 0
  fi
  mkdir -p "$RUN_STATE_DIR"
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$STOP_FILE"
  echo "Agent 1 exited. Stop requested for Agent 2 and Agent 3."
}

mirror_contour() {
  stage="${1:-manual}"
  if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
    echo "DRY RUN: would mirror contour reports to Obsidian for stage: $stage"
    return 0
  fi

  if [ -x "$ROOT/tools/pm-agent-mirror-report.sh" ]; then
    "$ROOT/tools/pm-agent-mirror-report.sh" "$CID" "$stage" || true
  else
    echo "MIRROR_SKIPPED: missing helper $ROOT/tools/pm-agent-mirror-report.sh"
  fi
}

terminal_bg() {
  color="${1:?color required}"
  printf '\033]1337;SetColors=bg=%s\a' "$color"
}

highlight_start() {
  token="$(date +%s)-$$-$RANDOM"
  printf '%s\n' "$token" > "$HIGHLIGHT_TOKEN_FILE"

  if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
    echo "DRY RUN: would highlight active task pane."
    return 0
  fi

  terminal_bg "${PROCESSMAP_ITERM_ACTIVE_BG:-18212b}"
}

highlight_finish_hold() {
  token="$(cat "$HIGHLIGHT_TOKEN_FILE" 2>/dev/null || true)"
  hold_seconds="${PROCESSMAP_ITERM_DONE_HIGHLIGHT_SECONDS:-300}"

  if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
    echo "DRY RUN: would keep task highlight for $hold_seconds seconds, then clear it."
    return 0
  fi

  tty_path="$(tty 2>/dev/null || true)"
  [ -n "$tty_path" ] && [ "$tty_path" != "not a tty" ] || return 0

  (
    sleep "$hold_seconds"
    current_token="$(cat "$HIGHLIGHT_TOKEN_FILE" 2>/dev/null || true)"
    if [ "$current_token" = "$token" ]; then
      printf '\033]1337;SetColors=bg=default\a' > "$tty_path" 2>/dev/null || true
      rm -f "$HIGHLIGHT_TOKEN_FILE" 2>/dev/null || true
    fi
  ) >/dev/null 2>&1 &
}

run_highlighted_task() {
  highlight_start
  set +e
  "$@"
  task_rc="$?"
  set -e
  highlight_finish_hold
  return "$task_rc"
}

render_markdown_file() {
  file="${1:?markdown file required}"
  max_lines="${PROMPT_PREVIEW_LINES:-45}"
  [ -f "$file" ] || return 0

  if [ "${max_lines:-0}" -eq 0 ] 2>/dev/null; then
    printf '\n\033[1mPROMPT PREVIEW\033[0m \033[2m%s\033[0m\n' "$file"
    printf '\033[2m%s\033[0m\n\n' "skipped: PROCESSMAP_AGENT_PROMPT_PREVIEW_LINES=0"
    return 0
  fi

  total_lines="$(wc -l < "$file" 2>/dev/null | tr -d ' ' || echo 0)"
  printf '\n\033[1mPROMPT PREVIEW\033[0m \033[2m%s\033[0m\n' "$file"
  printf '\033[2m%s\033[0m\n' "--------------------------------------------------------"

  if command -v bat >/dev/null 2>&1; then
    bat --color=always --language=markdown --style=plain --line-range "1:$max_lines" "$file" 2>/dev/null || sed -n "1,${max_lines}p" "$file"
  elif command -v batcat >/dev/null 2>&1; then
    batcat --color=always --language=markdown --style=plain --line-range "1:$max_lines" "$file" 2>/dev/null || sed -n "1,${max_lines}p" "$file"
  elif command -v glow >/dev/null 2>&1; then
    sed -n "1,${max_lines}p" "$file" | glow -s dark 2>/dev/null || sed -n "1,${max_lines}p" "$file"
  elif command -v pygmentize >/dev/null 2>&1; then
    sed -n "1,${max_lines}p" "$file" | pygmentize -l md -f terminal256 2>/dev/null || sed -n "1,${max_lines}p" "$file"
  else
    sed -n "1,${max_lines}p" "$file" | awk '
      BEGIN {
        reset = "\033[0m"; bold = "\033[1m"; dim = "\033[2m";
        cyan = "\033[36m"; green = "\033[32m"; yellow = "\033[33m";
        code = 0;
      }
      /^```/ { code = !code; print yellow $0 reset; next }
      code { print cyan $0 reset; next }
      /^#{1,6}[[:space:]]/ { print bold cyan $0 reset; next }
      /^[-*][[:space:]]/ { print green $0 reset; next }
      /^[[:space:]]*[0-9]+\.[[:space:]]/ { print green $0 reset; next }
      /^>/ { print dim $0 reset; next }
      { print }
    '
  fi

  if [ "${total_lines:-0}" -gt "$max_lines" ] 2>/dev/null; then
    printf '\033[2m... truncated: %s total lines, showing first %s. Set PROCESSMAP_AGENT_PROMPT_PREVIEW_LINES to change.\033[0m\n' "$total_lines" "$max_lines"
  fi
  printf '\033[2m%s\033[0m\n\n' "--------------------------------------------------------"
}

agent_chat_formatting_contract() {
  cat <<'EOF'

Chat readability contract:
- Use Markdown with short sections and bullets; avoid long unbroken paragraphs.
- Do not restate, summarize, or quote this prompt in chat.
- Chat budget: at start print at most 6 lines; during work print only blockers; final response should be at most 12 lines.
- Lead with compact status lines or a small table when reporting progress.
- Keep each paragraph under 3 terminal lines.
- For verdicts or blockers, use explicit labels: PASS, WAIT, BLOCKED, CHANGES_REQUESTED, DONE.
- Do not paste full diffs, CSS files, logs, JSON payloads, RAG output, or stack traces into chat.
- In chat, use summaries, file paths, line references, and `git diff --stat`; put detailed evidence in the required report files.
- If command output is needed, show at most 8 relevant lines and state where the full output was saved.
- Keep RAG/GSD/Obsidian evidence compact: facts used, source identifiers, and decisions changed, not long copied passages.
EOF
}

llm_bin() {
  case "$LLM" in
    kimi) command -v kimi ;;
    codex) command -v codex ;;
    claude) command -v claude || command -v claude-code ;;
    *) return 1 ;;
  esac
}

codex_reasoning_effort() {
  case "$AGENT" in
    1) printf '%s\n' "${PROCESSMAP_CODEX_AGENT1_EFFORT:-medium}" ;;
    2) printf '%s\n' "${PROCESSMAP_CODEX_EXECUTOR_EFFORT:-high}" ;;
    3) printf '%s\n' "medium" ;;
    *) printf '%s\n' "medium" ;;
  esac
}

codex_reasoning_args() {
  effort="$(codex_reasoning_effort)"
  printf -- '-c %s ' "model_reasoning_effort=\"$effort\""
}

claude_permission_args() {
  tools="default"
  obsidian_dir="/srv/obsidian/project-atlas/ProcessMap"
  mcp_config="$ROOT/.mcp.json"
  context_prompt="ProcessMap contour session.
Role: $TITLE.
Contour id: $CID.
Run id: $RUN_ID.
Working directory: $ROOT.
Use full tool access without asking permission/setup questions.
Do not ask what contour this is; use the contour id above.
If the LLM is Claude, use MCP server gsd-skill-runner for GSD discipline because Codex skills are not available inside Claude.
Before planning or executing, read the contour artifacts, RAG preflight, GSD context, and Obsidian context proof when present.
If a required artifact is missing, write the required BLOCKED/MISSING artifact instead of asking the user basic setup questions.
Use absolute paths under $ROOT for marker/report writes when needed."

  printf -- '--permission-mode dontAsk --tools %s --add-dir %s ' \
    "$(printf '%q' "$tools")" \
    "$(printf '%q' "$ROOT")"
  if [ -d "$obsidian_dir" ]; then
    printf -- '--add-dir %s ' "$(printf '%q' "$obsidian_dir")"
  fi
  if [ -f "$mcp_config" ]; then
    printf -- '--mcp-config %s ' "$(printf '%q' "$mcp_config")"
  fi
  printf -- '--append-system-prompt %s ' "$(printf '%q' "$context_prompt")"
}

llm_prompt_command() {
  mode="${1:?mode required}"
  prompt="${2:-}"
  bin="$(llm_bin)"
  codex_args=""
  if [ "$LLM" = "codex" ]; then
    codex_args="$(codex_reasoning_args)"
  fi

  case "$LLM:$mode" in
    kimi:interactive) printf '%s\n' "$bin --yolo" ;;
    kimi:prompt) printf '%s\n' "$bin --yolo -p $(printf '%q' "$prompt")" ;;
    codex:interactive) printf '%s\n' "echo 'ERROR: Codex interactive mode is disabled for ProcessMap server agents. Use batch task mode.' >&2; exit 2" ;;
    codex:prompt) printf '%s\n' "$bin exec ${codex_args}--dangerously-bypass-approvals-and-sandbox $(printf '%q' "$prompt")" ;;
    claude:interactive) printf '%s\n' "echo 'ERROR: Claude interactive mode is disabled for ProcessMap server agents. Use batch task mode.' >&2; exit 2" ;;
    claude:prompt) printf '%s\n' "$bin -p $(printf '%q' "$prompt") $(claude_permission_args)" ;;
    *) return 1 ;;
  esac
}

run_kimi_interactive() {
  if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
    echo "DRY RUN: $LLM interactive agent would start here."
  else
    script_cmd="$(llm_prompt_command interactive)"
    run_highlighted_task bash -lc "$script_cmd"
  fi
}

run_kimi_prompt() {
  prompt_file="${1:?prompt file required}"
  user_prompt="Read and execute prompt file: $prompt_file"
  run_kimi_prompt_text "$user_prompt"
}

run_logged_command_with_heartbeat() {
  script_cmd="${1:?script command required}"
  log_file="${2:?log file required}"
  label="${3:-$LLM}"
  heartbeat_seconds="${PROCESSMAP_AGENT_HEARTBEAT_SECONDS:-60}"
  log_warn_bytes="${PROCESSMAP_AGENT_LOG_WARN_BYTES:-2500000}"
  log_warned=0

  echo
  echo "RUNNING: $label started. Some LLM print modes are quiet until final output."
  echo "Log: $log_file"
  echo "Heartbeat: every ${heartbeat_seconds}s"
  echo

  highlight_start
  set +e
  if command -v script >/dev/null 2>&1; then
    script -q -e -c "$script_cmd" "$log_file" >/dev/null 2>&1 &
  else
    bash -lc "$script_cmd" >"$log_file" 2>&1 &
  fi
  cmd_pid="$!"

  started_at="$(date +%s)"
  while kill -0 "$cmd_pid" 2>/dev/null; do
    sleep "$heartbeat_seconds" &
    sleep_pid="$!"
    wait "$sleep_pid" 2>/dev/null || true
    if kill -0 "$cmd_pid" 2>/dev/null; then
      now="$(date +%s)"
      elapsed="$((now - started_at))"
      log_size="$(stat -c %s "$log_file" 2>/dev/null || echo 0)"
      printf 'RUNNING: %s still active | elapsed=%ss | log=%s bytes | %s\n' \
        "$label" "$elapsed" "$log_size" "$(date -u +%H:%M:%SZ)"
      if [ "$log_warned" = "0" ] && [ "$log_size" -ge "$log_warn_bytes" ] 2>/dev/null; then
        echo "WARN: $label output is getting large. Agents should summarize in chat and write details to report files."
        log_warned=1
      fi
    fi
  done

  wait "$cmd_pid"
  cmd_rc="$?"
  set -e
  highlight_finish_hold
  return "$cmd_rc"
}

run_kimi_prompt_no_resume() {
  prompt_file="${1:?prompt file required}"
  user_prompt="Read and execute prompt file: $prompt_file"

  if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
    echo "DRY RUN: $LLM prompt run would start here without auto-resume:"
    echo "  $user_prompt"
    render_markdown_file "$prompt_file"
    return 0
  fi

  log_file="$RUN_STATE_DIR/$LLM-agent-$AGENT-$(date +%s).log"
  mkdir -p "$RUN_STATE_DIR"

  script_cmd="$(llm_prompt_command prompt "$user_prompt")"
  render_markdown_file "$prompt_file"
  run_logged_command_with_heartbeat "$script_cmd" "$log_file" "$LLM Agent $AGENT"
}

run_prompt_text_no_followup() {
  user_prompt="${1:?prompt required}"
  if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
    echo "DRY RUN: $LLM prompt run would start here without interactive follow-up:"
    echo "  ${user_prompt:0:240}"
    return 0
  fi

  log_file="$RUN_STATE_DIR/$LLM-agent-$AGENT-$(date +%s).log"
  mkdir -p "$RUN_STATE_DIR"

  script_cmd="$(llm_prompt_command prompt "$user_prompt")"
  run_logged_command_with_heartbeat "$script_cmd" "$log_file" "$LLM Agent $AGENT"
}

run_kimi_prompt_text() {
  user_prompt="${1:?prompt required}"
  if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
    echo "DRY RUN: $LLM prompt run would start here, then remain available for follow-up when supported:"
    echo "  $user_prompt"
    if printf '%s' "$user_prompt" | grep -F 'Read and execute prompt file: ' >/dev/null 2>&1; then
      preview_file="${user_prompt#Read and execute prompt file: }"
      render_markdown_file "$preview_file"
    fi
    return 0
  fi

  log_file="$RUN_STATE_DIR/$LLM-agent-$AGENT-$(date +%s).log"
  mkdir -p "$RUN_STATE_DIR"

  script_cmd="$(llm_prompt_command prompt "$user_prompt")"
  if printf '%s' "$user_prompt" | grep -F 'Read and execute prompt file: ' >/dev/null 2>&1; then
    preview_file="${user_prompt#Read and execute prompt file: }"
    render_markdown_file "$preview_file"
  fi
  if command -v script >/dev/null 2>&1; then
    run_highlighted_task script -q -e -c "$script_cmd" "$log_file"
    rc="$?"

    resume_id=""
    if [ "$LLM" = "kimi" ]; then
      resume_id="$(grep -aoE 'kimi -r [0-9a-f-]+' "$log_file" 2>/dev/null | tail -1 | awk '{print $3}')"
    fi

    open_followup="${PROCESSMAP_AGENT_OPEN_FOLLOWUP:-0}"
    if [ "$open_followup" = "1" ] && [ "$LLM" = "kimi" ] && [ -n "$resume_id" ]; then
      echo
      echo "Auto prompt finished. Reopening same Kimi session for follow-up input."
      echo "Resume session: $resume_id"
      echo
      run_highlighted_task kimi --yolo -r "$resume_id"
    elif [ "$open_followup" = "1" ] && { [ "$LLM" = "codex" ] || [ "$LLM" = "claude" ]; }; then
      echo
      echo "Auto prompt finished for $LLM. Opening interactive $LLM session for follow-up input."
      interactive_cmd="$(llm_prompt_command interactive)"
      run_highlighted_task bash -lc "$interactive_cmd"
    else
      echo
      echo "Auto prompt finished. Interactive follow-up is disabled."
      echo "Log: $log_file"
    fi

    return "$rc"
  fi

  run_highlighted_task bash -lc "$script_cmd"
}

run_kimi_followup() {
  role="${1:?role required}"
  state="${2:?state required}"
  followup_prompt="You are $role for ProcessMap. Current contour id: $CID. Current launcher run id: $RUN_ID. Working directory: /opt/processmap-test. Current state: $state. Do not start a new run automatically. Do not rewrite completion markers unless the user explicitly asks for changes. Stay in this Kimi session for follow-up instructions from the user."
  run_kimi_prompt_text "$followup_prompt"
}

run_kimi_agent1_guard() {
  prompt_file="${1:?prompt file required}"
  guard_prompt="You are Agent 1 / Planner for ProcessMap.

BOOTSTRAP MODE, ACTIVE IMMEDIATELY:
- Do not inspect the repository.
- Do not run rg, grep, find, ls, cat, sed, git, npm, node, tests, RAG, or any other command.
- Do not read files, including the prompt file, until the user sends the actual planning task in this same session.
- Do not create, edit, delete, or touch any planning artifacts yet.
- Your first and only reply before the user task must be exactly:
  READY_FOR_PLANNING contour=$CID run=$RUN_ID
- Then wait for the user's actual planning task.

Identity:
- Role: Agent 1 / Planner for ProcessMap.
- Current contour id: $CID
- Current launcher run id: $RUN_ID
- Output contract prompt file, to read only after the user task arrives: $prompt_file

$(agent_chat_formatting_contract)

After the user gives the actual planning task:
- Read the output contract prompt file.
- Before planning, read and record required context. This is fail-closed: Agent 2 will not start unless all three proof files exist and are non-empty.
- If this LLM is Claude, use MCP server gsd-skill-runner first: call list_skills, then invoke the relevant GSD skill instead of assuming Codex-local skills are available.
- RAG proof file:
  .planning/contours/$CID/RAG_PREFLIGHT_PLANNER.md
  Include the current launcher run id exactly: $RUN_ID
  Run, capture, and summarize:
  node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour \"$CID\" --area \"ProcessMap planning context\" --format md --top-k $RAG_TOP_K
- Obsidian proof file:
  .planning/contours/$CID/OBSIDIAN_CONTEXT_USED.md
  Include the current launcher run id exactly: $RUN_ID
  Read relevant notes from /srv/obsidian/project-atlas/ProcessMap when available. List the files actually read, their relevance, and decisions taken from them. If none are relevant, write the search/read commands and why no note was applicable.
- GSD proof file:
  .planning/contours/$CID/GSD_CONTEXT_USED.md
  Include the current launcher run id exactly: $RUN_ID
  Check and record compactly: command -v gsd; gsd 2>&1 | head -30; gsd state --raw 2>/dev/null || gsd state 2>/dev/null || true; find \"$PROCESSMAP_GSD_SKILLS_DIR\" -maxdepth 1 -type d -name 'gsd-*' | sort | head -15
- Write required files under .planning/contours/$CID/.
- Required outputs include PLAN.md, WORKER_PROMPT.md, REVIEWER_PROMPT.md, STATE.json, RAG_PREFLIGHT_PLANNER.md, OBSIDIAN_CONTEXT_USED.md, GSD_CONTEXT_USED.md, READY_FOR_EXECUTION, and AGENT_RUN_ID.
- AGENT_RUN_ID must contain exactly: $RUN_ID
- Use absolute paths under /opt/processmap-test for marker/report writes when needed.
- If Claude Write refuses to overwrite a marker/report file, use Read first or Bash heredocs with absolute paths; do not leave the artifact unwritten.
- Token economy applies to every LLM: use RAG/GSD/Obsidian to retrieve precise context, then write compact proof summaries instead of copying long source text into chat.
- Do not print large diffs/logs/file bodies. Use report files for details and show only status, changed files, and blockers in chat.
- After writing planning artifacts, run ./tools/pm-agent-mirror-report.sh \"$CID\" planner.

Hard rules:
- If the user's task belongs to another contour or asks for another contour, stop and tell the user to relaunch with that contour id.
- Never create a new contour from this session.
- Do not tell the user how to start Agent 2.
- Do not ask permission to start downstream agents.
- Agent 2 starts automatically from marker files.
- Planning is incomplete until AGENT_RUN_ID is written.
- Planning is incomplete until RAG/Obsidian/GSD proof files are written.
- Do not write product code as Planner.
- Do not merge, deploy, or open a PR.
- Do not print secrets."

  if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
    echo "DRY RUN: $LLM Agent 1 guard session would start here:"
    echo "$guard_prompt"
    return 0
  fi

  if [ "$LLM" = "kimi" ]; then
    run_kimi_prompt_text "$guard_prompt"
    return "$?"
  fi

  echo "ERROR: interactive Agent 1 is only allowed for Kimi."
  echo "Use launcher batch task mode for Codex/Claude server agents."
  return 2

  log_file="$RUN_STATE_DIR/$LLM-agent-$AGENT-$(date +%s).log"
  mkdir -p "$RUN_STATE_DIR"
  script_cmd="$(llm_prompt_command interactive "$guard_prompt")"
  if command -v script >/dev/null 2>&1; then
    run_highlighted_task script -q -e -c "$script_cmd" "$log_file"
    return "$?"
  fi
  run_highlighted_task bash -lc "$script_cmd"
}

mtime() {
  stat -c %Y "$1" 2>/dev/null || echo 0
}

worker_prompt_file() {
  if [ -f "$DIR/WORKER_PROMPT.md" ]; then
    printf '%s\n' "$DIR/WORKER_PROMPT.md"
  elif [ -f "$DIR/EXECUTOR_PROMPT.md" ]; then
    printf '%s\n' "$DIR/EXECUTOR_PROMPT.md"
  else
    return 1
  fi
}

planner_context_ready_dir() {
  context_dir="${1:?context dir required}"
  planner_context_file_ready "$context_dir/RAG_PREFLIGHT_PLANNER.md" || return 1
  planner_context_file_ready "$context_dir/OBSIDIAN_CONTEXT_USED.md" || return 1
  planner_context_file_ready "$context_dir/GSD_CONTEXT_USED.md" || return 1
}

planner_context_file_ready() {
  context_file="${1:?context file required}"
  [ -s "$context_file" ] || return 1
  grep -F "$RUN_ID" "$context_file" >/dev/null 2>&1 || return 1
}

planner_context_ready() {
  planner_context_ready_dir "$DIR"
}

write_planner_context_missing() {
  mkdir -p "$DIR"
  {
    echo "# Planner Context Missing"
    echo
    echo "- contour: \`$CID\`"
    echo "- run_id: \`$RUN_ID\`"
    echo "- written_at: \`$(date -u +"%Y-%m-%dT%H:%M:%SZ")\`"
    echo
    echo "Agent 1 produced planning markers without required context proof."
    echo "Downstream Agent 2 is intentionally blocked until Agent 1 reads and records RAG, Obsidian, and GSD context."
    echo
    echo "Missing or empty files:"
    for required_context_file in \
      RAG_PREFLIGHT_PLANNER.md \
      OBSIDIAN_CONTEXT_USED.md \
      GSD_CONTEXT_USED.md
    do
      if ! planner_context_file_ready "$DIR/$required_context_file"; then
        echo "- $required_context_file"
      fi
    done
  } > "$DIR/PLANNER_CONTEXT_MISSING.md"
}

prepare_planner_context_pack() {
  [ "$AGENT" = "1" ] || return 0
  mkdir -p "$DIR"

  if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
    echo "DRY RUN: would prepare planner RAG/Obsidian/GSD context proof files."
    return 0
  fi

  rag_tmp="$DIR/.RAG_PREFLIGHT_PLANNER.tmp"
  if [ -f "$ROOT/tools/rag/pm-rag-agent-preflight.mjs" ]; then
    if node "$ROOT/tools/rag/pm-rag-agent-preflight.mjs" \
      --role planner \
      --contour "$CID" \
      --area "ProcessMap planning context $CID" \
      --format md \
      --top-k "$RAG_TOP_K" > "$rag_tmp" 2>"$DIR/.RAG_PREFLIGHT_PLANNER.err"; then
      {
        echo "# RAG Preflight Planner"
        echo
        echo "- run_id: \`$RUN_ID\`"
        echo "- contour: \`$CID\`"
        echo "- generated_by: \`processmap-agent-pane.sh\`"
        echo "- generated_at: \`$(date -u +"%Y-%m-%dT%H:%M:%SZ")\`"
        echo "- command: \`node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour \"$CID\" --area \"ProcessMap planning context $CID\" --format md --top-k $RAG_TOP_K\`"
        echo
        cat "$rag_tmp"
      } > "$DIR/RAG_PREFLIGHT_PLANNER.md"
    else
      {
        echo "# RAG Preflight Planner"
        echo
        echo "- run_id: \`$RUN_ID\`"
        echo "- contour: \`$CID\`"
        echo "- status: \`failed\`"
        echo "- command: \`node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour \"$CID\" --area \"ProcessMap planning context $CID\" --format md --top-k $RAG_TOP_K\`"
        echo
        echo "## Error"
        sed -n '1,80p' "$DIR/.RAG_PREFLIGHT_PLANNER.err" 2>/dev/null || true
      } > "$DIR/RAG_PREFLIGHT_PLANNER.md"
    fi
    rm -f "$rag_tmp" "$DIR/.RAG_PREFLIGHT_PLANNER.err" 2>/dev/null || true
  else
    {
      echo "# RAG Preflight Planner"
      echo
      echo "- run_id: \`$RUN_ID\`"
      echo "- contour: \`$CID\`"
      echo "- status: \`missing_tools_rag_pm_rag_agent_preflight\`"
    } > "$DIR/RAG_PREFLIGHT_PLANNER.md"
  fi

  obsidian_tmp="$DIR/.OBSIDIAN_CONTEXT_SEARCH.tmp"
  obsidian_query="Obsidian Project Atlas ProcessMap planning context $CID"
  obsidian_root="/srv/obsidian/project-atlas/ProcessMap"
  obsidian_md_count=0
  if [ -d "$obsidian_root" ]; then
    obsidian_md_count="$(find "$obsidian_root" -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' ')"
  fi
  if [ -f "$ROOT/tools/rag/pm-rag-search.mjs" ]; then
    node "$ROOT/tools/rag/pm-rag-search.mjs" "$obsidian_query" --top-k "$RAG_TOP_K" --format md > "$obsidian_tmp" 2>/dev/null || true
  fi
  {
    echo "# Obsidian Context Used"
    echo
    echo "- run_id: \`$RUN_ID\`"
    echo "- contour: \`$CID\`"
    echo "- generated_by: \`processmap-agent-pane.sh\`"
    echo "- generated_at: \`$(date -u +"%Y-%m-%dT%H:%M:%SZ")\`"
    echo "- obsidian_root: \`$obsidian_root\`"
    echo "- obsidian_root_exists: \`$([ -d "$obsidian_root" ] && echo yes || echo no)\`"
    echo "- obsidian_markdown_files_visible: \`${obsidian_md_count:-0}\`"
    echo "- query: \`$obsidian_query\`"
    echo
    echo "## Files Read By Launcher"
    echo
    if [ -s "$obsidian_tmp" ]; then
      grep -E '^\| [0-9]+ \|' "$obsidian_tmp" | sed -n '1,10p' || true
    else
      echo "- No indexed Obsidian search results returned by launcher."
    fi
    echo
    echo "## Search Evidence"
    echo
    if [ -s "$obsidian_tmp" ]; then
      sed -n '1,180p' "$obsidian_tmp"
    else
      echo "No search output. Agent should inspect \`$obsidian_root\` directly if the planning task requires Obsidian notes."
    fi
    echo
    echo "## Planner Instruction"
    echo
    echo "Use these indexed Obsidian hits as grounding. If the user task names a specific note or area, run a narrower RAG search and update this file with only the files that changed planning decisions."
  } > "$DIR/OBSIDIAN_CONTEXT_USED.md"
  rm -f "$obsidian_tmp" 2>/dev/null || true

  {
    echo "# GSD Context Used"
    echo
    echo "- run_id: \`$RUN_ID\`"
    echo "- contour: \`$CID\`"
    echo "- generated_by: \`processmap-agent-pane.sh\`"
    echo "- generated_at: \`$(date -u +"%Y-%m-%dT%H:%M:%SZ")\`"
    echo
    echo "## Commands"
    echo
    echo "### command -v gsd"
    echo "\`\`\`"
    command -v gsd 2>/dev/null || true
    echo "\`\`\`"
    echo
    echo "### gsd help/status"
    echo "\`\`\`"
    gsd 2>&1 | sed -n '1,30p' || true
    echo "\`\`\`"
    echo
    echo "### gsd state"
    echo "\`\`\`"
    gsd state --raw 2>/dev/null | sed -n '1,80p' || gsd state 2>/dev/null | sed -n '1,80p' || true
    echo "\`\`\`"
    echo
    echo "### available gsd skills"
    echo "\`\`\`"
    find "$PROCESSMAP_GSD_SKILLS_DIR" -maxdepth 1 -type d -name 'gsd-*' 2>/dev/null | sort | sed -n '1,30p' || true
    echo "\`\`\`"
  } > "$DIR/GSD_CONTEXT_USED.md"
}

supersede_stale_planner_markers() {
  reason="${1:-agent1-current-run-start}"
  [ "$AGENT" = "1" ] || return 0
  [ -d "$DIR" ] || return 0

  planner_run="$(cat "$RUN_FILE" 2>/dev/null || true)"
  if [ -n "$planner_run" ] && [ "$planner_run" = "$RUN_ID" ]; then
    return 0
  fi

  has_stale=0
  for marker in \
    AGENT_RUN_ID \
    READY_FOR_EXECUTION \
    PLAN.md \
    WORKER_PROMPT.md \
    REVIEWER_PROMPT.md \
    EXECUTOR_PROMPT.md \
    STATE.json \
    RAG_PREFLIGHT_PLANNER.md \
    OBSIDIAN_CONTEXT_USED.md \
    GSD_CONTEXT_USED.md \
    PLANNER_CONTEXT_MISSING.md \
    EXEC_BLOCKED.md; do
    if [ -e "$DIR/$marker" ]; then
      has_stale=1
      break
    fi
  done

  [ "$has_stale" = "1" ] || return 0

  if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
    echo "DRY RUN: would supersede stale Agent 1 planner markers for $reason."
    echo "Previous AGENT_RUN_ID: ${planner_run:-<missing>}"
    return 0
  fi

  archive_dir="$DIR/planner-stale-superseded-$RUN_ID-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$archive_dir"
  for marker in \
    AGENT_RUN_ID \
    READY_FOR_EXECUTION \
    PLAN.md \
    WORKER_PROMPT.md \
    REVIEWER_PROMPT.md \
    EXECUTOR_PROMPT.md \
    STATE.json \
    RAG_PREFLIGHT_PLANNER.md \
    OBSIDIAN_CONTEXT_USED.md \
    GSD_CONTEXT_USED.md \
    PLANNER_CONTEXT_MISSING.md \
    EXEC_BLOCKED.md; do
    if [ -e "$DIR/$marker" ]; then
      mv "$DIR/$marker" "$archive_dir/$marker"
    fi
  done

  cat > "$DIR/STALE_PLANNER_MARKERS_SUPERSEDED.md" <<EOF
# Stale Planner Markers Superseded

Run ID: $RUN_ID
Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Reason: $reason
Archived to: $archive_dir
Previous AGENT_RUN_ID: ${planner_run:-<missing>}

These files were moved before Agent 1 started so Claude/Kimi/Codex can create
fresh current-run context proof and planning markers without reusing stale
handoff state.
EOF
}

current_agent1_ready() {
  [ -f "$DIR/READY_FOR_EXECUTION" ] || return 1
  worker_prompt="$(worker_prompt_file)" || return 1
  [ -f "$DIR/PLAN.md" ] || return 1
  planner_context_ready || return 1
  [ -f "$RUN_FILE" ] || return 1
  [ "$(cat "$RUN_FILE" 2>/dev/null || true)" = "$RUN_ID" ] || return 1

  exec_prompt_mtime="$(mtime "$worker_prompt")"
  ready_mtime="$(mtime "$DIR/READY_FOR_EXECUTION")"
  plan_mtime="$(mtime "$DIR/PLAN.md")"

  [ "$exec_prompt_mtime" -ge "$RUN_STARTED_AT" ] || \
    [ "$ready_mtime" -ge "$RUN_STARTED_AT" ] || \
    [ "$plan_mtime" -ge "$RUN_STARTED_AT" ]
}

fresh_plan_candidate() {
  candidate_dir="$1"
  [ -f "$candidate_dir/READY_FOR_EXECUTION" ] || return 1
  { [ -f "$candidate_dir/WORKER_PROMPT.md" ] || [ -f "$candidate_dir/EXECUTOR_PROMPT.md" ]; } || return 1
  [ -f "$candidate_dir/PLAN.md" ] || return 1
  planner_context_ready_dir "$candidate_dir" || return 1

  if [ -f "$candidate_dir/WORKER_PROMPT.md" ]; then
    exec_prompt_mtime="$(mtime "$candidate_dir/WORKER_PROMPT.md")"
  else
    exec_prompt_mtime="$(mtime "$candidate_dir/EXECUTOR_PROMPT.md")"
  fi
  ready_mtime="$(mtime "$candidate_dir/READY_FOR_EXECUTION")"
  plan_mtime="$(mtime "$candidate_dir/PLAN.md")"

  [ "$exec_prompt_mtime" -ge "$RUN_STARTED_AT" ] || \
    [ "$ready_mtime" -ge "$RUN_STARTED_AT" ] || \
    [ "$plan_mtime" -ge "$RUN_STARTED_AT" ]
}

adopt_unique_fresh_plan_contour() {
  matches_file="$(mktemp)"
  find "$ROOT/.planning/contours" -type f -name READY_FOR_EXECUTION -print 2>/dev/null | while read -r ready_file; do
    candidate_dir="$(dirname "$ready_file")"
    if fresh_plan_candidate "$candidate_dir"; then
      candidate_cid="${candidate_dir#$ROOT/.planning/contours/}"
      printf '%s\n' "$candidate_cid" >> "$matches_file"
    fi
  done

  match_count="$(sort -u "$matches_file" | wc -l | tr -d ' ')"
  if [ "$match_count" = "1" ]; then
    adopted_cid="$(sort -u "$matches_file")"
    rm -f "$matches_file"
    if [ "$adopted_cid" != "$CID" ]; then
      echo "Detected fresh plan in another contour for this run."
      echo "Old contour: $CID"
      echo "New contour: $adopted_cid"
      set_contour "$adopted_cid"
    fi
    publish_contour
    printf '%s\n' "$RUN_ID" > "$RUN_FILE"
    touch "$DIR/READY_FOR_EXECUTION"
    return 0
  fi

  if [ "$match_count" -gt "1" ]; then
    echo "Multiple fresh plan contours found; refusing to auto-adopt."
    sort -u "$matches_file" | sed 's/^/ - /'
  fi

  rm -f "$matches_file"
  return 1
}

current_worker_ready() {
  [ -f "$DIR/WORKER_DONE" ] || return 1
  [ -f "$DIR/WORKER_REPORT.md" ] || return 1
  [ -f "$WORKER_RUN_FILE" ] || return 1
  [ "$(cat "$WORKER_RUN_FILE" 2>/dev/null || true)" = "$RUN_ID" ] || return 1

  worker_report_mtime="$(mtime "$DIR/WORKER_REPORT.md")"
  worker_done_mtime="$(mtime "$DIR/WORKER_DONE")"

  [ "$worker_report_mtime" -ge "$RUN_STARTED_AT" ] || \
    [ "$worker_done_mtime" -ge "$RUN_STARTED_AT" ]
}

wait_for_execution_ready() {
  echo "Waiting for Agent 1 to finish planning..."
  echo "Need current run: $RUN_ID"
  echo "Need files: READY_FOR_EXECUTION + WORKER_PROMPT.md + AGENT_RUN_ID"
  echo "Need context proof: RAG_PREFLIGHT_PLANNER.md + OBSIDIAN_CONTEXT_USED.md + GSD_CONTEXT_USED.md"
  echo

  stale_notice_printed=0
  while true; do
    sync_published_contour
    if stop_requested; then
      echo "Stop requested by Agent 1 exit. Agent 2 will not start."
      return 130
    fi

    if [ -f "$DIR/EXEC_BLOCKED.md" ] && ! current_agent1_ready; then
      echo "BLOCKED: Agent 1 marked execution blocked:"
      sed -n '1,120p' "$DIR/EXEC_BLOCKED.md" || true
      return 2
    fi

    if current_agent1_ready; then
      return 0
    fi

    if adopt_unique_fresh_plan_contour; then
      return 0
    fi

    if [ -f "$DIR/READY_FOR_EXECUTION" ] && \
       { [ -f "$DIR/WORKER_PROMPT.md" ] || [ -f "$DIR/EXECUTOR_PROMPT.md" ]; } && \
       { [ ! -f "$RUN_FILE" ] || [ "$(cat "$RUN_FILE" 2>/dev/null || true)" != "$RUN_ID" ]; }; then
      if [ "$stale_notice_printed" = "0" ]; then
        echo "Stale Agent 1 output found, ignored. Waiting for current run."
        echo "Current run: $RUN_ID"
        echo "Marker run:  $(cat "$RUN_FILE" 2>/dev/null || echo '<missing>')"
        echo
        stale_notice_printed=1
      fi
    fi

    if [ -f "$DIR/READY_FOR_EXECUTION" ] && \
       { [ -f "$DIR/WORKER_PROMPT.md" ] || [ -f "$DIR/EXECUTOR_PROMPT.md" ]; } && \
       [ -f "$DIR/PLAN.md" ] && \
       [ -f "$RUN_FILE" ] && \
       [ "$(cat "$RUN_FILE" 2>/dev/null || true)" = "$RUN_ID" ] && \
       ! planner_context_ready; then
      write_planner_context_missing
      if [ "$stale_notice_printed" = "0" ]; then
        echo "Planner output found, but context proof is missing. Waiting for Agent 1 to read RAG/Obsidian/GSD."
        echo "Wrote: $DIR/PLANNER_CONTEXT_MISSING.md"
        echo
        stale_notice_printed=1
      fi
    fi

    if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
      echo "DRY RUN: would keep waiting for Agent 1 output."
      return 0
    fi

    sleep 5
  done
}

wait_for_worker_done() {
  echo "Waiting for Agent 2 to finish execution..."
  echo "Need current run: $RUN_ID"
  echo "Need files: WORKER_DONE + WORKER_REPORT.md + WORKER_RUN_ID"
  echo

  stale_notice_printed=0
  while true; do
    sync_published_contour
    if stop_requested; then
      echo "Stop requested by Agent 1 exit. Agent 3 will not start."
      return 130
    fi

    if [ -f "$DIR/EXEC_BLOCKED.md" ] && ! current_worker_ready; then
      echo "BLOCKED: Agent 2 marked execution blocked:"
      sed -n '1,120p' "$DIR/EXEC_BLOCKED.md" || true
      return 2
    fi

    if current_worker_ready; then
      return 0
    fi

    if [ -f "$DIR/WORKER_DONE" ] && \
       [ -f "$DIR/WORKER_REPORT.md" ] && \
       { [ ! -f "$WORKER_RUN_FILE" ] || [ "$(cat "$WORKER_RUN_FILE" 2>/dev/null || true)" != "$RUN_ID" ]; }; then
      if [ "$stale_notice_printed" = "0" ]; then
        echo "Stale Agent 2 output found, ignored. Waiting for current run."
        echo "Current run: $RUN_ID"
        echo "Marker run:  $(cat "$WORKER_RUN_FILE" 2>/dev/null || echo '<missing>')"
        echo
        stale_notice_printed=1
      fi
    fi

    if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
      echo "DRY RUN: would keep waiting for Agent 2 output."
      return 0
    fi

    sleep 5
  done
}

reviewer_loop() {
  local review_version="0"
  local last_worker_version="0"

  while true; do
    if stop_requested; then
      echo "STOP requested. Exiting reviewer loop."
      return 130
    fi

    if [ ! -f "$DIR/WORKER_DONE" ] || [ ! -f "$DIR/WORKER_REPORT.md" ]; then
      echo "Waiting for WORKER_DONE + WORKER_REPORT.md..."
      sleep 5
      continue
    fi

    current_worker_version="$(cat "$WORKER_RUN_FILE" 2>/dev/null || echo "0")"

    if [ -f "$DIR/REVIEW_PASS" ] && [ "$last_worker_version" = "$current_worker_version" ]; then
      echo "Review PASS already recorded for worker version $current_worker_version."
      return 0
    fi

    if [ -f "$DIR/CHANGES_REQUESTED" ] && [ "$last_worker_version" = "$current_worker_version" ]; then
      echo "CHANGES_REQUESTED still active for worker version $current_worker_version. Waiting for rework..."
      sleep 5
      continue
    fi

    if [ "$last_worker_version" != "$current_worker_version" ] || [ ! -f "$DIR/REVIEW_STARTED" ]; then
      last_worker_version="$current_worker_version"
      date -u +"%Y-%m-%dT%H:%M:%SZ" > "$DIR/REVIEW_STARTED"
      printf '%s\n' "$RUN_ID" > "$REVIEW_RUN_FILE"

      review_prompt="$ROOT/.agents/agent3-reviewer/prompts/${SLUG}-reviewer-v${current_worker_version}.md"
      mkdir -p "$(dirname "$review_prompt")"

      local rag_ctx_path=""
      local ctx="$RUN_STATE_DIR/rag/RAG_BASE_CONTEXT.json"
      if [ -f "$ctx" ]; then
        rag_ctx_path="$ctx"
      fi

      cat > "$review_prompt" <<PROMPT_EOF
You are Agent 3 / Reviewer for ProcessMap.

Working directory:
cd /opt/processmap-test

Contour id:
$CID

Run ID:
$RUN_ID

Worker Report Version:
$current_worker_version

RAG base context (reused from Agent 1):
${rag_ctx_path:+$(cat "$rag_ctx_path" 2>/dev/null || true)}

Targeted RAG (only if specific review topic requires it):
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "$CID" \
  --area "review context" \
  --format md \
  --query "<specific review topic>" \
  --top-k 5

Review inputs:
- .planning/contours/$CID/PLAN.md
- .planning/contours/$CID/REVIEWER_PROMPT.md
- .planning/contours/$CID/WORKER_REPORT.v${current_worker_version}.md (or WORKER_REPORT.md symlink)
- .planning/contours/$CID/RUNTIME_PROOF_CHECKLIST.md if present

Rules:
- Do not write product code.
- Do not merge/deploy/PR.
- If PASS: create REVIEW_REPORT.md and REVIEW_PASS.
- If FAIL: create REVIEW_REPORT.md, CHANGES_REQUESTED, and REWORK_REQUEST.md.
- If BLOCKED: create REVIEW_BLOCKED.md.
PROMPT_EOF

      echo "Starting review for worker version $current_worker_version"

      if [ -x "$ROOT/tools/pm-uiux-auto-enrich.sh" ]; then
        "$ROOT/tools/pm-uiux-auto-enrich.sh" enrich "$CID" "$review_prompt" || true
      fi

      if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
        echo "DRY RUN: reviewer would start here."
        return 0
      fi

      if command -v kimi >/dev/null 2>&1; then
        kimi --yolo -p "Read and execute prompt file: $review_prompt" || true
      else
        echo "ERROR: kimi not available"
      fi

      if [ -x "$ROOT/tools/pm-agent-mirror-report.sh" ]; then
        "$ROOT/tools/pm-agent-mirror-report.sh" "$CID" reviewer || true
      fi

      echo "Review cycle completed for worker version $current_worker_version"
    fi

    sleep 5
  done
}

print_startup_header() {
  t="${1:-$TITLE}"
  p="${2:-<no prompt>}"
  echo "================================"
  echo "  $t"
  echo "================================"
  echo "Server:  $(hostname)"
  echo "Root:    $ROOT"
  echo "Contour: $CID"
  echo "Run ID:  $RUN_ID"
  echo "Prompt:  $p"
  echo "================================"
  echo
}

case "$AGENT" in
  0)
    while true; do
      clear 2>/dev/null || true
      echo "Agent 0 / Analytics"
      echo "Run ID: $RUN_ID | Contour: $CID"
      echo
      "$ROOT/tools/pm-agent-status.sh" "$CID" 2>/dev/null || true
      echo
      echo "Refreshing in 30s..."
      sleep 30
    done
    ;;

  1)
    PROMPT="$ROOT/.agents/agent1-planner/prompts/${SLUG}-planner-start.md"
    mkdir -p "$(dirname "$PROMPT")"

    clear || true
    print_startup_header "$TITLE" "$PROMPT"

    supersede_stale_planner_markers
    prepare_planner_context_pack
    printf '%s\n' "$RUN_ID" > "$RUN_FILE"

    if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
      echo
      echo "DRY RUN: Agent 1 would start interactive planning."
      rc=0
    else
      set +e
      run_kimi_agent1_guard "$PROMPT"
      rc=$?
      set -e
      mirror_contour "planner"
    fi
    ;;

  2)
    PROMPT="$ROOT/.agents/agent2-worker/prompts/${SLUG}-worker-start.md"
    mkdir -p "$(dirname "$PROMPT")"

    clear || true
    print_startup_header "$TITLE" "$PROMPT"

    wait_for_execution_ready

    if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ] && ! current_agent1_ready; then
      echo
      echo "DRY RUN: Agent 2 would remain blocked until current-run READY_FOR_EXECUTION."
      rc=0
    else
      printf '%s\n' "$RUN_ID" > "$WORKER_RUN_FILE"

      cat > "$PROMPT" <<PROMPT_EOF
You are Agent 2 / Worker for ProcessMap.

Working directory:
cd /opt/processmap-test

Contour id:
$CID

Current launcher run id:
$RUN_ID

Launcher started at unix timestamp:
$RUN_STARTED_AT

Execution inputs:
.planning/contours/$CID/PLAN.md
$(worker_prompt_file)
.planning/contours/$CID/RUNTIME_PROOF_CHECKLIST.md if present

$(agent_chat_formatting_contract)

Before execution, run worker RAG preflight when tools/rag/pm-rag-agent-preflight.mjs exists:
node tools/rag/pm-rag-agent-preflight.mjs --role worker --contour "$CID" --area "worker context" --format md --top-k $RAG_TOP_K

Context discipline:
- Read PLAN.md, RAG_PREFLIGHT_PLANNER.md, OBSIDIAN_CONTEXT_USED.md, and GSD_CONTEXT_USED.md before editing.
- Save .planning/contours/$CID/CONTEXT_USED_WORKER.md with the RAG command output summary, Obsidian/GSD facts used, and any context that changed your implementation choices.

Output contract:
- .planning/contours/$CID/WORKER_REPORT.md
- .planning/contours/$CID/CONTEXT_USED_WORKER.md
- .planning/contours/$CID/WORKER_DONE
- .planning/contours/$CID/WORKER_RUN_ID containing exactly:
  $RUN_ID

Obsidian mirror contract:
- Primary artifacts stay in .planning/contours/$CID/.
- After writing/updating execution artifacts, run:
  ./tools/pm-agent-mirror-report.sh "$CID" worker
- This mirrors allowed report files to:
  /srv/obsidian/project-atlas/ProcessMap/AgentReports/$CID/

If blocked:
- .planning/contours/$CID/EXEC_BLOCKED.md

Rules:
- Complete the full bounded execution lane assigned by PLAN.md.
- Stay inside the contour scope.
- Do not merge/deploy/PR unless explicitly allowed.
- Do not print secrets.
- Token economy applies: use RAG/GSD/Obsidian context, keep chat compact, put details in files.
PROMPT_EOF

      echo "Agent 1 output detected."
      echo "Starting $LLM for worker execution with full permissions."
      echo "Start prompt: $PROMPT"
      echo
      set +e
      run_kimi_prompt_no_resume "$PROMPT"
      rc=$?
      set -e
      mirror_contour "worker"
    fi
    ;;

  3)
    PROMPT="$ROOT/.agents/agent3-reviewer/prompts/${SLUG}-reviewer-start.md"
    mkdir -p "$(dirname "$PROMPT")"

    clear || true
    print_startup_header "$TITLE" "$PROMPT"

    wait_for_worker_done

    if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ] && ! current_worker_ready; then
      echo
      echo "DRY RUN: Agent 3 would remain blocked until current-run WORKER_DONE."
      rc=0
    else
      set +e
      reviewer_loop
      rc=$?
      set -e
      mirror_contour "reviewer"
    fi
    ;;
esac

echo
if [ "$AGENT" = "1" ]; then
  if current_agent1_ready; then
    echo "$TITLE exited with code $rc. Planning is ready; Agent 2 may continue."
  else
    echo "$TITLE exited with code $rc before planning was ready. Agent 2 and Agent 3 stop has been requested."
  fi
else
  echo "$TITLE exited with code $rc. Shell stays open."
fi
if [ "$PROCESSMAP_AGENT_DRY_RUN" = "1" ]; then
  if [ "$AGENT" = "1" ] && ! current_agent1_ready; then
    request_downstream_stop
  fi
  echo "DRY RUN: remote shell would exit here."
  exit "$rc"
fi
if [ "$AGENT" = "1" ] && ! current_agent1_ready; then
  request_downstream_stop
  exit "$rc"
fi
env \
  PROCESSMAP_NO_TMUX=1 \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/deploy/.local/bin" \
  HOME="/home/deploy" \
  TERM="${TERM:-xterm-256color}" \
  bash --noprofile --norc -i
exit "$rc"
REMOTE

printf 'Starting %s on %s\n' "$TITLE" "$SERVER"
LOCAL_REMOTE_SCRIPT="$(mktemp "${TMPDIR:-/tmp}/processmap-agent-pane-remote.XXXXXX")"
trap 'rm -f "$LOCAL_REMOTE_SCRIPT"' EXIT
printf '%s\n' "$REMOTE_CMD" | sed 's/\\\$/$/g' >"$LOCAL_REMOTE_SCRIPT"
REMOTE_SCRIPT_DIR="$ROOT/.agents/run-state/$RUN_ID/scripts"
REMOTE_SCRIPT="$REMOTE_SCRIPT_DIR/agent-$AGENT-$$.sh"
REMOTE_SCRIPT_Q="$(printf '%q' "$REMOTE_SCRIPT")"

RUN_STATE_DIR_REMOTE="$ROOT/.agents/run-state/$RUN_ID"

if [ "${PROCESSMAP_AGENT_LOCAL:-0}" = "1" ]; then
  # Local container mode: create dirs and copy script locally
  mkdir -p "$RUN_STATE_DIR_REMOTE/scripts"
  cp "$LOCAL_REMOTE_SCRIPT" "$REMOTE_SCRIPT"
  chmod 700 "$REMOTE_SCRIPT"
  if [ -n "${LOCAL_CONFIG_FILE:-}" ] && [ -f "$LOCAL_CONFIG_FILE" ]; then
    cp "$LOCAL_CONFIG_FILE" "$RUN_STATE_DIR_REMOTE/config.sh" 2>/dev/null || true
  fi
else
  ssh -n -o ControlMaster=no "$SERVER" "mkdir -p $(printf '%q' "$RUN_STATE_DIR_REMOTE")/scripts" >/dev/null 2>&1 || true

  if [ "$AGENT" = "0" ]; then
    while ! ssh "$SERVER" "cat > $REMOTE_SCRIPT_Q" <"$LOCAL_REMOTE_SCRIPT" 2>/dev/null; do
      clear 2>/dev/null || true
      printf '%s\n' "Agent 0 / Analytics"
      printf '%s\n' "WAIT: cannot upload analytics monitor to server."
      printf 'Server:  %s\n' "$SERVER"
      printf 'Root:    %s\n' "$ROOT"
      printf 'Contour: %s\n' "$CID"
      printf 'Run ID:  %s\n' "$RUN_ID"
      printf '%s\n' "Retrying in 15 seconds. This pane stays open and uses no LLM tokens."
      sleep 15
    done
  else
    upload_ok=0
    for upload_try in 1 2 3 4 5; do
      if scp -q -o ControlMaster=no "$LOCAL_REMOTE_SCRIPT" "$SERVER:$REMOTE_SCRIPT"; then
        ssh "$SERVER" "chmod 700 $REMOTE_SCRIPT_Q" >/dev/null 2>&1 || true
        upload_ok=1
        break
      fi
      echo "WARN: remote script upload failed for Agent $AGENT; retry $upload_try/5..."
      sleep 2
    done
    if [ "$upload_ok" != "1" ]; then
      echo "ERROR: remote script upload failed after retries for Agent $AGENT." >&2
      exit 255
    fi
  fi
  if [ "$AGENT" != "0" ]; then
    rm -f "$LOCAL_REMOTE_SCRIPT"
    trap - EXIT
  fi
  if [ -n "${LOCAL_CONFIG_FILE:-}" ] && [ -f "$LOCAL_CONFIG_FILE" ]; then
    scp -q "$LOCAL_CONFIG_FILE" "$SERVER:$(printf '%q' "$RUN_STATE_DIR_REMOTE")/config.sh" >/dev/null 2>&1 || true
  fi
fi

REMOTE_EXEC="source $(printf '%q' "$RUN_STATE_DIR_REMOTE")/config.sh 2>/dev/null || true; bash $(printf '%q' "$REMOTE_SCRIPT")"

# Local container mode: execute the generated script directly without SSH/SCP
if [ "${PROCESSMAP_AGENT_LOCAL:-0}" = "1" ]; then
  export ROOT CID AGENT TITLE LLM RUN_ID RUN_STARTED_AT RAG_TOP_K PROMPT_PREVIEW_LINES AGENT1_TASK PROCESSMAP_AGENT_DRY_RUN PROCESSMAP_NO_TMUX
  if [ "$AGENT" = "0" ]; then
    while true; do
      set +e
      bash "$LOCAL_REMOTE_SCRIPT"
      local_rc="$?"
      set -e
      printf '\nAgent 0 / Analytics exited with code %s. Restarting in 15 seconds; no LLM tokens are used.\n' "$local_rc"
      sleep 15
    done
  else
    set +e
    bash "$LOCAL_REMOTE_SCRIPT"
    local_rc="$?"
    set -e
    rm -f "$LOCAL_REMOTE_SCRIPT"
    trap - EXIT
    exit "$local_rc"
  fi
fi

if [ "$AGENT" = "0" ]; then
  while true; do
    set +e
    ssh -tt -o ControlMaster=no "$SERVER" "env ROOT=$ROOT_Q CID=$CID_Q AGENT=$AGENT_Q TITLE=$TITLE_Q SERVER=$SERVER_Q PROCESSMAP_AGENT_DRY_RUN=$DRY_Q LLM=$LLM_Q RUN_ID=$RUN_ID_Q RUN_STARTED_AT=$RUN_STARTED_AT_Q RAG_TOP_K=$RAG_TOP_K_Q PROMPT_PREVIEW_LINES=$PROMPT_PREVIEW_LINES_Q AGENT1_TASK=$AGENT1_TASK_Q PROCESSMAP_AGENT1_TASK=$AGENT1_TASK_Q PROCESSMAP_NO_TMUX=1 PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/deploy/.local/bin HOME=/home/deploy TERM=xterm-256color bash --noprofile --norc -c $(printf '%q' "$REMOTE_EXEC")"
    ssh_rc="$?"
    set -e
    printf '\nAgent 0 / Analytics disconnected with code %s. Reconnecting in 15 seconds; no LLM tokens are used.\n' "$ssh_rc"
    sleep 15
    ssh "$SERVER" "mkdir -p $(printf '%q' "$RUN_STATE_DIR_REMOTE")/scripts && cat > $(printf '%q' "$REMOTE_SCRIPT")" <"$LOCAL_REMOTE_SCRIPT" 2>/dev/null || true
  done
else
  rm -f "$LOCAL_REMOTE_SCRIPT"
  trap - EXIT
  set +e
  ssh -tt -o ControlMaster=no "$SERVER" "env ROOT=$ROOT_Q CID=$CID_Q AGENT=$AGENT_Q TITLE=$TITLE_Q SERVER=$SERVER_Q PROCESSMAP_AGENT_DRY_RUN=$DRY_Q LLM=$LLM_Q RUN_ID=$RUN_ID_Q RUN_STARTED_AT=$RUN_STARTED_AT_Q RAG_TOP_K=$RAG_TOP_K_Q PROMPT_PREVIEW_LINES=$PROMPT_PREVIEW_LINES_Q AGENT1_TASK=$AGENT1_TASK_Q PROCESSMAP_AGENT1_TASK=$AGENT1_TASK_Q PROCESSMAP_NO_TMUX=1 PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/deploy/.local/bin HOME=/home/deploy TERM=xterm-256color bash --noprofile --norc -c $(printf '%q' "$REMOTE_EXEC")"
  ssh_rc="$?"
  set -e
  ssh -n -o ControlMaster=no "$SERVER" "rm -f $(printf '%q' "$REMOTE_SCRIPT")" >/dev/null 2>&1 || true

  exit "$ssh_rc"
fi
