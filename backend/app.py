#!/usr/bin/env python3
"""
QuMail Backend - Quantum Key Distribution (QKD) Key Manager
Real working implementation for email encryption

This Flask application provides a QKD Key Manager API for 
quantum-secure email communications with real SMTP/IMAP integration.

Installation:
pip install flask flask-cors pycryptodome sqlite3 python-dotenv

Usage:
python backend/app.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import smtplib
import imaplib
import email
import socket
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
import sqlite3
import base64
import secrets
import datetime
import json
import os
from pathlib import Path
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend communication

# Configuration
DATABASE = 'backend/qkd_keys.db'
API_PORT = 5001

# Session storage (in production, use Redis or proper session management)
user_sessions = {}

def init_database():
    """Initialize SQLite database for QKD keys"""
    # Ensure backend directory exists
    os.makedirs('backend', exist_ok=True)
    
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS qkd_keys (
                key_id TEXT PRIMARY KEY,
                key_b64 TEXT NOT NULL,
                sender TEXT NOT NULL,
                recipient TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                algorithm TEXT DEFAULT 'AES-256-GCM',
                key_length INTEGER DEFAULT 256
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS key_usage_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_id TEXT NOT NULL,
                action TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                details TEXT,
                FOREIGN KEY (key_id) REFERENCES qkd_keys (key_id)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_sessions (
                session_id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                password TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
        ''')
        conn.commit()
        print("✅ Database initialized successfully")

class QKDKeyManager:
    """Quantum Key Distribution Key Manager - Production Ready"""
    
    def generate_key_id(self) -> str:
        """Generate unique QKD key identifier"""
        return f"qkd_{secrets.token_hex(16)}"
    
    def generate_quantum_key(self, length: int = 32) -> bytes:
        """
        Generate cryptographically secure key
        In production, this would interface with actual QKD hardware
        """
        return get_random_bytes(length)
    
    def request_key(self, sender: str, recipient: str, lifetime: int) -> dict:
        """
        Request new QKD key for email encryption
        
        Args:
            sender: Email address of sender
            recipient: Email address of recipient  
            lifetime: Key lifetime in seconds
            
        Returns:
            Dict with key_id, key_b64, expires_at
        """
        key_id = self.generate_key_id()
        quantum_key = self.generate_quantum_key(32)  # 256-bit key
        key_b64 = base64.b64encode(quantum_key).decode('utf-8')
        
        created_at = datetime.datetime.utcnow().isoformat() + 'Z'
        expires_at = (datetime.datetime.utcnow() + 
                     datetime.timedelta(seconds=lifetime)).isoformat() + 'Z'
        
        # Store in database
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO qkd_keys 
                (key_id, key_b64, sender, recipient, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (key_id, key_b64, sender, recipient, created_at, expires_at))
            
            # Log key generation
            cursor.execute('''
                INSERT INTO key_usage_log 
                (key_id, action, timestamp, details)
                VALUES (?, ?, ?, ?)
            ''', (key_id, 'KEY_GENERATED', created_at, 
                  f"Generated for {sender} -> {recipient}"))
            conn.commit()
        
        print(f"🔑 Generated key {key_id} for {sender} -> {recipient}")
        
        return {
            'key_id': key_id,
            'key_b64': key_b64,
            'expires_at': expires_at,
            'algorithm': 'AES-256-GCM',
            'status': 'active'
        }
    
    def get_key(self, key_id: str) -> dict:
        """Retrieve QKD key by ID"""
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT key_id, key_b64, sender, recipient, 
                       created_at, expires_at, status, algorithm
                FROM qkd_keys WHERE key_id = ?
            ''', (key_id,))
            
            row = cursor.fetchone()
            if not row:
                return None
            
            key_data = {
                'key_id': row[0],
                'key_b64': row[1],
                'sender': row[2],
                'recipient': row[3],
                'created_at': row[4],
                'expires_at': row[5],
                'status': row[6],
                'algorithm': row[7]
            }
            
            # Check expiration
            expires_at = datetime.datetime.fromisoformat(
                row[5].replace('Z', '+00:00')
            )
            if datetime.datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
                # Update status to expired
                cursor.execute('''
                    UPDATE qkd_keys SET status = 'expired' 
                    WHERE key_id = ?
                ''', (key_id,))
                conn.commit()
                key_data['status'] = 'expired'
            
            # Log key access
            cursor.execute('''
                INSERT INTO key_usage_log 
                (key_id, action, timestamp, details)
                VALUES (?, ?, ?, ?)
            ''', (key_id, 'KEY_ACCESSED', 
                  datetime.datetime.utcnow().isoformat() + 'Z', 
                  'Key retrieved for decryption'))
            conn.commit()
            
            print(f"🔍 Retrieved key {key_id} (status: {key_data['status']})")
            
            return key_data

# Initialize key manager
key_manager = QKDKeyManager()

# API Routes

@app.route('/request_key', methods=['POST'])
def request_key():
    """Request new QKD key for email encryption"""
    try:
        data = request.get_json()
        sender = data.get('sender')
        recipient = data.get('recipient')
        lifetime = data.get('lifetime', 3600)  # Default 1 hour
        
        if not sender or not recipient:
            return jsonify({
                'error': 'sender and recipient are required'
            }), 400
        
        key_data = key_manager.request_key(sender, recipient, lifetime)
        
        return jsonify({
            'status': 'success',
            'key_id': key_data['key_id'],
            'key_b64': key_data['key_b64'],
            'expires_at': key_data['expires_at'],
            'algorithm': key_data['algorithm']
        })
        
    except Exception as e:
        print(f"❌ Error requesting key: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/get_key/<key_id>', methods=['GET'])
def get_key(key_id):
    """Retrieve QKD key for decryption"""
    try:
        key_data = key_manager.get_key(key_id)
        
        if not key_data:
            return jsonify({'error': 'Key not found'}), 404
        
        if key_data['status'] == 'expired':
            return jsonify({'error': 'Key has expired'}), 410
        
        return jsonify({
            'status': 'success',
            'key_data': key_data
        })
        
    except Exception as e:
        print(f"❌ Error retrieving key: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/keys', methods=['GET'])
def list_keys():
    """List all QKD keys for monitoring"""
    try:
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT key_id, sender, recipient, created_at, 
                       expires_at, status, algorithm
                FROM qkd_keys ORDER BY created_at DESC LIMIT 50
            ''')
            
            keys = []
            for row in cursor.fetchall():
                keys.append({
                    'key_id': row[0],
                    'sender': row[1],
                    'recipient': row[2],
                    'created_at': row[3],
                    'expires_at': row[4],
                    'status': row[5],
                    'algorithm': row[6]
                })
            
            return jsonify({
                'status': 'success',
                'keys': keys,
                'count': len(keys)
            })
            
    except Exception as e:
        print(f"❌ Error listing keys: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/login', methods=['POST'])
def login():
    """Authenticate user and store session"""
    try:
        data = request.get_json()
        email = data.get('email')
        app_password = data.get('app_password')
        smtp_host = data.get('smtp_host', 'smtp.gmail.com')
        smtp_port = data.get('smtp_port', 587)
        imap_host = data.get('imap_host', 'imap.gmail.com')
        imap_port = data.get('imap_port', 993)
        
        if not email or not app_password:
            return jsonify({
                'status': 'error',
                'message': 'Email and app password are required'
            }), 400
        
        # Validate email format
        import re
        email_pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
        if not re.match(email_pattern, email):
            return jsonify({
                'status': 'error',
                'message': 'Invalid email format'
            }), 400
        
        # Validate app password format
        if len(app_password) != 16 or ' ' in app_password:
            return jsonify({
                'status': 'error',
                'message': 'App password must be exactly 16 characters with no spaces'
            }), 400
        
        # Test Gmail SMTP connection
        try:
            print(f"🔍 Testing SMTP connection for {email} on {smtp_host}:{smtp_port}")
            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                server.starttls()
                print("🔒 STARTTLS enabled")
                server.login(email, app_password)
                print("✅ SMTP authentication successful")
            
            # Test Gmail IMAP connection
            print(f"🔍 Testing IMAP connection for {email} on {imap_host}:{imap_port}")
            with imaplib.IMAP4_SSL(imap_host, imap_port, timeout=10) as imap:
                imap.login(email, app_password)
                imap.select('INBOX')
                print("✅ IMAP authentication successful")
                
        except smtplib.SMTPAuthenticationError:
            print(f"❌ SMTP authentication failed for {email}")
            return jsonify({
                'status': 'error',
                'message': 'Gmail authentication failed. Please verify: 1) Email address is correct, 2) App password is correct (16 characters), 3) 2FA is enabled, 4) IMAP is enabled in Gmail settings'
            }), 401
        except imaplib.IMAP4.error as e:
            print(f"❌ IMAP authentication failed for {email}: {e}")
            return jsonify({
                'status': 'error',
                'message': 'IMAP authentication failed. Please ensure IMAP is enabled in your Gmail settings.'
            }), 401
        except socket.timeout:
            print(f"❌ Connection timeout for {email}")
            return jsonify({
                'status': 'error',
                'message': 'Connection timeout. Please check your internet connection and firewall settings.'
            }), 408
        except socket.gaierror as e:
            print(f"❌ DNS resolution failed: {e}")
            return jsonify({
                'status': 'error',
                'message': 'Cannot resolve Gmail servers. Please check your internet connection.'
            }), 503
        except Exception as e:
            print(f"❌ Connection error for {email}: {e}")
            return jsonify({
                'status': 'error',
                'message': f'Connection failed: {str(e)}. Please check your network connection and Gmail settings.'
            }), 500
        
        # Create session
        session_id = secrets.token_hex(32)
        created_at = datetime.datetime.utcnow().isoformat() + 'Z'
        expires_at = (datetime.datetime.utcnow() + 
                     datetime.timedelta(hours=24)).isoformat() + 'Z'
        
        # Store session in memory (in production, use secure storage)
        user_sessions[session_id] = {
            'email': email,
            'password': app_password,
            'created_at': created_at,
            'expires_at': expires_at
        }
        
        print(f"✅ Session created for {email}")
        return jsonify({
            'status': 'success',
            'session_id': session_id,
            'message': 'Login successful',
            'email': email
        })
        
    except Exception as e:
        print(f"❌ Login error: {e}")
        return jsonify({
            'status': 'error',
            'message': f'Login failed: {str(e)}'
        }), 500

@app.route('/send_email', methods=['POST'])
def send_email():
    """Send encrypted email via Gmail SMTP"""
    try:
        data = request.get_json()
        to_address = data.get('to')
        subject = data.get('subject')
        body = data.get('body')
        session_id = data.get('session_id')
        
        if not all([to_address, subject, body, session_id]):
            return jsonify({
                'status': 'error',
                'message': 'Missing required fields'
            }), 400
        
        # Get session credentials
        session = user_sessions.get(session_id)
        if not session:
            return jsonify({
                'status': 'error',
                'message': 'Invalid session. Please log in again.'
            }), 401
        
        # Check session expiration
        expires_at = datetime.datetime.fromisoformat(
            session['expires_at'].replace('Z', '+00:00')
        )
        if datetime.datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
            return jsonify({
                'status': 'error',
                'message': 'Session expired. Please log in again.'
            }), 401
        
        print(f"📧 Sending email from {session['email']} to {to_address}")
        
        # Request QKD key
        qkd_key = key_manager.request_key(session['email'], to_address, 3600)
        print(f"🔑 QKD key generated: {qkd_key['key_id']}")
        
        # Encrypt message with AES-256-GCM
        key = base64.b64decode(qkd_key['key_b64'])
        cipher = AES.new(key, AES.MODE_GCM)
        ciphertext, tag = cipher.encrypt_and_digest(body.encode('utf-8'))
        print("🔐 Message encrypted with AES-256-GCM")
        
        # Create encrypted payload
        encrypted_payload = {
            'version': '1.0',
            'algorithm': 'AES-256-GCM',
            'key_id': qkd_key['key_id'],
            'ciphertext': base64.b64encode(ciphertext).decode('utf-8'),
            'nonce': base64.b64encode(cipher.nonce).decode('utf-8'),
            'tag': base64.b64encode(tag).decode('utf-8'),
            'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'
        }
        
        # Construct email
        msg = MIMEMultipart()
        msg['From'] = session['email']
        msg['To'] = to_address
        msg['Subject'] = subject
        
        # Add QuMail headers
        msg['X-QuMail-Encrypted'] = 'AES-GCM'
        msg['X-QuMail-Key-ID'] = qkd_key['key_id']
        msg['X-QuMail-Version'] = '1.0'
        msg['X-QuMail-Timestamp'] = encrypted_payload['timestamp']
        
        # Create email body with encrypted payload
        email_body = f"""This message was encrypted using QuMail quantum-secure encryption.

