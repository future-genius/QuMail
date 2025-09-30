#!/usr/bin/env python3
"""
QuMail Backend - Flask Server with QKD Key Manager
"""

import os
import json
import sqlite3
import secrets
import base64
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins=['http://localhost:5173', 'http://localhost:3000'], 
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization'])

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
                key_b64 TEXT NOT NULL,
                sender TEXT NOT NULL,
                recipient TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                algorithm TEXT DEFAULT 'AES-256-GCM'
            );
            
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
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
        logger.info("✅ Database initialized successfully")

class QKDKeyManager:
    """QKD Key Manager"""
    
    def generate_key_id(self):
        """Generate unique key ID"""
        return f"qkd_{secrets.token_hex(16)}"
    
    def generate_quantum_key(self, length_bytes=32):
        """Generate cryptographically secure quantum key"""
        return secrets.token_bytes(length_bytes)
    
    def request_key(self, sender, recipient, lifetime_hours=24):
        """Request new quantum key"""
        try:
            key_id = self.generate_key_id()
            key_bytes = self.generate_quantum_key(32)
            key_b64 = base64.b64encode(key_bytes).decode('utf-8')
            
            created_at = datetime.utcnow().isoformat() + 'Z'
            expires_at = (datetime.utcnow() + timedelta(hours=lifetime_hours)).isoformat() + 'Z'
            
            db = get_db()
            db.execute('''
                INSERT INTO qkd_keys 
                (key_id, key_b64, sender, recipient, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (key_id, key_b64, sender, recipient, created_at, expires_at))
            
            # Log key generation
            db.execute('''
                INSERT INTO usage_log (log_id, key_id, action, timestamp, details)
                VALUES (?, ?, ?, ?, ?)
            ''', (secrets.token_hex(8), key_id, 'KEY_GENERATED', created_at, 
                  f'Generated for {sender} -> {recipient}'))
            
            db.commit()
            
            logger.info(f"🔑 Generated quantum key {key_id} for {sender} -> {recipient}")
            
            return {
                'key_id': key_id,
                'key_b64': key_b64,
                'sender': sender,
                'recipient': recipient,
                'created_at': created_at,
                'expires_at': expires_at,
                'status': 'active',
                'algorithm': 'AES-256-GCM'
            }
            
        except Exception as e:
            logger.error(f"❌ Key generation failed: {e}")
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
                
                key_dict = dict(key_data)
                key_dict['status'] = 'expired'
                return key_dict
            
            # Log access
            db.execute('''
                INSERT INTO usage_log (log_id, key_id, action, timestamp, details)
                VALUES (?, ?, ?, ?, ?)
            ''', (secrets.token_hex(8), key_id, 'KEY_ACCESSED', 
                  datetime.utcnow().isoformat() + 'Z', 'Key retrieved'))
            db.commit()
            
            return dict(key_data)
            
        except Exception as e:
            logger.error(f"❌ Key retrieval failed: {e}")
            raise

# Initialize key manager
key_manager = QKDKeyManager()

# Encryption utilities
def encrypt_message(plaintext, key_b64):
    """Encrypt message using AES-256-GCM"""
    try:
        key = base64.b64decode(key_b64)[:32]
        aesgcm = AESGCM(key)
        nonce = secrets.token_bytes(12)
        
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), b'QuMail-v1.0')
        
        return {
            'ciphertext': base64.b64encode(ciphertext).decode('utf-8'),
            'nonce': base64.b64encode(nonce).decode('utf-8'),
            'algorithm': 'AES-256-GCM'
        }
    except Exception as e:
        logger.error(f"❌ Encryption failed: {e}")
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
        logger.error(f"❌ Decryption failed: {e}")
        raise

# API Routes

@app.route('/api/health', methods=['GET', 'OPTIONS'])
def health_check():
    """Health check endpoint"""
    if request.method == 'OPTIONS':
        return '', 200
    
    return jsonify({
        'status': 'healthy',
        'service': 'QuMail Backend',
        'version': '1.0.0',
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    })

@app.route('/api/login', methods=['POST', 'OPTIONS'])
def login():
    """User login"""
    if request.method == 'OPTIONS':
        return '', 200
    
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
        
        logger.info(f"✅ User logged in: {email}")
        
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'session_id': session_id,
            'user': {'email': email}
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Login failed: {e}")
        return jsonify({'success': False, 'message': 'Login failed'}), 500

@app.route('/api/logout', methods=['POST', 'OPTIONS'])
def logout():
    """User logout"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        
        if session_id:
            db = get_db()
            db.execute('DELETE FROM sessions WHERE session_id = ?', (session_id,))
            db.commit()
        
        return jsonify({'success': True, 'message': 'Logged out successfully'}), 200
        
    except Exception as e:
        logger.error(f"❌ Logout failed: {e}")
        return jsonify({'success': False, 'message': 'Logout failed'}), 500

@app.route('/api/request-qkd-key', methods=['POST', 'OPTIONS'])
def request_qkd_key():
    """Request QKD key for email encryption"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        sender = data.get('sender')
        recipient = data.get('recipient')
        session_id = data.get('session_id')
        
        if not sender or not recipient or not session_id:
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400
        
        # Verify session
        db = get_db()
        session = db.execute('SELECT * FROM sessions WHERE session_id = ?', (session_id,)).fetchone()
        if not session:
            return jsonify({'success': False, 'message': 'Invalid session'}), 401
        
        # Generate quantum key
        key_data = key_manager.request_key(sender, recipient, 24)
        
        logger.info(f"🔑 QKD key generated: {key_data['key_id']} for {sender} -> {recipient}")
        
        return jsonify({
            'success': True,
            'key_id': key_data['key_id'],
            'key_b64': key_data['key_b64'],
            'expires_at': key_data['expires_at'],
            'message': 'QKD key generated successfully'
        }), 200
        
    except Exception as e:
        logger.error(f"❌ QKD key request failed: {e}")
        return jsonify({'success': False, 'message': 'QKD key request failed'}), 500

@app.route('/api/send-email', methods=['POST', 'OPTIONS'])
def send_email():
    """Send encrypted email"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        to_email = data.get('to')
        subject = data.get('subject')
        body = data.get('body')
        session_id = data.get('session_id')
        key_id = data.get('key_id')
        
        if not all([to_email, subject, body, session_id]):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400
        
        # Verify session
        db = get_db()
        session = db.execute('SELECT * FROM sessions WHERE session_id = ?', (session_id,)).fetchone()
        if not session:
            return jsonify({'success': False, 'message': 'Invalid session'}), 401
        
        # Get or generate key
        if key_id:
            key_data = key_manager.get_key(key_id)
            if not key_data:
                return jsonify({'success': False, 'message': 'Invalid key ID'}), 400
        else:
            key_data = key_manager.request_key(session['email'], to_email, 24)
        
        # Encrypt message
        encrypted = encrypt_message(body, key_data['key_b64'])
        
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
        
        logger.info(f"📧 Email sent from {session['email']} to {to_email}")
        
        return jsonify({
            'success': True,
            'message': 'Email sent with quantum encryption',
            'email_id': email_id,
            'key_id': key_data['key_id']
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Send email failed: {e}")
        return jsonify({'success': False, 'message': 'Failed to send email'}), 500

@app.route('/api/emails', methods=['GET', 'OPTIONS'])
def get_emails():
    """Get user emails"""
    if request.method == 'OPTIONS':
        return '', 200
    
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
        logger.error(f"❌ Get emails failed: {e}")
        return jsonify({'success': False, 'message': 'Failed to get emails'}), 500

@app.route('/api/decrypt-email', methods=['POST', 'OPTIONS'])
def decrypt_email():
    """Decrypt email"""
    if request.method == 'OPTIONS':
        return '', 200
    
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
            key_data['key_b64']
        )
        
        return jsonify({
            'success': True,
            'decrypted_body': decrypted_body
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Decrypt email failed: {e}")
        return jsonify({'success': False, 'message': 'Failed to decrypt email'}), 500

@app.route('/api/keys', methods=['GET', 'OPTIONS'])
def get_user_keys():
    """Get user's quantum keys"""
    if request.method == 'OPTIONS':
        return '', 200
    
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
                   created_at, expires_at, status, algorithm
            FROM qkd_keys 
            WHERE sender = ? OR recipient = ?
            ORDER BY created_at DESC
            LIMIT 50
        ''', (session['email'], session['email'])).fetchall()
        
        # Update expired keys
        current_time = datetime.utcnow()
        for key in keys:
            if key['status'] == 'active':
                expires_at = datetime.fromisoformat(key['expires_at'].replace('Z', '+00:00'))
                if current_time.replace(tzinfo=expires_at.tzinfo) > expires_at:
                    db.execute('UPDATE qkd_keys SET status = ? WHERE key_id = ?', ('expired', key['key_id']))
        
        db.commit()
        
        # Refresh the query
        keys = db.execute('''
            SELECT key_id, sender, recipient,
                   created_at, expires_at, status, algorithm
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
        logger.error(f"❌ Get keys failed: {e}")
        return jsonify({'success': False, 'message': 'Failed to get keys'}), 500

@app.route('/', methods=['GET'])
def root():
    """Root endpoint"""
    return jsonify({
        'service': 'QuMail Backend',
        'status': 'running',
        'version': '1.0.0',
        'endpoints': [
            'GET /health',
            'POST /api/login',
            'POST /api/logout', 
            'POST /api/request-qkd-key',
            'POST /api/send-email',
            'GET /api/emails',
            'POST /api/decrypt-email',
            'GET /api/keys'
        ]
    })

if __name__ == '__main__':
    # Initialize database
    init_db()
    
    print("🔐 QuMail Backend Server")
    print("🚀 Starting on http://localhost:5001")
    print("📡 All endpoints ready")
    print("🌐 CORS enabled")
    
    app.run(host='0.0.0.0', port=5001, debug=True)