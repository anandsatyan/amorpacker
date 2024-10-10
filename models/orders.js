const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },  // Shopify order ID
    status: { 
        type: String, 
        enum: ['Design', 'Approval', 'Print', 'No Design'], // Include the new status
        default: 'Design'  
    },    // You can add other fields as needed, like customer details, order info, etc.
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
