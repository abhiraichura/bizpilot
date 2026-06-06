const cron = require('node-cron');
const db = require('./database');
const ai = require('./ai-engine');
const whatsapp = require('./whatsapp');
const logger = require('./logger');
const subscription = require('./subscription');

function initializeScheduler() {
  // Daily summary — 9:00 AM IST = 3:30 AM UTC
  cron.schedule('30 3 * * *', async function() {
    logger.info('Running daily summary job');
    try {
      const businesses = await db.getAllActiveBusinesses();
      for (const biz of businesses) {
        try {
          const today = new Date().toISOString().split('T')[0];
          const summary = await db.getTransactionSummary(biz.id, 'today');
          const lowStock = await db.getLowStockItems(biz.id);
          const expiring = await db.getExpiringSoonItems(biz.id, 30);
          const outstanding = await db.getOutstandingCustomers(biz.id);
          const overdueCustomers = outstanding.filter(function(c){ return Number(c.outstanding_balance) > 0; });
          const snapshot = { total_sales: summary.total_sales, total_expenses: summary.total_expenses, net_revenue: summary.total_sales - summary.total_expenses };
          const alerts = { lowStock, expiring, overdueCustomers };
          const msg = await ai.generateDailySummary(biz, snapshot, alerts);
          await whatsapp.sendMessage(biz.owner_phone, msg);
          logger.info('Summary sent to ' + biz.owner_phone);
        } catch(e) { logger.error('Summary failed for ' + biz.id + ': ' + e.message); }
      }
    } catch(e) { logger.error('Summary job error: ' + e.message); }
  });

  // Payment reminders — 11:00 AM IST = 5:30 AM UTC
  cron.schedule('30 5 * * *', async function() {
    logger.info('Running payment reminder job');
    try {
      const businesses = await db.getAllActiveBusinesses();
      for (const biz of businesses) {
        try {
          const outstanding = await db.getOutstandingCustomers(biz.id);
          for (const customer of outstanding) {
            const days = 30; // simplified — in production calculate actual days
            if (Number(customer.outstanding_balance) > 0) {
              const msg = await ai.generatePaymentReminder(biz, customer, days, customer.outstanding_balance);
              // Send reminder to business owner (not customer) with customer info
              const ownerMsg = '⚠️ *Payment Reminder*\n' + customer.name + ' ka outstanding: ₹' + customer.outstanding_balance + '\nSuggested reminder:\n\n' + msg;
              await whatsapp.sendMessage(biz.owner_phone, ownerMsg);
            }
          }
        } catch(e) { logger.error('Reminder failed for ' + biz.id + ': ' + e.message); }
      }
    } catch(e) { logger.error('Reminder job error: ' + e.message); }
  });

  // Trial reminders — 10:00 AM IST = 4:30 AM UTC
  cron.schedule('30 4 * * *', async function() {
    logger.info('Running trial reminder job');
    await subscription.sendTrialReminders(db, whatsapp);
  });

  logger.info('Scheduler initialized');
}

module.exports = { initializeScheduler };
