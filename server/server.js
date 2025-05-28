const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // For handling image data




// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Product Schema and Model
const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  expiry: {
    type: Date,
    required: true
  },
  imageUrl: String,
  userId: String, // If you implement user authentication later
  createdAt: {
    type: Date,
    default: Date.now
  },
  notificationSent: {
    type: Boolean,
    default: false
  }
});

const Product = mongoose.model('Product', productSchema);

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// API Routes
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ expiry: 1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  const { name, expiry, imageData } = req.body;
  
  try {
    // If you want to store the image, you'd handle that here
    // For now, we'll just store the product info
    const product = new Product({
      name,
      expiry: new Date(expiry),
      // You could store the image URL if you implement file uploads
    });
    
    const savedProduct = await product.save();
    res.status(201).json(savedProduct);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Function to send expiry notifications
const sendExpiryNotifications = async () => {
  try {
    // Find products expiring in the next 7 days that haven't had notifications sent
    const currentDate = new Date();
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(currentDate.getDate() + 7);
    
    const expiringProducts = await Product.find({
      expiry: { $gte: currentDate, $lte: sevenDaysLater },
      notificationSent: false
    });
    
    if (expiringProducts.length > 0) {
      // Group products by days until expiry for better notification
      const productsByDays = {};
      
      expiringProducts.forEach(product => {
        const daysLeft = Math.ceil((product.expiry - currentDate) / (1000 * 60 * 60 * 24));
        if (!productsByDays[daysLeft]) {
          productsByDays[daysLeft] = [];
        }
        productsByDays[daysLeft].push(product);
      });
      
      // Prepare email content
      let emailContent = '<h1>Product Expiration Alert</h1>';
      emailContent += '<p>The following products are expiring soon:</p>';
      emailContent += '<ul>';
      
      for (const [days, products] of Object.entries(productsByDays)) {
        emailContent += `<h3>Expiring in ${days} day${days === '1' ? '' : 's'}:</h3>`;
        products.forEach(product => {
          emailContent += `<li><strong>${product.name}</strong> - Expires on ${product.expiry.toLocaleDateString()}</li>`;
        });
      }
      
      emailContent += '</ul>';
      
      // Send email
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.NOTIFICATION_EMAIL, // Email to receive notifications
        subject: 'Product Expiration Alert',
        html: emailContent
      };
      
      await transporter.sendMail(mailOptions);
      console.log('Expiry notification email sent');
      
      // Update notification status for these products
      await Product.updateMany(
        { _id: { $in: expiringProducts.map(p => p._id) } },
        { notificationSent: true }
      );
    }
  } catch (err) {
    console.error('Error sending notifications:', err);
  }
};

app.post('/api/send-expiry-email', async (req, res) => {
  const { email, products, daysBeforeExpiry } = req.body;

  try {
    let emailContent = '<h1>Product Expiration Alert</h1>';
    emailContent += '<p>The following products are expiring soon:</p>';
    emailContent += '<ul>';

    products.forEach((product) => {
      const daysLeft = Math.ceil((new Date(product.expiry) - new Date()) / (1000 * 60 * 60 * 24));
      emailContent += `<li><strong>${product.name}</strong> - Expires on ${new Date(product.expiry).toLocaleDateString()}</li>`;
    });

    emailContent += '</ul>';

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Product Expiration Alert',
      html: emailContent,
    };

    await transporter.sendMail(mailOptions);
    console.log('Expiry notification email sent to:', email);

    // Update notification status for these products
    await Product.updateMany(
      { _id: { $in: products.map((p) => p._id) } },
      { notificationSent: true }
    );

    res.status(200).json({ message: 'Email sent successfully' });
  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({ message: 'Failed to send email' });
  }
});

// Schedule daily check for expiring products at 9:00 AM
cron.schedule('0 9 * * *', () => {
  console.log('Running scheduled expiry check...');
  sendExpiryNotifications();
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});