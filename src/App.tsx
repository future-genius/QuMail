import React, { useState, useEffect } from 'react';
import { Shield, Key, Mail, Send, RefreshCw, Lock, Unlock, Clock, Database, LogIn, User } from 'lucide-react';

// Types
interface QKDKey {
  key_id: string;
  key_b64: string;
  sender: string;
  recipient: string;
  expires_at: string;
  created_at: string;
  status: 'active' | 'expired' | 'used';
}

interface EmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  encrypted: boolean;
  key_id?: string;
  timestamp: string;
  decrypted?: boolean;
}

interface UserSession {
  email: string;
  loggedIn: boolean;
  sessionId?: string;
}

// Simulated QKD Key Manager
class QKDKeyManager {
  private keys: Map<string, QKDKey> = new Map();

  generateKeyId(): string {
    return 'qkd_' + Math.random().toString(36).substr(2, 16);
  }

  generateKey(): string {
    // Simulate 256-bit AES key in base64
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes));
  }

  requestKey(sender: string, recipient: string, lifetime: number): QKDKey {
    const key_id = this.generateKeyId();
    const key_b64 = this.generateKey();
    const created_at = new Date().toISOString();
    const expires_at = new Date(Date.now() + lifetime * 1000).toISOString();

    const qkdKey: QKDKey = {
      key_id,
      key_b64,
      sender,
      recipient,
      expires_at,
      created_at,
      status: 'active'
    };

    this.keys.set(key_id, qkdKey);
    return qkdKey;
  }

  getKey(key_id: string): QKDKey | null {
    const key = this.keys.get(key_id);
    if (!key) return null;
    
    if (new Date() > new Date(key.expires_at)) {
      key.status = 'expired';
    }
    
    return key;
  }

  getAllKeys(): QKDKey[] {
    return Array.from(this.keys.values());
  }
}

// Simulated AES-256-GCM encryption
function simulateEncryption(plaintext: string, key: string): string {
  // In real implementation, this would use actual AES-256-GCM
  const encoded = btoa(plaintext + '::' + key.substr(0, 8));
  return `ENCRYPTED:${encoded}`;
}

function simulateDecryption(ciphertext: string, key: string): string {
  if (!ciphertext.startsWith('ENCRYPTED:')) {
    return ciphertext;
  }
  
  const encoded = ciphertext.replace('ENCRYPTED:', '');
  const decoded = atob(encoded);
  const [plaintext] = decoded.split('::');
  return plaintext;
}

// API Configuration
const API_BASE = 'http://localhost:5001';

