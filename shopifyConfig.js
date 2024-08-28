// shopifyConfig.js
require('dotenv').config();

module.exports = {
  SHOPIFY_API_URL: 'https://805e95-c9.myshopify.com/admin/api/2023-01',
  ACCESS_TOKEN: process.env.SHOPIFY_ACCESS_TOKEN,
};
