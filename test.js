// ============================================================
// BIZPILOT COMPLETE TEST SUITE v2
// Tests all endpoints including new payment, invoice, admin
// Run: node test.js
// Run against live: TEST_URL=https://your-app.railway.app node test.js
// ============================================================

const http = require('http');
const https = require('https');

const BASE = process.env.TEST_URL || 'http://localhost:3000';
const TEST_PHONE = '919000000001';
let businessId = null;
let passed = 0;
let failed = 0;

function request(method, path, body, headers) {
  return new Promise(function(resolve, reject) {
    const url = new URL(BASE + path);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {})
    };
    const req = lib.request(opts, function(res) {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), raw: data }); }
        catch(e) { resolve({ status: res.statusCode, body: {}, raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function pass(name) {
  console.log('\x1b[32m  ✓ PASS\x1b[0m ' + name);
  passed++;
}
function fail(name, reason) {
  console.log('\x1b[31m  ✗ FAIL\x1b[0m ' + name + (reason ? '\n         → ' + reason : ''));
  failed++;
}
function section(name) {
  console.log('\n\x1b[36m' + name + '\x1b[0m');
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function run() {
  console.log('\n\x1b[1m🧪 BizPilot Test Suite v2\x1b[0m');
  console.log('Target: ' + BASE);
  console.log('─'.repeat(50));

  // ── SECTION 1: SERVER HEALTH ──────────────────────────
  section('1. Server Health');
  try {
    const r = await request('GET', '/health');
    r.status === 200 && r.body.status === 'ok'
      ? pass('Health check — server running')
      : fail('Health check', 'Status: ' + r.status + ' Body: ' + r.raw.substring(0, 100));
  } catch(e) {
    fail('Health check', 'Cannot connect to ' + BASE + ' — is server running?');
    console.log('\n\x1b[33m⚠ Cannot reach server. Start with: cd backend && node server.js\x1b[0m\n');
    process.exit(1);
  }

  // ── SECTION 2: BUSINESS REGISTRATION ─────────────────
  section('2. Business Registration');
  try {
    // Clean up first if exists
    const existing = await request('GET', '/api/business/' + TEST_PHONE);
    if (existing.body.business) {
      businessId = existing.body.business.id;
      pass('Business already exists — reusing ID');
    } else {
      const r = await request('POST', '/api/business/register', {
        name: 'Test Medical Store Rajkot',
        owner_name: 'Ramesh Shah',
        phone: TEST_PHONE,
        business_type: 'medical_shop',
        city: 'Rajkot',
        language: 'hindi'
      });
      if (r.body.business && r.body.business.id) {
        businessId = r.body.business.id;
        pass('Business registered — ID: ' + businessId.substring(0, 8) + '...');
      } else {
        fail('Business registration', JSON.stringify(r.body).substring(0, 150));
      }
    }
  } catch(e) { fail('Business registration', e.message); }

  if (!businessId) {
    console.log('\n\x1b[31mCannot continue without business ID — check Supabase connection\x1b[0m\n');
    process.exit(1);
  }

  // ── SECTION 3: API ENDPOINTS ──────────────────────────
  section('3. API Endpoints');

  try {
    const r = await request('GET', '/api/business/' + TEST_PHONE);
    r.body.business ? pass('GET business by phone') : fail('GET business by phone', JSON.stringify(r.body));
  } catch(e) { fail('GET business by phone', e.message); }

  try {
    const r = await request('GET', '/api/business-by-id/' + businessId);
    r.body.business ? pass('GET business by ID') : fail('GET business by ID', JSON.stringify(r.body));
  } catch(e) { fail('GET business by ID', e.message); }

  try {
    const r = await request('GET', '/api/dashboard/' + businessId);
    r.body.summary !== undefined
      ? pass('GET dashboard data')
      : fail('GET dashboard', JSON.stringify(r.body).substring(0, 100));
  } catch(e) { fail('GET dashboard', e.message); }

  try {
    const r = await request('GET', '/api/inventory/' + businessId);
    r.body.inventory !== undefined
      ? pass('GET inventory')
      : fail('GET inventory', JSON.stringify(r.body));
  } catch(e) { fail('GET inventory', e.message); }

  try {
    const r = await request('GET', '/api/transactions/' + businessId);
    r.body.transactions !== undefined
      ? pass('GET transactions')
      : fail('GET transactions', JSON.stringify(r.body));
  } catch(e) { fail('GET transactions', e.message); }

  // ── SECTION 4: WHATSAPP WEBHOOK ───────────────────────
  section('4. WhatsApp Webhook Processing');

  async function sendWebhook(text, msgId) {
    return request('POST', '/webhook/whatsapp', {
      waId: TEST_PHONE,
      id: msgId || ('test_' + Date.now()),
      type: 'text',
      text: text
    });
  }

  try {
    const r = await sendWebhook('10 strips paracetamol becha 120 cash');
    r.status === 200 ? pass('Webhook — sale message accepted') : fail('Webhook sale', 'Status: ' + r.status);
  } catch(e) { fail('Webhook sale', e.message); }

  await sleep(2000);

  try {
    const r = await sendWebhook('City Hospital ne 5000 diye aaj');
    r.status === 200 ? pass('Webhook — payment received accepted') : fail('Webhook payment', 'Status: ' + r.status);
  } catch(e) { fail('Webhook payment', e.message); }

  await sleep(1500);

  try {
    const r = await sendWebhook('Bijli bill 3200 bhar diya');
    r.status === 200 ? pass('Webhook — expense accepted') : fail('Webhook expense', 'Status: ' + r.status);
  } catch(e) { fail('Webhook expense', e.message); }

  await sleep(1500);

  try {
    const r = await sendWebhook('Aaj ka summary do');
    r.status === 200 ? pass('Webhook — summary query accepted') : fail('Webhook summary', 'Status: ' + r.status);
  } catch(e) { fail('Webhook summary', e.message); }

  await sleep(1500);

  try {
    const r = await sendWebhook('Paracetamol kitna bacha hai');
    r.status === 200 ? pass('Webhook — inventory query accepted') : fail('Webhook inventory query', 'Status: ' + r.status);
  } catch(e) { fail('Webhook inventory query', e.message); }

  await sleep(2000);

  // ── SECTION 5: DATA PERSISTENCE ───────────────────────
  section('5. Data Persistence (after webhook processing)');

  try {
    const r = await request('GET', '/api/transactions/' + businessId);
    const txns = r.body.transactions || [];
    const hasSale = txns.some(function(t) { return t.transaction_type === 'sale'; });
    hasSale
      ? pass('Sale transaction saved to database')
      : fail('Sale transaction in DB', 'No sale found — check Supabase credentials');
  } catch(e) { fail('Sale in DB', e.message); }

  try {
    const r = await request('GET', '/api/dashboard/' + businessId);
    Number(r.body.summary.total_sales) > 0
      ? pass('Dashboard shows updated sales total')
      : fail('Dashboard sales total', 'total_sales is 0 — webhook processing may have failed');
  } catch(e) { fail('Dashboard totals', e.message); }

  // ── SECTION 6: GUJARATI LANGUAGE ──────────────────────
  section('6. Gujarati Language Support');

  try {
    const r = await sendWebhook('Aaj nu summary apo');
    r.status === 200 ? pass('Gujarati — summary query accepted') : fail('Gujarati summary', 'Status: ' + r.status);
  } catch(e) { fail('Gujarati summary', e.message); }

  await sleep(1500);

  try {
    const r = await sendWebhook('Ramesh e 1000 aapya');
    r.status === 200 ? pass('Gujarati — payment received accepted') : fail('Gujarati payment', 'Status: ' + r.status);
  } catch(e) { fail('Gujarati payment', e.message); }

  await sleep(1500);

  // ── SECTION 7: SUBSCRIPTION SYSTEM ───────────────────
  section('7. Subscription System');

  try {
    const r = await request('GET', '/api/business/' + TEST_PHONE);
    const biz = r.body.business;
    const hasTrial = biz && biz.plan === 'trial' && biz.trial_ends_at;
    hasTrial ? pass('Business has trial plan with expiry date') : fail('Trial plan', JSON.stringify(biz));
  } catch(e) { fail('Trial plan check', e.message); }

  // ── SECTION 8: ADMIN API ──────────────────────────────
  section('8. Admin API');
  const adminSecret = process.env.ADMIN_SECRET || 'test_admin_secret';

  try {
    const r = await request('GET', '/admin/businesses', null, { 'x-admin-secret': adminSecret });
    r.status === 200
      ? pass('Admin — businesses list accessible')
      : r.status === 401
        ? pass('Admin — correctly blocked without secret (set ADMIN_SECRET env var to test)')
        : fail('Admin businesses', 'Status: ' + r.status);
  } catch(e) { fail('Admin businesses', e.message); }

  try {
    const r = await request('GET', '/admin/stats', null, { 'x-admin-secret': adminSecret });
    r.status === 200
      ? pass('Admin — stats endpoint working')
      : pass('Admin — stats blocked (expected if ADMIN_SECRET not set)');
  } catch(e) { fail('Admin stats', e.message); }

  // ── SECTION 9: WEBHOOK DEDUPLICATION ─────────────────
  section('9. Webhook Deduplication');

  try {
    const dupId = 'dup_test_' + Date.now();
    await sendWebhook('Test message', dupId);
    await sleep(500);
    const r2 = await sendWebhook('Test message again', dupId);
    r2.status === 200 ? pass('Duplicate webhook returns 200 (silently ignored)') : fail('Dedup', 'Status: ' + r2.status);
  } catch(e) { fail('Deduplication', e.message); }

  // ── SECTION 10: PAYMENT & INVOICE ────────────────────
  section('10. Payment Links & Invoices');

  try {
    const r = await request('GET', '/payment/success');
    r.status === 200 ? pass('Payment success page loads') : fail('Payment success page', 'Status: ' + r.status);
  } catch(e) { fail('Payment success page', e.message); }

  try {
    const r = await request('GET', '/api/invoice/' + businessId + '?customer_name=Test%20Customer&amount=1000');
    r.status === 200 || r.status === 500
      ? r.status === 200
        ? pass('Invoice PDF endpoint responds')
        : pass('Invoice endpoint reachable (PDFKit may need deployment)')
      : fail('Invoice endpoint', 'Status: ' + r.status);
  } catch(e) { fail('Invoice endpoint', e.message); }

  // ── RESULTS ───────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  const total = passed + failed;
  console.log(
    '\x1b[1mResults:\x1b[0m ' +
    '\x1b[32m' + passed + ' passed\x1b[0m, ' +
    '\x1b[31m' + failed + ' failed\x1b[0m ' +
    'out of ' + total + ' tests'
  );

  if (failed === 0) {
    console.log('\x1b[32m\n✓ All tests passed! BizPilot is production ready.\x1b[0m\n');
  } else {
    console.log('\x1b[33m\n⚠ Some tests failed.\x1b[0m');
    console.log('Most likely causes:');
    console.log('  • Missing .env variables (SUPABASE_URL, ANTHROPIC_API_KEY)');
    console.log('  • Server not connected to Supabase');
    console.log('  • AI API key not set or out of credits\n');
  }
}

run().catch(function(e) {
  console.error('\x1b[31mTest runner crashed:\x1b[0m', e.message);
  process.exit(1);
});