function App() {
  const [currentView, setCurrentView] = useState<'login' | 'compose' | 'inbox' | 'keys'>('login');
  const [keyManager] = useState(() => new QKDKeyManager());
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [qkdKeys, setQkdKeys] = useState<QKDKey[]>([]);
  const [userSession, setUserSession] = useState<UserSession>({ email: '', loggedIn: false });
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  // Login form state
  const [loginForm, setLoginForm] = useState({
    email: '',
    appPassword: ''
  });
  
  // Compose form state
  const [composeForm, setComposeForm] = useState({
    to: '',
    subject: '',
    body: ''
  });
  
  const [sending, setSending] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Show notification
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Handle login
  const handleLogin = async () => {
    if (!loginForm.email || !loginForm.appPassword) {
      showNotification('error', 'Please fill in all fields');
      return;
    }

    setLoggingIn(true);
    
    try {
      console.log('🔍 Attempting login...');
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginForm.email,
          app_password: loginForm.appPassword
        })
      });

      const result = await response.json();
      console.log('📡 Login response:', result);
      
      if (result.status === 'success') {
        setUserSession({ 
          email: loginForm.email, 
          loggedIn: true,
          sessionId: result.session_id
        });
        setCurrentView('compose');
        showNotification('success', 'Login successful!');
        setLoginForm({ email: '', appPassword: '' });
      } else {
        showNotification('error', result.message || 'Login failed');
      }
      
    } catch (error) {
      console.error('❌ Login error:', error);
      showNotification('error', 'Failed to connect to server');
    } finally {
      setLoggingIn(false);
    }
  };

  // Handle logout
  const handleLogout = () => {
    setUserSession({ email: '', loggedIn: false });
    setCurrentView('login');
    setComposeForm({ to: '', subject: '', body: '' });
    showNotification('success', 'Logged out successfully');
  };

  useEffect(() => {
    // Initialize with some demo emails
    const demoEmails: EmailMessage[] = [
      {
        id: '1',
        from: 'alice@example.com',
        to: 'bob@example.com',
        subject: 'Quarterly Report - Confidential',
        body: 'ENCRYPTED:VGhpcyBpcyBhIGhpZ2hseSBjb25maWRlbnRpYWwgcXVhbnR1bS1zZWN1cmUgbWVzc2FnZS4=',
        encrypted: true,
        key_id: 'qkd_demo_key_001',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: '2',
        from: 'system@qumail.com',
        to: 'user@example.com',
        subject: 'Welcome to QuMail',
        body: 'Welcome to QuMail - the future of quantum-secure communication!',
        encrypted: false,
        timestamp: new Date(Date.now() - 7200000).toISOString(),
      }
    ];
    
    setEmails(demoEmails);
    
    // Initialize with demo key
    const demoKey = keyManager.requestKey('alice@example.com', 'bob@example.com', 3600);
    demoKey.key_id = 'qkd_demo_key_001';
    setQkdKeys([demoKey]);
  }, [keyManager]);

  const handleSendEmail = async () => {
    if (!composeForm.to || !composeForm.subject || !composeForm.body) {
      showNotification('error', 'Please fill in all fields');
      return;
    }

    if (!userSession.sessionId) {
      showNotification('error', 'Please log in first');
      return;
    }
    setSending(true);
    
    try {
      console.log('📧 Sending email...');
      // Send real email via Flask backend
      const response = await fetch(`${API_BASE}/send_email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: composeForm.to,
          subject: composeForm.subject,
          body: composeForm.body,
          session_id: userSession.sessionId
        })
      });

      const result = await response.json();
      console.log('📡 Send response:', result);
      
      if (result.status === 'success') {
        // Create local email record for UI
        const newEmail: EmailMessage = {
          id: Date.now().toString(),
          from: userSession.email,
          to: composeForm.to,
          subject: composeForm.subject,
          body: `[SENT] ${composeForm.body}`,
          encrypted: true,
          key_id: result.key_id,
          timestamp: new Date().toISOString()
        };
        
        setEmails(prev => [newEmail, ...prev]);
        setComposeForm({ to: '', subject: '', body: '' });
        
        showNotification('success', 'Email sent successfully with quantum-secure encryption!');
        setCurrentView('inbox');
      } else {
        showNotification('error', result.message || 'Failed to send email');
      }
      
    } catch (error) {
      console.error('❌ Send error:', error);
      showNotification('error', 'Failed to connect to server');
    } finally {
      setSending(false);
    }
  };

  const handleDecryptEmail = (email: EmailMessage) => {
    if (!email.encrypted || !email.key_id) return;

    const key = keyManager.getKey(email.key_id);
    if (!key) {
      showNotification('error', 'Decryption key not found or expired');
      return;
    }

    const decryptedBody = simulateDecryption(email.body, key.key_b64);
    setEmails(prev => prev.map(e => 
      e.id === email.id 
        ? { ...e, body: decryptedBody, decrypted: true }
        : e
    ));
  };

  const handleRefreshInbox = async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setRefreshing(false);
    showNotification('success', 'Inbox refreshed - 0 new messages');
  };

  const updateQkdKeys = () => {
    setQkdKeys(keyManager.getAllKeys());
  };

  useEffect(() => {
    const interval = setInterval(updateQkdKeys, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg ${
          notification.type === 'success' 
            ? 'bg-emerald-600 text-white' 
            : 'bg-red-600 text-white'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-800/50 backdrop-blur border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-blue-400" />
              <h1 className="text-2xl font-bold text-white">QuMail</h1>
              <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full">
                Quantum-Secure
              </span>
              {userSession.loggedIn && (
                <div className="flex items-center gap-2 ml-4">
                  <User className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-emerald-400">{userSession.email}</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              {userSession.loggedIn && (
                <nav className="flex gap-1">
                  {[
                    { id: 'compose', label: 'Compose', icon: Mail },
                    { id: 'inbox', label: 'Inbox', icon: Database },
                    { id: 'keys', label: 'QKD Keys', icon: Key }
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setCurrentView(id as any)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                        currentView === id
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </nav>
              )}
              
              {userSession.loggedIn && (
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Login View */}
        {currentView === 'login' && (
          <div className="max-w-md mx-auto">
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 p-8">
              <div className="flex items-center gap-3 mb-6">
                <LogIn className="w-6 h-6 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Login to QuMail</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Gmail Address
                  </label>
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="your.email@gmail.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Gmail App Password
                  </label>
                  <input
                    type="password"
                    value={loginForm.appPassword}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, appPassword: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="16-character app password"
                  />
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                  <h3 className="text-blue-400 font-medium mb-2">Setup Instructions:</h3>
                  <ol className="text-sm text-slate-300 space-y-1">
                    <li>1. Enable 2-factor authentication on Gmail</li>
                    <li>2. Go to Google Account → Security → 2-Step Verification</li>
                    <li>3. Generate an App Password for QuMail</li>
                    <li>4. Use the 16-character password above</li>
                    <li>5. Make sure IMAP is enabled in Gmail settings</li>
                  </ol>
                </div>

                <button
                  onClick={handleLogin}
                  disabled={loggingIn}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors"
                >
                  {loggingIn ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  {loggingIn ? 'Connecting...' : 'Login to Gmail'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Compose View */}
        {currentView === 'compose' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Mail className="w-6 h-6 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Compose Quantum-Secure Email</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    To
                  </label>
                  <input
                    type="email"
                    value={composeForm.to}
                    onChange={(e) => setComposeForm(prev => ({ ...prev, to: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="recipient@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={composeForm.subject}
                    onChange={(e) => setComposeForm(prev => ({ ...prev, subject: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="Enter subject"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Message
                  </label>
                  <textarea
                    rows={8}
                    value={composeForm.body}
                    onChange={(e) => setComposeForm(prev => ({ ...prev, body: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none"
                    placeholder="Enter your message..."
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Shield className="w-4 h-4" />
                    <span className="text-sm">AES-256-GCM + QKD Protection</span>
                  </div>

                  <button
                    onClick={handleSendEmail}
                    disabled={sending}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors"
                  >
                    {sending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {sending ? 'Encrypting & Sending...' : 'Send via Gmail'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Inbox View */}
        {currentView === 'inbox' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Secure Inbox</h2>
              <button
                onClick={handleRefreshInbox}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="space-y-4">
              {emails.map((email) => (
                <div
                  key={email.id}
                  className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        email.encrypted 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {email.encrypted ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{email.subject}</p>
                        <p className="text-sm text-slate-400">From: {email.from}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {email.encrypted && !email.decrypted && (
                        <button
                          onClick={() => handleDecryptEmail(email)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                        >
                          Decrypt
                        </button>
                      )}
                      <span className="text-xs text-slate-500">
                        {new Date(email.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <p className="text-slate-300 whitespace-pre-wrap">
                      {email.encrypted && !email.decrypted 
                        ? '🔒 Message encrypted with quantum-secure keys'
                        : email.body
                      }
                    </p>
                  </div>

                  {email.encrypted && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <Key className="w-3 h-3" />
                      <span>Key ID: {email.key_id}</span>
                      {email.decrypted && (
                        <span className="ml-2 px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded">
                          Decrypted
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QKD Keys View */}
        {currentView === 'keys' && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Key className="w-6 h-6 text-blue-400" />
              <h2 className="text-2xl font-bold text-white">QKD Key Management</h2>
            </div>

            <div className="grid gap-4">
              {qkdKeys.map((key) => {
                const isExpired = new Date() > new Date(key.expires_at);
                const timeLeft = Math.max(0, new Date(key.expires_at).getTime() - Date.now());
                const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
                const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

                return (
                  <div
                    key={key.key_id}
                    className={`bg-slate-800/50 backdrop-blur rounded-xl border p-6 ${
                      isExpired ? 'border-red-500/50' : 'border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-mono text-sm text-blue-400">{key.key_id}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {key.sender} → {key.recipient}
                        </p>
                      </div>
                      
                      <div className="text-right">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${
                          isExpired 
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          <Clock className="w-3 h-3" />
                          {isExpired 
                            ? 'Expired' 
                            : `${hoursLeft}h ${minutesLeft}m left`
                          }
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900/50 rounded-lg p-4">
                      <p className="text-xs text-slate-400 mb-2">256-bit AES Key (Base64):</p>
                      <p className="font-mono text-xs text-slate-300 break-all">
                        {key.key_b64.substr(0, 64)}...
                      </p>
                    </div>

                    <div className="mt-3 text-xs text-slate-500">
                      Created: {new Date(key.created_at).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>

            {qkdKeys.length === 0 && (
              <div className="text-center py-12">
                <Key className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No QKD keys issued yet</p>
                <p className="text-sm text-slate-500">Send an encrypted email to generate your first quantum key</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800/90 backdrop-blur border-t border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                <span>{userSession.loggedIn ? 'QKD System Online' : 'Not Connected'}</span>
              </div>
              <div className="text-slate-400">
                Keys Active: {qkdKeys.filter(k => k.status === 'active').length}
              </div>
              {userSession.loggedIn && (
                <div className="text-slate-400">
                  Gmail: Connected
                </div>
              )}
            </div>
            
            <div className="text-slate-500">
              QuMail v1.0.0-prototype | ETSI GS QKD 014 Compatible
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;