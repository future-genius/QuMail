#!/usr/bin/env python3
"""
QuMail Backend - Flask Server with QKD Key Manager
Implements ETSI GS QKD-014 compatible REST API for quantum key distribution
"""

import os
import json
import sqlite3
import secrets
import base64
import hashlib
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins=['http://localhost:5173', 'http://localhost:3000'])

# Database configuration
DATABASE = 'qkd_keys.db'

def get_db():
    """Get database connection"""
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    """Close database connection"""
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    """Initialize database tables"""
    with app.app_context():
        db = get_db()
        db.executescript('''
            CREATE TABLE IF NOT EXISTS qkd_keys (
                key_id TEXT PRIMARY KEY,
                key_block_b64 TEXT NOT NULL,
                sender TEXT NOT NULL,
                recipient TEXT NOT NULL,
                key_length_bits INTEGER NOT NULL,
                usage TEXT NOT NULL,
                status TEXT DEFAULT 'available',
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                consumed_at TEXT NULL
            );
            
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                public_key TEXT,
                private_key_encrypted TEXT,
                created_at TEXT NOT NULL,
                last_login TEXT
            );
            
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                email TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            );
            
            CREATE TABLE IF NOT EXISTS emails (
                email_id TEXT PRIMARY KEY,
                from_email TEXT NOT NULL,
                to_email TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                encrypted_body TEXT NOT NULL,
                key_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                status TEXT DEFAULT 'sent'
            );
            
            CREATE TABLE IF NOT EXISTS usage_log (
                log_id TEXT PRIMARY KEY,
                key_id TEXT NOT NULL,
                action TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                details TEXT
            );
        ''')
        db.commit()
        logger.info("Database initialized successfully")

