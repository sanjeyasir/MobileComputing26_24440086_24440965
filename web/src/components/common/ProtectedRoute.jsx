import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Spin } from "antd";

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f8fafc" }}>
        <Spin size="large" tip="Verifying WSN Security Credentials..." />
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && !currentUser.isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
