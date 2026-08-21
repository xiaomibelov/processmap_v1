#!/usr/bin/env python3
"""Standalone alert checker. Logs to stdout; exits non-zero on alert."""
import sys,urllib.request
from collections import defaultdict

THR={"hit_rate":0.70,"queue_length":50,"memory_ratio":0.85}

def fetch(url="http://localhost:8000/metrics"):
    try:return urllib.request.urlopen(url,timeout=2).read().decode()
    except Exception:return ""

def parse(text):
    vals=defaultdict(float)
    for line in text.splitlines():
        if line.startswith("#")or not line.strip():continue
        p=line.split()
        if len(p)<2:continue
        try:vals[p[0]]=float(p[-1])
        except ValueError:pass
    return vals

def check(vals):
    alerts=[]
    total=sum(v for k,v in vals.items() if k.startswith("overlay_cache_hit_total{"))
    hits=vals.get('overlay_cache_hit_total{status="200"}',0)
    if total and hits/total<THR["hit_rate"]:alerts.append("OverlayCacheHitRateLow")
    if vals.get('celery_queue_length{name="celery.render_overlay"}',0)>THR["queue_length"]:alerts.append("CeleryQueueBacklog")
    if vals.get("redis_memory_used_bytes",0)/536870912>THR["memory_ratio"]:alerts.append("RedisMemoryPressure")
    if vals.get('circuit_breaker_state{breaker="postgres"}',0)==2:alerts.append("CircuitBreakerOpen")
    return alerts

if __name__=="__main__":
    alerts=check(parse(fetch()))
    for a in alerts:print(f"ALERT {a} firing")
    sys.exit(1 if alerts else 0)
