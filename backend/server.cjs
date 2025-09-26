const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5001;

// Database file path
const DB_FILE = path.join(__dirname, 'qkd_keys.json');

// In-memory database
let keyDatabase = {
    keys: [],
    sessions: []
};

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5173', 'https://qumail-quantum-secur-0rte.bolt.host'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Database operations
async function loadDatabase() {
    try {
        const data = await fs.readFile(DB_FILE, 'utf8');
        keyDatabase = JSON.parse(data);
        console.log('📊 Database loaded successfully');
    } catch (error) {
        console.log('📊 Creating new database...');
        await saveDatabase();
    }
}

async function saveDatabase() {
    try {
        await fs.writeFile(DB_FILE, JSON.stringify(keyDatabase, null, 2));
    } catch (error) {
        console.error('❌ Failed to save database:', error);
    }
}

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'QuMail QKD Key Manager',
        timestamp: new Date().toISOString()
    });
});

// Request QKD key
app.post('/request_key', async (req, res) => {
    try {
        const { sender, recipient, lifetime = 3600 } = req.body;
        
        if (!sender || !recipient) {
            return res.status(400).json({
                error: 'sender and recipient are required'
            });
        }

        // Generate key
        const keyId = 'qkd_' + crypto.randomBytes(16).toString('hex');
        const keyB64 = crypto.randomBytes(32).toString('base64');
        const createdAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + lifetime * 1000).toISOString();

        const keyData = {
            key_id: keyId,
            key_b64: keyB64,
            sender,
            recipient,
            created_at: createdAt,
            expires_at: expiresAt,
            status: 'active',
            algorithm: 'AES-256-GCM'
        };

        keyDatabase.keys.push(keyData);
        await saveDatabase();

        console.log(`🔑 Generated key ${keyId} for ${sender} -> ${recipient}`);

        res.json({
            status: 'success',
            key_id: keyId,
            key_b64: keyB64,
            expires_at: expiresAt,
            algorithm: 'AES-256-GCM'
        });

    } catch (error) {
        console.error('❌ Error requesting key:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get key
app.get('/get_key/:keyId', async (req, res) => {
    try {
        const keyData = keyDatabase.keys.find(k => k.key_id === req.params.keyId);
        
        if (!keyData) {
            return res.status(404).json({ error: 'Key not found' });
        }
        
        if (new Date() > new Date(keyData.expires_at)) {
            keyData.status = 'expired';
            return res.status(410).json({ error: 'Key has expired' });
        }
        
        res.json({
            status: 'success',
            key_data: keyData
        });

    } catch (error) {
        console.error('❌ Error retrieving key:', error);
        res.status(500).json({ error: error.message });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    try {
        const { email, app_password } = req.body;
        
        if (!email || !app_password) {
            return res.status(400).json({
                status: 'error',
                message: 'Email and app password are required'
            });
        }
        
        // Validate email format
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid email format'
            });
        }
        
        // Validate app password format
        if (app_password.length !== 16 || /\s/.test(app_password)) {
            return res.status(400).json({
                status: 'error',
                message: 'App password must be exactly 16 characters with no spaces'
            });
        }
        
        // Simulate successful authentication
        const sessionId = crypto.randomBytes(32).toString('hex');
        
        console.log(`✅ Simulated login for ${email}`);
        
        res.json({
            status: 'success',
            session_id: sessionId,
            message: 'Login successful (simulated)',
            email
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            status: 'error',
            message: `Login failed: ${error.message}`
        });
    }
});

// Send email endpoint
app.post('/send_email', async (req, res) => {
    try {
        const { to, subject, body, session_id } = req.body;
        
        if (!to || !subject || !body || !session_id) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields'
            });
        }
        
        // Generate QKD key for this email
        const keyId = 'qkd_' + crypto.randomBytes(16).toString('hex');
        const keyB64 = crypto.randomBytes(32).toString('base64');
        
        const keyData = {
            key_id: keyId,
            key_b64: keyB64,
            sender: 'user@example.com',
            recipient: to,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            status: 'active',
            algorithm: 'AES-256-GCM'
        };

        keyDatabase.keys.push(keyData);
        await saveDatabase();

        console.log(`📧 Simulated email send to ${to} with key ${keyId}`);
        
        res.json({
            status: 'success',
            message: 'Email sent successfully with quantum encryption! (simulated)',
            key_id: keyId
        });

    } catch (error) {
        console.error('❌ Error sending email:', error);
        res.status(500).json({
            status: 'error',
            message: `Unexpected error: ${error.message}`
        });
    }
});

// List keys
app.get('/keys', async (req, res) => {
    try {
        const keys = keyDatabase.keys.slice(-50).map(key => ({
            key_id: key.key_id,
            sender: key.sender,
            recipient: key.recipient,
            created_at: key.created_at,
            expires_at: key.expires_at,
            status: key.status,
            algorithm: key.algorithm
        }));
        
        res.json({
            status: 'success',
            keys,
            count: keys.length
        });

    } catch (error) {
        console.error('❌ Error listing keys:', error);
        res.status(500).json({ error: error.message });
    }
});

// Initialize and start server
async function startServer() {
    try {
        await loadDatabase();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ QuMail QKD Key Manager is running on http://localhost:${PORT}`);
            console.log(`🔑 Quantum Key Distribution Service Active`);
            console.log(`🌐 CORS enabled for frontend connections`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();