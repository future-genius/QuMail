const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5001;
const DATABASE_FILE = path.join(__dirname, 'qkd_keys.json');

// In-memory storage for sessions and keys
let qkdKeys = {};
let userSessions = {};
let keyUsageLog = [];

// Load existing data
function loadDatabase() {
    try {
        if (fs.existsSync(DATABASE_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
            qkdKeys = data.qkdKeys || {};
            keyUsageLog = data.keyUsageLog || [];
        }
    } catch (error) {
        console.log('Creating new database...');
    }
}

// Save data
function saveDatabase() {
    try {
        fs.writeFileSync(DATABASE_FILE, JSON.stringify({
            qkdKeys,
            keyUsageLog
        }, null, 2));
    } catch (error) {
        console.error('Failed to save database:', error);
    }
}

// QKD Key Manager
class QKDKeyManager {
    generateKeyId() {
        return `qkd_${crypto.randomBytes(16).toString('hex')}`;
    }

    generateQuantumKey(length = 32) {
        return crypto.randomBytes(length);
    }

    requestKey(sender, recipient, lifetime) {
        const keyId = this.generateKeyId();
        const quantumKey = this.generateQuantumKey(32);
        const keyB64 = quantumKey.toString('base64');
        
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
            algorithm: 'AES-256-GCM',
            key_length: 256
        };
        
        qkdKeys[keyId] = keyData;
        
        keyUsageLog.push({
            key_id: keyId,
            action: 'KEY_GENERATED',
            timestamp: createdAt,
            details: `Generated for ${sender} -> ${recipient}`
        });
        
        saveDatabase();
        console.log(`🔑 Generated key ${keyId} for ${sender} -> ${recipient}`);
        
        return keyData;
    }

    getKey(keyId) {
        const keyData = qkdKeys[keyId];
        if (!keyData) {
            return null;
        }
        
        // Check expiration
        const expiresAt = new Date(keyData.expires_at);
        if (new Date() > expiresAt) {
            keyData.status = 'expired';
            qkdKeys[keyId] = keyData;
            saveDatabase();
        }
        
        // Log access
        keyUsageLog.push({
            key_id: keyId,
            action: 'KEY_ACCESSED',
            timestamp: new Date().toISOString(),
            details: 'Key retrieved for decryption'
        });
        
        saveDatabase();
        console.log(`🔍 Retrieved key ${keyId} (status: ${keyData.status})`);
        
        return keyData;
    }
}

const keyManager = new QKDKeyManager();

// API Routes
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'QuMail QKD Key Manager',
        version: '1.0.0',
        port: PORT,
        timestamp: new Date().toISOString()
    });
});

app.post('/request_key', (req, res) => {
    try {
        const { sender, recipient, lifetime = 3600 } = req.body;
        
        if (!sender || !recipient) {
            return res.status(400).json({
                error: 'sender and recipient are required'
            });
        }
        
        const keyData = keyManager.requestKey(sender, recipient, lifetime);
        
        res.json({
            status: 'success',
            key_id: keyData.key_id,
            key_b64: keyData.key_b64,
            expires_at: keyData.expires_at,
            algorithm: keyData.algorithm
        });
    } catch (error) {
        console.error('❌ Error requesting key:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/get_key/:keyId', (req, res) => {
    try {
        const keyData = keyManager.getKey(req.params.keyId);
        
        if (!keyData) {
            return res.status(404).json({ error: 'Key not found' });
        }
        
        if (keyData.status === 'expired') {
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

app.get('/keys', (req, res) => {
    try {
        const keys = Object.values(qkdKeys)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 50)
            .map(key => ({
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

app.post('/login', (req, res) => {
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
        if (app_password.length !== 16 || app_password.includes(' ')) {
            return res.status(400).json({
                status: 'error',
                message: 'App password must be exactly 16 characters with no spaces'
            });
        }
        
        // For demo purposes, we'll simulate successful authentication
        // In a real implementation, you would test SMTP/IMAP connections here
        console.log(`✅ Simulated login for ${email}`);
        
        // Create session
        const sessionId = crypto.randomBytes(32).toString('hex');
        const createdAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        userSessions[sessionId] = {
            email,
            password: app_password,
            created_at: createdAt,
            expires_at: expiresAt
        };
        
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

app.post('/send_email', (req, res) => {
    try {
        const { to, subject, body, session_id } = req.body;
        
        if (!to || !subject || !body || !session_id) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields'
            });
        }
        
        const session = userSessions[session_id];
        if (!session) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid session. Please log in again.'
            });
        }
        
        // Check session expiration
        const expiresAt = new Date(session.expires_at);
        if (new Date() > expiresAt) {
            return res.status(401).json({
                status: 'error',
                message: 'Session expired. Please log in again.'
            });
        }
        
        console.log(`📧 Simulating email send from ${session.email} to ${to}`);
        
        // Request QKD key
        const qkdKey = keyManager.requestKey(session.email, to, 3600);
        console.log(`🔑 QKD key generated: ${qkdKey.key_id}`);
        
        // Simulate encryption (in real implementation, you would encrypt with AES-256-GCM)
        const encryptedPayload = {
            version: '1.0',
            algorithm: 'AES-256-GCM',
            key_id: qkdKey.key_id,
            ciphertext: Buffer.from(body).toString('base64'), // Simulated encryption
            nonce: crypto.randomBytes(12).toString('base64'),
            tag: crypto.randomBytes(16).toString('base64'),
            timestamp: new Date().toISOString()
        };
        
        console.log(`🎉 Simulated email delivery to ${to} with key ${qkdKey.key_id}`);
        
        res.json({
            status: 'success',
            message: 'Email sent successfully with quantum encryption! (simulated)',
            key_id: qkdKey.key_id
        });
    } catch (error) {
        console.error('❌ Error sending email:', error);
        res.status(500).json({
            status: 'error',
            message: `Unexpected error: ${error.message}`
        });
    }
});

// Initialize and start server
loadDatabase();

app.listen(PORT, () => {
    console.log('🔐 QuMail QKD Key Manager starting...');
    console.log(`🚀 Running on http://localhost:${PORT}`);
    console.log('📡 Ready to issue quantum-secure keys');
});