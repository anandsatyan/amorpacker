const express = require('express');
const axios = require('axios');
const router = express.Router();
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');
const Order = require('../models/orders');  // Import the new Order model

// GET route to fetch all filtered orders
router.get('/orders', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    try {
        const response = await axios.get(`${SHOPIFY_API_URL}/orders.json`, {
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
            },
            family: 4
        });

        const orders = response.data.orders;

        // Filter orders with either "Full Packaging" or "Boxes" tags
        const filteredOrders = orders.filter(order => {
            const tags = order.tags ? order.tags.split(',').map(tag => tag.trim()) : [];
            return tags.includes('Full Packaging') || tags.includes('Boxes');
        });

        // Fetch the status from your Orders model for each order
        let orderStatuses = await Order.find({
            orderId: { $in: filteredOrders.map(order => order.id) }
        });

        let orderHtml = `
        <style>
            body {
                font-family: 'Helvetica', 'Arial';
                font-size: 10pt !important;
            }
            .header-container {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .header-container h1 {
                margin: 0;
            }
            .header-container a {
                text-decoration: none;
                color: #000;
                font-size: 8pt !important;
            }
            tr:hover {
                background-color: #e0e0e0 !important;
            }
        </style>

        <div class="header-container">
            <h1>Full Packaging or Boxes Orders</h1>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <thead>
                <tr style="background-color: #f2f2f2; font-size: 8pt !important;">
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Order Name</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Date</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Customer Name</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Tags</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Destination</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Total Price</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Status</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Details</th>
                </tr>
            </thead>
            <tbody>
        `;

        let index = 0; 

        for (const order of filteredOrders) {
            const formattedDate = new Date(order.created_at).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
            });

            const tags = order.tags ? order.tags.split(',').map(tag => tag.trim()).join(', ') : 'No tags';
            const customerName = order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Guest';
            const destination = order.shipping_address ? `${order.shipping_address.country}` : 'No destination';
            const rowBgColor = index % 2 === 0 ? '#fdfdfd' : '#ffffff';

            // Find the corresponding status from the database
            const status = orderStatuses.find(o => o.orderId === order.id)?.status || 'Not Set';

            orderHtml += `
                <tr style="background-color: ${rowBgColor}; font-size: 10pt !important;">
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${order.name}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${formattedDate}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${customerName}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tags}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${destination}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">$${order.total_price}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${status}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                        <a href="/orders/${order.id}">View Details</a>
                    </td>
                </tr>
            `;
            index++; 
        }

        orderHtml += `
            </tbody>
        </table>
        `;

        res.send(orderHtml);
    } catch (error) {
        console.error("Error fetching orders:", error.response ? error.response.data : error.message);
        res.status(500).send('Error fetching orders');
    }
});

router.get('/orders/:orderId', async (req, res) => {
    const { orderId } = req.params;

    try {
        // Fetch the order details from Shopify
        const response = await axios.get(`${SHOPIFY_API_URL}/orders/${orderId}.json`, {
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
            },
            family: 4
        });

        const order = response.data.order;

        // Fetch the order status from your Orders model
        const orderStatus = await Order.findOne({ orderId });

        let orderHtml = `
        <h1>Order Details - ${order.name}</h1>
        <p>Date: ${new Date(order.created_at).toLocaleDateString()}</p>
        <p>Customer: ${order.customer.first_name} ${order.customer.last_name}</p>
        <p>Tags: ${order.tags}</p>
        <p>Total Price: $${order.total_price}</p>

        <h2>Line Items</h2>
        <ul>
        `;
        for (const lineItem of order.line_items) {
            orderHtml += `<li>${lineItem.name} - Qty: ${lineItem.quantity}</li>`;
        }

        orderHtml += `</ul>

        <h2>Order Status: ${orderStatus?.status || 'Design'}</h2>

        <form method="POST" action="/orders/${orderId}/status">
            <label for="status">Update Status:</label>
            <select name="status" id="status">
                <option value="Design" ${orderStatus?.status === 'Design' ? 'selected' : ''}>Design</option>
                <option value="Approval" ${orderStatus?.status === 'Approval' ? 'selected' : ''}>Approval</option>
                <option value="Print" ${orderStatus?.status === 'Print' ? 'selected' : ''}>Print</option>
                <option value="No Design" ${orderStatus?.status === 'No Design' ? 'selected' : ''}>No Design</option>
            </select>
            <button type="submit">Update</button>
        </form>
        `;

        res.send(orderHtml);
    } catch (error) {
        console.error("Error fetching order details:", error.response ? error.response.data : error.message);
        res.status(500).send('Error fetching order details');
    }
});

// POST route to update order status
router.post('/orders/:orderId/status', async (req, res) => {
    const { orderId } = req.params;  // Extract orderId from the URL
    const { status } = req.body;     // Extract status from the request body

    try {
        // Find the order by its orderId in the Orders model
        let order = await Order.findOne({ orderId });

        // If the order does not exist in the database, create a new entry with default status "Design"
        if (!order) {
            order = new Order({ orderId, status: status || 'Design' });
        } else {
            // If the order exists, update the status field
            order.status = status;
        }

        // Save the order document with the new status
        await order.save();

        // Redirect back to the order details page after updating
        res.redirect(`/orders/${orderId}`);
    } catch (error) {
        console.error("Error updating order status:", error.message);
        res.status(500).send('Error updating order status');
    }
});

module.exports = router;
