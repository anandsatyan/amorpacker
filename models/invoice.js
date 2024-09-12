const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  invoiceNumber: { type: String, required: false },
  invoiceDate: { type: Date, required: true },
  customerName: { type: String, required: false },
  orderName: { type: String, required: true }, 
  htmlContent: { type: String, required: true },
  isMaster: { type: Boolean, default: false },  
  masterInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },  
});

module.exports = mongoose.model('Invoice', invoiceSchema);
