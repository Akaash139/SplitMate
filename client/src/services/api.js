/**
 * SplitMate API Client
 * Centralized fetch wrapper handling JWT authentication, base URLs, and error normalization.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const TOKEN_KEY = "splitmate_token";

export const tokenStorage = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      console.error("Failed to persist auth token in localStorage", e);
    }
  },
  remove: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      console.error("Failed to remove auth token from localStorage", e);
    }
  }
};

export class ApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = tokenStorage.get();

  const isBlob = options.responseType === "blob";
  const headers = {
    Accept: isBlob ? "text/csv, application/json, */*" : "application/json",
    ...options.headers
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  try {
    const res = await fetch(url, { ...options, headers });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const errorMessage = data?.error || data?.message || `Request failed with status ${res.status}`;
      throw new ApiError(errorMessage, res.status, data);
    }

    if (isBlob) {
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      let filename = null;
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename=["']?([^"']+)["']?/);
        if (match && match[1]) filename = match[1];
      }
      return { blob, filename };
    }

    const data = await res.json().catch(() => null);
    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Network errors or offline mode
    throw new ApiError(error.message || "Network error. Please check your connection.", 0);
  }
}

export const api = {
  auth: {
    register: (userData) => request("/api/v1/auth/register", { method: "POST", body: userData }),
    login: (credentials) => request("/api/v1/auth/login", { method: "POST", body: credentials }),
    googleLogin: (credential) => request("/api/v1/auth/google", { method: "POST", body: { credential } }),
    getMe: () => request("/api/v1/auth/me", { method: "GET" }),
    updateProfile: (data) => request("/api/v1/auth/profile", { method: "PUT", body: data }),
    changePassword: (data) => request("/api/v1/auth/password", { method: "PUT", body: data })
  },
  groups: {
    list: () => request("/api/v1/groups", { method: "GET" }),
    create: (data) => request("/api/v1/groups", { method: "POST", body: data }),
    getById: (id) => request(`/api/v1/groups/${id}`, { method: "GET" }),
    update: (id, data) => request(`/api/v1/groups/${id}`, { method: "PUT", body: data }),
    delete: (id) => request(`/api/v1/groups/${id}`, { method: "DELETE" }),
    regenerateInvite: (id) => request(`/api/v1/groups/${id}/invite/regenerate`, { method: "POST" }),
    revokeInvite: (id) => request(`/api/v1/groups/${id}/invite/revoke`, { method: "POST" }),
    getInvitePreview: (code) => request(`/api/v1/groups/invite/${code}`, { method: "GET" }),
    joinByCode: (code) => request(`/api/v1/groups/join/${code}`, { method: "POST" }),
    getBalances: (groupId) => request(`/api/v1/groups/${groupId}/balances`, { method: "GET" }),
    getSettlementSuggestions: (groupId) => request(`/api/v1/groups/${groupId}/settlement-suggestions`, { method: "GET" })
  },
  balances: {
    getGroupBalances: (groupId) => request(`/api/v1/groups/${groupId}/balances`, { method: "GET" }),
    getGroupSettlementSuggestions: (groupId) => request(`/api/v1/groups/${groupId}/settlement-suggestions`, { method: "GET" })
  },
  expenses: {
    list: (groupId) => request(`/api/v1/groups/${groupId}/expenses`, { method: "GET" }),
    create: (groupId, data) => request(`/api/v1/groups/${groupId}/expenses`, { method: "POST", body: data }),
    getById: (groupId, expenseId) => request(`/api/v1/groups/${groupId}/expenses/${expenseId}`, { method: "GET" }),
    update: (groupId, expenseId, data) => request(`/api/v1/groups/${groupId}/expenses/${expenseId}`, { method: "PUT", body: data }),
    delete: (groupId, expenseId) => request(`/api/v1/groups/${groupId}/expenses/${expenseId}`, { method: "DELETE" }),
    exportCsv: (groupId, params = {}) => {
      const query = new URLSearchParams(params).toString();
      const endpoint =
        groupId && groupId !== "all"
          ? `/api/v1/groups/${groupId}/expenses/export${query ? `?${query}` : ""}`
          : `/api/v1/groups/expenses/export${query ? `?${query}` : ""}`;
      return request(endpoint, { method: "GET", responseType: "blob" });
    }
  },
  settlements: {
    list: (groupId) => request(`/api/v1/groups/${groupId}/settlements`, { method: "GET" }),
    record: (groupId, data) => request(`/api/v1/groups/${groupId}/settlements`, { method: "POST", body: data }),
    exportCsv: (groupId, params = {}) => {
      const query = new URLSearchParams(params).toString();
      const endpoint =
        groupId && groupId !== "all"
          ? `/api/v1/groups/${groupId}/settlements/export${query ? `?${query}` : ""}`
          : `/api/v1/groups/settlements/export${query ? `?${query}` : ""}`;
      return request(endpoint, { method: "GET", responseType: "blob" });
    }
  },
  analytics: {
    getGroupAnalytics: (groupId, params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/api/v1/groups/${groupId}/analytics${query ? `?${query}` : ""}`, { method: "GET" });
    },
    getGroupCategories: (groupId, params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/api/v1/groups/${groupId}/analytics/categories${query ? `?${query}` : ""}`, { method: "GET" });
    },
    getUserAnalytics: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/api/v1/groups/analytics${query ? `?${query}` : ""}`, { method: "GET" });
    }
  }
};
