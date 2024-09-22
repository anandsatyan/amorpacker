const express = require('express');
const router = express.Router();
const axios = require('axios');
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');
const StockMovement = require('../models/StockMovement');
const { calculateComponentsForOrder } = require('../utils/helpers');

// Helper function to fetch all orders from Shopify API
const fetchAllOrders = async () => {
    let allOrders = [];
    let hasNextPage = true;
    let pageInfo = null;

    while (hasNextPage) {
        const response = await axios.get(`${SHOPIFY_API_URL}/orders.json`, {
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
            },
            params: {
                limit: 250,  // Max limit for Shopify API
                page_info: pageInfo,
                status: 'any',
                order: 'created_at desc',
            },
        });

        const orders = response.data.orders;
        allOrders = allOrders.concat(orders);
        pageInfo = response.data.page_info;
        hasNextPage = pageInfo ? true : false;
    }

    return allOrders;
};

// Route to show list of order names as buttons
router.get('/view-orders', async (req, res) => {
    try {
        // Fetch all orders from Shopify
        const orders = await fetchAllOrders();

        // Fetch existing stock movements in one query
        const existingStockMovements = await StockMovement.find({
            orderId: { $in: orders.map(order => order.name) }, // Use order.name (like #1160)
        });

        // Store existing stock movements in a map for quick lookup
        const existingStockMovementMap = new Map();
        existingStockMovements.forEach(movement => {
            existingStockMovementMap.set(movement.orderId, true);
        });

        // Filter out orders that already have stock movements
        const ordersWithoutStockMovement = orders.filter(order => !existingStockMovementMap.has(order.name));

        // Generate HTML buttons for each order that does not have a stock movement yet
        let buttonsHtml = ordersWithoutStockMovement.map(order => {
            return `<button id="${order.name}" onclick="handleClick('${order.name}')">${order.name}</button>`;
        }).join('');

        res.send(`
            <html>
                <head>
                    <title>Order List</title>
                    <style>
                        body { font-family: sans-serif; }
                        button { padding: 10px; margin: 5px; }
                    </style>
                    <script>
                        async function handleClick(orderName) {
                            try {
                                const response = await fetch('/inventory/process-order', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({ orderName }),  // Pass orderName in body
                                });

                                const result = await response.json();
                                if (result.success) {
                                    document.getElementById(orderName).remove();  // Remove button on success
                                } else {
                                    alert(result.message || 'Error processing order');
                                }
                            } catch (error) {
                                console.error('Error processing order:', error);
                                alert('Error processing order');
                            }
                        }
                    </script>
                </head>
                <body>
                    <h1>Order List</h1>
                    <div id="orders">
                        ${buttonsHtml}
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).send('Error fetching orders');
    }
});


// Route to process a specific order and insert stock movement
router.post('/process-order', async (req, res) => {
    try {
        const { orderName } = req.body;  // Extract orderName from request body

        if (!orderName) {
            console.error('Order Name is missing');
            return res.status(400).json({ success: false, message: 'Order Name is required' });
        }

        console.log(`Processing order name: ${orderName}`);

        // Fetch all orders and find the one with the given order name (e.g., #1160)
        const orders = await fetchAllOrders();  // Fetch all orders
        const order = orders.find(order => order.name === orderName);  // Find the order by name

        // Check if the order exists
        if (!order) {
            console.error(`Order ${orderName} not found in Shopify`);
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const orderDate = new Date(order.created_at).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });

        const stockMovements = new Map();  // Use a Map to avoid duplicates

        // Process line items for the order
        for (const item of order.line_items) {
            const productName = item.title;
            const qtySold = item.quantity;

            // Fetch components for order (assume this is an async function)
            const components = await calculateComponentsForOrder(order);

            if (components.length === 0) {
                // No components, add base product
                const key = `${order.name}-${item.sku || productName}`;
                if (!stockMovements.has(key)) {
                    stockMovements.set(key, {
                        date: orderDate,
                        orderId: order.name,  // Order Name is used here
                        internalProductCode: item.sku || productName,
                        packagingListName: productName,
                        qtySold: qtySold,
                    });
                }
            } else {
                // Add components instead of base product
                for (const component of components) {
                    const key = `${order.name}-${component.internalProductCode}`;
                    if (!stockMovements.has(key)) {
                        stockMovements.set(key, {
                            date: orderDate,
                            orderId: order.name,
                            internalProductCode: component.internalProductCode,
                            packagingListName: component.packagingListName,
                            qtySold: component.quantity,
                        });
                    }
                }
            }
        }

        // Convert Map values to an array for insertion
        const stockMovementsArray = Array.from(stockMovements.values());

        console.log('Stock movements to be inserted:', stockMovementsArray);

        // Insert new stock movements into the database
        if (stockMovementsArray.length > 0) {
            await StockMovement.insertMany(stockMovementsArray);
            console.log('Stock movements saved to database for order', orderName);
            return res.json({ success: true });
        } else {
            console.error('No stock movements to insert for order', orderName);
            return res.json({ success: false, message: 'No stock movements to insert' });
        }
    } catch (error) {
        console.error('Error processing order:', error.message || error);
        return res.status(500).json({ success: false, message: 'Error processing order' });
    }
});


// Route to fetch available months for stock movements
router.get('/list-months', async (req, res) => {
    try {
        // Fetch distinct months from stock movements by extracting the month and year part of the date
        const months = await StockMovement.aggregate([
            {
                $group: {
                    _id: { $substr: ['$date', 3, 8] },  // Extract "MMM YYYY" from "09 May 2024"
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: -1 } }  // Sort by month descending
        ]);

        res.json(months.map(month => month._id));  // Return an array of "MMM YYYY" format
    } catch (error) {
        console.error('Error fetching months:', error);
        res.status(500).send('Error fetching months');
    }
});



// Route to fetch stock movements for a specific month
router.get('/stock-movements/:month', async (req, res) => {
    try {
        const { month } = req.params;

        console.log('Fetching stock movements for month:', month);

        // Fetch stock movements where the date matches the selected month (e.g., "May 2024")
        const stockMovements = await StockMovement.find({
            date: { $regex: month }  // Match the date field containing "MMM YYYY"
        });

        console.log('Stock movements found:', stockMovements.length);

        // Send back the stock movements for that month
        res.json(stockMovements);
    } catch (error) {
        console.error('Error fetching stock movements:', error);
        res.status(500).send('Error fetching stock movements');
    }
});



router.get('/view-stock-movements', async (req, res) => {
    try {
        res.send(`
            <html>
                <head>
                    <title>Stock Movements by Month</title>
                    <style>
                        body { font-family: sans-serif; }
                        button { padding: 10px; margin: 5px; }
                        table, th, td { border: 1px solid black; border-collapse: collapse; padding: 10px; }
                    </style>
                    <script>
                        async function fetchMonths() {
                            try {
                                const response = await fetch('/inventory/list-months');
                                const months = await response.json();
                                let monthButtons = months.map(month => 
                                    \`<button onclick="fetchStockMovements('\${month}')">\${month}</button>\`
                                ).join('');
                                document.getElementById('months').innerHTML = monthButtons;
                            } catch (error) {
                                console.error('Error fetching months:', error);
                            }
                        }

                        async function fetchStockMovements(month) {
                            try {
                                const response = await fetch('/inventory/stock-movements/' + month);
                                const stockMovements = await response.json();
                                let tableRows = stockMovements.map(movement => 
                                    \`<tr>
                                        <td>\${movement.date}</td>
                                        <td>\${movement.orderId}</td>
                                        <td>\${movement.internalProductCode}</td>
                                        <td>\${movement.packagingListName}</td>
                                        <td>\${movement.qtySold}</td>
                                    </tr>\`
                                ).join('');
                                document.getElementById('stock-movements').innerHTML = 
                                    \`<table>
                                        <tr>
                                            <th>Date</th>
                                            <th>Order ID</th>
                                            <th>Internal Product Code</th>
                                            <th>Packaging List Name</th>
                                            <th>Qty Sold</th>
                                        </tr>
                                        \${tableRows}
                                    </table>\`;
                            } catch (error) {
                                console.error('Error fetching stock movements:', error);
                            }
                        }

                        window.onload = fetchMonths;  // Load months when the page loads
                    </script>
                </head>
                <body>
                    <h1>Stock Movements by Month</h1>
                    <div id="months"></div>  <!-- Buttons for each month will be inserted here -->
                    <h2>Stock Movements</h2>
                    <div id="stock-movements"></div>  <!-- Table with stock movements will be inserted here -->
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Error rendering page:', error);
        res.status(500).send('Error rendering page');
    }
});


// Check how dates are being stored in your collection
router.get('/check-dates', async (req, res) => {
    try {
        const stockMovements = await StockMovement.find({});
        const dates = stockMovements.map(movement => movement.date);
        console.log('Dates in stock movements:', dates);  // Log the dates

        res.json(dates);
    } catch (error) {
        console.error('Error checking dates:', error);
        res.status(500).send('Error checking dates');
    }
});


module.exports = router;
