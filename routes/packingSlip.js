// routes/packingSlip.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { fetchProductMetafields, generateLineItemHtml } = require('../utils/helpers');
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');

// Route to generate packing slip
router.get('/:orderId', async (req, res) => {
  const orderId = req.params.orderId;

  try {
    const response = await axios.get(`${SHOPIFY_API_URL}/orders/${orderId}.json`, {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
      },
    });

    const order = response.data.order;
    const formattedDate = new Date(order.created_at).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const shippingAddress = order.shipping_address || order.billing_address;

    let packingSlipHtml = `
      <html>
      <head>
        <style>
          body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #333; margin: 0; padding: 20px; text-transform: uppercase; }
          .wrapper { width: 100%; max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .shop-title { text-align: right; }
          .order-title { max-width: 65%; }
          hr { border: 1px solid #000; }
          .subtitle-bold { font-size: 8pt; font-weight: bold; }
          .customer-addresses, .additional-info { margin-bottom: 20px; }
          .flex-line-item { display: flex; justify-content: space-between; margin-bottom: 10px; }
          .flex-line-item-description { width: 70%; }
          .flex-line-item-details { width: 30%; text-align: right; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="header">
            <div class="order-title">
              <div><strong style="font-size: 24px;">Order ${order.name}</strong></div>
              <div><strong>${formattedDate}</strong></div>
            </div>
            <div class="shop-title">
              <strong>Brandsamor Commerce LLP</strong><br />
              50 Raghavendra Nagar, Rajakilpakkam, <br />
              Tambaram, Chennai 600073, India<br />
            </div>
          </div>
          <hr>
          <div class="customer-addresses" style="display: flex; justify-content: space-between;">
            <!-- First Column: Shipping Address -->
            <div class="shipping-address" style="width: 48%;">
              <p class="subtitle-bold">Ship to</p>
              <p class="address-detail">
                ${shippingAddress.name}<br />
                ${shippingAddress.company ? `${shippingAddress.company}<br />` : ''}
                ${shippingAddress.address1}, ${shippingAddress.address2 || ''}<br />
                ${shippingAddress.city}, ${shippingAddress.province} ${shippingAddress.zip}<br />
                <strong>${shippingAddress.country}</strong><br />
                Phone: ${shippingAddress.phone || ''}
              </p>
            </div>

            <!-- Second Column: Customer Notes -->
            <div class="customer-notes" style="width: 48%;">
              <p class="subtitle-bold">Notes</p>
              <p class="address-detail">
                ${order.note ? order.note : 'No customer notes provided.'}
              </p>
            </div>
          </div>
          <hr>
          <div class="order-container">
            <div class="order-container-header">
              <div class="order-container-header-left-content">
                <p class="subtitle-bold">Items</p>
              </div>
            </div>`;
    // Generate HTML for each line item
    console.log(packingSlipHtml);

    const lineItemHtmlArray = await Promise.all(order.line_items.map(generateLineItemHtml));
    packingSlipHtml += lineItemHtmlArray.join('');

    packingSlipHtml += `
          </div><br />
          <hr><br />
          <div style="text-align: end;"><input type="checkbox" />&nbsp;Samples&nbsp; <input type="checkbox" />&nbsp;Stickers&nbsp;<input type="checkbox" />&nbsp;Tester+Holder&nbsp;<input type="checkbox" />&nbsp;Sample Box&nbsp;<input type="checkbox" />&nbsp;QC Complete</div>
        </div>
      </body>
      </html>`;

    res.send(packingSlipHtml);

  } catch (error) {
    console.error("Error generating packing slip:", error.response ? error.response.data : error.message);
    res.status(500).send('Error generating packing slip. Check if there are samples in this order or if this is a custom draft order.');
  }
});

module.exports = router;
