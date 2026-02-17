const attractionDatePricesModel = require('../models/attractionDatePrices.model');

class AttractionDatePricesController {
  // Get all date prices for an attraction
  async getPrices(req, res) {
    try {
      const { attraction_id } = req.params;
      const prices = await attractionDatePricesModel.getAttractionDatePrices(parseInt(attraction_id));

      res.json({
        success: true,
        data: prices,
      });
    } catch (error) {
      console.error('Error fetching attraction date prices:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch attraction date prices',
      });
    }
  }

  // Set price for a specific date
  async setPrice(req, res) {
    try {
      const { attraction_id, date } = req.params;
      const { price } = req.body;

      if (!price || price < 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid price is required',
        });
      }

      const result = await attractionDatePricesModel.setDatePrice(parseInt(attraction_id), date, parseFloat(price));

      res.json({
        success: true,
        data: result,
        message: 'Date price set successfully',
      });
    } catch (error) {
      console.error('Error setting attraction date price:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to set attraction date price',
      });
    }
  }

  // Delete price for a specific date
  async deletePrice(req, res) {
    try {
      const { attraction_id, date } = req.params;
      const result = await attractionDatePricesModel.deleteDatePrice(parseInt(attraction_id), date);

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
      console.error('Error deleting attraction date price:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete attraction date price',
      });
    }
  }

  // Bulk set prices for multiple dates
  async bulkSetPrices(req, res) {
    try {
      const { attraction_id } = req.params;
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

      const results = await attractionDatePricesModel.bulkSetDatePrices(parseInt(attraction_id), datePrices);

      res.json({
        success: true,
        data: results,
        message: 'Bulk date prices set successfully',
      });
    } catch (error) {
      console.error('Error bulk setting attraction date prices:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to bulk set attraction date prices',
      });
    }
  }
}

module.exports = new AttractionDatePricesController();
