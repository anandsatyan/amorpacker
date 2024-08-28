// routes/customsInvoice.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');
const { generateCustomsInvoiceLineItemsHtml, generateInvoiceNumber } = require('../utils/helpers');

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
console.log("HITTTTTT");
      let customsInvoiceHtml = `
          <html>
          <head>
              <style>
                  body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #333; margin: 0; padding: 20px; }
                  .wrapper { width: 100%; max-width: 800px; margin: 0 auto; }
                  .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
                  .shop-title { text-align: right; }
                  .order-title { max-width: 65%; }
                  hr { border: 1px solid #000; }
                  .subtitle-bold { font-size: 8pt; font-weight: bold; }
                  .customer-addresses { display: flex; justify-content: space-between; margin-bottom: 20px; }
                  .address-column { width: 48%; }
                  .details-columns { display: flex; justify-content: space-between; margin-top: 20px; }
                  .details-column { width: 48%; }
                  .details-column p { margin: 4px 0; }
                  .flex-line-item { display: flex; justify-content: space-between; margin-bottom: 10px; }
                  .flex-line-item-description { width: 70%; }
                  .flex-line-item-details { width: 30%; text-align: right; }
                  .table-header { background-color: #ffffff; padding: 8px 0; font-weight: bold; }
                  input[type="text"] {border: 0; padding: 0; text-align: right; width: 50px;}
              </style>
          </head>
          <body>
              <div class="wrapper">
                  <div class="header">
                      <div contentEditable="true" class="order-title">
                          <div><strong style="font-size: 24px;">Export Invoice</strong><br /><br /><br /></div>
                          <div style="margin-bottom: 5px;"><strong style="font-size: 16px;">Invoice # ${invoiceNumber}</strong></div>
                          <div><strong style="font-size: 14px; margin-bottom: 30px;">Invoice Date: ${invoiceDate}</strong></div>
                      </div>
                      <div class="shop-title">
                          <strong>BRANDSAMOR COMMERCE LLP</strong><br />
                          50 RAGHAVENDRA NAGAR RAJAKILPAKKAM<br />
                          TAMBARAM CHENNAI  600073 
                          TAMILNADU INDIA<br />
                          INFO@BRANDSAMOR.COM | +91 9840167314<br /><br />
                          <strong>LUT:</strong> AD330524103870G | <strong>IEC:</strong> ABCFB8402A<br />
                          <strong>AD Code:</strong> 202632 | <strong>GSTIN:</strong> 33ABCFB8402A1Z8<br />
                      </div>
                  </div>
                  <hr>
                  <div contentEditable="true"><strong style="font-size: 12px;">Order Number: ${order.name}</strong></div>
                          <div><strong style="font-size: 12px;">Order Date: ${new Date(order.created_at).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                          })}</strong></div><br />
                  <div class="customer-addresses">
                      <div class="address-column">
                          <strong>Ship To:</strong><br /><br />
                          ${shippingAddress.name}<br />
                          ${shippingAddress.company ? `${shippingAddress.company}<br />` : ''}
                          ${shippingAddress.address1}, ${shippingAddress.address2 || ''}<br />
                          ${shippingAddress.city}, ${shippingAddress.province} ${shippingAddress.zip}<br />
                          <strong>${shippingAddress.country}</strong><br /><br />
                          ${shippingAddress.phone ? `Phone: ${shippingAddress.phone}<br />` : ''}
                          ${order.email ? `Email: ${order.email}` : ''}
                          <br /><br /><br />
                          <strong>Person:</strong><br /><br />
                          ${shippingAddress.name}<br />
                          Tel.:${shippingAddress.phone}
                      </div>
                      <div class="address-column">
                          <strong>Bill To:</strong><br /><br />
                          Brandsamor Commerce L.L.C-FZ<br />
                          The Meydan Hotel, Grandstand, 6th floor,<br />
                          Meydan Road, Nad Al Sheba,<br />
                          Dubai, U.A.E<br /><br />
                          Phone: +971 52 154 3617<br />
                          Email: info@packamor.com
                          <br /><br /><br />
                          Gross Weight: <input type="text" /> kg <br />
                          Net Weight: <input type="text" /> kg
                      </div>
                  </div>
                  <hr>
                  <div class="details-columns" contentEditable="true">
                      <div class="details-column">
                          <p><strong>Country of origin of goods:</strong> India</p>
                          <p><strong>Port of loading:</strong> Chennai</p>
                          <p><strong>Pre-Carriage by:</strong> Road</p>
                          <p><strong>Port of Discharge:</strong> Air</p>
                      </div>
                      <div class="details-column" contentEditable="true">
                          <p><strong>Country of final destination:</strong>${shippingAddress.country ? `${shippingAddress.country}, ` : ''}</p>
                          <p><strong>Final Destination:</strong> 
                              ${shippingAddress.city ? `${shippingAddress.city}, ` : ''}
                              ${shippingAddress.province ? `${shippingAddress.province}, ` : ''}
                              ${shippingAddress.country ? `${shippingAddress.country}` : ''}
                          </p>                            
                          <p><strong>Terms of Delivery & Payment:</strong> CIF</p>
                      </div>
                  </div>
                  <hr>
                  <div class="order-container" contentEditable="true">
                      <div class="flex-line-item table-header" style="display: flex; justify-content: space-between;">
                          <div style="width: 45%; text-align: left;">
                              <span>Item Name</span>
                          </div>
                          <div style="width: 10%; text-align: center;">
                              <span>HS Code</span>
                          </div>
                          <div style="width: 10%; text-align: center;">
                              <span>Quantity</span>
                          </div>
                          <div style="width: 15%; text-align: center;">
                              <span>Unit Price</span>
                          </div>
                          <div style="width: 20%; text-align: right;">
                              <span>Total Price</span>
                          </div>
                      </div>
                      ${itemsHtml}
                  </div>
                  <hr style="margin-bottom: 10px;" />
                  <div class="flex-line-item" style="display: flex; justify-content: space-between; font-size: 16px;">
                      <div style="width: 80%; text-align: right;">
                          <span><strong>Grand Total</strong></span>
                      </div>
                      <div style="width: 20%; text-align: right;">
                          <span><strong>$${grandTotal.toFixed(2)}</strong></span>
                      </div>
                  </div>
                  <hr style="margin: 25px 0 0 0;" />
                  <div style="text-align: right;"><img src="https://cdn.shopify.com/s/files/1/0857/0984/8873/files/BRANDSAMOR_COMMERCE_L.L.P..png?v=1722773361" width="150px" /></div>
                  <br /><br /><br /><br />
                  <center>Declaration: The value declared is for customs purpose only.</center>
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
