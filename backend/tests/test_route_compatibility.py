import unittest


class RouteCompatibilityTest(unittest.TestCase):
    def test_explicit_legacy_route_export_exposes_invite_paths(self):
        from app.legacy.routes_export import list_exported_legacy_routes

        paths = {str(route.path or "") for route in list_exported_legacy_routes()}
        self.assertIn("/api/orgs/{org_id}/invites", paths)
        self.assertIn("/api/admin/organizations/{org_id}/invites", paths)
        self.assertIn("/api/orgs/{org_id}/invites/{invite_id}/revoke", paths)
        self.assertIn("/api/invites/accept", paths)

    def test_legacy_route_registry_exposes_invite_paths(self):
        from app.legacy.route_registry import list_legacy_routes

        paths = {str(route.path or "") for route in list_legacy_routes()}
        self.assertIn("/api/orgs/{org_id}/invites", paths)
        self.assertIn("/api/admin/organizations/{org_id}/invites", paths)
        self.assertIn("/api/orgs/{org_id}/invites/{invite_id}/revoke", paths)
        self.assertIn("/api/invites/accept", paths)

    def test_route_registry_matches_explicit_export_boundary(self):
        from app.legacy.route_registry import list_legacy_routes
        from app.legacy.routes_export import list_exported_legacy_routes

        export_keys = {
            (tuple(sorted(method for method in (getattr(route, "methods", None) or []) if method not in {"HEAD", "OPTIONS"})), str(route.path or ""))
            for route in list_exported_legacy_routes()
        }
        registry_keys = {
            (tuple(sorted(method for method in (getattr(route, "methods", None) or []) if method not in {"HEAD", "OPTIONS"})), str(route.path or ""))
            for route in list_legacy_routes()
        }
        self.assertEqual(registry_keys, export_keys)

    def test_runtime_app_registers_invite_routes_once(self):
        from app.main import app

        route_keys = []
        for route in app.router.routes:
            path = str(getattr(route, "path", "") or "")
            methods = sorted(
                method
                for method in (getattr(route, "methods", None) or [])
                if method not in {"HEAD", "OPTIONS"}
            )
            for method in methods:
                route_keys.append((method, path))

        self.assertEqual(route_keys.count(("GET", "/api/orgs/{org_id}/invites")), 1)
        self.assertEqual(route_keys.count(("POST", "/api/orgs/{org_id}/invites")), 1)
        self.assertEqual(route_keys.count(("GET", "/api/admin/organizations/{org_id}/invites")), 1)
        self.assertEqual(route_keys.count(("POST", "/api/admin/organizations/{org_id}/invites")), 1)
        self.assertEqual(route_keys.count(("POST", "/api/orgs/{org_id}/invites/{invite_id}/revoke")), 1)
        self.assertEqual(route_keys.count(("POST", "/api/invites/accept")), 1)

    def test_runtime_app_registers_org_listing_route_once_from_modular_router(self):
        from app.main import app

        route_keys = []
        owners = []
        for route in app.router.routes:
            path = str(getattr(route, "path", "") or "")
            endpoint = getattr(route, "endpoint", None)
            owner = str(getattr(endpoint, "__module__", "") or "")
            methods = sorted(
                method
                for method in (getattr(route, "methods", None) or [])
                if method not in {"HEAD", "OPTIONS"}
            )
            for method in methods:
                route_keys.append((method, path))
                owners.append((method, path, owner))

        self.assertEqual(route_keys.count(("GET", "/api/orgs")), 1)
        self.assertIn(("GET", "/api/orgs", "app.routers.org_listing"), owners)
        self.assertNotIn(("GET", "/api/orgs", "app._legacy_main"), owners)

    def test_runtime_app_registers_org_members_route_once_from_modular_router(self):
        from app.main import app

        route_keys = []
        owners = []
        for route in app.router.routes:
            path = str(getattr(route, "path", "") or "")
            endpoint = getattr(route, "endpoint", None)
            owner = str(getattr(endpoint, "__module__", "") or "")
            methods = sorted(
                method
                for method in (getattr(route, "methods", None) or [])
                if method not in {"HEAD", "OPTIONS"}
            )
            for method in methods:
                route_keys.append((method, path))
                owners.append((method, path, owner))

        self.assertEqual(route_keys.count(("GET", "/api/orgs/{org_id}/members")), 1)
        self.assertIn(("GET", "/api/orgs/{org_id}/members", "app.routers.org_members"), owners)
        self.assertNotIn(("GET", "/api/orgs/{org_id}/members", "app._legacy_main"), owners)
        self.assertEqual(route_keys.count(("GET", "/api/orgs/{org_id}/assignable-users")), 1)
        self.assertIn(("GET", "/api/orgs/{org_id}/assignable-users", "app.routers.org_members"), owners)
        self.assertNotIn(("GET", "/api/orgs/{org_id}/assignable-users", "app._legacy_main"), owners)


if __name__ == "__main__":
    unittest.main()
