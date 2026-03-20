require('dotenv').config();
const { pool } = require('./config/db');
const offersModel = require('./models/offers.model');

async function dump() {
  try {
    const offers = await offersModel.listOffers({ active: true, limit: 10 });
    console.log(JSON.stringify(offers, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

dump();
