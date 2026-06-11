from prometheus_client import Counter,Histogram,Gauge,generate_latest,REGISTRY
import threading,time

_cache_hit=Counter("overlay_cache_hit_total","",["status"],registry=REGISTRY)
_cache_lat=Histogram("overlay_cache_latency_seconds","",["hit"],buckets=[.005,.015,.05,.15,.3,1.],registry=REGISTRY)
_render_dur=Histogram("overlay_render_duration_seconds","",["source"],buckets=[.05,.15,.3,1.,3.],registry=REGISTRY)
_celery_q=Gauge("celery_queue_length","",["name"],registry=REGISTRY)
_celery_fail=Counter("celery_task_failures_total","",["task"],registry=REGISTRY)
_redis_mem=Gauge("redis_memory_used_bytes","",registry=REGISTRY)
_redis_evict=Gauge("redis_evicted_keys_total","",registry=REGISTRY)
_breaker=Gauge("circuit_breaker_state","",["breaker"],registry=REGISTRY)

def observe_hit(status:int,latency:float):
    _cache_hit.labels(status=str(status)).inc();_cache_lat.labels(hit=str(status==200)).observe(latency)
def observe_render(source:str,duration:float):_render_dur.labels(source=source).observe(duration)
def set_queue(name:str,length:int):_celery_q.labels(name=name).set(length)
def inc_task_failure(task:str):_celery_fail.labels(task=task).inc()
def set_breaker(name:str,state:int):_breaker.labels(breaker=name).set(state)
def metrics()->bytes:return generate_latest(REGISTRY)

def _poll(rc):
    while True:
        try:_redis_mem.set(rc.info("memory")["used_memory"]);_redis_evict.set(rc.info("stats").get("evicted_keys",0))
        except Exception:pass
        time.sleep(15)
def start_polling(rc):threading.Thread(target=_poll,args=(rc,),daemon=True).start()
