from __future__ import annotations

from typing import List
from fastapi import HTTPException, Request


def require_role(allowed_roles: List[str]):
    def role_checker(request: Request):
        user = getattr(request.state, "auth_user", None)
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        user_role = user.get("role", "analyst")
        
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "insufficient_permissions",
                    "required": allowed_roles,
                    "actual": user_role
                }
            )
        return user
    return role_checker