To decrypt this message, you need QuMail client software and access to the QKD key.

Key ID: {qkd_key['key_id']}
Algorithm: AES-256-GCM
Encrypted at: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC

--- ENCRYPTED PAYLOAD ---
{json.dumps(encrypted_payload, indent=2)}
--- END ENCRYPTED PAYLOAD ---

QuMail - Quantum-Secure Email Communication"""
        
        msg.attach(MIMEText(email_body, 'plain'))
        
        print("📤 Connecting to Gmail SMTP...")
        # Send email via Gmail SMTP
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            print("🔒 STARTTLS enabled")
            server.login(session['email'], session['password'])
            print("✅ SMTP login successful")
            server.send_message(msg)
            print("📧 Email sent successfully")
        
        print(f"🎉 Email delivered to {to_address} with key {qkd_key['key_id']}")
        
        return jsonify({
            'status': 'success',
            'message': 'Email sent successfully with quantum encryption!',
            'key_id': qkd_key['key_id']
        })
        
    except smtplib.SMTPAuthenticationError:
        print("❌ SMTP authentication failed")
        return jsonify({
            'status': 'error',
            'message': 'Gmail authentication failed. Please check your credentials.'
        }), 401
    except smtplib.SMTPException as e:
        print(f"❌ SMTP error: {e}")
        return jsonify({
            'status': 'error',
            'message': f'Email sending failed: {str(e)}'
        }), 500
    except Exception as e:
        print(f"❌ Error sending email: {e}")
        return jsonify({
            'status': 'error',
            'message': f'Unexpected error: {str(e)}'
        }), 500

@app.route('/validate_smtp', methods=['POST'])
def validate_smtp():
    """Validate SMTP credentials"""
    try:
        data = request.get_json()
        smtp_host = data.get('smtp_host')
        smtp_port = data.get('smtp_port')
        username = data.get('username')
        password = data.get('password')
        
        if not all([smtp_host, smtp_port, username, password]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Test SMTP connection
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(username, password)
        
        return jsonify({'status': 'success', 'message': 'SMTP connection successful'})
        
    except smtplib.SMTPAuthenticationError:
        return jsonify({'error': 'Invalid email credentials'}), 401
    except Exception as e:
        return jsonify({'error': f'SMTP connection failed: {str(e)}'}), 500

@app.route('/validate_imap', methods=['POST'])
def validate_imap():
    """Validate IMAP credentials"""
    try:
        data = request.get_json()
        imap_host = data.get('imap_host')
        imap_port = data.get('imap_port')
        username = data.get('username')
        password = data.get('password')
        
        if not all([imap_host, imap_port, username, password]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Test IMAP connection
        with imaplib.IMAP4_SSL(imap_host, imap_port) as imap:
            imap.login(username, password)
        
        return jsonify({'status': 'success', 'message': 'IMAP connection successful'})
        
    except imaplib.IMAP4.error:
        return jsonify({'error': 'Invalid email credentials'}), 401
    except Exception as e:
        return jsonify({'error': f'IMAP connection failed: {str(e)}'}), 500

@app.route('/send_email_api', methods=['POST'])
def send_email_api():
    """Send encrypted email via API"""
    try:
        data = request.get_json()
        
        # Extract email data
        to_address = data.get('to')
        subject = data.get('subject')
        body = data.get('body')
        
        # Extract credentials
        credentials = data.get('credentials', {})
        smtp_host = credentials.get('smtpHost')
        smtp_port = credentials.get('smtpPort')
        username = credentials.get('email')
        password = credentials.get('password')
        
        if not all([to_address, subject, body, smtp_host, smtp_port, username, password]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Request QKD key
        qkd_key = key_manager.request_key(username, to_address, 3600)
        
        # Encrypt message
        key = base64.b64decode(qkd_key['key_b64'])
        cipher = AES.new(key, AES.MODE_GCM)
        ciphertext, tag = cipher.encrypt_and_digest(body.encode('utf-8'))
        
        encrypted_payload = {
            'version': '1.0',
            'algorithm': 'AES-256-GCM',
            'key_id': qkd_key['key_id'],
            'ciphertext': base64.b64encode(ciphertext).decode('utf-8'),
            'nonce': base64.b64encode(cipher.nonce).decode('utf-8'),
            'tag': base64.b64encode(tag).decode('utf-8'),
            'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'
        }
        
        # Create email
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        msg = MIMEMultipart()
        msg['From'] = username
        msg['To'] = to_address
        msg['Subject'] = subject
        msg['X-QuMail-Encrypted'] = 'AES-GCM'
        msg['X-QuMail-Key-ID'] = qkd_key['key_id']
        msg['X-QuMail-Version'] = '1.0'
        msg['X-QuMail-Timestamp'] = encrypted_payload['timestamp']
        
        email_body = f"""This message was encrypted using QuMail quantum-secure encryption.

