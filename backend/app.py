#!/usr/bin/env python3
"""
QuMail Backend - Quantum Key Distribution (QKD) Key Manager
Provides a QKD Key Manager API for quantum-secure email communications.

Installation:
pip install flask flask-cors pycryptodome python-dotenv

Usage:
python app.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from Crypto.Random import get_random_bytes
import sqlite3
import base64
import secrets
import datetime
import os

# --- Flask app setup ---
app = Flask(__name__)
CORS(app)  # Enable CORS for frontend

# --- Configuration ---
DATABASE = 'backend/qkd_keys.db'
API_PORT = 5001

# --- Database initialization ---
def init_database():
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
        conn.commit()
        print("✅ Database initialized successfully")

# --- QKD Key Manager ---
class QKDKeyManager:
    def generate_key_id(self):
        return f"qkd_{secrets.token_hex(16)}"

    def generate_quantum_key(self, length=32):
        """Generate cryptographically secure random key (32 bytes = 256-bit)"""
        return get_random_bytes(length)

    def request_key(self, sender, recipient, lifetime=3600):
        key_id = self.generate_key_id()
        key_bytes = self.generate_quantum_key(32)
        key_b64 = base64.b64encode(key_bytes).decode('utf-8')

        created_at = datetime.datetime.utcnow().isoformat() + 'Z'
        expires_at = (datetime.datetime.utcnow() + datetime.timedelta(seconds=lifetime)).isoformat() + 'Z'

        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO qkd_keys (key_id, key_b64, sender, recipient, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (key_id, key_b64, sender, recipient, created_at, expires_at))

            cursor.execute('''
                INSERT INTO key_usage_log (key_id, action, timestamp, details)
                VALUES (?, ?, ?, ?)
            ''', (key_id, 'KEY_GENERATED', created_at, f"{sender} -> {recipient}"))
            conn.commit()

        print(f"🔑 Generated key {key_id} for {sender} -> {recipient}")
        return {
            'key_id': key_id,
            'key_b64': key_b64,
            'expires_at': expires_at,
            'algorithm': 'AES-256-GCM',
            'status': 'active'
        }

    def get_key(self, key_id):
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT key_id, key_b64, sender, recipient, created_at, expires_at, status, algorithm
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
            expires_at = datetime.datetime.fromisoformat(row[5].replace('Z', '+00:00'))
            if datetime.datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
                cursor.execute('UPDATE qkd_keys SET status="expired" WHERE key_id=?', (key_id,))
                conn.commit()
                key_data['status'] = 'expired'

            # Log access
            cursor.execute('''
                INSERT INTO key_usage_log (key_id, action, timestamp, details)
                VALUES (?, ?, ?, ?)
            ''', (key_id, 'KEY_ACCESSED', datetime.datetime.utcnow().isoformat()+'Z', 'Key retrieved for decryption'))
            conn.commit()

            print(f"🔍 Retrieved key {key_id} (status: {key_data['status']})")
            return key_data

key_manager = QKDKeyManager()

# --- API ROUTES ---
@app.route('/api/request_key', methods=['POST'])
def api_request_key():
    data = request.get_json()
    sender = data.get('sender')
    recipient = data.get('recipient')
    lifetime = data.get('lifetime', 3600)
    if not sender or not recipient:
        return jsonify({'error': 'sender and recipient required'}), 400
    key_data = key_manager.request_key(sender, recipient, lifetime)
    return jsonify({'status': 'success', **key_data})

@app.route('/api/get_key/<key_id>', methods=['GET'])
def api_get_key(key_id):
    key_data = key_manager.get_key(key_id)
    if not key_data:
        return jsonify({'error': 'Key not found'}), 404
    if key_data['status'] == 'expired':
        return jsonify({'error': 'Key has expired'}), 410
    return jsonify({'status': 'success', 'key_data': key_data})

@app.route('/api/keys', methods=['GET'])
def api_list_keys():
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT key_id, sender, recipient, created_at, expires_at, status, algorithm
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
    return jsonify({'status': 'success', 'keys': keys, 'count': len(keys)})

@app.route('/api/health', methods=['GET'])
def api_health():
    return jsonify({
        'status': 'healthy',
        'service': 'QuMail QKD Key Manager',
        'version': '1.0.0',
        'port': API_PORT,
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'
    })

# --- MAIN ---
if __name__ == '__main__':
    init_database()
    print(f"🚀 QuMail QKD Key Manager running on http://localhost:{API_PORT}")
    app.run(debug=True, host='0.0.0.0', port=API_PORT)
