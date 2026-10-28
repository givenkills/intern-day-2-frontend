import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext";
import { ScreenLoader } from "../components/ScreenLoader";

/**
 * 页面守卫：未登录访问功能页时跳回登录页，并记住原本想去的地址。
 * 注意这只是体验优化，真正的鉴权在后端——直接调接口同样会被拒绝。
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <ScreenLoader />;
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
