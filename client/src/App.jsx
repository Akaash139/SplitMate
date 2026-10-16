import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { PublicRoute } from "./components/layout/PublicRoute";
import { AppLayout } from "./components/layout/AppLayout";
import { Login } from "./pages/auth/Login";
import { Register } from "./pages/auth/Register";
import { Dashboard } from "./pages/dashboard/Dashboard";
import { Groups } from "./pages/groups/Groups";
import { GroupDetails } from "./pages/groups/GroupDetails";
import { JoinGroup } from "./pages/groups/JoinGroup";
import { Settlements } from "./pages/settlements/Settlements";
import { AllExpenses } from "./pages/expenses/AllExpenses";
import { Friends } from "./pages/friends/Friends";
import { PlaceholderPage } from "./pages/placeholder/PlaceholderPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Auth Routes (Redirects to /dashboard if already logged in) */}
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          {/* Public / Authenticated Invitation Route */}
          <Route path="/join/:inviteCode" element={<JoinGroup />} />

          {/* Protected Application Routes (Redirects to /login if unauthenticated) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/groups/:groupId" element={<GroupDetails />} />
              <Route path="/friends" element={<Friends />} />
              <Route path="/expenses" element={<AllExpenses />} />
              <Route path="/activity" element={<Navigate to="/expenses" replace />} />
              <Route path="/settlements" element={<Settlements />} />
              <Route
                path="/analytics"
                element={
                  <PlaceholderPage
                    title="Spending & Velocity Analytics"
                    description="Category breakdowns, monthly spending graphs, and peer payment speeds."
                    milestone="TASK 5"
                  />
                }
              />
              <Route
                path="/settings"
                element={
                  <PlaceholderPage
                    title="Account Settings"
                    description="Manage personal profile, currency preferences, and notifications."
                    milestone="TASK 5"
                  />
                }
              />
            </Route>
          </Route>

          {/* Root and Unknown Path Fallbacks */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
