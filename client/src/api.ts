import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

const TOKEN_KEY = "cafepos.token";
const USER_KEY = "cafepos.user";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: "ADMIN" | "CASHIER";
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}
export function setSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Attach the bearer token to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Bounce to login on 401.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      clearSession();
      if (location.pathname !== "/login") location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ── Domain types (mirror the server) ────────────────────────────────────────
export interface Product {
  id: string;
  name: string;
  kind: "READYMADE" | "PREPARED";
  price: number;
  stock: number | null;
  lowStockAt: number;
  emoji: string;
  color: string;
  categoryId: string;
}
export interface Category {
  id: string;
  name: string;
  emoji: string;
  products: Product[];
}
