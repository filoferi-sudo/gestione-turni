// Unica variabile d'ambiente per l'URL del backend: deve puntare all'origine pubblica
// dell'API (es. https://tuo-backend.vercel.app), SENZA slash finale e SENZA /api.
// In locale può restare vuota: il proxy di Vite (vedi vite.config.js) inoltra /api a localhost.
const API_URL = import.meta.env.VITE_API_URL || '';
const BASE_URL = `${API_URL}/api`;

if (import.meta.env.PROD && !API_URL) {
  // In produzione un valore mancante fa ricadere le richieste su /api relativo al dominio
  // del frontend, dove non esiste alcun backend: da qui nascono i "network error" silenziosi.
  console.warn(
    '[api] VITE_API_URL non è impostata: le richieste useranno un path relativo che in produzione ' +
      'non raggiunge alcun backend. Imposta VITE_API_URL nelle variabili d\'ambiente del progetto Vercel.'
  );
}

console.log(`[api] Backend configurato su: ${API_URL || '(path relativo, solo dev)'}`);

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${BASE_URL}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    // fetch lancia solo per errori di rete/CORS/DNS, non per risposte 4xx/5xx
    console.error(`[api] Richiesta fallita (rete/CORS): ${method} ${url}`, networkErr);
    throw new Error(
      `Impossibile contattare il backend (${url}). Verifica VITE_API_URL e la configurazione CORS del backend.`
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error(`[api] Risposta di errore: ${method} ${url} → ${res.status}`, data);
    throw new Error(data.error || `Errore del server (${res.status})`);
  }

  return data;
}

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  firstLoginSetup: (newPassword, firstAccessToken) =>
    request('/auth/first-login-setup', { method: 'POST', body: { newPassword }, token: firstAccessToken }),
  me: (token) => request('/auth/me', { token }),
  createUser: (payload, token) => request('/users', { method: 'POST', body: payload, token }),
  listUsers: (token) => request('/users', { token }),
  getCalendar: (token, { start, end, userId }) => {
    const params = new URLSearchParams({ start, end });
    if (userId) params.set('userId', userId);
    return request(`/calendar?${params.toString()}`, { token });
  },
  createShift: (payload, token) => request('/shifts', { method: 'POST', body: payload, token }),
  updateShift: (id, payload, token) => request(`/shifts/${id}`, { method: 'PUT', body: payload, token }),
  deleteShift: (id, token) => request(`/shifts/${id}`, { method: 'DELETE', token }),
  deleteShiftSelf: (id, token) => request(`/shifts/${id}/self`, { method: 'DELETE', token }),
  listAvailableShifts: (token) => request('/shifts/available', { token }),
  claimShift: (id, token) => request(`/shifts/${id}/claim`, { method: 'POST', token }),

  resetPassword: (id, newPassword, token) =>
    request(`/users/${id}/reset-password`, { method: 'POST', body: { newPassword }, token }),
  regenerateCode: (id, token) => request(`/users/${id}/regenerate-code`, { method: 'POST', token }),
  deleteUser: (id, token) => request(`/users/${id}`, { method: 'DELETE', token }),

  listCancellationRequests: (token, status) =>
    request(`/cancellation-requests${status ? `?status=${status}` : ''}`, { token }),
  listMyCancellationRequests: (token) => request('/cancellation-requests/mine', { token }),
  approveCancellationRequest: (id, token) =>
    request(`/cancellation-requests/${id}/approve`, { method: 'POST', token }),
  rejectCancellationRequest: (id, token) =>
    request(`/cancellation-requests/${id}/reject`, { method: 'POST', token }),

  getHoursStats: (token, userId) => request(`/stats/hours${userId ? `?userId=${userId}` : ''}`, { token }),
};
