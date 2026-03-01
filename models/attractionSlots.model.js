const { pool, withTransaction } = require('../config/db');

// Generate dynamic slots for attractions (10:00 AM to 8:00 PM, 1-hour intervals)
function generateDynamicSlots(date, existingBookings = []) {
  const slots = [];
  const startHour = 10; // 10:00 AM
  const endHour = 20;   // 8:00 PM

  // Convert existing bookings to a Set for quick lookup
  const bookedSlots = new Set();
  existingBookings.forEach(booking => {
    if (booking.booking_date === date) {
      const hour = new Date(booking.booking_time).getHours();
      bookedSlots.add(hour);
    }
  });

  for (let hour = startHour; hour < endHour; hour++) {
    const startTime = `${String(hour).padStart(2, '0')}:00:00`;
    const endTime = `${String(hour + 1).padStart(2, '0')}:00:00`;

    // Check if this slot is already booked
    const isBooked = bookedSlots.has(hour);

    slots.push({
      slot_id: `${date.replace(/-/g, '')}-${hour}`, // Virtual slot ID
      attraction_id: null, // Will be set by controller
      start_date: date,
      end_date: date,
      start_time: startTime,
      end_time: endTime,
      capacity: 999999, // Unlimited capacity
      available: !isBooked,
      is_booked: isBooked,
      price: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_dynamic: true
    });
  }

  return slots;
}

async function getSlotById(slot_id) {
  // For dynamic slots, parse the virtual ID
  if (typeof slot_id === 'string' && slot_id.includes('-')) {
    const [date, hourStr] = slot_id.split('-');
    const hour = parseInt(hourStr);
    const startTime = `${String(hour).padStart(2, '0')}:00:00`;
    const endTime = `${String(hour + 1).padStart(2, '0')}:00:00`;

    return {
      slot_id,
      start_date: date,
      end_date: date,
      start_time: startTime,
      end_time: endTime,
      capacity: 999999,
      available: true,
      is_dynamic: true
    };
  }

  // Fallback to database for any existing physical slots
  const { rows } = await pool.query(`SELECT * FROM attraction_slots WHERE slot_id = $1`, [slot_id]);
  return rows[0] || null;
}

