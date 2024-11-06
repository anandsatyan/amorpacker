const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const SKUMap = require('../models/SKUMap');
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');

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
    'X-Shopify-Access-Token': ACCESS_TOKEN,
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

// List unfulfilled Shopify orders in a beautified HTML table
router.get('/unfulfilled-orders', basicAuth, async (req, res) => {
  try {
    const response = await shopifyAPI.get('/orders.json?fulfillment_status=unfulfilled');
    const unfulfilledOrders = response.data.orders;

    // Render orders in a formatted HTML table
    res.send(`
      <html>
        <head>
          <title>Unfulfilled Orders</title>
          <style>
            body { font-family: Arial, sans-serif; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
            th { background-color: #f2f2f2; }
            tr:hover { background-color: #f9f9f9; }
            .view-link { color: #007bff; text-decoration: none; }
            .view-link:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h1>Unfulfilled Orders</h1>
          <table>
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Order Number</th>
                <th>Order Value</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${unfulfilledOrders.map(order => `
                <tr>
                  <td>${order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Guest'}</td>
                  <td>${order.name}</td>
                  <td>$${parseFloat(order.total_price).toFixed(2)}</td>
                  <td><a href="/flexport/order/${order.id}" class="view-link">View Line Items</a></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
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
      <html>
        <head>
          <title>Order Line Items</title>
          <style>
            body { font-family: Arial, sans-serif; }
            h2 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
            th { background-color: #f2f2f2; }
            tr:hover { background-color: #f9f9f9; }
            .action-button { background-color: #007bff; color: #fff; border: none; padding: 10px 20px; cursor: pointer; }
            .action-button:hover { background-color: #0056b3; }
          </style>
        </head>
        <body>
          <h2>Order ID: ${orderId} - ${order.name}</h2>
          <form id="flexportForm" action="/flexport/fulfill-items" method="POST">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>
                ${order.line_items.map(item => `
                  <tr>
                    <td><input type="checkbox" name="lineItems" value="${item.sku}|${item.quantity}"></td>
                    <td>${item.title}</td>
                    <td>${item.sku}</td>
                    <td>${item.quantity}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <input type="hidden" name="orderId" value="${orderId}">
            <button type="submit" class="action-button">Flexport Selected</button>
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
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).send('Error fetching order details');
  }
});

module.exports = router;
