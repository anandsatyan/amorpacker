const express = require('express');
const axios = require('axios');
const router = express.Router();
require('dotenv').config();
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');  // Import the config
const { generateCustomsInvoiceLineItemsHtml } = require('../utils/helpers'); // Import the helper function

// Environment variables
const { FEDEX_INDIA_TEST_API_KEY, FEDEX_INDIA_TEST_API_SECRET, FEDEX_INDIA_TEST_URL, FEDEX_INDIA_TEST_ACCOUNT_NO } = process.env;

// Function to fetch FedEx OAuth access token
async function fetchCarrierAccessToken() {
  try {
    const response = await axios.post(
      `${FEDEX_INDIA_TEST_URL}/oauth/token`,
      'grant_type=client_credentials&client_id=' + FEDEX_INDIA_TEST_API_KEY + '&client_secret=' + FEDEX_INDIA_TEST_API_SECRET,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Error fetching FedEx access token:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Route to create FedEx shipment
router.post('/', async (req, res) => {
    const { orderId, packages } = req.body;  // Receive packages data from the client
    try {
        // Fetch order details from Shopify
        const response = await axios.get(`${SHOPIFY_API_URL}/orders/${orderId}.json`, {
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
            },
        });

        const order = response.data.order;
        const { itemsHtml, grandTotal, lineItemsForAWB } = await generateCustomsInvoiceLineItemsHtml(order);
        
        // Create shipment using line items for AWB and package details
        const shipmentResponse = await createShipment(order, lineItemsForAWB, packages); // Pass packages to the createShipment function
        console.log("***************shipmentResponse****************");
        res.json({ message: 'AWB created successfully!', shipmentDetails: shipmentResponse });
    } catch (error) {
        console.error("Error creating shipment ! :", error.message);
        res.status(500).json({ error: error.message });
    }
});


// Function to create FedEx shipment
async function createShipment(order, lineItemsForAWB, packages) {
    const formattedLineItems = convertLineItemsForFedEx(lineItemsForAWB);
    console.log("formattedLineItems");
    console.log(formattedLineItems);

    try {
        // Extract shipping information from the Shopify order
        const shippingAddress = order.shipping_address || order.billing_address;

        // Construct the payload for the shipping carrier API (FedEx/Aramex, etc.)
        const payload = {
            "accountNumber": {
                "value": "740561073"
            },
            "labelResponseOptions": "URL_ONLY",
            "requestedShipment": {
                "pickupType": "USE_SCHEDULED_PICKUP", 
                "shipper": {
                    "contact": {
                        "personName": "Packamor India - Fulfillment Center", 
                        "companyName": "Brandsamor Commerce LLP",
                        "taxIdentificationNumber": "33ABCFB8402A1Z8",
                        "phoneNumber": "+919443585396",
                        "emailAddress": "info@packamor.com",
                    },
                    "address": {
                        "streetLines": [
                            "50 RAGHAVENDRA NAGAR",
                            "RAJAKILPAKKAM"
                        ],
                        "city": "CHENNAI",
                        "stateOrProvinceCode": "TN",
                        "postalCode": "600073",
                        "countryCode": "IN"
                    }
                },
                "recipients": [
                    {
                        "contact": {
                            "personName": shippingAddress.name,
                            "phoneNumber": shippingAddress.phone
                        },
                        "address": {
                            "streetLines": [
                                shippingAddress.address1,
                                shippingAddress.address2 || ''
                            ],
                            "city": shippingAddress.city,
                            "stateOrProvinceCode": shippingAddress.province || '',
                            "postalCode": shippingAddress.zip,
                            "countryCode": shippingAddress.country_code
                        }
                    }
                ],
                "shippingChargesPayment": {
                    "paymentType": "SENDER",
                    "payor": {
                        "responsibleParty": {
                            "accountNumber": {
                                "value": "740561073"
                            }
                        }
                    }
                },
                "customsClearanceDetail": {
                    "dutiesPayment": {
                        "paymentType": "SENDER",
                        "payor": {
                            "responsibleParty": {
                                "accountNumber": {
                                    "value": "740561073"
                                }
                            }
                        }
                    },
                    "customsValue": {
                        "amount": formattedLineItems.reduce((total, item) => total + item.customsValue.amount, 0),
                        "currency": "USD"
                    },
                    "commodities": formattedLineItems 
                },
                "labelSpecification": {
                    "labelFormatType": "COMMON2D",
                    "imageType": "PDF",
                    "labelStockType": "PAPER_4X6"
                },
                "rateRequestTypes": [
                    "ACCOUNT"
                ],
                "packageCount": packages.length,
                "requestedPackageLineItems": packages.map(pkg => ({
                    "weight": {
                        "units": "KG",
                        "value": pkg.weight
                    },
                    "dimensions": {
                        "length": pkg.dimensions.length,
                        "width": pkg.dimensions.width,
                        "height": pkg.dimensions.height,
                        "units": "CM"
                    }
                })),
                "serviceType": "INTERNATIONAL_PRIORITY",
                "packagingType": "YOUR_PACKAGING"
                // TODO: add shipment reference number (order number), PO No (order number), Invoice number is BEX/24-25/0005 BEX/Year/Incremental invoice number , Department No is CS5/G/CIF/U/-/-/0/310824 last six digits are ddmmyy of the date invoice was generated/finalized.
                // TODO: Check if invoice can be attached 
                // TODO: Give download facility for customs invoice - naming convention - CustomerName-OrderNo-InvoiceNoSuffix
            }
        };
        // Fetch access token and send request to shipping carrier API
        const accessToken = await fetchCarrierAccessToken(); // Generic function to fetch access token for any carrier
        const response = await axios.post(`${FEDEX_INDIA_TEST_URL}/ship/v1/shipments`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            }
        });
        console.log(response);

        // Process carrier response
        return response.data;
    } catch (error) {
        console.error("Error creating shipment:", JSON.stringify(error.response.data, null, 2));
        throw error;
    }
}

function convertLineItemsForFedEx(lineItems) {
    return lineItems.map(item => ({
      description: item.description,
      countryOfManufacture: item.countryOfManufacture,
      harmonizedCode: item.harmonizedCode,
      weight: {
        units: 'KG',
        value: item.weight // Assuming weight is already in kilograms, otherwise, convert appropriately
      },
      quantity: item.quantity,
      quantityUnits: item.quantityUnits,
      unitPrice: item.unitPrice,
      customsValue: item.customsValue
    }));
  }
  
  
    


module.exports = router;
