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
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background-color: #f2f2f2; font-size: 8pt !important;">
                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">
                                <input type="checkbox" id="selectAll"> Select All
                            </th>
                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Customer Name</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Invoice Date</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Invoice No</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        invoices.forEach(invoice => {
            tableHtml += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                        <input type="checkbox" name="invoiceIds" value="${invoice.invoiceId}">
                    </td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${invoice.customerName}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(invoice.invoiceDate).toLocaleDateString()}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${invoice.invoiceNumber}</td>
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
                });
            </script>
        `;

        res.send(tableHtml);
    } catch (error) {
        console.error("Error fetching invoices from database:", error);
        res.status(500).send("Failed to load invoices");
    }
});

module.exports = router;
