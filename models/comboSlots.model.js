const { pool } = require('../config/db');

// Generate dynamic combo slots based on number of attractions in combo
function generateDynamicComboSlots(date, combo, existingBookings = []) {
  const slots = [];
  const startHour = 10; // 10:00 AM
  const endHour = 20;   // 8:00 PM

  // Calculate slot duration based on number of attractions (1 hour per attraction)
  const slotDurationHours = combo.attraction_count || 2; // Default 2 hours for combo

  // Convert existing bookings to a Set for quick lookup
  const bookedSlots = new Set();
  existingBookings.forEach(booking => {
    if (booking.booking_date === date) {
      const hour = new Date(booking.booking_time).getHours();
      bookedSlots.add(hour);
    }
  });

  for (let hour = startHour; hour <= endHour - slotDurationHours; hour++) {
    const startTime = `${String(hour).padStart(2, '0')}:00:00`;
    const endTime = `${String(hour + slotDurationHours).padStart(2, '0')}:00:00`;

    // Check if this slot is already booked
    const isBooked = bookedSlots.has(hour);

    slots.push({
      combo_slot_id: `${date.replace(/-/g, '')}-${hour}`, // Virtual slot ID
      combo_id: combo.combo_id,
      start_date: date,
      end_date: date,
      start_time: startTime,
      end_time: endTime,
      capacity: 15, // Default capacity for combos
      available: !isBooked,
      is_booked: isBooked,
      price: combo.total_price || combo.combo_price || 0,
      duration_hours: slotDurationHours,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_dynamic: true
    });
  }

  return slots;
}

// Get combo details with attraction count
async function getComboDetails(combo_id) {
  const { rows } = await pool.query(
    `SELECT cd.*, 
            (SELECT COUNT(*)::int 
             FROM attractions a 
             WHERE a.attraction_id = ANY(cd.attraction_ids) 
               AND a.time_slot_enabled = true) as time_slot_enabled_count,
            CASE 
              WHEN cd.attraction_ids IS NOT NULL THEN array_length(cd.attraction_ids, 1)
              WHEN cd.attraction_1_id IS NOT NULL AND cd.attraction_2_id IS NOT NULL THEN 2
              WHEN cd.attraction_1_id IS NOT NULL THEN 1
              ELSE 2 -- Default to 2 for backward compatibility
            END as total_attraction_count
     FROM combo_details cd 
     WHERE cd.combo_id = $1`,
    [combo_id]
  );

  const combo = rows[0] || null;

  if (combo) {
    if (combo.time_slot_enabled_count > 0) {
      combo.attraction_count = combo.time_slot_enabled_count;
    } else {
      combo.attraction_count = 1; // Default to 1 hour if no slots enabled, instead of minimal 2 hours
    }
  }

  return combo;
}

