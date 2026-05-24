# CID_PROPAGATION_REPORT

## Proven Path

Main launcher:

```text
ProcessMap Agents.command -> "$HOME/bin/processmap-iterm-agents.sh" "$CID"
ProcessMap Agents.command -> "$HOME/bin/processmap-iterm-agents-3windows.sh" "$CID"
```

Split helper:

```text
A1: processmap-agent-pane.sh 1 "$CID"
A2: processmap-agent-pane.sh 2 "$CID"
A3: processmap-agent-pane.sh 3 "$CID"
```

3-window helper:

```text
A1: processmap-agent-pane.sh 1 "$CID"
A2: processmap-agent-pane.sh 2 "$CID"
A3: processmap-agent-pane.sh 3 "$CID"
```

Shared pane helper:

```text
AGENT="$1"
CID="$2"
cd "$ROOT" where ROOT=/opt/processmap-test
```

## Validation Evidence

Dry-run with `tooling/launcher-smoke-test-v1` printed all three commands with the same CID in split mode and 3-window mode.

Invalid CID test:

```text
processmap-iterm-agents.sh 'bad cid' -> rc=2
```

## Decision

CID propagation is proven for the current launcher path. Slash-containing CIDs are supported. Space-containing CIDs are rejected.
