# QuMail - Quantum-Secure Email Client

A working prototype of quantum-secure email communication using simulated Quantum Key Distribution (QKD) and AES-256-GCM encryption.

## 🔐 Features

### ✅ Working Components

- **React Frontend** - Modern web interface with real-time status
- **Flask Backend** - QKD Key Manager with SQLite database
- **Quantum Key Distribution** - Simulated QKD with cryptographically secure keys
- **AES-256-GCM Encryption** - Military-grade encryption with authenticated data
- **Session Management** - Secure user authentication and session handling
- **Real-time Key Management** - View active/expired quantum keys
- **Email Encryption/Decryption** - Complete email workflow with quantum security

## 🚀 Quick Start

### Prerequisites

- **Python 3.8+** with pip
- **Node.js 18+** with npm
- Modern web browser

### 1. Install Dependencies

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies
npm install
```

### 2. Start the Application

```bash
# Start both backend and frontend
npm run dev:all
```

Or start them separately:

```bash
# Terminal 1: Start Flask backend
python backend/app.py

# Terminal 2: Start React frontend
npm run dev
```

### 3. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5001

## 📧 How to Use

### 1. Login
- Open http://localhost:5173
- Enter any email address and password (demo mode)
- Click "Secure Login"

### 2. Send Encrypted Email
- Click "Compose" tab
- Fill in recipient, subject, and message
- Click "Send Encrypted" - this will:
  - Generate a quantum-secure key via QKD
  - Encrypt your message with AES-256-GCM
  - Store the encrypted email

### 3. View and Decrypt Emails
- Click "Inbox" tab
- See all your encrypted emails
- Click "Decrypt" to reveal the original message

### 4. Manage Quantum Keys
- Click "Keys" tab
- View all generated QKD keys
- See key expiration times and status

## 🔧 API Endpoints

The Flask backend provides these REST API endpoints:

- `GET /health` - Health check
- `POST /api/login` - User authentication
- `POST /api/logout` - End user session
- `POST /api/request-qkd-key` - Generate quantum key
- `POST /api/send-email` - Send encrypted email
- `GET /api/emails` - Retrieve user emails
- `POST /api/decrypt-email` - Decrypt email message
- `GET /api/keys` - Get user's quantum keys

## 🔒 Security Architecture

### Quantum Key Distribution Simulation
- **256-bit cryptographically secure keys** generated per message
- **Unique key IDs** for tracking and retrieval
- **Automatic key expiration** (24 hours default)
- **Usage logging** for security auditing

### AES-256-GCM Encryption
- **Authenticated encryption** with associated data (AEAD)
- **96-bit nonces** for replay protection
- **Message integrity** verification
- **Forward secrecy** with ephemeral keys

### Session Management
- **Secure session tokens** for user authentication
- **Session expiration** (24 hours default)
- **CORS protection** for cross-origin requests

## 🛠️ Development

### Project Structure

```
qumail/
├── backend/
│   ├── app.py              # Flask server with QKD manager
│   └── qkd_keys.db         # SQLite database (auto-created)
├── src/
│   ├── App.tsx             # React frontend
│   ├── main.tsx            # React entry point
│   └── index.css           # Tailwind CSS
├── package.json            # Node.js dependencies
├── requirements.txt        # Python dependencies
├── vite.config.ts          # Vite configuration
└── README.md               # This file
```

### Available Scripts

```bash
# Development
npm run dev              # Start frontend only
npm run backend          # Start backend only
npm run dev:all          # Start both frontend and backend

# Production
npm run build            # Build for production
npm run preview          # Preview production build

# Testing
python test_backend.py   # Test backend endpoints
```

### Database Schema

The SQLite database includes these tables:

- **qkd_keys** - Quantum keys with metadata
- **sessions** - User authentication sessions
- **emails** - Encrypted email messages
- **usage_log** - Security audit trail

## 🧪 Testing

### Backend Testing

```bash
# Test all backend endpoints
python test_backend.py
```

### Manual Testing Workflow

1. **Login Test**: Try logging in with different email addresses
2. **Key Generation**: Send an email and verify QKD key creation
3. **Encryption Test**: Compose and send encrypted messages
4. **Decryption Test**: Decrypt received messages
5. **Key Management**: Check key expiration and status

## 🔮 Future Enhancements

- **Real QKD Hardware** integration with quantum devices
- **Post-Quantum Cryptography** (Kyber, Dilithium algorithms)
- **Multi-recipient** encryption for group messages
- **Real SMTP/IMAP** integration for actual email delivery
- **Mobile applications** for iOS and Android
- **Key escrow** and enterprise features
- **Message threading** with conversation keys

## 🚨 Security Considerations

This is a **PROTOTYPE** for demonstration purposes:

- ⚠️ **Simulated QKD**: Uses secure random keys, not real quantum distribution
- ⚠️ **Local Storage**: SQLite database not encrypted at rest
- ⚠️ **Development Mode**: Flask debug mode enabled
- ⚠️ **No Authentication**: Simple demo authentication system

For production use, implement:
- Actual QKD hardware integration
- Encrypted key storage (HSM/TPM)
- Strong user authentication (OAuth, 2FA)
- Rate limiting and DDoS protection
- Comprehensive security audit

## 🛡️ Compliance

QuMail demonstrates concepts relevant to:

- **NIST Post-Quantum Cryptography** standards
- **Quantum-safe communications** protocols
- **End-to-end encryption** best practices
- **Forward secrecy** implementation

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! Areas for improvement:

- Real quantum hardware integration
- Enhanced security features
- Performance optimizations
- Mobile client development
- Documentation improvements

## 📞 Support

For questions or issues:

1. Check the console logs for error messages
2. Verify both frontend and backend are running
3. Test backend health at http://localhost:5001/health
4. Review the browser network tab for API errors

## 🎯 Technical Specifications

- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Backend**: Python Flask + SQLite + Cryptography
- **Encryption**: AES-256-GCM with 256-bit keys
- **Key Management**: Simulated QKD with secure random generation
- **Transport**: HTTP/JSON API with CORS support
- **Database**: SQLite with relational schema

---

**QuMail** - Demonstrating the future of quantum-secure email communication 🔐

*Built with modern web technologies and cryptographic best practices*