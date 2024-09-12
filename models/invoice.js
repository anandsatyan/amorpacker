const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  orderId: String,
  invoiceNumber: String,
  invoiceDate: String,
  invoiceHtml: String,
  isMaster: { type: Boolean, default: false },  // Indicates if this is the master invoice
  masterInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },  // Reference to master invoice (for child invoices)
});

module.exports = mongoose.model('Invoice', invoiceSchema);
