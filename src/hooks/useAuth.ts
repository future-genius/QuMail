import { useState, useEffect } from 'react';
import { EmailCredentials } from '../components/LoginForm';

interface AuthState {
  isAuthenticated: boolean;
  credentials: EmailCredentials | null;
  isLoading: boolean;
  error: string | null;
}

// Encryption utilities for secure storage
const STORAGE_KEY = 'qumail_session';
const ENCRYPTION_KEY = 'qumail_secure_key_v1';

function encryptCredentials(credentials: EmailCredentials): string {
  // In a real implementation, use proper encryption
  // For demo purposes, we'll use base64 encoding with a simple transformation
  const jsonString = JSON.stringify(credentials);
  const encoded = btoa(jsonString);
  return encoded;
}

function decryptCredentials(encryptedData: string): EmailCredentials | null {
  try {
    const decoded = atob(encryptedData);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    credentials: null,
    isLoading: false,
    error: null
  });

  // Check for existing session on mount
  useEffect(() => {
    const storedSession = sessionStorage.getItem(STORAGE_KEY);
    if (storedSession) {
      const credentials = decryptCredentials(storedSession);
      if (credentials) {
        setAuthState({
          isAuthenticated: true,
          credentials,
          isLoading: false,
          error: null
        });
      }
    }
  }, []);

  const login = async (credentials: EmailCredentials): Promise<boolean> => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Validate credentials by testing connections
      const isValid = await validateCredentials(credentials);
      
      if (isValid) {
        // Encrypt and store in session storage
        const encryptedCredentials = encryptCredentials(credentials);
        sessionStorage.setItem(STORAGE_KEY, encryptedCredentials);
        
        setAuthState({
          isAuthenticated: true,
          credentials,
          isLoading: false,
          error: null
        });
        
        return true;
      } else {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Invalid email credentials. Please check your email and app password.'
        }));
        return false;
      }
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Connection failed. Please check your server settings and try again.'
      }));
      return false;
    }
  };

  const logout = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setAuthState({
      isAuthenticated: false,
      credentials: null,
      isLoading: false,
      error: null
    });
  };

  const clearError = () => {
    setAuthState(prev => ({ ...prev, error: null }));
  };

  return {
    ...authState,
    login,
    logout,
    clearError
  };
}

// Simulate credential validation
async function validateCredentials(credentials: EmailCredentials): Promise<boolean> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Basic validation - in real implementation, test actual SMTP/IMAP connections
  const emailValid = credentials.email.includes('@') && credentials.email.includes('.');
  const passwordValid = credentials.password.length >= 8;
  const hostsValid = credentials.smtpHost.length > 0 && credentials.imapHost.length > 0;
  
  // Simulate some failures for demo
  if (credentials.email.includes('invalid') || credentials.password === 'wrong') {
    return false;
  }
  
  return emailValid && passwordValid && hostsValid;
}