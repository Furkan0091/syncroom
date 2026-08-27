import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./stores/auth";
import { useNotificationsStore } from "./stores/notifications";
import { ServerEvents, connectSocket } from "./lib/socket";
import type { Notification } from "./types";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { WorkspacePage } from "./pages/WorkspacePage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-blue-600" />
      </div>
    );
  }
  if (status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const init = useAuthStore((s) => s.init);
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    init();
  }, [init]);

  // Once authenticated, keep the socket connected app-wide so notifications
  // arrive in real time on every page (workspace pages add their own handlers).
  useEffect(() => {
    if (status !== "authenticated") return;
    const socket = connectSocket();
    const onNotification = (payload: { notification: Notification }) =>
      useNotificationsStore.getState().add(payload.notification);
    socket.on(ServerEvents.NOTIFICATION_NEW, onNotification);
    return () => {
      socket.off(ServerEvents.NOTIFICATION_NEW, onNotification);
    };
  }, [status]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/w/:workspaceId"
          element={
            <RequireAuth>
              <WorkspacePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
