import React, { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return diff + 'm ago';
  if (diff < 1440) return Math.floor(diff / 60) + 'h ago';
  return Math.floor(diff / 1440) + 'd ago';
}

const TXN_ICONS = {
  sale: '🛒', purchase: '📦',
  payment_received: '✅', payment_made: '⬆️', expense: '💸'
};
const TXN_LABELS = {
  sale: 'Sale', purchase: 'Purchase',
  payment_received: 'Payment In', payment_made: 'Payment Out', expense: 'Expense'
};

function MetricCard({ label, value, color, sub }) {
  const C = {
    green:  { bg: '#f0fdf4', bo: '#86efac', tx: '#166534', vl: '#16a34a' },
    blue:   { bg: '#eff6ff', bo: '#93c5fd', tx: '#1e40af', vl: '#2563eb' },
    amber:  { bg: '#fffbeb', bo: '#fcd34d', tx: '#92400e', vl: '#d97706' },
    red:    { bg: '#fef2f2', bo: '#fca5a5', tx: '#991b1b', vl: '#dc2626' },
    purple: { bg: '#faf5ff', bo: '#c4b5fd', tx: '#5b21b6', vl: '#7c3aed' },
  };
  const c = C[color] || C.blue;
  return (
    <div style={{ background: c.bg, border: '1px solid ' + c.bo, borderRadius: 12, padding: '14px 18px', flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10, color: c.tx, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: c.vl, margin: '4px 0 2px' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: c.tx }}>{sub}</div>}
    </div>
  );
}