class QKDKeyManager:
    """QKD Key Manager implementing ETSI GS QKD-014 compatible API"""
    
    def generate_key_id(self):
        """Generate unique key ID"""
        return f"qkd_{secrets.token_hex(16)}"
    
    def generate_quantum_key(self, length_bits):
        """Generate cryptographically secure quantum key"""
        length_bytes = (length_bits + 7) // 8  # Round up to nearest byte
        return secrets.token_bytes(length_bytes)
    
    def request_key(self, sender, recipient, key_length_bits=2048, usage="message_aes", lifetime_hours=1):
        """Request new quantum key block"""
        try:
            key_id = self.generate_key_id()
            key_block = self.generate_quantum_key(key_length_bits)
            key_block_b64 = base64.b64encode(key_block).decode('utf-8')
            
            created_at = datetime.utcnow().isoformat() + 'Z'
            expires_at = (datetime.utcnow() + timedelta(hours=lifetime_hours)).isoformat() + 'Z'
            
            db = get_db()
            db.execute('''
                INSERT INTO qkd_keys 
                (key_id, key_block_b64, sender, recipient, key_length_bits, usage, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (key_id, key_block_b64, sender, recipient, key_length_bits, usage, created_at, expires_at))
            
            # Log key generation
            db.execute('''
                INSERT INTO usage_log (log_id, key_id, action, timestamp, details)
                VALUES (?, ?, ?, ?, ?)
            ''', (secrets.token_hex(8), key_id, 'KEY_GENERATED', created_at, 
                  f'Generated for {sender} -> {recipient}, {key_length_bits} bits'))
            
            db.commit()
            
            logger.info(f"Generated key {key_id} for {sender} -> {recipient}")
            
            return {
                'key_id': key_id,
                'status': 'available',
                'key_block_b64': key_block_b64,
                'sender': sender,
                'recipient': recipient,
                'created_at': created_at,
                'expires_at': expires_at,
                'key_length_bits': key_length_bits,
                'usage': usage
            }
            
        except Exception as e:
            logger.error(f"Key generation failed: {e}")
            raise
    
    def get_key(self, key_id):
        """Retrieve key by ID"""
        try:
            db = get_db()
            key_data = db.execute('''
                SELECT * FROM qkd_keys WHERE key_id = ?
            ''', (key_id,)).fetchone()
            
            if not key_data:
                return None
            
            # Check expiration
            expires_at = datetime.fromisoformat(key_data['expires_at'].replace('Z', '+00:00'))
            if datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
                # Mark as expired
                db.execute('''
                    UPDATE qkd_keys SET status = 'expired' WHERE key_id = ?
                ''', (key_id,))
                db.commit()
                
                return {
                    'key_id': key_data['key_id'],
                    'status': 'expired',
                    'created_at': key_data['created_at'],
                    'expires_at': key_data['expires_at']
                }
            
            # Log access
            db.execute('''
                INSERT INTO usage_log (log_id, key_id, action, timestamp, details)
                VALUES (?, ?, ?, ?, ?)
            ''', (secrets.token_hex(8), key_id, 'KEY_ACCESSED', 
                  datetime.utcnow().isoformat() + 'Z', 'Key retrieved'))
            db.commit()
            
            return dict(key_data)
            
        except Exception as e:
            logger.error(f"Key retrieval failed: {e}")
            raise
    
    def consume_key(self, key_id):
        """Mark key as consumed (for OTP usage)"""
        try:
            db = get_db()
            consumed_at = datetime.utcnow().isoformat() + 'Z'
            
            db.execute('''
                UPDATE qkd_keys SET status = 'consumed', consumed_at = ? WHERE key_id = ?
            ''', (consumed_at, key_id))
            
            db.execute('''
                INSERT INTO usage_log (log_id, key_id, action, timestamp, details)
                VALUES (?, ?, ?, ?, ?)
            ''', (secrets.token_hex(8), key_id, 'KEY_CONSUMED', consumed_at, 'Key marked as consumed'))
            
            db.commit()
            logger.info(f"Key {key_id} marked as consumed")
            
        except Exception as e:
            logger.error(f"Key consumption failed: {e}")
            raise

# Initialize key manager
key_manager = QKDKeyManager()

# Encryption utilities
def encrypt_message(plaintext, key_b64):
    """Encrypt message using AES-256-GCM"""
    try:
        key = base64.b64decode(key_b64)[:32]  # Use first 32 bytes for AES-256
        aesgcm = AESGCM(key)
        nonce = secrets.token_bytes(12)
        
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), b'QuMail-v1.0')
        
        return {
            'ciphertext': base64.b64encode(ciphertext).decode('utf-8'),
            'nonce': base64.b64encode(nonce).decode('utf-8'),
            'algorithm': 'AES-256-GCM'
        }
    except Exception as e:
        logger.error(f"Encryption failed: {e}")
        raise

def decrypt_message(ciphertext_b64, nonce_b64, key_b64):
    """Decrypt message using AES-256-GCM"""
    try:
        key = base64.b64decode(key_b64)[:32]
        ciphertext = base64.b64decode(ciphertext_b64)
        nonce = base64.b64decode(nonce_b64)
        
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, b'QuMail-v1.0')
        
        return plaintext.decode('utf-8')
    except Exception as e:
        logger.error(f"Decryption failed: {e}")
        raise

# API Routes

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'QuMail QKD Backend',
        'version': '1.0.0',
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    })

# ETSI GS QKD-014 compatible endpoints
@app.route('/api/v1/keys/request', methods=['POST'])
def request_key():
    """Request new quantum key block (ETSI GS QKD-014 compatible)"""
    try:
        data = request.get_json()
        
        requester_id = data.get('requester_id')
        key_length_bits = data.get('key_length_bits', 2048)
        usage = data.get('usage', 'message_otp')
        
        if not requester_id:
            return jsonify({'error': 'requester_id is required'}), 400
        
        key_data = key_manager.request_key(requester_id, key_length_bits, usage)
        
        return jsonify(key_data), 200
        
    except Exception as e:
        logger.error(f"Key request failed: {e}")
        return jsonify({'error': 'Key request failed'}), 500

@app.route('/api/v1/keys/<key_id>', methods=['GET'])
def get_key(key_id):
    """Get key by ID (ETSI GS QKD-014 compatible)"""
    try:
        key_data = key_manager.get_key(key_id)
        
        if not key_data:
            return jsonify({'error': 'Key not found'}), 404
        
        return jsonify(key_data), 200
        
    except Exception as e:
        logger.error(f"Key retrieval failed: {e}")
        return jsonify({'error': 'Key retrieval failed'}), 500

@app.route('/api/v1/keys/<key_id>/consume', methods=['POST'])
def consume_key(key_id):
    """Mark key as consumed"""
    try:
        key_manager.consume_key(key_id)
        return jsonify({'status': 'consumed'}), 200
        
    except Exception as e:
        logger.error(f"Key consumption failed: {e}")
        return jsonify({'error': 'Key consumption failed'}), 500

# QuMail application endpoints
@app.route('/api/login', methods=['POST'])
def login():
    """User login"""
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'success': False, 'message': 'Email and password required'}), 400
        
        # Simple validation for demo
        if '@' not in email:
            return jsonify({'success': False, 'message': 'Invalid email format'}), 400
        
        # Create session
        session_id = secrets.token_hex(16)
        created_at = datetime.utcnow().isoformat() + 'Z'
        expires_at = (datetime.utcnow() + timedelta(hours=24)).isoformat() + 'Z'
        
        db = get_db()
        db.execute('''
            INSERT INTO sessions (session_id, email, created_at, expires_at)
            VALUES (?, ?, ?, ?)
        ''', (session_id, email, created_at, expires_at))
        db.commit()
        
        logger.info(f"User logged in: {email}")
        
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'session_id': session_id,
            'user': {'email': email}
        }), 200
        
    except Exception as e:
        logger.error(f"Login failed: {e}")
        return jsonify({'success': False, 'message': 'Login failed'}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    """User logout"""
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        
        if session_id:
            db = get_db()
            db.execute('DELETE FROM sessions WHERE session_id = ?', (session_id,))
            db.commit()
        
        return jsonify({'success': True, 'message': 'Logged out successfully'}), 200
        
    except Exception as e:
        logger.error(f"Logout failed: {e}")
        return jsonify({'success': False, 'message': 'Logout failed'}), 500

@app.route('/api/send-email', methods=['POST'])
def send_email():
    """Send encrypted email"""
    try:
        data = request.get_json()
        to_email = data.get('to')
        subject = data.get('subject')
        body = data.get('body')
        session_id = data.get('session_id')
        
        if not all([to_email, subject, body, session_id]):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400
        
        # Verify session
        db = get_db()
        session = db.execute('SELECT * FROM sessions WHERE session_id = ?', (session_id,)).fetchone()
        if not session:
            return jsonify({'success': False, 'message': 'Invalid session'}), 401
        
        # Request quantum key
        requester_id = f"qumail:user:{session['email']}"
        message_size_bits = len(body.encode('utf-8')) * 8 + 2048  # Add padding
        
        key_data = key_manager.request_key(requester_id, message_size_bits, 'message_aes')
        
        # Encrypt message
        encrypted = encrypt_message(body, key_data['key_block_b64'])
        
        # Store email
        email_id = secrets.token_hex(16)
        created_at = datetime.utcnow().isoformat() + 'Z'
        
        db.execute('''
            INSERT INTO emails 
            (email_id, from_email, to_email, subject, body, encrypted_body, key_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (email_id, session['email'], to_email, subject, body, 
              json.dumps(encrypted), key_data['key_id'], created_at))
        db.commit()
        
        logger.info(f"Email sent from {session['email']} to {to_email}")
        
        return jsonify({
            'success': True,
            'message': 'Email sent with quantum encryption',
            'email_id': email_id,
            'key_id': key_data['key_id']
        }), 200
        
    except Exception as e:
        logger.error(f"Send email failed: {e}")
        return jsonify({'success': False, 'message': 'Failed to send email'}), 500

@app.route('/api/emails', methods=['GET'])
def get_emails():
    """Get user emails"""
    try:
        session_id = request.args.get('session_id')
        
        if not session_id:
            return jsonify({'success': False, 'message': 'Session required'}), 401
        
        db = get_db()
        session = db.execute('SELECT * FROM sessions WHERE session_id = ?', (session_id,)).fetchone()
        if not session:
            return jsonify({'success': False, 'message': 'Invalid session'}), 401
        
        # Get emails for this user
        emails = db.execute('''
            SELECT email_id as id, from_email as "from", to_email as "to", 
                   subject, body, key_id, created_at, status
            FROM emails 
            WHERE from_email = ? OR to_email = ?
            ORDER BY created_at DESC
            LIMIT 50
        ''', (session['email'], session['email'])).fetchall()
        
        email_list = [dict(email) for email in emails]
        
        return jsonify({
            'success': True,
            'emails': email_list
        }), 200
        
    except Exception as e:
        logger.error(f"Get emails failed: {e}")
        return jsonify({'success': False, 'message': 'Failed to get emails'}), 500

@app.route('/api/decrypt-email', methods=['POST'])
def decrypt_email():
    """Decrypt email"""
    try:
        data = request.get_json()
        email_id = data.get('email_id')
        session_id = data.get('session_id')
        
        if not email_id or not session_id:
            return jsonify({'success': False, 'message': 'Email ID and session required'}), 400
        
        db = get_db()
        session = db.execute('SELECT * FROM sessions WHERE session_id = ?', (session_id,)).fetchone()
        if not session:
            return jsonify({'success': False, 'message': 'Invalid session'}), 401
        
        # Get email
        email = db.execute('''
            SELECT * FROM emails WHERE email_id = ? 
            AND (from_email = ? OR to_email = ?)
        ''', (email_id, session['email'], session['email'])).fetchone()
        
        if not email:
            return jsonify({'success': False, 'message': 'Email not found'}), 404
        
        # Get decryption key
        key_data = key_manager.get_key(email['key_id'])
        if not key_data:
            return jsonify({'success': False, 'message': 'Decryption key not found'}), 404
        
        if key_data['status'] == 'expired':
            return jsonify({'success': False, 'message': 'Decryption key expired'}), 410
        
        # Decrypt message
        encrypted_data = json.loads(email['encrypted_body'])
        decrypted_body = decrypt_message(
            encrypted_data['ciphertext'],
            encrypted_data['nonce'],
            key_data['key_block_b64']
        )
        
        return jsonify({
            'success': True,
            'decrypted_body': decrypted_body
        }), 200
        
    except Exception as e:
        logger.error(f"Decrypt email failed: {e}")
        return jsonify({'success': False, 'message': 'Failed to decrypt email'}), 500

@app.route('/api/keys', methods=['GET'])
def get_user_keys():
    """Get user's quantum keys"""
    try:
        session_id = request.args.get('session_id')
        
        if not session_id:
            return jsonify({'success': False, 'message': 'Session required'}), 401
        
        db = get_db()
        session = db.execute('SELECT * FROM sessions WHERE session_id = ?', (session_id,)).fetchone()
        if not session:
            return jsonify({'success': False, 'message': 'Invalid session'}), 401
        
        # Get keys for this user
        keys = db.execute('''
            SELECT key_id, sender, recipient,
                   created_at, expires_at, status, usage as algorithm
            FROM qkd_keys 
            WHERE sender = ? OR recipient = ?
            ORDER BY created_at DESC
            LIMIT 50
        ''', (session['email'], session['email'])).fetchall()
        
        key_list = [dict(key) for key in keys]
        
        return jsonify({
            'success': True,
            'keys': key_list
        }), 200
        
    except Exception as e:
        logger.error(f"Get keys failed: {e}")
        return jsonify({'success': False, 'message': 'Failed to get keys'}), 500

if __name__ == '__main__':
    # Initialize database
    init_db()
    
    # Add root route for status check
    @app.route('/', methods=['GET'])
    def root():
        """Root endpoint - shows backend status"""
        return '''
        <!DOCTYPE html>
        <html>
        <head>
            <title>QuMail Backend</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
                    color: white;
                    margin: 0;
                    padding: 40px;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .container {
                    text-align: center;
                    background: rgba(255,255,255,0.1);
                    padding: 40px;
                    border-radius: 16px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.2);
                    max-width: 600px;
                }
                .status { color: #10b981; font-size: 24px; margin: 20px 0; }
                .endpoint { 
                    background: rgba(0,0,0,0.3); 
                    padding: 8px 12px; 
                    border-radius: 6px; 
                    font-family: monospace; 
                    margin: 5px 0;
                    display: inline-block;
                }
                .section { margin: 30px 0; }
                h1 { margin: 0 0 10px 0; }
                h2 { color: #60a5fa; margin: 20px 0 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔐 QuMail Backend Server</h1>
                <div class="status">✅ Running on port 5001</div>
                
                <div class="section">
                    <h2>🚀 Status</h2>
                    <p>Quantum-secure email backend is operational</p>
                    <p>ETSI GS QKD-014 compatible API ready</p>
                </div>
                
                <div class="section">
                    <h2>📡 Available Endpoints</h2>
                    <div class="endpoint">GET /health</div>
                    <div class="endpoint">POST /api/login</div>
                    <div class="endpoint">POST /api/send-email</div>
                    <div class="endpoint">GET /api/emails</div>
                    <div class="endpoint">POST /api/decrypt-email</div>
                    <div class="endpoint">GET /api/keys</div>
                    <div class="endpoint">POST /api/v1/keys/request</div>
                    <div class="endpoint">GET /api/v1/keys/{key_id}</div>
                </div>
                
                <div class="section">
                    <h2>🔗 Quick Links</h2>
                    <p><a href="/health" style="color: #60a5fa;">Health Check</a></p>
                    <p><a href="http://localhost:5173" style="color: #60a5fa;">Frontend (if running)</a></p>
                </div>
                
                <div class="section">
                    <p style="color: #94a3b8; font-size: 14px;">
                        QuMail v1.0.0 | Quantum-Secure Email Communication
                    </p>
                </div>
            </div>
        </body>
        </html>
        '''
    
    print("🔐 QuMail QKD Backend Server")
    print("🚀 Starting on http://localhost:5001")
    print("📡 ETSI GS QKD-014 compatible API ready")
    print("🌐 CORS enabled for frontend connections")
    
    # Run Flask development server
    app.run(host='127.0.0.1', port=5001, debug=True)