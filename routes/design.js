const express = require('express');
const axios = require('axios');
const router = express.Router();
const nodemailer = require('nodemailer');

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
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                        <a href="/design/orders/${order.id}">View Details</a>
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

        // Extract the line items from the order
        const lineItems = order.line_items.map(item => `
            <tr>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
            </tr>
        `).join('');

        // Render the form with order details and line items
        res.send(`
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                background-color: #f4f4f9;
            }
            form {
                background-color: #fff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                max-width: 700px;
                margin: auto;
            }
            h1 {
                font-size: 1.5em;
                margin-bottom: 20px;
                color: #333;
            }
            label {
                display: block;
                font-weight: bold;
                margin-bottom: 5px;
                color: #333;
            }
            select, input[type="text"], input[type="number"], textarea {
                width: 100%;
                padding: 10px;
                margin-bottom: 15px;
                border: 1px solid #ccc;
                border-radius: 4px;
                font-size: 1em;
            }
            textarea {
                resize: vertical;
            }
            .inline-group {
                display: flex;
                justify-content: space-between;
            }
            .inline-group label {
                flex: 1;
            }
            .inline-group input, .inline-group select {
                width: 48%;
            }
            button {
                background-color: #4CAF50;
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 1em;
            }
            button:hover {
                background-color: #45a049;
            }
            .hidden {
                display: none;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
                font-size: 12px;
            }
            th, td {
                border: 1px solid #ddd;
                padding: 8px;
                text-align: left;
            }
            th {
                background-color: #f2f2f2;
                font-weight: bold;
            }
        </style>

        <form id="emailForm" method="POST" action="../../design/orders/${orderId}/send-email">
            <h1>Job Details for ${order.name} - ${order.customer.first_name} ${order.customer.last_name}</h1>

            <!-- Line Items Table -->
            <table>
                <thead>
                    <tr>
                        <th>Item Name</th>
                        <th>Quantity</th>
                    </tr>
                </thead>
                <tbody>
                    ${lineItems}
                </tbody>
            </table>
            <br />

            <!-- Radio Buttons to choose between Labels and Boxes -->
            <label>
                <input type="radio" name="jobType" value="labels" onclick="toggleForm('labels')" checked>
                Labels
            </label>
            <label>
                <input type="radio" name="jobType" value="boxes" onclick="toggleForm('boxes')">
                Boxes
            </label>
            <br /><hr /><br />

            <!-- Labels Form -->
            <div id="labelsForm">
                <label for="size">Size</label>
                <select id="size" name="size" onchange="toggleCustomSize(this)">
                    <option value="35 x 35 mm">35 x 35 mm</option>
                    <option value="35 x 40 mm">35 x 40 mm</option>
                    <option value="30 x 40 mm">30 x 40 mm</option>
                    <option value="20 x 40 mm">20 x 40 mm</option>
                    <option value="custom">Custom</option>
                </select>

                <div id="customSizeDiv" class="hidden">
                    <label for="customSize">Enter Custom Size</label>
                    <input type="text" id="customSize" name="customSize" placeholder="e.g. 45 x 50 mm">
                </div>

                <!-- Inline Material and Lamination -->
                <div>
                    <label for="material">Material</label>
                    <input type="text" id="material" name="material" value="Synthetic Vinyl">
                </div>
                <div>
                    <label for="lamination">Lamination</label>
                    <select id="lamination" name="lamination">
                        <option value="Special Matt Lamination">Special Matt Lamination</option>
                        <option value="Gloss Lamination">Gloss Lamination</option>
                    </select>
                </div>

                <label for="qty">Qty</label>
                <input type="number" id="qty" name="qty" value="100" min="1">

                <label for="comments">Comments</label>
                <textarea id="comments" name="comments" rows="4" placeholder="Equally divided among variants"></textarea>


                <label for="artworkLink">Artwork Link</label>
                <textarea id="artworkLink" name="artworkLink" rows="4" placeholder="Paste artwork links here"></textarea>
            </div>

            <!-- Boxes Form -->
            <div id="boxesForm" class="hidden">
                <label for="dieNo">Die No.</label>
                <input type="text" id="dieNo" name="dieNo" value="New Die">

                <div>
                    <label for="materialBox">Material</label>
                    <input type="text" id="materialBox" name="materialBox" value="350 GSM CYBER XL">
                </div>
                <div>
                    <label for="laminationBox">Lamination</label>
                    <input type="text" id="laminationBox" name="laminationBox" value="Outside Thermal Lamination">
                </div>

                <label for="qtyBox">Qty</label>
                <input type="number" id="qtyBox" name="qtyBox" value="225" min="1">

                <label for="commentsBox">Comments</label>
                <textarea id="commentsBox" name="commentsBox" rows="4" placeholder="Add any comments"></textarea>


                <label for="artworkLinkBox">Artwork Link</label>
                <textarea id="artworkLinkBox" name="artworkLinkBox" rows="4" placeholder="Paste artwork links here"></textarea>

                <!-- Reference Table for Die Numbers -->
                <table>
                    <thead>
                        <tr>
                            <th>Carton Die No.</th>
                            <th>Insert Die No.</th>
                            <th>Name of Job</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>1362</td><td>1362</td><td>Saab Box with Insert</td></tr>
                        <tr><td>1363</td><td>1363</td><td>Tokyo Box with Insert</td></tr>
                        <tr><td>1366</td><td></td><td>Roll on Box</td></tr>
                        <tr><td>1368</td><td>1430</td><td>Wim</td></tr>
                        <tr><td>1372</td><td>1372</td><td>Araufx</td></tr>
                        <tr><td>1373</td><td>1361</td><td>Victor 50 Box</td></tr>
                        <tr><td>1385</td><td>1386</td><td>Cube 50 BOX + INSERT</td></tr>
                        <tr><td>1392</td><td>1393</td><td>Victor 50 BOX + INSERT</td></tr>
                        <tr><td>1403</td><td>1404</td><td>Cyril 100 BOX</td></tr>
                        <tr><td>1406</td><td>1407</td><td>Micron 50 - Box</td></tr>
                        <tr><td>1408</td><td>1409</td><td>Senso 50 Box</td></tr>
                        <tr><td>1417</td><td>1431</td><td>Ulli BOX</td></tr>
                        <tr><td>1432</td><td>1433</td><td>Victor 100</td></tr>
                        <tr><td>1411 / 1412</td><td></td><td>Discovery Set - Tray & Separator (5 Bottles) & Sleeve</td></tr>
                        <tr><td>1413</td><td></td><td>Tester Holder</td></tr>
                        <tr><td>1419</td><td></td><td>Dirista Discovery Set - Tray, Separator & Sleeve</td></tr>
                    </tbody>
                </table>
            </div>

            <button type="submit" id="sendButton">Send Email</button>
        </form>

        <script>
            // Toggle between Labels and Boxes forms
            function toggleForm(formType) {
                var labelsForm = document.getElementById('labelsForm');
                var boxesForm = document.getElementById('boxesForm');
                if (formType === 'labels') {
                    labelsForm.classList.remove('hidden');
                    boxesForm.classList.add('hidden');
                } else {
                    boxesForm.classList.remove('hidden');
                    labelsForm.classList.add('hidden');
                }
            }

            // Toggle custom size field in Labels form
            function toggleCustomSize(selectElement) {
                var customSizeDiv = document.getElementById('customSizeDiv');
                if (selectElement.value === 'custom') {
                    customSizeDiv.classList.remove('hidden');
                } else {
                    customSizeDiv.classList.add('hidden');
                }
            }

            // Form submission handler
            document.getElementById('emailForm').onsubmit = async function(event) {
                event.preventDefault();
                const sendButton = document.getElementById('sendButton');
                sendButton.style.display = 'none'; // Hide button

                const formData = new FormData(this);

                try {
                    const response = await fetch(this.action, {
                        method: 'POST',
                        body: new URLSearchParams(formData) // Convert FormData to URLSearchParams
                    });

                    if (response.ok) {
                        alert('Email sent to printer');
                    } else {
                        alert('Error sending email');
                    }
                } catch (error) {
                    alert('An error occurred: ' + error.message);
                } finally {
                    sendButton.style.display = 'block'; // Show button again after alert is closed
                }
            }
        </script>
        `);
    } catch (error) {
        console.error("Error fetching order details:", error.response?.data || error.message);
        res.status(500).send('Error fetching order details');
    }
});



