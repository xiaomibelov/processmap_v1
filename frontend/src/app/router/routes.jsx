import { adminRoutes, resolveAdminRoute } from "./adminRoutes";

export const appRoutes = {
  workspaceRoot: "/app",
  adminRoot: "/admin",
  admin: adminRoutes,
};

export function resolveRoute(pathname = "/") {
  const path = String(pathname || "/");
  if (path.startsWith("/admin")) {
    return {
      scope: "admin",
      ...resolveAdminRoute(path),
    };
  }
  return {
    scope: "workspace",
    path,
  };
}

