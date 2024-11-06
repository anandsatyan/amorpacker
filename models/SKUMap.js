const mongoose = require('mongoose');

const skuMapSchema = new mongoose.Schema({
  shopifySKU: { type: String, required: true, unique: true }, // Main Shopify product SKU
  components: [
    {
      componentSKU: { type: String, required: true },           // Shopify component SKU, e.g., BRC-FP-046-1
      flexportSKU: { type: String, required: true },            // Flexport SKU, e.g., DQCD396DGF4
      quantity: { type: Number, default: 1 }                    // Quantity per main SKU
    }
  ],
}, { timestamps: true });

module.exports = mongoose.model('SKUMap', skuMapSchema);