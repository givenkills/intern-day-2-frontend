import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { useAndroidBackButton, useKeyboardInset } from "./native/nativeShell";
import { ActivityPage } from "./pages/ActivityPage";
import { AssistantPage } from "./pages/AssistantPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";

export default function App() {
  // 两者在浏览器里都是空操作，只在 Capacitor 容器内接管返回键与键盘留白
  useAndroidBackButton();
  useKeyboardInset();

  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/activity"
          element={
            <ProtectedRoute>
              <ActivityPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assistant"
          element={
            <ProtectedRoute>
              <AssistantPage />
            </ProtectedRoute>
          }
        />
        {/* 未匹配到的地址一律交给守卫决定去登录页还是功能页 */}
        <Route path="*" element={<Navigate to="/activity" replace />} />
      </Routes>
    </AuthProvider>
  );
}
