import React, { useState, useEffect } from 'react';
import { Shield, Mail, Key, User, LogOut, Send, RefreshCw, Lock, Clock, Eye, EyeOff } from 'lucide-react';

// Types
interface User {
  email: string;
}

interface Session {
  id: string;
  user: User;
}

interface QKDKey {
  key_id: string;
  sender: string;
  recipient: string;
  created_at: string;
  expires_at: string;
  status: 'active' | 'expired';
  algorithm: string;
}

interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  created_at: string;
  key_id: string;
  status: string;
}

interface Notification {
  type: 'success' | 'error' | 'info';
  message: string;
}

function App() {
  const [currentView, setCurrentView] = useState<'login' | 'compose' | 'inbox' | 'keys'>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Login form
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
    showPassword: false
  });
  
  // Compose form
  const [composeForm, setComposeForm] = useState({
    to: '',
    subject: '',
    body: ''
  });
  
  // Data
  const [emails, setEmails] = useState<Email[]>([]);
  const [keys, setKeys] = useState<QKDKey[]>([]);
  const [decryptedBodies, setDecryptedBodies] = useState<Record<string, string>>({});

  // Show notification
  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // API calls
  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    const url = `http://localhost:5001${endpoint}`;
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };
    
    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };
    
    try {
      console.log(`🌐 API Call: ${config.method || 'GET'} ${url}`);
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`✅ API Response:`, data);
      return data;
    } catch (error) {
      console.error(`❌ API Error:`, error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to QuMail backend. Please ensure the Python Flask server is running on port 5001.');
      }
      throw error;
    }
  };

  // Login
  const handleLogin = async () => {
    if (!loginForm.email || !loginForm.password) {
      showNotification('error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const result = await apiCall('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password
        })
      });

      if (result.success) {
        setSession({
          id: result.session_id,
          user: result.user
        });
        
        setCurrentView('compose');
        showNotification('success', 'Login successful!');
        setLoginForm({ email: '', password: '', showPassword: false });
      } else {
        showNotification('error', result.message || 'Login failed');
      }
      
    } catch (error) {
      showNotification('error', error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      if (session) {
        await apiCall('/api/logout', {
          method: 'POST',
          body: JSON.stringify({ session_id: session.id })
        });
      }
      
      setSession(null);
      setCurrentView('login');
      setEmails([]);
      setKeys([]);
      setDecryptedBodies({});
      showNotification('success', 'Logged out successfully');
      
    } catch (error) {
      console.error('Logout error:', error);
      setSession(null);
      setCurrentView('login');
    }
  };

  // Send email
  const handleSendEmail = async () => {
    if (!composeForm.to || !composeForm.subject || !composeForm.body) {
      showNotification('error', 'Please fill in all fields');
      return;
    }

    if (!session) {
      showNotification('error', 'Please log in first');
      return;
    }

    setLoading(true);
    try {
      // First, request a QKD key for encryption
      const qkdKeyResponse = await apiCall('/api/request-qkd-key', {
        method: 'POST',
        body: JSON.stringify({
          sender: session.user.email,
          recipient: composeForm.to,
          session_id: session.id
        })
      });

      if (!qkdKeyResponse.success) {
        throw new Error(`QKD key request failed: ${qkdKeyResponse.message}`);
      }

      showNotification('success', `QKD key generated: ${qkdKeyResponse.key_id}`);

      // Now send the email with the generated key
      const emailResponse = await apiCall('/api/send-email', {
        method: 'POST',
        body: JSON.stringify({
          to: composeForm.to,
          subject: composeForm.subject,
          body: composeForm.body,
          session_id: session.id,
          key_id: qkdKeyResponse.key_id
        })
      });

      if (emailResponse.success) {
        setComposeForm({ to: '', subject: '', body: '' });
        showNotification('success', 'Email sent with quantum encryption!');
        setCurrentView('inbox');
        loadEmails();
        loadKeys();
      } else {
        throw new Error(emailResponse.message || 'Failed to send email');
      }
      
    } catch (error) {
      console.error('Send email error:', error);
      showNotification('error', `Failed to send encrypted email: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Load emails
  const loadEmails = async () => {
    if (!session) return;

    try {
      const result = await apiCall(`/api/emails?session_id=${session.id}`);
      if (result.success) {
        setEmails(result.emails);
      }
    } catch (error) {
      showNotification('error', 'Failed to load emails');
    }
  };

  // Load keys
  const loadKeys = async () => {
    if (!session) return;

    try {
      const result = await apiCall(`/api/keys?session_id=${session.id}`);
      if (result.success) {
        setKeys(result.keys);
      }
    } catch (error) {
      showNotification('error', 'Failed to load keys');
    }
  };

  // Decrypt email
  const handleDecryptEmail = async (emailId: string) => {
    if (!session) return;

    try {
      const result = await apiCall('/api/decrypt-email', {
        method: 'POST',
        body: JSON.stringify({
          email_id: emailId,
          session_id: session.id
        })
      });

      if (result.success) {
        setDecryptedBodies(prev => ({
          ...prev,
          [emailId]: result.decrypted_body
        }));
        
        showNotification('success', 'Email decrypted successfully!');
      } else {
        throw new Error(result.message || 'Failed to decrypt email');
      }
      
    } catch (error) {
      showNotification('error', error.message || 'Failed to decrypt email');
    }
  };

  // Load data when view changes
  useEffect(() => {
    if (session) {
      if (currentView === 'inbox') {
        loadEmails();
      } else if (currentView === 'keys') {
        loadKeys();
      }
    }
  }, [currentView, session]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg ${
          notification.type === 'success' 
            ? 'bg-emerald-600 text-white' 
            : notification.type === 'error'
            ? 'bg-red-600 text-white'
            : 'bg-blue-600 text-white'
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
              {session && (
                <div className="flex items-center gap-2 ml-4">
                  <User className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-emerald-400">{session.user.email}</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              {session && (
                <nav className="flex gap-1">
                  {[
                    { id: 'compose', label: 'Compose', icon: Mail },
                    { id: 'inbox', label: 'Inbox', icon: RefreshCw },
                    { id: 'keys', label: 'Keys', icon: Key }
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
              
              {session && (
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
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
              <div className="text-center mb-8">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div className="p-3 bg-blue-600/20 rounded-lg">
                    <Shield className="w-8 h-8 text-blue-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">Login to QuMail</h2>
                </div>
                <p className="text-slate-400">Quantum-secure email communication</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="your.email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={loginForm.showPassword ? 'text' : 'password'}
                      value={loginForm.password}
                      onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full px-4 py-3 pr-12 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setLoginForm(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-300"
                    >
                      {loginForm.showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Shield className="w-4 h-4" />
                  )}
                  {loading ? 'Logging in...' : 'Secure Login'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Compose View */}
        {currentView === 'compose' && session && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Mail className="w-6 h-6 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Compose Quantum-Secure Email</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">To</label>
                  <input
                    type="email"
                    value={composeForm.to}
                    onChange={(e) => setComposeForm(prev => ({ ...prev, to: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="recipient@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Subject</label>
                  <input
                    type="text"
                    value={composeForm.subject}
                    onChange={(e) => setComposeForm(prev => ({ ...prev, subject: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="Enter subject"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Message</label>
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
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {loading ? 'Sending...' : 'Send Encrypted'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Inbox View */}
        {currentView === 'inbox' && session && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Secure Inbox</h2>
              <button
                onClick={loadEmails}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
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
                      <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-white">{email.subject}</p>
                        <p className="text-sm text-slate-400">
                          {email.from === session.user.email ? `To: ${email.to}` : `From: ${email.from}`}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {!decryptedBodies[email.id] && (
                        <button
                          onClick={() => handleDecryptEmail(email.id)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                        >
                          Decrypt
                        </button>
                      )}
                      <span className="text-xs text-slate-500">
                        {new Date(email.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <p className="text-slate-300 whitespace-pre-wrap">
                      {decryptedBodies[email.id] || '🔒 Message encrypted with quantum-secure keys'}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <Key className="w-3 h-3" />
                    <span>Key ID: {email.key_id}</span>
                    {decryptedBodies[email.id] && (
                      <span className="ml-2 px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded">
                        Decrypted
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {emails.length === 0 && (
                <div className="text-center py-12">
                  <Mail className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No emails yet</p>
                  <p className="text-sm text-slate-500">Send your first quantum-secure message</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Keys View */}
        {currentView === 'keys' && session && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Key className="w-6 h-6 text-blue-400" />
              <h2 className="text-2xl font-bold text-white">QKD Key Management</h2>
            </div>

            <div className="grid gap-4">
              {keys.map((key) => {
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
                      <p className="text-xs text-slate-400 mb-2">Algorithm: {key.algorithm}</p>
                      <p className="text-xs text-slate-500">
                        Created: {new Date(key.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}

              {keys.length === 0 && (
                <div className="text-center py-12">
                  <Key className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No QKD keys issued yet</p>
                  <p className="text-sm text-slate-500">Send an encrypted email to generate your first quantum key</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800/90 backdrop-blur border-t border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <span>Backend Connected</span>
              </div>
              {session && (
                <div className="text-slate-400">
                  Keys Active: {keys.filter(k => k.status === 'active').length}
                </div>
              )}
            </div>
            
            <div className="text-slate-500">
              QuMail v1.0.0 | Quantum-Secure Email
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;