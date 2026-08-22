#!/usr/bin/env python3
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

TRACE_PATH = Path(__file__).with_name("profiles") / "drag_baseline_trace.json"
MAP_PATH = Path("/opt/processmap-test/frontend/dist/assets/index-wyNpYqLC.js.map")

def main():
    trace_path = Path(sys.argv[1]) if len(sys.argv) > 1 else TRACE_PATH
    with open(trace_path) as f:
        events = json.load(f)

    marks = {}
    main_pid_tid = None
    for e in events:
        n = e.get("name", "")
        if e.get("cat") == "blink.user_timing" and n.startswith(("drag", "pan")):
            marks[n] = e["ts"]
        if n == "thread_name" and e.get("args", {}).get("name") == "CrRendererMain":
            main_pid_tid = (e["pid"], e["tid"])

    start_ts = marks.get("drag-start")
    end_ts = marks.get("pan-end")
    if not start_ts or not end_ts:
        print("missing marks")
        sys.exit(1)

    funcs = defaultdict(lambda: [0, 0, None])  # count, total_us, sample_event
    for e in events:
        if (e.get("pid"), e.get("tid")) != main_pid_tid:
            continue
        if not (start_ts <= e["ts"] <= end_ts):
            continue
        dur = e.get("dur", 0)
        if not dur:
            continue
        data = e.get("args", {}).get("data", {})
        url = data.get("url", "")
        if "index-wyNpYqLC.js" not in url:
            continue
        fn = data.get("functionName", "?")
        line = data.get("lineNumber", 0)
        col = data.get("columnNumber", 0)
        key = (fn, line, col)
        funcs[key][0] += 1
        funcs[key][1] += dur
        if funcs[key][2] is None:
            funcs[key][2] = data

    # Top by total duration
    top = sorted(funcs.items(), key=lambda kv: kv[1][1], reverse=True)[:40]
    inputs = []
    for (fn, line, col), (count, total, sample) in top:
        inputs.append({"name": fn, "line": line, "column": col, "count": count, "totalMs": total / 1000})

    # Use Node source-map library via a small inline JS
    js_code = """
const fs = require('fs');
const { SourceMapConsumer } = require('source-map');
const map = fs.readFileSync(process.argv[1], 'utf8');
const inputs = JSON.parse(process.argv[2]);
SourceMapConsumer.with(map, null, (consumer) => {
  for (const item of inputs) {
    const pos = consumer.originalPositionFor({ line: item.line + 1, column: item.column });
    const src = pos.source ? pos.source.replace(/^\\.\\//, '').replace(/^\\.\\.\\//, '') : '';
    const fn = pos.name || item.name;
    console.log(JSON.stringify({ ...item, originalFile: src, originalName: fn, originalLine: pos.line, originalColumn: pos.column }));
  }
});
"""
    proc = subprocess.run(
        ["node", "-e", js_code, str(MAP_PATH), json.dumps(inputs)],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        print("mapping failed", proc.stderr)
        sys.exit(1)

    print(f"{'totalMs':>8} {'count':>6} {'minified':>12} {'original':>30} {'file':>60}")
    for line in proc.stdout.strip().split("\n"):
        if not line:
            continue
        item = json.loads(line)
        print(
            f"{item['totalMs']:8.1f} {item['count']:6d} {item['name']:12s} "
            f"{item['originalName'][:28]:30s} {item['originalFile'][:58]:60s}"
        )

if __name__ == "__main__":
    main()
