const dynamicPricingModel = require('../models/dynamicPricing.model');

class DynamicPricingController {
  // Get all rules with optional filtering
  async getRules(req, res) {
    try {
      const { target_type, target_id, date, active } = req.query;

      const filters = {};
      if (target_type) filters.target_type = target_type;
      if (target_id) filters.target_id = parseInt(target_id);
      if (date) filters.date = date;
      if (active !== undefined) filters.active = active === 'true';

      const rules = await dynamicPricingModel.getRules(filters);

      res.json({
        success: true,
        data: rules,
      });
    } catch (error) {
      console.error('Error fetching dynamic pricing rules:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch dynamic pricing rules',
      });
    }
  }

  // Get a specific rule by ID
  async getRuleById(req, res) {
    try {
      const { rule_id } = req.params;
      const rule = await dynamicPricingModel.getRuleById(parseInt(rule_id));

      if (!rule) {
        return res.status(404).json({
          success: false,
          error: 'Dynamic pricing rule not found',
        });
      }

      res.json({
        success: true,
        data: rule,
      });
    } catch (error) {
      console.error('Error fetching dynamic pricing rule:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch dynamic pricing rule',
      });
    }
  }

  // Create a new rule
  async createRule(req, res) {
    try {
      const ruleData = req.body;

      // Validate required fields
      const requiredFields = ['name', 'target_type', 'date_ranges', 'price_adjustment_type', 'price_adjustment_value'];
      for (const field of requiredFields) {
        if (!ruleData[field]) {
          return res.status(400).json({
            success: false,
            error: `Missing required field: ${field}`,
          });
        }
      }

      // Validate date_ranges
      if (!Array.isArray(ruleData.date_ranges) || ruleData.date_ranges.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'date_ranges must be a non-empty array',
        });
      }

      for (const range of ruleData.date_ranges) {
        if (!range.from || !range.to) {
          return res.status(400).json({
            success: false,
            error: 'Each date range must have from and to dates',
          });
        }
        if (new Date(range.from) > new Date(range.to)) {
          return res.status(400).json({
            success: false,
            error: 'from date must be before or equal to to date in each range',
          });
        }
      }

      // Validate target_type and target_id relationship
      if (ruleData.target_type === 'all' && ruleData.target_id) {
        return res.status(400).json({
          success: false,
          error: 'target_id must be null when target_type is "all"',
        });
      }

      if (ruleData.target_type !== 'all' && !ruleData.target_id) {
        return res.status(400).json({
          success: false,
          error: 'target_id is required when target_type is not "all"',
        });
      }

      // Validate price_adjustment_type
      if (!['fixed', 'percentage'].includes(ruleData.price_adjustment_type)) {
        return res.status(400).json({
          success: false,
          error: 'price_adjustment_type must be "fixed" or "percentage"',
        });
      }

      // Validate day_selection_mode
      const validModes = ['all_days', 'weekends_only', 'custom_weekdays', 'specific_dates'];
      if (ruleData.day_selection_mode && !validModes.includes(ruleData.day_selection_mode)) {
        return res.status(400).json({
          success: false,
          error: `day_selection_mode must be one of: ${validModes.join(', ')}`,
        });
      }

      if (ruleData.day_selection_mode === 'custom_weekdays' && (!Array.isArray(ruleData.selected_weekdays) || ruleData.selected_weekdays.length === 0)) {
        return res.status(400).json({
          success: false,
          error: 'selected_weekdays is required when day_selection_mode is custom_weekdays',
        });
      }

      if (ruleData.day_selection_mode === 'specific_dates' && (!Array.isArray(ruleData.custom_dates) || ruleData.custom_dates.length === 0)) {
        return res.status(400).json({
          success: false,
          error: 'custom_dates is required when day_selection_mode is specific_dates',
        });
      }

      const rule = await dynamicPricingModel.createRule(ruleData);

      res.status(201).json({
        success: true,
        data: rule,
        message: 'Dynamic pricing rule created successfully',
      });
    } catch (error) {
      console.error('Error creating dynamic pricing rule:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create dynamic pricing rule',
      });
    }
  }

  // Update an existing rule
  async updateRule(req, res) {
    try {
      const { rule_id } = req.params;
      const updates = req.body;

      // Validate price_adjustment_type if provided
      if (updates.price_adjustment_type && !['fixed', 'percentage'].includes(updates.price_adjustment_type)) {
        return res.status(400).json({
          success: false,
          error: 'price_adjustment_type must be "fixed" or "percentage"',
        });
      }

      // Validate target_type and target_id relationship if both are provided
      if (updates.target_type === 'all' && updates.target_id !== undefined && updates.target_id !== null) {
        return res.status(400).json({
          success: false,
          error: 'target_id must be null when target_type is "all"',
        });
      }

      if (updates.target_type && updates.target_type !== 'all' && updates.target_id === null) {
        return res.status(400).json({
          success: false,
          error: 'target_id is required when target_type is not "all"',
        });
      }

      const rule = await dynamicPricingModel.updateRule(parseInt(rule_id), updates);

      if (!rule) {
        return res.status(404).json({
          success: false,
          error: 'Dynamic pricing rule not found',
        });
      }

      res.json({
        success: true,
        data: rule,
        message: 'Dynamic pricing rule updated successfully',
      });
    } catch (error) {
      console.error('Error updating dynamic pricing rule:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update dynamic pricing rule',
      });
    }
  }

  // Delete a rule
  async deleteRule(req, res) {
    try {
      const { rule_id } = req.params;
      const rule = await dynamicPricingModel.deleteRule(parseInt(rule_id));

      if (!rule) {
        return res.status(404).json({
          success: false,
          error: 'Dynamic pricing rule not found',
        });
      }

      res.json({
        success: true,
        message: 'Dynamic pricing rule deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting dynamic pricing rule:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete dynamic pricing rule',
      });
    }
  }

  // Get applicable rules for a specific target and date
  async getApplicableRules(req, res) {
    try {
      const { target_type, target_id, date } = req.query;

      if (!target_type || !date) {
        return res.status(400).json({
          success: false,
          error: 'target_type and date are required',
        });
      }

      const rules = await dynamicPricingModel.getApplicableRules(
        target_type,
        target_id ? parseInt(target_id) : null,
        date
      );

      res.json({
        success: true,
        data: rules,
      });
    } catch (error) {
      console.error('Error fetching applicable rules:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch applicable rules',
      });
    }
  }
}

module.exports = new DynamicPricingController();