const express = require('express');
const router = express.Router();
const CountryZoneMapping = require('../models/CountryZoneMapping');
const CourierRates = require('../models/CourierRates');

router.get('/picker', async (req, res) => {
    try {
        const countries = await CountryZoneMapping.distinct('country');
        let countryOptions = countries.map(country => `<option value="${country}">${country}</option>`).join('');

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Courier Picker</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background-color: #f9f9f9;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        padding: 0 20px;
                    }
                    .container {
                        background-color: #ffffff;
                        padding: 30px;
                        border-radius: 10px;
                        box-shadow: 0px 0px 20px rgba(0, 0, 0, 0.1);
                        width: 100%;
                        max-width: 500px;
                        box-sizing: border-box;
                    }
                    h1 {
                        text-align: center;
                        color: maroon;
                        margin-bottom: 20px;
                    }
                    label {
                        display: block;
                        font-size: 16px;
                        color: #555;
                        margin-bottom: 10px;
                    }
                    select, input[type="number"], button {
                        width: 100%;
                        padding: 12px;
                        margin-bottom: 15px;
                        border-radius: 5px;
                        border: 1px solid #ddd;
                        font-size: 14px;
                        box-sizing: border-box;
                    }
                    button {
                        background-color: maroon;
                        color: white;
                        font-size: 16px;
                        font-weight: bold;
                        cursor: pointer;
                        border: none;
                    }
                    button:hover {
                        background-color: darkred;
                    }
                    #bestCourier {
                        font-size: 20px;
                        font-weight: bold;
                        color: #ff5722;
                        text-align: center;
                        margin: 20px 0;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 20px;
                    }
                    th, td {
                        border: 1px solid #ddd;
                        padding: 10px;
                        text-align: center;
                    }
                    th {
                        background-color: #f2f2f2;
                        font-weight: bold;
                    }
                </style>
                <script>
                    function findCourier() {
    const country = document.getElementById('country').value;
    const weight = document.getElementById('weight').value;

    fetch('/courier/findCourier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, weight })
    })
    .then(response => response.json())
    .then(data => {
        const rates = {
            "FedEx Account 1": calculateFinalPrice(data.fedexAccount1),
            "FedEx Account 2": calculateFinalPrice(data.fedexAccount2),
            "Aramex": calculateFinalPrice(data.aramex)
        };

        // Determine the cheapest courier
        let cheapestCourier = "No Service";
        let minPrice = Infinity;
        for (let courier in rates) {
            if (rates[courier] !== "No Service" && rates[courier] < minPrice) {
                minPrice = rates[courier];
                cheapestCourier = courier;
            }
        }

        // Fetch Benchmark Price for the US
        fetch('/courier/getBenchmarkPrice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weight })
        })
        .then(response => response.json())
        .then(benchmarkData => {
            // Build the result HTML
            let resultHtml = '<h3>Rates</h3>';
            resultHtml += '<table><tr><th>Courier</th><th>Original Rate</th><th>Final Price (₹)</th></tr>';
            resultHtml += '<tr><td>FedEx Account 1</td><td>' + (data.fedexAccount1 || 'No Service') + '</td><td>' + (rates["FedEx Account 1"] !== "No Service" ? '₹' + rates["FedEx Account 1"].toFixed(2) : 'No Service') + '</td></tr>';
            resultHtml += '<tr><td>FedEx Account 2</td><td>' + (data.fedexAccount2 || 'No Service') + '</td><td>' + (rates["FedEx Account 2"] !== "No Service" ? '₹' + rates["FedEx Account 2"].toFixed(2) : 'No Service') + '</td></tr>';
            resultHtml += '<tr><td>Aramex</td><td>' + (data.aramex || 'No Service') + '</td><td>' + (rates["Aramex"] !== "No Service" ? '₹' + rates["Aramex"].toFixed(2) : 'No Service') + '</td></tr>';
            resultHtml += '</table>';

            // Include the benchmark price
            const benchmarkPrice = benchmarkData.benchmarkPrice !== "No Service" ? '₹' + benchmarkData.benchmarkPrice.toFixed(2) : 'No Service';
            resultHtml += '<br /><br /><div id="benchmarkPrice"><strong>Benchmark Original Price (US): </strong>' + benchmarkPrice + '</div>';

            document.getElementById('results').innerHTML = resultHtml;
            document.getElementById('bestCourier').innerText = 'Pick: ' + cheapestCourier;
        })
        .catch(error => console.error('Error fetching Benchmark Price:', error));
    })
    .catch(error => console.error('Error:', error));
}


                    function calculateFinalPrice(rate) {
                        if (rate === "No Service") return "No Service";
                        const fuelSurcharge = rate * 0.30;
                        const gst = (rate + fuelSurcharge) * 0.18;
                        return rate + fuelSurcharge + gst;
                    }
                </script>
            </head>
            <body>
                <div class="container">
                    <h1>Find Courier Rates</h1>
                    <label for="country">Country:</label>
                    <select id="country">
                        ${countryOptions}
                    </select>
                    <label for="weight">Weight (kg):</label>
                    <input type="number" id="weight" step="0.5" min="0.5" value="10.0">
                    <button onclick="findCourier()">Find Courier</button>
                    <div id="bestCourier"></div>
                    <div id="results"></div>
                </div>
            </body>
            </html>
        `;
        res.send(html);
    } catch (error) {
        console.error('Error fetching countries:', error);
        res.status(500).send('Server error');
    }
});


// Route to handle backend logic for finding courier rates
router.post('/findCourier', async (req, res) => {
    const { country, weight } = req.body;
    if (!country || !weight) {
        return res.status(400).json({ error: 'Country and weight are required' });
    }

    let result = {};

    try {
        // Fetch country-zone mappings for each courier
        const fedexAccount1Zone = await CountryZoneMapping.findOne({ courier: 'FedEx Account 1', country });
        const fedexAccount2Zone = await CountryZoneMapping.findOne({ courier: 'FedEx Account 2', country });
        const aramexZone = await CountryZoneMapping.findOne({ courier: 'Aramex', country });

        // Fetch FedEx Account 1 rates
        if (fedexAccount1Zone) {
            const fedexAccount1Rates = await CourierRates.findOne({ courier: 'FedEx Account 1', zone: fedexAccount1Zone.zone });
            result.fedexAccount1 = fedexAccount1Rates ? getRateByWeight(fedexAccount1Rates.rates, weight) : 'No Service';
        } else {
            result.fedexAccount1 = 'No Service';
        }

        // Fetch FedEx Account 2 rates
        if (fedexAccount2Zone) {
            const fedexAccount2Rates = await CourierRates.findOne({ courier: 'FedEx Account 2', zone: fedexAccount2Zone.zone });
            result.fedexAccount2 = fedexAccount2Rates ? getRateByWeight(fedexAccount2Rates.rates, weight) : 'No Service';
        } else {
            result.fedexAccount2 = 'No Service';
        }

        // Fetch Aramex rates (Check for special rates first)
        const aramexSpecialRates = await CourierRates.findOne({ courier: 'Aramex', country, specialRates: true });
        if (aramexSpecialRates) {
            result.aramex = getRateByWeight(aramexSpecialRates.rates, weight);
        } else if (aramexZone) {
            const aramexRates = await CourierRates.findOne({ courier: 'Aramex', zone: aramexZone.zone });
            result.aramex = aramexRates ? getRateByWeight(aramexRates.rates, weight) : 'No Service';
        } else {
            result.aramex = 'No Service';
        }

        // Send the response
        res.json(result);
    } catch (error) {
        console.error('Error fetching courier data:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Helper function to get the rate by weight
function getRateByWeight(rates, weight) {
    const roundedWeight = Math.ceil(weight * 2) / 2;
    const rate = rates.find(rate => rate.weight === roundedWeight);
    return rate ? rate.rate : 'No Service';
}

// Route to get the US Benchmark Price
router.post('/getBenchmarkPrice', async (req, res) => {
    const { weight } = req.body;
    if (!weight) {
        return res.status(400).json({ error: 'Weight is required' });
    }

    try {
        const couriers = ['FedEx Account 1', 'FedEx Account 2', 'Aramex'];
        let minPrice = Infinity;

        for (const courier of couriers) {
            const benchmarkZone = await CountryZoneMapping.findOne({ courier, country: 'USA' });

            if (benchmarkZone) {
                const benchmarkRates = await CourierRates.findOne({ courier, zone: benchmarkZone.zone });
                const rate = benchmarkRates ? getRateByWeight(benchmarkRates.rates, weight) : null;

                // Check if the rate is available and update minPrice if it's the lowest
                if (rate !== null && rate !== 'No Service' && rate < minPrice) {
                    minPrice = rate;
                }
            }
        }

        // If no valid rate found, return 'No Service'
        const benchmarkPrice = minPrice === Infinity ? 'No Service' : minPrice;

        res.json({ benchmarkPrice });
    } catch (error) {
        console.error('Error fetching benchmark price:', error);
        res.status(500).json({ error: 'Server error' });
    }
});



module.exports = router;
