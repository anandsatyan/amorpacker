// app.js
const express = require('express');
const bodyParser = require('body-parser'); // Import body-parser
const path = require('path');
const app = express();
require('dotenv').config();

const mongoose = require('mongoose');

// Middleware to parse JSON body
app.use(express.json());
app.use(bodyParser.json());

// MongoDB connection
mongoose.connect(process.env.DB_QUERY_STRING, {
  ssl: true, // Add this option for MongoDB Atlas
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('MongoDB connection error: ', err);
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Import routes
const homeRoute = require('./routes/home');
const ordersRoute = require('./routes/orders');
const csbvRoute = require('./routes/csbv');
const packingSlipRoute = require('./routes/packingSlip');
const customsInvoiceRoute = require('./routes/customsInvoice');
const createFedexShipment = require('./routes/createFedexShipment'); // Adjust the path if necessary
const inventoryRoute = require('./routes/inventory');
const designRoute = require('./routes/design');
const flexportRoute = require('./routes/flexport');

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

//Flexport route
app.use('/flexport', flexportRoute);

// CSBV route
app.use('/csbv', csbvRoute);

// Design route
app.use('/design', designRoute);

// Inventory Route
app.use('/inventory', inventoryRoute);


// Packing slip route
app.use('/packing-slips', packingSlipRoute);

// Customs invoice route
app.use('/invoices', customsInvoiceRoute); // Corrected to mount at '/invoices'

// Create FedEx shipment
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
