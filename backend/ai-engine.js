require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('./logger');
const { getConfig } = require('./business-configs');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystemPrompt(business, context) {
  const config = getConfig(business.business_type);
  const state = JSON.stringify({
    today_sales: context.todaySales,
    today_expenses: context.todayExpenses,
    total_receivables: context.totalReceivables,
    top_outstanding: context.topOutstanding,
    low_stock_items: context.lowStockItems,
    expiring_items: context.expiringItems,
    recent_transactions: context.recentTransactions
  });

  return 'You are BizPilot, the AI business assistant for ' + business.name + ', owned by ' + business.owner_name + '.\n\n' +
    'BUSINESS: ' + config.name + ' ' + config.emoji + ' in ' + (business.city || 'India') + '\n' +
    'LANGUAGE: ' + business.language + '\n' +
    'GST: ' + (business.is_gst_registered ? 'Yes - ' + business.gstin : 'No') + '\n\n' +
    'BUSINESS CONTEXT:\n' + config.context + '\n\n' +
    'CURRENT STATE:\n' + state + '\n\n' +
    'RULES:\n' +
    '1. Respond ONLY with valid JSON — no markdown, no text outside JSON\n' +
    '2. Use same language as owner — Hindi/Gujarati/English/mixed naturally\n' +
    '3. Always confirm actions with exact numbers and rupee symbol ₹\n' +
    '4. For credit sales always mention new outstanding balance\n' +
    '5. For payments received always mention remaining balance\n' +
    '6. Make reasonable assumptions if unclear, confirm them in response\n' +
    '7. Be warm and conversational — like a trusted business assistant\n\n' +
    'RESPONSE FORMAT (always return exactly this JSON):\n' +
    '{"message":"your reply in owner language","intent":"sale|purchase|payment_received|payment_made|expense|inventory_query|outstanding_query|summary|staff|unclear","actions":[{"type":"ACTION","data":{}}]}\n\n' +
    'ACTIONS:\n' +
    'RECORD_SALE: {customer_name,customer_phone,payment_type:"cash|upi|credit",total_amount,items:[{product_name,quantity,unit,unit_price,gst_rate}],notes}\n' +
    'RECORD_PURCHASE: {supplier_name,payment_type:"cash|upi|credit",total_amount,items:[{product_name,quantity,unit,unit_price,expiry_date,batch_number}]}\n' +
    'RECORD_PAYMENT_RECEIVED: {customer_name,amount,payment_method:"cash|upi|cheque|bank",notes}\n' +
    'RECORD_PAYMENT_MADE: {supplier_name,amount,payment_method:"cash|upi|cheque|bank",notes}\n' +
    'RECORD_EXPENSE: {amount,category:"rent|electricity|salary|transport|misc",description,payment_method}\n' +
    'QUERY_INVENTORY: {product_name,query_type:"stock_level|expiry|low_stock|all"}\n' +
    'QUERY_OUTSTANDING: {party_name,party_type:"customer|supplier|all"}\n' +
    'QUERY_SUMMARY: {period:"today|week|month"}\n' +
    'UPDATE_INVENTORY: {product_name,new_quantity,unit}\n' +
    'NOTIFY_CUSTOMER: {customer_name,notification_type:"payment_reminder|order_ready",amount,order_details}\n' +
    'SEND_PAYMENT_LINK: {customer_name,customer_phone,amount,description}\n' +
    'GENERATE_INVOICE: {customer_name,total_amount,payment_type:"cash|credit",items:[{product_name,quantity,unit,unit_price,gst_rate}],send_to_customer:true,notes}\n' +
    'NO_ACTION: {}\n\n' +
    'PATTERNS FOR THIS BUSINESS TYPE:\n' +
    config.sample_messages.map(function(m,i){ return (i+1) + '. "' + m + '"'; }).join('\n') + '\n\n' +
    'EXTRA PATTERNS (all business types):\n' +
    '"Ramesh ko reminder bhejo" = NOTIFY_CUSTOMER type=payment_reminder\n' +
    '"City Hospital ko payment reminder do" = NOTIFY_CUSTOMER customer=City Hospital type=payment_reminder\n' +
    '"Ramesh ka order ready hai" = NOTIFY_CUSTOMER type=order_ready\n' +
    '"Ramesh ko payment link bhejo 5000 ka" = SEND_PAYMENT_LINK customer=Ramesh amount=5000\n' +
    '"City Hospital ka invoice banao 50 strips paracetamol 4750" = GENERATE_INVOICE with items send_to_customer=true\n' +
    '"Invoice bhejo Patel Traders ko 12000 ka" = GENERATE_INVOICE customer=Patel Traders total=12000\n' +
    '"Payment link 2500 for Sharma" = SEND_PAYMENT_LINK customer=Sharma amount=2500\n\n' +
    'GUJARATI PATTERNS:\n' +
    '"10 strips paracetamol vechai 120 cash" = RECORD_SALE cash 120\n' +
    '"Ramesh e 5000 aapya" = RECORD_PAYMENT_RECEIVED from Ramesh 5000\n' +
    '"Heera Pharma ne 15000 aapya" = RECORD_PAYMENT_MADE to Heera Pharma 15000\n' +
    '"Light bill 3200 bharyu" = RECORD_EXPENSE electricity 3200\n' +
    '"Paracetamol ketlu bachi gayu" = QUERY_INVENTORY paracetamol\n' +
    '"Aaj nu summary apo" = QUERY_SUMMARY today\n' +
    '"Kem chho, aaj no report apo" = QUERY_SUMMARY today\n' +
    '"Stock check karo" = QUERY_INVENTORY all\n' +
    '"Baki payment kaun kaun nu che" = QUERY_OUTSTANDING all customers';
}

