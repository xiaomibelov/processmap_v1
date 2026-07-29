from __future__ import annotations

import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        response = await call_next(request)
        
        duration_ms = (time.time() - start_time) * 1000
        
        # Log requests to process-templates and recipes endpoints
        if request.url.path.startswith("/api/process-templates") or            request.url.path.startswith("/api/recipes"):
            user = getattr(request.state, "user", None)
            user_id = getattr(user, "id", None) if user else None
            user_role = getattr(user, "role", None) if user else None
            
            logger.info(
                "api_request",
                extra={
                    "user_id": user_id,
                    "role": user_role,
                    "endpoint": request.url.path,
                    "method": request.method,
                    "duration_ms": round(duration_ms, 2),
                    "status_code": response.status_code
                }
            )
        
        return response
