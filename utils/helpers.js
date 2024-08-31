// utils/helpers.js
const axios = require('axios');
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');

// Helper function to introduce a delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to fetch product metafields
async function fetchProductMetafields(productId) {
    try {
        await delay(500);
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

// Function to fetch the inventory item ID using the variant ID
async function fetchInventoryItemId(variantId) {
    try {
        await delay(500);
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
        await delay(500);
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

// Helper function to fetch product metafields by SKU
async function fetchProductMetafieldsBySku(sku) {
    try {
        await delay(500);
        const response = await axios.get(
            `${SHOPIFY_API_URL}/products.json?fields=id,variants&limit=250`,
            {
                headers: {
                    'X-Shopify-Access-Token': ACCESS_TOKEN,
                },
            }
        );

        const products = response.data.products;
        console.log('products', products.length);
        for (const product of products) {
            const variant = product.variants.find((v) => v.sku === sku);
            if (variant) {
                return await fetchProductMetafields(product.id);
            }
        }

        return []; // Return an empty array if no product is found with the given SKU
    } catch (error) {
        console.error(`Error fetching product metafields by SKU ${sku}:`, error.response ? error.response.data : error.message);
        throw error;
    }
}

// Helper function to generate HTML for line items
async function generateLineItemHtml(item) {
    try {
        let packingListName = item.title;
        let hsCode = 'N/A'; // Default value for HS code
        let additionalInfo = '';

        // Check if the item is from a draft order (i.e., custom item without product ID or SKU)
        if (!item.product_id && !item.sku) {
            // Extract HS code from the item title if it contains it in brackets
            const hsCodeMatch = item.title.match(/\((HS\d+)\)/);
            if (hsCodeMatch) {
                hsCode = hsCodeMatch[1];
            }
        } else {
            // Regular orders with product IDs
            const productMetafields = await fetchProductMetafields(item.product_id);
            packingListName = productMetafields.find(
                (mf) => mf.namespace === 'custom' && mf.key === 'packing_list_name'
            )?.value || item.title;

            if (item.properties && item.properties.length > 0) {
                additionalInfo = item.properties.map((prop) => `${prop.value}`).join(', ');
            }

            // Use the component metafield logic if the item is a regular product
            const componentsMetafield = productMetafields.find(
                (mf) => mf.namespace === 'custom' && mf.key === 'components'
            );

            if (componentsMetafield && componentsMetafield.value) {
                const components = JSON.parse(componentsMetafield.value);
                if (Array.isArray(components) && components.length > 0) {
                    // Fetch component details in parallel
                    const componentHtmlArray = await Promise.all(
                        components.map(async (componentGid) => {
                            const componentId = componentGid.split('/').pop();
                            const componentMetafields = await fetchProductMetafields(componentId);
                            const componentPackingListName =
                                componentMetafields.find(
                                    (mf) =>
                                        mf.namespace === 'custom' &&
                                        mf.key === 'packing_list_name'
                                )?.value || componentId;
                            return `
                                <div class="flex-line-item">
                                  <div class="flex-line-item-description" style="margin-left: 20px;">
                                    <span class="line-item-title"><input type="checkbox" />&nbsp;${componentPackingListName}</span>
                                  </div>
                                  <div class="flex-line-item-details">
                                    <span class="text-align-right" style="margin-right: 20px;">${item.quantity}</span>
                                  </div>
                                </div>`;
                        })
                    );

                    itemHtml += componentHtmlArray.join('');
                }
            }
        }

        // Prepare item HTML
        let itemHtml = `
          <div class="flex-line-item">
            <div class="flex-line-item-description">
              <p class="line-item-title"><input type="checkbox" />&nbsp;<strong>${packingListName}</strong></p>
              ${hsCode !== 'N/A' ? `<p>HS Code: ${hsCode}</p>` : ''}
        `;

        if (item.sku) {
            itemHtml += `<p class="line-item-sku">SKU: ${item.sku}</p>`;
        }

        itemHtml += `
            </div>
            <div class="flex-line-item-details">
              <p class="text-align-right"><strong>${item.quantity}</strong></p>
            </div>
          </div>`;

        // Check and add components if the item is a sample
        const componentsHtml = await addComponentsForSampleItem(item, additionalInfo);
        itemHtml += componentsHtml;

        return itemHtml;
    } catch (error) {
        console.error('Error generating line item HTML:', error.response ? error.response.data : error.message);
        throw error;
    }
}


// Function to check if the line item is a sample and add components if it has them
async function addComponentsForSampleItem(item, additionalInfo) {
    try {
        // Check if the line item is a sample
        if (item.title.startsWith("Sample")) {
            // Extract SKU from the additionalInfo
            const skuMatch = additionalInfo.match(/(BRC-FP-\d{3})$/);
            if (skuMatch && skuMatch[1]) {
                const sku = skuMatch[1];

                // Fetch product metafields based on SKU
                const productMetafields = await fetchProductMetafieldsBySku(sku);

                // Check if "Components" metafield exists
                const componentsMetafield = productMetafields.find(
                    (mf) => mf.namespace === "custom" && mf.key === "components"
                );

                if (componentsMetafield && componentsMetafield.value) {
                    // Parse components if the metafield exists
                    const components = JSON.parse(componentsMetafield.value);
                    if (Array.isArray(components) && components.length > 0) {
                        // Generate HTML for each component
                        const componentHtmlArray = await Promise.all(
                            components.map(async (componentGid) => {
                                const componentId = componentGid.split("/").pop();
                                const componentMetafields = await fetchProductMetafields(
                                    componentId
                                );
                                const componentPackingListName =
                                    componentMetafields.find(
                                        (mf) =>
                                            mf.namespace === "custom" && mf.key === "packing_list_name"
                                    )?.value || componentId;
                                return `
                                  <div class="flex-line-item">
                                    <div class="flex-line-item-description" style="margin-left: 20px;">
                                      <span class="line-item-title"><input type="checkbox" />&nbsp;${componentPackingListName}</span>
                                    </div>
                                    <div class="flex-line-item-details">
                                      <span class="text-align-right" style="margin-right: 20px;">${item.quantity}</span>
                                    </div>
                                  </div>`;
                            })
                        );

                        return componentHtmlArray.join("");
                    }
                }
            } else {
                // If no SKU found, use the export label name metafield instead of the product name
                const exportLabelName = productMetafields.find(
                    (mf) => mf.namespace === 'custom' && mf.key === 'export_label_name'
                )?.value || item.title;

                return `
                  <div class="flex-line-item">
                    <div class="flex-line-item-description">
                      <p class="line-item-title"><input type="checkbox" />&nbsp;<strong>${exportLabelName}</strong></p>
                    </div>
                    <div class="flex-line-item-details">
                      <p class="text-align-right"><strong>${item.quantity}</strong></p>
                    </div>
                  </div>`;
            }
        }

        return ""; // Return an empty string if no components are found or if it's not a sample
    } catch (error) {
        console.error("Error adding components for sample item:", error);
        throw error;
    }
}

// Function to generate the invoice number
function generateInvoiceNumber(orderName) {
    const orderNumber = parseInt(orderName.replace('#', ''));
    const baseNumber = orderNumber - 1027; // Subtract 1027 from the order number
    const invoiceNumber = `BRNSMR-FR-${String(baseNumber).padStart(6, '0')}`; // Format with leading zeros
    return invoiceNumber;
}

async function generateCustomsInvoiceLineItemsHtml(order) {
    try {
      const aggregatedItems = {};
  
      // Helper function to add or aggregate items in the collection
      const addOrUpdateItem = (key, itemData) => {
        if (aggregatedItems[key]) {
          // If the item exists, aggregate the quantity and total price
          aggregatedItems[key].quantity += itemData.quantity;
          aggregatedItems[key].totalPrice += itemData.totalPrice;
        } else {
          // If the item does not exist, add it to the collection
          aggregatedItems[key] = itemData;
        }
      };
  
      // Process each line item in the order
      for (const item of order.line_items) {
        let packingListName = item.title; // Default to item title
        let hsCode = ''; // Default HS code
  
        // Check if product ID or SKU exists
        if (item.product_id && item.sku) {
          // Regular item logic
          const mainInventoryItemId = await fetchInventoryItemId(item.variant_id);
          hsCode = await fetchHsCodeFromInventoryItem(mainInventoryItemId);
  
          const productMetafields = await fetchProductMetafields(item.product_id);
          packingListName =
            productMetafields.find(
              (mf) => mf.namespace === "custom" && mf.key === "packing_list_name"
            )?.value || item.title;
  
          // Logic for items with components
          const componentsMetafield = productMetafields.find(
            (mf) => mf.namespace === "custom" && mf.key === "components"
          );
  
          if (componentsMetafield && componentsMetafield.value) {
            const components = JSON.parse(componentsMetafield.value);
            if (Array.isArray(components) && components.length > 0) {
              for (const componentGid of components) {
                const componentId = componentGid.split("/").pop();
  
                // Fetch the component product details
                const componentProductResponse = await axios.get(
                  `${SHOPIFY_API_URL}/products/${componentId}.json`,
                  {
                    headers: {
                      "X-Shopify-Access-Token": ACCESS_TOKEN,
                    },
                  }
                );
                const componentProduct = componentProductResponse.data.product;
  
                // Fetch the inventory_item_id for the component
                const componentVariantId = componentProduct.variants[0].id;
                const componentInventoryItemId = await fetchInventoryItemId(
                  componentVariantId
                );
                const componentHSCode = await fetchHsCodeFromInventoryItem(
                  componentInventoryItemId
                );
  
                // Fetch the Packing List Name metafield for the component
                const componentMetafields = await fetchProductMetafields(
                  componentId
                );
                const componentPackingListName =
                  componentMetafields.find(
                    (mf) =>
                      mf.namespace === "custom" &&
                      mf.key === "export_label_name"
                  )?.value || componentProduct.title;
  
                const componentRate =
                  parseFloat(componentProduct.variants[0].price) * 0.25 || 0;
                const componentQuantity = item.quantity; // Use the parent item quantity for components
                const componentAmount = componentRate * componentQuantity;
  
                // Generate a unique key for the component to avoid duplicates
                const componentKey = `${componentPackingListName}-${componentHSCode}`;
  
                // Add or aggregate the component in the collection
                addOrUpdateItem(componentKey, {
                  name: componentPackingListName,
                  hsCode: componentHSCode,
                  quantity: componentQuantity,
                  unitPrice: componentRate,
                  totalPrice: componentAmount,
                });
              }
            }
          } else {
            // Regular item without components
            const unitPrice = parseFloat(item.price) * 0.25 || 0;
            const quantity = item.quantity;
            const totalPrice = unitPrice * quantity;
  
            // Generate a unique key for the line item
            const itemKey = `${packingListName}-${hsCode}`;
  
            // Add or aggregate the line item in the collection
            addOrUpdateItem(itemKey, {
              name: packingListName,
              hsCode: hsCode,
              quantity: quantity,
              unitPrice: unitPrice,
              totalPrice: totalPrice,
            });
          }
        } else {
          // Custom item logic (no product ID or SKU)
          const unitPrice = parseFloat(item.price) * 0.25 || 0;
          const quantity = item.quantity;
          const totalPrice = unitPrice * quantity;
  
          // Check if the title contains an HS code in brackets
          const hsCodeMatch = item.title.match(/\((HS\d+)\)/);
          if (hsCodeMatch) {
            hsCode = hsCodeMatch[1]; // Extract HS code from the title
          }
  
          // Generate a unique key for the custom item
          const customItemKey = `${packingListName}-${hsCode}`;
  
          // Add or aggregate the custom item in the collection
          addOrUpdateItem(customItemKey, {
            name: packingListName,
            hsCode: hsCode,
            quantity: quantity,
            unitPrice: unitPrice,
            totalPrice: totalPrice,
          });
        }
      }
  
      // Generate HTML from the aggregated items collection
      let itemsHtml = "";
      let grandTotal = 0;
  
      for (const key in aggregatedItems) {
        const item = aggregatedItems[key];
        itemsHtml += `
                <div class="flex-line-item" style="display: flex; justify-content: space-between;">
                    <div style="width: 45%; text-align: left;">
                        <span><strong>${item.name}</strong></span>
                    </div>
                    <div style="width: 10%; text-align: center;">
                        <span>${item.hsCode}</span>
                    </div>
                    <div style="width: 10%; text-align: center;">
                        <span>${item.quantity}</span>
                    </div>
                    <div style="width: 15%; text-align: center;">
                        <span>$${item.unitPrice.toFixed(2)}</span>
                    </div>
                    <div style="width: 20%; text-align: right;">
                        <span>$${item.totalPrice.toFixed(2)}</span>
                    </div>
                </div>`;
        grandTotal += item.totalPrice;
      }
  
      // Return the HTML and the grand total
      return { itemsHtml, grandTotal };
    } catch (error) {
      console.error(
        "Error generating Export Invoice line items HTML:",
        error.response ? error.response.data : error.message
      );
      throw error;
    }
  }
  
  

module.exports = {
    delay,
    fetchProductMetafields,
    fetchInventoryItemId,
    fetchHsCodeFromInventoryItem,
    fetchProductMetafieldsBySku,
    generateLineItemHtml,
    addComponentsForSampleItem,
    generateCustomsInvoiceLineItemsHtml,
    generateInvoiceNumber,  // Ensure this is exported
};
