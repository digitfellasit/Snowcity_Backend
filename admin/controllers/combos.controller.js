const combosModel = require('../../models/combos.model');
const { buildScopeFilter } = require('../middleware/scopedAccess');

exports.listCombos = async (req, res, next) => {
  try {
    const active = req.query.active === undefined ? null : String(req.query.active).toLowerCase() === 'true';
    // Scope: only return combos this admin can access
    const scopes = req.user.scopes || {};
    const comboScope = scopes.combo || [];
    const hasFullAccess = !comboScope.length || comboScope.includes('*');

    console.log('=== COMBOS LIST DEBUG ===');
    console.log('User scopes:', scopes);
    console.log('Combo scope:', comboScope);
    console.log('Has full access:', hasFullAccess);

    if (!hasFullAccess) {
      // If no full access, enforce list filter
      const scopedIds = comboScope.length ? comboScope : [null]; // null yields empty
      console.log('Using scoped IDs:', scopedIds);
      const data = await combosModel.listCombos({ active, comboIds: scopedIds });
      console.log('Scoped combos data length:', data?.length || 0);
      return res.json({ data, meta: { count: data.length } });
    }
    const data = await combosModel.listCombos({ active });
    console.log('All combos data length:', data?.length || 0);
    res.json({ data, meta: { count: data.length } });
  } catch (err) {
    console.error('Error in listCombos:', err);
    next(err);
  }
};

exports.getComboById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const scopes = req.user.scopes || {};
    const comboScope = scopes.combo || [];
    if (comboScope.length && !comboScope.includes('*') && !comboScope.includes(id)) {
      return res.status(403).json({ error: 'Forbidden: combo not in scope' });
    }
    const row = await combosModel.getComboById(id);
    if (!row) return res.status(404).json({ error: 'Combo not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
};

exports.createCombo = async (req, res, next) => {
  try {
    // Scope: only admins with full combo module access can create
    const scopes = req.user.scopes || {};
    const comboScope = scopes.combo || [];
    if (!comboScope.includes('*')) {
      return res.status(403).json({ error: 'Forbidden: requires full combo module access' });
    }
    console.log('=== COMBO CREATION START ===');
    console.log('Request body:', req.body);

    const {
      name,
      slug,
      attraction_ids,
      attraction_prices,
      total_price,
      image_url,
      image_alt,
      desktop_image_url,
      desktop_image_alt,
      discount_percent = 0,
      active = true,
      create_slots = true,
      meta_title,
      short_description,
      description,
      faq_items,
      head_schema,
      body_schema,
      footer_schema,
      stop_booking
    } = req.body || {};

    console.log('Parsed data:', { name, attraction_ids, attraction_prices, total_price, image_url, discount_percent, active, create_slots });

    // Validate that we have the required new format or fall back to legacy
    if (name && attraction_ids && attraction_prices) {
      console.log('Using NEW format for combo creation');
      // New format - slots are generated automatically if create_slots is true
      const row = await combosModel.createCombo({
        name,
        slug,
        attraction_ids,
        attraction_prices,
        total_price,
        image_url,
        image_alt,
        desktop_image_url,
        desktop_image_alt,
        discount_percent,
        active,
        create_slots,
        meta_title,
        short_description,
        description,
        faq_items,
        head_schema,
        body_schema,
        footer_schema,
        stop_booking
      });
      console.log('Combo created successfully:', row);
      res.status(201).json(row);
    } else {
      // Legacy format - convert to new format
      const { attraction_1_id, attraction_2_id, combo_price } = req.body || {};
      if (!attraction_1_id || !attraction_2_id) {
        return res.status(400).json({ error: 'Legacy format requires attraction_1_id and attraction_2_id' });
      }

      const legacyAttractionIds = [attraction_1_id, attraction_2_id];
      const legacyAttractionPrices = {
        [attraction_1_id]: combo_price / 2,
        [attraction_2_id]: combo_price / 2
      };

      const row = await combosModel.createCombo({
        name: `Combo #${Date.now()}`,
        attraction_ids: legacyAttractionIds,
        attraction_prices: legacyAttractionPrices,
        total_price: combo_price,
        discount_percent,
        active,
        create_slots,
        slots
      });
      res.status(201).json(row);
    }
  } catch (err) {
    next(err);
  }
};

exports.updateCombo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const scopes = req.user.scopes || {};
    const comboScope = scopes.combo || [];
    if (comboScope.length && !comboScope.includes('*') && !comboScope.includes(Number(id))) {
      return res.status(403).json({ error: 'Forbidden: combo not in scope' });
    }
    const updateData = { ...req.body };

    // Handle legacy format updates
    if (updateData.attraction_1_id || updateData.attraction_2_id) {
      const { attraction_1_id, attraction_2_id, combo_price, ...otherFields } = updateData;

      // Convert legacy to new format
      if (attraction_1_id && attraction_2_id) {
        updateData.attraction_ids = [attraction_1_id, attraction_2_id];
        updateData.attraction_prices = {
          [attraction_1_id]: combo_price / 2,
          [attraction_2_id]: combo_price / 2
        };
        updateData.total_price = combo_price;
      }

      // Remove legacy fields
      delete updateData.attraction_1_id;
      delete updateData.attraction_2_id;
      delete updateData.combo_price;
    }

    const row = await combosModel.updateCombo(id, updateData);
    if (!row) return res.status(404).json({ error: 'Combo not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
};

exports.deleteCombo = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const scopes = req.user.scopes || {};
    const comboScope = scopes.combo || [];
    if (comboScope.length && !comboScope.includes('*') && !comboScope.includes(id)) {
      return res.status(403).json({ error: 'Forbidden: combo not in scope' });
    }
    const ok = await combosModel.deleteCombo(id);
    if (!ok) return res.status(404).json({ error: 'Combo not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
};