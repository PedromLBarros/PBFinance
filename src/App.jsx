import React, { useState, useEffect, useMemo, useRef } from "react";
import Papa from "papaparse";
import storage from "./storage";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  LayoutDashboard, List, Upload, Wallet, Settings as SettingsIcon,
  Plus, Trash2, Download, RefreshCcw, AlertTriangle, Check, X,
  ChevronDown, Repeat, TrendingUp, TrendingDown, PiggyBank, Pencil,
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/* Constants & defaults                                                    */
/* ---------------------------------------------------------------------- */

const DEFAULT_CATEGORIES = [
  { name: "Groceries", color: "#4FA687" },
  { name: "Dining", color: "#E0A458" },
  { name: "Transport", color: "#6C93C7" },
  { name: "Utilities", color: "#9B87C4" },
  { name: "Rent/Mortgage", color: "#E2685C" },
  { name: "Health", color: "#5FB0B7" },
  { name: "Shopping", color: "#D68FB8" },
  { name: "Entertainment", color: "#C7A76C" },
  { name: "Subscriptions", color: "#8D9BD8" },
  { name: "Transfers", color: "#8B93A1" },
  { name: "Fees", color: "#B0705F" },
  { name: "Education", color: "#6FA8DC" },
  { name: "Travel", color: "#E0B15C" },
  { name: "Other", color: "#8B93A1" },
  { name: "Uncategorized", color: "#5A616D" },
];

const DEFAULT_ACCOUNTS = [
  { id: "personal", name: "Personal", splitPercent: 100 },
  { id: "shared", name: "Shared (with partner)", splitPercent: 50 },
];

const DEFAULT_DATA = {
  transactions: [], // {id,date,description,amount,category,accountId,recurring,source}
  income: [], // {id,date,description,amount}
  rules: [], // {id,pattern,category}
  categories: DEFAULT_CATEGORIES,
  accounts: DEFAULT_ACCOUNTS,
};

const STORAGE_KEY = "app-data";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const eur = (n) =>
  (n < 0 ? "-" : "") +
  "€" +
  Math.abs(n).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthKey = (dateStr) => (dateStr || "").slice(0, 7);
const monthLabel = (mk) => {
  if (!mk) return "";
  const [y, m] = mk.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
};
const todayISO = () => new Date().toISOString().slice(0, 10);

function normalizeDate(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed)) return parsed.toISOString().slice(0, 10);
  return s;
}

