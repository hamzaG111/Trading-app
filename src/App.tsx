import { NavLink, Route, Routes } from "react-router-dom";
import {
  BookOpen,
  Calculator,
  FlaskConical,
  LayoutDashboard,
  LineChart,
  Settings as SettingsIcon,
  ShieldCheck,
} from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Strategies from "./pages/Strategies";
import Lab from "./pages/Lab";
import PropFirm from "./pages/PropFirm";
import Reality from "./pages/Reality";
import Learn from "./pages/Learn";
import Settings from "./pages/Settings";

const NAV = [
  { to: "/", label: "لوحة القيادة", en: "Dashboard", icon: LayoutDashboard },
  { to: "/strategies", label: "الاستراتيجيات", en: "Strategies", icon: LineChart },
  { to: "/lab", label: "مختبر الاختبار", en: "Backtest", icon: FlaskConical },
  { to: "/prop", label: "شركات التمويل", en: "Prop Firms", icon: ShieldCheck },
  { to: "/reality", label: "حاسبة الواقع", en: "Reality", icon: Calculator },
  { to: "/learn", label: "المعرفة", en: "Knowledge", icon: BookOpen },
  { to: "/settings", label: "الإعدادات", en: "Settings", icon: SettingsIcon },
];

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-name">AURUM</div>
            <div className="brand-sub">QUANT SYSTEM</div>
          </div>
        </div>
        <div className="nav-section">القائمة</div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <n.icon size={18} />
            <span>{n.label}</span>
          </NavLink>
        ))}
        <div style={{ flex: 1 }} />
        <div className="brand-sub" style={{ padding: "0 14px", lineHeight: 1.7 }}>
          أداة بحث وإدارة مخاطر شخصية.
          <br />
          ليست نصيحة مالية.
        </div>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/strategies" element={<Strategies />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/prop" element={<PropFirm />} />
          <Route path="/reality" element={<Reality />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <nav className="mobile-nav">
        {NAV.slice(0, 6).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"}
            className={({ isActive }) => (isActive ? "active" : "")}>
            <n.icon size={20} />
            <span>{n.en}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
