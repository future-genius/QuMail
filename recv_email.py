#!/usr/bin/env python3
"""
QuMail Email Receiver - Real IMAP Integration

This script fetches and decrypts quantum-encrypted emails from real IMAP servers.
It identifies QuMail-encrypted messages and decrypts them using QKD keys.

Usage:
    python recv_email.py --check-inbox
    python recv_email.py --decrypt-all

Environment Variables:
    IMAP_HOST=imap.gmail.com
    IMAP_PORT=993
    IMAP_USER=your_email@gmail.com
    IMAP_PASS=your_app_password

Installation:
    pip install pycryptodome requests python-dotenv
"""

import imaplib
import email
import requests
import argparse
import json
import base64
import os
import re
from email.header import decode_header
from Crypto.Cipher import AES
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
QKD_API_BASE = 'http://localhost:5001'

def load_config():
    """Load IMAP configuration from environment variables"""
    config = {
        'imap_host': os.getenv('IMAP_HOST', 'imap.gmail.com'),
        'imap_port': int(os.getenv('IMAP_PORT', 993)),
        'imap_user': os.getenv('IMAP_USER', ''),
        'imap_pass': os.getenv('IMAP_PASS', ''),
    }
    
    # Validate required fields
    required_fields = ['imap_user', 'imap_pass']
    missing_fields = [field for field in required_fields if not config[field]]
    
    if missing_fields:
        print(f"❌ Missing required environment variables: {', '.join(missing_fields.upper())}")
        print("\n📝 Required environment variables:")
        print("   IMAP_HOST=imap.gmail.com")
        print("   IMAP_PORT=993")
        print("   IMAP_USER=your_email@gmail.com")
        print("   IMAP_PASS=your_app_password")
        print("\n💡 For Gmail, use App Passwords instead of your regular password")
        return None
    
    return config

