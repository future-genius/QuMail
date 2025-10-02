"""
QuMail Email Receiver - Quantum-Secure IMAP Client

This script fetches and decrypts quantum-encrypted emails from an IMAP server.
It identifies QuMail-encrypted messages and decrypts them using QKD keys.

Usage:
    python recv_email.py --inbox
    python recv_email.py --decrypt --message-id <id>

Configuration:
    Set IMAP credentials in config.json or environment variables
"""

import imaplib
import email
import requests
import argparse
import json
import base64
from email.header import decode_header
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os
import re

# Configuration
CONFIG_FILE = 'config.json'
QKD_API_BASE = 'http://localhost:5000/api/qkd'

def load_config():
    """Load IMAP configuration"""
    config = {}
    
    # Try to load from config file
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
    
    # Override with environment variables if present
    config.update({
        'imap_server': os.getenv('IMAP_SERVER', config.get('imap_server', 'imap.gmail.com')),
        'imap_port': int(os.getenv('IMAP_PORT', config.get('imap_port', 993))),
        'imap_username': os.getenv('IMAP_USERNAME', config.get('imap_username', '')),
        'imap_password': os.getenv('IMAP_PASSWORD', config.get('imap_password', '')),
    })
    
    return config

def get_qkd_key(key_id):
    """Retrieve QKD key from Key Manager"""
    try:
        response = requests.get(f'{QKD_API_BASE}/get_key/{key_id}', timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            return data['key_data']['key_b64']
        elif response.status_code == 404:
            raise Exception("QKD key not found")
        elif response.status_code == 410:
            raise Exception("QKD key has expired")
        else:
            raise Exception(f"Failed to retrieve key: {response.text}")
            
    except requests.RequestException as e:
        raise Exception(f"Failed to connect to QKD Key Manager: {e}")

def decrypt_message(ciphertext_b64, nonce_b64, key_b64):
    """Decrypt message using AES-256-GCM"""
    key = base64.b64decode(key_b64)
    ciphertext = base64.b64decode(ciphertext_b64)
    nonce = base64.b64decode(nonce_b64)
    
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    
    return plaintext.decode('utf-8')

def decode_email_header(header):
    """Decode email header"""
    decoded_header = decode_header(header)
    return ''.join([
        text.decode(encoding or 'utf-8') if isinstance(text, bytes) else text
        for text, encoding in decoded_header
    ])

def extract_encrypted_data(email_body):
    """Extract encrypted data from email body"""
    # Look for encrypted message data block
    pattern = r'--- ENCRYPTED MESSAGE DATA ---\s*\n(.*?)\n--- END ENCRYPTED DATA ---'
    match = re.search(pattern, email_body, re.DOTALL)
    
    if not match:
        return None
    
    try:
        encrypted_data = json.loads(match.group(1))
        return encrypted_data
    except json.JSONDecodeError:
        return None

def fetch_emails(config, mailbox='INBOX'):
    """Fetch emails from IMAP server"""
    try:
        # Connect to IMAP server
        with imaplib.IMAP4_SSL(config['imap_server'], config['imap_port']) as imap:
            imap.login(config['imap_username'], config['imap_password'])
            imap.select(mailbox)
            
            # Search for emails
            status, messages = imap.search(None, 'ALL')
            if status != 'OK':
                raise Exception("Failed to search emails")
            
            message_ids = messages[0].split()[-10:]  # Get last 10 emails
            
            emails = []
            for msg_id in message_ids:
                status, msg_data = imap.fetch(msg_id, '(RFC822)')
                if status != 'OK':
                    continue
                
                # Parse email
                email_message = email.message_from_bytes(msg_data[0][1])
                
                # Extract headers
                subject = decode_email_header(email_message.get('Subject', ''))
                sender = decode_email_header(email_message.get('From', ''))
                date = email_message.get('Date', '')
                
                # Check for QuMail headers
                is_qumail = email_message.get('X-QuMail-Encrypted') == 'true'
                key_id = email_message.get('X-QuMail-Key-ID')
                algorithm = email_message.get('X-QuMail-Algorithm')
                
                # Extract body
                body = ""
                if email_message.is_multipart():
                    for part in email_message.walk():
                        if part.get_content_type() == "text/plain":
                            body = part.get_payload(decode=True).decode('utf-8')
                            break
                else:
                    body = email_message.get_payload(decode=True).decode('utf-8')
                
                emails.append({
                    'id': msg_id.decode(),
                    'subject': subject,
                    'from': sender,
                    'date': date,
                    'body': body,
                    'is_qumail': is_qumail,
                    'key_id': key_id,
                    'algorithm': algorithm,
                    'decrypted': False
                })
            
            return emails
            
    except Exception as e:
        raise Exception(f"Failed to fetch emails: {e}")

def decrypt_qumail_email(email_data):
    """Decrypt QuMail encrypted email"""
    if not email_data['is_qumail']:
        return email_data
    
    try:
        print(f"🔓 Decrypting QuMail message: {email_data['subject']}")
        print(f"🔑 Key ID: {email_data['key_id']}")
        
        # Extract encrypted data from body
        encrypted_data = extract_encrypted_data(email_data['body'])
        if not encrypted_data:
            raise Exception("Could not extract encrypted data from email body")
        
        # Get QKD key
        print("🔍 Retrieving QKD key...")
        key_b64 = get_qkd_key(email_data['key_id'])
        
        # Decrypt message
        print("🔓 Decrypting with AES-256-GCM...")
        decrypted_body = decrypt_message(
            encrypted_data['ciphertext'],
            encrypted_data['nonce'],
            key_b64
        )
        
        # Update email data
        email_data['body'] = decrypted_body
        email_data['decrypted'] = True
        
        print("✅ Message decrypted successfully!")
        
        return email_data
        
    except Exception as e:
        print(f"❌ Failed to decrypt message: {e}")
        email_data['decrypt_error'] = str(e)
        return email_data

def display_email(email_data):
    """Display email in formatted output"""
    print("\n" + "="*60)
    print(f"📧 Subject: {email_data['subject']}")
    print(f"👤 From: {email_data['from']}")
    print(f"📅 Date: {email_data['date']}")
    
    if email_data['is_qumail']:
        if email_data['decrypted']:
            print("🔓 Status: QuMail Encrypted (Decrypted)")
            print(f"🔑 Key ID: {email_data['key_id']}")
            print(f"🛡️  Algorithm: {email_data['algorithm']}")
        elif email_data.get('decrypt_error'):
            print("❌ Status: QuMail Encrypted (Decryption Failed)")
            print(f"💥 Error: {email_data['decrypt_error']}")
        else:
            print("🔒 Status: QuMail Encrypted (Not Decrypted)")
    else:
        print("📝 Status: Standard Email")
    
    print("\n📄 Body:")
    print("-" * 60)
    print(email_data['body'][:500] + ('...' if len(email_data['body']) > 500 else ''))
    print("="*60)

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Receive and decrypt quantum-secure emails')
    parser.add_argument('--inbox', action='store_true', help='Fetch and display inbox')
    parser.add_argument('--decrypt', action='store_true', help='Decrypt QuMail messages')
    parser.add_argument('--message-id', help='Specific message ID to decrypt')
    parser.add_argument('--config', default=CONFIG_FILE, help='Configuration file path')
    
    args = parser.parse_args()
    
    # Load configuration
    try:
        config = load_config()
        if not all([config.get('imap_username'), config.get('imap_password')]):
            print("❌ IMAP configuration incomplete. Please check config.json or environment variables.")
            return
            
    except Exception as e:
        print(f"❌ Failed to load configuration: {e}")
        return
    
    if args.inbox:
        try:
            print("📥 Fetching emails from inbox...")
            emails = fetch_emails(config)
            
            print(f"\n📊 Found {len(emails)} emails")
            qumail_count = sum(1 for e in emails if e['is_qumail'])
            print(f"🔒 QuMail encrypted: {qumail_count}")
            
            for email_data in emails:
                if args.decrypt and email_data['is_qumail']:
                    email_data = decrypt_qumail_email(email_data)
                
                display_email(email_data)
                
        except Exception as e:
            print(f"❌ Failed to fetch emails: {e}")
    
    elif args.message_id:
        print(f"🎯 Processing specific message: {args.message_id}")
        # Implementation for specific message processing
        print("⚠️  Specific message processing not implemented in this demo")
    
    else:
        parser.print_help()

if __name__ == '__main__':
    main()