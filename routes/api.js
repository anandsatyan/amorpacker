const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const router = express.Router();


// Endpoint for receiving form submission
router.post('/contact-form', async (req, res) => {
  const { name, email, whatsapp, bottleCapacity } = req.body;

  // Parse the bottle capacity and send the correct email
  if (!bottleCapacity) {
    return res.status(400).send('Bottle capacity is required');
  }

  let emailTemplate;
  if (bottleCapacity <= 50) {
    emailTemplate = 'lowRangeTemplate'; // Use the correct template
  } else if (bottleCapacity > 50 && bottleCapacity <= 100) {
    emailTemplate = 'midRangeTemplate';
  } else {
    emailTemplate = 'highRangeTemplate';
  }

  // Send the email based on capacity
  try {
    await sendQuotationEmail(name, email, emailTemplate);
    res.status(200).send('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).send('Failed to send email');
  }
});

// Send email function
async function sendQuotationEmail(name, email, template) {
    const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

  const mailOptions = {
    from: 'info@packamor.com',
    to: 'anand@packamor.com', //email,
    subject: 'Quotation for Your Request',
    text: `Hello ${name},\n\nHere is your quotation: ${template}`
  };

  await transporter.sendMail(mailOptions);
}

module.exports = router;
