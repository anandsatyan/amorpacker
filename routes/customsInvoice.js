const express = require('express');
const axios = require('axios');
const router = express.Router();
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');
const { generateCustomsInvoiceLineItemsHtml, generateInvoiceNumber, numberToWords } = require('../utils/helpers');
const Invoice = require('../models/invoice');  // Import the model

router.get('/:orderId/:invoiceId', async (req, res) => {
  const { orderId, invoiceId } = req.params;
    const existingInvoice = await Invoice.findOne({ orderId: orderId, _id: invoiceId });
    console.log("IS EXISTING INVOICE?");
    console.log(existingInvoice);
    
    try {
      const response = await axios.get(`${SHOPIFY_API_URL}/orders/${orderId}.json`, {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
        },
      });

      const order = response.data.order;
      const shippingAddress = order.shipping_address || order.billing_address;
      const invoiceNumber = existingInvoice.invoiceNumber;
      const invoiceDate = existingInvoice.invoiceDate;

      const { itemsHtml, grandTotal } = await generateCustomsInvoiceLineItemsHtml(order);

      let customsInvoiceHtml = `
        <html>
        <head>
            <style>
                body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #333; margin: 0; padding: 20px; }
                .wrapper { width: 100%; max-width: 800px; margin: 0 auto; }
                .invoice-header-table, .invoice-items-table { width: 100%; border-collapse: collapse;}
                .invoice-header-table, .invoice-items-table th, .invoice-header-table td, .invoice-items-table td {
                    border: 1px solid black; padding: 4px; text-align: left; vertical-align: top; font-size: 10pt;
                }
                .invoice-header-table th, .invoice-items-table th {
                    background-color: #ffffff; font-weight: bold;
                }
                .invoice-title { text-align: center; font-size: 20px; font-weight: bold; padding: 10px 0; }
                input[type="text"], input[type="number"] {border: 0 !important; , text-align: center}
                .actions-div { text-align: center; border-bottom: 1px solid #000; padding-bottom: 20px; }
                @media print { .hide-in-print{ display:none; } }
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
                                  <button type="button" class="remove-package-button hide-in-print">Remove</button>
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
                document.getElementById('saveInvoiceButton').addEventListener('click', async () => {
                  // Get the updated HTML content including the values of the editable spans
                  const invoiceContent = document.getElementById('printableInvoiceArea').innerHTML; 

                  const orderId = '${orderId}'; 
                  const invoiceNumber = '${invoiceNumber}';
                  const invoiceDate = '${invoiceDate}';  
                  const invoiceId = '${invoiceId}';
                  const customerName = '${shippingAddress.name}';
                  const orderName = '${order.name}';


                  try {
                    // Show loader (optional)
                    document.getElementById('loader').style.display = 'block';

                    // Send the updated invoice HTML to the backend
                    const response = await fetch('/invoices/save-invoice', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        orderId: orderId,
                        _id: invoiceId,
                        invoiceNumber: invoiceNumber,
                        invoiceDate: invoiceDate,
                        customerName: customerName,
                        orderName: orderName,
                        htmlContent: invoiceContent
                      })
                    });

                    const result = await response.json();
                    document.getElementById('loader').style.display = 'none';  // Hide loader
                    if (response.ok) {
                      alert(result.message);  // Success message
                    } else {
                      alert('Error saving invoice: ' + result.message);
                    }
                  } catch (error) {
                    document.getElementById('loader').style.display = 'none';  // Hide loader
                    console.error('Error saving invoice:', error);
                    alert('Error saving invoice: ' + error.message);
                  }
                });


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
                    document.querySelector('span[name="noOfPackages"]').textContent = numberOfPackages;

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
                  
                  document.querySelector('span[name="grossWeight"]').textContent = totalWeight.toFixed(2);
                  
                  const numberOfPackages = document.querySelectorAll('.package-item').length;
                  const netWeight = totalWeight - (numberOfPackages * 0.25);  // Example calculation
                  document.querySelector('span[name="netWeight"]').textContent = netWeight.toFixed(2);
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
                    <td style="width: 50%; text-align: left; border: 1px solid black; padding: 5px; font-weight: bold;">
                      <span class="product-name" contentEditable="true">&nbsp;</span>
                    </td>
                    <td style="width: 10%; text-align: center; border: 1px solid black; padding: 5px;">
                      <span class="product-hsn" contentEditable="true">&nbsp;</span>
                    </td>
                    <td style="width: 5%; text-align: center; border: 1px solid black; padding: 5px;">
                      <input type="number" class="product-quantity" value="0" style="width: 100% !important; text-align:center;" />
                    </td>
                    <td style="width: 15%; text-align: center; border: 1px solid black; padding: 5px;">
                      <input type="number" class="product-rate" value="0" style="width: 100% !important; text-align:center;" />
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
                    let totalAmount = 0;  // Initialize totalAmount to 0
                    console.log("HIT CALCULATETOTALAMOUNT");

                    const rows = document.querySelectorAll('.invoice-items-table tbody tr');
                    rows.forEach(row => {
                        // Get quantity and rate inputs
                        const quantityInput = row.querySelector('.product-quantity');
                        const rateInput = row.querySelector('.product-rate');
                        const amountCell = row.querySelector('.product-amount');
                        
                        // Check if both inputs exist
                        if (quantityInput && rateInput) {
                            const quantity = parseFloat(quantityInput.value) || 0;  // Use value for input elements
                            const rate = parseFloat(rateInput.value) || 0;  // Use value for input elements

                            // Calculate amount for the row
                            const amount = quantity * rate;

                            // Update the amount cell
                            amountCell.textContent = amount.toFixed(2);  // Update the amount in the row

                            // Add to the total amount
                            totalAmount += amount;
                        }
                    });

                    // Optionally update the total amount display in the invoice
                    document.getElementById('totalAmount').textContent = "$" + totalAmount.toFixed(2);
                    let numInWords = numberToWords(totalAmount);
                    document.getElementById('spanAmtInWords').textContent =numInWords;
                    
                }
                document.querySelectorAll('.product-quantity').forEach(input => {
                    input.addEventListener('input', calculateTotalAmount);
                });

                document.querySelectorAll('.product-rate').forEach(input => {
                    input.addEventListener('input', calculateTotalAmount);
                });

                // Event listener for the Add Line Item button
                document.getElementById('addRowButton').addEventListener('click', addLineItem);

                attachRemoveListeners();
                calculateTotalAmount();
                };
              
                
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
                

              
            </script>

        </head>
        <body>
            <div class="actions-div hide-in-print">
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
            <div class="hide-in-print" style="position:fixed; bottom: 10px; right: 10px;">
                <button id="addRowButton" class="hide-in-print">Add Line Item</button>
                <button id="saveInvoiceButton">Save Invoice</button>
            </div>
            <div id="loader" style="display: none;">
              <div class="spinner"></div>
            </div>`;

      if(!existingInvoice) {
        customsInvoiceHtml += `
              Invoice Not found. `;
      }
      else {
        console.log(`Invoice for Order ID ${orderId} and ${invoiceId} found in the database.`);
        customsInvoiceHtml +=  `<div id="printableInvoiceArea" class="wrapper invoice-container" contentEditable="true">`;
        customsInvoiceHtml += existingInvoice.htmlContent;
        customsInvoiceHtml +=  `</div>`;
      }
      customsInvoiceHtml += `             
      </body>
      </html>`;
      res.send(customsInvoiceHtml);
    } catch (error) {
      console.error("Error generating Export Invoice:", error.response ? error.response.data : error.message);
      res.status(500).send('Error generating Export Invoice. Check if there are samples in this order or if this is a custom draft order.');
    }
  }
  
);


router.post('/save-invoice', async (req, res) => {
  const { orderId, invoiceId, invoiceNumber, invoiceDate, customerName, orderName, htmlContent } = req.body;

  try {
    // Check if the invoice already exists
    let invoice = await Invoice.findOne({ invoiceId });

    if (invoice) {
      // Update existing invoice
      invoice.orderId = orderId;
      invoice.invoiceNumber = invoiceNumber;
      invoice.invoiceDate = invoiceDate;
      invoice.customerName = customerName;
      invoice.orderName = orderName;
      invoice.htmlContent = htmlContent;
    } else {
      // Create new invoice
      invoice = new Invoice({
        orderId,
        invoiceId,
        invoiceNumber,
        invoiceDate,
        customerName,
        orderName,
        htmlContent
      });
    }

    // Save the invoice to the database
    await invoice.save();

    res.json({ message: 'Invoice saved successfully!' });
  } catch (error) {
    console.error('Error saving invoice:', error);
    res.status(500).json({ message: 'Error saving invoice', error });
  }
});

module.exports = router;
