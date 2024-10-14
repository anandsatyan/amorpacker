const express = require('express');
const axios = require('axios');
const router = express.Router();
require('dotenv').config(); // Ensure this is used to load environment variables

const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Flexport API endpoint
const flexportApiUrl = 'https://api.flexport.com/products';

// Route to create the product
router.get('/create-product', async (req, res) => {
console.log(`Using API token: ${process.env.FLEXPORT_API_TOKEN}`);
  try {
    // Product data (could also be passed from req.body)
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

    // Get the API key from the environment variable
    const apiKey = process.env.FLEXPORT_API_TOKEN;

    if (!apiKey) {
      return res.status(500).json({ message: 'API key not found' });
    }

    // Make the API call to Flexport
    const response = await axios.post(flexportApiUrl, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    // Send a success response back to the client
    res.status(200).json({
      message: 'Product created successfully',
      data: response.data
    });

  } catch (error) {
    // Handle errors and send an error response back to the client
    res.status(500).json({
      message: 'Error creating product',
      error: error.response ? error.response.data : error.message
    });
  }
});


module.exports = router;