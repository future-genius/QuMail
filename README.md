# QuMail - Working Quantum-Secure Email Client

A working prototype of quantum-secure email communication using simulated Quantum Key Distribution (QKD) and real SMTP/IMAP email servers.

## 🔐 Features

### ✅ Working Components

- **Flask Backend (QKD Key Manager)** - Runs on http://localhost:5001
  - POST /request_key - Generate quantum-secure keys
  - GET /get_key/<key_id> - Retrieve keys for decryption
  - SQLite database for key storage and audit logging
  - AES-256-GCM encryption with cryptographically secure keys

- **Real Email Integration**
  - `send_email.py` - Sends encrypted emails via real SMTP (Gmail/Outlook)
  - `recv_email.py` - Receives and decrypts emails via real IMAP
  - Custom X-QuMail headers for encryption metadata
  - Works with actual email servers over the internet

- **React Demo Interface**
  - Visual demonstration of the encryption workflow
  - Key management dashboard
  - Simulated email composition and inbox

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Email Credentials

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your email credentials
# For Gmail, you need to:
# 1. Enable 2-factor authentication
# 2. Generate an App Password
# 3. Use the App Password in .env file
```

### 3. Start the QKD Key Manager

```bash
python app.py
```

The QKD API will be available at `http://localhost:5001`

### 4. Send Encrypted Email

```bash
python send_email.py \
  --to recipient@example.com \
  --subject "Confidential Report" \
  --body "This is a quantum-secure message"
```

### 5. Receive and Decrypt Email

```bash
# Check inbox for new emails
python recv_email.py --check-inbox

# Decrypt all QuMail encrypted messages
python recv_email.py --decrypt-all
```

## 📧 Real Email Demo Workflow

### Complete End-to-End Test

```bash
# Terminal 1: Start QKD Key Manager
python backend/app.py

# Terminal 2: Send encrypted email
python send_email.py \
  --to your_other_email@gmail.com \
  --subject "QuMail Test" \
  --body "This message is quantum-encrypted!"

# Terminal 3: Check recipient inbox and decrypt
python recv_email.py --decrypt-all
```

The email will appear in the recipient's Gmail/Outlook inbox as a regular email, but the body will contain encrypted data that can only be decrypted with QuMail.

## 🔧 API Usage

```python
import requests

# Request QKD key
response = requests.post('http://localhost:5001/request_key', json={
    'sender': 'alice@example.com',
    'recipient': 'bob@example.com', 
    'lifetime': 3600
})
key_data = response.json()

# Retrieve key for decryption
response = requests.get(f'http://localhost:5001/get_key/{key_data["key_id"]}')
key_info = response.json()
```

## 🔒 Security Architecture

### Quantum Key Distribution Simulation
- **256-bit cryptographically secure keys** generated per message
- **QKD-inspired API** for key management
- **Key lifecycle management** with automatic expiration
- **Usage logging** for security auditing

### AES-256-GCM Encryption
- **Authenticated encryption** with associated data
- **96-bit nonces** for replay protection  
- **Message integrity** verification
- **Forward secrecy** with ephemeral keys

### Real Email Integration
- **Custom X-QuMail headers** for metadata
- **Real SMTP/IMAP** integration with Gmail, Outlook, etc.
- **Key ID embedding** for automatic decryption
- **Internet email delivery** - sends actual emails

## 📧 Email Headers

QuMail adds these custom headers to encrypted emails:

- `X-QuMail-Encrypted: AES-GCM` - Identifies QuMail encrypted message
- `X-QuMail-Key-ID: qkd_abc123...` - Key ID for decryption
- `X-QuMail-Version: 1.0` - QuMail protocol version
- `X-QuMail-Timestamp: 2024-01-01T12:00:00Z` - Encryption timestamp

## 🛠️ Configuration

### Gmail Setup
1. Enable 2-factor authentication
2. Generate App Password for QuMail
3. Update `config.json` with credentials
4. Make sure IMAP is enabled in Gmail settings

### Outlook Setup  
1. Enable IMAP in Outlook settings
2. Use regular password or App Password
3. Update SMTP/IMAP server settings

## 🧪 Testing

### Test with Two Gmail Accounts

1. Set up sender credentials in `.env`
2. Send encrypted email to second Gmail account
3. Update `.env` with receiver credentials  
4. Run receiver script to decrypt message
5. Verify the original message is recovered

### Verify in Gmail Web Interface

1. Log into recipient Gmail account
2. Find the QuMail encrypted email
3. Observe that subject and headers are visible
4. Note that body contains encrypted payload
5. Confirm only QuMail can decrypt the content

## 🔮 Future Enhancements

- **Real QKD Hardware** integration
- **Post-Quantum Cryptography** (Kyber, Dilithium)
- **Multi-recipient** encryption
- **Key escrow** for enterprise
- **Mobile apps** and desktop GUI
- **Message threading** with conversation keys

## 🚨 Security Considerations

This is a **PROTOTYPE** for demonstration purposes:

- ⚠️ **Simulated QKD**: Uses secure random keys, not real quantum distribution
- ⚠️ **Key Storage**: SQLite database not encrypted at rest  
- ⚠️ **Development Mode**: Flask debug mode enabled
- ⚠️ **No Authentication**: API endpoints not authenticated

For production use, implement:
- Actual QKD hardware integration
- Encrypted key storage (HSM)
- API authentication and rate limiting
- Comprehensive security audit

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! Areas for improvement:
- Real QKD hardware integration
- Enhanced security features  
- Mobile client development
- Performance optimizations

## 📞 Support

**QuMail** demonstrates the future of quantum-secure email communication using real email infrastructure with simulated quantum key distribution.

The prototype successfully encrypts and decrypts emails over the internet, proving the viability of quantum-secure email systems.

---
**QuMail** - Quantum-Secure Email Communication 🔐