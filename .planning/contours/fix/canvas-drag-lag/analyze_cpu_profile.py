#!/usr/bin/env python3
import json
import sys
from collections import defaultdict
from pathlib import Path

TRACE_PATH = Path(__file__).with_name("profiles") / "drag_baseline_trace.json"

def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else TRACE_PATH
    print(f"Loading {path} ...", file=sys.stderr)
    with open(path) as f:
        events = json.load(f)

    marks = {}
    main_pid_tid = None
    profile_start_ts = None
    for e in events:
        name = e.get("name", "")
        if e.get("cat") == "blink.user_timing" and name.startswith(("drag", "pan")):
            marks[name] = e["ts"]
        if name == "thread_name" and e.get("args", {}).get("name") == "CrRendererMain":
            main_pid_tid = (e["pid"], e["tid"])
        if name == "Profile":
            profile_start_ts = e["ts"]

    start_ts = marks.get("drag-start")
    end_ts = marks.get("pan-end")
    if not start_ts or not end_ts:
        print("Missing drag/pan marks", file=sys.stderr)
        sys.exit(1)
    print(f"Renderer main thread: {main_pid_tid}", file=sys.stderr)
    print(f"Drag+pan interval: {(end_ts - start_ts) / 1e3:.1f} ms", file=sys.stderr)

    # Parse ProfileChunk events
    nodes = {}
    samples = []  # list of (timestamp_us, node_id)
    for e in events:
        if e.get("name") != "ProfileChunk":
            continue
        data = e.get("args", {}).get("data", {})
        cpu = data.get("cpuProfile", {})
        # nodes may be repeated across chunks; assume stable ids
        for n in cpu.get("nodes", []):
            nodes[n["id"]] = n
        chunk_samples = cpu.get("samples", [])
        deltas = data.get("timeDeltas", [])
        # Some chunks do not have deltas; ignore
        if not chunk_samples:
            continue
        # The first sample timestamp in a chunk corresponds to e["ts"] roughly.
        # Use cumulative deltas relative to chunk event ts.
        ts = e.get("ts", profile_start_ts or start_ts)
        for i, sid in enumerate(chunk_samples):
            samples.append((ts, sid))
            if i < len(deltas):
                ts += deltas[i]

    print(f"Total samples: {len(samples)}", file=sys.stderr)

    def stack_of(node_id):
        s = []
        seen = set()
        while node_id and node_id not in seen:
            seen.add(node_id)
            n = nodes.get(node_id)
            if not n:
                break
            cf = n.get("callFrame", {})
            fn = cf.get("functionName", "?")
            url = cf.get("url", "")
            # simplify url
            if url:
                fn = f"{fn} ({url.split('/')[-1].split('?')[0]})"
            s.append(fn)
            node_id = n.get("parent")
        return list(reversed(s))

    self_time = defaultdict(float)
    total_time = defaultdict(float)
    total_in_interval = 0.0
    sample_interval_us = 1000.0  # 1 ms samples for hi-res CPU profiler? Actually hires uses 100us? Use delta.
    # Better: use timeDeltas already. We'll count each sample as its delta to next sample; for last sample use average.
    # Compute durations from deltas list globally is hard because samples list interleaves chunks.
    # We'll approximate each sample duration as the delta associated with it (time until next sample).

    # Build sample durations based on deltas per chunk.
    sample_durations = []
    for e in events:
        if e.get("name") != "ProfileChunk":
            continue
        data = e.get("args", {}).get("data", {})
        cpu = data.get("cpuProfile", {})
        chunk_samples = cpu.get("samples", [])
        deltas = data.get("timeDeltas", [])
        for i, _ in enumerate(chunk_samples):
            d = deltas[i] if i < len(deltas) else None
            sample_durations.append(d)

    if len(sample_durations) != len(samples):
        # fallback equal durations
        sample_durations = [1000.0] * len(samples)

    for idx, (ts, sid) in enumerate(samples):
        if ts < start_ts or ts > end_ts:
            continue
        dur = sample_durations[idx]
        if dur is None or dur <= 0:
            dur = 1000.0
        total_in_interval += dur
        stack = stack_of(sid)
        if stack:
            self_time[stack[-1]] += dur
            for fn in set(stack):
                total_time[fn] += dur

    print(f"Total sample time in interval: {total_in_interval / 1e3:.1f} ms")
    print("\nTop self time functions:")
    for fn, t in sorted(self_time.items(), key=lambda kv: kv[1], reverse=True)[:40]:
        pct = t / total_in_interval * 100 if total_in_interval else 0
        print(f"{t/1e3:8.1f} ms ({pct:5.1f}%)  {fn}")

    print("\nTop total time functions:")
    for fn, t in sorted(total_time.items(), key=lambda kv: kv[1], reverse=True)[:40]:
        pct = t / total_in_interval * 100 if total_in_interval else 0
        print(f"{t/1e3:8.1f} ms ({pct:5.1f}%)  {fn}")

if __name__ == "__main__":
    main()
