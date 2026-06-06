// ============================================================
// BIZPILOT CUSTOMER NOTIFICATION SYSTEM
// Lets business owners send WhatsApp messages to customers
// via BizPilot — payment reminders, order updates, offers
// ============================================================

require('dotenv').config();
const whatsapp = require('./whatsapp');
const db = require('./database');
const logger = require('./logger');

// ── SEND PAYMENT REMINDER TO CUSTOMER ───────────────────
// Called when owner says "Ramesh ko reminder bhejo"
async function sendPaymentReminder(business, customer, amount) {
  if (!customer.phone) {
    return { sent: false, reason: 'no_phone_number' };
  }

  const msgs = {
    hindi: '🙏 Namaste ' + customer.name + ' ji,\n\n' +
      business.name + ' ki taraf se yaad dila rahe hain ki aapka ₹' +
      Number(amount).toLocaleString('en-IN') + ' ka payment pending hai.\n\n' +
      'Suvidha anusaar payment kar dein. Dhanyawad! 🙏',
    gujarati: '🙏 Namaste ' + customer.name + ' ji,\n\n' +
      business.name + ' tarafthi yaad apavi che ke tamaro ₹' +
      Number(amount).toLocaleString('en-IN') + ' no payment baki che.\n\n' +
      'Suvidha pramane payment kari dejo. Aabhar! 🙏',
    english: '🙏 Dear ' + customer.name + ',\n\n' +
      'This is a gentle reminder from ' + business.name + ' that your payment of ₹' +
      Number(amount).toLocaleString('en-IN') + ' is pending.\n\n' +
      'Please make the payment at your earliest convenience. Thank you! 🙏'
  };

  const lang = business.language || 'hindi';
  const msg = msgs[lang] || msgs.hindi;

  try {
    await whatsapp.sendMessage(customer.phone, msg);
    logger.info('Payment reminder sent to customer ' + customer.name + ' at ' + customer.phone);
    return { sent: true, phone: customer.phone };
  } catch(e) {
    logger.error('Failed to send reminder to ' + customer.phone + ': ' + e.message);
    return { sent: false, reason: e.message };
  }
}

// ── SEND ORDER READY NOTIFICATION ───────────────────────
async function sendOrderReady(business, customer, orderDetails) {
  if (!customer.phone) return { sent: false, reason: 'no_phone_number' };

  const msgs = {
    hindi: '✅ ' + customer.name + ' ji,\n\n' +
      'Aapka order ' + business.name + ' mein ready hai!\n\n' +
      (orderDetails ? orderDetails + '\n\n' : '') +
      'Aake le jayein. Dhanyawad! 🙏',
    gujarati: '✅ ' + customer.name + ' ji,\n\n' +
      'Tamaro order ' + business.name + ' ma ready che!\n\n' +
      (orderDetails ? orderDetails + '\n\n' : '') +
      'Aavi ne le jao. Aabhar! 🙏',
    english: '✅ Dear ' + customer.name + ',\n\n' +
      'Your order at ' + business.name + ' is ready for pickup!\n\n' +
      (orderDetails ? orderDetails + '\n\n' : '') +
      'Please collect at your convenience. Thank you! 🙏'
  };

  const lang = business.language || 'hindi';
  const msg = msgs[lang] || msgs.hindi;

  try {
    await whatsapp.sendMessage(customer.phone, msg);
    return { sent: true };
  } catch(e) {
    return { sent: false, reason: e.message };
  }
}

// ── SEND BULK MESSAGE TO ALL CUSTOMERS ──────────────────
// Owner says "Sab customers ko Diwali wish karo"
async function sendBulkMessage(business, customers, message) {
  const results = { sent: 0, failed: 0, skipped: 0 };

  for (const customer of customers) {
    if (!customer.phone) { results.skipped++; continue; }

    // Add 1 second delay between messages to avoid WhatsApp spam detection
    await new Promise(function(r) { setTimeout(r, 1200); });

    try {
      const personalised = message
        .replace('{name}', customer.name)
        .replace('{business}', business.name);
      await whatsapp.sendMessage(customer.phone, personalised);
      results.sent++;
    } catch(e) {
      logger.error('Bulk send failed for ' + customer.phone + ': ' + e.message);
      results.failed++;
    }
  }

  logger.info('Bulk message: sent=' + results.sent + ' failed=' + results.failed + ' skipped=' + results.skipped);
  return results;
}

// ── PROCESS NOTIFICATION INTENT FROM AI ─────────────────
// Called when AI detects the owner wants to notify a customer
async function processNotificationIntent(business, intent, data) {
  if (intent === 'notify_payment_reminder') {
    const customer = await db.getOrCreateCustomer(business.id, data.customer_name);
    if (!customer) return { error: 'Customer not found' };
    return sendPaymentReminder(business, customer, data.amount || customer.outstanding_balance);
  }

  if (intent === 'notify_order_ready') {
    const customer = await db.getOrCreateCustomer(business.id, data.customer_name);
    if (!customer) return { error: 'Customer not found' };
    return sendOrderReady(business, customer, data.order_details);
  }

  if (intent === 'notify_bulk') {
    const customers = await db.getOutstandingCustomers(business.id);
    if (!customers.length) return { error: 'No customers found' };
    return sendBulkMessage(business, customers, data.message);
  }

  return { error: 'Unknown notification intent' };
}

module.exports = {
  sendPaymentReminder,
  sendOrderReady,
  sendBulkMessage,
  processNotificationIntent
};
