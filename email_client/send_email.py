"""
QuMail Email Sender - Quantum-Secure SMTP Client

This script demonstrates sending quantum-encrypted emails via SMTP.
The email body is encrypted using AES-256-GCM with QKD-derived keys.

Usage:
    python send_email.py --to recipient@example.com --subject "Test" --body "Secret message"

Configuration:
    Set SMTP credentials in config.json or environment variables
"""

import smtplib
import requests
import argparse
import json
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import secrets
import os
from datetime import datetime

# Configuration
CONFIG_FILE = 'config.json'
QKD_API_BASE = 'http://localhost:5000/api/qkd'

def load_config():
    """Load SMTP configuration"""
    config = {}
    
    # Try to load from config file
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
    
    # Override with environment variables if present
    config.update({
        'smtp_server': os.getenv('SMTP_SERVER', config.get('smtp_server', 'smtp.gmail.com')),
        'smtp_port': int(os.getenv('SMTP_PORT', config.get('smtp_port', 587))),
        'smtp_username': os.getenv('SMTP_USERNAME', config.get('smtp_username', '')),
        'smtp_password': os.getenv('SMTP_PASSWORD', config.get('smtp_password', '')),
        'sender_email': os.getenv('SENDER_EMAIL', config.get('sender_email', '')),
    })
    
    return config

def request_qkd_key(sender, recipient, lifetime=3600):
    """Request QKD key from Key Manager"""
    try:
        response = requests.post(f'{QKD_API_BASE}/request_key', json={
            'sender': sender,
            'recipient': recipient,
            'lifetime': lifetime
        }, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            return data['key_id'], data['key_b64']
        else:
            raise Exception(f"QKD key request failed: {response.text}")
            
    except requests.RequestException as e:
        raise Exception(f"Failed to connect to QKD Key Manager: {e}")

def encrypt_message(plaintext, key_b64):
    """Encrypt message using AES-256-GCM"""
    key = base64.b64decode(key_b64)
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(12)  # 96-bit nonce for GCM
    
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)
    
    return {
        'ciphertext': base64.b64encode(ciphertext).decode('utf-8'),
        'nonce': base64.b64encode(nonce).decode('utf-8')
    }

def send_encrypted_email(to_address, subject, body, config):
    """Send quantum-encrypted email via SMTP"""
    try:
        # Step 1: Request QKD key
        print(f"🔑 Requesting QKD key for {config['sender_email']} -> {to_address}")
        key_id, key_b64 = request_qkd_key(config['sender_email'], to_address)
        print(f"✅ QKD key obtained: {key_id}")
        
        # Step 2: Encrypt message
        print("🔐 Encrypting message with AES-256-GCM...")
        encrypted = encrypt_message(body, key_b64)
        
        # Step 3: Prepare email
        msg = MIMEMultipart()
        msg['From'] = config['sender_email']
        msg['To'] = to_address
        msg['Subject'] = subject
        
        # Add custom headers for QuMail
        msg['X-QuMail-Encrypted'] = 'true'
        msg['X-QuMail-Key-ID'] = key_id
        msg['X-QuMail-Algorithm'] = 'AES-256-GCM'
        msg['X-QuMail-Version'] = '1.0'
        
        # Create encrypted body with metadata
        encrypted_body = json.dumps({
            'version': '1.0',
            'algorithm': 'AES-256-GCM',
            'key_id': key_id,
            'ciphertext': encrypted['ciphertext'],
            'nonce': encrypted['nonce'],
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }, indent=2)
        
        # Add plaintext notice for non-QuMail clients
        plaintext_notice = f"""
This message was encrypted using QuMail quantum-secure encryption.

To decrypt this message, you need:
1. QuMail client software
2. Access to the QKD key with ID: {key_id}

--- ENCRYPTED MESSAGE DATA ---
{encrypted_body}
--- END ENCRYPTED DATA ---

QuMail - Quantum-Secure Email Communication
        """.strip()
        
        msg.attach(MIMEText(plaintext_notice, 'plain'))
        
        # Step 4: Send email
        print(f"📧 Sending encrypted email to {to_address}...")
        
        with smtplib.SMTP(config['smtp_server'], config['smtp_port']) as server:
            server.starttls()
            server.login(config['smtp_username'], config['smtp_password'])
            server.send_message(msg)
        
        print("✅ Quantum-secure email sent successfully!")
        print(f"📝 Key ID: {key_id}")
        print(f"🔐 Encryption: AES-256-GCM with QKD-derived key")
        
        return {
            'status': 'success',
            'key_id': key_id,
            'to': to_address,
            'subject': subject
        }
        
    except Exception as e:
        print(f"❌ Failed to send encrypted email: {e}")
        return {
            'status': 'error',
            'error': str(e)
        }

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Send quantum-secure email')
    parser.add_argument('--to', required=True, help='Recipient email address')
    parser.add_argument('--subject', required=True, help='Email subject')
    parser.add_argument('--body', required=True, help='Email body')
    parser.add_argument('--config', default=CONFIG_FILE, help='Configuration file path')
    
    args = parser.parse_args()
    
    # Load configuration
    try:
        config = load_config()
        if not all([config.get('smtp_username'), config.get('smtp_password'), 
                   config.get('sender_email')]):
            print("❌ SMTP configuration incomplete. Please check config.json or environment variables.")
            return
            
    except Exception as e:
        print(f"❌ Failed to load configuration: {e}")
        return
    
    # Send encrypted email
    result = send_encrypted_email(args.to, args.subject, args.body, config)
    
    if result['status'] == 'success':
        print(f"\n🎉 Message sent with quantum security!")
    else:
        print(f"\n💥 Send failed: {result['error']}")

if __name__ == '__main__':
    main()