// QuMail QKD Key Manager - Quantum Key Distribution Service
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
app.use(cors());
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5173', 'https://qumail-quantum-secur-0rte.bolt.host'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Quantum Key Generation (Simulated)
function generateQuantumKey(length = 256) {
    // In a real implementation, this would interface with actual quantum hardware
    // For simulation, we use cryptographically secure random generation
    const key = crypto.randomBytes(length / 8).toString('hex');
    return key;
}

// BB84 Protocol Simulation
function simulateBB84Protocol(alice_id, bob_id) {
    const keyLength = 256; // bits
    const rawKey = generateQuantumKey(keyLength);
    
    // Simulate quantum channel noise and eavesdropping detection
    const errorRate = Math.random() * 0.05; // 0-5% error rate
    const isSecure = errorRate < 0.11; // QBER threshold
    
    return {
        rawKey,
        errorRate,
        isSecure,
        protocol: 'BB84',
        participants: [alice_id, bob_id]
    };
}

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

// API Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'QuMail QKD Key Manager',
        timestamp: new Date().toISOString()
    });
});

// Get service info
app.get('/api/info', (req, res) => {
    res.json({
        service: 'QuMail QKD Key Manager',
        version: '1.0.0',
        protocol: 'BB84',
        capabilities: ['key_generation', 'key_distribution', 'session_management'],
        status: 'operational'
    });
});

// Request quantum key pair
app.post('/api/keys/request', async (req, res) => {
    try {
        const { alice_id, bob_id, purpose = 'email_encryption' } = req.body;
        
        if (!alice_id || !bob_id) {
            return res.status(400).json({ 
                error: 'Both alice_id and bob_id are required' 
            });
        }

        // Simulate BB84 protocol
        const bb84Result = simulateBB84Protocol(alice_id, bob_id);
        
        if (!bb84Result.isSecure) {
            return res.status(400).json({
                error: 'Quantum channel compromised',
                errorRate: bb84Result.errorRate,
                message: 'Key exchange aborted due to high error rate'
            });
        }

        // Generate session ID
        const sessionId = crypto.randomUUID();
        
        // Create key pair
        const keyPair = {
            id: crypto.randomUUID(),
            sessionId,
            alice_id,
            bob_id,
            alice_key: bb84Result.rawKey,
            bob_key: bb84Result.rawKey, // Same key for symmetric encryption
            purpose,
            protocol: 'BB84',
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
            status: 'active',
            errorRate: bb84Result.errorRate,
            usage_count: 0
        };

        // Store in database
        keyDatabase.keys.push(keyPair);
        keyDatabase.sessions.push({
            sessionId,
            participants: [alice_id, bob_id],
            created_at: keyPair.created_at,
            status: 'active'
        });

        await saveDatabase();

        console.log(`🔑 New quantum key pair generated for ${alice_id} ↔ ${bob_id}`);
        
        res.json({
            success: true,
            sessionId,
            keyId: keyPair.id,
            alice_key: keyPair.alice_key,
            bob_key: keyPair.bob_key,
            expires_at: keyPair.expires_at,
            protocol: 'BB84',
            errorRate: bb84Result.errorRate
        });

    } catch (error) {
        console.error('❌ Key generation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get key by session ID
app.get('/api/keys/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { participant_id } = req.query;

        const keyPair = keyDatabase.keys.find(k => k.sessionId === sessionId);
        
        if (!keyPair) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Check if key has expired
        if (new Date() > new Date(keyPair.expires_at)) {
            return res.status(410).json({ error: 'Key has expired' });
        }

        // Verify participant
        if (participant_id && ![keyPair.alice_id, keyPair.bob_id].includes(participant_id)) {
            return res.status(403).json({ error: 'Unauthorized participant' });
        }

        // Increment usage count
        keyPair.usage_count++;
        await saveDatabase();

        // Return appropriate key based on participant
        const responseKey = participant_id === keyPair.alice_id ? 
            keyPair.alice_key : keyPair.bob_key;

        res.json({
            sessionId: keyPair.sessionId,
            key: responseKey,
            expires_at: keyPair.expires_at,
            usage_count: keyPair.usage_count,
            protocol: keyPair.protocol
        });

    } catch (error) {
        console.error('❌ Key retrieval error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// List active sessions for a participant
app.get('/api/sessions/:participantId', async (req, res) => {
    try {
        const { participantId } = req.params;
        
        const activeSessions = keyDatabase.keys
            .filter(k => 
                (k.alice_id === participantId || k.bob_id === participantId) &&
                k.status === 'active' &&
                new Date() < new Date(k.expires_at)
            )
            .map(k => ({
                sessionId: k.sessionId,
                partner: k.alice_id === participantId ? k.bob_id : k.alice_id,
                created_at: k.created_at,
                expires_at: k.expires_at,
                usage_count: k.usage_count,
                purpose: k.purpose
            }));

        res.json({
            participant: participantId,
            active_sessions: activeSessions,
            count: activeSessions.length
        });

    } catch (error) {
        console.error('❌ Session listing error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Revoke a key/session
app.delete('/api/keys/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { participant_id } = req.body;

        const keyIndex = keyDatabase.keys.findIndex(k => k.sessionId === sessionId);
        
        if (keyIndex === -1) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const keyPair = keyDatabase.keys[keyIndex];

        // Verify participant can revoke
        if (participant_id && ![keyPair.alice_id, keyPair.bob_id].includes(participant_id)) {
            return res.status(403).json({ error: 'Unauthorized to revoke this session' });
        }

        // Mark as revoked
        keyPair.status = 'revoked';
        keyPair.revoked_at = new Date().toISOString();

        await saveDatabase();

        console.log(`🔒 Key session ${sessionId} revoked`);

        res.json({
            success: true,
            message: 'Session revoked successfully',
            sessionId
        });

    } catch (error) {
        console.error('❌ Key revocation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get system statistics
app.get('/api/stats', (req, res) => {
    const now = new Date();
    const activeKeys = keyDatabase.keys.filter(k => 
        k.status === 'active' && new Date(k.expires_at) > now
    );
    
    const expiredKeys = keyDatabase.keys.filter(k => 
        new Date(k.expires_at) <= now
    );

    const revokedKeys = keyDatabase.keys.filter(k => 
        k.status === 'revoked'
    );

    res.json({
        total_keys: keyDatabase.keys.length,
        active_keys: activeKeys.length,
        expired_keys: expiredKeys.length,
        revoked_keys: revokedKeys.length,
        total_sessions: keyDatabase.sessions.length,
        uptime: process.uptime()
    });
});

// Initialize database and start server
async function startServer() {
    await loadDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ QuMail QKD Key Manager is running on http://localhost:${PORT}`);
        console.log(`🔑 Quantum Key Distribution Service Active`);
        console.log(`🌐 CORS enabled for frontend connections`);
    });
}

startServer().catch(console.error);