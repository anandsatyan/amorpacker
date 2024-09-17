// Add this in app.js or the appropriate router file
const express = require('express');
const axios = require('axios');
const { SHOPIFY_API_URL, ACCESS_TOKEN } = require('../shopifyConfig');
const mongoose = require('mongoose');
const router = express.Router();
const Invoice = require('../models/invoice');

router.get('/', async (req, res) => {
    try {
        console.log("Hit");
        // Fetch the 30 most recent invoices from the database
        const invoices = await Invoice.find().sort({ invoiceDate: -1 }).limit(30);

        let tableHtml = `
            <form id="invoiceForm" method="POST" action="/csbv/export">
                <p><strong>Selected Invoices: <span id="selectedCount">0</span></strong></p> <!-- Display selected count here -->
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background-color: #f2f2f2; font-size: 8pt !important;">
                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">
                                <input type="checkbox" id="selectAll"> Select All
                            </th>
                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Order #</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Customer Name</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Invoice No</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Invoice Date</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        invoices.forEach(invoice => {
            tableHtml += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;"><input type="checkbox" name="invoiceIds" value="${invoice.invoiceId}" class="invoiceCheckbox"></td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${invoice.orderName}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${invoice.customerName}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${invoice.invoiceNumber}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(invoice.invoiceDate).toLocaleDateString()}</td>

                </tr>
            `;
        });

        tableHtml += `
                    </tbody>
                </table>
                <button type="submit">Generate CSBV Excel</button>
            </form>

           <script>
                // Select all checkboxes
                document.getElementById('selectAll').addEventListener('change', function() {
                    const checkboxes = document.querySelectorAll('input[name="invoiceIds"]');
                    checkboxes.forEach(checkbox => checkbox.checked = this.checked);
                    updateSelectedCount(); // Update count after selecting all
                });

                // Function to update the count of selected checkboxes
                function updateSelectedCount() {
                    const selectedCount = document.querySelectorAll('input[name="invoiceIds"]:checked').length;
                    document.getElementById('selectedCount').innerText = selectedCount;
                }

                // Add event listeners to individual checkboxes
                const invoiceCheckboxes = document.querySelectorAll('.invoiceCheckbox');
                invoiceCheckboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', updateSelectedCount);
                });

                // Initial count update
                updateSelectedCount();
            </script>
        `;

        res.send(tableHtml);
    } catch (error) {
        console.error("Error fetching invoices from database:", error);
        res.status(500).send("Failed to load invoices");
    }
});

module.exports = router;
