// routes/packingSlip.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { fromPath } = require('pdf2pic');
const { PDFDocument } = require('pdf-lib');

const { fetchProductMetafields, generateLineItemHtml } = require('../utils/helpers');
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');
const fs = require('fs');

// Check if the uploads directory exists, if not, create it
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const multer = require('multer');
const path = require('path');

const imageDir = path.join(__dirname, '../uploads/images');
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');  // save files in 'uploads' directory
  },
  filename: (req, file, cb) => {
    cb(null, `${req.params.orderId}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage: storage });


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
          <hr>
          <div style="text-align: end;">
            <input type="checkbox" />&nbsp;Samples&nbsp; 
            <input type="checkbox" />&nbsp;Stickers&nbsp;
            <input type="checkbox" />&nbsp;Tester+Holder&nbsp;
            <input type="checkbox" />&nbsp;Sample Box&nbsp;
            <input type="checkbox" />&nbsp;QC Complete
          </div>`;

         // Path to the uploaded PDF file
          const pdfFilePath = path.join(__dirname, '../uploads', `${orderId}.pdf`);

          // Check if the PDF file exists
          if (fs.existsSync(pdfFilePath)) {
            // Load the PDF using pdf-lib to get the total number of pages
            const pdfBuffer = fs.readFileSync(pdfFilePath);
            const pdfDoc = await PDFDocument.load(pdfBuffer);
            const totalPages = pdfDoc.getPageCount(); // Get total page count

            // Set up pdf2pic conversion options
            const options = {
              density: 100, // DPI of the images
              saveFilename: `${orderId}_page`,
              savePath: path.join(__dirname, '../uploads/images'),
              format: 'png',
              width: 150, // Width of the image
              height: 150, // Height of the image
            };

            const storeAsImage = fromPath(pdfFilePath, options);
            packingSlipHtml += `Label Preview <br /><hr/><br />`;
            // Loop through all pages and convert each page to an image
            for (let i = 1; i <= totalPages; i++) {
              await storeAsImage(i); // Convert each page to an image

              // Add the generated image as a preview to the HTML
              packingSlipHtml += `
                <span class="pdf-preview">
                  <img src="/uploads/images/${orderId}_page.${i}.png" alt="PDF Preview - Page ${i}" style="width: 150px; height: auto;" />
                </span>`;
            }
          } else {
            packingSlipHtml += `
              <hr>
              <div>
                <p>...</p>
              </div>`;
          }

          packingSlipHtml += `</body></html>`;

          res.send(packingSlipHtml);


  } catch (error) {
    console.error("Error generating packing slip:", error.response ? error.response.data : error.message);
    res.status(500).send('Error generating packing slip. Check if there are samples in this order or if this is a custom draft order.');
  }
});

router.post('/:orderId/upload', upload.single('pdfFile'), (req, res) => {
  const orderId = req.params.orderId;

  if (req.file) {
    // Redirect to the GET route that shows the packing slip
    return res.redirect(`/generate-packing-slip/${orderId}?success=true`);
  }

  // If no file is uploaded, return an error message
  res.status(400).send('No file uploaded. Please upload a PDF.');
});


router.get('/:orderId/upload-pdf', (req, res) => {
  const orderId = req.params.orderId;
  res.send(`
    <form action="/generate-packing-slip/${orderId}/upload" method="post" enctype="multipart/form-data">
      <h3>Upload PDF Design:</h3>
      <input type="file" name="pdfFile" accept="application/pdf" required />
      <button type="submit">Upload PDF</button>
    </form>
  `);
});

module.exports = router;
