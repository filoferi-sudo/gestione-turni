const BASE_URL = '/api';

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Errore di rete');
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
