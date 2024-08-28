// routes/orders.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');

router.get('/', async (req, res) => {
    try {
        const response = await axios.get(`${SHOPIFY_API_URL}/orders.json`, {
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
            },
        });

        const orders = response.data.orders;
        let orderHtml = `
            <style>body {font-family: 'Helvetica', 'Arial'; font-size: 8pt !important;}</style>
            <h1>Order List</h1>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f2f2f2; font-size: 8pt !important;">
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Order Name</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Date</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Customer Name</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Tags</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Destination</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Total Price</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Actions</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Export Invoice</th>
                </tr>
              </thead>
              <tbody>
        `;

        orders.forEach((order, index) => {
            const formattedDate = new Date(order.created_at).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });

            const tags = order.tags ? order.tags.split(',').map(tag => tag.trim()).join(', ') : 'No tags';
            const customerName = order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Guest';
            const destination = order.shipping_address ? `${order.shipping_address.city}, ${order.shipping_address.country}` : 'No destination';

            const rowBgColor = index % 2 === 0 ? '#fdfdfd' : '#ffffff';

            orderHtml += `
              <tr style="background-color: ${rowBgColor}; font-size: 9pt !important;">
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${order.name}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${formattedDate}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${customerName}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tags}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${destination}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">$${order.total_price}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="/generate-packing-slip/${order.id}">Packing Slip</a></td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="/generate-customs-invoice/${order.id}" target="_blank">Export Invoice</a></td>
              </tr>
            `;
        });

        orderHtml += `
              </tbody>
            </table>
            <style>
                tr:hover {
                background-color: #e0e0e0 !important;
                }
            </style>
        `;

        res.send(orderHtml);
    } catch (error) {
        console.error("Error fetching orders:", error.response ? error.response.data : error.message);
        res.status(500).send('Error fetching orders');
    }
});

module.exports = router;
