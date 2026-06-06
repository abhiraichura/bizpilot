// ============================================================
// BIZPILOT TALLY INTEGRATION
// Pushes transactions to Tally via XML API
// Requires TallyConnector installed on client's computer
// TallyConnector runs on port 9000 by default
// ============================================================

require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

// ── BUILD TALLY XML FOR VOUCHER ENTRY ───────────────────
function buildVoucherXML(voucher) {
  const {
    voucherType,    // Sales, Purchase, Payment, Receipt, Expense
    date,           // YYYYMMDD format
    amount,
    narration,
    partyName,      // Customer or Supplier name
    ledgerName,     // BizPilot Sales / BizPilot Purchase etc
    reference
  } = voucher;

  const tallyDate = date ? date.replace(/-/g, '') : new Date().toISOString().slice(0,10).replace(/-/g,'');
  const absAmount = Math.abs(Number(amount));

  // Tally uses Dr/Cr logic based on voucher type
  let partyDrCr, ledgerDrCr;
  if (voucherType === 'Sales') {
    partyDrCr = 'Dr';
    ledgerDrCr = 'Cr';
  } else if (voucherType === 'Purchase') {
    partyDrCr = 'Cr';
    ledgerDrCr = 'Dr';
  } else if (voucherType === 'Receipt') {
    partyDrCr = 'Dr';  // Cash/Bank Dr
    ledgerDrCr = 'Cr'; // Party Cr
  } else if (voucherType === 'Payment') {
    partyDrCr = 'Cr';  // Cash/Bank Cr
    ledgerDrCr = 'Dr'; // Party Dr
  } else {
    partyDrCr = 'Dr';
    ledgerDrCr = 'Cr';
  }

  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>##SVCURRENTCOMPANY</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${voucherType}" ACTION="Create">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>
            <NARRATION>${escXml(narration || 'BizPilot entry')}</NARRATION>
            <REFERENCE>${escXml(reference || '')}</REFERENCE>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${escXml(partyName || 'Cash')}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${partyDrCr === 'Dr' ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
              <AMOUNT>${partyDrCr === 'Cr' ? '' : '-'}${absAmount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${escXml(ledgerName || 'BizPilot Sales')}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${ledgerDrCr === 'Dr' ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
              <AMOUNT>${ledgerDrCr === 'Cr' ? '' : '-'}${absAmount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

function escXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── PUSH TO TALLY ────────────────────────────────────────
// tallyUrl is the connector URL — usually http://CLIENT_IP:9000
async function pushToTally(tallyUrl, voucherData) {
  if (!tallyUrl) {
    logger.info('Tally URL not configured — skipping push');
    return { success: false, reason: 'not_configured' };
  }

  try {
    const xml = buildVoucherXML(voucherData);
    const response = await axios.post(tallyUrl, xml, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 8000
    });

    // Tally returns XML — check for success
    const respText = response.data || '';
    if (respText.includes('LINEERROR') || respText.includes('Error')) {
      logger.error('Tally rejected entry: ' + respText.substring(0, 200));
      return { success: false, reason: 'tally_rejected', detail: respText.substring(0, 200) };
    }

    logger.info('Tally entry pushed: ' + voucherData.voucherType + ' ' + voucherData.amount);
    return { success: true };

  } catch (e) {
    if (e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT') {
      logger.warn('Tally not reachable at ' + tallyUrl + ' — entry not synced');
      return { success: false, reason: 'tally_offline' };
    }
    logger.error('Tally push error: ' + e.message);
    return { success: false, reason: e.message };
  }
}

// ── MAP BIZPILOT TRANSACTION TO TALLY VOUCHER ────────────
function mapTransactionToVoucher(transaction, business) {
  const date = transaction.transaction_date || new Date().toISOString().slice(0,10);
  const companyName = business.name;

  const map = {
    sale: {
      voucherType: 'Sales',
      ledgerName: companyName + ' - Sales',
      partyName: transaction.customer_name || 'Cash Sales'
    },
    purchase: {
      voucherType: 'Purchase',
      ledgerName: companyName + ' - Purchases',
      partyName: transaction.supplier_name || 'Cash Purchase'
    },
    payment_received: {
      voucherType: 'Receipt',
      ledgerName: transaction.customer_name || 'Debtors',
      partyName: transaction.payment_method === 'cash' ? 'Cash' : 'Bank Account'
    },
    payment_made: {
      voucherType: 'Payment',
      ledgerName: transaction.supplier_name || 'Creditors',
      partyName: transaction.payment_method === 'cash' ? 'Cash' : 'Bank Account'
    },
    expense: {
      voucherType: 'Payment',
      ledgerName: mapExpenseCategory(transaction.category),
      partyName: 'Cash'
    }
  };

  const typeMap = map[transaction.transaction_type] || map.sale;

  return {
    voucherType: typeMap.voucherType,
    date: date,
    amount: transaction.amount,
    partyName: typeMap.partyName,
    ledgerName: typeMap.ledgerName,
    narration: transaction.description + ' [BizPilot]',
    reference: transaction.id ? transaction.id.substring(0, 8) : ''
  };
}

function mapExpenseCategory(category) {
  const map = {
    rent: 'Rent Expenses',
    electricity: 'Electricity Expenses',
    salary: 'Salary Expenses',
    transport: 'Transport Expenses',
    misc: 'Miscellaneous Expenses'
  };
  return map[category] || 'Miscellaneous Expenses';
}

// ── TEST TALLY CONNECTION ────────────────────────────────
async function testConnection(tallyUrl) {
  try {
    const testXml = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
    const r = await axios.post(tallyUrl, testXml, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 5000
    });
    return { connected: true, response: r.data ? r.data.substring(0, 100) : '' };
  } catch (e) {
    return { connected: false, error: e.code || e.message };
  }
}

module.exports = {
  pushToTally,
  mapTransactionToVoucher,
  testConnection,
  buildVoucherXML
};
