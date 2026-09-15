// Cloud backend client — strictly opt-in.
// When NEXT_PUBLIC_API_URL (or a locally saved override) is set, the app
// logs in against the Express/Postgres backend for employees + payroll.
// When unset, everything stays in offline-first localStorage as before.
export const API_TOKEN_KEY = "roost_api_token";
export const API_USER_KEY = "roost_api_user";
export const API_BASE_OVERRIDE_KEY = "roost_api_base";

export function getApiBase() {
  if (typeof window === "undefined") return "";
  return process.env.NEXT_PUBLIC_API_URL || localStorage.getItem(API_BASE_OVERRIDE_KEY) || "";
}
export function setApiBaseOverride(url) {
  if (typeof window === "undefined") return;
  if (url) localStorage.setItem(API_BASE_OVERRIDE_KEY, url);
  else localStorage.removeItem(API_BASE_OVERRIDE_KEY);
}
export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(API_TOKEN_KEY);
}
export function setSession(token, user) {
  if (typeof window === "undefined") return;
  localStorage.setItem(API_TOKEN_KEY, token);
  localStorage.setItem(API_USER_KEY, JSON.stringify(user || null));
}
export function getSessionUser() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(API_USER_KEY) || "null"); }
  catch { return null; }
}
export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(API_TOKEN_KEY);
  localStorage.removeItem(API_USER_KEY);
}

export async function api(path, { method = "GET", body } = {}) {
  const base = getApiBase();
  if (!base) throw new Error("Cloud backend not configured");
  const token = getToken();
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    const msg = data?.error
      ? (typeof data.error === "string" ? data.error : "Request failed")
      : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export const AuthAPI = {
  signup: (payload) => api("/api/auth/signup", { method: "POST", body: payload }),
  login: (payload) => api("/api/auth/login", { method: "POST", body: payload }),
  inviteEmployee: (payload) => api("/api/auth/invite-employee", { method: "POST", body: payload }),
  acceptInvite: (payload) => api("/api/auth/accept-invite", { method: "POST", body: payload }),
};

export const EmployeesAPI = {
  list: () => api("/api/employees"),
  create: (payload) => api("/api/employees", { method: "POST", body: payload }),
  update: (id, patch) => api(`/api/employees/${id}`, { method: "PATCH", body: patch }),
  remove: (id) => api(`/api/employees/${id}`, { method: "DELETE" }),
};

export const PayrollAPI = {
  list: () => api("/api/payroll"),
  run: () => api("/api/payroll/run", { method: "POST" }),
};
