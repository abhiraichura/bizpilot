require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');
const db = require('./database');
const ai = require('./ai-engine');
const actions = require('./action-executor');
const whatsapp = require('./whatsapp');
const onboarding = require('./onboarding');
const scheduler = require('./scheduler');
const payments = require('./payments');
const invoiceGen = require('./invoice-generator');
const subscription = require('./subscription');
const errorHandler = require('./error-handler');
const tally = require('./tally');
const notifications = require('./notifications');

const app = express();
errorHandler.setupProcessHandlers();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// ── HEALTH CHECK ──────────────────────────────────────────
app.get('/health', function(req, res) {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ── WHATSAPP WEBHOOK VERIFICATION ────────────────────────
app.get('/webhook/whatsapp', function(req, res) {
  const challenge = req.query['hub.challenge'];
  if (challenge) return res.send(challenge);
  res.sendStatus(200);
});

// ── MAIN WHATSAPP WEBHOOK ─────────────────────────────────
app.post('/webhook/whatsapp', async function(req, res) {
  // Always respond 200 immediately to Wati
  res.sendStatus(200);

  try {
    const parsed = whatsapp.parseWebhook(req.body);
    if (!parsed) return;

    const { phone, messageId, type, text, mediaUrl } = parsed;
    if (!phone) return;

    // Deduplicate
    if (messageId && await db.isMessageProcessed(messageId)) {
      logger.info('Duplicate message ' + messageId);
      return;
    }

    // Get message text
    let messageText = text || '';
    if (type === 'voice' && mediaUrl) {
      const transcribed = await whatsapp.transcribeVoice(mediaUrl);
      if (!transcribed) {
        await whatsapp.sendMessage(phone, 'Voice note samajh nahi aaya. Please text mein likhein.');
        return;
      }
      messageText = transcribed;
    }

    if (!messageText.trim()) return;

    // Get business
    const business = await db.getBusinessByPhone(phone);

    // Handle onboarding
    if (onboarding.isInOnboarding(business)) {

      // Special case: GSTIN step
      if (business && business.onboarding_step === 'gstin') {
        await onboarding.handleGstinStep(phone, messageText, business);
      } else {
        await onboarding.handleOnboarding(phone, messageText, business);
      }
      return;
    }

    // Subscription check
    if (!subscription.isSubscriptionActive(business)) {
      const msg = subscription.getStatusMessage(business);
      if (msg) await whatsapp.sendMessage(phone, msg);
      return;
    }

    // Trial reminder on first message of day if expiring soon
    const daysLeft = subscription.trialDaysRemaining(business);
    if (daysLeft > 0 && daysLeft <= 3) {
      const reminderMsg = subscription.getStatusMessage(business);
      if (reminderMsg) await whatsapp.sendMessage(phone, reminderMsg);
    }

    // Save inbound message
    await db.saveConversation({
      business_id: business.id,
      direction: 'inbound',
      message_text: messageText,
      message_type: type,
      whatsapp_message_id: messageId,
      processed: false
    });

    // Get business context for AI
    const context = await db.getBusinessContext(business.id);

    // Process with AI
    const aiResult = await ai.processMessage(messageText, business, context);

    // Execute actions and capture results
    const actionResults = await actions.executeActions(business, aiResult.actions);

    // Build final message - append payment links or invoice info if generated
    let finalMessage = aiResult.message;
    for (const result of actionResults) {
      if (result.success && result.result) {
        if (result.action === 'SEND_PAYMENT_LINK' && result.result.payment_link) {
          finalMessage += '\n\n💳 *Payment Link:*\n' + result.result.payment_link;
        }
        if (result.action === 'GENERATE_INVOICE' && result.result.invoice_number) {
          finalMessage += '\n\n📄 Invoice ' + result.result.invoice_number + ' generate ho gaya.';
          if (result.result.pdf_generated) finalMessage += ' Customer ko bhej diya gaya.';
        }
      }
    }

    // Save outbound message
    await db.saveConversation({
      business_id: business.id,
      direction: 'outbound',
      message_text: finalMessage,
      intent: aiResult.intent,
      actions_taken: aiResult.actions
    });

    // Send response
    await whatsapp.sendMessage(phone, finalMessage);

    logger.info('Processed: ' + phone + ' | ' + aiResult.intent);

  } catch(e) {
    logger.error('Webhook processing error: ' + e.message);
  }
});

// ── REST API ENDPOINTS ────────────────────────────────────

// Register business manually (for testing or admin)
app.post('/api/business/register', async function(req, res) {
  try {
    const { name, owner_name, phone, business_type, city, language } = req.body;
    if (!name || !owner_name || !phone) return res.status(400).json({ error: 'name, owner_name, phone required' });
    const existing = await db.getBusinessByPhone(phone);
    if (existing) return res.json({ business: existing, message: 'Already exists' });
    const business = await db.createBusiness({
      name, owner_name, owner_phone: db.normalizePhone(phone),
      business_type: business_type || 'medical_shop',
      city: city || 'Rajkot',
      language: language || 'hindi',
      onboarding_complete: true,
      onboarding_step: 99
    });
    res.json({ business, message: 'Created' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get business by UUID (for dashboard)
app.get('/api/business-by-id/:id', async function(req, res) {
  try {
    const { data, error } = await db.supabase.from('businesses').select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json({ business: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get business by phone
app.get('/api/business/:phone', async function(req, res) {
  try {
    const business = await db.getBusinessByPhone(req.params.phone);
    if (!business) return res.status(404).json({ error: 'Not found' });
    const summary = await db.getTransactionSummary(business.id, 'today');
    res.json({ business, summary });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Dashboard data
app.get('/api/dashboard/:businessId', async function(req, res) {
  try {
    const id = req.params.businessId;
    const [summary, outstanding, inventory, lowStock, expiring] = await Promise.all([
      db.getTransactionSummary(id, 'today'),
      db.getOutstandingCustomers(id),
      db.getInventory(id),
      db.getLowStockItems(id),
      db.getExpiringSoonItems(id, 60)
    ]);
    const { data: recentTxns } = await db.supabase.from('transactions').select('*').eq('business_id', id).order('created_at', { ascending: false }).limit(20);
    res.json({ summary, outstanding, inventory, lowStock, expiring, recentTransactions: recentTxns || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Transactions
app.get('/api/transactions/:businessId', async function(req, res) {
  try {
    const summary = await db.getTransactionSummary(req.params.businessId, req.query.period || 'today');
    const { data } = await db.supabase.from('transactions').select('*').eq('business_id', req.params.businessId).order('created_at', { ascending: false }).limit(50);
    res.json({ summary, transactions: data || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Inventory
app.get('/api/inventory/:businessId', async function(req, res) {
  try {
    const inventory = await db.getInventory(req.params.businessId);
    res.json({ inventory });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── START ─────────────────────────────────────────────────
app.use(errorHandler.expressErrorMiddleware);

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  logger.info('BizPilot server running on port ' + PORT);
  scheduler.initializeScheduler();
});

module.exports = app;

// ── RAZORPAY WEBHOOK ─────────────────────────────────────
app.post('/payment/webhook', async function(req, res) {
  try {
    const sig = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (secret && sig && !payments.verifyWebhookSignature(req.body, sig, secret)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body.event;
    if (event === 'payment.captured' || event === 'payment_link.paid') {
      const entity = req.body.payload.payment ? req.body.payload.payment.entity : null;
      if (entity) {
        logger.info('Payment captured: ' + entity.id + ' amount: ' + entity.amount / 100);
        // Find business by Razorpay notes if available and record transaction
        // Full implementation would match payment to business via notes field
      }
    }

    res.json({ status: 'ok' });
  } catch (e) {
    logger.error('Razorpay webhook: ' + e.message);
    res.json({ status: 'ok' }); // Always 200 to Razorpay
  }
});

// Payment success redirect page
app.get('/payment/success', function(req, res) {
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h1 style="color:#059669">✅ Payment Successful!</h1><p>Your payment has been received. You can close this page.</p></body></html>');
});

// Create payment link manually via API
app.post('/api/payment-link', async function(req, res) {
  try {
    const { business_id, customer_name, customer_phone, amount, description } = req.body;
    if (!business_id || !amount) return res.status(400).json({ error: 'business_id and amount required' });
    const { data: biz } = await db.supabase.from('businesses').select('name').eq('id', business_id).single();
    const link = await payments.createPaymentLink({
      amount, customerName: customer_name, customerPhone: customer_phone,
      description, businessName: biz ? biz.name : 'Business'
    });
    res.json({ link });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Generate and download invoice PDF
app.get('/api/invoice/:businessId', async function(req, res) {
  try {
    const { businessId } = req.params;
    const { customer_name, amount, items } = req.query;
    const { data: biz } = await db.supabase.from('businesses').select('*').eq('id', businessId).single();
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const invoiceData = {
      invoice_number: 'INV-' + Date.now().toString().slice(-6),
      invoice_date: new Date().toISOString().split('T')[0],
      total_amount: Number(amount) || 0,
      status: 'unpaid',
      customer_name: customer_name || 'Customer'
    };

    const parsedItems = items ? JSON.parse(items) : [];
    const pdfBuf = await invoiceGen.generateInvoicePDF(invoiceData, biz, null, parsedItems);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=Invoice-' + invoiceData.invoice_number + '.pdf');
    res.send(pdfBuf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});



// ── NOTIFICATIONS API ─────────────────────────────────────

// Send payment reminder to a specific customer
app.post('/api/notify/payment-reminder', async function(req, res) {
  try {
    const { business_id, customer_name, amount } = req.body;
    if (!business_id || !customer_name) return res.status(400).json({ error: 'business_id and customer_name required' });
    const { data: biz } = await db.supabase.from('businesses').select('*').eq('id', business_id).single();
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    const customer = await db.getOrCreateCustomer(business_id, customer_name);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const result = await notifications.sendPaymentReminder(biz, customer, amount || customer.outstanding_balance);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Send to all outstanding customers
app.post('/api/notify/bulk-reminder', async function(req, res) {
  try {
    const { business_id } = req.body;
    if (!business_id) return res.status(400).json({ error: 'business_id required' });
    const { data: biz } = await db.supabase.from('businesses').select('*').eq('id', business_id).single();
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    const customers = await db.getOutstandingCustomers(business_id);
    let sent = 0;
    for (const c of customers) {
      if (c.phone) {
        await notifications.sendPaymentReminder(biz, c, c.outstanding_balance);
        sent++;
        await new Promise(function(r){ setTimeout(r, 1200); });
      }
    }
    res.json({ sent, total: customers.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── TALLY INTEGRATION ─────────────────────────────────────

// Test Tally connection for a business
app.post('/api/tally/test', async function(req, res) {
  try {
    const { business_id, tally_url } = req.body;
    if (!business_id || !tally_url) return res.status(400).json({ error: 'business_id and tally_url required' });
    const result = await tally.testConnection(tally_url);
    if (result.connected) {
      // Save tally_url to business settings
      const { data: biz } = await db.supabase.from('businesses').select('settings').eq('id', business_id).single();
      const settings = biz ? (biz.settings || {}) : {};
      settings.tally_url = tally_url;
      await db.supabase.from('businesses').update({ settings }).eq('id', business_id);
    }
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Manually sync a transaction to Tally
app.post('/api/tally/sync', async function(req, res) {
  try {
    const { business_id, transaction_id } = req.body;
    const { data: biz } = await db.supabase.from('businesses').select('*').eq('id', business_id).single();
    if (!biz || !biz.settings || !biz.settings.tally_url) return res.status(400).json({ error: 'Tally not configured for this business' });
    const { data: txn } = await db.supabase.from('transactions').select('*').eq('id', transaction_id).single();
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });
    const voucher = tally.mapTransactionToVoucher(txn, biz);
    const result = await tally.pushToTally(biz.settings.tally_url, voucher);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get Tally config status for a business
app.get('/api/tally/status/:businessId', async function(req, res) {
  try {
    const { data: biz } = await db.supabase.from('businesses').select('settings, name').eq('id', req.params.businessId).single();
    if (!biz) return res.status(404).json({ error: 'Not found' });
    const tallyUrl = biz.settings && biz.settings.tally_url;
    res.json({ configured: !!tallyUrl, tally_url: tallyUrl || null, business_name: biz.name });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN API ─────────────────────────────────────────────
// Simple secret-key protected admin endpoints
// Set ADMIN_SECRET in your .env

function adminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// All businesses list
app.get('/admin/businesses', adminAuth, async function(req, res) {
  try {
    const { data } = await db.supabase.from('businesses').select('*').order('created_at', { ascending: false });
    res.json({ businesses: data || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Business stats summary
app.get('/admin/stats', adminAuth, async function(req, res) {
  try {
    const { data: businesses } = await db.supabase.from('businesses').select('id, name, business_type, created_at, subscription_active, onboarding_complete, city');
    const { data: txns } = await db.supabase.from('transactions').select('amount, transaction_type, created_at').gte('created_at', new Date(Date.now() - 30*864e5).toISOString());
    const total = (businesses || []).length;
    const active = (businesses || []).filter(function(b){ return b.subscription_active && b.onboarding_complete; }).length;
    const byType = {};
    (businesses || []).forEach(function(b){ byType[b.business_type] = (byType[b.business_type]||0)+1; });
    const monthSales = (txns || []).filter(function(t){ return t.transaction_type==='sale'; }).reduce(function(s,t){ return s+Number(t.amount); },0);
    res.json({ total_businesses: total, active_businesses: active, by_type: byType, month_sales_volume: monthSales, new_last_7_days: (businesses||[]).filter(function(b){ return new Date(b.created_at) > new Date(Date.now()-7*864e5); }).length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update business subscription
app.patch('/admin/business/:id', adminAuth, async function(req, res) {
  try {
    const { subscription_active, plan } = req.body;
    const updates = {};
    if (subscription_active !== undefined) updates.subscription_active = subscription_active;
    if (plan) updates.plan = plan;
    const { data, error } = await db.supabase.from('businesses').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ business: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Business activity log
app.get('/admin/business/:id/activity', adminAuth, async function(req, res) {
  try {
    const id = req.params.id;
    const [convs, txns] = await Promise.all([
      db.supabase.from('conversations').select('direction,message_text,intent,created_at').eq('business_id', id).order('created_at',{ascending:false}).limit(20),
      db.supabase.from('transactions').select('*').eq('business_id', id).order('created_at',{ascending:false}).limit(20)
    ]);
    res.json({ conversations: convs.data||[], transactions: txns.data||[] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
