const express = require('express');
const axios = require('axios');
const router = express.Router();
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');
const { generateCustomsInvoiceLineItemsHtml, generateInvoiceNumber, numberToWords } = require('../utils/helpers');

router.get('/:orderId', async (req, res) => {
  const orderId = req.params.orderId;

  try {
    const response = await axios.get(`${SHOPIFY_API_URL}/orders/${orderId}.json`, {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
      },
    });

    const order = response.data.order;
    const shippingAddress = order.shipping_address || order.billing_address;
    const invoiceNumber = generateInvoiceNumber(order.name);
    const invoiceDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const { itemsHtml, grandTotal } = await generateCustomsInvoiceLineItemsHtml(order);

    let customsInvoiceHtml = `
      <html>
      <head>
          <style>
              body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #333; margin: 0; padding: 20px; }
              .wrapper { width: 100%; max-width: 800px; margin: 0 auto; }
              .invoice-header-table, .invoice-items-table { width: 100%; border-collapse: collapse;}
              .invoice-header-table, .invoice-items-table th, .invoice-header-table td, .invoice-items-table td {
                  border: 1px solid black; padding: 10px; text-align: left; vertical-align: top; font-size: 10pt;
              }
              .invoice-header-table th, .invoice-items-table th {
                  background-color: #ffffff; font-weight: bold;
              }
              .invoice-title { text-align: center; font-size: 20px; font-weight: bold; padding: 10px 0; }
              input[type="text"], input[type="number"] {border: 0 !important; }
              .actions-div { text-align: center; border-bottom: 1px solid #000; padding-bottom: 20px; }
              @media print { .actions-div { display:none; } }
              #loader {
                position: fixed;
                top: 10px;  /* Adjust as needed */
                right: 10px;  /* Adjust as needed */
                z-index: 9999;
              }

              /* Spinner style */
              .spinner {
                border: 4px solid rgba(0, 0, 0, 0.1);
                width: 36px;
                height: 36px;
                border-radius: 50%;
                border-left-color: #000;
                animation: spin 1s linear infinite;
              }

              /* Keyframes for spinner animation */
              @keyframes spin {
                0% {
                  transform: rotate(0deg);
                }
                100% {
                  transform: rotate(360deg);
                }
              }
          </style>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.2/html2pdf.bundle.min.js"></script>
          <script>
            window.onload = function() {
              // Ensure the button exists before adding an event listener
              const createAWBButton = document.getElementById('createAWBButton');
              if (createAWBButton) {
                console.log("Create AWB button found, adding event listener.");

                // Function to create AWB
                createAWBButton.addEventListener('click', async () => {
                  const orderId = '${orderId}';
                  document.getElementById('loader').style.display = 'block';
                  console.log("AWB creation initiated for orderId:", orderId);

                  const packages = [];
                  let hasInvalidPackage = false; // Flag to track if there's any invalid package

                  document.querySelectorAll('.package-item').forEach(packageItem => {
                    const weight = parseFloat(packageItem.querySelector('.package-weight').value) || 0;
                    const length = parseFloat(packageItem.querySelector('.package-length').value) || 0;
                    const width = parseFloat(packageItem.querySelector('.package-width').value) || 0;
                    const height = parseFloat(packageItem.querySelector('.package-height').value) || 0;

                    // Check if all fields are filled
                    if (weight > 0 && length > 0 && width > 0 && height > 0) {
                      // Only add complete packages
                      packages.push({
                        weight,
                        dimensions: {
                          length,
                          width,
                          height,
                        }
                      });
                    } else {
                      hasInvalidPackage = true; // Mark as invalid if any field is missing
                      packageItem.remove(); // Remove incomplete package from the UI
                    }
                  });

                  if (hasInvalidPackage) {
                    alert('Some packages were incomplete and have been removed. Please review your package details.');
                    document.getElementById('loader').style.display = 'none';
                  }

                  if (packages.length === 0) {
                    alert('No valid packages to send. Please add package details.');
                    document.getElementById('loader').style.display = 'none';
                    return;
                  }

                  try {
                      // Fetch request to create a shipment
                      const response = await fetch('/create-shipment', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ orderId, packages })
                      });

                      // Parse the response as JSON
                      const result = await response.json();
                      console.log("AWB response received:", result);

                      if (response.ok && result.shipmentDetails && result.shipmentDetails.output) {
                        const transactionShipments = result.shipmentDetails.output.transactionShipments;

                        if (transactionShipments && transactionShipments.length > 0) {
                          // Extract the master tracking number (AWB number) from the first transaction shipment
                          const awbNumber = transactionShipments[0].masterTrackingNumber;
                          // Alert or display AWB number
                          alert('AWB created successfully! AWB Number: ' + awbNumber);

                          // Check and download the label
                          if (result.base64Label) {  // Use 'result' instead of 'data'
                            downloadLabel(result.base64Label, 'FedExLabel.pdf');  // Ensure correct usage of 'result.base64Label'
                          } else {
                            console.error('Label data not found in response.');
                            alert('Label data not found in response.');
                          }
                        } else {
                          alert('Error: Transaction shipments not found in the response.');
                        }
                      } else {
                        // If the response is not OK, display the error
                        alert('Error creating AWB: ' + (result.error || 'Unknown error'));
                      }
                    } catch (error) {
                      // Catch any errors during the fetch or JSON parsing
                      console.error('Error creating AWB:', error.message);
                      alert('Error creating AWB: ' + error.message);
                    } finally {
                      // Hide the loader regardless of success or error
                      document.getElementById('loader').style.display = 'none';
                    }

                });
              } else {
                console.error("Create AWB button not found.");
              }
                // Function to handle Add Package button click
              const addPackageButton = document.getElementById('addPackageButton');
              if (addPackageButton) {
                  console.log("Add Package button found, adding event listener.");
                  addPackageButton.addEventListener('click', function() {
                      const packageList = document.getElementById('packageList');
                      const listItem = document.createElement('li');
                      listItem.className = 'package-item';

                    // Add input fields for weight and dimensions along with a remove button
                    listItem.innerHTML = \`
                        <div style="margin-bottom: 10px;">
                            <span style="border: 1px solid #CCC; padding: 10px;">
                                <label>Weight (kg):</label>
                                <input type="number" class="package-weight" min="0" step="0.01" style="width: 60px;" required />
                                <label>Length (cm):</label>
                                <input type="number" class="package-length" min="0" style="width: 60px;" required />
                                <label>Width (cm):</label>
                                <input type="number" class="package-width" min="0" style="width: 60px;" required />
                                <label>Height (cm):</label>
                                <input type="number" class="package-height" min="0" style="width: 60px;" required />
                                <button type="button" class="remove-package-button">Remove</button>
                            </span>
                        </div>
                    \`;

                    // Append the new package item to the list
                    packageList.appendChild(listItem);

                    // Attach event listeners to the new input fields
                    listItem.querySelector('.package-weight').addEventListener('input', updateNetWeight);
                    listItem.querySelector('.remove-package-button').addEventListener('click', function() {
                        // Remove this package item
                        listItem.remove();
                        
                        // Update the number of packages and net weight
                        updatePackageCount();
                    });

                    // Update the number of packages
                    updatePackageCount();
                });
            } else {
                console.error("Add Package button not found.");
            }

              document.getElementById('generatePdfButton').addEventListener('click', () => {
                  console.log("PDF GENERATING...");

                  // Retrieve order and customer names
                  const orderName = '${order.name}';
                  const customerName = '${shippingAddress.name}';

                  // Define the file name using the pattern: orderName-customerName.pdf
                  const fileName = \`\${orderName}-\${customerName}.pdf\`;

                  // Get the content to be converted into PDF
                  const invoiceContent = document.getElementById('printableInvoiceArea');

                  // Ensure all images are fully loaded before generating PDF
                  const images = invoiceContent.getElementsByTagName('img');
                  const imagePromises = Array.from(images).map(img => {
                      return new Promise((resolve, reject) => {
                          if (img.complete) {
                              resolve();
                          } else {
                              img.onload = resolve;
                              img.onerror = reject;
                          }
                      });
                  });

                  // Wait for all images to load before creating PDF
                  Promise.all(imagePromises)
                      .then(() => {
                          const options = {
                              margin: 0.5,
                              filename: fileName,
                              image: { type: 'jpeg', quality: 0.98 },
                              html2canvas: { scale: 2 },
                              jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
                          };

                          // Convert content to PDF and download
                          html2pdf().from(invoiceContent).set(options).save();
                      })
                      .catch((error) => {
                          console.error('Error loading images:', error);
                          alert('Failed to load all images, please try again.');
                      });
              });


              // Function to update the number of packages
              function updatePackageCount() {
                  const numberOfPackages = document.querySelectorAll('.package-item').length;
                  document.getElementsByName("noOfPackages")[0].value = numberOfPackages;

                  // Update the net weight
                  updateNetWeight();
              }

              // Function to update the net weight
              function updateNetWeight() {
                  const packageWeights = document.querySelectorAll('.package-weight');
                  let totalWeight = 0;
                  packageWeights.forEach(input => {
                      totalWeight += parseFloat(input.value) || 0;
                  });
                  document.getElementsByName("netWeight")[0].value = totalWeight.toFixed(2);
                  const numberOfPackages = document.querySelectorAll('.package-item').length;
                  const grossWeight = totalWeight + (numberOfPackages * 0.25);
                  document.getElementsByName("grossWeight")[0].value = grossWeight.toFixed(2);
              }

              // Initial call to set package count and weight on load
              updatePackageCount();

              // Function to validate and print invoice
              function validateAndPrint() {
                const grossWeight = document.getElementsByName("grossWeight")[0].value;
                const netWeight = document.getElementsByName("netWeight")[0].value;
                const noOfPackages = document.getElementsByName("noOfPackages")[0].value;

                if (grossWeight === "" || netWeight === "" || noOfPackages === "") {
                  alert("Please fill in all fields before printing the invoice.");
                } else {
                  window.print();
                }
              }

              // Event listener for Print Invoice button
              document.querySelector('button[onClick="validateAndPrint()"]').addEventListener('click', validateAndPrint);
              function addLineItem() {
                const tbody = document.getElementById('invoiceItems');
                const row = document.createElement('tr');

                row.innerHTML = \`
                  <td class="remove-row-button" style="width: 5%; text-align: left; border: 1px solid black; padding: 5px;">
                    <button style="position: relative; left: -100px;" contentEditable="false">Remove</button>
                  </td>
                  <td style="width: 50%; text-align: left; border: 1px solid black; padding: 5px;">
                    <span class="product-name" contentEditable="true">&nbsp;</span>
                  </td>
                  <td style="width: 10%; text-align: center; border: 1px solid black; padding: 5px;">
                    <span class="product-hsn" contentEditable="true">&nbsp;</span>
                  </td>
                  <td style="width: 5%; text-align: center; border: 1px solid black; padding: 5px;">
                    <span class="product-quantity" contentEditable="true">&nbsp;</span>
                  </td>
                  <td style="width: 15%; text-align: center; border: 1px solid black; padding: 5px;">
                    <span class="product-rate" contentEditable="true">&nbsp;</span>
                  </td>
                  <td style="width: 15%; text-align: right; border: 1px solid black; padding: 5px;">
                    $<span class="product-amount">0.00</span>
                  </td>
                \`;

                // Add the new row to the table body
                tbody.appendChild(row);

                // Attach event listener to the remove button in the new row
                row.querySelector('.remove-row-button button').addEventListener('click', () => {
                  row.remove();
                  calculateTotalAmount();
                });

                // Attach event listeners to update the total when quantity or rate is edited
                const quantitySpan = row.querySelector('.product-quantity');
                const rateSpan = row.querySelector('.product-rate');

                quantitySpan.addEventListener('input', calculateTotalAmount);
                rateSpan.addEventListener('input', calculateTotalAmount);

                // Additionally listen for 'blur' event to ensure changes are caught when focus is lost
                quantitySpan.addEventListener('blur', calculateTotalAmount);
                rateSpan.addEventListener('blur', calculateTotalAmount);


                calculateTotalAmount(); // Recalculate the total amount after adding a new row
              }
              function attachRemoveListeners() {
                document.querySelectorAll('.remove-row-button button').forEach(button => {
                  button.addEventListener('click', function () {
                    this.closest('tr').remove();
                    calculateTotalAmount();
                  });
                });
              }
              // Function to calculate the total amount
              function calculateTotalAmount() {
                let totalAmount = 0;
                console.log("HIT CALCULATETOTALAMOUNT");
                // Select all table rows in the tbody
                const rows = document.querySelectorAll('.invoice-items-table tbody tr');

                // Iterate through each row
                rows.forEach(row => {
                  // Get quantity and rate inputs
                  const quantityInput = row.querySelector('.product-quantity');
                  const rateInput = row.querySelector('.product-rate');

                  // Check if both inputs exist
                  if (quantityInput && rateInput) {
                    const quantity = parseFloat(quantityInput.textContent.trim()) || 0;
                    const rate = parseFloat(rateInput.textContent.trim()) || 0;

                    // Calculate amount for the row
                    const amount = quantity * rate;

                    // Update the amount cell
                    row.querySelector('.product-amount').textContent = amount.toFixed(2);

                    // Add to the total amount
                    totalAmount += amount;
                  }
                });

                // Optionally update the total amount display in the invoice
                 document.getElementById('totalAmount').textContent = totalAmount.toFixed(2);
              }

              // Event listener for the Add Line Item button
              document.getElementById('addRowButton').addEventListener('click', addLineItem);
              attachRemoveListeners();
              calculateTotalAmount();
            };
            
          function downloadLabel(base64Label, filename) {
              // Decode the base64 string to binary
              const binaryString = window.atob(base64Label);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);

              for (let i = 0; i < len; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
              }

              // Create a Blob with the PDF data
              const blob = new Blob([bytes], { type: 'application/pdf' });
              const url = window.URL.createObjectURL(blob);

              // Create a link element, set its download attribute and click it to download the file
              const link = document.createElement('a');
              link.href = url;
              link.download = filename;
              document.body.appendChild(link);
              link.click();

              // Clean up and remove the link
              link.parentNode.removeChild(link);
              window.URL.revokeObjectURL(url);
          }
          </script>

      </head>
      <body>
          <div class="actions-div">
            <button id="createAWBButton">Create Fedex AWB</button>
            <button onClick="validateAndPrint()">Print Invoice</button>
            <button id="generatePdfButton">Download PDF</button>
          
            <br />
              <ul id="packageList" class="package-list" style="margin-top: 20px; list-style-type: none; padding: 0;margin-left: auto; margin-right: auto;">
                <!-- Dynamic package items will be added here -->
              </ul><br />
              <div class="package-management" style="text-align: center;">
                <button id="addPackageButton">Add Package</button>
              </div>
            </div>
          <br /><br />
          <div id="printableInvoiceArea" class="wrapper invoice-container" contentEditable="true">
              <!-- First Table (Header Information) -->
              <table class="invoice-header-table">
                  <tr><td colspan="3" class="invoice-title"><center>INVOICE</center></td></tr>
                  <tr>
                      <td rowspan="3" class="seller-info">
                          <strong>Seller:</strong><br>
                          Brandsamor Commerce LLP<br>
                          50 Raghavendra Nagar Rajakilpakkam<br>
                          Tambaram Chennai 600073<br>
                          Tamilnadu India<br>
                          info@brandsamor.com | +91 9840167314
                      </td>
                      <td>
                          <strong>Invoice No. & Dt</strong><br>
                          ${invoiceNumber}<br>
                          DT: ${invoiceDate}
                      </td>
                      <td>
                          <strong>AD Code:</strong> 0202632<br>
                          <strong>GSTIN:</strong> 33ABCFB8402A1Z8
                      </td>
                  </tr>
                  <tr>
                      <td>
                          <strong>Buyer's Order No. & Dt</strong><br>
                          Order ${order.name}<br>
                          DT: ${new Date(order.created_at).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                      </td>
                      <td>
                          <strong>IEC:</strong> ABCFB8402A<br>
                          <strong>LUT:</strong> AD330524103870G
                      </td>
                  </tr>
                  <tr>
                      <td colspan="2">
                          <strong>Other reference(s):</strong> ${order.name}
                      </td>
                  </tr>
                  <tr>
                      <td>
                          <strong>Bill To:</strong><br>
                          Brandsamor Commerce L.L.C-FZ<br>
                          The Meydan Hotel, Grandstand, 6th floor,<br>
                          Meydan Road, Nad Al Sheba,<br>
                          Dubai, U.A.E<br>
                          info@packamor.com | +971 52 154 3617
                      </td>
                      <td>
                          <strong>Ship To:</strong><br>
                          ${shippingAddress.name}<br />
                          ${shippingAddress.company ? `${shippingAddress.company}<br />` : ''}
                          ${shippingAddress.address1}, ${shippingAddress.address2 || ''}<br />
                          ${shippingAddress.city}, ${shippingAddress.province} ${shippingAddress.zip}<br />
                          <strong>${shippingAddress.country}</strong><br /><br />
                          ${shippingAddress.phone ? `Phone: ${shippingAddress.phone}<br />` : ''}
                          ${order.email ? `Email: ${order.email}` : ''}
                      </td>
                      <td>
                          <strong>Buyer (if other than consignee)</strong><br><br>
                          <strong>Gross Wt:</strong> <input type="text" name="grossWeight" style="max-width: 40px;" /> kg<br>
                          <strong>Net Wt:</strong> <input type="text" name="netWeight" style="max-width: 40px;"/> kg <br>
                          <strong>No. of Pkgs:</strong><input type="number" style="max-width: 40px;" name="noOfPackages" />
                      </td>
                  </tr>
                  <tr>
                      <td>
                          <strong>Person:</strong><br />
                          ${shippingAddress.name}<br />
                          Tel.:${shippingAddress.phone}
                      </td>
                      <td>
                          <strong>Country of Origin of Goods:</strong><br />
                          India
                      </td>
                      <td>
                          <strong>Country of final destination</strong><br />
                          ${shippingAddress.country ? `${shippingAddress.country}` : ''}
                      </td>
                  </tr>
                  <tr>
                      <td>
                          <strong>Pre-Carriage by</strong> ROAD<br>
                          <strong>Vessel / Flight No.</strong><br>
                          <strong>Port of Discharge</strong> Air
                      </td>
                      <td>
                          <strong>Place of Receipt by pre-carrier</strong><br>
                          <strong>Port of loading</strong> Chennai<br>
                          <strong>Final Destination</strong><br />
                          ${shippingAddress.city ? `${shippingAddress.city}, ` : ''}
                          ${shippingAddress.province ? `${shippingAddress.province}, ` : ''}
                          ${shippingAddress.country ? `${shippingAddress.country}` : ''}
                      </td>
                      <td>
                          <strong>Terms of Delivery & payment</strong><br>
                          CIF
                      </td>
                  </tr>
              </table>

              <!-- Second Table (Items List) -->
              <table class="invoice-items-table">
                  <thead>
                      <tr>
                          <th style="width: 5%; text-align: center;">&nbsp;</th>
                          <th style="width: 50%;">Description of Goods</th>
                          <th style="width: 10%; text-align: center;">HSN</th>
                          <th style="width: 5%; text-align: center;">Qty</th>
                          <th style="width: 15%; text-align: center;">Rate</th>
                          <th style="width: 15%; text-align: right;">Amount</th>
                      </tr>
                  </thead>
                  <tbody id="invoiceItems">
                      ${itemsHtml}
                  </tbody>
                  <tfoot>
                      <tr>
                        <td colspan="5"><strong>AMOUNT (USD)</strong></td>
                        <td style="text-align: right; font-weight: bold;">$${grandTotal.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colspan="6" style="text-transform: uppercase"><strong>AMOUNT IN WORDS: ${numberToWords(grandTotal.toFixed(2))}</strong></td>
                      </tr>
                      <tr>
                          <td colspan="6" style="text-transform: uppercase">
                            <strong>Bank Details:</strong> <br />
                            ACCOUNT NAME: BRANDSAMOR COMMERCE LLP<br />
                            Account NO: 35060200000552<br />
                            IFSC CODE: BARB0RAJAKI<br />
                            SWIFT CODE : BARBINBBTAM<br />
                          </td>
                      </tr>
                      <tr>
                        <td colspan="6"><center><strong>Declaration : This invoice is for customs purpose only. We declare that invoice shows the actual price of goods described and that all particulars are true & correct.</strong></center></td>
                      </tr>
                      <tr>
                        <td colspan="6"><center>Note: Invoice is digitally signed and manual signature is not required</center></td>
                      </tr>
                  </tfoot>
              </table>
             <!-- Image at the Bottom -->
              <div style="text-align: right; margin-top: -80px;">
                  <img id="brandImage" src="https://cdn.shopify.com/s/files/1/0857/0984/8873/files/BRANDSAMOR_COMMERCE_L.L.P..png?v=1722773361" width="150px" />
              </div>
          </div>
          <div style="position:fixed; bottom: 10px; right: 10px;">
              <button id="addRowButton">Add Line Item</button>
          </div>
      <div id="loader" style="display: none;">
        <div class="spinner"></div>
      </div>
      </body>
      </html>`;

    console.log("HITTTTTT");

    res.send(customsInvoiceHtml);

  } catch (error) {
    console.error("Error generating Export Invoice:", error.response ? error.response.data : error.message);
    res.status(500).send('Error generating Export Invoice. Check if there are samples in this order or if this is a custom draft order.');
  }
});

module.exports = router;
