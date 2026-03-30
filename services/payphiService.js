const payphi = require('../config/payphi');

async function initiate({ merchantTxnNo, amount, customerEmailID, customerMobileNo, customerName = '', addlParam1 = '', addlParam2 = '', addlParam3 = '' }) {
  const data = await payphi.initiateSale({
    merchantTxnNo,
    amount: Number(amount).toFixed(2),
    customerEmailID,
    customerMobileNo,
    customerName,
    addlParam1,
    addlParam2,
    addlParam3,
  });

  const redirectURI = data.redirectURI || data.redirectUri || `${payphi.BASE}/api/v2/authRedirect`;
  const tranCtx = data.tranCtx || data.tranctx || (data.response && data.response.tranCtx);
  const redirectUrl = payphi.buildRedirectUrl(redirectURI, tranCtx);

  return { raw: data, redirectUrl, tranCtx };
}

async function status({ merchantTxnNo, originalTxnNo, amount }) {
  const data = await payphi.command({
    merchantTxnNo,
    originalTxnNo,
    transactionType: 'STATUS',
    amount: amount ? Number(amount).toFixed(2) : undefined,
  });
  return { raw: data, success: payphi.isSuccessStatus(data) };
}

async function refund({ newMerchantTxnNo, originalTxnNo, amount }) {
  const data = await payphi.command({
    merchantTxnNo: newMerchantTxnNo,
    originalTxnNo,
    transactionType: 'REFUND',
    amount: Number(amount).toFixed(2),
  });
  return { raw: data, success: payphi.isSuccessStatus(data) };
}

module.exports = { initiate, status, refund };