import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5001;

// Database file path
const DB_FILE = path.join(__dirname, 'qkd_keys.json');

// In-memory database structure
let database = {
    keys: [],
    sessions: [],
    emails: [],
    usage_log: []
};

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Database operations
async function loadDatabase() {
    try {
        const data = await fs.readFile(DB_FILE, 'utf8');
        database = { ...database, ...JSON.parse(data) };
        console.log('📊 Database loaded successfully');
    } catch (error) {
        console.log('📊 Creating new database...');
        await saveDatabase();
    }
}

async function saveDatabase() {
    try {
        await fs.writeFile(DB_FILE, JSON.stringify(database, null, 2));
    } catch (error) {
        console.error('❌ Failed to save database:', error);
    }
}

// QKD Key Manager
class QKDKeyManager {
    generateKeyId() {
        return 'qkd_' + crypto.randomBytes(16).toString('hex');
    }

    generateQuantumKey(length = 32) {
        return crypto.randomBytes(length);
    }

    requestKey(sender, recipient, lifetime = 3600) {
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
            algorithm: 'AES-256-GCM'
        };
        
        database.keys.push(keyData);
        
        database.usage_log.push({
            id: crypto.randomUUID(),
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
        const keyData = database.keys.find(k => k.key_id === keyId);
        if (!keyData) return null;
        
        // Check expiration
        const expiresAt = new Date(keyData.expires_at);
        if (new Date() > expiresAt) {
            keyData.status = 'expired';
            const keyIndex = database.keys.findIndex(k => k.key_id === keyId);
            if (keyIndex !== -1) {
                database.keys[keyIndex] = keyData;
                saveDatabase();
            }
        }
        
        // Log access
        database.usage_log.push({
            id: crypto.randomUUID(),
            key_id: keyId,
            action: 'KEY_ACCESSED',
            timestamp: new Date().toISOString(),
            details: 'Key retrieved for decryption'
        });
        
        saveDatabase();
        return keyData;
    }

    getAllKeys() {
        return database.keys.slice(-50);
    }
}

// Encryption utilities
function encryptMessage(plaintext, keyB64) {
    try {
        const key = Buffer.from(keyB64, 'base64');
        const nonce = crypto.randomBytes(12);
        const cipher = crypto.createCipherGCM('aes-256-gcm', key);
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
        
        const decipher = crypto.createDecipherGCM('aes-256-gcm', key);
        decipher.setAuthTag(tag);
        decipher.setAAD(Buffer.from('QuMail-v1.0'));
        
        let plaintext = decipher.update(ciphertext, null, 'utf8');
        plaintext += decipher.final('utf8');
        
        return plaintext;
    } catch (error) {
        throw new Error(`Decryption failed: ${error.message}`);
    }
}

const keyManager = new QKDKeyManager();

// API Routes

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'QuMail Backend',
        version: '1.0.0',
        console.log('📡 Available endpoints:');
        console.log('  POST /api/login');
        console.log('  POST /api/logout');
        console.log('  POST /api/request-qkd-key');
        console.log('  GET  /api/get-qkd-key/:key_id');
        console.log('  POST /api/send-email');
        console.log('  GET  /api/emails');
        console.log('  POST /api/decrypt-email');
        console.log('  GET  /api/keys');
        console.log('  GET  /api/stats');
        console.log('  GET  /health');
        port: PORT,
        timestamp: new Date().toISOString()
    });
});

// Authentication
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }
        
        // Simple validation
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }
        
        // Create session
        const sessionId = crypto.randomUUID();
        const session = {
            id: sessionId,
            email,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
        
        database.sessions.push(session);
        await saveDatabase();
        
        console.log(`✅ User logged in: ${email}`);
        
        res.json({
            success: true,
            message: 'Login successful',
            session_id: sessionId,
            user: { email }
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
});

// Logout
app.post('/api/logout', async (req, res) => {
    try {
        const { session_id } = req.body;
        
        if (session_id) {
            database.sessions = database.sessions.filter(s => s.id !== session_id);
            await saveDatabase();
        }
        
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
        
    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed'
        });
    }
});

// Send email
app.post('/api/send-email', async (req, res) => {
    try {
        const { to, subject, body, session_id } = req.body;
        
        if (!to || !subject || !body || !session_id) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }
        
        // Verify session
        const session = database.sessions.find(s => s.id === session_id);
        if (!session) {
            return res.status(401).json({
                success: false,
                message: 'Invalid session'
            });
        }
        
        // Generate QKD key
        const qkdKey = keyManager.requestKey(session.email, to, 24 * 3600); // 24 hours
        
        // Encrypt message
        const encrypted = encryptMessage(body, qkdKey.key_b64);
        
        // Create email record
        const email = {
            id: crypto.randomUUID(),
            from: session.email,
            to,
            subject,
            body: body,
            encrypted_body: encrypted,
            key_id: qkdKey.key_id,
            created_at: new Date().toISOString(),
            status: 'sent'
        };
        
        database.emails.push(email);
        await saveDatabase();
        
        console.log(`📧 Email sent from ${session.email} to ${to}`);
        
        res.json({
            success: true,
            message: 'Email sent successfully',
            email_id: email.id,
            key_id: qkdKey.key_id
        });
        
    } catch (error) {
        console.error('❌ Send email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send email'
        });
    }
});

