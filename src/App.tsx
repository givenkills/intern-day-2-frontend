import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AssistantPage } from "./pages/AssistantPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TodosPage } from "./pages/TodosPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/todos"
          element={
            <ProtectedRoute>
              <TodosPage />
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
        <Route path="*" element={<Navigate to="/todos" replace />} />
      </Routes>
    </AuthProvider>
  );
}