def get_qkd_key(key_id):
    """Retrieve QKD key from Key Manager"""
    try:
        print(f"🔍 Retrieving QKD key: {key_id}")
        response = requests.get(f'{QKD_API_BASE}/get_key/{key_id}', timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ QKD key retrieved successfully")
            return data['key_data']['key_b64']
        elif response.status_code == 404:
            raise Exception("QKD key not found")
        elif response.status_code == 410:
            raise Exception("QKD key has expired")
        else:
            raise Exception(f"Failed to retrieve key: {response.text}")
            
    except requests.RequestException as e:
        raise Exception(f"Failed to connect to QKD Key Manager at {QKD_API_BASE}: {e}")

def decrypt_message(ciphertext_b64, nonce_b64, tag_b64, key_b64):
    """Decrypt message using AES-256-GCM"""
    try:
        key = base64.b64decode(key_b64)
        ciphertext = base64.b64decode(ciphertext_b64)
        nonce = base64.b64decode(nonce_b64)
        tag = base64.b64decode(tag_b64)
        
        cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
        plaintext = cipher.decrypt_and_verify(ciphertext, tag)
        
        return plaintext.decode('utf-8')
    except Exception as e:
        raise Exception(f"Decryption failed: {e}")

def decode_email_header(header):
    """Decode email header"""
    if not header:
        return ""
    
    decoded_header = decode_header(header)
    return ''.join([
        text.decode(encoding or 'utf-8') if isinstance(text, bytes) else text
        for text, encoding in decoded_header
    ])

def extract_encrypted_payload(email_body):
    """Extract encrypted payload from email body"""
    # Look for encrypted payload block
    pattern = r'--- ENCRYPTED PAYLOAD ---\s*\n(.*?)\n--- END ENCRYPTED PAYLOAD ---'
    match = re.search(pattern, email_body, re.DOTALL)
    
    if not match:
        return None
    
    try:
        payload_json = match.group(1).strip()
        payload = json.loads(payload_json)
        return payload
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse encrypted payload: {e}")
        return None

def fetch_emails(config, mailbox='INBOX', limit=10):
    """Fetch emails from IMAP server"""
    try:
        print(f"📥 Connecting to IMAP server {config['imap_host']}:{config['imap_port']}")
        
        # Connect to IMAP server
        with imaplib.IMAP4_SSL(config['imap_host'], config['imap_port']) as imap:
            imap.login(config['imap_user'], config['imap_pass'])
            imap.select(mailbox)
            
            print(f"📂 Selected mailbox: {mailbox}")
            
            # Search for emails
            status, messages = imap.search(None, 'ALL')
            if status != 'OK':
                raise Exception("Failed to search emails")
            
            message_ids = messages[0].split()[-limit:]  # Get last N emails
            
            print(f"📧 Found {len(message_ids)} recent emails")
            
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
                is_qumail = email_message.get('X-QuMail-Encrypted') == 'AES-GCM'
                key_id = email_message.get('X-QuMail-Key-ID')
                version = email_message.get('X-QuMail-Version')
                timestamp = email_message.get('X-QuMail-Timestamp')
                
                # Extract body
                body = ""
                if email_message.is_multipart():
                    for part in email_message.walk():
                        if part.get_content_type() == "text/plain":
                            body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                            break
                else:
                    body = email_message.get_payload(decode=True).decode('utf-8', errors='ignore')
                
                emails.append({
                    'id': msg_id.decode(),
                    'subject': subject,
                    'from': sender,
                    'date': date,
                    'body': body,
                    'is_qumail': is_qumail,
                    'key_id': key_id,
                    'version': version,
                    'timestamp': timestamp,
                    'decrypted': False,
                    'decrypted_body': None
                })
            
            return emails
            
    except Exception as e:
        raise Exception(f"Failed to fetch emails: {e}")

def decrypt_qumail_email(email_data):
    """Decrypt QuMail encrypted email"""
    if not email_data['is_qumail']:
        print(f"📝 Email '{email_data['subject']}' is not QuMail encrypted")
        return email_data
    
    try:
        print(f"\n🔓 Decrypting QuMail email: {email_data['subject']}")
        print(f"🔑 Key ID: {email_data['key_id']}")
        
        # Extract encrypted payload from body
        payload = extract_encrypted_payload(email_data['body'])
        if not payload:
            raise Exception("Could not extract encrypted payload from email body")
        
        print(f"📦 Payload algorithm: {payload.get('algorithm', 'unknown')}")
        
        # Get QKD key
        key_b64 = get_qkd_key(email_data['key_id'])
        
        # Decrypt message
        print("🔓 Decrypting with AES-256-GCM...")
        decrypted_body = decrypt_message(
            payload['ciphertext'],
            payload['nonce'],
            payload['tag'],
            key_b64
        )
        
        # Update email data
        email_data['decrypted'] = True
        email_data['decrypted_body'] = decrypted_body
        
        print("✅ Message decrypted successfully!")
        
        return email_data
        
    except Exception as e:
        print(f"❌ Failed to decrypt message: {e}")
        email_data['decrypt_error'] = str(e)
        return email_data

def display_email(email_data, show_body=True):
    """Display email in formatted output"""
    print("\n" + "="*70)
    print(f"📧 Subject: {email_data['subject']}")
    print(f"👤 From: {email_data['from']}")
    print(f"📅 Date: {email_data['date']}")
    
    if email_data['is_qumail']:
        if email_data['decrypted']:
            print("🔓 Status: QuMail Encrypted (✅ Decrypted)")
            print(f"🔑 Key ID: {email_data['key_id']}")
            print(f"📦 Version: {email_data['version']}")
        elif email_data.get('decrypt_error'):
            print("❌ Status: QuMail Encrypted (❌ Decryption Failed)")
            print(f"💥 Error: {email_data['decrypt_error']}")
        else:
            print("🔒 Status: QuMail Encrypted (⏳ Not Decrypted)")
            print(f"🔑 Key ID: {email_data['key_id']}")
    else:
        print("📝 Status: Standard Email")
    
    if show_body:
        print("\n📄 Body:")
        print("-" * 70)
        
        if email_data['is_qumail'] and email_data['decrypted']:
            # Show decrypted content
            print(email_data['decrypted_body'])
        elif email_data['is_qumail'] and not email_data['decrypted']:
            # Show that it's encrypted
            print("🔒 [ENCRYPTED CONTENT - Use --decrypt-all to decrypt]")
        else:
            # Show regular email (truncated)
            body = email_data['body'][:500]
            if len(email_data['body']) > 500:
                body += '\n... [truncated]'
            print(body)
    
    print("="*70)

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Receive and decrypt quantum-secure emails via real IMAP')
    parser.add_argument('--check-inbox', action='store_true', help='Fetch and display recent emails')
    parser.add_argument('--decrypt-all', action='store_true', help='Decrypt all QuMail messages')
    parser.add_argument('--limit', type=int, default=10, help='Number of recent emails to fetch')
    
    args = parser.parse_args()
    
    print("🔐 QuMail Email Receiver")
    print("=" * 50)
    
    # Load configuration
    config = load_config()
    if not config:
        return 1
    
    print(f"📥 IMAP Server: {config['imap_host']}:{config['imap_port']}")
    print(f"👤 User: {config['imap_user']}")
    
    if args.check_inbox or args.decrypt_all:
        try:
            # Fetch emails
            emails = fetch_emails(config, limit=args.limit)
            
            print(f"\n📊 Email Summary:")
            print(f"   Total emails: {len(emails)}")
            qumail_count = sum(1 for e in emails if e['is_qumail'])
            print(f"   QuMail encrypted: {qumail_count}")
            print(f"   Standard emails: {len(emails) - qumail_count}")
            
            # Process emails
            for email_data in emails:
                if args.decrypt_all and email_data['is_qumail']:
                    email_data = decrypt_qumail_email(email_data)
                
                display_email(email_data, show_body=True)
            
            if qumail_count > 0 and not args.decrypt_all:
                print(f"\n💡 Found {qumail_count} QuMail encrypted messages.")
                print("   Use --decrypt-all to decrypt them.")
                
        except Exception as e:
            print(f"❌ Failed to process emails: {e}")
            return 1
    
    else:
        parser.print_help()
        return 1
    
    return 0

if __name__ == '__main__':
    exit(main())