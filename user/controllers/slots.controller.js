const slotService = require('../../services/slotService');
const attractionsService = require('../../services/attractionService');
const dynamicPricingService = require('../../services/dynamicPricingService');

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const resolveSlotBasePrice = (slot = {}, attraction = {}) => {
  return (
    toNumber(slot.base_price, 0) ||
    toNumber(slot.price, 0) ||
    toNumber(attraction?.pricing?.base_price, 0) ||
    toNumber(attraction?.base_price ?? attraction?.price, 0)
  );
};

const normalizeSlotId = (slot) => {
  if (!slot?.slot_id) return null;
  const numeric = Number(slot.slot_id);
  return Number.isFinite(numeric) ? numeric : null;
};

const enrichSlotWithPricing = async (slot, attraction) => {
  if (!slot || !attraction) return slot;
  const basePrice = resolveSlotBasePrice(slot, attraction);
  if (!basePrice) {
    return { ...slot, base_price: basePrice || 0, price: basePrice || 0 };
  }

  // Parse date and time for pricing calculation
  const bookingDate = slot.start_date || slot.date ? new Date(slot.start_date || slot.date) : new Date();
  const bookingTime = slot.start_time || '12:00:00'; // Default to noon if no time

  const pricingResult = await dynamicPricingService.calculateDynamicPrice({
    itemType: 'attraction',
    itemId: attraction.attraction_id || attraction.id,
    basePrice: basePrice,
    date: bookingDate,
    time: bookingTime,
    quantity: 1,
  });

  const isDPActive = Array.isArray(pricingResult.appliedRules) &&
    pricingResult.appliedRules.some(r => r.type === 'dynamic_pricing_adjustment');

  return {
    ...slot,
    base_price: basePrice,
    price: pricingResult.finalPrice,
    original_price: pricingResult.originalPrice,
    discount_amount: pricingResult.discountAmount,
    applied_rules: pricingResult.appliedRules,
    dynamic_pricing_active: isDPActive,
    pricing: {
      base_price: basePrice,
      final_price: pricingResult.finalPrice,
      original_price: pricingResult.originalPrice,
      discount_amount: pricingResult.discountAmount,
      applied_rules: pricingResult.appliedRules,
      dynamic_pricing_active: isDPActive,
    },
  };
};

const mapSlotsWithPricing = async (slots = [], attraction = null) => {
  if (!attraction || !Array.isArray(slots) || !slots.length) return slots;
  return Promise.all(slots.map((slot) => enrichSlotWithPricing(slot, attraction)));
};

// GET /api/slots
exports.listSlots = async (req, res, next) => {
  try {
    const attraction_id = req.query.attraction_id ? Number(req.query.attraction_id) : null;
    const date = req.query.date || null;
    const start_date = req.query.start_date || null;
    const end_date = req.query.end_date || null;
    
    // If we have attraction_id and date, use dynamic slot generation
    if (attraction_id && date) {
      // Get attraction details
      const attraction = await attractionsService.getById(attraction_id);
      if (!attraction) {
        return res.status(404).json({ error: 'Attraction not found' });
      }
      
      // Import the slot generation function
      const { generateDynamicSlotsForDateRange } = require('../../models/attractionSlots.model');
      
      // Generate slots for the single date
      const startDate = new Date(date);
      const endDate = new Date(date); // Same day
      
      const slots = generateDynamicSlotsForDateRange(
        attraction_id, 
        startDate, 
        endDate,
        1 // 1-hour duration for attractions
      );
      
      // Include attraction details in the response
      const slotsWithAttractionDetails = await mapSlotsWithPricing(
        slots.map(slot => ({
          ...slot,
          attraction_name: attraction.name || attraction.title,
          attraction_details: {
            name: attraction.name || attraction.title,
            description: attraction.description,
            price: attraction.price || attraction.base_price
          }
        })),
        attraction
      );

      res.json({
        data: slotsWithAttractionDetails,
        meta: { 
          count: slots.length,
          attraction: {
            id: attraction.attraction_id || attraction.id,
            name: attraction.name || attraction.title,
            description: attraction.description,
            price: attraction.price || attraction.base_price
          }
        } 
      });
    } else {
      // Fallback to old service for other cases
      const data = await slotService.list({ attraction_id, date, start_date, end_date });
      let responseData = data;
      if (attraction_id) {
        try {
          const attraction = await attractionsService.getById(attraction_id);
          responseData = await mapSlotsWithPricing(data, attraction);
        } catch (err) {
          // If attraction lookup fails, proceed with raw data
          responseData = data;
        }
      }
      res.json({ data: responseData, meta: { count: responseData.length } });
    }
  } catch (err) {
    next(err);
  }
};

// GET /api/slots/:id
exports.getSlotById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await slotService.getById(id);
    res.json(row);
  } catch (err) {
    next(err);
  }
};