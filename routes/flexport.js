const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();
// Replace this URL with the correct Flexport API endpoint
const flexportApiUrl = 'https://api.flexport.com/products'; 

router.post('/create-product', async (req, res) => {
  console.log(`Using API token: ${process.env.FLEXPORT_API_TOKEN}`);
  try {
    // Product data - you can modify this payload as necessary or pass it from req.body
    const payload = {
      product_code: 'VIC50ML-1234',
      name: 'Victor 50ml Bottles',
      description: 'Only 50ml bottles without tops for victor',
      hs_code: '7010.90.00',
      country_of_origin: 'USA',
      dimensions: {
        length: 38,
        width: 28,
        height: 11
      },
      weight: {
        value: 8,
        unit: 'kg'
      },
      customs_value: {
        value: 88,
        currency: 'USD'
      },
      classification_type: 'hs_code',
      packaging_type: 'box'
    };

    // Get the API token from the environment variable
    const apiKey = process.env.FLEXPORT_API_TOKEN;

    if (!apiKey) {
      return res.status(500).json({ message: 'API token not found' });
    }

    // Make the POST request to Flexport API
    const response = await axios.post(flexportApiUrl, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Flexport-Version': '1' // Include the correct version if necessary
      }
    });

    // Return a success response
    res.status(200).json({
      message: 'Product created successfully',
      data: response.data
    });

  } catch (error) {
    // Log and return the error if the API call fails
    console.error('Error creating product:', error.response ? error.response.data : error.message);
    res.status(500).json({
      message: 'Error creating product',
      error: error.response ? error.response.data : error.message
    });
  }
});

module.exports = router;
