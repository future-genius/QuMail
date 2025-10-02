#!/usr/bin/env python3
"""
QuMail Email Sender - Real SMTP Integration

This script sends quantum-encrypted emails via real SMTP servers.
The email body is encrypted using AES-256-GCM with QKD-derived keys.

Usage:
    python send_email.py --to recipient@example.com --subject "Test" --body "Secret message"

Environment Variables:
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=your_email@gmail.com
    SMTP_PASS=your_app_password
    SENDER_EMAIL=your_email@gmail.com

Installation:
    pip install pycryptodome requests python-dotenv
"""

import smtplib
import requests
import argparse
import json
import base64
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
QKD_API_BASE = 'http://localhost:5001'

def load_config():
    """Load SMTP configuration from environment variables"""
    config = {
        'smtp_host': os.getenv('SMTP_HOST', 'smtp.gmail.com'),
        'smtp_port': int(os.getenv('SMTP_PORT', 587)),
        'smtp_user': os.getenv('SMTP_USER', ''),
        'smtp_pass': os.getenv('SMTP_PASS', ''),
        'sender_email': os.getenv('SENDER_EMAIL', ''),
    }
    
    # Validate required fields
    required_fields = ['smtp_user', 'smtp_pass', 'sender_email']
    missing_fields = [field for field in required_fields if not config[field]]
    
    if missing_fields:
      print(f"❌ Missing required environment variables: {', '.join(field.upper() for field in missing_fields)}")
      print("\n📝 Required environment variables:")
      print("   SMTP_HOST=smtp.gmail.com")
      print("   SMTP_PORT=587")
      print("   SMTP_USER=your_email@gmail.com")
      print("   SMTP_PASS=your_app_password")
      print("   SENDER_EMAIL=your_email@gmail.com")
      print("\n💡 For Gmail, use App Passwords instead of your regular password")
      return None

    
    return config

def request_qkd_key(sender, recipient, lifetime=3600):
    """Request QKD key from Key Manager"""
    try:
        print(f"🔑 Requesting QKD key from {QKD_API_BASE}")
        response = requests.post(f'{QKD_API_BASE}/request_key', json={
            'sender': sender,
            'recipient': recipient,
            'lifetime': lifetime
        }, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ QKD key obtained: {data['key_id']}")
            return data['key_id'], data['key_b64']
        else:
            raise Exception(f"QKD key request failed: {response.text}")
            
    except requests.RequestException as e:
        raise Exception(f"Failed to connect to QKD Key Manager at {QKD_API_BASE}: {e}")

def encrypt_message(plaintext, key_b64):
    """Encrypt message using AES-256-GCM"""
    try:
        key = base64.b64decode(key_b64)
        cipher = AES.new(key, AES.MODE_GCM)
        
        ciphertext, tag = cipher.encrypt_and_digest(plaintext.encode('utf-8'))
        
        return {
            'ciphertext': base64.b64encode(ciphertext).decode('utf-8'),
            'nonce': base64.b64encode(cipher.nonce).decode('utf-8'),
            'tag': base64.b64encode(tag).decode('utf-8')
        }
    except Exception as e:
        raise Exception(f"Encryption failed: {e}")

def send_encrypted_email(to_address, subject, body, config):
    """Send quantum-encrypted email via SMTP"""
    try:
        # Step 1: Request QKD key
        print(f"📧 Preparing to send encrypted email to {to_address}")
        key_id, key_b64 = request_qkd_key(config['sender_email'], to_address)
        
        # Step 2: Encrypt message
        print("🔐 Encrypting message with AES-256-GCM...")
        encrypted = encrypt_message(body, key_b64)
        
        # Step 3: Prepare email
        msg = MIMEMultipart()
        msg['From'] = config['sender_email']
        msg['To'] = to_address
        msg['Subject'] = subject
        
        # Add QuMail headers for identification
        msg['X-QuMail-Encrypted'] = 'AES-GCM'
        msg['X-QuMail-Key-ID'] = key_id
        msg['X-QuMail-Version'] = '1.0'
        msg['X-QuMail-Timestamp'] = datetime.utcnow().isoformat() + 'Z'
        
        # Create encrypted payload
        encrypted_payload = {
            'version': '1.0',
            'algorithm': 'AES-256-GCM',
            'key_id': key_id,
            'ciphertext': encrypted['ciphertext'],
            'nonce': encrypted['nonce'],
            'tag': encrypted['tag'],
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }
        
        # Email body with encrypted data
        email_body = f"""This message was encrypted using QuMail quantum-secure encryption.

To decrypt this message, you need QuMail client software and access to the QKD key.

Key ID: {key_id}
Algorithm: AES-256-GCM
Encrypted at: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC

--- ENCRYPTED PAYLOAD ---
{json.dumps(encrypted_payload, indent=2)}
--- END ENCRYPTED PAYLOAD ---

QuMail - Quantum-Secure Email Communication
https://github.com/qumail/qumail
"""
        
        msg.attach(MIMEText(email_body, 'plain'))
        
        # Step 4: Send email via SMTP
        print(f"📤 Connecting to SMTP server {config['smtp_host']}:{config['smtp_port']}")
        
        with smtplib.SMTP(config['smtp_host'], config['smtp_port']) as server:
            server.starttls()
            server.login(config['smtp_user'], config['smtp_pass'])
            
            print(f"📧 Sending encrypted email...")
            server.send_message(msg)
        
        print("✅ Quantum-secure email sent successfully!")
        print(f"📝 Subject: {subject}")
        print(f"📧 To: {to_address}")
        print(f"🔑 Key ID: {key_id}")
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
    parser = argparse.ArgumentParser(description='Send quantum-secure email via real SMTP')
    parser.add_argument('--to', required=True, help='Recipient email address')
    parser.add_argument('--subject', required=True, help='Email subject')
    parser.add_argument('--body', required=True, help='Email body (will be encrypted)')
    
    args = parser.parse_args()
    
    print("🔐 QuMail Email Sender")
    print("=" * 50)
    
    # Load configuration
    config = load_config()
    if not config:
        return 1
    
    print(f"📤 SMTP Server: {config['smtp_host']}:{config['smtp_port']}")
    print(f"👤 Sender: {config['sender_email']}")
    print(f"🎯 Recipient: {args.to}")
    print(f"📝 Subject: {args.subject}")
    print(f"💬 Message: {args.body[:50]}{'...' if len(args.body) > 50 else ''}")
    print()
    
    # Send encrypted email
    result = send_encrypted_email(args.to, args.subject, args.body, config)
    
    if result['status'] == 'success':
        print(f"\n🎉 Encrypted email sent successfully!")
        print(f"🔍 Check the recipient's inbox for the encrypted message")
        return 0
    else:
        print(f"\n💥 Send failed: {result['error']}")
        return 1

if __name__ == '__main__':
    exit(main())