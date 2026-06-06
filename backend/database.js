require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function normalizePhone(phone) {
  if (!phone) return null;
  let c = String(phone).replace(/\D/g, '');
  if (c.length === 10) c = '91' + c;
  return c;
}

async function getBusinessByPhone(phone) {
  try {
    const { data, error } = await supabase.from('businesses').select('*').eq('owner_phone', normalizePhone(phone)).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  } catch (e) { logger.error('getBusinessByPhone: ' + e.message); return null; }
}

async function createBusiness(d) {
  const { data, error } = await supabase.from('businesses').insert(d).select().single();
  if (error) throw error;
  return data;
}

async function updateBusiness(id, updates) {
  const { data, error } = await supabase.from('businesses').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function saveConversation(d) {
  const { data, error } = await supabase.from('conversations').insert(d).select().single();
  if (error) { logger.error('saveConversation: ' + error.message); return null; }
  return data;
}

async function isMessageProcessed(msgId) {
  if (!msgId) return false;
  const { data } = await supabase.from('conversations').select('id').eq('whatsapp_message_id', msgId).single();
  return !!data;
}

async function getRecentConversations(businessId, limit) {
  limit = limit || 10;
  const { data } = await supabase.from('conversations').select('direction, message_text, created_at, intent').eq('business_id', businessId).order('created_at', { ascending: false }).limit(limit);
  return (data || []).reverse();
}

async function recordTransaction(d) {
  const { data, error } = await supabase.from('transactions').insert(d).select().single();
  if (error) { logger.error('recordTransaction: ' + error.message); return null; }
  return data;
}

async function getTransactionSummary(businessId, period) {
  period = period || 'today';
  const now = new Date();
  let startDate;
  if (period === 'week') {
    const d = new Date(now - 7 * 864e5);
    startDate = d.toISOString().split('T')[0];
  } else if (period === 'month') {
    startDate = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-01';
  } else {
    startDate = now.toISOString().split('T')[0];
  }
  const { data } = await supabase.from('transactions').select('*').eq('business_id', businessId).gte('transaction_date', startDate);
  const txns = data || [];
  return {
    total_sales: txns.filter(function(t){return t.transaction_type==='sale';}).reduce(function(s,t){return s+Number(t.amount);},0),
    total_purchases: txns.filter(function(t){return t.transaction_type==='purchase';}).reduce(function(s,t){return s+Number(t.amount);},0),
    total_expenses: txns.filter(function(t){return t.transaction_type==='expense';}).reduce(function(s,t){return s+Number(t.amount);},0),
    total_received: txns.filter(function(t){return t.transaction_type==='payment_received';}).reduce(function(s,t){return s+Number(t.amount);},0),
    total_paid: txns.filter(function(t){return t.transaction_type==='payment_made';}).reduce(function(s,t){return s+Number(t.amount);},0),
    sale_count: txns.filter(function(t){return t.transaction_type==='sale';}).length,
    period: period, start_date: startDate, recent: txns.slice(-5)
  };
}

async function getOrCreateCustomer(businessId, name, phone) {
  if (!name) return null;
  try {
    if (phone) {
      const { data } = await supabase.from('customers').select('*').eq('business_id', businessId).eq('phone', normalizePhone(phone)).single();
      if (data) return data;
    }
    const keyword = name.split(' ')[0];
    const { data: byName } = await supabase.from('customers').select('*').eq('business_id', businessId).ilike('name', '%' + keyword + '%').limit(1).single();
    if (byName) return byName;
    const { data: created } = await supabase.from('customers').insert({ business_id: businessId, name: name, phone: phone ? normalizePhone(phone) : null }).select().single();
    return created;
  } catch (e) { return null; }
}

async function updateCustomerOutstanding(customerId, change) {
  const { data } = await supabase.from('customers').select('outstanding_balance').eq('id', customerId).single();
  if (!data) return;
  await supabase.from('customers').update({ outstanding_balance: Math.max(0, Number(data.outstanding_balance) + change) }).eq('id', customerId);
}

async function getOutstandingCustomers(businessId) {
  const { data } = await supabase.from('customers').select('id, name, outstanding_balance, phone').eq('business_id', businessId).gt('outstanding_balance', 0).order('outstanding_balance', { ascending: false });
  return data || [];
}

async function getOrCreateSupplier(businessId, name) {
  if (!name) return null;
  try {
    const keyword = name.split(' ')[0];
    const { data } = await supabase.from('suppliers').select('*').eq('business_id', businessId).ilike('name', '%' + keyword + '%').limit(1).single();
    if (data) return data;
    const { data: created } = await supabase.from('suppliers').insert({ business_id: businessId, name: name }).select().single();
    return created;
  } catch (e) { return null; }
}

async function updateSupplierOutstanding(supplierId, change) {
  const { data } = await supabase.from('suppliers').select('outstanding_balance').eq('id', supplierId).single();
  if (!data) return;
  await supabase.from('suppliers').update({ outstanding_balance: Math.max(0, Number(data.outstanding_balance) + change) }).eq('id', supplierId);
}

async function getOrCreateProduct(businessId, name, unit) {
  unit = unit || 'strip';
  if (!name) return null;
  try {
    const keyword = name.split(' ')[0];
    const { data } = await supabase.from('products').select('*').eq('business_id', businessId).ilike('name', '%' + keyword + '%').eq('is_active', true).limit(1).single();
    if (data) return data;
    const { data: created } = await supabase.from('products').insert({ business_id: businessId, name: name, unit: unit, current_stock: 0, minimum_stock: 10 }).select().single();
    return created;
  } catch (e) { return null; }
}

async function updateProductStock(productId, change) {
  const { data } = await supabase.from('products').select('current_stock').eq('id', productId).single();
  if (!data) return;
  await supabase.from('products').update({ current_stock: Math.max(0, Number(data.current_stock) + change) }).eq('id', productId);
}

async function getLowStockItems(businessId) {
  const { data } = await supabase.from('products').select('name, current_stock, minimum_stock, unit').eq('business_id', businessId).eq('is_active', true);
  return (data || []).filter(function(p){ return Number(p.current_stock) <= Number(p.minimum_stock); });
}

async function getExpiringSoonItems(businessId, days) {
  days = days || 60;
  const future = new Date(); future.setDate(future.getDate() + days);
  const { data } = await supabase.from('products').select('name, current_stock, unit, expiry_date, batch_number').eq('business_id', businessId).eq('is_active', true).not('expiry_date', 'is', null).lte('expiry_date', future.toISOString().split('T')[0]).gt('current_stock', 0).order('expiry_date');
  return data || [];
}

async function getInventory(businessId) {
  const { data } = await supabase.from('products').select('*').eq('business_id', businessId).eq('is_active', true).order('name');
  return data || [];
}

async function getBusinessContext(businessId) {
  try {
    const results = await Promise.all([
      getTransactionSummary(businessId, 'today'),
      getOutstandingCustomers(businessId),
      getLowStockItems(businessId),
      getExpiringSoonItems(businessId, 60),
      getRecentConversations(businessId, 8)
    ]);
    const summary = results[0]; const outstanding = results[1]; const lowStock = results[2]; const expiring = results[3]; const conversations = results[4];
    return {
      todaySales: summary.total_sales,
      todayExpenses: summary.total_expenses,
      totalReceivables: outstanding.reduce(function(s,c){ return s + Number(c.outstanding_balance); }, 0),
      topOutstanding: outstanding.slice(0, 5),
      lowStockItems: lowStock.slice(0, 5),
      expiringItems: expiring.slice(0, 5),
      recentTransactions: summary.recent || [],
      recentConversations: conversations
    };
  } catch (e) {
    logger.error('getBusinessContext: ' + e.message);
    return { todaySales:0, todayExpenses:0, totalReceivables:0, topOutstanding:[], lowStockItems:[], expiringItems:[], recentTransactions:[], recentConversations:[] };
  }
}

async function getAllActiveBusinesses() {
  const { data } = await supabase.from('businesses').select('*').eq('subscription_active', true).eq('onboarding_complete', true);
  return data || [];
}

module.exports = {
  supabase, normalizePhone,
  getBusinessByPhone, createBusiness, updateBusiness,
  saveConversation, isMessageProcessed, getRecentConversations,
  recordTransaction, getTransactionSummary,
  getOrCreateCustomer, updateCustomerOutstanding, getOutstandingCustomers,
  getOrCreateSupplier, updateSupplierOutstanding,
  getOrCreateProduct, updateProductStock, getLowStockItems, getExpiringSoonItems, getInventory,
  getBusinessContext, getAllActiveBusinesses
};