// Get emails (inbox)
app.get('/api/emails', async (req, res) => {
    try {
        const { session_id } = req.query;
        
        if (!session_id) {
            return res.status(401).json({
                success: false,
                message: 'Session required'
            });
        }
        
        const session = database.sessions.find(s => s.id === session_id);
        if (!session) {
            return res.status(401).json({
                success: false,
                message: 'Invalid session'
            });
        }
        
        // Get emails for this user (sent or received)
        const userEmails = database.emails
            .filter(email => email.from === session.email || email.to === session.email)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 50);
        
        res.json({
            success: true,
            emails: userEmails
        });
        
    } catch (error) {
        console.error('❌ Get emails error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get emails'
        });
    }
});

// Decrypt email
app.post('/api/decrypt-email', async (req, res) => {
    try {
        const { email_id, session_id } = req.body;
        
        if (!email_id || !session_id) {
            return res.status(400).json({
                success: false,
                message: 'Email ID and session required'
            });
        }
        
        const session = database.sessions.find(s => s.id === session_id);
        if (!session) {
            return res.status(401).json({
                success: false,
                message: 'Invalid session'
            });
        }
        
        const email = database.emails.find(e => e.id === email_id);
        if (!email) {
            return res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }
        
        // Check if user has access to this email
        if (email.from !== session.email && email.to !== session.email) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        // Get decryption key
        const keyData = keyManager.getKey(email.key_id);
        if (!keyData) {
            return res.status(404).json({
                success: false,
                message: 'Decryption key not found'
            });
        }
        
        if (keyData.status === 'expired') {
            return res.status(410).json({
                success: false,
                message: 'Decryption key has expired'
            });
        }
        
        // Decrypt message
        const decryptedBody = decryptMessage(
            email.encrypted_body.ciphertext,
            email.encrypted_body.nonce,
            email.encrypted_body.tag,
            keyData.key_b64
        );
        
        res.json({
            success: true,
            decrypted_body: decryptedBody
        });
        
    } catch (error) {
        console.error('❌ Decrypt email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to decrypt email'
        });
    }
});

// Get QKD keys
app.get('/api/keys', async (req, res) => {
    try {
        const { session_id } = req.query;
        
        if (!session_id) {
            return res.status(401).json({
                success: false,
                message: 'Session required'
            });
        }
        
        const session = database.sessions.find(s => s.id === session_id);
        if (!session) {
            return res.status(401).json({
                success: false,
                message: 'Invalid session'
            });
        }
        
        // Get keys for this user
        const userKeys = database.keys
            .filter(key => key.sender === session.email || key.recipient === session.email)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        res.json({
            success: true,
            keys: userKeys
        });
        
    } catch (error) {
        console.error('❌ Get keys error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get keys'
        });
    }
});

// Request QKD key endpoint
app.post('/api/request-qkd-key', async (req, res) => {
    try {
        const { sender, recipient, session_id } = req.body;
        
        if (!sender || !recipient || !session_id) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: sender, recipient, session_id'
            });
        }
        
        // Verify session
        const session = database.sessions.find(s => s.id === session_id);
        if (!session) {
            return res.status(401).json({
                success: false,
                message: 'Invalid session'
            });
        }
        
        // Generate QKD key
        const qkdKey = keyManager.requestKey(sender, recipient, 3600);
        
        console.log(`🔑 QKD key generated: ${qkdKey.key_id} for ${sender} -> ${recipient}`);
        
        res.json({
            success: true,
            key_id: qkdKey.key_id,
            key_b64: qkdKey.key_b64,
            expires_at: qkdKey.expires_at,
            message: 'QKD key generated successfully'
        });
        
    } catch (error) {
        console.error('❌ Request QKD key error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate QKD key'
        });
    }
});

// Get QKD key by ID endpoint
app.get('/api/get-qkd-key/:key_id', async (req, res) => {
    try {
        const { key_id } = req.params;
        
        if (!key_id) {
            return res.status(400).json({
                success: false,
                message: 'Key ID required'
            });
        }
        
        const keyData = keyManager.getKey(key_id);
        
        if (!keyData) {
            return res.status(404).json({
                success: false,
                message: 'Key not found'
            });
        }
        
        res.json({
            success: true,
            key_id: keyData.key_id,
            key_b64: keyData.key_b64,
            status: keyData.status,
            expires_at: keyData.expires_at
        });
        
    } catch (error) {
        console.error('❌ Get QKD key error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get QKD key'
        });
    }
});

// Statistics
app.get('/api/stats', async (req, res) => {
    try {
        const stats = {
            total_keys: database.keys.length,
            active_keys: database.keys.filter(k => k.status === 'active').length,
            expired_keys: database.keys.filter(k => k.status === 'expired').length,
            total_emails: database.emails.length,
            total_sessions: database.sessions.length,
            uptime: process.uptime()
        };
        
        res.json({
            success: true,
            stats
        });
        
    } catch (error) {
        console.error('❌ Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get stats'
        });
    }
});

// Initialize and start server
async function startServer() {
    try {
        await loadDatabase();
        
        app.listen(PORT, () => {
            console.log('🔐 QuMail Backend Server');
            console.log(`🚀 Running on http://localhost:${PORT}`);
            console.log('📡 Ready for quantum-secure communications');
            console.log('🌐 CORS enabled for frontend connections');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();