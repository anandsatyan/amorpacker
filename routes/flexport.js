const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');

// Environment variables
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const FLEXPORT_API_TOKEN = process.env.FLEXPORT_API_TOKEN;
const AUTH_USER = process.env.AUTH_USER; // Basic Auth Username
const AUTH_PASS = process.env.AUTH_PASS; // Basic Auth Password

// Axios instance for Flexport API
const flexportAPI = axios.create({
  baseURL: 'https://logistics-api.flexport.com/logistics/api/2024-07/orders',
  headers: {
    Authorization: `Bearer ${FLEXPORT_API_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Middleware for Basic Authentication
const basicAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const [username, password] = Buffer.from(authHeader.split(' ')[1] || '', 'base64').toString().split(':');

  if (username === AUTH_USER && password === AUTH_PASS) {
    return next();
  } else {
    res.status(401).send('Unauthorized');
  }
};

// Middleware to verify Shopify webhook signature
function verifyShopifyRequest(req, res, buf) {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const generatedHash = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(buf, 'utf8', 'hex')
    .digest('base64');

  if (generatedHash !== hmacHeader) {
    throw new Error('Request verification failed');
  }
}

// Webhook endpoint with basic auth and Shopify HMAC verification
router.post('/webhook', basicAuth, express.json({ verify: verifyShopifyRequest }), async (req, res) => {
  try {
    const order = req.body;
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

  for (const item of lineItems) {
    if (item.sku === 'BRC-FP-046') {
      const quantity = item.quantity;

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

    const response = await flexportAPI.post('/orders', payload);
    console.log(`Flexport order created for SKU ${skuCode}:`, response.data);
  } catch (error) {
    console.error(`Error creating Flexport order for SKU ${skuCode}:`, error.response?.data || error.message);
  }
}

module.exports = router;