// Route to send email based on form data
router.post('/orders/:orderId/send-email', async (req, res) => {
    const { orderId } = req.params;
    const { jobType, size, customSize, lamination, artworkLink, jobName, dieNo, print, materialBox, laminationBox, qtyBox, comments, commentsBox } = req.body;

    try {
        // Fetch the order details from Shopify
        const response = await axios.get(`${SHOPIFY_API_URL}/orders/${orderId}.json`, {
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
            },
            family: 4
        });

        const order = response.data.order;

        // Determine email content based on job type
        let subject = '';
        let htmlContent = '';

        if (jobType === 'labels') {
            const finalSize = size === 'custom' && customSize ? customSize : size;
            subject = `Job Name: ${order.name} - ${order.customer.first_name} ${order.customer.last_name} (Labels)`;
            htmlContent = `
                <p>PFA the artwork & spec for print job (Labels):</p>
                <p><strong>Job Name:</strong> ${order.name} - ${order.customer.first_name} ${order.customer.last_name}</p>
                <p><strong>Size:</strong> ${finalSize}</p>
                <p><strong>Material:</strong> Synthetic Vinyl</p>
                <p><strong>Lamination:</strong> ${lamination}</p>
                <p><strong>Qty:</strong> 100</p>
                <p><strong>Comments:</strong> ${comments}
                <p><strong>Artwork Link:</strong> <a href="${artworkLink}" target="_blank">${artworkLink}</a></p>
            `;
        } else if (jobType === 'boxes') {
            subject = `Job Name: ${order.name} - ${order.customer.first_name} ${order.customer.last_name} (Boxes)`;
            htmlContent = `
                <p>PFA the artwork & spec for print job (Boxes):</p>
                <p><strong>Job Name:</strong> ${order.name} - ${order.customer.first_name} ${order.customer.last_name}</p>
                <p><strong>Die No.:</strong> ${dieNo}</p>
                <p><strong>Print:</strong> ${print}</p>
                <p><strong>Material:</strong> ${materialBox}</p>
                <p><strong>Lamination:</strong> ${laminationBox}</p>
                <p><strong>Qty:</strong> ${qtyBox}</p>
                <p><strong>Comments:</strong> ${commentsBox}
                <p><strong>Artwork Link:</strong> <a href="${artworkLinkBox}" target="_blank">${artworkLinkBox}</a></p>
            `;
        }

        // Configure Nodemailer
        const transporter = nodemailer.createTransport({
            host: 'smtp.zoho.com', // Zoho SMTP host
            port: 465, // Port for SSL
            secure: true, // true for 465, false for other ports
            auth: {
                user: 'info@packamor.com', // Zoho email
                pass: 'Packsub123packamor!' // Zoho email password
            }
        });

        // Email options
        const mailOptions = {
            from: 'info@packamor.com',
            to: 'info@packamor.com',
            cc: ['ajit@pioprinters.com', 'info@piopackaging.com'], 
            subject: subject,
            html: htmlContent
        };

        // Send the email
        await transporter.sendMail(mailOptions);
        res.status(200).send('Email sent successfully!');
    } catch (error) {
        console.error("Error sending email:", error.message, error.stack); // Log the error stack
        res.status(500).send(`Error sending email: ${error.message}`);
    }
});

module.exports = router;
