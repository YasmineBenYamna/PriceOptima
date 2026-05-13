// src/hooks/useAuth.js
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Redirects to /login if no token is found.
 * Use this at the top of any authenticated page.
 */
export function useRequireAuth() {
  const navigate = useNavigate();
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);
}

/**
 * Returns basic user info stored after login.
 */
export function useCurrentUser() {
  try {
    const raw = localStorage.getItem('currentuser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}