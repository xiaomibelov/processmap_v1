import React from "react";
import { Outlet } from "react-router-dom";
import { RoleProvider } from "../../contexts/RoleContext";
import TechnologistNavigation from "./TechnologistNavigation";

export function TechnologistLayout() {
  return (
    <RoleProvider>
      <div className="technologist-layout">
        <header className="technologist-header">
          <h1>ProcessMap Technologist</h1>
        </header>
        <TechnologistNavigation />
        <main className="technologist-main">
          <Outlet />
        </main>
      </div>
    </RoleProvider>
  );
}

export default TechnologistLayout;
