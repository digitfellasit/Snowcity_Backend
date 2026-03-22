const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Returns current date in Asia/Kolkata (IST) timezone
 * Format: YYYY-MM-DD
 */
function getTodayIST() {
  return dayjs().tz('Asia/Kolkata').format('YYYY-MM-DD');
}

module.exports = { getTodayIST };
