const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');

// Environment variables
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const FLEXPORT_API_TOKEN = process.env.FLEXPORT_API_TOKEN;
const BASIC_AUTH_USERNAME = process.env.AUTH_USER; // Basic Auth Username
const BASIC_AUTH_PASSWORD = process.env.AUTH_PASS; // Basic Auth Password

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
  console.log('Expected BASIC_AUTH_USERNAME:', process.env.BASIC_AUTH_USERNAME);
  console.log('Expected BASIC_AUTH_PASSWORD:', process.env.BASIC_AUTH_PASSWORD);

  const authHeader = req.headers.authorization || '';
  console.log('Authorization header received:', authHeader);

  if (!authHeader.startsWith('Basic ')) {
    console.error('Authorization header missing or malformed');
    return res.status(401).send('Unauthorized');
  }

  const [username, password] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  console.log('Decoded credentials:', { username, password });

  if (username === process.env.BASIC_AUTH_USERNAME && password === process.env.BASIC_AUTH_PASSWORD) {
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
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(buf, 'utf8', 'hex')
    .digest('base64');

  console.log('Shopify HMAC header:', hmacHeader);
  console.log('Generated HMAC hash:', generatedHash);

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

// Function to process the Shopify order
async function processOrder(order) {
  const lineItems = order.line_items;
  console.log('Processing line items:', lineItems);

  for (const item of lineItems) {
    console.log('Checking line item SKU:', item.sku);
    if (item.sku === 'BRC-FP-046') {
      const quantity = item.quantity;
      console.log(`Found matching SKU 'BRC-FP-046' with quantity ${quantity}`);

      // Create orders for the two component SKUs
      await createFlexportOrder('BRC-FP-046-1', quantity, order);
      await createFlexportOrder('BRC-FP-046-2', quantity, order);
    }
  }
}

// Function to create an order in Flexport
async function createFlexportOrder(skuCode, quantity, order) {
  try {
    const payload = {
      data: {
        type: 'order',
        attributes: {
          order_number: `Shopify-${order.id}-${skuCode}`, // Unique order number
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
              product_sku: skuCode,
              quantity: quantity,
            },
          ],
        },
      },
    };

    console.log(`Creating Flexport order for SKU ${skuCode} with payload:`, JSON.stringify(payload, null, 2));
    const response = await flexportAPI.post('/orders', payload);
    console.log(`Flexport order created successfully for SKU ${skuCode}:`, response.data);
  } catch (error) {
    console.error(`Error creating Flexport order for SKU ${skuCode}:`, error.response?.data || error.message);
  }
}

module.exports = router;
