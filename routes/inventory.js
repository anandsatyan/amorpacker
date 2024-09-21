const express = require('express');
const router = express.Router();
const axios = require('axios');
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');
const { getCurrentMonthDates, calculateComponentsForOrder } = require('../utils/helpers'); // We'll define these helpers

// Route to calculate stock movement for the current month
router.get('/stock-movement', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    try {
        // Step 1: Get all orders for the last month
        const { startDate, endDate } = getCurrentMonthDates(); // Utility function to get last month's first and last day
        console.log('Start Date:', startDate);
        console.log('End Date:', endDate);
        
        const response = await axios.get(`${SHOPIFY_API_URL}/orders.json?status=any&order=created_at+desc`, {
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
            },
            params: {
                created_at_min: startDate,
                created_at_max: endDate,
                limit: 10,   
            },
            family: 4
        });

        const orders = response.data.orders;
        console.log("Fetched Orders:", response.data);
        
        const stockMovements = [];

        // Step 2: Loop through each order and calculate the stock movement
        for (const order of orders) {
            const orderDate = new Date(order.created_at).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            });
            const orderId = order.name;
            console.log('Processing Order:', orderId);

            // Step 3: Process each line item in the order
            for (const item of order.line_items) {
                const productName = item.title;
                const qtySold = item.quantity;

                // Step 4: Calculate the components or fallback to the main product itself
                const components = await calculateComponentsForOrder(order);

                if (components.length === 0) {
                    // If no components, use the main product
                    stockMovements.push({
                        Date: orderDate,
                        'Order ID': orderId,
                        'Internal Product Code': item.sku || productName,
                        'Packaging List Name': productName,
                        'Qty Sold': qtySold,
                    });
                } else {
                    // If components are available, list them instead
                    for (const component of components) {
                        stockMovements.push({
                            Date: orderDate,
                            'Order ID': orderId,
                            'Internal Product Code': component.internalProductCode,
                            'Packaging List Name': component.packagingListName,
                            'Qty Sold': component.quantity, // Quantity for each component
                        });
                    }
                }
            }
        }        

        // Insert the generated table into the DOM (for example, into a div with id 'tableContainer')
        let orderItems = generateTable(stockMovements);

        res.send(`
            <html>
                <head>
                    <title>Stock Movement Report</title>
                    <style>
                        body {
                            font-family: sans-serif;
                        }
                        th, td {
                            padding: 10px;
                        }
                    </style>
                </head>
                <body>
                    <h1>Stock Movement Report</h1>
                    ${orderItems}
                </body>
            </html>
        `);


    } catch (error) {
        console.error('Error fetching stock movements:', error);
        res.status(500).send('Error fetching stock movements');
    }
});

function generateTable(data) {
    let table = '<table border="1">';
    
    // Add table headers
    table += '<tr>';
    table += '<th>Date</th>';
    table += '<th>Order ID</th>';
    table += '<th>Internal Product Code</th>';
    table += '<th>Packaging List Name</th>';
    table += '<th>Qty Sold</th>';
    table += '</tr>';
    
    // Add table rows
    data.forEach(item => {
        table += '<tr>';
        table += `<td>${item['Date']}</td>`;
        table += `<td>${item['Order ID']}</td>`;
        table += `<td>${item['Internal Product Code']}</td>`;
        table += `<td>${item['Packaging List Name']}</td>`;
        table += `<td>${item['Qty Sold']}</td>`;
        table += '</tr>';
    });
    
    table += '</table>';
    return table;
}

module.exports = router;
