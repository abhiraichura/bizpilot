// ============================================================
// BIZPILOT INVOICE PDF GENERATOR
// Generates GST-compliant invoices as PDF
// Returns a Buffer that can be sent via WhatsApp
// ============================================================

require('dotenv').config();
const PDFDocument = require('pdfkit');
const logger = require('./logger');

// ── GENERATE INVOICE PDF ─────────────────────────────────
function generateInvoicePDF(invoice, business, customer, items) {
  return new Promise(function(resolve, reject) {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];

      doc.on('data', function(chunk) { chunks.push(chunk); });
      doc.on('end', function() { resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);

      const W = 595.28; // A4 width in points
      const green = '#064e3b';
      const lightGreen = '#f0fdf4';
      const gray = '#6b7280';
      const dark = '#1f2937';

      // ── HEADER ──────────────────────────────────────
      doc.rect(0, 0, W, 110).fill(green);

      doc.fillColor('#ffffff')
         .fontSize(22).font('Helvetica-Bold')
         .text('BizPilot', 50, 30);

      doc.fontSize(9).font('Helvetica')
         .text('AI Business Assistant', 50, 56);

      // Invoice label on right
      doc.fontSize(20).font('Helvetica-Bold')
         .text('INVOICE', W - 160, 30, { width: 110, align: 'right' });

      doc.fontSize(9).font('Helvetica')
         .text('# ' + (invoice.invoice_number || 'INV-0001'), W - 160, 58, { width: 110, align: 'right' });

      doc.fillColor(dark);

      // ── BUSINESS INFO ────────────────────────────────
      let y = 130;

      doc.fontSize(13).font('Helvetica-Bold').fillColor(dark)
         .text(business.name, 50, y);
      y += 18;

      doc.fontSize(9).font('Helvetica').fillColor(gray);
      if (business.city) { doc.text(business.city + ', ' + (business.state || 'Gujarat'), 50, y); y += 14; }
      if (business.owner_name) { doc.text('Owner: ' + business.owner_name, 50, y); y += 14; }
      if (business.is_gst_registered && business.gstin) {
        doc.fillColor(dark).font('Helvetica-Bold').text('GSTIN: ' + business.gstin, 50, y);
        y += 14;
      }

      // ── INVOICE META (right side) ────────────────────
      const metaY = 130;
      doc.fillColor(gray).font('Helvetica').fontSize(9);
      doc.text('Invoice Date:', W - 220, metaY, { width: 80 });
      doc.fillColor(dark).font('Helvetica-Bold')
         .text(formatDate(invoice.invoice_date || new Date()), W - 130, metaY, { width: 80 });

      if (invoice.due_date) {
        doc.fillColor(gray).font('Helvetica')
           .text('Due Date:', W - 220, metaY + 16, { width: 80 });
        doc.fillColor('#dc2626').font('Helvetica-Bold')
           .text(formatDate(invoice.due_date), W - 130, metaY + 16, { width: 80 });
      }

      doc.fillColor(gray).font('Helvetica')
         .text('Status:', W - 220, metaY + 32, { width: 80 });

      const statusColors = { paid: '#16a34a', unpaid: '#dc2626', partial: '#d97706', draft: '#6b7280' };
      const statusColor = statusColors[invoice.status] || '#6b7280';
      doc.fillColor(statusColor).font('Helvetica-Bold')
         .text((invoice.status || 'UNPAID').toUpperCase(), W - 130, metaY + 32, { width: 80 });

      // ── DIVIDER ──────────────────────────────────────
      y = Math.max(y, metaY + 60) + 20;
      doc.moveTo(50, y).lineTo(W - 50, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      y += 20;

      // ── BILL TO ──────────────────────────────────────
      doc.fillColor(gray).font('Helvetica').fontSize(9)
         .text('BILL TO', 50, y);
      y += 14;

      doc.fillColor(dark).font('Helvetica-Bold').fontSize(11)
         .text(customer ? customer.name : (invoice.customer_name || 'Walk-in Customer'), 50, y);
      y += 16;

      if (customer && customer.phone) {
        doc.fillColor(gray).font('Helvetica').fontSize(9)
           .text(customer.phone, 50, y);
        y += 14;
      }

      y += 16;

      // ── ITEMS TABLE ──────────────────────────────────
      // Table header
      const colX = { item: 50, qty: 310, rate: 370, gst: 430, total: 490 };
      const tableHeaderY = y;

      doc.rect(50, tableHeaderY, W - 100, 22).fill('#1f2937');

      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
      doc.text('ITEM', colX.item + 4, tableHeaderY + 7, { width: 250 });
      doc.text('QTY', colX.qty, tableHeaderY + 7, { width: 55, align: 'right' });
      doc.text('RATE', colX.rate, tableHeaderY + 7, { width: 55, align: 'right' });
      doc.text('GST%', colX.gst, tableHeaderY + 7, { width: 50, align: 'right' });
      doc.text('TOTAL', colX.total, tableHeaderY + 7, { width: W - 50 - colX.total, align: 'right' });

      y = tableHeaderY + 22;

      // Table rows
      const tableItems = items && items.length ? items : [{
        product_name: invoice.description || 'Services/Goods',
        quantity: 1,
        unit: 'piece',
        unit_price: invoice.total_amount,
        gst_rate: 0,
        total_price: invoice.total_amount
      }];

      let subtotal = 0;
      let totalGst = 0;

      tableItems.forEach(function(item, idx) {
        const rowH = 22;
        const rowBg = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
        doc.rect(50, y, W - 100, rowH).fill(rowBg);

        const itemTotal = Number(item.total_price) || (Number(item.quantity) * Number(item.unit_price));
        const itemGst = Number(item.gst_amount) || (itemTotal * Number(item.gst_rate || 0) / 100);
        subtotal += itemTotal;
        totalGst += itemGst;

        doc.fillColor(dark).font('Helvetica').fontSize(8);
        doc.text(item.product_name || 'Item', colX.item + 4, y + 7, { width: 248 });
        doc.text(Number(item.quantity) + ' ' + (item.unit || ''), colX.qty, y + 7, { width: 55, align: 'right' });
        doc.text('₹' + Number(item.unit_price).toLocaleString('en-IN'), colX.rate, y + 7, { width: 55, align: 'right' });
        doc.text((item.gst_rate || 0) + '%', colX.gst, y + 7, { width: 50, align: 'right' });
        doc.fillColor(dark).font('Helvetica-Bold')
           .text('₹' + itemTotal.toLocaleString('en-IN'), colX.total, y + 7, { width: W - 50 - colX.total, align: 'right' });

        y += rowH;
      });

      // Border around table
      doc.rect(50, tableHeaderY, W - 100, y - tableHeaderY).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      y += 16;

      // ── TOTALS ───────────────────────────────────────
      const totalsX = W - 230;
      const totalsW = 180;

      function totalRow(label, value, bold, color) {
        doc.fillColor(color || gray).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
           .text(label, totalsX, y, { width: totalsW * 0.55 });
        doc.fillColor(color || dark).font(bold ? 'Helvetica-Bold' : 'Helvetica')
           .text(value, totalsX + totalsW * 0.55, y, { width: totalsW * 0.45, align: 'right' });
        y += 16;
      }

      totalRow('Subtotal', '₹' + subtotal.toLocaleString('en-IN'));
      if (totalGst > 0) totalRow('GST', '₹' + totalGst.toLocaleString('en-IN'));
      if (Number(invoice.discount_amount) > 0) totalRow('Discount', '-₹' + Number(invoice.discount_amount).toLocaleString('en-IN'));

      y += 4;
      doc.moveTo(totalsX, y).lineTo(W - 50, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      y += 8;

      const grandTotal = Number(invoice.total_amount) || subtotal + totalGst;
      const paidAmount = Number(invoice.paid_amount) || 0;
      const balanceDue = grandTotal - paidAmount;

      totalRow('Total Amount', '₹' + grandTotal.toLocaleString('en-IN'), true, dark);
      if (paidAmount > 0) totalRow('Amount Paid', '₹' + paidAmount.toLocaleString('en-IN'), false, '#16a34a');

      if (balanceDue > 0) {
        y += 4;
        doc.rect(totalsX - 10, y - 4, totalsW + 10, 26).fill('#fef2f2');
        doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(11)
           .text('Balance Due', totalsX, y + 3, { width: totalsW * 0.55 });
        doc.text('₹' + balanceDue.toLocaleString('en-IN'), totalsX + totalsW * 0.55, y + 3, { width: totalsW * 0.45, align: 'right' });
        y += 28;
      }

      // ── PAYMENT TERMS / NOTES ────────────────────────
      y += 20;
      if (invoice.notes) {
        doc.fillColor(gray).font('Helvetica').fontSize(8)
           .text('Notes: ' + invoice.notes, 50, y, { width: W - 100 });
        y += 20;
      }

      // ── FOOTER ───────────────────────────────────────
      const footerY = 780;
      doc.moveTo(50, footerY).lineTo(W - 50, footerY).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      doc.fillColor(gray).font('Helvetica').fontSize(8)
         .text('Generated by BizPilot — AI Business Assistant', 50, footerY + 8, { width: W - 100, align: 'center' });

      doc.end();

    } catch (e) {
      logger.error('generateInvoicePDF: ' + e.message);
      reject(e);
    }
  });
}

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date)) return String(d);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── SEND INVOICE VIA WHATSAPP ────────────────────────────
// Uploads PDF to Wati and sends to customer
async function sendInvoiceWhatsApp(pdfBuffer, toPhone, invoiceNumber, businessName) {
  const axios = require('axios');
  const FormData = require('form-data');
  const logger = require('./logger');

  try {
    const normalized = String(toPhone).replace(/\D/g, '').replace(/^0+/, '');
    const form = new FormData();
    form.append('file', pdfBuffer, {
      filename: 'Invoice-' + invoiceNumber + '.pdf',
      contentType: 'application/pdf'
    });
    form.append('caption', '📄 Invoice ' + invoiceNumber + ' from ' + businessName + '\nGenerated by BizPilot');

    const url = process.env.WATI_API_ENDPOINT + '/api/v1/sendFileMessage/' + normalized;
    await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: 'Bearer ' + process.env.WATI_ACCESS_TOKEN
      }
    });
    logger.info('Invoice PDF sent to ' + normalized);
    return true;
  } catch (e) {
    logger.error('sendInvoiceWhatsApp: ' + e.message);
    return false;
  }
}

module.exports = { generateInvoicePDF, sendInvoiceWhatsApp };
