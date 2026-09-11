import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

/** Like ProtectedRoute, but also requires is_admin -- non-admins bounce to the dashboard, not a dead end. */
export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-muted text-sm">Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!user.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};
