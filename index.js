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

// Basic Authentication middleware
app.use((req, res, next) => {
    const auth = { login: process.env.BASIC_AUTH_USERNAME, password: process.env.BASIC_AUTH_PASSWORD };
  
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  
    if (login && password && login === auth.login && password === auth.password) {
      return next();
    }
  
    res.set('WWW-Authenticate', 'Basic realm="401"');
    res.status(401).send('Authentication required.');
  });

// Home route
app.get('/', (req, res) => {
  res.send('Hello, Shopify!');
});

// Serve the robots.txt file
app.use('/robots.txt', (req, res) => {
    res.sendFile(path.join(__dirname, 'robots.txt'));
  });
  app.use((req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
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
  
      // Start the table
      let orderHtml = `
        <style>body {font-family: 'Helvetica', 'Arial'; font-size: 8pt !important;}</style>
        <h1>Order List</h1>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #f2f2f2; font-size: 8pt !important;">
              <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Order Name</th>
              <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Date</th>
              <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Customer Name</th>
              <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Tags</th>
              <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Destination</th>
              <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Total Price</th>
              <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Actions</th>
                        <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Export Invoice</th>
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
        const destination = order.shipping_address ? `${order.shipping_address.city}, ${order.shipping_address.country}` : 'No destination';
  
        // Alternate row background color
        const rowBgColor = index % 2 === 0 ? '#fdfdfd' : '#ffffff';
  
        orderHtml += `
          <tr style="background-color: ${rowBgColor}; font-size: 9pt !important;">
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${order.name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${formattedDate}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${customerName}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tags}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${destination}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">$${order.total_price}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="/generate-packing-slip/${order.id}">Packing Slip</a></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="/generate-customs-invoice/${order.id}" target="_blank">Export Invoice</a></td> <!-- New link -->
          </tr>
        `;
      });
  
      // Close the table
      orderHtml += `
          </tbody>
        </table>
        <style>
            tr:hover {
            background-color: #e0e0e0 !important; /* Slightly darker gray */
            }
        </style>
      `;
  
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
    let additionalInfo = '';
    if (item.properties && item.properties.length > 0) {
        additionalInfo = item.properties.map(prop => `${prop.value}`).join(', ');
    }
    let displayTitle = item.title.startsWith("Sample") ? additionalInfo : packingListName;
    const componentsMetafield = productMetafields.find(mf => mf.namespace === 'custom' && mf.key === 'components');

    let itemHtml = `
      <div class="flex-line-item">
        <div class="flex-line-item-description">
          <p class="line-item-title"><input type="checkbox" />&nbsp;<strong>${displayTitle}</strong></p>`;
        
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
    const shippingAddress = order.shipping_address || order.billing_address;

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
    res.status(500).send('Error generating packing slip');
  }
  function formatDate(dateString) {
  const date = new Date(dateString);

  const options = { day: 'numeric', month: 'short', year: 'numeric' };
  return date.toLocaleDateString('en-GB', options).replace(',', '');
}
});
function generateInvoiceNumber(orderName) {
    // Extract the numeric part of the order name (e.g., from "#1119" extract "1119")
    const orderNumber = parseInt(orderName.replace('#', ''));
    const baseNumber = orderNumber - 1027; // Subtract 1027 from the order number
    const invoiceNumber = `BRNSMR-FR-${String(baseNumber).padStart(6, '0')}`; // Format with leading zeros
    return invoiceNumber;
}

app.get('/generate-customs-invoice/:orderId', async (req, res) => {
    const orderId = req.params.orderId;

    try {
        const response = await axios.get(`${SHOPIFY_API_URL}/orders/${orderId}.json`, {
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
            },
        });

        const order = response.data.order;
        const shippingAddress = order.shipping_address;
        let grandTotal = 0;

        const invoiceNumber = generateInvoiceNumber(order.name);
        const invoiceDate = new Date().toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });


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
                        <div class="order-title">
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
                    <div><strong style="font-size: 12px;">Order Number: ${order.name}</strong></div>
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
                    <div class="details-columns">
                        <div class="details-column">
                            <p><strong>Country of origin of goods:</strong> India</p>
                            <p><strong>Port of loading:</strong> Chennai</p>
                            <p><strong>Pre-Carriage by:</strong> Road</p>
                            <p><strong>Port of Discharge:</strong> Air</p>
                        </div>
                        <div class="details-column">
                            <p><strong>Country of final destination:</strong> ${shippingAddress.country}</p>
                            <p><strong>Final Destination:</strong> ${shippingAddress.city}, ${shippingAddress.province}, ${shippingAddress.country}</p>
                            <p><strong>Terms of Delivery & Payment:</strong> CIF</p>
                        </div>
                    </div>
                    <hr>
                    <div class="order-container">
                        <!-- Table Headings -->
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
                        </div>`;

        for (const item of order.line_items) {
            const { itemHtml, totalPrice } = await generateCustomsInvoiceLineItemHtml(item);
            customsInvoiceHtml += itemHtml;

            grandTotal += totalPrice;
        }

        customsInvoiceHtml += `
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

        res.send(customsInvoiceHtml);
    } catch (error) {
        console.error("Error generating Export Invoice:", error.response ? error.response.data : error.message);
        res.status(500).send('Error generating Export Invoice');
    }
});

// Function to fetch the inventory item ID using the variant ID
async function fetchInventoryItemId(variantId) {
    try {
        const response = await axios.get(`${SHOPIFY_API_URL}/variants/${variantId}.json`, {
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
            },
        });

        const inventoryItemId = response.data.variant.inventory_item_id;
        return inventoryItemId;
    } catch (error) {
        console.error(`Error fetching inventory item ID for variant ${variantId}:`, error.response ? error.response.data : error.message);
        return null;
    }
}

// Function to fetch HS code from inventory item ID
async function fetchHsCodeFromInventoryItem(inventoryItemId) {
    try {
        const response = await axios.get(`${SHOPIFY_API_URL}/inventory_items/${inventoryItemId}.json`, {
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
            },
        });

        const hsCode = response.data.inventory_item?.harmonized_system_code || '';
        return hsCode;
    } catch (error) {
        console.error(`Error fetching HS code for inventory item ${inventoryItemId}:`, error.response ? error.response.data : error.message);
        return '';
    }
}

// Helper function to generate HTML for line items in Export Invoice
async function generateCustomsInvoiceLineItemHtml(item) {
    try {
        // Fetch the inventory_item_id using the variant_id for the main product
        const mainInventoryItemId = await fetchInventoryItemId(item.variant_id);
        const mainHsCode = await fetchHsCodeFromInventoryItem(mainInventoryItemId);

        const productMetafields = await fetchProductMetafields(item.product_id);
        const mainPackingListName = productMetafields.find(mf => mf.namespace === 'custom' && mf.key === 'packing_list_name')?.value || item.title;
        const unitPrice = parseFloat(item.price) * 0.25 || 0;
        const quantity = item.quantity;
        let totalPrice = 0;

        let itemHtml = '';

        // Check if the product has components
        const componentsMetafield = productMetafields.find(mf => mf.namespace === 'custom' && mf.key === 'components');
        if (componentsMetafield && componentsMetafield.value) {
            const components = JSON.parse(componentsMetafield.value);
            if (Array.isArray(components) && components.length > 0) {
                const componentHtmlArray = await Promise.all(components.map(async componentGid => {
                    const componentId = componentGid.split('/').pop();

                    // Fetch the component product details
                    const componentProductResponse = await axios.get(`${SHOPIFY_API_URL}/products/${componentId}.json`, {
                        headers: {
                            'X-Shopify-Access-Token': ACCESS_TOKEN,
                        },
                    });
                    const componentProduct = componentProductResponse.data.product;

                    // Fetch the inventory_item_id for the component
                    const componentVariantId = componentProduct.variants[0].id;
                    const componentInventoryItemId = await fetchInventoryItemId(componentVariantId);
                    const componentHSCode = await fetchHsCodeFromInventoryItem(componentInventoryItemId);

                    // Fetch the Packing List Name metafield for the component
                    const componentMetafields = await fetchProductMetafields(componentId);
                    const componentPackingListName = componentMetafields.find(mf => mf.namespace === 'custom' && mf.key === 'packing_list_name')?.value || componentProduct.title;
                    
                    const componentRate = parseFloat(componentProduct.variants[0].price) * 0.25 || 0;
                    const componentQuantity = quantity; // Use the parent item quantity for components
                    const componentAmount = componentRate * componentQuantity;

                    totalPrice += componentAmount; // Accumulate total price from components

                    return `
                        <div class="flex-line-item" style="display: flex; justify-content: space-between;">
                            <div style="width: 45%; text-align: left;">
                                <span><strong>${componentPackingListName}</strong></span>
                            </div>
                            <div style="width: 10%; text-align: center;">
                                <span>${componentHSCode}</span>
                            </div>
                            <div style="width: 10%; text-align: center;">
                                <span>${componentQuantity}</span>
                            </div>
                            <div style="width: 15%; text-align: center;">
                                <span>$${componentRate.toFixed(2)}</span>
                            </div>
                            <div style="width: 20%; text-align: right;">
                                <span>$${componentAmount.toFixed(2)}</span>
                            </div>
                        </div>`;
                }));

                itemHtml += componentHtmlArray.join('');
            }
        } else {
            // If no components, use the main product's own price and HS code
            totalPrice = unitPrice * quantity;

            itemHtml += `
                <div class="flex-line-item" style="display: flex; justify-content: space-between;">
                    <div style="width: 45%; text-align: left;">
                        <span><strong>${mainPackingListName}</strong></span>
                    </div>
                    <div style="width: 10%; text-align: center;">
                        <span>${mainHsCode}</span>
                    </div>
                    <div style="width: 10%; text-align: center;">
                        <span>${quantity}</span>
                    </div>
                    <div style="width: 15%; text-align: center;">
                        <span>$${unitPrice.toFixed(2)}</span>
                    </div>
                    <div style="width: 20%; text-align: right;">
                        <span>$${totalPrice.toFixed(2)}</span>
                    </div>
                </div>`;
        }

        return { itemHtml, totalPrice };
    } catch (error) {
        console.error("Error generating Export Invoice line item HTML:", error.response ? error.response.data : error.message);
        throw error;
    }
}




// Function to generate the entire invoice including the grand total at the bottom
async function generateInvoice(items) {
    try {
        let grandTotal = 0;
        let invoiceHtml = `
            <html>
            <head>
                <style>
                    body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #333; margin: 0; padding: 20px; }
                    .flex-line-item { display: flex; justify-content: space-between; margin-bottom: 10px; }
                    .flex-line-item-description { width: 70%; }
                    .flex-line-item-details { width: 30%; text-align: right; }
                    hr { border: 1px solid #000; }
                </style>
            </head>
            <body>
                <div class="wrapper">
                    <h1>Export Invoice</h1>
                    <hr>
                    <div class="items">`;

        // Loop through all items and generate the line items HTML
        for (const item of items) {
            const lineItemHtml = await generateCustomsInvoiceLineItemHtml(item);
            invoiceHtml += lineItemHtml;

            // Calculate the grand total based on item and component prices
            grandTotal += parseFloat(item.price) * parseInt(item.quantity);

            const componentsMetafield = await fetchProductMetafields(item.product_id);
            if (componentsMetafield && componentsMetafield.value) {
                const components = JSON.parse(componentsMetafield.value);
                if (Array.isArray(components) && components.length > 0) {
                    for (const componentGid of components) {
                        const componentId = componentGid.split('/').pop();
                        const componentProductResponse = await axios.get(`${SHOPIFY_API_URL}/products/${componentId}.json`, {
                            headers: {
                                'X-Shopify-Access-Token': ACCESS_TOKEN,
                            },
                        });
                        const componentProduct = componentProductResponse.data.product;
                        grandTotal += parseFloat(componentProduct.variants[0].price) * parseInt(item.quantity);
                    }
                }
            }
        }

        // Add the grand total cost at the very end of the invoice, right above the final disclaimer
        invoiceHtml += `
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
        </div></body></html>`;

        return invoiceHtml;
    } catch (error) {
        console.error("Error generating the entire invoice:", error.response ? error.response.data : error.message);
        throw error;
    }
}