function mapComboSlot(row) {
  if (!row) return null;
  return {
    combo_slot_id: row.combo_slot_id,
    combo_id: row.combo_id,
    start_date: row.start_date,
    end_date: row.end_date,
    start_time: row.start_time,
    end_time: row.end_time,
    capacity: row.capacity,
    price: row.price != null ? Number(row.price) : null,
    available: row.available,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getSlotById(combo_slot_id) {
  const { rows } = await pool.query(`SELECT * FROM combo_slots WHERE combo_slot_id = $1`, [combo_slot_id]);
  return mapComboSlot(rows[0]);
}

async function listSlots({ combo_id = null, date = null, start_date = null, end_date = null } = {}) {
  // If a specific date and combo are requested, generate dynamic slots
  if (date && combo_id) {
    // Get combo details
    const combo = await getComboDetails(combo_id);
    if (!combo) return [];

    // Get existing bookings for this combo and date
    const { rows: bookings } = await pool.query(
      `SELECT booking_date, booking_time 
       FROM bookings 
       WHERE combo_id = $1 AND booking_date = $2 AND booking_status <> 'Cancelled'`,
      [combo_id, date]
    );

    const slots = generateDynamicComboSlots(date, combo, bookings);
    return slots;
  }

  // If date range is requested, generate for each date
  if (start_date && end_date && combo_id) {
    const combo = await getComboDetails(combo_id);
    if (!combo) return [];

    const allSlots = [];
    const currentDate = new Date(start_date);
    const endDate = new Date(end_date);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().slice(0, 10);

      // Get existing bookings for this combo and date
      const { rows: bookings } = await pool.query(
        `SELECT booking_date, booking_time 
         FROM bookings 
         WHERE combo_id = $1 AND booking_date = $2 AND booking_status <> 'Cancelled'`,
        [combo_id, dateStr]
      );

      const daySlots = generateDynamicComboSlots(dateStr, combo, bookings);
      allSlots.push(...daySlots);

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return allSlots;
  }

  // Fallback to database for existing physical slots (backward compatibility)
  const where = [];
  const params = [];
  let i = 1;

  if (combo_id) {
    where.push(`cs.combo_id = $${i++}`);
    params.push(Number(combo_id));
  }
  if (date) {
    where.push(`$${i}::date BETWEEN cs.start_date AND cs.end_date`);
    params.push(date);
    i += 1;
  } else {
    if (start_date) {
      where.push(`cs.end_date >= $${i++}::date`);
      params.push(start_date);
    }
    if (end_date) {
      where.push(`cs.start_date <= $${i++}::date`);
      params.push(end_date);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT cs.*
     FROM combo_slots cs
     ${whereSql}
     ORDER BY cs.start_date ASC, cs.start_time ASC`,
    params
  );
  return rows.map(mapComboSlot);
}

async function listSlotsByCombo(combo_id) {
  return listSlots({ combo_id });
}

async function createSlot(payload) {
  const {
    combo_id,
    start_date,
    end_date,
    start_time,
    end_time,
    capacity,
    price = null,
    available = true,
  } = payload;

  // Generate combo slot code
  const combo_slot_code = `CSLOT${Date.now().toString().slice(-6)}`;

  const { rows } = await pool.query(
    `INSERT INTO combo_slots
       (combo_id, start_date, end_date, start_time, end_time, capacity, price, available, combo_slot_code)
     VALUES ($1, $2::date, $3::date, $4::time, $5::time, $6, $7, $8, $9)
     RETURNING *`,
    [Number(combo_id), start_date, end_date, start_time, end_time, Number(capacity), price, available, combo_slot_code]
  );
  return mapComboSlot(rows[0]);
}

async function updateSlot(combo_slot_id, fields = {}) {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return getSlotById(combo_slot_id);

  const sets = [];
  const params = [];
  entries.forEach(([key, value], idx) => {
    let val = value;
    if (key === 'capacity' || key === 'combo_id') {
      val = Number(val);
    } else if (key === 'price') {
      if (val === '' || val === null || val === undefined) val = null;
      else {
        const num = Number(val);
        val = Number.isNaN(num) ? null : num;
      }
    } else if (key === 'available') {
      val = val === 'false' ? false : Boolean(val);
    }
    const cast = ['start_date', 'end_date'].includes(key)
      ? '::date'
      : ['start_time', 'end_time'].includes(key)
        ? '::time'
        : '';
    sets.push(`${key} = $${idx + 1}${cast}`);
    params.push(val);
  });
  params.push(combo_slot_id);

  const { rows } = await pool.query(
    `UPDATE combo_slots SET ${sets.join(', ')}, updated_at = NOW()
     WHERE combo_slot_id = $${params.length}
     RETURNING *`,
    params
  );
  return mapComboSlot(rows[0]);
}

async function deleteSlot(combo_slot_id) {
  const { rowCount } = await pool.query(`DELETE FROM combo_slots WHERE combo_slot_id = $1`, [combo_slot_id]);
  return rowCount > 0;
}

async function slotOverlapExists({ combo_id, start_date, end_date, start_time, end_time, exclude_slot_id = null }) {
  const params = [];
  let i = 1;
  let sql = `SELECT 1 FROM combo_slots WHERE combo_id = $${i++}`;
  params.push(Number(combo_id));
  sql += ` AND start_time < $${i++}::time`;
  params.push(end_time);
  sql += ` AND end_time > $${i++}::time`;
  params.push(start_time);
  if (exclude_slot_id) {
    sql += ` AND combo_slot_id <> $${i++}`;
    params.push(Number(exclude_slot_id));
  }
  sql += ` AND NOT ($${i}::date > end_date OR $${i + 1}::date < start_date)`;
  params.push(start_date, end_date);

  const { rows } = await pool.query(sql, params);
  return !!rows[0];
}

async function getSlotAvailability(combo_slot_id) {
  const { rows } = await pool.query(
    `SELECT cs.combo_slot_id, cs.capacity,
            (SELECT COALESCE(SUM(quantity), 0)::int FROM bookings b
             WHERE b.combo_slot_id = cs.combo_slot_id AND b.booking_status <> 'Cancelled') AS booked
     FROM combo_slots cs
     WHERE cs.combo_slot_id = $1`,
    [combo_slot_id]
  );
  return rows[0] || null;
}

async function isSlotAvailable(combo_slot_id, qty = 1) {
  const a = await getSlotAvailability(combo_slot_id);
  if (!a) return false;
  return a.booked + Math.max(1, Number(qty || 1)) <= a.capacity;
}

async function assertCapacityAndLock(client, combo_slot_id, qty = 1) {
  const slot = (
    await client.query(`SELECT * FROM combo_slots WHERE combo_slot_id = $1 FOR UPDATE`, [combo_slot_id])
  ).rows[0];
  if (!slot || slot.available === false) {
    const err = new Error('Combo slot not available');
    err.status = 409;
    throw err;
  }

  const booked = (
    await client.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS count
       FROM bookings
       WHERE combo_slot_id = $1 AND booking_status <> 'Cancelled'`,
      [combo_slot_id]
    )
  ).rows[0].count;

  const requestQty = Math.max(1, Number(qty || 1));
  if (booked + requestQty > slot.capacity) {
    const err = new Error('Combo slot capacity insufficient');
    err.status = 409;
    throw err;
  }
  return { slot, booked };
}

// Generate dynamic slots for date range - supports all days, months, years
function generateDynamicSlotsForDateRange(comboId, startDate, endDate, slotDuration) {
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
      const virtualSlotId = `${comboId}-${dateStr.replace(/-/g, '')}-${hour.toString().padStart(2, '0')}`;

      slots.push({
        combo_slot_id: virtualSlotId,
        combo_id: comboId,
        start_date: dateStr,
        end_date: dateStr,
        start_time: startTime,
        end_time: endTime,
        capacity: 300,
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
  generateDynamicComboSlots,
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
