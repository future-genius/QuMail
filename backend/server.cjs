const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5001;

// Enable CORS for all origins (development)
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: "Backend is running ✅",
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Mock login endpoint
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email and password required' 
    });
  }

  // Mock successful login
  res.json({
    success: true,
    message: 'Login successful',
    session_id: 'mock_session_' + Date.now(),
    user: { email }
  });
});

// Mock logout endpoint
app.post('/api/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Mock QKD key request endpoint
app.post('/api/request-qkd-key', (req, res) => {
  const { sender, recipient } = req.body;
  
  res.json({
    success: true,
    key_id: 'qkd_' + Math.random().toString(36).substr(2, 16),
    key_b64: Buffer.from(Math.random().toString()).toString('base64'),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    message: 'QKD key generated successfully'
  });
});

// Mock send email endpoint
app.post('/api/send-email', (req, res) => {
  const { to, subject, body } = req.body;
  
  res.json({
    success: true,
    message: 'Email sent with quantum encryption',
    email_id: 'email_' + Math.random().toString(36).substr(2, 16),
    key_id: 'qkd_' + Math.random().toString(36).substr(2, 16)
  });
});

// Mock get emails endpoint
app.get('/api/emails', (req, res) => {
  res.json({
    success: true,
    emails: [
      {
        id: 'email_1',
        from: 'test@example.com',
        to: 'recipient@example.com',
        subject: 'Test Encrypted Email',
        body: 'This is a test message',
        created_at: new Date().toISOString(),
        key_id: 'qkd_test_key',
        status: 'sent'
      }
    ]
  });
});

// Mock decrypt email endpoint
app.post('/api/decrypt-email', (req, res) => {
  const { email_id } = req.body;
  
  res.json({
    success: true,
    decrypted_body: 'This is the decrypted message content!'
  });
});

// Mock get keys endpoint
app.get('/api/keys', (req, res) => {
  res.json({
    success: true,
    keys: [
      {
        key_id: 'qkd_sample_key_123',
        sender: 'test@example.com',
        recipient: 'recipient@example.com',
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        algorithm: 'AES-256-GCM'
      }
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    message: 'Internal server error' 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Endpoint not found' 
  });
});

// Start server
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 QuMail Backend running on http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔐 CORS enabled for frontend connections`);
});

module.exports = app;