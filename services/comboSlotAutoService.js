const { pool } = require('../config/db');

/**
 * Service for automatic combo slot creation
 * Generates time slots based on number of attractions in a combo
 */

class ComboSlotAutoService {
  /**
   * Generate time slots for a combo based on number of attractions
   * @param {number} comboId - The combo ID
   * @param {Array} slotsData - Array of slot data from frontend
   * @param {number} attractionCount - Number of attractions in the combo
   */
  static async generateSlotsForCombo(comboId, slotsData = [], attractionCount = 2) {
    console.log('generateSlotsForCombo called with:', { comboId, slotsDataLength: slotsData?.length, attractionCount });

    if (!slotsData || slotsData.length === 0) {
      console.log('No slots data provided, generating default slots...');
      // Generate default slots if none provided
      slotsData = this.generateDefaultSlots(attractionCount);
      console.log(`Generated ${slotsData.length} default slots`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      console.log(`Starting to insert ${slotsData.length} slots for combo ${comboId}`);

      for (const slot of slotsData) {
        // Generate a unique slot code
        const slotCode = `${comboId}-${slot.start_date}-${slot.start_time.replace(':', '')}`;
        console.log(`Inserting slot: ${slotCode}`, slot);

        await client.query(
          `INSERT INTO combo_slots 
           (combo_id, combo_slot_code, start_date, end_date, start_time, end_time, capacity, price, available)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (combo_id, start_date, end_date, start_time, end_time) 
           DO UPDATE SET capacity = $7, price = $8, available = $9`,
          [
            comboId,
            slotCode,
            slot.start_date,
            slot.end_date || slot.start_date,
            slot.start_time,
            slot.end_time,
            slot.capacity || 300,
            slot.price || 0,
            slot.available !== false
          ]
        );
      }

      await client.query('COMMIT');
      console.log(`Successfully created ${slotsData.length} slots for combo ${comboId}`);
      return { success: true, slotsCreated: slotsData.length };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error generating slots:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate default time slots for all days (next 90 days) from 10:00 AM to 8:00 PM
   * @param {number} attractionCount - Number of attractions (determines slot duration)
   */
  static generateDefaultSlots(attractionCount = 2, timeSlotEnabledCount = null) {
    const slots = [];
    const startHour = 10; // 10:00 AM
    const endHour = 20;   // 8:00 PM
    // Duration = number of time-slot-enabled attractions (each gets 1hr)
    // If all disabled or not specified, use 1hr as minimum
    const slotDuration = (timeSlotEnabledCount != null && timeSlotEnabledCount > 0)
      ? timeSlotEnabledCount
      : Math.max(1, attractionCount);

    // Generate for next 90 days
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + 90);

    const current = new Date(startDate);

    while (current <= endDate) {
      const dateStr = current.toISOString().slice(0, 10);

      // Generate continuous slots throughout the day
      for (let hour = startHour; hour + slotDuration <= endHour; hour++) {
        const startTime = `${hour.toString().padStart(2, '0')}:00`;
        const endTime = `${(hour + slotDuration).toString().padStart(2, '0')}:00`;

        slots.push({
          start_date: dateStr,
          end_date: dateStr,
          start_time: startTime,
          end_time: endTime,
          capacity: 300, // Updated capacity to 300
          available: true
        });
      }

      current.setDate(current.getDate() + 1);
    }

    return slots;
  }

  /**
   * Update slots for an existing combo
   * @param {number} comboId - The combo ID
   * @param {Array} newSlotsData - New slot data
   */
  static async updateComboSlots(comboId, newSlotsData = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing slots for this combo
      await client.query('DELETE FROM combo_slots WHERE combo_id = $1', [comboId]);

      // Create new slots
      if (newSlotsData && newSlotsData.length > 0) {
        for (const slot of newSlotsData) {
          await client.query(
            `INSERT INTO combo_slots 
             (combo_id, start_date, end_date, start_time, end_time, capacity, price, available)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              comboId,
              slot.start_date,
              slot.end_date || slot.start_date,
              slot.start_time,
              slot.end_time,
              slot.capacity || 300,
              slot.price || 0,
              slot.available !== false
            ]
          );
        }
      }

      await client.query('COMMIT');
      return { success: true, slotsUpdated: newSlotsData.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get slots for a combo
   * @param {number} comboId - The combo ID
   * @param {Object} filters - Filters for date range
   */
  static async getComboSlots(comboId, filters = {}) {
    const { start_date, end_date, date } = filters;
    let whereClause = 'WHERE combo_id = $1';
    const params = [comboId];
    let paramIndex = 2;

    if (date) {
      whereClause += ` AND $${paramIndex}::date BETWEEN start_date AND end_date`;
      params.push(date);
      paramIndex++;
    } else {
      if (start_date) {
        whereClause += ` AND end_date >= $${paramIndex}::date`;
        params.push(start_date);
        paramIndex++;
      }
      if (end_date) {
        whereClause += ` AND start_date <= $${paramIndex}::date`;
        params.push(end_date);
        paramIndex++;
      }
    }

    const { rows } = await pool.query(
      `SELECT * FROM combo_slots 
       ${whereClause} 
       ORDER BY start_date ASC, start_time ASC`,
      params
    );

    return rows;
  }

  /**
   * Delete all slots for a combo
   * @param {number} comboId - The combo ID
   */
  static async deleteComboSlots(comboId) {
    const { rowCount } = await pool.query(
      'DELETE FROM combo_slots WHERE combo_id = $1',
      [comboId]
    );
    return { success: true, slotsDeleted: rowCount };
  }

  /**
   * Check if slots exist for a combo on a specific date
   * @param {number} comboId - The combo ID
   * @param {string} date - Date to check (YYYY-MM-DD)
   */
  static async hasSlotsOnDate(comboId, date) {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as count FROM combo_slots 
       WHERE combo_id = $1 AND $2::date BETWEEN start_date AND end_date`,
      [comboId, date]
    );
    return parseInt(rows[0].count) > 0;
  }
}

module.exports = ComboSlotAutoService;
