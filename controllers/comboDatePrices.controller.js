const comboDatePricesModel = require('../models/comboDatePrices.model');

class ComboDatePricesController {
  // Get all date prices for a combo
  async getPrices(req, res) {
    try {
      const { combo_id } = req.params;
      const prices = await comboDatePricesModel.getComboDatePrices(parseInt(combo_id));

      res.json({
        success: true,
        data: prices,
      });
    } catch (error) {
      console.error('Error fetching combo date prices:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch combo date prices',
      });
    }
  }

  // Set price for a specific date
  async setPrice(req, res) {
    try {
      const { combo_id, date } = req.params;
      const { price } = req.body;

      if (!price || price < 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid price is required',
        });
      }

      const result = await comboDatePricesModel.setDatePrice(parseInt(combo_id), date, parseFloat(price));

      res.json({
        success: true,
        data: result,
        message: 'Date price set successfully',
      });
    } catch (error) {
      console.error('Error setting combo date price:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to set combo date price',
      });
    }
  }

  // Delete price for a specific date
  async deletePrice(req, res) {
    try {
      const { combo_id, date } = req.params;
      const result = await comboDatePricesModel.deleteDatePrice(parseInt(combo_id), date);

      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Date price not found',
        });
      }

      res.json({
        success: true,
        message: 'Date price deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting combo date price:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete combo date price',
      });
    }
  }

  // Bulk set prices for multiple dates
  async bulkSetPrices(req, res) {
    try {
      const { combo_id } = req.params;
      const { datePrices } = req.body;

      if (!Array.isArray(datePrices) || datePrices.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'datePrices must be a non-empty array',
        });
      }

      // Validate each datePrice
      for (const dp of datePrices) {
        if (!dp.date || !dp.price || dp.price < 0) {
          return res.status(400).json({
            success: false,
            error: 'Each datePrice must have valid date and price',
          });
        }
      }

      const results = await comboDatePricesModel.bulkSetDatePrices(parseInt(combo_id), datePrices);

      res.json({
        success: true,
        data: results,
        message: 'Bulk date prices set successfully',
      });
    } catch (error) {
      console.error('Error bulk setting combo date prices:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to bulk set combo date prices',
      });
    }
  }
}

module.exports = new ComboDatePricesController();
