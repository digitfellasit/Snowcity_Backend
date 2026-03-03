const offersModel = require('../../models/offers.model');
const { buildScopeFilter } = require('../middleware/scopedAccess');

exports.listOffers = async (req, res, next) => {
  try {
    const active = req.query.active === undefined ? null : String(req.query.active).toLowerCase() === 'true';
    const rule_type = req.query.rule_type || null;
    const date = req.query.date || null;
    const q = (req.query.q || '').toString().trim();
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    // Scope: only return offers whose target attractions/combos are within admin's scope
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    const comboScope = scopes.combo || [];
    const hasFullAttractionAccess = attractionScope.includes('*');
    const hasFullComboAccess = comboScope.includes('*');

    // If scoped, the model layer should filter by target_id and target_type
    const data = await offersModel.listOffers({ active, rule_type, date, q, limit, offset, attractionScope, comboScope, hasFullAttractionAccess, hasFullComboAccess });
    res.json({ data, meta: { page, limit, count: data.length } });
  } catch (err) {
    next(err);
  }
};

exports.getOfferById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await offersModel.getOfferById(id);
    if (!row) return res.status(404).json({ error: 'Offer not found' });

    // Scope: ensure offer's targets are within admin's scopes
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    const comboScope = scopes.combo || [];
    const hasFullAttractionAccess = attractionScope.includes('*');
    const hasFullComboAccess = comboScope.includes('*');

    // If offer has rules targeting attractions/combos, enforce scope
    if (Array.isArray(row.rules) && row.rules.length) {
      for (const rule of row.rules) {
        if (!rule.applies_to_all && rule.target_id) {
          if (rule.target_type === 'attraction' && !hasFullAttractionAccess && !attractionScope.includes(rule.target_id)) {
            return res.status(403).json({ error: 'Forbidden: offer targets out-of-scope attraction' });
          }
          if (rule.target_type === 'combo' && !hasFullComboAccess && !comboScope.includes(rule.target_id)) {
            return res.status(403).json({ error: 'Forbidden: offer targets out-of-scope combo' });
          }
        }
      }
    }

    res.json(row);
  } catch (err) {
    next(err);
  }
};

function normalizeRule(rule = {}) {
  return {
    target_type: rule.target_type || rule.targetType || 'attraction',
    target_id: rule.target_id ?? rule.targetId ?? null,
    applies_to_all: !!rule.applies_to_all || !!rule.appliesToAll,
    date_from: rule.date_from ?? rule.dateFrom ?? null,
    date_to: rule.date_to ?? rule.dateTo ?? null,
    time_from: rule.time_from ?? rule.timeFrom ?? null,
    time_to: rule.time_to ?? rule.timeTo ?? null,
    slot_type: rule.slot_type || rule.slotType || null,
    slot_id: rule.slot_id ?? rule.slotId ?? null,
    rule_discount_type: rule.rule_discount_type || rule.ruleDiscountType || null,
    rule_discount_value: rule.rule_discount_value ?? rule.ruleDiscountValue ?? null,
    priority: rule.priority ?? 100,
    day_type: rule.day_type ?? rule.dayType ?? null,
    specific_days: rule.specific_days ?? rule.specificDays ?? null,
    is_holiday: !!rule.is_holiday,
    specific_date: rule.specific_date ?? rule.specificDate ?? null,
    specific_time: rule.specific_time ?? rule.specificTime ?? null,
  };
}

function normalizePayload(body = {}) {
  const {
    title,
    description,
    image_url,
    rule_type,
    discount_type,
    discount_value,
    max_discount,
    valid_from,
    valid_to,
    active,
    announcement,
    announcement_active,
    rules,
  } = body;

  return {
    title,
    description,
    image_url,
    rule_type,
    discount_type,
    discount_value,
    max_discount,
    valid_from,
    valid_to,
    active,
    announcement: announcement || null,
    announcement_active: announcement_active !== false,
    rules: Array.isArray(rules) ? rules.map(normalizeRule) : [],
  };
}