function parseAmount(raw) {
  if (raw === null || raw === undefined) return NaN;
  let s = String(raw).trim().replace(/€/g, "").replace(/\s/g, "");
  // Handle European format 1.234,56 vs US 1,234.56
  if (/,\d{1,2}$/.test(s) && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return n;
}

function applyRules(description, rules) {
  const d = (description || "").toLowerCase();
  for (const r of rules) {
    if (r.pattern && d.includes(r.pattern.toLowerCase())) return r.category;
  }
  return "Uncategorized";
}

function effectiveAmount(tx, accounts) {
  const acc = accounts.find((a) => a.id === tx.accountId) || { splitPercent: 100 };
  return (Number(tx.amount) || 0) * (acc.splitPercent / 100);
}

function txSignature(t) {
  return `${t.date}|${(t.description || "").trim().toLowerCase()}|${Number(t.amount).toFixed(2)}|${t.accountId}`;
}

/* ---------------------------------------------------------------------- */
/* Style                                                                   */
/* ---------------------------------------------------------------------- */

const Style = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

    .budgetapp {
      --bg: #12161A;
      --surface: #1B2027;
      --surface-2: #232A33;
      --border: #2E3540;
      --text: #E7E4DC;
      --text-dim: #8B93A1;
      --teal: #4FA687;
      --amber: #E0A458;
      --coral: #E2685C;
      --blue: #6C93C7;
      --violet: #9B87C4;
      font-family: 'Inter', sans-serif;
      color: var(--text);
      background: var(--bg);
      min-height: 100vh;
      display: flex;
    }
    .budgetapp * { box-sizing: border-box; }
    .budgetapp .mono { font-family: 'IBM Plex Mono', monospace; }
    .budgetapp .display { font-family: 'Space Grotesk', sans-serif; }

    .ba-nav {
      width: 190px;
      flex-shrink: 0;
      background: var(--surface);
      border-right: 1px solid var(--border);
      padding: 20px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ba-brand {
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.02em;
      padding: 0 8px 18px 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 10px;
    }
    .ba-navbtn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 10px;
      border-radius: 7px;
      font-size: 13.5px;
      font-weight: 500;
      color: var(--text-dim);
      cursor: pointer;
      background: transparent;
      border: none;
      text-align: left;
      transition: background 0.15s, color 0.15s;
    }
    .ba-navbtn:hover { background: var(--surface-2); color: var(--text); }
    .ba-navbtn.active { background: var(--surface-2); color: var(--text); box-shadow: inset 2px 0 0 var(--teal); }

    .ba-main { flex: 1; padding: 24px 28px; overflow-y: auto; max-height: 100vh; }
    .ba-h1 { font-family: 'Space Grotesk', sans-serif; font-size: 20px; font-weight: 700; margin: 0 0 4px 0; }
    .ba-sub { color: var(--text-dim); font-size: 13px; margin: 0 0 20px 0; }

    .ba-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px 18px;
    }
    .ba-ledger {
      background-image: repeating-linear-gradient(
        to bottom, transparent, transparent 21px, rgba(255,255,255,0.028) 22px
      );
    }
    .ba-grid { display: grid; gap: 14px; }
    .ba-stat-label { color: var(--text-dim); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
    .ba-stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 24px; font-weight: 600; }

    .ba-btn {
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--teal); color: #0D1411; border: none;
      padding: 8px 14px; border-radius: 7px; font-size: 13px; font-weight: 600;
      cursor: pointer; font-family: 'Inter', sans-serif;
    }
    .ba-btn:hover { filter: brightness(1.08); }
    .ba-btn.secondary { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }
    .ba-btn.danger { background: transparent; color: var(--coral); border: 1px solid var(--coral); }
    .ba-btn.ghost { background: transparent; color: var(--text-dim); border: 1px solid var(--border); }
    .ba-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .ba-input, .ba-select {
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
      padding: 7px 10px; border-radius: 6px; font-size: 13px; font-family: 'Inter', sans-serif;
      outline: none;
    }
    .ba-input:focus, .ba-select:focus { border-color: var(--teal); }
    .ba-label { font-size: 11.5px; color: var(--text-dim); margin-bottom: 4px; display: block; text-transform: uppercase; letter-spacing: 0.05em; }

    table.ba-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.ba-table th {
      text-align: left; color: var(--text-dim); font-weight: 500; font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 10px; border-bottom: 1px solid var(--border);
    }
    table.ba-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    table.ba-table tr:hover td { background: rgba(255,255,255,0.02); }

    .ba-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 20px; font-size: 11.5px; font-weight: 600; }
    .ba-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }

    .ba-progress-track { background: var(--surface-2); border-radius: 5px; height: 7px; overflow: hidden; }
    .ba-progress-fill { height: 100%; border-radius: 5px; }

    .ba-tabs { display: flex; gap: 6px; margin-bottom: 16px; border-bottom: 1px solid var(--border); }
    .ba-tab { padding: 7px 12px; font-size: 12.5px; color: var(--text-dim); cursor: pointer; border-bottom: 2px solid transparent; }
    .ba-tab.active { color: var(--text); border-color: var(--teal); }

    .ba-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 50; }
    .ba-modal { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 20px; width: 380px; max-width: 90vw; }

    .ba-empty { text-align: center; padding: 40px 20px; color: var(--text-dim); font-size: 13px; }
    .split-gauge { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--surface-2); }
  `}</style>
);

/* ---------------------------------------------------------------------- */
/* Small shared components                                                 */
/* ---------------------------------------------------------------------- */

function CategoryPill({ name, categories }) {
  const cat = categories.find((c) => c.name === name) || { color: "#8B93A1" };
  return (
    <span className="ba-pill" style={{ background: cat.color + "22", color: cat.color }}>
      <span className="ba-dot" style={{ background: cat.color }} />
      {name}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="ba-modal-backdrop" onClick={onClose}>
      <div className="ba-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="display" style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <X size={16} style={{ cursor: "pointer", color: "var(--text-dim)" }} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Main App                                                                 */
/* ---------------------------------------------------------------------- */

export default function BudgetApp() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [budgets, setBudgets] = useState({}); // {category: monthlyAmount}
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setData({ ...DEFAULT_DATA, ...parsed.data });
          setBudgets(parsed.budgets || {});
        }
      } catch (e) {
        // no saved data yet
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await storage.set(STORAGE_KEY, JSON.stringify({ data, budgets }));
      } catch (e) {
        console.error("Save failed", e);
      }
    })();
  }, [data, budgets, loaded]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const allMonths = useMemo(() => {
    const set = new Set();
    data.transactions.forEach((t) => set.add(monthKey(t.date)));
    data.income.forEach((t) => set.add(monthKey(t.date)));
    set.add(monthKey(todayISO()));
    return Array.from(set).filter(Boolean).sort();
  }, [data.transactions, data.income]);

  if (!loaded) {
    return (
      <div className="budgetapp" style={{ padding: 40, justifyContent: "center", alignItems: "center" }}>
        <Style />
        <div className="mono" style={{ color: "#8B93A1" }}>Loading your ledger…</div>
      </div>
    );
  }

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "transactions", label: "Transactions", icon: List },
    { id: "import", label: "Import CSV", icon: Upload },
    { id: "budgets", label: "Budgets & Rules", icon: Wallet },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="budgetapp">
      <Style />
      <div className="ba-nav">
        <div className="ba-brand"><PiggyBank size={18} color="#4FA687" /> PBFinance</div>
        {navItems.map((n) => (
          <button
            key={n.id}
            className={"ba-navbtn" + (tab === n.id ? " active" : "")}
            onClick={() => setTab(n.id)}
          >
            <n.icon size={15} /> {n.label}
          </button>
        ))}
      </div>
      <div className="ba-main">
        {tab === "dashboard" && <Dashboard data={data} budgets={budgets} allMonths={allMonths} />}
        {tab === "transactions" && (
          <TransactionsTab data={data} setData={setData} showToast={showToast} />
        )}
        {tab === "import" && (
          <ImportTab data={data} setData={setData} showToast={showToast} />
        )}
        {tab === "budgets" && (
          <BudgetsRulesTab data={data} setData={setData} budgets={budgets} setBudgets={setBudgets} showToast={showToast} />
        )}
        {tab === "settings" && (
          <SettingsTab data={data} setData={setData} setBudgets={setBudgets} showToast={showToast} />
        )}
      </div>
      {toast && (
        <div style={{
          position: "absolute", bottom: 18, right: 18, background: "var(--surface-2)",
          border: "1px solid var(--border)", padding: "9px 14px", borderRadius: 8, fontSize: 12.5,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <Check size={13} color="#4FA687" /> {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Dashboard                                                                */
/* ---------------------------------------------------------------------- */

function Dashboard({ data, budgets, allMonths }) {
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [trendCategory, setTrendCategory] = useState("__total__");

  useEffect(() => {
    if (!allMonths.includes(month)) setMonth(allMonths[allMonths.length - 1]);
  }, [allMonths]); // eslint-disable-line

  const monthTx = data.transactions.filter((t) => monthKey(t.date) === month);
  const monthIncome = data.income.filter((t) => monthKey(t.date) === month);

  const totalExpenses = monthTx.reduce((s, t) => s + effectiveAmount(t, data.accounts), 0);
  const totalIncome = monthIncome.reduce((s, t) => s + Number(t.amount), 0);
  const savings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

  const byCategory = useMemo(() => {
    const m = {};
    monthTx.forEach((t) => {
      m[t.category] = (m[t.category] || 0) + effectiveAmount(t, data.accounts);
    });
    return Object.entries(m)
      .map(([name, value]) => ({
        name,
        value: Math.round(value * 100) / 100,
        color: (data.categories.find((c) => c.name === name) || {}).color || "#8B93A1",
      }))
      .sort((a, b) => b.value - a.value);
  }, [monthTx, data.categories, data.accounts]);

  const byAccount = useMemo(() => {
    const m = {};
    monthTx.forEach((t) => {
      const acc = data.accounts.find((a) => a.id === t.accountId);
      const label = acc ? acc.name : t.accountId;
      m[label] = (m[label] || 0) + effectiveAmount(t, data.accounts);
    });
    return Object.entries(m).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [monthTx, data.accounts]);

  const trendData = useMemo(() => {
    return allMonths.map((mk) => {
      const tx = data.transactions.filter((t) => monthKey(t.date) === mk);
      const inc = data.income.filter((t) => monthKey(t.date) === mk).reduce((s, t) => s + Number(t.amount), 0);
      let exp;
      if (trendCategory === "__total__") {
        exp = tx.reduce((s, t) => s + effectiveAmount(t, data.accounts), 0);
      } else {
        exp = tx.filter((t) => t.category === trendCategory).reduce((s, t) => s + effectiveAmount(t, data.accounts), 0);
      }
      return {
        month: monthLabel(mk),
        income: Math.round(inc * 100) / 100,
        expenses: Math.round(exp * 100) / 100,
        savings: Math.round((inc - (trendCategory === "__total__" ? exp : 0)) * 100) / 100,
      };
    });
  }, [allMonths, data.transactions, data.income, data.accounts, trendCategory]);

  const budgetRows = data.categories
    .filter((c) => budgets[c.name] > 0)
    .map((c) => {
      const spent = byCategory.find((b) => b.name === c.name)?.value || 0;
      const limit = budgets[c.name];
      const pct = Math.min(100, (spent / limit) * 100);
      const color = spent > limit ? "var(--coral)" : pct > 80 ? "var(--amber)" : "var(--teal)";
      return { name: c.name, spent, limit, pct, color, catColor: c.color };
    });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="ba-h1">Dashboard</h1>
          <p className="ba-sub">Your monthly financial snapshot</p>
        </div>
        <select className="ba-select" value={month} onChange={(e) => setMonth(e.target.value)}>
          {allMonths.map((mk) => (
            <option key={mk} value={mk}>{monthLabel(mk)}</option>
          ))}
        </select>
      </div>

      <div className="ba-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 16 }}>
        <div className="ba-card ba-ledger">
          <div className="ba-stat-label">Income</div>
          <div className="ba-stat-value mono" style={{ color: "var(--blue)" }}>{eur(totalIncome)}</div>
        </div>
        <div className="ba-card ba-ledger">
          <div className="ba-stat-label">Expenses</div>
          <div className="ba-stat-value mono" style={{ color: "var(--coral)" }}>{eur(totalExpenses)}</div>
        </div>
        <div className="ba-card ba-ledger">
          <div className="ba-stat-label">Savings</div>
          <div className="ba-stat-value mono" style={{ color: savings >= 0 ? "var(--teal)" : "var(--coral)" }}>
            {eur(savings)}
          </div>
        </div>
        <div className="ba-card ba-ledger">
          <div className="ba-stat-label">Savings rate</div>
          <div className="ba-stat-value mono" style={{ color: "var(--text)" }}>
            {totalIncome > 0 ? savingsRate.toFixed(1) + "%" : "—"}
          </div>
        </div>
      </div>

      <div className="ba-grid" style={{ gridTemplateColumns: "1.1fr 0.9fr", marginBottom: 16 }}>
        <div className="ba-card">
          <div className="ba-stat-label" style={{ marginBottom: 12 }}>Spend by category — {monthLabel(month)}</div>
          {byCategory.length === 0 ? (
            <div className="ba-empty">No expenses recorded for this month yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {byCategory.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Pie>
                <Tooltip formatter={(v) => eur(v)} contentStyle={{ background: "#1B2027", border: "1px solid #2E3540", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="ba-card">
          <div className="ba-stat-label" style={{ marginBottom: 12 }}>Personal vs shared</div>
          {byAccount.length === 0 ? (
            <div className="ba-empty">Nothing to split yet.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={byAccount} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#8B93A1" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#E7E4DC" }} width={100} />
                  <Tooltip formatter={(v) => eur(v)} contentStyle={{ background: "#1B2027", border: "1px solid #2E3540", fontSize: 12 }} />
                  <Bar dataKey="value" fill="#6C93C7" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                Shared account counted at its configured split % (see Settings).
              </div>
            </>
          )}
        </div>
      </div>

      <div className="ba-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="ba-stat-label" style={{ marginBottom: 0 }}>Income vs expenses over time</div>
          <select className="ba-select" value={trendCategory} onChange={(e) => setTrendCategory(e.target.value)}>
            <option value="__total__">All categories</option>
            {data.categories.map((c) => <option key={c.name} value={c.name}>{c.name} trend only</option>)}
          </select>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trendData}>
            <CartesianGrid stroke="#2E3540" strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#8B93A1" }} />
            <YAxis tick={{ fontSize: 11, fill: "#8B93A1" }} />
            <Tooltip formatter={(v) => eur(v)} contentStyle={{ background: "#1B2027", border: "1px solid #2E3540", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {trendCategory === "__total__" && <Line type="monotone" dataKey="income" stroke="#6C93C7" strokeWidth={2} dot={false} />}
            <Line type="monotone" dataKey="expenses" name={trendCategory === "__total__" ? "expenses" : trendCategory} stroke="#E2685C" strokeWidth={2} dot={false} />
            {trendCategory === "__total__" && <Line type="monotone" dataKey="savings" stroke="#4FA687" strokeWidth={2} dot={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="ba-card">
        <div className="ba-stat-label" style={{ marginBottom: 12 }}>Budgets — {monthLabel(month)}</div>
        {budgetRows.length === 0 ? (
          <div className="ba-empty">No budgets set yet. Add some in the Budgets & Rules tab.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {budgetRows.map((b) => (
              <div key={b.name}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                  <span><span className="ba-dot" style={{ background: b.catColor, marginRight: 6 }} />{b.name}</span>
                  <span className="mono">{eur(b.spent)} / {eur(b.limit)}</span>
                </div>
                <div className="ba-progress-track">
                  <div className="ba-progress-fill" style={{ width: b.pct + "%", background: b.color }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Transactions Tab                                                         */
/* ---------------------------------------------------------------------- */

function TransactionsTab({ data, setData, showToast }) {
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterRecurring, setFilterRecurring] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [showIncomeAdd, setShowIncomeAdd] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);
  const [subTab, setSubTab] = useState("expenses");

  const months = Array.from(new Set(data.transactions.map((t) => monthKey(t.date)))).sort().reverse();

  const filtered = data.transactions
    .filter((t) => filterMonth === "all" || monthKey(t.date) === filterMonth)
    .filter((t) => filterCategory === "all" || t.category === filterCategory)
    .filter((t) => filterAccount === "all" || t.accountId === filterAccount)
    .filter((t) => filterRecurring === "all" || (filterRecurring === "yes" ? t.recurring : !t.recurring))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const updateTx = (id, patch) => {
    setData((d) => ({ ...d, transactions: d.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  };
  const deleteTx = (id) => {
    setData((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }));
    showToast("Transaction deleted");
  };
  const deleteIncome = (id) => {
    setData((d) => ({ ...d, income: d.income.filter((t) => t.id !== id) }));
    showToast("Income entry deleted");
  };

  const addRuleFromTx = (tx) => {
    const keyword = window.prompt(
      "Save a rule: any future transaction whose description contains this text will be auto-categorized as \"" + tx.category + "\".",
      tx.description.split(" ").slice(0, 2).join(" ")
    );
    if (!keyword) return;
    setData((d) => ({ ...d, rules: [...d.rules, { id: uid(), pattern: keyword, category: tx.category }] }));
    showToast("Rule saved");
  };

  const exportCSV = () => {
    const rows = filtered.map((t) => ({
      date: t.date,
      description: t.description,
      amount: t.amount,
      category: t.category,
      account: (data.accounts.find((a) => a.id === t.accountId) || {}).name,
      recurring: t.recurring ? "yes" : "no",
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="ba-h1">Transactions</h1>
          <p className="ba-sub">All expenses and income, manually added or imported</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ba-btn secondary" onClick={exportCSV}><Download size={13} /> Export CSV</button>
          <button className="ba-btn" onClick={() => (subTab === "expenses" ? setShowAdd(true) : setShowIncomeAdd(true))}>
            <Plus size={13} /> Add {subTab === "expenses" ? "expense" : "income"}
          </button>
        </div>
      </div>

      <div className="ba-tabs">
        <div className={"ba-tab" + (subTab === "expenses" ? " active" : "")} onClick={() => setSubTab("expenses")}>Expenses</div>
        <div className={"ba-tab" + (subTab === "income" ? " active" : "")} onClick={() => setSubTab("income")}>Income</div>
      </div>

      {subTab === "expenses" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <select className="ba-select" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
              <option value="all">All months</option>
              {months.map((mk) => <option key={mk} value={mk}>{monthLabel(mk)}</option>)}
            </select>
            <select className="ba-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="all">All categories</option>
              {data.categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <select className="ba-select" value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
              <option value="all">All accounts</option>
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select className="ba-select" value={filterRecurring} onChange={(e) => setFilterRecurring(e.target.value)}>
              <option value="all">Recurring & one-off</option>
              <option value="yes">Recurring only</option>
              <option value="no">One-off only</option>
            </select>
          </div>

          <div className="ba-card" style={{ padding: 0, overflow: "hidden" }}>
            {filtered.length === 0 ? (
              <div className="ba-empty">No transactions match these filters.</div>
            ) : (
              <div style={{ maxHeight: 480, overflowY: "auto" }}>
                <table className="ba-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Description</th><th>Category</th><th>Account</th>
                      <th style={{ textAlign: "right" }}>Amount</th><th style={{ textAlign: "right" }}>Effective</th>
                      <th></th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => (
                      <tr key={t.id}>
                        <td className="mono" style={{ whiteSpace: "nowrap" }}>{t.date}</td>
                        <td>{t.description}</td>
                        <td>
                          <select className="ba-select" style={{ fontSize: 12, padding: "4px 6px" }} value={t.category}
                            onChange={(e) => updateTx(t.id, { category: e.target.value })}>
                            {data.categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="ba-select" style={{ fontSize: 12, padding: "4px 6px" }} value={t.accountId}
                            onChange={(e) => updateTx(t.id, { accountId: e.target.value })}>
                            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>{eur(t.amount)}</td>
                        <td className="mono" style={{ textAlign: "right", color: "var(--text-dim)" }}>{eur(effectiveAmount(t, data.accounts))}</td>
                        <td>
                          <button title="Recurring" className="ba-btn ghost" style={{ padding: "4px 7px", color: t.recurring ? "var(--teal)" : "var(--text-dim)" }}
                            onClick={() => updateTx(t.id, { recurring: !t.recurring })}>
                            <Repeat size={12} />
                          </button>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button className="ba-btn ghost" style={{ padding: "4px 7px" }} onClick={() => addRuleFromTx(t)} title="Save category as rule">Rule</button>
                          <button className="ba-btn ghost" style={{ padding: "4px 7px", marginLeft: 4 }} onClick={() => setEditingTx(t)} title="Edit"><Pencil size={12} /></button>
                          <button className="ba-btn ghost" style={{ padding: "4px 7px", marginLeft: 4 }} onClick={() => deleteTx(t.id)}><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {subTab === "income" && (
        <div className="ba-card" style={{ padding: 0, overflow: "hidden" }}>
          {data.income.length === 0 ? (
            <div className="ba-empty">No income entries yet.</div>
          ) : (
            <table className="ba-table">
              <thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: "right" }}>Amount</th><th></th></tr></thead>
              <tbody>
                {data.income.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.date}</td>
                    <td>{t.description}</td>
                    <td className="mono" style={{ textAlign: "right", color: "var(--blue)" }}>{eur(t.amount)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="ba-btn ghost" style={{ padding: "4px 7px" }} onClick={() => setEditingIncome(t)} title="Edit"><Pencil size={12} /></button>
                      <button className="ba-btn ghost" style={{ padding: "4px 7px", marginLeft: 4 }} onClick={() => deleteIncome(t.id)}><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {(showAdd || editingTx) && (
        <ExpenseModal
          data={data}
          initial={editingTx}
          onClose={() => { setShowAdd(false); setEditingTx(null); }}
          onSave={(tx) => {
            if (editingTx) {
              setData((d) => ({ ...d, transactions: d.transactions.map((x) => (x.id === tx.id ? tx : x)) }));
              showToast("Expense updated");
            } else {
              setData((d) => ({ ...d, transactions: [...d.transactions, tx] }));
              showToast("Expense added");
            }
            setShowAdd(false);
            setEditingTx(null);
          }}
        />
      )}
      {(showIncomeAdd || editingIncome) && (
        <IncomeModal
          initial={editingIncome}
          onClose={() => { setShowIncomeAdd(false); setEditingIncome(null); }}
          onSave={(inc) => {
            if (editingIncome) {
              setData((d) => ({ ...d, income: d.income.map((x) => (x.id === inc.id ? inc : x)) }));
              showToast("Income updated");
            } else {
              setData((d) => ({ ...d, income: [...d.income, inc] }));
              showToast("Income added");
            }
            setShowIncomeAdd(false);
            setEditingIncome(null);
          }}
        />
      )}
    </div>
  );
}

function ExpenseModal({ data, initial, onClose, onSave }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(
    isEdit
      ? {
          date: initial.date,
          description: initial.description,
          amount: String(initial.amount),
          category: initial.category,
          accountId: initial.accountId,
          recurring: !!initial.recurring,
        }
      : {
          date: todayISO(), description: "", amount: "", category: "Uncategorized",
          accountId: data.accounts[0]?.id || "personal", recurring: false,
        }
  );
  useEffect(() => {
    if (!isEdit && form.description && form.category === "Uncategorized") {
      const guess = applyRules(form.description, data.rules);
      if (guess !== "Uncategorized") setForm((f) => ({ ...f, category: guess }));
    }
  }, [form.description]); // eslint-disable-line

  const save = () => {
    if (!form.description || !form.amount) return;
    onSave({
      id: isEdit ? initial.id : uid(),
      ...form,
      amount: Math.abs(parseFloat(form.amount)),
      source: isEdit ? initial.source : "manual",
    });
  };

  return (
    <Modal title={isEdit ? "Edit expense" : "Add expense"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div><label className="ba-label">Date</label>
          <input type="date" className="ba-input" style={{ width: "100%" }} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div><label className="ba-label">Description</label>
          <input className="ba-input" style={{ width: "100%" }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Continente groceries" />
        </div>
        <div><label className="ba-label">Amount (€)</label>
          <input type="number" step="0.01" className="ba-input" style={{ width: "100%" }} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div><label className="ba-label">Category</label>
          <select className="ba-select" style={{ width: "100%" }} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {data.categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div><label className="ba-label">Account</label>
          <select className="ba-select" style={{ width: "100%" }} value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.splitPercent}%)</option>)}
          </select>
        </div>
        <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} /> Recurring / fixed expense
        </label>
        <button className="ba-btn" style={{ marginTop: 6 }} onClick={save}>{isEdit ? "Save changes" : "Save expense"}</button>
      </div>
    </Modal>
  );
}

function IncomeModal({ initial, onClose, onSave }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(
    isEdit
      ? { date: initial.date, description: initial.description, amount: String(initial.amount) }
      : { date: todayISO(), description: "Salary", amount: "" }
  );
  const save = () => {
    if (!form.amount) return;
    onSave({ id: isEdit ? initial.id : uid(), ...form, amount: Math.abs(parseFloat(form.amount)) });
  };
  return (
    <Modal title={isEdit ? "Edit income" : "Add income"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div><label className="ba-label">Date</label>
          <input type="date" className="ba-input" style={{ width: "100%" }} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div><label className="ba-label">Description</label>
          <input className="ba-input" style={{ width: "100%" }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div><label className="ba-label">Amount (€)</label>
          <input type="number" step="0.01" className="ba-input" style={{ width: "100%" }} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <button className="ba-btn" style={{ marginTop: 6 }} onClick={save}>{isEdit ? "Save changes" : "Save income"}</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Import Tab                                                               */
/* ---------------------------------------------------------------------- */

function ImportTab({ data, setData, showToast }) {
  const [rawRows, setRawRows] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({ date: "", description: "", amount: "" });
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || "personal");
  const [preview, setPreview] = useState(null);
  const fileRef = useRef();

  const existingSignatures = useMemo(
    () => new Set(data.transactions.map(txSignature)),
    [data.transactions]
  );

  const onFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setRawRows(res.data);
        const hdrs = res.meta.fields || [];
        setHeaders(hdrs);
        const guess = (cands) => hdrs.find((h) => cands.some((c) => h.toLowerCase().includes(c))) || hdrs[0] || "";
        setMapping({
          date: guess(["date", "data"]),
          description: guess(["desc", "memo", "detail", "narrat"]),
          amount: guess(["amount", "montante", "valor", "value"]),
        });
        setPreview(null);
      },
    });
  };

  const buildPreview = () => {
    if (!rawRows || !mapping.date || !mapping.description || !mapping.amount) return;
    const rows = rawRows
      .map((r) => {
        const date = normalizeDate(r[mapping.date]);
        const description = String(r[mapping.description] || "").trim();
        const amount = parseAmount(r[mapping.amount]);
        return { date, description, amount };
      })
      .filter((r) => r.date && r.description && !isNaN(r.amount) && r.amount !== 0)
      .map((r) => {
        const type = r.amount < 0 ? "expense" : "income";
        const absAmount = Math.abs(r.amount);
        const category = applyRules(r.description, data.rules);
        const sig = txSignature({ date: r.date, description: r.description, amount: absAmount, accountId });
        const isDup = existingSignatures.has(sig);
        return { ...r, amount: absAmount, type, category, accountId, isDup, include: !isDup };
      });
    setPreview(rows);
  };

  const updateRow = (idx, patch) => {
    setPreview((p) => p.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const bulkSetType = (type) => setPreview((p) => p.map((r) => ({ ...r, type })));

  const doImport = () => {
    const toImport = preview.filter((r) => r.include);
    const newTx = toImport.filter((r) => r.type === "expense").map((r) => ({
      id: uid(), date: r.date, description: r.description, amount: r.amount,
      category: r.category, accountId: r.accountId, recurring: false, source: "import",
    }));
    const newInc = toImport.filter((r) => r.type === "income").map((r) => ({
      id: uid(), date: r.date, description: r.description, amount: r.amount,
    }));
    setData((d) => ({ ...d, transactions: [...d.transactions, ...newTx], income: [...d.income, ...newInc] }));
    showToast(`Imported ${newTx.length} expense(s) and ${newInc.length} income entrie(s)`);
    setPreview(null);
    setRawRows(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const dupCount = preview ? preview.filter((r) => r.isDup).length : 0;

  return (
    <div>
      <h1 className="ba-h1">Import bank statement</h1>
      <p className="ba-sub">Upload a CSV export from your bank. Works with most Portuguese bank formats.</p>

      <div className="ba-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label className="ba-label">CSV file</label>
            <input ref={fileRef} type="file" accept=".csv" onChange={onFile} className="ba-input" />
          </div>
          <div>
            <label className="ba-label">Which account is this statement from?</label>
            <select className="ba-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.splitPercent}% counted)</option>)}
            </select>
          </div>
        </div>

        {headers.length > 0 && (
          <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {["date", "description", "amount"].map((k) => (
              <div key={k}>
                <label className="ba-label">{k} column</label>
                <select className="ba-select" value={mapping[k]} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value })}>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
            <button className="ba-btn" style={{ alignSelf: "flex-end" }} onClick={buildPreview}>Preview import</button>
          </div>
        )}
      </div>

      {preview && (
        <div className="ba-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 13 }}>
              {preview.length} rows parsed
              {dupCount > 0 && (
                <span style={{ color: "var(--amber)", marginLeft: 8 }}>
                  <AlertTriangle size={12} style={{ verticalAlign: -1 }} /> {dupCount} possible duplicate(s) — unchecked by default
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="ba-btn ghost" onClick={() => bulkSetType("expense")}>All expense</button>
              <button className="ba-btn ghost" onClick={() => bulkSetType("income")}>All income</button>
            </div>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            <table className="ba-table">
              <thead>
                <tr>
                  <th></th><th>Date</th><th>Description</th><th style={{ textAlign: "right" }}>Amount</th>
                  <th>Type</th><th>Category</th><th></th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} style={{ opacity: r.include ? 1 : 0.45 }}>
                    <td><input type="checkbox" checked={r.include} onChange={(e) => updateRow(i, { include: e.target.checked })} /></td>
                    <td className="mono">{r.date}</td>
                    <td>{r.description}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{eur(r.amount)}</td>
                    <td>
                      <select className="ba-select" style={{ fontSize: 12, padding: "4px 6px" }} value={r.type} onChange={(e) => updateRow(i, { type: e.target.value })}>
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </select>
                    </td>
                    <td>
                      {r.type === "expense" ? (
                        <select className="ba-select" style={{ fontSize: 12, padding: "4px 6px" }} value={r.category} onChange={(e) => updateRow(i, { category: e.target.value })}>
                          {data.categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </select>
                      ) : <span style={{ color: "var(--text-dim)" }}>—</span>}
                    </td>
                    <td>{r.isDup && <span title="Looks like a duplicate of an existing transaction"><AlertTriangle size={13} color="var(--amber)" /></span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 14, borderTop: "1px solid var(--border)" }}>
            <button className="ba-btn" onClick={doImport}>Import selected rows</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Budgets & Rules Tab                                                      */
/* ---------------------------------------------------------------------- */

function BudgetsRulesTab({ data, setData, budgets, setBudgets, showToast }) {
  const [newRule, setNewRule] = useState({ pattern: "", category: data.categories[0]?.name || "" });

  const setBudget = (cat, val) => {
    setBudgets((b) => ({ ...b, [cat]: val === "" ? undefined : parseFloat(val) }));
  };

  const addRule = () => {
    if (!newRule.pattern) return;
    setData((d) => ({ ...d, rules: [...d.rules, { id: uid(), ...newRule }] }));
    setNewRule({ pattern: "", category: data.categories[0]?.name || "" });
    showToast("Rule added");
  };
  const deleteRule = (id) => setData((d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) }));

  return (
    <div>
      <h1 className="ba-h1">Budgets & Rules</h1>
      <p className="ba-sub">Set monthly limits per category and teach the app how to auto-categorize</p>

      <div className="ba-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="ba-card">
          <div className="ba-stat-label" style={{ marginBottom: 12 }}>Monthly budgets</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.categories.map((c) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 13 }}><span className="ba-dot" style={{ background: c.color, marginRight: 6 }} />{c.name}</span>
                <input
                  type="number" className="ba-input" style={{ width: 100, textAlign: "right" }}
                  placeholder="—" value={budgets[c.name] ?? ""}
                  onChange={(e) => setBudget(c.name, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="ba-card">
          <div className="ba-stat-label" style={{ marginBottom: 12 }}>Categorization rules</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input className="ba-input" style={{ flex: 1 }} placeholder="text to match, e.g. continente"
              value={newRule.pattern} onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })} />
            <select className="ba-select" value={newRule.category} onChange={(e) => setNewRule({ ...newRule, category: e.target.value })}>
              {data.categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <button className="ba-btn" onClick={addRule}><Plus size={13} /></button>
          </div>
          {data.rules.length === 0 ? (
            <div className="ba-empty">No rules yet. Rules are checked in order, first match wins.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {data.rules.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, background: "var(--surface-2)", padding: "6px 10px", borderRadius: 6 }}>
                  <span>"<span className="mono">{r.pattern}</span>" → <CategoryPill name={r.category} categories={data.categories} /></span>
                  <Trash2 size={12} style={{ cursor: "pointer", color: "var(--text-dim)" }} onClick={() => deleteRule(r.id)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Settings Tab                                                            */
/* ---------------------------------------------------------------------- */

function SettingsTab({ data, setData, setBudgets, showToast }) {
  const [newCat, setNewCat] = useState("");
  const fileRef = useRef();

  const updateAccountSplit = (id, val) => {
    setData((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === id ? { ...a, splitPercent: Math.max(0, Math.min(100, Number(val))) } : a)) }));
  };
  const renameAccount = (id, name) => {
    setData((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === id ? { ...a, name } : a)) }));
  };
  const addCategory = () => {
    if (!newCat.trim()) return;
    const colors = ["#4FA687", "#E0A458", "#6C93C7", "#9B87C4", "#E2685C", "#5FB0B7", "#D68FB8"];
    setData((d) => ({ ...d, categories: [...d.categories, { name: newCat.trim(), color: colors[d.categories.length % colors.length] }] }));
    setNewCat("");
  };
  const deleteCategory = (name) => {
    setData((d) => ({ ...d, categories: d.categories.filter((c) => c.name !== name) }));
  };

  const exportBackup = () => {
    (async () => {
      const res = await storage.get(STORAGE_KEY).catch(() => null);
      const blob = new Blob([res ? res.value : "{}"], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `budget-backup-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    })();
  };

  const restoreBackup = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!window.confirm("This will replace all current data with the backup file. Continue?")) return;
        setData({ ...DEFAULT_DATA, ...parsed.data });
        setBudgets(parsed.budgets || {});
        showToast("Backup restored");
      } catch (err) {
        alert("Couldn't read that file — is it a valid backup JSON?");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <h1 className="ba-h1">Settings</h1>
      <p className="ba-sub">Accounts, categories, and your data</p>

      <div className="ba-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
        <div className="ba-card">
          <div className="ba-stat-label" style={{ marginBottom: 12 }}>Accounts & split percentage</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {data.accounts.map((a) => (
              <div key={a.id}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <input className="ba-input" style={{ flex: 1 }} value={a.name} onChange={(e) => renameAccount(a.id, e.target.value)} />
                  <input type="number" className="ba-input" style={{ width: 70, textAlign: "right" }} value={a.splitPercent} onChange={(e) => updateAccountSplit(a.id, e.target.value)} />
                  <span style={{ alignSelf: "center", color: "var(--text-dim)", fontSize: 12 }}>%</span>
                </div>
                <div className="split-gauge">
                  <div style={{ width: a.splitPercent + "%", background: "var(--teal)" }} />
                  <div style={{ width: (100 - a.splitPercent) + "%", background: "var(--surface-2)" }} />
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 12 }}>
            For the shared account, set this to 50% (or whatever your actual split is) — every transaction on that account will count at this percentage everywhere in the app.
          </p>
        </div>

        <div className="ba-card">
          <div className="ba-stat-label" style={{ marginBottom: 12 }}>Categories</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input className="ba-input" style={{ flex: 1 }} placeholder="New category name" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button className="ba-btn" onClick={addCategory}><Plus size={13} /></button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 260, overflowY: "auto" }}>
            {data.categories.map((c) => (
              <span key={c.name} className="ba-pill" style={{ background: c.color + "22", color: c.color, cursor: "pointer" }}
                onClick={() => deleteCategory(c.name)} title="Click to remove">
                <span className="ba-dot" style={{ background: c.color }} /> {c.name} <X size={10} />
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="ba-card">
        <div className="ba-stat-label" style={{ marginBottom: 12 }}>Data backup</div>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 12 }}>
          Your data lives only in this app. Export a backup regularly, especially before clearing browser data.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ba-btn secondary" onClick={exportBackup}><Download size={13} /> Export backup (.json)</button>
          <button className="ba-btn ghost" onClick={() => fileRef.current.click()}><RefreshCcw size={13} /> Restore from backup</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={restoreBackup} />
        </div>
      </div>
    </div>
  );
}