To decrypt this message, you need QuMail client software and access to the QKD key.

Key ID: {qkd_key['key_id']}
Algorithm: AES-256-GCM
Encrypted at: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC

--- ENCRYPTED PAYLOAD ---
{json.dumps(encrypted_payload, indent=2)}
--- END ENCRYPTED PAYLOAD ---

QuMail - Quantum-Secure Email Communication"""
        
        msg.attach(MIMEText(email_body, 'plain'))
        
        # Send email
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(username, password)
            server.send_message(msg)
        
        return jsonify({
            'status': 'success',
            'key_id': qkd_key['key_id'],
            'message': 'Email sent successfully'
        })
        
    except Exception as e:
        print(f"❌ Error sending email: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """System health check"""
    return jsonify({
        'status': 'healthy',
        'service': 'QuMail QKD Key Manager',
        'version': '1.0.0',
        'port': API_PORT,
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'
    })

if __name__ == '__main__':
    # Initialize database
    init_database()
    
    # Verify all dependencies are installed
    try:
        import flask
        import flask_cors
        import Crypto
        import requests
        import dotenv
        print(f"✅ Dependencies verified:")
        print(f"   Flask: {flask.__version__}")
        print(f"   Requests: {requests.__version__}")
        print(f"   PyCryptodome: {Crypto.__version__}")
        print(f"   Python-dotenv: {dotenv.__version__}")
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("Please run: python -m pip install --upgrade flask flask-cors pycryptodome requests python-dotenv")
        exit(1)
    
    # Run Flask server
    print("🔐 QuMail QKD Key Manager starting...")
    print(f"🚀 Running on http://localhost:{API_PORT}")
    print("📡 Ready to issue quantum-secure keys")
    
    app.run(debug=True, host='0.0.0.0', port=API_PORT)