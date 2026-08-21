import React, { createContext, useContext, useState, useEffect } from "react";
import { apiRequest } from "../lib/apiCore";

const RoleContext = createContext({
  role: "analyst",
  isTechnologist: false,
  isAnalyst: true,
  isAdmin: false,
});

export function RoleProvider({ children }) {
  const [role, setRole] = useState("analyst");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch user role from API
    apiRequest("/api/auth/me")
      .then((r) => (r && r.ok ? r.data : null))
      .then((data) => {
        setRole((data && data.role) || "analyst");
        setLoading(false);
      })
      .catch(() => {
        setRole("analyst");
        setLoading(false);
      });
  }, []);

  const value = {
    role,
    isTechnologist: role === "technologist",
    isAnalyst: role === "analyst",
    isAdmin: role === "admin",
    loading,
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}

export default RoleContext;