async function processMessage(message, business, context) {
  const systemPrompt = buildSystemPrompt(business, context);
  const history = (context.recentConversations || []).slice(-8);
  const messages = history.map(function(c) {
    return { role: c.direction === 'inbound' ? 'user' : 'assistant', content: c.message_text };
  });
  messages.push({ role: 'user', content: message });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages
    });

    let text = response.content[0].text.trim();
    text = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();

    let parsed;
    try { parsed = JSON.parse(text); }
    catch(e) {
      logger.error('AI parse failed: ' + text.substring(0,100));
      return { message: 'Sorry, kuch problem aayi. Dobara try karein.', intent: 'unclear', actions: [{ type: 'NO_ACTION', data: {} }] };
    }

    return {
      message: parsed.message || 'Done.',
      intent: parsed.intent || 'unclear',
      actions: parsed.actions || [{ type: 'NO_ACTION', data: {} }]
    };
  } catch(e) {
    logger.error('processMessage error: ' + e.message);
    return { message: 'Network error. Please try again.', intent: 'unclear', actions: [{ type: 'NO_ACTION', data: {} }] };
  }
}

async function generateDailySummary(business, snapshot, alerts) {
  const config = getConfig(business.business_type);
  const prompt = 'Write a short morning WhatsApp business summary in ' + business.language + ' for ' + business.owner_name + ' of ' + business.name + ' (' + config.name + '). Yesterday: sales ₹' + snapshot.total_sales + ', expenses ₹' + snapshot.total_expenses + ', net ₹' + snapshot.net_revenue + '. Alerts: ' + alerts.lowStock.length + ' low stock, ' + alerts.expiring.length + ' expiring, ' + alerts.overdueCustomers.length + ' overdue payments. Be warm, use emojis, max 5 lines, one action tip. Return only message text.';
  try {
    const r = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 400, messages: [{ role: 'user', content: prompt }] });
    return r.content[0].text;
  } catch(e) {
    return '🙏 Good morning ' + business.owner_name + ' ji!\n\nKal ₹' + snapshot.total_sales + ' ki sales hui.\n' + (alerts.lowStock.length > 0 ? '⚠️ ' + alerts.lowStock.length + ' items low stock mein hain.\n' : '') + '\nAaj ka din accha ho! 💪';
  }
}

async function generatePaymentReminder(business, customer, daysOverdue, amount) {
  const prompt = 'Write a polite WhatsApp payment reminder in ' + business.language + ' from ' + business.name + ' to ' + customer.name + '. Amount: ₹' + amount + '. Days overdue: ' + daysOverdue + '. Respectful, mention amount, offer help if issue. Max 4 lines. Return only message.';
  try {
    const r = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 150, messages: [{ role: 'user', content: prompt }] });
    return r.content[0].text;
  } catch(e) {
    return 'Namaste ' + customer.name + ' ji, ' + business.name + ' se. Aapka ₹' + amount + ' ka payment ' + daysOverdue + ' din se pending hai. Koi problem ho toh batayein. Dhanyawad 🙏';
  }
}

module.exports = { processMessage, generateDailySummary, generatePaymentReminder };
