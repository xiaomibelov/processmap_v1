import React from "react";
import { NavLink } from "react-router-dom";
import { useRole } from "../../contexts/RoleContext";

const navigationItems = [
  { path: "/catalog", label: "Catalog", roles: ["analyst", "technologist", "admin"] },
  { path: "/constructor", label: "Constructor", roles: ["analyst", "technologist", "admin"] },
  { path: "/recipe", label: "Recipe", roles: ["analyst", "technologist", "admin"] },
  { path: "/operation-catalog", label: "Operation Catalog", roles: ["analyst", "admin"] },
  { path: "/import-bpmn", label: "Import BPMN", roles: ["analyst", "admin"] },
  { path: "/xml-editor", label: "XML Editor", roles: ["analyst", "admin"] },
  { path: "/dictionaries", label: "Dictionaries", roles: ["analyst", "admin"] },
  { path: "/publish", label: "Publish", roles: ["analyst", "technologist", "admin"] },
  { path: "/pilot", label: "Pilot", roles: ["analyst", "technologist", "admin"] },
];

export function TechnologistNavigation() {
  const { role } = useRole();

  const visibleItems = navigationItems.filter((item) =>
    item.roles.includes(role)
  );

  return (
    <nav className="technologist-navigation">
      {visibleItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            isActive ? "nav-item active" : "nav-item"
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default TechnologistNavigation;
