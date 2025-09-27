const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 5001;

// Database file path
const DB_FILE = path.join(__dirname, 'qkd_keys.json');

// In-memory database
let keyDatabase = {
    keys: [],
    sessions: [],
    usage_log: []
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

        // Ensure keys, sessions, and usage_log exist
        keyDatabase.keys = keyDatabase.keys || [];
        keyDatabase.sessions = keyDatabase.sessions || [];
        keyDatabase.usage_log = keyDatabase.usage_log || [];

        console.log('📊 Database loaded successfully');
    } catch (error) {
        console.log('📊 Creating new database...');
        keyDatabase = { keys: [], sessions: [], usage_log: [] };
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

// QKD Key Manager Class
class QKDKeyManager {
    generateKeyId() {
        return 'qkd_' + crypto.randomBytes(16).toString('hex');
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
        
        keyDatabase.keys.push(keyData);
        
        keyDatabase.usage_log.push({
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
        const keyData = keyDatabase.keys.find(k => k.key_id === keyId);
        if (!keyData) {
            return null;
        }
        
        // Check expiration
        const expiresAt = new Date(keyData.expires_at);
        if (new Date() > expiresAt) {
            keyData.status = 'expired';
            const keyIndex = keyDatabase.keys.findIndex(k => k.key_id === keyId);
            if (keyIndex !== -1) {
                keyDatabase.keys[keyIndex] = keyData;
                saveDatabase();
            }
        }
        
        // Log access
        keyDatabase.usage_log.push({
            key_id: keyId,
            action: 'KEY_ACCESSED',
            timestamp: new Date().toISOString(),
            details: 'Key retrieved for decryption'
        });
        
        saveDatabase();
        console.log(`🔍 Retrieved key ${keyId} (status: ${keyData.status})`);
        
        return keyData;
    }

    getAllKeys() {
        return keyDatabase.keys.slice(-50).map(key => ({
            key_id: key.key_id,
            sender: key.sender,
            recipient: key.recipient,
            created_at: key.created_at,
            expires_at: key.expires_at,
            status: key.status,
            algorithm: key.algorithm
        }));
    }
}

const keyManager = new QKDKeyManager();

// AES-256-GCM Encryption/Decryption utilities
function encryptMessage(plaintext, keyB64) {
    try {
        const key = Buffer.from(keyB64, 'base64');
        const cipher = crypto.createCipher('aes-256-gcm', key);
        const nonce = crypto.randomBytes(12);
        
        cipher.setAAD(Buffer.from('QuMail-v1.0'));
        let ciphertext = cipher.update(plaintext, 'utf8');
        ciphertext = Buffer.concat([ciphertext, cipher.final()]);
        const tag = cipher.getAuthTag();
        
        return {
            ciphertext: ciphertext.toString('base64'),
            nonce: nonce.toString('base64'),
            tag: tag.toString('base64')
        };
    } catch (error) {
        throw new Error(`Encryption failed: ${error.message}`);
    }
}

function decryptMessage(ciphertextB64, nonceB64, tagB64, keyB64) {
    try {
        const key = Buffer.from(keyB64, 'base64');
        const ciphertext = Buffer.from(ciphertextB64, 'base64');
        const nonce = Buffer.from(nonceB64, 'base64');
        const tag = Buffer.from(tagB64, 'base64');
        
        const decipher = crypto.createDecipher('aes-256-gcm', key);
        decipher.setAuthTag(tag);
        decipher.setAAD(Buffer.from('QuMail-v1.0'));
        
        let plaintext = decipher.update(ciphertext, null, 'utf8');
        plaintext += decipher.final('utf8');
        
        return plaintext;
    } catch (error) {
        throw new Error(`Decryption failed: ${error.message}`);
    }
}

// API Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'QuMail QKD Key Manager',
        version: '1.0.0',
        port: PORT,
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

// Get key
app.get('/get_key/:keyId', async (req, res) => {
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

// List keys
app.get('/keys', async (req, res) => {
    try {
        const keys = keyManager.getAllKeys();
        
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

// Login endpoint (simulated)
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
        const createdAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        keyDatabase.sessions.push({
            session_id: sessionId,
            email,
            password: app_password,
            created_at: createdAt,
            expires_at: expiresAt
        });
        
        await saveDatabase();
        
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

// Send email endpoint (simulated)
app.post('/send_email', async (req, res) => {
    try {
        const { to, subject, body, session_id } = req.body;
        
        if (!to || !subject || !body || !session_id) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields'
            });
        }
        
        // Find session
        const session = keyDatabase.sessions.find(s => s.session_id === session_id);
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
        
        // Generate QKD key for this email
        const qkdKey = keyManager.requestKey(session.email, to, 3600);
        console.log(`🔑 QKD key generated: ${qkdKey.key_id}`);
        
        // Simulate encryption
        const encrypted = encryptMessage(body, qkdKey.key_b64);
        
        const encryptedPayload = {
            version: '1.0',
            algorithm: 'AES-256-GCM',
            key_id: qkdKey.key_id,
            ciphertext: encrypted.ciphertext,
            nonce: encrypted.nonce,
            tag: encrypted.tag,
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

// Decrypt message endpoint
app.post('/decrypt_message', async (req, res) => {
    try {
        const { key_id, ciphertext, nonce, tag } = req.body;
        
        if (!key_id || !ciphertext || !nonce || !tag) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required decryption parameters'
            });
        }
        
        // Get key
        const keyData = keyManager.getKey(key_id);
        if (!keyData) {
            return res.status(404).json({
                status: 'error',
                message: 'Decryption key not found'
            });
        }
        
        if (keyData.status === 'expired') {
            return res.status(410).json({
                status: 'error',
                message: 'Decryption key has expired'
            });
        }
        
        // Decrypt message
        const plaintext = decryptMessage(ciphertext, nonce, tag, keyData.key_b64);
        
        res.json({
            status: 'success',
            plaintext,
            key_id
        });
        
    } catch (error) {
        console.error('❌ Error decrypting message:', error);
        res.status(500).json({
            status: 'error',
            message: `Decryption failed: ${error.message}`
        });
    }
});

// Statistics endpoint
app.get('/stats', async (req, res) => {
    try {
        const totalKeys = keyDatabase.keys.length;
        const activeKeys = keyDatabase.keys.filter(k => k.status === 'active').length;
        const expiredKeys = keyDatabase.keys.filter(k => k.status === 'expired').length;
        const totalSessions = keyDatabase.sessions.length;
        
        res.json({
            status: 'success',
            stats: {
                total_keys: totalKeys,
                active_keys: activeKeys,
                expired_keys: expiredKeys,
                total_sessions: totalSessions,
                uptime: process.uptime()
            }
        });
        
    } catch (error) {
        console.error('❌ Error getting stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// Initialize and start server
async function startServer() {
    try {
        await loadDatabase();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log('🔐 QuMail QKD Key Manager starting...');
            console.log(`🚀 Running on http://localhost:${PORT}`);
            console.log('📡 Ready to issue quantum-secure keys');
            console.log(`🌐 CORS enabled for frontend connections`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();