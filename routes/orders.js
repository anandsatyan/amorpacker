const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const SKUMap = require('../models/SKUMap');
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig'); // Import Shopify API config

// Environment variables
const FLEXPORT_API_TOKEN = process.env.FLEXPORT_API_TOKEN;
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const BASIC_AUTH_USERNAME = process.env.BASIC_AUTH_USERNAME;
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD;

// Axios instances for APIs
const flexportAPI = axios.create({
  baseURL: 'https://logistics-api.flexport.com/logistics/api/2024-07',
  headers: {
    Authorization: `Bearer ${FLEXPORT_API_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

const shopifyAPI = axios.create({
  baseURL: SHOPIFY_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': ACCESS_TOKEN, // Use Access Token from shopifyConfig
  },
});

// Middleware for Basic Authentication
const basicAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Basic ')) {
    return res.status(401).send('Unauthorized');
  }

  const [username, password] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  if (username === BASIC_AUTH_USERNAME && password === BASIC_AUTH_PASSWORD) {
    return next();
  } else {
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
    throw new Error('Request verification failed');
  }
}

// Step 1: List unfulfilled Shopify orders
router.get('/unfulfilled-orders', basicAuth, async (req, res) => {
  try {
    const response = await shopifyAPI.get('/orders.json?fulfillment_status=unfulfilled');
    const unfulfilledOrders = response.data.orders;

    // Render orders as clickable links to view line items
    res.send(`
      <h1>Unfulfilled Orders</h1>
      <ul>
        ${unfulfilledOrders.map(order => `
          <li>
            Order ID: ${order.id} - <a href="/flexport/order/${order.id}">View Line Items</a>
          </li>
        `).join('')}
      </ul>
    `);
  } catch (error) {
    console.error('Error fetching unfulfilled orders:', error);
    res.status(500).send('Error fetching unfulfilled orders');
  }
});

// Step 2: Display line items for a specific order with checkboxes
router.get('/order/:orderId', basicAuth, async (req, res) => {
  const { orderId } = req.params;
  try {
    const response = await shopifyAPI.get(`/orders/${orderId}.json`);
    const order = response.data.order;

    res.send(`
      <h2>Order ID: ${orderId}</h2>
      <form id="flexportForm" action="/flexport/fulfill-items" method="POST">
        ${order.line_items.map(item => `
          <div>
            <input type="checkbox" name="lineItems" value="${item.sku}|${item.quantity}">
            ${item.title} - SKU: ${item.sku}, Quantity: ${item.quantity}
          </div>
        `).join('')}
        <input type="hidden" name="orderId" value="${orderId}">
        <button type="submit">Flexport Selected</button>
      </form>
      <script>
        document.getElementById('flexportForm').onsubmit = async (event) => {
          event.preventDefault();
          const formData = new FormData(event.target);
          const response = await fetch('/flexport/fulfill-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.fromEntries(formData))
          });
          const result = await response.json();
          alert(result.message);
        };
      </script>
    `);
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).send('Error fetching order details');
  }
});

// Step 3: Fulfill selected items with a single Flexport order
router.post('/fulfill-items', basicAuth, async (req, res) => {
  const { orderId, lineItems } = req.body;
  const items = Array.isArray(lineItems) ? lineItems : [lineItems]; // Ensure array format

  try {
    const order = await shopifyAPI.get(`/orders/${orderId}.json`);
    const destination = order.data.order.shipping_address;
    const flexportOrderLines = [];

    // Prepare payload for selected items
    for (const item of items) {
      const [sku, quantity] = item.split('|');
      const skuMap = await SKUMap.findOne({ shopifySKU: sku });
      if (!skuMap) continue;

      // Add each component of the SKU as an order line
      for (const component of skuMap.components) {
        flexportOrderLines.push({
          product_sku: component.flexportSKU,
          quantity: quantity * component.quantity,
        });
      }
    }

    // Only proceed if there are Flexport order lines
    if (flexportOrderLines.length > 0) {
      const payload = {
        data: {
          type: 'order',
          attributes: {
            order_number: `Shopify-${orderId}`,
            destination_address: {
              name: destination.name,
              company: destination.company,
              street1: destination.address1,
              street2: destination.address2,
              city: destination.city,
              state: destination.province,
              postal_code: destination.zip,
              country: destination.country_code,
              phone_number: destination.phone,
              email: order.data.order.email,
            },
            order_lines: flexportOrderLines,
          },
        },
      };

      // Send payload to Flexport
      const response = await flexportAPI.post('/orders', payload);
      console.log('Flexport order created successfully:', response.data);
      res.json({ message: 'Flexport order created successfully' });
    } else {
      res.json({ message: 'No Flexport-fulfillable items selected' });
    }
  } catch (error) {
    console.error('Error creating Flexport order:', error);
    res.status(500).json({ message: 'Error creating Flexport order' });
  }
});

module.exports = router;
