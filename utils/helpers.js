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

        // Initialize itemHtml here
        let itemHtml = `
          <div class="flex-line-item">
            <div class="flex-line-item-description">
              <p class="line-item-title"><input type="checkbox" />&nbsp;<strong>${packingListName}</strong></p>
              ${hsCode !== 'N/A' ? `<p>HS Code: ${hsCode}</p>` : ''}
        `;

        // Check if the item is from a draft order (i.e., custom item without product ID or SKU)
        if (!item.product_id && !item.sku) {
            const hsCodeMatch = item.title.match(/\((HS\d+)\)/);
            if (hsCodeMatch) {
                hsCode = hsCodeMatch[1];
            }
        } else {
            const productMetafields = await fetchProductMetafields(item.product_id);
            packingListName = productMetafields.find(
                (mf) => mf.namespace === 'custom' && mf.key === 'packing_list_name'
            )?.value || item.title;

            if (item.properties && item.properties.length > 0) {
                additionalInfo = item.properties.map((prop) => `${prop.value}`).join(', ');
            }

            const componentsMetafield = productMetafields.find(
                (mf) => mf.namespace === 'custom' && mf.key === 'components'
            );

            if (componentsMetafield && componentsMetafield.value) {
                const components = JSON.parse(componentsMetafield.value);
                if (Array.isArray(components) && components.length > 0) {
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

                    // Add component HTML to itemHtml
                    itemHtml += componentHtmlArray.join('');
                }
            }
        }

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


async function generateCustomsInvoiceLineItemsHtml(order) {
    try {
        const aggregatedItems = {};
        const lineItemsForAWB = []; // Array to hold line items for any AWB (Air Waybill) creation

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

            if (item.product_id && item.sku) {
                // Regular item logic
                const mainInventoryItemId = await fetchInventoryItemId(item.variant_id);
                hsCode = await fetchHsCodeFromInventoryItem(mainInventoryItemId);

                const productMetafields = await fetchProductMetafields(item.product_id);
                packingListName = productMetafields.find(
                    (mf) => mf.namespace === "custom" && mf.key === "packing_list_name"
                )?.value || item.title;

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

                            let componentRate =
                                parseFloat(componentProduct.variants[0].price) * 0.25 || 0;
                            componentRate = parseFloat(componentRate.toFixed(2)); // Round unit price to two decimal places

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

                            // Add component details to AWB line items array
                            lineItemsForAWB.push({
                                description: componentPackingListName,
                                countryOfManufacture: "IN", // Example value, replace with dynamic value if available
                                harmonizedCode: componentHSCode,
                                weight: 0.5, // Example value, replace with actual weight
                                quantity: componentQuantity,
                                quantityUnits: "PCS",
                                unitPrice: {
                                    amount: componentRate,
                                    currency: "USD",
                                },
                                customsValue: {
                                    amount: componentAmount,
                                    currency: "USD",
                                },
                            });
                        }
                    }
                } else {
                    // Regular item without components
                    let unitPrice = parseFloat(item.price) * 0.25 || 0;
                    unitPrice = parseFloat(unitPrice.toFixed(2));
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

                    // Add item details to AWB line items array
                    lineItemsForAWB.push({
                        description: packingListName,
                        countryOfManufacture: "IN", // Example value, replace with dynamic value if available
                        harmonizedCode: hsCode,
                        weight: 0.5, // Example value, replace with actual weight
                        quantity: quantity,
                        quantityUnits: "PCS",
                        unitPrice: {
                            amount: unitPrice,
                            currency: "USD",
                        },
                        customsValue: {
                            amount: totalPrice,
                            currency: "USD",
                        },
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

                // Add custom item details to AWB line items array
                lineItemsForAWB.push({
                    description: packingListName,
                    countryOfManufacture: "IN", // Example value, replace with dynamic value if available
                    harmonizedCode: hsCode,
                    weight: 0.5, // Example value, replace with actual weight
                    quantity: quantity,
                    quantityUnits: "PCS",
                    unitPrice: {
                        amount: unitPrice,
                        currency: "USD",
                    },
                    customsValue: {
                        amount: totalPrice,
                        currency: "USD",
                    },
                });
            }
        }

        // Generate HTML from the aggregated items collection
        let itemsHtml = "";
        let grandTotal = 0;

        for (const key in aggregatedItems) {
            const item = aggregatedItems[key];
            itemsHtml += `
                    <tr>
                        <td class="remove-row-button" style="width: 5%; text-align: left; border: 1px solid black; padding: 5px;">
                            <button style="position: relative; left: -100px;" contentEditable="false">Remove</button>
                        </td>
                        <td style="width: 45%; text-align: left; border: 1px solid black; padding: 5px;">
                            <strong>${item.name}</strong>
                        </td>
                        <td style="width: 10%; text-align: center; border: 1px solid black; padding: 5px;">
                            ${item.hsCode}
                        </td>
                        <td contentEditable="false" style="width: 10%; text-align: center; border: 1px solid black; padding: 5px;">
                            <center><input type="number" class="product-quantity" value="${item.quantity}" style="width: 100%; text-align:center;" /></center>
                        </td>
                        <td contentEditable="false" style="width: 15%; text-align: center; border: 1px solid black; padding: 5px;">
                            <center><input type="number" class="product-rate" value="${item.unitPrice.toFixed(2)}" style="width: 100%; text-align:center;" /></center>
                        </td>
                        <td style="width: 20%; text-align: right; border: 1px solid black; padding: 5px;" contentEditable="false">
                            $<span class="product-amount">${item.totalPrice.toFixed(2)}</span>
                        </td>
                    </tr>`;

            grandTotal += item.totalPrice;
        }

        // Return the HTML, grand total, and line items for AWB
        return { itemsHtml, grandTotal, lineItemsForAWB };
    } catch (error) {
        console.error(
            "Error generating Export Invoice line items HTML:",
            error.response ? error.response.data : error.message
        );
        throw error;
    }
}

