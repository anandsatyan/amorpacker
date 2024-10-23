const mongoose = require('mongoose');

const CountryZoneMappingSchema = new mongoose.Schema({
    courier: { type: String, required: true },
    country: { type: String, required: true },
    zone: { type: String, required: true },
}, { collection: 'country_zone_mappings' });

module.exports = mongoose.model('CountryZoneMapping', CountryZoneMappingSchema);
