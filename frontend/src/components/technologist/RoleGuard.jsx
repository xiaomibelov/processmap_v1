import React from "react";
import { useRole } from "../../contexts/RoleContext";

export function RoleGuard({ allowedRoles, children, fallback = null }) {
  const { role, loading } = useRole();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!allowedRoles.includes(role)) {
    return fallback;
  }

  return children;
}

export default RoleGuard;