exports.createOffer = async (req, res, next) => {
  try {
    // Scope: enforce that all rule targets are within admin's scopes
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    const comboScope = scopes.combo || [];
    const hasFullAttractionAccess = attractionScope.includes('*');
    const hasFullComboAccess = comboScope.includes('*');

    const payload = normalizePayload(req.body);
    if (Array.isArray(payload.rules)) {
      payload.rules = payload.rules.map((r) => ({
        ...r,
        target_id: (r.target_id === '' || r.target_id === 'null') ? null : Number(r.target_id),
      }));
      // Validate scopes
      for (const rule of payload.rules) {
        if (!rule.applies_to_all && rule.target_id) {
          if (rule.target_type === 'attraction' && !hasFullAttractionAccess && !attractionScope.includes(rule.target_id)) {
            return res.status(403).json({ error: 'Forbidden: offer targets out-of-scope attraction' });
          }
          if (rule.target_type === 'combo' && !hasFullComboAccess && !comboScope.includes(rule.target_id)) {
            return res.status(403).json({ error: 'Forbidden: offer targets out-of-scope combo' });
          }
        }
      }
      const bad = payload.rules.find((r) => !r.applies_to_all && (!Number.isInteger(r.target_id) || r.target_id <= 0));
      if (bad) return res.status(400).json({ error: 'Invalid rule: target selection is required unless applies_to_all is true' });
    }
    const row = await offersModel.createOffer(payload);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
};

exports.updateOffer = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    // Scope: enforce that all rule targets are within admin's scopes
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    const comboScope = scopes.combo || [];
    const hasFullAttractionAccess = attractionScope.includes('*');
    const hasFullComboAccess = comboScope.includes('*');

    const payload = normalizePayload(req.body);
    if (Array.isArray(payload.rules)) {
      payload.rules = payload.rules.map((r) => ({
        ...r,
        target_id: (r.target_id === '' || r.target_id === 'null') ? null : Number(r.target_id),
      }));
      // Validate scopes
      for (const rule of payload.rules) {
        if (!rule.applies_to_all && rule.target_id) {
          if (rule.target_type === 'attraction' && !hasFullAttractionAccess && !attractionScope.includes(rule.target_id)) {
            return res.status(403).json({ error: 'Forbidden: offer targets out-of-scope attraction' });
          }
          if (rule.target_type === 'combo' && !hasFullComboAccess && !comboScope.includes(rule.target_id)) {
            return res.status(403).json({ error: 'Forbidden: offer targets out-of-scope combo' });
          }
        }
      }
      const bad = payload.rules.find((r) => !r.applies_to_all && (!Number.isInteger(r.target_id) || r.target_id <= 0));
      if (bad) return res.status(400).json({ error: 'Invalid rule: target selection is required unless applies_to_all is true' });
    }
    const row = await offersModel.updateOffer(id, payload);
    if (!row) return res.status(404).json({ error: 'Offer not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
};

exports.deleteOffer = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    // Scope: ensure offer is within admin's scopes before deletion
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    const comboScope = scopes.combo || [];
    const hasFullAttractionAccess = attractionScope.includes('*');
    const hasFullComboAccess = comboScope.includes('*');

    const existing = await offersModel.getOfferById(id);
    if (!existing) return res.status(404).json({ error: 'Offer not found' });

    // Check rule targets
    if (Array.isArray(existing.rules) && existing.rules.length) {
      for (const rule of existing.rules) {
        if (!rule.applies_to_all && rule.target_id) {
          if (rule.target_type === 'attraction' && !hasFullAttractionAccess && !attractionScope.includes(rule.target_id)) {
            return res.status(403).json({ error: 'Forbidden: offer targets out-of-scope attraction' });
          }
          if (rule.target_type === 'combo' && !hasFullComboAccess && !comboScope.includes(rule.target_id)) {
            return res.status(403).json({ error: 'Forbidden: offer targets out-of-scope combo' });
          }
        }
      }
    }

    const ok = await offersModel.deleteOffer(id);
    if (!ok) return res.status(404).json({ error: 'Offer not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
};

exports.getOfferSlots = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid offer id' });
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
    const data = await offersModel.findOfferSlots(id, { limit });
    if (!data.offer) return res.status(404).json({ error: 'Offer not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
};
