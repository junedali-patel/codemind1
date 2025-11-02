import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  displayName: string;
  email: string;
  photoURL: string;
  accessToken?: string;
}

interface AuthContextType {
  user: User | null;
  signInWithGitHub: () => Promise<void>;
  signOut: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const signInWithGitHub = async () => {
    try {
      // Simulate GitHub OAuth flow
      // In real implementation, this would use Firebase Auth or GitHub OAuth
      const mockUser: User = {
        id: '123',
        displayName: 'John Doe',
        email: 'john@example.com',
        photoURL: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?w=100&h=100&fit=crop&crop=face',
        accessToken: 'mock-access-token'
      };
      
      setUser(mockUser);
      localStorage.setItem('user', JSON.stringify(mockUser));
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, signInWithGitHub, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
};