// routes/customsInvoice.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');
const { generateCustomsInvoiceLineItemsHtml, generateInvoiceNumber, numberToWords } = require('../utils/helpers');

router.get('/:orderId', async (req, res) => {
  const orderId = req.params.orderId;

  try {
    const response = await axios.get(`${SHOPIFY_API_URL}/orders/${orderId}.json`, {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
      },
    });

    const order = response.data.order;
    const shippingAddress = order.shipping_address || order.billing_address;
    const invoiceNumber = generateInvoiceNumber(order.name);
    const invoiceDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const { itemsHtml, grandTotal } = await generateCustomsInvoiceLineItemsHtml(order);
    let customsInvoiceHtml = `
      <html>
      <head>
          <style>
              body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #333; margin: 0; padding: 20px; }
              .wrapper { width: 100%; max-width: 800px; margin: 0 auto; }
              .invoice-header-table, .invoice-items-table { width: 100%; border-collapse: collapse;}
              .invoice-header-table, .invoice-items-table th, .invoice-header-table td, .invoice-items-table td {
                  border: 1px solid black; padding: 10px; text-align: left; vertical-align: top; font-size: 10pt;
              }
              .invoice-header-table th, .invoice-items-table th {
                  background-color: #ffffff; font-weight: bold;
              }
              .invoice-title { text-align: center; font-size: 20px; font-weight: bold; padding: 10px 0; }
              input[type="text"] {border: 0 !important; max-width: 40px;}
              .actions-div { text-align: center; border-bottom: 1px solid #000; padding-bottom: 20px; }
              @media print { .actions-div { display:none; } }
          </style>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.2/html2pdf.bundle.min.js"></script>
          <script>
            window.onload = function() {
              document.getElementById('generatePdfButton').addEventListener('click', () => {
                const customerName = 'ExportInvoice';
                const orderNumber = 'Order';
                const fileName = \`\${customerName}-\${orderNumber}.pdf\`;
                const invoiceContent = document.getElementById('printableInvoiceArea');

                const options = {
                  margin: 0.5,
                  filename: fileName,
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 2 },
                  jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
                };

                html2pdf().from(invoiceContent).set(options).save();
              });

              document.getElementById('createAWBButton').addEventListener('click', async () => {
                const orderId = '${orderId}';
                try {
                  const response = await fetch('/create-shipment', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ orderId })
                  });
                  const result = await response.json();
                  const transactionShipment = result.output?.transactionShipments?.[0];
                  const awbNumber = transactionShipment?.completedShipmentDetail?.masterTrackingId?.trackingNumber;

                  if (response.ok && awbNumber) {
                    alert('AWB created successfully! AWB Number: ' + awbNumber);
                  } else {
                    alert('Error creating AWB: ' + (result.error || 'Unknown error'));
                  }
                } catch (error) {
                  alert('Error creating AWB: ' + error.message);
                }
              });
            };
          </script>
          <script>
              function validateAndPrint() {
                  const grossWeight = document.getElementsByName("grossWeight")[0].value;
                  const netWeight = document.getElementsByName("netWeight")[0].value;
                  const noOfPackages = document.getElementsByName("noOfPackages")[0].value;

                  if (grossWeight === "" || netWeight === "" || noOfPackages === "") {
                      alert("Please fill in all fields before printing the invoice.");
                  } else {
                      window.print();
                  }
              }
          </script>
      </head>
      <body>
          <div class="actions-div">
            <button id="createAWBButton">Create Fedex AWB</button>
            <button onClick="validateAndPrint()">Print Invoice</button>
            <button id="generatePdfButton">Download PDF</button>
          </div>
          <br /><br />
          <div id="printableInvoiceArea" class="wrapper invoice-container">
              <!-- First Table (Header Information) -->
              <table class="invoice-header-table">
                  <tr><td colspan="3" class="invoice-title"><center>INVOICE</center></td></tr>
                  <tr>
                      <td rowspan="3" class="seller-info">
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
                      </td>
                      <td>
                          <strong>AD Code:</strong> 202632<br>
                          <strong>GSTIN:</strong> 33ABCFB8402A1Z8
                      </td>
                  </tr>
                  <tr>
                      <td>
                          <strong>Buyer's Order No. & Dt</strong><br>
                          Order ${order.name}<br>
                          DT: ${new Date(order.created_at).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                      </td>
                      <td>
                          <strong>IEC:</strong> ABCFB8402A<br>
                          <strong>LUT:</strong> AD330524103870G
                      </td>
                  </tr>
                  <tr>
                      <td colspan="2">
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
                          <strong>Gross Wt:</strong> <input type="text" name="grossWeight" /> kg<br>
                          <strong>Net Wt:</strong> <input type="text" name="netWeight" /> kg <br>
                          <strong>No. of Pkgs:</strong><input type="text" name="noOfPackages" />
                      </td>
                  </tr>
                  <tr>
                      <td>
                          <strong>Person:</strong><br />
                          ${shippingAddress.name}<br />
                          Tel.:${shippingAddress.phone}
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
                      <td>
                          <strong>Pre-Carriage by</strong> ROAD<br>
                          <strong>Vessel / Flight No.</strong><br>
                          <strong>Port of Discharge</strong> Air
                      </td>
                      <td>
                          <strong>Place of Receipt by pre-carrier</strong><br>
                          <strong>Port of loading</strong> Chennai<br>
                          <strong>Final Destination</strong><br />
                          ${shippingAddress.city ? `${shippingAddress.city}, ` : ''}
                          ${shippingAddress.province ? `${shippingAddress.province}, ` : ''}
                          ${shippingAddress.country ? `${shippingAddress.country}` : ''}
                      </td>
                      <td>
                          <strong>Terms of Delivery & payment</strong><br>
                          CIF
                      </td>
                  </tr>
              </table>

              <!-- Second Table (Items List) -->
              <table class="invoice-items-table">
                  <thead>
                      <tr>
                          <th style="width: 45%;">Description of Goods</th>
                          <th style="width: 10%; text-align: center;">HSN</th>
                          <th style="width: 10%; text-align: center;">Quantity</th>
                          <th style="width: 15%; text-align: center;">Rate (USD)</th>
                          <th style="width: 20%; text-align: right;">Amount (USD)</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${itemsHtml}
                      <tr>
                        <td><strong></strong></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colspan="4"><strong>AMOUNT</strong></td>
                        <td style="text-align: right; font-weight: bold;">$${grandTotal.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colspan="5" style="text-transform: uppercase"><strong>AMOUNT IN WORDS: ${numberToWords(grandTotal.toFixed(2))}</strong></td>
                      </tr>
                      <tr>
                        <td colspan="5"><center>Declaration: The value declared is for customs purpose only.</center></td>
                      </tr>
                  </tbody>
              </table>
          </div>

          <div style="text-align: right;">
              <img src="https://cdn.shopify.com/s/files/1/0857/0984/8873/files/BRANDSAMOR_COMMERCE_L.L.P..png?v=1722773361" width="150px" />
          </div>
      </body>
      </html>`;

    console.log("HITTTTTT");

    res.send(customsInvoiceHtml);

  } catch (error) {
    console.error("Error generating Export Invoice:", error.response ? error.response.data : error.message);
    res.status(500).send('Error generating Export Invoice. Check if there are samples in this order or if this is a custom draft order.');
  }
});

module.exports = router;