async function listSlots({ attraction_id = null, date = null, start_date = null, end_date = null } = {}) {
  // If a specific date is requested, generate dynamic slots
  if (date && attraction_id) {
    // Get existing bookings for this attraction and date
    const { rows: bookings } = await pool.query(
      `SELECT booking_date, booking_time 
       FROM bookings 
       WHERE attraction_id = $1 AND booking_date = $2 AND booking_status <> 'Cancelled'`,
      [attraction_id, date]
    );

    const slots = generateDynamicSlots(date, bookings);
    return slots.map(slot => ({ ...slot, attraction_id }));
  }

  // If date range is requested, generate for each date
  if (start_date && end_date && attraction_id) {
    const allSlots = [];
    const currentDate = new Date(start_date);
    const endDate = new Date(end_date);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().slice(0, 10);

      // Get existing bookings for this attraction and date
      const { rows: bookings } = await pool.query(
        `SELECT booking_date, booking_time 
         FROM bookings 
         WHERE attraction_id = $1 AND booking_date = $2 AND booking_status <> 'Cancelled'`,
        [attraction_id, dateStr]
      );

      const daySlots = generateDynamicSlots(dateStr, bookings);
      allSlots.push(...daySlots.map(slot => ({ ...slot, attraction_id })));

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return allSlots;
  }

  // Fallback to database for existing physical slots (backward compatibility)
  const where = [];
  const params = [];
  let i = 1;

  if (attraction_id) {
    where.push(`aslt.attraction_id = $${i++}`);
    params.push(Number(attraction_id));
  }
  if (date) {
    where.push(`$${i}::date BETWEEN aslt.start_date AND aslt.end_date`);
    params.push(date);
    i += 1;
  } else {
    if (start_date) {
      where.push(`aslt.end_date >= $${i++}::date`);
      params.push(start_date);
    }
    if (end_date) {
      where.push(`aslt.start_date <= $${i++}::date`);
      params.push(end_date);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT aslt.*, a.title AS attraction_title
     FROM attraction_slots aslt
     JOIN attractions a ON a.attraction_id = aslt.attraction_id
     ${whereSql}
     ORDER BY aslt.start_date ASC, aslt.start_time ASC`,
    params
  );
  return rows;
}

async function createSlot(payload) {
  const {
    attraction_id,
    start_date,
    end_date,
    start_time,
    end_time,
    capacity,
    price: rawPrice = null,
    available: rawAvailable = true,
  } = payload;

  // sanitize inputs
  const aid = Number(attraction_id);
  const cap = Number(capacity);
  let price = rawPrice;
  if (price === '' || price === undefined || price === null) price = null;
  else {
    const n = Number(price);
    price = Number.isNaN(n) ? null : n;
  }
  const available = rawAvailable === 'false' ? false : Boolean(rawAvailable);

  try {
    const { rows } = await pool.query(
      `INSERT INTO attraction_slots
       (attraction_id, start_date, end_date, start_time, end_time, capacity, price, available)
       VALUES ($1, $2::date, $3::date, $4::time, $5::time, $6, $7, $8)
       RETURNING *`,
      [aid, start_date, end_date, start_time, end_time, cap, price, available]
    );
    return rows[0];
  } catch (err) {
    // Fallback if 'price' column does not exist in the current schema
    if (err && (err.code === '42703' || /column\s+"?price"?\s+does not exist/i.test(String(err.message)))) {
      const { rows } = await pool.query(
        `INSERT INTO attraction_slots
         (attraction_id, start_date, end_date, start_time, end_time, capacity, available)
         VALUES ($1, $2::date, $3::date, $4::time, $5::time, $6, $7)
         RETURNING *`,
        [aid, start_date, end_date, start_time, end_time, cap, available]
      );
      return rows[0];
    }
    throw err;
  }
}

async function updateSlot(slot_id, fields = {}) {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return getSlotById(slot_id);

  const sets = [];
  const params = [];
  entries.forEach(([k, v], idx) => {
    let val = v;
    if (k === 'price') {
      if (val === '' || val === null || val === undefined) val = null;
      else {
        const n = Number(val);
        val = Number.isNaN(n) ? null : n;
      }
    } else if (k === 'capacity' || k === 'attraction_id') {
      val = Number(v);
    } else if (k === 'available') {
      val = v === 'false' ? false : Boolean(v);
    }
    const cast =
      ['start_date', 'end_date'].includes(k) ? '::date' : ['start_time', 'end_time'].includes(k) ? '::time' : '';
    sets.push(`${k} = $${idx + 1}${cast}`);
    params.push(val);
  });
  params.push(slot_id);

  const { rows } = await pool.query(
    `UPDATE attraction_slots SET ${sets.join(', ')}, updated_at = NOW()
     WHERE slot_id = $${params.length}
     RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function deleteSlot(slot_id) {
  const { rowCount } = await pool.query(`DELETE FROM attraction_slots WHERE slot_id = $1`, [slot_id]);
  return rowCount > 0;
}

async function slotOverlapExists({ attraction_id, start_date, end_date, start_time, end_time, exclude_slot_id = null }) {
  const params = [];
  let i = 1;
  let sql = `SELECT 1 FROM attraction_slots WHERE attraction_id = $${i++}`;
  params.push(Number(attraction_id));
  sql += ` AND start_time < $${i++}::time`;
  params.push(end_time);
  sql += ` AND end_time > $${i++}::time`;
  params.push(start_time);
  if (exclude_slot_id) {
    sql += ` AND slot_id <> $${i++}`;
    params.push(Number(exclude_slot_id));
  }
  sql += ` AND NOT ($${i}::date > end_date OR $${i + 1}::date < start_date)`;
  params.push(start_date, end_date);

  const { rows } = await pool.query(sql, params);
  return !!rows[0];
}

async function getSlotAvailability(slot_id) {
  const { rows } = await pool.query(
    `
    SELECT
      s.slot_id, s.capacity,
      (SELECT COALESCE(SUM(b.quantity), 0) FROM bookings b
       WHERE b.slot_id = s.slot_id AND b.booking_status <> 'Cancelled')::int AS booked
    FROM attraction_slots s
    WHERE s.slot_id = $1
    `,
    [slot_id]
  );
  return rows[0] || null;
}

async function isSlotAvailable(slot_id, qty = 1) {
  const a = await getSlotAvailability(slot_id);
  if (!a) return false;
  return a.booked + Math.max(1, Number(qty || 1)) <= a.capacity;
}

// Concurrency-safe check during booking creation
async function assertCapacityAndLock(client, slot_id, qty = 1) {
  // lock slot row to serialize concurrent bookings on the same slot
  const slot = (
    await client.query(`SELECT * FROM attraction_slots WHERE slot_id = $1 FOR UPDATE`, [slot_id])
  ).rows[0];
  if (!slot || slot.available === false) {
    const err = new Error('Slot not available');
    err.status = 409;
    throw err;
  }
  const booked = (
    await client.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS c FROM bookings WHERE slot_id = $1 AND booking_status <> 'Cancelled'`,
      [slot_id]
    )
  ).rows[0].c;

  const requestQty = Math.max(1, Number(qty || 1));
  if (booked + requestQty > slot.capacity) {
    const err = new Error('Slot capacity insufficient');
    err.status = 409;
    throw err;
  }
  return { slot, booked };
}

// Generate dynamic slots for date range - supports all days, months, years
function generateDynamicSlotsForDateRange(attractionId, startDate, endDate, slotDuration = 1) {
  const slots = [];
  const startHour = 10; // 10:00 AM
  const endHour = 20;   // 8:00 PM

  const current = new Date(startDate);

  // Generate slots for the complete date range
  while (current <= endDate) {
    const dateStr = current.toISOString().slice(0, 10);

    // Generate slots throughout the day
    for (let hour = startHour; hour + slotDuration <= endHour; hour++) {
      const startTime = `${hour.toString().padStart(2, '0')}:00:00`;
      const endTime = `${(hour + slotDuration).toString().padStart(2, '0')}:00:00`;

      // Generate virtual slot ID
      const virtualSlotId = `${attractionId}-${dateStr.replace(/-/g, '')}-${hour.toString().padStart(2, '0')}`;

      slots.push({
        slot_id: virtualSlotId,
        attraction_id: attractionId,
        start_date: dateStr,
        end_date: dateStr,
        start_time: startTime,
        end_time: endTime,
        capacity: 999999,
        price: null,
        available: true,
        is_dynamic: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}

module.exports = {
  getSlotById,
  listSlots,
  createSlot,
  updateSlot,
  deleteSlot,
  slotOverlapExists,
  getSlotAvailability,
  isSlotAvailable,
  assertCapacityAndLock,
  generateDynamicSlotsForDateRange,
};