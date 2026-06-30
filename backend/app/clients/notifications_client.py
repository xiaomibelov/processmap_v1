from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

DEFAULT_NOTIFICATIONS_URL = "http://notifications:8000"


def _service_url() -> str:
    return os.environ.get("NOTIFICATIONS_SERVICE_URL", DEFAULT_NOTIFICATIONS_URL).rstrip("/")


def _headers(request) -> Dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth:
        headers["Authorization"] = auth
    active_org = request.headers.get("X-Active-Org-Id") or request.headers.get("x-active-org-id")
    if active_org:
        headers["X-Active-Org-Id"] = active_org
    client_request_id = request.headers.get("X-Client-Request-Id") or request.headers.get("x-client-request-id")
    if client_request_id:
        headers["X-Client-Request-Id"] = client_request_id
    return headers


class NotificationsUnavailable(Exception):
    pass


def post_error_event(payload: Dict[str, Any], request) -> Dict[str, Any]:
    try:
        response = requests.post(
            f"{_service_url()}/error_events",
            json=payload,
            headers=_headers(request),
            timeout=5,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        logger.warning("notifications service unavailable: %s", exc)
        raise NotificationsUnavailable(str(exc)) from exc


def list_error_events(params: Dict[str, Any], request) -> Dict[str, Any]:
    try:
        response = requests.get(
            f"{_service_url()}/error_events",
            params=params,
            headers=_headers(request),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        logger.warning("notifications service unavailable: %s", exc)
        raise NotificationsUnavailable(str(exc)) from exc


def get_error_event(event_id: str, request) -> Optional[Dict[str, Any]]:
    try:
        response = requests.get(
            f"{_service_url()}/error_events/{event_id}",
            headers=_headers(request),
            timeout=10,
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        logger.warning("notifications service unavailable: %s", exc)
        raise NotificationsUnavailable(str(exc)) from exc


def patch_error_event(event_id: str, patch: Dict[str, Any], request) -> Optional[Dict[str, Any]]:
    try:
        response = requests.patch(
            f"{_service_url()}/error_events/{event_id}",
            json=patch,
            headers=_headers(request),
            timeout=10,
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        logger.warning("notifications service unavailable: %s", exc)
        raise NotificationsUnavailable(str(exc)) from exc


def delete_error_event(event_id: str, request) -> bool:
    try:
        response = requests.delete(
            f"{_service_url()}/error_events/{event_id}",
            headers=_headers(request),
            timeout=10,
        )
        if response.status_code == 404:
            return False
        response.raise_for_status()
        return True
    except requests.RequestException as exc:
        logger.warning("notifications service unavailable: %s", exc)
        raise NotificationsUnavailable(str(exc)) from exc
