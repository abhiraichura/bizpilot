// ============================================================
// BIZPILOT SUBSCRIPTION GATE
// Checks trial status and blocks expired accounts
// ============================================================

require('dotenv').config();
const logger = require('./logger');

// ── CHECK IF BUSINESS CAN USE BIZPILOT ──────────────────
function isSubscriptionActive(business) {
  if (!business) return false;
  if (business.subscription_active === false) return false;

  // Check trial period
  if (business.plan === 'trial' && business.trial_ends_at) {
    const trialEnd = new Date(business.trial_ends_at);
    if (new Date() > trialEnd) return false;
  }

  return true;
}

// ── DAYS REMAINING IN TRIAL ──────────────────────────────
function trialDaysRemaining(business) {
  if (!business || !business.trial_ends_at) return 0;
  const now = new Date();
  const end = new Date(business.trial_ends_at);
  const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

// ── GET SUBSCRIPTION STATUS MESSAGE ─────────────────────
function getStatusMessage(business) {
  if (!business.subscription_active) {
    return '❌ *Aapka BizPilot subscription inactive hai.*\n\nReactivate karne ke liye apne BizPilot account manager se contact karein.';
  }

  if (business.plan === 'trial') {
    const days = trialDaysRemaining(business);
    if (days <= 0) {
      return '⏰ *Aapka 14-din ka free trial khatam ho gaya hai.*\n\nBizPilot continue karne ke liye subscribe karein.\n\nSubscription: ₹999/month\nWhatsApp karein: ' + (process.env.SUPPORT_PHONE || 'our support number');
    }
    if (days <= 3) {
      return '⚠️ *Trial khatam hone wala hai!*\n\nSirf ' + days + ' din bacha hai.\n\nAbhi subscribe karein: ₹999/month';
    }
  }

  return null; // Active, no message needed
}

// ── TRIAL REMINDER MESSAGES ──────────────────────────────
// Called by scheduler to send reminders on day 7, 12, 14
async function sendTrialReminders(db, whatsapp) {
  try {
    const { data: businesses } = await db.supabase
      .from('businesses')
      .select('*')
      .eq('plan', 'trial')
      .eq('subscription_active', true)
      .eq('onboarding_complete', true);

    for (const biz of (businesses || [])) {
      const days = trialDaysRemaining(biz);

      if (days === 7 || days === 3 || days === 1) {
        const msg = days === 7
          ? '👋 Hi ' + biz.owner_name + ' ji!\n\nBizPilot free trial mein 7 din bacha hai. Kaisa chal raha hai?\n\nSubscription sirf ₹999/month mein — abhi bhi sochne ka time hai! 😊'
          : days === 3
            ? '⏰ ' + biz.owner_name + ' ji, trial sirf 3 din mein khatam!\n\nBizPilot ko continue rakhne ke liye ₹999/month mein subscribe karein.\n\nSubscription link yahan se: ' + (process.env.APP_URL || '')
            : '🔔 Kal aapka trial khatam ho raha hai!\n\nAbhi subscribe karein aur apna sab data safe rakhein. ₹999/month.';

        await whatsapp.sendMessage(biz.owner_phone, msg);
        logger.info('Trial reminder sent to ' + biz.owner_phone + ' (' + days + ' days left)');
      }
    }
  } catch (e) {
    logger.error('sendTrialReminders: ' + e.message);
  }
}

module.exports = { isSubscriptionActive, trialDaysRemaining, getStatusMessage, sendTrialReminders };