function numberToWords(num) {
    if (num === 0) return 'zero';

    const belowTwenty = [
        'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
        'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
        'eighteen', 'nineteen'
    ];

    const tens = [
        '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'
    ];

    const thousands = ['', 'thousand', 'million', 'billion'];

    function convertBelowThousand(num) {
        let result = '';

        if (num >= 100) {
            result += belowTwenty[Math.floor(num / 100)] + ' hundred ';
            num %= 100;
        }

        if (num >= 20) {
            result += tens[Math.floor(num / 10)] + ' ';
            num %= 10;
        }

        if (num > 0) {
            result += belowTwenty[num] + ' ';
        }

        return result.trim();
    }

    function convertToWords(num) {
        let result = '';
        let thousandIndex = 0;

        while (num > 0) {
            if (num % 1000 !== 0) {
                result = convertBelowThousand(num % 1000) + (thousandIndex > 0 ? ' ' + thousands[thousandIndex] + ' ' : '') + result;
            }

            num = Math.floor(num / 1000);
            thousandIndex++;
        }

        return result.trim();
    }

    // Split the number into whole and fractional parts
    const wholePart = Math.floor(num);
    const fractionalPart = Math.round((num - wholePart) * 100);

    let result = 'USD ' + convertToWords(wholePart);

    if (fractionalPart > 0) {
        result += ' and cents ' + convertToWords(fractionalPart);
    }

    return result;
}

const Counter = require('../models/counter');

async function generateInvoiceNumber() {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    const yearRange = `${currentYear.toString().slice(-2)}-${nextYear.toString().slice(-2)}`;

    // Find the counter in the database and increment the sequence number
    const counter = await Counter.findOneAndUpdate(
        { name: 'invoiceNumber' }, 
        { $inc: { seq: 1 } }, 
        { new: true, upsert: true }  // Create the document if it doesn't exist
    );

    // Format the sequence number with leading zeros (e.g., 0023)
    const paddedSeq = counter.seq.toString().padStart(4, '0');

    // Return the formatted invoice number
    return `BEX/${yearRange}/${paddedSeq}`;
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
    generateInvoiceNumber,  
    numberToWords,
    generateInvoiceNumber
};
