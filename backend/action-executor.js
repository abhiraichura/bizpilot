const db = require('./database');
const logger = require('./logger');
const tally = require('./tally');

async function executeActions(business, actions) {
  const results = [];
  for (const action of (actions || [])) {
    try {
      const result = await executeOne(business, action);
      results.push({ type: action.type, success: true, result });
    } catch(e) {
      logger.error('Action failed ' + action.type + ': ' + e.message);
      results.push({ type: action.type, success: false, error: e.message });
    }
  }
  return results;
}

async function executeOne(business, action) {
  const d = action.data || {};
  const today = new Date().toISOString().split('T')[0];

  if (action.type === 'RECORD_SALE') {
    let customerId = null;
    if (d.payment_type === 'credit' && d.customer_name) {
      const customer = await db.getOrCreateCustomer(business.id, d.customer_name, d.customer_phone);
      if (customer) { customerId = customer.id; await db.updateCustomerOutstanding(customer.id, d.total_amount); }
    }
    const desc = d.items && d.items.length ? d.items.map(function(i){ return i.quantity + ' ' + (i.unit||'') + ' ' + i.product_name; }).join(', ') : 'Sale';
    const saleTxn = await db.recordTransaction({ business_id: business.id, transaction_type: 'sale', amount: d.total_amount, direction: 'in', description: desc, customer_id: customerId, payment_method: d.payment_type || 'cash', transaction_date: today, notes: d.notes || null });
    // Push to Tally if configured
    if (business.settings && business.settings.tally_url && saleTxn) {
      const voucher = tally.mapTransactionToVoucher(Object.assign({}, saleTxn, { customer_name: d.customer_name }), business);
      tally.pushToTally(business.settings.tally_url, voucher).catch(function(e){ logger.error('Tally sync failed: ' + e.message); });
    }
    if (d.items) {
      for (const item of d.items) {
        const product = await db.getOrCreateProduct(business.id, item.product_name, item.unit);
        if (product) await db.updateProductStock(product.id, -item.quantity);
      }
    }
    return { recorded: true };

  } else if (action.type === 'RECORD_PURCHASE') {
    let supplierId = null;
    if (d.supplier_name) {
      const supplier = await db.getOrCreateSupplier(business.id, d.supplier_name);
      if (supplier) {
        supplierId = supplier.id;
        if (d.payment_type === 'credit') await db.updateSupplierOutstanding(supplier.id, d.total_amount);
      }
    }
    const desc = 'Purchase from ' + (d.supplier_name || 'supplier');
    await db.recordTransaction({ business_id: business.id, transaction_type: 'purchase', amount: d.total_amount, direction: 'out', description: desc, supplier_id: supplierId, payment_method: d.payment_type || 'cash', transaction_date: today });
    if (d.items) {
      for (const item of d.items) {
        const product = await db.getOrCreateProduct(business.id, item.product_name, item.unit);
        if (product) {
          await db.updateProductStock(product.id, item.quantity);
          if (item.expiry_date || item.batch_number) {
            await db.supabase.from('products').update({ expiry_date: item.expiry_date || null, batch_number: item.batch_number || null, purchase_price: item.unit_price || 0 }).eq('id', product.id);
          }
        }
      }
    }
    return { recorded: true };

  } else if (action.type === 'RECORD_PAYMENT_RECEIVED') {
    let customerId = null;
    if (d.customer_name) {
      const customer = await db.getOrCreateCustomer(business.id, d.customer_name);
      if (customer) { customerId = customer.id; await db.updateCustomerOutstanding(customer.id, -d.amount); }
    }
    await db.recordTransaction({ business_id: business.id, transaction_type: 'payment_received', amount: d.amount, direction: 'in', description: 'Payment from ' + (d.customer_name || 'customer'), customer_id: customerId, payment_method: d.payment_method || 'cash', transaction_date: today, notes: d.notes || null });
    return { recorded: true };

  } else if (action.type === 'RECORD_PAYMENT_MADE') {
    let supplierId = null;
    if (d.supplier_name) {
      const supplier = await db.getOrCreateSupplier(business.id, d.supplier_name);
      if (supplier) { supplierId = supplier.id; await db.updateSupplierOutstanding(supplier.id, -d.amount); }
    }
    await db.recordTransaction({ business_id: business.id, transaction_type: 'payment_made', amount: d.amount, direction: 'out', description: 'Payment to ' + (d.supplier_name || 'supplier'), supplier_id: supplierId, payment_method: d.payment_method || 'cash', transaction_date: today, notes: d.notes || null });
    return { recorded: true };

  } else if (action.type === 'RECORD_EXPENSE') {
    await db.recordTransaction({ business_id: business.id, transaction_type: 'expense', amount: d.amount, direction: 'out', description: d.description || 'Expense', payment_method: d.payment_method || 'cash', category: d.category || 'misc', transaction_date: today });
    return { recorded: true };

  } else if (action.type === 'UPDATE_INVENTORY') {
    const product = await db.getOrCreateProduct(business.id, d.product_name, d.unit);
    if (product) await db.supabase.from('products').update({ current_stock: d.new_quantity }).eq('id', product.id);
    return { updated: true };

  } else if (action.type === 'NOTIFY_CUSTOMER') {
    const notif = require('./notifications');
    const customer = d.customer_name ? await db.getOrCreateCustomer(business.id, d.customer_name) : null;
    if (!customer) return { sent: false, reason: 'customer_not_found' };
    if (d.notification_type === 'order_ready') {
      return await notif.sendOrderReady(business, customer, d.order_details);
    }
    return await notif.sendPaymentReminder(business, customer, d.amount || customer.outstanding_balance);

  } else if (action.type === 'SEND_PAYMENT_LINK') {
    const pay = require('./payments');
    const customer = d.customer_name ? await db.getOrCreateCustomer(business.id, d.customer_name, d.customer_phone) : null;
    const link = await pay.createPaymentLink({
      amount: d.amount,
      customerName: d.customer_name,
      customerPhone: customer ? customer.phone : d.customer_phone,
      description: d.description || ('Payment to ' + business.name),
      businessName: business.name
    });
    return { payment_link: link.shortUrl, amount: d.amount };

  } else if (action.type === 'GENERATE_INVOICE') {
    const ig = require('./invoice-generator');
    const customer = d.customer_name ? await db.getOrCreateCustomer(business.id, d.customer_name) : null;
    const invoiceData = {
      invoice_number: 'INV-' + Date.now().toString().slice(-6),
      invoice_date: new Date().toISOString().split('T')[0],
      total_amount: d.total_amount || 0,
      status: d.payment_type === 'cash' ? 'paid' : 'unpaid',
      customer_name: d.customer_name,
      notes: d.notes || null
    };
    const pdfBuf = await ig.generateInvoicePDF(invoiceData, business, customer, d.items || []);
    await db.recordTransaction({
      business_id: business.id, transaction_type: 'sale',
      amount: d.total_amount || 0, direction: 'in',
      description: 'Invoice ' + invoiceData.invoice_number + ' — ' + (d.customer_name || 'customer'),
      payment_method: d.payment_type || 'credit', transaction_date: today
    });
    if (customer && customer.phone && d.send_to_customer) {
      await ig.sendInvoiceWhatsApp(pdfBuf, customer.phone, invoiceData.invoice_number, business.name);
    }
    return { invoice_number: invoiceData.invoice_number, pdf_generated: true };
  }

  return { skipped: true };
}

module.exports = { executeActions };
