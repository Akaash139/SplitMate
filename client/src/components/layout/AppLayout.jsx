import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileBottomNav } from "./MobileBottomNav";
import "./AppLayout.css";

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="splitmate-app-shell">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="splitmate-main-viewport">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="splitmate-content-area">
          <Outlet />
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