function TransactionList({ transactions }) {
  if (!transactions || !transactions.length)
    return <div style={{ textAlign: 'center', padding: 28, color: '#9ca3af', fontSize: 14 }}>No transactions yet</div>;
  return (
    <div>
      {transactions.map(t => {
        const isIn = t.direction === 'in';
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: isIn ? '#f0fdf4' : '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
              {TXN_ICONS[t.transaction_type] || '💰'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{TXN_LABELS[t.transaction_type] || t.transaction_type} · {t.payment_method} · {timeAgo(t.created_at)}</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: isIn ? '#16a34a' : '#dc2626', flexShrink: 0 }}>
              {isIn ? '+' : '-'}{fmt(t.amount)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OutstandingList({ customers }) {
  if (!customers || !customers.length)
    return <div style={{ textAlign: 'center', padding: 22, color: '#9ca3af', fontSize: 13 }}>No outstanding payments 🎉</div>;
  return (
    <div>
      {customers.map(c => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f3f4f6' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#1f2937' }}>{c.name}</div>
            {c.phone && <div style={{ fontSize: 11, color: '#9ca3af' }}>{c.phone}</div>}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#dc2626' }}>{fmt(c.outstanding_balance)}</div>
        </div>
      ))}
    </div>
  );
}

function InventoryList({ inventory, lowStock, expiring }) {
  if (!inventory || !inventory.length)
    return <div style={{ textAlign: 'center', padding: 22, color: '#9ca3af', fontSize: 13 }}>No products added yet</div>;
  const lowSet = new Set((lowStock || []).map(i => i.name));
  const expSet = new Set((expiring || []).map(i => i.name));
  const sorted = [...inventory].sort((a, b) => (lowSet.has(a.name) ? -1 : lowSet.has(b.name) ? 1 : 0));
  return (
    <div>
      {sorted.map(p => {
        const isLow = lowSet.has(p.name);
        const isExp = expSet.has(p.name);
        const badge = isLow
          ? <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, marginLeft: 6 }}>LOW</span>
          : isExp
            ? <span style={{ background: '#fffbeb', color: '#d97706', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, marginLeft: 6 }}>EXPIRING</span>
            : <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, marginLeft: 6 }}>OK</span>;
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1f2937', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ maxWidth: 170, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                {badge}
              </div>
              {p.expiry_date && <div style={{ fontSize: 11, color: '#9ca3af' }}>Exp: {p.expiry_date}</div>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: isLow ? '#dc2626' : '#1f2937' }}>{Number(p.current_stock)}</div>
              <div style={{ fontSize: 10, color: '#9ca3af' }}>{p.unit}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AlertPanel({ lowStock, expiring }) {
  const alerts = [];
  (lowStock || []).forEach(i => {
    if (Number(i.current_stock) === 0) alerts.push({ type: 'danger', msg: i.name + ' — OUT OF STOCK' });
    else alerts.push({ type: 'warn', msg: i.name + ' — Low: ' + i.current_stock + ' ' + i.unit });
  });
  (expiring || []).filter(i => {
    const days = (new Date(i.expiry_date) - new Date()) / 864e5;
    return days <= 30;
  }).forEach(i => alerts.push({ type: 'expiry', msg: i.name + ' — Expires ' + i.expiry_date }));
  if (!alerts.length)
    return <div style={{ textAlign: 'center', padding: 22, color: '#9ca3af', fontSize: 13 }}>No critical alerts ✅</div>;
  const C = {
    danger: { bg: '#fef2f2', bo: '#fca5a5', tx: '#991b1b' },
    warn:   { bg: '#fffbeb', bo: '#fcd34d', tx: '#92400e' },
    expiry: { bg: '#fff7ed', bo: '#fdba74', tx: '#9a3412' },
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {alerts.map((a, i) => {
        const c = C[a.type] || C.warn;
        return <div key={i} style={{ background: c.bg, border: '1px solid ' + c.bo, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: c.tx, fontWeight: 500 }}>{a.msg}</div>;
      })}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      <div style={{ padding: '13px 16px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '.4px' }}>{title}</div>
      </div>
      <div style={{ padding: '4px 16px 12px' }}>{children}</div>
    </div>
  );
}

// ── PHONE LOOKUP SCREEN ──────────────────────────────────
function LookupScreen() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function go() {
    const p = phone.replace(/\D/g, '');
    if (p.length < 10) { setError('Enter a valid phone number'); return; }
    const normalized = p.length === 10 ? '91' + p : p;
    setLoading(true); setError('');
    try {
      const r = await fetch(API + '/api/business/' + normalized);
      if (!r.ok) throw new Error('Business not found. Please check the number.');
      const d = await r.json();
      if (d.business && d.business.id) {
        window.location.href = '/dashboard/' + d.business.id;
      } else throw new Error('Business not found');
    } catch(e) { setError(e.message); setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#064e3b,#065f46,#047857)' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 36, width: '100%', maxWidth: 360, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🤖</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#064e3b' }}>BizPilot</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>AI Business Dashboard</div>
        </div>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>YOUR WHATSAPP NUMBER</label>
        <input
          value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="9876543210 or 919876543210"
          onKeyDown={e => e.key === 'Enter' && go()}
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', marginBottom: 10 }}
        />
        {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 10 }}>{error}</div>}
        <button onClick={go} disabled={loading}
          style={{ width: '100%', padding: 11, background: loading ? '#9ca3af' : '#059669', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Loading...' : 'Open My Dashboard →'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: '#9ca3af' }}>
          New to BizPilot? <a href="/" style={{ color: '#059669' }}>Get started →</a>
        </div>
      </div>
    </div>
  );
}

// ── MAIN DASHBOARD ───────────────────────────────────────
function Dashboard({ businessId }) {
  const [business, setBusiness] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [dashRes, bizRes] = await Promise.all([
        fetch(API + '/api/dashboard/' + businessId),
        fetch(API + '/api/business-by-id/' + businessId)
      ]);
      if (!dashRes.ok) throw new Error('Failed to load. Check your connection.');
      const dash = await dashRes.json();
      setData(dash);
      if (bizRes.ok) { const b = await bizRes.json(); setBusiness(b.business); }
      setLastUpdated(new Date());
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, [businessId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const t = setInterval(fetchData, 60000);
    return () => clearInterval(t);
  }, [fetchData]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
        <div style={{ fontSize: 14, color: '#6b7280' }}>Loading your dashboard...</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <div style={{ background: '#fff', padding: 28, borderRadius: 12, textAlign: 'center', maxWidth: 300 }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>❌</div>
        <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 14 }}>{error}</div>
        <button onClick={fetchData} style={{ padding: '8px 20px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Retry</button>
      </div>
    </div>
  );

  if (!data) return null;

  const { summary, outstanding, inventory, lowStock, expiring, recentTransactions } = data;
  const totalRec = (outstanding || []).reduce((s, c) => s + Number(c.outstanding_balance), 0);

  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'transactions', label: '💰 Transactions' },
    { id: 'inventory', label: '📦 Inventory' },
    { id: 'outstanding', label: '📋 Outstanding' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>

      {/* HEADER */}
      <div style={{ background: 'linear-gradient(135deg,#064e3b,#065f46)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>🤖 BizPilot</div>
          <div style={{ color: '#6ee7b7', fontSize: 12, marginTop: 2 }}>
            {business ? business.name + ' · ' + (business.city || 'India') : 'Dashboard'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <button onClick={fetchData} style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>↻ Refresh</button>
          {lastUpdated && <div style={{ color: '#6ee7b7', fontSize: 10, marginTop: 3 }}>Updated {timeAgo(lastUpdated)}</div>}
        </div>
      </div>

      {/* METRICS */}
      <div style={{ padding: '14px 14px 6px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <MetricCard label="Today Sales" value={fmt(summary.total_sales)} color="green" sub={summary.sale_count + ' txns'} />
        <MetricCard label="Expenses" value={fmt(summary.total_expenses)} color="red" />
        <MetricCard label="Receivables" value={fmt(totalRec)} color="amber" sub={(outstanding || []).length + ' customers'} />
        <MetricCard label="Low Stock" value={(lowStock || []).length} color={(lowStock || []).length > 0 ? 'red' : 'green'} sub="items" />
      </div>

      {/* TABS */}
      <div style={{ padding: '6px 14px 0', display: 'flex', gap: 3, background: '#f0f2f5' }}>
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding: '7px 12px', border: 'none', background: active ? '#fff' : 'transparent', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#059669' : '#6b7280', borderBottom: active ? '2px solid #059669' : '2px solid transparent' }}>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* CONTENT */}
      <div style={{ padding: 14 }}>

        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Card title="Recent Transactions"><TransactionList transactions={recentTransactions} /></Card>
              <Card title="Outstanding Customers"><OutstandingList customers={outstanding} /></Card>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Card title="🚨 Alerts"><AlertPanel lowStock={lowStock} expiring={expiring} /></Card>
              <Card title="Inventory"><InventoryList inventory={(inventory || []).slice(0, 12)} lowStock={lowStock} expiring={expiring} /></Card>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <MetricCard label="Sales" value={fmt(summary.total_sales)} color="green" />
              <MetricCard label="Purchases" value={fmt(summary.total_purchases)} color="blue" />
              <MetricCard label="Expenses" value={fmt(summary.total_expenses)} color="red" />
              <MetricCard label="Received" value={fmt(summary.total_received)} color="purple" />
            </div>
            <Card title="All Transactions"><TransactionList transactions={recentTransactions} /></Card>
          </div>
        )}

        {activeTab === 'inventory' && (
          <Card title={'Inventory — ' + (inventory || []).length + ' products'}>
            <InventoryList inventory={inventory} lowStock={lowStock} expiring={expiring} />
          </Card>
        )}

        {activeTab === 'outstanding' && (
          <Card title={'Outstanding — ' + fmt(totalRec) + ' total'}>
            <OutstandingList customers={outstanding} />
          </Card>
        )}

      </div>
    </div>
  );
}

// ── ROOT APP ─────────────────────────────────────────────
export default function App() {
  const [businessId, setBusinessId] = useState(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    // /dashboard/UUID
    const pathMatch = path.match(/\/dashboard\/([a-f0-9\-]{30,})/i);
    if (pathMatch) { setBusinessId(pathMatch[1]); setResolved(true); return; }

    // ?id=UUID or ?business=UUID
    const qId = params.get('id') || params.get('business');
    if (qId && qId.length > 10) { setBusinessId(qId); setResolved(true); return; }

    setResolved(true);
  }, []);

  if (!resolved) return null;
  if (businessId) return <Dashboard businessId={businessId} />;
  return <LookupScreen />;
}
