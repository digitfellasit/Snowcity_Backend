const { customAlphabet } = require('nanoid');
const { getTodayIST } = require('./time');
const { BOOKING_REF_PREFIX } = require('./constants');

const nano = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 10);

// Human-friendly booking reference (fallback; DB also has its own sequence)
function makeBookingRef(prefix = BOOKING_REF_PREFIX) {
  const ymd = getTodayIST().replace(/-/g, '');
  return `${prefix}${ymd}${nano(6)}`;
}

function randomId(len = 12) {
  return nano(Math.max(6, len));
}

module.exports = {
  makeBookingRef,
  randomId,
};