const express = require('express');
const axios = require('axios');
const path = require('path');  // Add this line to import the path module
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

// Serve the robots.txt file
app.use('/robots.txt', (req, res) => {
    res.sendFile(path.join(__dirname, 'robots.txt'));
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
      orderHtml += `<li>${order.name} - $${order.total_price} <a href="/generate-packing-slip/${order.id}">Packing Slip</a></li>`;
    });
    orderHtml += '</ul>';

    res.send(orderHtml);
  } catch (error) {
    console.error("Error fetching orders:", error.response ? error.response.data : error.message);
    res.status(500).send('Error fetching orders');
  }
});

// Helper function to fetch product metafields
async function fetchProductMetafields(productId) {
  try {
    const response = await axios.get(`${SHOPIFY_API_URL}/products/${productId}/metafields.json`, {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
      },
    });
    return response.data.metafields || [];
  } catch (error) {
    console.error(`Error fetching metafields for product ${productId}:`, error.response ? error.response.data : error.message);
    throw error;
  }
}

// Helper function to generate HTML for line items
async function generateLineItemHtml(item) {
  try {
    const productMetafields = await fetchProductMetafields(item.product_id);
    const packingListName = productMetafields.find(mf => mf.namespace === 'custom' && mf.key === 'packing_list_name')?.value || item.title;
    const componentsMetafield = productMetafields.find(mf => mf.namespace === 'custom' && mf.key === 'components');

    let itemHtml = `
      <div class="flex-line-item">
        <div class="flex-line-item-description">
          <p class="line-item-title"><input type="checkbox" />&nbsp;<strong>${packingListName}</strong></p>`;
        
  if (item.sku) {
    itemHtml += `<p class="line-item-sku">SKU: ${item.sku}</p>`;
  }
  itemHtml += `
        </div>
        <div class="flex-line-item-details">
          <p class="text-align-right"><strong>${item.quantity}</strong></p>
        </div>
      </div>`;

    if (componentsMetafield && componentsMetafield.value) {
      const components = JSON.parse(componentsMetafield.value);
      if (Array.isArray(components) && components.length > 0) {
        // Fetch component details in parallel
        const componentHtmlArray = await Promise.all(components.map(async componentGid => {
          const componentId = componentGid.split('/').pop();
          const componentMetafields = await fetchProductMetafields(componentId);
          const componentPackingListName = componentMetafields.find(mf => mf.namespace === 'custom' && mf.key === 'packing_list_name')?.value || componentId;
          return `
            <div class="flex-line-item">
              <div class="flex-line-item-description" style="margin-left: 20px;">
                <span class="line-item-title"><input type="checkbox" />&nbsp;${componentPackingListName}</span>
              </div>
              <div class="flex-line-item-details">
                <span class="text-align-right" style="margin-right: 20px;">${item.quantity}</span>
              </div>
            </div>`;
        }));

        itemHtml += componentHtmlArray.join('');
      }
    }

    return itemHtml;
  } catch (error) {
    console.error("Error generating line item HTML:", error.response ? error.response.data : error.message);
    throw error;
  }
}

// Generate packing slip
app.get('/generate-packing-slip/:orderId', async (req, res) => {
  const orderId = req.params.orderId;

  try {
    const response = await axios.get(`${SHOPIFY_API_URL}/orders/${orderId}.json`, {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
      },
    });

    const order = response.data.order;
    function formatDate(dateString) {
        const date = new Date(dateString);
      
        const options = { day: 'numeric', month: 'short', year: 'numeric' };
        return date.toLocaleDateString('en-GB', options).replace(',', '');
      }
    const formattedDate = formatDate(order.created_at);
    let packingSlipHtml = `
      <html>
        <head>
          <style>
            body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #333; margin: 0; padding: 20px; text-transform: uppercase; }
            .wrapper { width: 100%; max-width: 800px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
            .shop-title {   text-align: right;}
            .order-title {max-width: 65%;}
            hr { border: 1px solid #000; }
            .subtitle-bold { font-size: 8pt; font-weight: bold;}
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
                info@brandsamor.com
              </div>
            </div>
            <hr>
            <div class="customer-addresses" style="display: flex; justify-content: space-between;">
                <!-- First Column: Shipping Address -->
                <div class="shipping-address" style="width: 48%;">
                    <p class="subtitle-bold">Ship to</p>
                    <p class="address-detail">
                    ${order.shipping_address.name}<br />
                    ${order.shipping_address.company ? `${order.shipping_address.company}<br />` : ''}
                    ${order.shipping_address.address1}, ${order.shipping_address.address2 || ''}<br />
                    ${order.shipping_address.city}, ${order.shipping_address.province} ${order.shipping_address.zip}<br />
                    <strong>${order.shipping_address.country}</strong><br />
                    Phone: ${order.shipping_address.phone || ''}
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
    const lineItemHtmlArray = await Promise.all(order.line_items.map(generateLineItemHtml));
    packingSlipHtml += lineItemHtmlArray.join('');

    packingSlipHtml += `
            </div><br />
            <hr><br />
            <div style="text-align: end;"><input type="checkbox" />&nbsp;QC Complete</div>
          </div>
        </body>
      </html>`;

    res.send(packingSlipHtml);

  } catch (error) {
    console.error("Error generating packing slip:", error.response ? error.response.data : error.message);
    res.status(500).send('Error generating packing slip');
  }
  function formatDate(dateString) {
  const date = new Date(dateString);

  const options = { day: 'numeric', month: 'short', year: 'numeric' };
  return date.toLocaleDateString('en-GB', options).replace(',', '');
}
});
