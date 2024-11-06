const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const SKUMap = require('../models/SKUMap'); // Import the SKUMap model

// Environment variables
const FLEXPORT_API_TOKEN = process.env.FLEXPORT_API_TOKEN;
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const BASIC_AUTH_USERNAME = process.env.BASIC_AUTH_USERNAME;
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD;

// Axios instance for Flexport API
const flexportAPI = axios.create({
  baseURL: 'https://logistics-api.flexport.com/logistics/api/2024-07',
  headers: {
    Authorization: `Bearer ${FLEXPORT_API_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Middleware for Basic Authentication
const basicAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Basic ')) {
    console.error('Authorization header missing or malformed');
    return res.status(401).send('Unauthorized');
  }

  const [username, password] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  if (username === BASIC_AUTH_USERNAME && password === BASIC_AUTH_PASSWORD) {
    console.log('Basic Auth successful');
    return next();
  } else {
    console.error('Basic Auth failed');
    return res.status(401).send('Unauthorized');
  }
};

// Middleware to verify Shopify webhook signature (only for POST requests)
function verifyShopifyRequest(req, res, buf) {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const generatedHash = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(buf, 'utf8', 'hex')
    .digest('base64');

  if (generatedHash !== hmacHeader) {
    console.error('Shopify HMAC verification failed');
    throw new Error('Request verification failed');
  }
}

// Test GET endpoint to verify Basic Auth without HMAC
router.get('/webhook', basicAuth, (req, res) => {
  console.log("GET webhook endpoint hit - Basic Auth successful");
  res.status(200).send('GET request successful');
});

// Webhook endpoint for handling Shopify orders with Basic Auth and Shopify HMAC verification
router.post('/webhook', basicAuth, express.json({ verify: verifyShopifyRequest }), async (req, res) => {
  console.log("POST Webhook endpoint hit");
  try {
    const order = req.body;
    console.log('Received order data:', JSON.stringify(order, null, 2));
    await processOrder(order);
    res.status(200).send('Webhook processed successfully');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

// Function to process Shopify order items and map to Flexport orders
async function processOrder(order) {
  const lineItems = order.line_items;

  for (const item of lineItems) {
    // Find SKU mappings for the Shopify SKU in MongoDB
    const skuMap = await SKUMap.findOne({ shopifySKU: item.sku });

    if (skuMap) {
      console.log(`Processing components for Shopify SKU ${item.sku}`);
      
      // Process each component associated with the Shopify SKU
      for (const component of skuMap.components) {
        const flexportSKU = component.flexportSKU;
        const quantity = item.quantity * component.quantity; // Adjust quantity based on order
        await createFlexportOrder(flexportSKU, quantity, order, item.sku);
      }
    } else {
      console.warn(`No SKU mapping found for Shopify SKU ${item.sku}`);
    }
  }
}

// Function to create an order in Flexport for each component
async function createFlexportOrder(flexportSKU, quantity, order, shopifySKU) {
  try {
    const payload = {
      data: {
        type: 'order',
        attributes: {
          order_number: `Shopify-${order.id}-${flexportSKU}`, // Unique order number
          destination_address: {
            name: order.shipping_address.name,
            company: order.shipping_address.company,
            street1: order.shipping_address.address1,
            street2: order.shipping_address.address2,
            city: order.shipping_address.city,
            state: order.shipping_address.province,
            postal_code: order.shipping_address.zip,
            country: order.shipping_address.country_code,
            phone_number: order.shipping_address.phone,
            email: order.email,
          },
          order_lines: [
            {
              product_sku: flexportSKU,
              quantity: quantity,
            },
          ],
        },
      },
    };

    console.log(`Creating Flexport order for SKU ${flexportSKU} with payload:`, JSON.stringify(payload, null, 2));
    const response = await flexportAPI.post('/orders', payload);
    console.log(`Flexport order created successfully for Shopify SKU ${shopifySKU} component ${flexportSKU}:`, response.data);
  } catch (error) {
    console.error(`Error creating Flexport order for component ${flexportSKU}:`, error.response?.data || error.message);
  }
}

module.exports = router;
