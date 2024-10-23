const mongoose = require('mongoose');

const CourierRatesSchema = new mongoose.Schema({
    courier: { type: String, required: true },
    zone: { type: String, required: true },
    country: { type: String }, // For special rates
    specialRates: { type: Boolean, default: false },
    rates: [
        {
            weight: { type: Number, required: true },
            rate: { type: Number, required: true },
        }
    ]
}, { collection: 'courier-rates' });

module.exports = mongoose.model('CourierRates', CourierRatesSchema);
