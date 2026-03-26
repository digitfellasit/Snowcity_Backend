const comboSlotService = require('../../services/comboSlotService');

function normalizeDateFields(payload) {
  const out = { ...(payload || {}) };
  const date = out.date || out.day || null;
  if (date && !out.start_date && !out.end_date) {
    out.start_date = date;
    out.end_date = date;
  }
  if (out.start_date && !out.end_date) out.end_date = out.start_date;
  return out;
}

function to24h(timeStr) {
  if (!timeStr && timeStr !== 0) return null;
  let s = String(timeStr).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/\./g, ':').replace(/\s+/g, '');
  const ampm = s.match(/^(\d{1,2})(:?)(\d{2})?(am|pm)$/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[3] || '0', 10);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const ap = ampm[4];
    if (h === 12 && ap === 'am') h = 0;
    if (h < 12 && ap === 'pm') h += 12;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  }
  return null;
}

function to12h(hms) {
  if (!hms) return null;
  const parts = String(hms).split(':');
  const hh = parseInt(parts[0] || '0', 10);
  const mm = parseInt(parts[1] || '0', 10);
  const ap = hh >= 12 ? 'pm' : 'am';
  let h = hh % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}.${String(mm).padStart(2, '0')}${ap}`;
}

exports.listSlots = async (req, res, next) => {
  try {
    const { combo_id, start_date, end_date } = req.query;
    
    if (!combo_id) {
      return res.status(400).json({ error: 'combo_id is required' });
    }
    
    // Get combo details to determine slot duration
    const combo = await comboSlotsModel.getComboById(combo_id);
    if (!combo) {
      return res.status(404).json({ error: 'Combo not found' });
    }
    if (payload.capacity !== undefined) payload.capacity = Number(payload.capacity);
    if (payload.price !== undefined) {
      payload.price = payload.price === null ? null : Number(payload.price);
    }

    const row = await comboSlotService.update(id, payload);
    res.json(row);
  } catch (err) {
    next(err);
  }
};

exports.deleteSlot = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const out = await comboSlotService.remove(id);
    res.json(out);
  } catch (err) {
    next(err);
  }
};

exports.createSlotsBulk = async (req, res, next) => {
  // Bulk combo slot creation is no longer needed since slots are dynamic
  try {
    res.status(400).json({ 
      error: 'Bulk combo slot creation is no longer needed.',
      message: 'Combo slots are generated dynamically from 10:00 AM to 6:00 PM. Duration is based on number of attractions in the combo.'
    });
  } catch (err) {
    next(err);
  }
};
