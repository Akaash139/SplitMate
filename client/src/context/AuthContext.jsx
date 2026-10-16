import { useState, useEffect } from "react";
import { AuthContext } from "./authContextDef";
import { api, tokenStorage, ApiError } from "../services/api";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => tokenStorage.get());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(tokenStorage.get()));
  const [error, setError] = useState(null);

  // Restore user session on initial application load
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      const storedToken = tokenStorage.get();
      if (!storedToken) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const res = await api.auth.getMe();
        if (isMounted && res.success && res.user) {
          setUser(res.user);
          setToken(storedToken);
        } else if (isMounted) {
          tokenStorage.remove();
          setUser(null);
          setToken(null);
        }
      } catch (err) {
        console.warn("Session restoration failed:", err.message);
        if (isMounted) {
          tokenStorage.remove();
          setUser(null);
          setToken(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Login handler
  const login = async (email, password) => {
    try {
      setError(null);
      const res = await api.auth.login({ email, password });
      if (res.success && res.token) {
        tokenStorage.set(res.token);
        setToken(res.token);
        setUser(res.user);
        return { success: true };
      }
      throw new Error(res.error || "Login failed");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to log in";
      setError(msg);
      throw err;
    }
  };

  // Register handler
  const register = async (name, email, password) => {
    try {
      setError(null);
      const res = await api.auth.register({ name, email, password });
      if (res.success && res.token) {
        tokenStorage.set(res.token);
        setToken(res.token);
        setUser(res.user);
        return { success: true };
      }
      throw new Error(res.error || "Registration failed");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to register";
      setError(msg);
      throw err;
    }
  };

  // Google sign-in handler
  const loginWithGoogle = async (credential) => {
    try {
      setError(null);
      const res = await api.auth.googleLogin(credential);
      if (res.success && res.token) {
        tokenStorage.set(res.token);
        setToken(res.token);
        setUser(res.user);
        return { success: true, user: res.user };
      }
      throw new Error(res.error || "Google sign-in failed");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to sign in with Google";
      setError(msg);
      throw err;
    }
  };

  // Logout handler
  const logout = () => {
    tokenStorage.remove();
    setToken(null);
    setUser(null);
    setError(null);
  };

  const clearError = () => setError(null);

  const value = {
    user,
    token,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    register,
    loginWithGoogle,
    logout,
    clearError
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
