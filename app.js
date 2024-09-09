// app.js
const express = require('express');
const bodyParser = require('body-parser'); // Import body-parser
const path = require('path');
const app = express();
app.use(bodyParser.json());
require('dotenv').config();

// Import routes
const homeRoute = require('./routes/home');
const ordersRoute = require('./routes/orders');
const packingSlipRoute = require('./routes/packingSlip');
const customsInvoiceRoute = require('./routes/customsInvoice');
const createFedexShipment = require('./routes/createFedexShipment'); // Adjust the path if necessary

// Import middleware
const basicAuthMiddleware = require('./middleware/basicAuth');

// Use middleware
app.use(basicAuthMiddleware);

// Home route
app.use('/', homeRoute);

// File Upload route
app.use('/uploads', express.static('uploads'));

// Orders route
app.use('/orders', ordersRoute);

// Packing slip route
app.use('/generate-packing-slip', packingSlipRoute);

// Customs invoice route
app.use('/generate-customs-invoice', customsInvoiceRoute);

// Create Fedex shipment
app.use('/create-shipment', createFedexShipment);

// Serve the robots.txt file and set headers
app.use('/robots.txt', (req, res) => {
    res.sendFile(path.join(__dirname, 'robots.txt'));
});
app.use((req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
});

// Start the server
app.listen(3000, () => {
    console.log('App is running on http://localhost:3000');
});
