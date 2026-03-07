const emailService = require('../services/emailService');
const logger = require('../config/logger');

// Retrieve SMTP user or fallback to standard info email for admin notifications
const adminEmail = process.env.SMTP_USER || 'info@snowcity.com';

const submitContactForm = async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;

        if (!name || !email || !phone || !message) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        // Email to Snowcity Admin
        const adminHtml = `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
      <br>
      <hr>
      <p><i>This message was sent securely from the Snow City website contact form.</i></p>
    `;

        // Dispatch to admin synchronously to ensure failure sends 500
        await emailService.send({
            to: adminEmail,
            subject: `New Contact Request from ${name}`,
            html: adminHtml,
        });

        // Email Auto-Response to Visitor
        // We run this without awaiting so the initial request returns faster for the user,
        // though we could safely await it.
        const userHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #0099FF;">Thank You for Contacting Us, ${name}!</h2>
        <p>We have successfully received your message.</p>
        <div style="margin: 20px 0; padding: 15px; background: #f5f8ff; border-radius: 8px;">
          <strong>Your query:</strong><br/>
          <em>${message}</em>
        </div>
        <p>Our team will review your inquiry and get back to you shortly.</p>
        <p>Best Regards,<br><strong>Snow City Theme Park</strong></p>
      </div>
    `;

        emailService.send({
            to: email,
            subject: 'We have received your message - Snow City',
            html: userHtml,
        }).catch(err => {
            logger.error('Failed to send contact auto-response email to user', { email, error: err.message });
        });

        return res.status(200).json({ success: true, message: 'Message sent successfully.' });
    } catch (error) {
        logger.error('Contact Form Submission Error:', error);
        return res.status(500).json({ error: 'Failed to send your message. Please try again later.' });
    }
};

module.exports = {
    submitContactForm,
};
