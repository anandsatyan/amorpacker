// routes/orders.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { generateCustomsInvoiceLineItemsHtml, generateInvoiceNumber, numberToWords } = require('../utils/helpers');
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');
const Invoice = require('../models/invoice');  // Import the model

router.get('/', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
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
            /* Add spinner styles */
            #loader {
                position: fixed;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                display: none; /* Hidden by default */
                z-index: 9999;
            }

            /* Spinner styling */
            .spinner {
                border: 4px solid rgba(0, 0, 0, 0.1);
                width: 36px;
                height: 36px;
                border-radius: 50%;
                border-left-color: #000;
                animation: spin 1s linear infinite;
            }

            /* Keyframes for spinner animation */
            @keyframes spin {
                0% {
                    transform: rotate(0deg);
                }
                100% {
                    transform: rotate(360deg);
                }
            }
        </style>
        <script>
            window.addEventListener('pageshow', function(event) {
                if (event.persisted || window.performance && window.performance.navigation.type === 2) {
                    // If the page is being loaded from the cache, reload it
                    window.location.reload();
                }
            });
            document.addEventListener('DOMContentLoaded', function() {
                // Attach event listener to all "Create" buttons
                document.querySelectorAll('.create-invoice-button').forEach(button => {
                    button.addEventListener('click', async function() {
                        const orderId = this.getAttribute('data-order-id');
                        const loader = document.getElementById('loader'); // Get the loader element

                        try {
                            loader.style.display = 'block';
                            // Make a request to the server to generate and save the invoice
                            const response = await fetch("/orders/create-invoice/" + orderId, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            });

                            const result = await response.json();
                            loader.style.display = 'none';

                            if (response.ok) {
                                alert('Invoice created successfully!');
                                const invoiceId = result.invoiceId; // Assuming your API returns the invoiceId
                                window.location.href = '/invoices/' + orderId + '/' + invoiceId;
                            } else {
                                alert('Error creating invoice: ' + result.message);
                            }
                        } catch (error) {
                            console.error('Error creating invoice:', error);
                            alert('Error creating invoice: ' + error.message);
                        }
                    });
                });
            });
        </script>

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
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Invoices</th>
                </tr>
            </thead>
            <tbody>
        `;
        let index = 0; 

        for (const order of orders) {
            const formattedDate = new Date(order.created_at).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
            });

            const tags = order.tags ? order.tags.split(',').map(tag => tag.trim()).join(', ') : 'No tags';
            const customerName = order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Guest';
            const destination = order.shipping_address ? `${order.shipping_address.country}` : 'No destination';
            const invoices = await Invoice.find({ orderId: order.id });
            let invoicesHtml = '';
            if (invoices.length > 0) {
                invoices.forEach(invoice => {
                    invoicesHtml += `
                            <a href="/invoices/${order.id}/${invoice._id}">
                                ${invoice.invoiceNumber}
                            </a>&nbsp;
                    `;
                });
            } else {
                invoicesHtml = '<small>No Invoices</small>';
            }
            const rowBgColor = index % 2 === 0 ? '#fdfdfd' : '#ffffff';

            orderHtml += `
                <tr style="background-color: ${rowBgColor}; font-size: 10pt !important;">
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${order.name}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${formattedDate}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${customerName}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tags}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${destination}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">$${order.total_price}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                        <a href="/packing-slips/${order.id}">Pack</a>
                    </td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                        <button class="create-invoice-button" data-order-id="${order.id}">Create</button>
                        ${invoicesHtml}
                    </td>
                </tr>
            `;
            index++; 
        };

        orderHtml += `
            </tbody>
        </table>
        <div id="loader">
            <div class="spinner"></div>
        </div>
        `;

        res.send(orderHtml);
    } catch (error) {
        console.error("Error fetching orders:", error.response ? error.response.data : error.message);
        res.status(500).send('Error fetching orders');
    }
});

router.post('/create-invoice/:orderId', async (req, res) => {
    const { orderId } = req.params;
  
    try {
      // Fetch the order details from Shopify
      const response = await axios.get(`${SHOPIFY_API_URL}/orders/${orderId}.json`, {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
        },
      });
      console.log("Shopify API Response:", response.data);

      if (!response.data || !response.data.order) {
        return res.status(500).json({ message: 'Invalid order data from Shopify' });
    }
      const order = response.data.order;
      const shippingAddress = order.shipping_address || order.billing_address;
      const invoiceNumber = await generateInvoiceNumber();
      const invoiceDate = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
  
      // Generate the invoice content as you do in your GET route
      const { itemsHtml, grandTotal } = await generateCustomsInvoiceLineItemsHtml(order);
      let invoiceHtml = '';
      invoiceHtml += `
      <div id="printableInvoiceArea" class="wrapper invoice-container" contentEditable="true">
          <!-- First Table (Header Information) -->
          <table class="invoice-header-table">
              <tr><td colspan="3" class="invoice-title"><center style="font-size: 16pt;">INVOICE</center></td></tr>
              <tr>
                  <td class="seller-info">
                      <strong>Seller:</strong><br>
                      Brandsamor Commerce LLP<br>
                      50 Raghavendra Nagar Rajakilpakkam<br>
                      Tambaram Chennai 600073<br>
                      Tamilnadu India<br>
                      info@brandsamor.com | +91 9840167314
                  </td>
                  <td>
                      <strong>Invoice No. & Dt</strong><br>
                      ${invoiceNumber}<br>
                      DT: ${invoiceDate}
                      <br /><br />
                      <strong>Buyer's Order No. & Dt</strong><br>
                      Order ${order.name}<br>
                      DT: ${new Date(order.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}<br />
                      
                  </td>
                  <td>
                      <strong>AD Code:</strong> 0202632<br />
                      <strong>GSTIN:</strong> 33ABCFB8402A1Z8<br /><br />
                      <strong>IEC:</strong> ABCFB8402A<br />
                      <strong>LUT:</strong> AD330524103870G<br /><br />
                      <strong>Other reference(s):</strong> ${order.name}
                  </td>
              </tr>
              <tr>
                  <td>
                      <strong>Bill To:</strong><br>
                      Brandsamor Commerce L.L.C-FZ<br>
                      The Meydan Hotel, Grandstand, 6th floor,<br>
                      Meydan Road, Nad Al Sheba,<br>
                      Dubai, U.A.E<br>
                      info@packamor.com | +971 52 154 3617
                  </td>
                  <td>
                      <strong>Ship To:</strong><br>
                      ${shippingAddress.name}<br />
                      ${shippingAddress.company ? `${shippingAddress.company}<br />` : ''}
                      ${shippingAddress.address1}, ${shippingAddress.address2 || ''}<br />
                      ${shippingAddress.city}, ${shippingAddress.province} ${shippingAddress.zip}<br />
                      <strong>${shippingAddress.country}</strong><br /><br />
                      ${shippingAddress.phone ? `Phone: ${shippingAddress.phone}<br />` : ''}
                      ${order.email ? `Email: ${order.email}` : ''}
                  </td>
                  <td>
                      <strong>Buyer (if other than consignee)</strong><br><br>
                      <strong>Gross Wt:</strong> <span contentEditable="true" name="grossWeight" style="max-width: 40px;">0</span> kg<br>
                      <strong>Net Wt:</strong> <span contentEditable="true" name="netWeight" style="max-width: 40px;">0</span> kg <br>
                      <strong>No. of Pkgs:</strong> <span contentEditable="true" name="noOfPackages" style="max-width: 40px;">0</span>
                  </td>
              </tr>
              <tr>
                  <td>
                      <strong>Person:</strong><br />
                      ${shippingAddress.name} (${shippingAddress.phone})
                  </td>
                  <td>
                      <strong>Country of Origin of Goods:</strong><br />
                      India
                  </td>
                  <td>
                      <strong>Country of final destination</strong><br />
                      ${shippingAddress.country ? `${shippingAddress.country}` : ''}
                  </td>
              </tr>
              <tr>
                  <td style="font-size: 8pt !important">
                      <strong>Pre-Carriage by</strong> ROAD<br>
                      <strong>Vessel / Flight No.</strong><br>
                      <strong>Port of Discharge</strong> Air
                  </td>
                  <td style="font-size: 8pt !important">
                      <strong>Place of Receipt by pre-carrier</strong><br>
                      <strong>Port of loading</strong> Chennai<br>
                      <strong>Final Destination</strong><br />
                      ${shippingAddress.city ? `${shippingAddress.city}, ` : ''}
                      ${shippingAddress.province ? `${shippingAddress.province}, ` : ''}
                      ${shippingAddress.country ? `${shippingAddress.country}` : ''}
                  </td>
                  <td style="font-size: 8pt !important">
                      <strong>Terms of Delivery & payment</strong><br>
                      CIF
                  </td>
              </tr>
          </table>

          <!-- Second Table (Items List) -->
          <table class="invoice-items-table">
              <thead>
                  <tr>
                      <th style="width: 5%; text-align: center;">&nbsp;</th>
                      <th style="width: 50%;">Description of Goods</th>
                      <th style="width: 10%; text-align: center;">HSN</th>
                      <th style="width: 5%; text-align: center;">Qty</th>
                      <th style="width: 15%; text-align: center;">Rate</th>
                      <th style="width: 15%; text-align: right;">Amount</th>
                  </tr>
              </thead>
              <tbody id="invoiceItems">
                  ${itemsHtml}
              </tbody>
              <tfoot>
                  <tr>
                    <td colspan="5"><strong>AMOUNT (USD)</strong></td>
                    <td id="totalAmount" style="text-align: right; font-weight: bold;">$${grandTotal.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td class="amount-in-words" colspan="6" style="text-transform: uppercase; font-size: 8pt;"><strong>AMOUNT IN WORDS: <span id="spanAmtInWords">${numberToWords(grandTotal.toFixed(2))}</span></strong></td>
                  </tr>
                  <tr>
                      <td colspan="2" style="text-transform: uppercase">
                        <small>
                        <strong>Bank Details:</strong> <br />
                        ACCOUNT NAME: BRANDSAMOR COMMERCE LLP<br />
                        Account NO: 35060200000552<br />
                        IFSC CODE: BARB0RAJAKI<br />
                        SWIFT CODE : BARBINBBTAM<br />
                        </small>
                      </td>
                    <td colspan="4"><strong><small>Declaration : This invoice is for customs purpose only. Invoice shows the actual price of goods described and that all particulars are true & correct. <br /><br />Note: Invoice is digitally signed and manual signature is not required</small></td>
                  </tr>
              </tfoot>
          </table>
        <!-- Image at the Bottom -->
          <div style="text-align: right; margin-top: -115px;">
              <img id="brandImage" src="https://cdn.shopify.com/s/files/1/0857/0984/8873/files/BRANDSAMOR_COMMERCE_L.L.P..png?v=1722773361" width="150px" />
          </div>
      </div>`;
      // Save the new invoice to the database
      const newInvoice = new Invoice({
        orderId: orderId,
        invoiceNumber: invoiceNumber,
        invoiceDate: invoiceDate,
        htmlContent: invoiceHtml,
        invoiceDate: new Date(order.created_at).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          }),
        customerName: shippingAddress.name,
        orderName: order.name
      });
  
      await newInvoice.save();
  
      // Return success response
      res.status(200).json({ message: 'Invoice created successfully!', invoiceId: newInvoice._id });
    } catch (error) {
      console.error('Error creating invoice:', error);
      res.status(500).json({ message: 'Error creating invoice', error });
    }
});



// Function to get the last four months in "YYYY-MM" format
const getLastFourMonths = () => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 4; i++) {
        const month = new Date(now.getFullYear(), now.getMonth() + 1 - i, 1);
        months.push(month.toISOString().slice(0, 7)); // "YYYY-MM"
    }
    return months;
};

// Function to filter orders by month and calculate total sales
const filterOrdersByMonth = (orders, month) => {
    const filteredOrders = orders.filter(order => {
        const orderDate = new Date(order.created_at);
        const orderMonth = orderDate.toISOString().slice(0, 7); // "YYYY-MM"
        return orderMonth === month;
    });

    const totalSales = filteredOrders.reduce((sum, order) => sum + parseFloat(order.total_price), 0);
    return { filteredOrders, totalSales };
};

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

// Route to fetch and display orders for a specific month
router.get('/all', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    try {
        const allOrders = await fetchAllOrders(`${SHOPIFY_API_URL}/orders.json?status=any&order=created_at+desc`);
        const lastFourMonths = getLastFourMonths();
        let selectedMonth = req.query.month || lastFourMonths[0]; // Default to the current month if no query parameter is present

        // Filter orders for the selected month and calculate total sales
        const { filteredOrders, totalSales } = filterOrdersByMonth(allOrders, selectedMonth);

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
            /* Add spinner styles */
            #loader {
                position: fixed;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                display: none; /* Hidden by default */
                z-index: 9999;
            }

            /* Spinner styling */
            .spinner {
                border: 4px solid rgba(0, 0, 0, 0.1);
                width: 36px;
                height: 36px;
                border-radius: 50%;
                border-left-color: #000;
                animation: spin 1s linear infinite;
            }

            /* Keyframes for spinner animation */
            @keyframes spin {
                0% {
                    transform: rotate(0deg);
                }
                100% {
                    transform: rotate(360deg);
                }
            }
        </style>
        <script>
            window.addEventListener('pageshow', function(event) {
                if (event.persisted || window.performance && window.performance.navigation.type === 2) {
                    // If the page is being loaded from the cache, reload it
                    window.location.reload();
                }
            });
            document.addEventListener('DOMContentLoaded', function() {
                // Attach event listener to all "Create" buttons
                document.querySelectorAll('.create-invoice-button').forEach(button => {
                    button.addEventListener('click', async function() {
                        const orderId = this.getAttribute('data-order-id');
                        const loader = document.getElementById('loader'); // Get the loader element

                        try {
                            loader.style.display = 'block';
                            // Make a request to the server to generate and save the invoice
                            const response = await fetch("/orders/create-invoice/" + orderId, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            });

                            const result = await response.json();
                            loader.style.display = 'none';

                            if (response.ok) {
                                alert('Invoice created successfully!');
                                const invoiceId = result.invoiceId; // Assuming your API returns the invoiceId
                                window.location.href = '/invoices/' + orderId + '/' + invoiceId;
                            } else {
                                alert('Error creating invoice: ' + result.message);
                            }
                        } catch (error) {
                            console.error('Error creating invoice:', error);
                            alert('Error creating invoice: ' + error.message);
                        }
                    });
                });
            });
        </script>

        <div class="header-container">
            <h1>Orders for ${selectedMonth}</h1>
            <div>
                ${lastFourMonths.map(month => `<a href="?month=${encodeURIComponent(month)}">${month}</a>`).join(' | ')}
            </div>
        </div>
        <p><strong>Order Count:</strong> ${filteredOrders.length} | <strong>Total Sales:</strong> $${totalSales.toFixed(2)}</p>
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
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Invoices</th>
                </tr>
            </thead>
            <tbody>
        `;

        let index = 0; 

        for (const order of allOrders) {
            const formattedDate = new Date(order.created_at).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
            });

            const tags = order.tags ? order.tags.split(',').map(tag => tag.trim()).join(', ') : 'No tags';
            const customerName = order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Guest';
            const destination = order.shipping_address ? `${order.shipping_address.country}` : 'No destination';
            const invoices = await Invoice.find({ orderId: order.id });
            let invoicesHtml = '';
            invoicesHtml = invoices.length > 0 ? invoices.map(invoice => `
                <a href="/invoices/${order.id}/${invoice._id}">
                    ${invoice.invoiceNumber}
                </a>&nbsp;
            `).join('') : '<small>No Invoices</small>';

            const rowBgColor = index % 2 === 0 ? '#fdfdfd' : '#ffffff';

            orderHtml += `
                <tr style="background-color: ${rowBgColor}; font-size: 10pt !important;">
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${order.name}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${formattedDate}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${customerName}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tags}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${destination}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">$${order.total_price}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                        <a href="/generate-packing-slip/${order.id}">Slip</a>
                    </td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                        <button class="create-invoice-button" data-order-id="${order.id}">Create</button>
                        ${invoicesHtml}
                    </td>
                </tr>
            `;
            index++; 
        };

        orderHtml += `
            </tbody>
        </table>
        <div id="loader">
            <div class="spinner"></div>
        </div>
        `;

        res.send(orderHtml);
    } catch (error) {
        console.error("Error fetching orders:", error.response ? error.response.data : error.message);
        res.status(500).send('Error fetching orders');
    }
});




module.exports = router;
