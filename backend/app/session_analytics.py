"""Server-side session analytics for the admin panel.

All aggregation/filtering/sorting/pagination/binning/percentages are computed
here (SQL + Python on the backend). The frontend renders the JSON as-is.
Timestamps are INTEGER epoch seconds, so binning is pure integer arithmetic
and works identically on SQLite and PostgreSQL.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

from .storage import _connect, _ensure_schema

CACHE_TTL_SECONDS = 600  # 10 minutes

_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}


def clear_analytics_cache() -> None:
    _CACHE.clear()


def _cache_get(key: str) -> Optional[Dict[str, Any]]:
    entry = _CACHE.get(key)
    if not entry:
        return None
    ts, payload = entry
    if (time.time() - ts) > CACHE_TTL_SECONDS:
        _CACHE.pop(key, None)
        return None
    return payload


def _cache_put(key: str, payload: Dict[str, Any]) -> None:
    _CACHE[key] = (time.time(), payload)


def _pct(part: int, total: int) -> float:
    if not total:
        return 0.0
    return round(int(part) * 100.0 / int(total), 1)


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


# Lifetime bins in seconds: (label, min_exclusive_lower_as_bound, upper, color).
# Boundaries are inclusive lower / inclusive upper except the open tails.
_LIFETIME_BINS: List[Dict[str, Any]] = [
    {"bin": "0мин", "color_label": "abandoned"},
    {"bin": "1-60мин", "color_label": "neutral"},
    {"bin": "1-24ч", "color_label": "neutral"},
    {"bin": "1-7д", "color_label": "neutral"},
    {"bin": "7-30д", "color_label": "real_work"},
    {"bin": "30+д", "color_label": "real_work"},
]

_VERSION_BINS: List[Dict[str, Any]] = [
    {"bin": "1", "color_label": "neutral"},
    {"bin": "2-5", "color_label": "neutral"},
    {"bin": "6-10", "color_label": "neutral"},
    {"bin": "10-50", "color_label": "real_work"},
    {"bin": "50+", "color_label": "real_work"},
]

# "Active" session: lifetime strictly greater than 7 days.
_ACTIVE_LIFETIME_SECONDS = 7 * 24 * 60 * 60


def _plural_ru(n: int, one: str, few: str, many: str) -> str:
    n = abs(int(n))
    mod100 = n % 100
    mod10 = n % 10
    if 11 <= mod100 <= 14:
        return many
    if mod10 == 1:
        return one
    if 2 <= mod10 <= 4:
        return few
    return many


def relative_time_ru(now_ts: int, ts: int) -> str:
    """Server-computed Russian relative timestamp, e.g. "2 дня назад"."""
    diff = max(0, int(now_ts) - int(ts))
    if diff < 60:
        return "только что"
    minutes = diff // 60
    if minutes < 60:
        return f"{minutes} {_plural_ru(minutes, 'минуту', 'минуты', 'минут')} назад"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} {_plural_ru(hours, 'час', 'часа', 'часов')} назад"
    days = hours // 24
    if days < 30:
        return f"{days} {_plural_ru(days, 'день', 'дня', 'дней')} назад"
    months = days // 30
    if months < 12:
        return f"{months} {_plural_ru(months, 'месяц', 'месяца', 'месяцев')} назад"
    years = months // 12
    return f"{years} {_plural_ru(years, 'год', 'года', 'лет')} назад"


def session_status(lifetime_seconds: int) -> str:
    dur = int(lifetime_seconds)
    if dur == 0:
        return "abandoned"
    if dur > _ACTIVE_LIFETIME_SECONDS:
        return "real_work"
    return "short"


_TOP_SORT_COLUMNS = {
    "version_count": "version_count",
    "lifetime": "lifetime_seconds",
    "last_updated": "s.updated_at",
    "author": "u.email",
}


def get_session_analytics_top(
    *,
    org_id: str,
    sort_by: str = "version_count",
    sort_order: str = "desc",
    filter_author: str = "",
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    org = str(org_id or "").strip() or "org_default"
    sort_column = _TOP_SORT_COLUMNS.get(str(sort_by or "").strip().lower(), "version_count")
    direction = "ASC" if str(sort_order or "").strip().lower() == "asc" else "DESC"
    author_filter = str(filter_author or "").strip().lower()
    page = max(1, _int(page) or 1)
    page_size = max(1, min(_int(page_size) or 20, 100))
    offset = (page - 1) * page_size

    where = "s.org_id = ? AND s.deleted_at = 0"
    params: List[Any] = [org, org]
    if author_filter:
        where += " AND LOWER(COALESCE(u.email, '')) LIKE ?"
        params.append(f"%{author_filter}%")

    base_from = """
        FROM sessions s
        LEFT JOIN users u ON u.id = s.created_by
        LEFT JOIN (
          SELECT session_id, COUNT(*) AS cnt
            FROM bpmn_versions
           WHERE org_id = ?
           GROUP BY session_id
        ) v ON v.session_id = s.id
    """

    _ensure_schema()
    with _connect() as con:
        total_row = con.execute(
            f"SELECT COUNT(*) {base_from} WHERE {where}",
            params,
        ).fetchone()
        total = _int(total_row[0] if total_row else 0)
        rows = con.execute(
            f"""
            SELECT
              s.id,
              s.title,
              s.created_at,
              s.updated_at,
              COALESCE(u.email, '') AS author_email,
              COALESCE(v.cnt, 0) AS version_count,
              (s.updated_at - s.created_at) AS lifetime_seconds
            {base_from}
            WHERE {where}
            ORDER BY {sort_column} {direction}, s.id ASC
            LIMIT ? OFFSET ?
            """,
            [*params, page_size, offset],
        ).fetchall()

    now_ts = int(time.time())
    items = []
    for row in rows or []:
        updated_at = _int(row[3])
        lifetime = _int(row[6])
        items.append(
            {
                "id": str(row[0] or ""),
                "title": str(row[1] or ""),
                "author_email": str(row[4] or ""),
                "version_count": _int(row[5]),
                "lifetime_seconds": int(lifetime),
                "last_updated": int(updated_at),
                "last_updated_relative": relative_time_ru(now_ts, updated_at),
                "status": session_status(lifetime),
            }
        )
    return {
        "total": int(total),
        "page": int(page),
        "page_size": int(page_size),
        "items": items,
    }


def _fetch_lifetime_row(con: Any, org_id: str) -> Dict[str, int]:
    row = con.execute(
        """
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN dur = 0 THEN 1 ELSE 0 END) AS b0,
          SUM(CASE WHEN dur BETWEEN 1 AND 3600 THEN 1 ELSE 0 END) AS b1,
          SUM(CASE WHEN dur BETWEEN 3601 AND 86400 THEN 1 ELSE 0 END) AS b2,
          SUM(CASE WHEN dur BETWEEN 86401 AND 604800 THEN 1 ELSE 0 END) AS b3,
          SUM(CASE WHEN dur BETWEEN 604801 AND 2592000 THEN 1 ELSE 0 END) AS b4,
          SUM(CASE WHEN dur > 2592000 THEN 1 ELSE 0 END) AS b5,
          SUM(CASE WHEN dur < 0 THEN 1 ELSE 0 END) AS neg,
          SUM(CASE WHEN bpmn_xml = '' THEN 1 ELSE 0 END) AS empty_xml,
          SUM(CASE WHEN dur > ? THEN 1 ELSE 0 END) AS active
        FROM (
          SELECT (updated_at - created_at) AS dur, bpmn_xml
            FROM sessions
           WHERE org_id = ? AND deleted_at = 0
        ) t
        """,
        [_ACTIVE_LIFETIME_SECONDS, org_id],
    ).fetchone()
    keys = ["total", "b0", "b1", "b2", "b3", "b4", "b5", "neg", "empty_xml", "active"]
    if not row:
        return {key: 0 for key in keys}
    return {key: _int(row[idx]) for idx, key in enumerate(keys)}


def _fetch_version_counts(con: Any, org_id: str) -> Tuple[int, List[Tuple[int, int]]]:
    total_row = con.execute(
        "SELECT COUNT(*) FROM bpmn_versions WHERE org_id = ?",
        [org_id],
    ).fetchone()
    total_versions = _int(total_row[0] if total_row else 0)
    rows = con.execute(
        """
        SELECT cnt, COUNT(*) AS sessions
          FROM (
            SELECT COUNT(*) AS cnt
              FROM bpmn_versions
             WHERE org_id = ?
             GROUP BY session_id
          )
         GROUP BY cnt
        """,
        [org_id],
    ).fetchall()
    pairs = [(_int(row[0]), _int(row[1])) for row in rows or []]
    return total_versions, pairs


def _fetch_orphan_created_by(con: Any, org_id: str) -> int:
    row = con.execute(
        """
        SELECT COUNT(*)
          FROM sessions s
         WHERE s.org_id = ?
           AND s.deleted_at = 0
           AND s.created_by <> ''
           AND s.created_by NOT IN (SELECT id FROM users)
        """,
        [org_id],
    ).fetchone()
    return _int(row[0] if row else 0)


def _fetch_total_users(con: Any) -> int:
    row = con.execute("SELECT COUNT(*) FROM users", []).fetchone()
    return _int(row[0] if row else 0)


def _version_bin_index(cnt: int) -> int:
    if cnt <= 1:
        return 0
    if cnt <= 5:
        return 1
    if cnt <= 10:
        return 2
    if cnt <= 50:
        return 3
    return 4


def _build_summary(*, org_id: str) -> Dict[str, Any]:
    _ensure_schema()
    with _connect() as con:
        life = _fetch_lifetime_row(con, org_id)
        total_versions, version_pairs = _fetch_version_counts(con, org_id)
        orphan_created_by = _fetch_orphan_created_by(con, org_id)
        total_users = _fetch_total_users(con)

    total_sessions = life["total"]
    sessions_with_history = sum(sessions for _cnt, sessions in version_pairs)
    versions_sum = sum(cnt * sessions for cnt, sessions in version_pairs)
    avg_versions = round(versions_sum / sessions_with_history, 1) if sessions_with_history else 0.0

    lifetime_counts = [life["b0"], life["b1"], life["b2"], life["b3"], life["b4"], life["b5"]]
    lifetime_distribution = [
        {
            "bin": spec["bin"],
            "count": int(lifetime_counts[idx]),
            "percentage": _pct(lifetime_counts[idx], total_sessions),
            "color_label": spec["color_label"],
        }
        for idx, spec in enumerate(_LIFETIME_BINS)
    ]

    version_bin_counts = [0, 0, 0, 0, 0]
    for cnt, sessions in version_pairs:
        version_bin_counts[_version_bin_index(cnt)] += sessions
    version_distribution = [
        {
            "bin": spec["bin"],
            "count": int(version_bin_counts[idx]),
            "percentage": _pct(version_bin_counts[idx], sessions_with_history),
            "color_label": spec["color_label"],
        }
        for idx, spec in enumerate(_VERSION_BINS)
    ]

    no_versions = max(0, total_sessions - sessions_with_history)

    return {
        "org_id": org_id,
        "generated_at": int(time.time()),
        "cache_ttl_seconds": CACHE_TTL_SECONDS,
        "summary": {
            "total_sessions": int(total_sessions),
            "total_versions": int(total_versions),
            "total_users": int(total_users),
            "active_sessions": int(life["active"]),
            "active_sessions_pct": _pct(life["active"], total_sessions),
            "abandoned_sessions": int(life["b0"]),
            "abandoned_sessions_pct": _pct(life["b0"], total_sessions),
            "avg_versions_per_session": avg_versions,
            "sessions_with_history": int(sessions_with_history),
            "sessions_with_history_pct": _pct(sessions_with_history, total_sessions),
        },
        "lifetime_distribution": lifetime_distribution,
        "version_distribution": version_distribution,
        "data_quality": {
            "empty_xml": int(life["empty_xml"]),
            "orphan_created_by": int(orphan_created_by),
            "created_gt_updated": int(life["neg"]),
            "no_versions": int(no_versions),
            "no_versions_pct": _pct(no_versions, total_sessions),
        },
    }


def get_session_analytics_summary(*, org_id: str, refresh: bool = False) -> Dict[str, Any]:
    org = str(org_id or "").strip() or "org_default"
    cache_key = f"summary:{org}"
    if not refresh:
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached
    payload = _build_summary(org_id=org)
    _cache_put(cache_key, payload)
    return payload
