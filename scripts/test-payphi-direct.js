const axios = require('axios');
const payload = {
    "merchantId": "T_03342",
    "merchantTxnNo": "2711202422233",
    "amount": "300.00",
    "currencyCode": "356",
    "payType": "0",
    "customerEmailID": "test@gmail.com",
    "transactionType": "SALE",
    "txnDate": "202412051620545",
    "returnURL": "https://qa.phicommerce.com/pg/api/merchant",
    "secureHash": "197613d5ade172104bfd65e72bc07c80a14c65e64ec7335209768d83371243b4",
    "customerMobileNo": "917498791441",
    "addlParam1": "Test1",
    "addlParam2": "Test2"
};

console.log('Testing PayPhi API directly...');
axios.post('https://qa.phicommerce.com/pg/api/v2/initiateSale', payload, {
    headers: { 'Content-Type': 'application/json' }
}).then(res => {
    console.log('SUCCESS:', res.data);
}).catch(err => {
    console.log('ERROR:', err.response ? err.response.status : err.message);
    if (err.response) console.log('DATA:', err.response.data);
});
