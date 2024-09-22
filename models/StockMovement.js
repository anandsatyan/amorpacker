const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema({
  date: String,
  orderId: String,
  internalProductCode: String,
  packagingListName: String,
  qtySold: Number,
});

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

module.exports = StockMovement;