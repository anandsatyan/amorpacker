const express = require('express');
const axios = require('axios');
const app = express();
require('dotenv').config();

// Shopify API settings
const SHOPIFY_API_URL = 'https://805e95-c9.myshopify.com/admin/api/2023-01';
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// Start the server
app.listen(3000, () => {
  console.log('App is running on http://localhost:3000');
});

// Home route
app.get('/', (req, res) => {
  res.send('Hello, Shopify!');
});

// Fetch and display orders
app.get('/orders', async (req, res) => {
  try {
    const response = await axios.get(`${SHOPIFY_API_URL}/orders.json`, {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
      },
    });

    const orders = response.data.orders;
    let orderHtml = '<h1>Order List</h1><ul>';
    orders.forEach(order => {
      orderHtml += `<li>${order.name} - ${order.total_price} <a href="/generate-packing-slip/${order.id}">Packing Slip</a></li>`;
    });
    orderHtml += '</ul>';

    res.send(orderHtml);
  } catch (error) {
    res.status(500).send('Error fetching orders');
  }
});

app.get('/generate-packing-slip/:orderId', async (req, res) => {
    const orderId = req.params.orderId;
  
    try {
      const response = await axios.get(`${SHOPIFY_API_URL}/orders/${orderId}.json`, {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
        },
      });
  
      const order = response.data.order;
  
      // Generate the packing slip HTML
      let packingSlipHtml = `
        <html>
          <body>
            <div class="wrapper">
              <div class="header">
                <div class="shop-title">
                  <small>
                    <strong>Brandsamor Commerce LLP</strong><br />
                    50 Raghavendra Nagar, Rajakilpakkam,<br />
                    Tambaram, Chennai - 600 073, Tamilnadu, India<br />
                    info@brandsamor.com<br />
                    GSTIN: 33ABCFB8402A1Z8<br />
                    IEC: ABCFB8402A | LUT: AD330524103870G
                  </small>
                </div>
                <div class="order-title">
                  <p class="text-align-right">
                    <big><strong>Order ${order.name}</strong></big>
                  </p>
                  <p class="text-align-right">
                    ${new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div><br />
              <hr>
              <div class="customer-addresses">
                <div class="shipping-address">
                  <p class="subtitle-bold to-uppercase">
                    Ship to
                  </p>
                  <p class="address-detail">
                    ${order.shipping_address.name}<br />
                    ${order.shipping_address.company || ''}<br />
                    ${order.shipping_address.address1}<br />
                    ${order.shipping_address.address2 || ''}<br />
                    ${order.shipping_address.city}, ${order.shipping_address.province} ${order.shipping_address.zip}<br />
                    ${order.shipping_address.country}<br />
                    ${order.shipping_address.phone || ''}
                  </p>
                </div>
              </div>
              <div class="additional-info">
                <div class="column">
                  Port of Loading: Chennai<br />
                  Country of Origin of Goods: India
                </div>
                <div class="column">
                  Final Destination: ${order.shipping_address.city}, ${order.shipping_address.country}<br />
                  Country of Final Destination: ${order.shipping_address.country}
                </div>
              </div>
              <hr>
              <div class="order-container">
                <div class="order-container-header">
                    <div class="order-container-header-left-content">
                        <p class="subtitle-bold to-uppercase">
                            Items
                        </p>
                    </div>
                </div>`;
  
      // Loop through each line item and fetch metafields
      for (const item of order.line_items) {
        const productResponse = await axios.get(`${SHOPIFY_API_URL}/products/${item.product_id}/metafields.json`, {
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
          },
        });
  
        const productMetafields = productResponse.data.metafields || [];
  
        const packingListName = productMetafields.find(mf => mf.namespace === 'custom' && mf.key === 'packing_list_name')?.value || item.title;
        const components = productMetafields.find(mf => mf.namespace === 'custom' && mf.key === 'components')?.value || [];
  
        packingSlipHtml += `
          <div class="flex-line-item">
            <div class="flex-line-item-description">
              <p class="line-item-title"><strong>${packingListName}</strong></p>
              <p class="line-item-sku">SKU: ${item.sku}</p>`;
  
        // Fetch and display component names
        if (Array.isArray(components) && components.length > 0) {
          for (const componentGid of components) {
            const componentId = componentGid.split('/').pop();
            const componentResponse = await axios.get(`${SHOPIFY_API_URL}/products/${componentId}/metafields.json`, {
              headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
              },
            });
            const componentMetafields = componentResponse.data.metafields || [];
            const componentPackingListName = componentMetafields.find(mf => mf.namespace === 'custom' && mf.key === 'packing_list_name')?.value || componentId;
  
            packingSlipHtml += `<p style="margin-left: 20px;">Component: ${componentPackingListName}</p>`;
          }
        }
  
        packingSlipHtml += `
            </div>
            <div class="flex-line-item-details">
              <p class="text-align-right">${item.quantity}</p>
            </div>
          </div>`;
      }
  
      packingSlipHtml += `
              </div>
              <hr>
              <br/>
            </div>
          </body>
        </html>`;
  
      res.send(packingSlipHtml);
    } catch (error) {
      console.error(error);
      res.status(500).send('Error generating packing slip');
    }
  });
  