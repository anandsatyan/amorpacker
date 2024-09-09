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
    <style>
        body {
            font-family: 'Helvetica', 'Arial';
            font-size: 8pt !important;
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
    </style>
    <div class="header-container">
        <h1>Order List</h1>
        <a href="/orders/all">All Orders</a>
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
          <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Actions</th>
          <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Invoice</th>
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
            const destination = order.shipping_address ? `${order.shipping_address.country}` : 'No destination';

            const rowBgColor = index % 2 === 0 ? '#fdfdfd' : '#ffffff';

            orderHtml += `
              <tr style="background-color: ${rowBgColor}; font-size: 8pt !important;">
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${order.name}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${formattedDate}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${customerName}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tags}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${destination}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">$${order.total_price}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="/generate-packing-slip/${order.id}">Pack</a></td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="/generate-customs-invoice/${order.id}" target="_blank">Invoice</a></td>
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

// Utility function to fetch all pages of orders
const fetchAllOrders = async (url, orders = []) => {
  try {
      const response = await axios.get(url, {
          headers: {
              'X-Shopify-Access-Token': ACCESS_TOKEN,
          },
      });

      const newOrders = response.data.orders;
      orders = orders.concat(newOrders);

      // Check for pagination in the Link header
      const linkHeader = response.headers['link'];
      if (linkHeader) {
          const nextPageLink = linkHeader.split(',').find((s) => s.includes('rel="next"'));
          if (nextPageLink) {
              const nextPageUrl = nextPageLink.split(';')[0].trim().slice(1, -1);
              return fetchAllOrders(nextPageUrl, orders);
          }
      }

      return orders;
  } catch (error) {
      console.error("Error fetching orders:", error.response ? error.response.data : error.message);
      throw new Error('Error fetching orders');
  }
};

// Function to get the last four months
const getLastFourMonths = () => {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 4; i++) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(month.toLocaleString('default', { month: 'long', year: 'numeric' }));
  }
  return months;
};

// Function to filter orders by month and calculate total sales
const filterOrdersByMonth = (orders, month) => {
  const filteredOrders = orders.filter(order => {
      const orderDate = new Date(order.created_at);
      const orderMonth = orderDate.toLocaleString('default', { month: 'long', year: 'numeric' });
      return orderMonth === month;
  });

  // Calculate total sales for the filtered orders
  const totalSales = filteredOrders.reduce((sum, order) => sum + parseFloat(order.total_price), 0);

  return { filteredOrders, totalSales };
};

// Route to fetch and display orders for a specific month
router.get('/all', async (req, res) => {
  try {
      const allOrders = await fetchAllOrders(`${SHOPIFY_API_URL}/orders.json?status=any&order=created_at+desc`);
      
      const lastFourMonths = getLastFourMonths();
      let selectedMonth = req.query.month || lastFourMonths[0]; // Default to the current month if no query parameter is present

      // Filter orders for the selected month and calculate total sales
      const { filteredOrders, totalSales } = filterOrdersByMonth(allOrders, selectedMonth);

      let orderHtml = `
          <style>body {font-family: 'Helvetica', 'Arial'; font-size: 8pt !important;}</style>
          <h1>Orders for ${selectedMonth}</h1>
          <div>
              ${lastFourMonths.map(month => `<a href="?month=${encodeURIComponent(month)}">${month}</a>`).join(' | ')}
          </div>
      `;

      // Display order count and total sales for the selected month
      orderHtml += `<p><strong>Order Count:</strong> ${filteredOrders.length} | <strong>Total Sales:</strong> $${totalSales.toFixed(2)}</p>`;

      // Check if there are orders for the selected month
      if (filteredOrders.length > 0) {
          orderHtml += `
              <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead>
                  <tr style="background-color: #f2f2f2; font-size: 8pt !important;">
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Order Name</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Date</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Customer Name</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Tags</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Destination</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Total Price</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Actions</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Invoice</th>
                  </tr>
                </thead>
                <tbody>
          `;

          filteredOrders.forEach((order, index) => {
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
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="/generate-packing-slip/${order.id}">Slip</a></td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="/generate-customs-invoice/${order.id}" target="_blank">Invoice</a></td>
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
      } else {
          orderHtml += `<p>No orders for this month.</p>`;
      }

      res.send(orderHtml);
  } catch (error) {
      console.error(error.message);
      res.status(500).send('Error fetching orders');
  }
});

module.exports = router;
