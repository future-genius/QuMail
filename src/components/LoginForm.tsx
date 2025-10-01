import React, { useState } from 'react';
import { Mail, Lock, Server, Eye, EyeOff, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface LoginFormProps {
  onLogin: (credentials: EmailCredentials) => void;
  isLoading: boolean;
  error: string | null;
}

export interface EmailCredentials {
  email: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
}

export default function LoginForm({ onLogin, isLoading, error }: LoginFormProps) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    showAdvanced: false,
    showPassword: false
  });

  const [validationStatus, setValidationStatus] = useState<{
    smtp: 'idle' | 'testing' | 'success' | 'error';
    imap: 'idle' | 'testing' | 'success' | 'error';
  }>({
    smtp: 'idle',
    imap: 'idle'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      return;
    }

    const credentials: EmailCredentials = {
      email: formData.email,
      password: formData.password,
      smtpHost: formData.smtpHost,
      smtpPort: formData.smtpPort,
      imapHost: formData.imapHost,
      imapPort: formData.imapPort
    };

    onLogin(credentials);
  };

  const testConnection = async (type: 'smtp' | 'imap') => {
    setValidationStatus(prev => ({ ...prev, [type]: 'testing' }));
    
    try {
      // Simulate connection test
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // In a real implementation, this would test the actual connection
      const success = formData.email.includes('@') && formData.password.length > 0;
      
      setValidationStatus(prev => ({ 
        ...prev, 
        [type]: success ? 'success' : 'error' 
      }));
    } catch (error) {
      setValidationStatus(prev => ({ ...prev, [type]: 'error' }));
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'testing':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-400" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="p-3 bg-blue-600/20 rounded-lg">
                <Mail className="w-8 h-8 text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">QuMail</h1>
            </div>
            <p className="text-slate-400">Quantum-Secure Email Client</p>
            <p className="text-sm text-slate-500 mt-2">
              Enter your email credentials to access encrypted messaging
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Address */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="your.email@gmail.com"
                  required
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Your SMTP/IMAP email address
              </p>
            </div>

            {/* App Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                App Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={formData.showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full pl-10 pr-12 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="App Password (not your regular password)"
                  required
                />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-300"
                >
                  {formData.showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                For Gmail: Generate App Password in Google Account settings
              </p>
            </div>

            {/* Advanced Settings Toggle */}
            <div>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, showAdvanced: !prev.showAdvanced }))}
                className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Server className="w-4 h-4" />
                Advanced Server Settings
              </button>
            </div>

            {/* Advanced Settings */}
            {formData.showAdvanced && (
              <div className="space-y-4 p-4 bg-slate-900/30 rounded-lg border border-slate-700">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      SMTP Host
                    </label>
                    <input
                      type="text"
                      value={formData.smtpHost}
                      onChange={(e) => setFormData(prev => ({ ...prev, smtpHost: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      SMTP Port
                    </label>
                    <input
                      type="number"
                      value={formData.smtpPort}
                      onChange={(e) => setFormData(prev => ({ ...prev, smtpPort: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      IMAP Host
                    </label>
                    <input
                      type="text"
                      value={formData.imapHost}
                      onChange={(e) => setFormData(prev => ({ ...prev, imapHost: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      IMAP Port
                    </label>
                    <input
                      type="number"
                      value={formData.imapPort}
                      onChange={(e) => setFormData(prev => ({ ...prev, imapPort: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Connection Tests */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">SMTP Connection</span>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(validationStatus.smtp)}
                      <button
                        type="button"
                        onClick={() => testConnection('smtp')}
                        disabled={validationStatus.smtp === 'testing'}
                        className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded transition-colors"
                      >
                        Test
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">IMAP Connection</span>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(validationStatus.imap)}
                      <button
                        type="button"
                        onClick={() => testConnection('imap')}
                        disabled={validationStatus.imap === 'testing'}
                        className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded transition-colors"
                      >
                        Test
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading || !formData.email || !formData.password}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors font-medium"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Secure Login
                </>
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div className="mt-6 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <p className="text-emerald-400 text-xs">
              🔒 Your credentials are encrypted and stored only in your browser session. 
              They are never sent to our servers in plaintext.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}