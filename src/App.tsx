import { NavLink, Route, Routes } from "react-router-dom";
import {
  Atom,
  BookOpen,
  Bot,
  Calculator,
  Dice5,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  LineChart,
  Radar,
  Settings as SettingsIcon,
  ShieldCheck,
} from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Autopilot from "./pages/Autopilot";
import Strategies from "./pages/Strategies";
import Lab from "./pages/Lab";
import PropFirm from "./pages/PropFirm";
import Optimizer from "./pages/Optimizer";
import MonteCarlo from "./pages/MonteCarlo";
import Regime from "./pages/Regime";
import Research from "./pages/Research";
import Reality from "./pages/Reality";
import Learn from "./pages/Learn";
import Settings from "./pages/Settings";

const SECTIONS = [
  {
    title: "المنصّة",
    items: [
      { to: "/", label: "لوحة القيادة", en: "Home", icon: LayoutDashboard },
      { to: "/autopilot", label: "الطيار الآلي", en: "Autopilot", icon: Bot },
      { to: "/strategies", label: "الاستراتيجيات", en: "Strategies", icon: LineChart },
      { to: "/lab", label: "مختبر الاختبار", en: "Backtest", icon: FlaskConical },
      { to: "/prop", label: "شركات التمويل", en: "Prop", icon: ShieldCheck },
    ],
  },
  {
    title: "بحث كمّي",
    items: [
      { to: "/optimizer", label: "مُحسّن المحافظ", en: "Optimizer", icon: GitBranch },
      { to: "/montecarlo", label: "مونت كارلو", en: "MonteCarlo", icon: Dice5 },
      { to: "/regime", label: "حالة السوق", en: "Regime", icon: Radar },
      { to: "/research", label: "بحث العوامل", en: "Factors", icon: Atom },
    ],
  },
  {
    title: "المعرفة",
    items: [
      { to: "/reality", label: "حاسبة الواقع", en: "Reality", icon: Calculator },
      { to: "/learn", label: "المعرفة", en: "Learn", icon: BookOpen },
      { to: "/settings", label: "الإعدادات", en: "Settings", icon: SettingsIcon },
    ],
  },
];

const MOBILE = [
  { to: "/", en: "Home", icon: LayoutDashboard },
  { to: "/autopilot", en: "Auto", icon: Bot },
  { to: "/lab", en: "Lab", icon: FlaskConical },
  { to: "/optimizer", en: "Optimize", icon: GitBranch },
  { to: "/montecarlo", en: "MonteC", icon: Dice5 },
  { to: "/regime", en: "Regime", icon: Radar },
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
        {SECTIONS.map((sec) => (
          <div key={sec.title}>
            <div className="nav-section">{sec.title}</div>
            {sec.items.map((n) => (
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
          </div>
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
          <Route path="/autopilot" element={<Autopilot />} />
          <Route path="/strategies" element={<Strategies />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/prop" element={<PropFirm />} />
          <Route path="/optimizer" element={<Optimizer />} />
          <Route path="/montecarlo" element={<MonteCarlo />} />
          <Route path="/regime" element={<Regime />} />
          <Route path="/research" element={<Research />} />
          <Route path="/reality" element={<Reality />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <nav className="mobile-nav">
        {MOBILE.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
            <n.icon size={20} />
            <span>{n.en}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
