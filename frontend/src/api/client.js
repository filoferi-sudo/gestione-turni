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
    const err = new Error(data.error || `Errore del server (${res.status})`);
    // Alcuni endpoint (es. conflitti di fabbisogno duplicato) restituiscono campi aggiuntivi nel
    // corpo dell'errore (es. `conflict`, `conflictingRequirement`): copiati sull'oggetto Error
    // così i chiamanti possono leggerli senza ri-parsare la risposta.
    Object.assign(err, data);
    err.status = res.status;
    throw err;
  }

  return data;
}

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  firstLoginSetup: (newPassword, firstAccessToken) =>
    request('/auth/first-login-setup', { method: 'POST', body: { newPassword }, token: firstAccessToken }),
  me: (token) => request('/auth/me', { token }),
  passwordPolicy: () => request('/auth/password-policy'),
  // Verifica e cambio email (Fase E2). verifyEmail è pubblico (il token è la prova, nessuna sessione).
  sendVerificationEmail: (token) => request('/auth/send-verification', { method: 'POST', token }),
  verifyEmail: (verifyToken) => request('/auth/verify-email', { method: 'POST', body: { token: verifyToken } }),
  changeEmail: (email, token) => request('/auth/change-email', { method: 'POST', body: { email }, token }),
  // Email Actions (Fase E5): describe (GET, non muta) + execute (POST, consuma il token). Pubblici.
  describeEmailAction: (actionToken) => request(`/email-actions/${actionToken}`),
  executeEmailAction: (actionToken) => request(`/email-actions/${actionToken}`, { method: 'POST' }),
  // Demo Framework: stato pubblico (bottone "Prova la demo"), ingresso per persona, reset ambiente.
  demoStatus: () => request('/demo/status'),
  demoLogin: (persona, scenarioId = 'ristorante') =>
    request('/demo/login', { method: 'POST', body: { persona, scenarioId } }),
  demoReset: (persona, token) => request('/demo/reset', { method: 'POST', body: { persona }, token }),
  demoTourAction: (name, token) => request(`/demo/tour/actions/${name}`, { method: 'POST', token }),
  demoTourCheck: (name, token) => request(`/demo/tour/checks/${name}`, { token }),
  createUser: (payload, token) => request('/users', { method: 'POST', body: payload, token }),
  listUsers: (token) => request('/users', { token }),
  getCalendar: (token, { start, end, areaId, userId }) => {
    const params = new URLSearchParams({ start, end, areaId });
    if (userId) params.set('userId', userId);
    return request(`/calendar?${params.toString()}`, { token });
  },
  createShift: (payload, token) => request('/shifts', { method: 'POST', body: payload, token }),
  updateShift: (id, payload, token) => request(`/shifts/${id}`, { method: 'PUT', body: payload, token }),
  deleteShift: (id, token) => request(`/shifts/${id}`, { method: 'DELETE', token }),
  deleteShiftSelf: (id, token, date) =>
    request(`/shifts/${id}/self`, { method: 'DELETE', token, body: date ? { date } : undefined }),
  listAvailableShifts: (token, areaId) => request(`/shifts/available?areaId=${areaId}`, { token }),
  claimShift: (id, token) => request(`/shifts/${id}/claim`, { method: 'POST', token }),
  getShiftCandidates: (id, token) => request(`/shifts/${id}/candidates`, { token }),
  // Proposte mirate (Fase 5)
  createProposals: (shiftId, userIds, token) =>
    request(`/shifts/${shiftId}/proposals`, { method: 'POST', body: { userIds }, token }),
  listShiftProposals: (shiftId, token) => request(`/shifts/${shiftId}/proposals`, { token }),
  listMyProposals: (token) => request('/proposals/mine', { token }),
  acceptProposal: (id, token) => request(`/proposals/${id}/accept`, { method: 'POST', token }),
  declineProposal: (id, token) => request(`/proposals/${id}/decline`, { method: 'POST', token }),

  resetPassword: (id, newPassword, token) =>
    request(`/users/${id}/reset-password`, { method: 'POST', body: { newPassword }, token }),
  regenerateCode: (id, token) => request(`/users/${id}/regenerate-code`, { method: 'POST', token }),
  updateUserAreas: (id, areaIds, token) => request(`/users/${id}/areas`, { method: 'PUT', body: { areaIds }, token }),
  getUserContract: (id, token) => request(`/users/${id}/contract`, { token }),
  saveUserContract: (id, payload, token) => request(`/users/${id}/contract`, { method: 'PUT', body: payload, token }),
  getUserAvailability: (id, token) => request(`/users/${id}/availability`, { token }),
  saveUserAvailability: (id, slots, token) =>
    request(`/users/${id}/availability`, { method: 'PUT', body: { slots }, token }),
  // Opt-out "Non partecipare" (Fase 6)
  getUserOptOuts: (id, token) => request(`/users/${id}/optouts`, { token }),
  addUserOptOut: (id, payload, token) =>
    request(`/users/${id}/optouts`, { method: 'POST', body: payload, token }),
  deleteUserOptOut: (id, optoutId, token) =>
    request(`/users/${id}/optouts/${optoutId}`, { method: 'DELETE', token }),
  deleteUser: (id, token) => request(`/users/${id}`, { method: 'DELETE', token }),

  listCancellationRequests: (token, status) =>
    request(`/cancellation-requests${status ? `?status=${status}` : ''}`, { token }),
  listMyCancellationRequests: (token) => request('/cancellation-requests/mine', { token }),
  approveCancellationRequest: (id, token) =>
    request(`/cancellation-requests/${id}/approve`, { method: 'POST', token }),
  rejectCancellationRequest: (id, token) =>
    request(`/cancellation-requests/${id}/reject`, { method: 'POST', token }),

  getHoursStats: (token, userId) => request(`/stats/hours${userId ? `?userId=${userId}` : ''}`, { token }),

  // Report operativo del personale (sezione Report). overview = vista generale (manager),
  // detail = scheda dipendente + confronto periodi (manager o il dipendente stesso).
  getReportOverview: (token, { start, end, areaId, sedeId, userId } = {}) => {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    if (areaId) params.set('areaId', areaId);
    if (sedeId) params.set('sedeId', sedeId);
    if (userId) params.set('userId', userId);
    const qs = params.toString();
    return request(`/reports/employees${qs ? `?${qs}` : ''}`, { token });
  },
  getEmployeeReport: (token, id, { start, end } = {}) => {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const qs = params.toString();
    return request(`/reports/employees/${id}${qs ? `?${qs}` : ''}`, { token });
  },

  // Impostazioni della propria società (Fase 7, solo Dirigente)
  getCompanySettings: (token) => request('/company/settings', { token }),
  saveCompanySettings: (payload, token) => request('/company/settings', { method: 'PUT', body: payload, token }),

  listNotifications: (token) => request('/notifications', { token }),
  markNotificationRead: (id, token) => request(`/notifications/${id}/read`, { method: 'POST', token }),
  markAllNotificationsRead: (token) => request('/notifications/read-all', { method: 'POST', token }),
  // Preferenze notifiche email (Fase E6): self-service.
  getNotificationPreferences: (token) => request('/notifications/preferences', { token }),
  saveNotificationPreferences: (payload, token) =>
    request('/notifications/preferences', { method: 'PUT', body: payload, token }),
  // Storico email della società (Fase E7): responsabile/dirigente.
  listEmailLog: (token) => request('/email-log', { token }),

  listCourses: (token, { start, end, areaId, instructorId }) => {
    const params = new URLSearchParams({ start, end, areaId });
    if (instructorId) params.set('instructorId', instructorId);
    return request(`/courses?${params.toString()}`, { token });
  },
  createCourse: (payload, token) => request('/courses', { method: 'POST', body: payload, token }),
  updateCourse: (id, payload, token) => request(`/courses/${id}`, { method: 'PUT', body: payload, token }),
  deleteCourse: (id, token) => request(`/courses/${id}`, { method: 'DELETE', token }),
  listAvailableCourses: (token, areaId) => request(`/courses/available?areaId=${areaId}`, { token }),
  claimCourse: (id, token) => request(`/courses/${id}/claim`, { method: 'POST', token }),

  listCompanies: (token) => request('/companies', { token }),
  createCompany: (payload, token) => request('/companies', { method: 'POST', body: payload, token }),
  updateCompany: (id, payload, token) => request(`/companies/${id}`, { method: 'PUT', body: payload, token }),
  createCompanyDirigente: (companyId, payload, token) =>
    request(`/companies/${companyId}/dirigente`, { method: 'POST', body: payload, token }),
  getPlatformStats: (token) => request('/companies/stats', { token }),

  // Layer SaaS — piani (Super Admin). Il catalogo espone le chiavi limite/feature configurabili.
  getPlanCatalog: (token) => request('/plans/catalog', { token }),
  listPlans: (token) => request('/plans', { token }),
  createPlan: (payload, token) => request('/plans', { method: 'POST', body: payload, token }),
  updatePlan: (id, payload, token) => request(`/plans/${id}`, { method: 'PUT', body: payload, token }),
  getCompanySubscription: (companyId, token) => request(`/plans/subscriptions/${companyId}`, { token }),
  setCompanySubscription: (companyId, payload, token) =>
    request(`/plans/subscriptions/${companyId}`, { method: 'PUT', body: payload, token }),

  // Entitlements della propria società (tutti i ruoli): il frontend adatta la UI al piano.
  getCompanyEntitlements: (token) => request('/company/entitlements', { token }),

  // Permessi granulari per utente (RBAC, gestiti dal Dirigente).
  getUserPermissions: (id, token) => request(`/users/${id}/permissions`, { token }),
  setUserPermissions: (id, overrides, token) =>
    request(`/users/${id}/permissions`, { method: 'PUT', body: { overrides }, token }),

  // Audit trail (Dirigente: propria società; Super Admin: tutte / filtro companyId).
  listAuditLogs: (token, { limit, action, entityType, companyId } = {}) => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit);
    if (action) params.set('action', action);
    if (entityType) params.set('entityType', entityType);
    if (companyId) params.set('companyId', companyId);
    const qs = params.toString();
    return request(`/audit-logs${qs ? `?${qs}` : ''}`, { token });
  },

  // Billing (layer SaaS, Step 8): predisposizione pagamenti. Spento di default (status.enabled=false).
  getBillingStatus: (token) => request('/billing/status', { token }),
  listBillingPlans: (token) => request('/billing/plans', { token }),
  createBillingCheckout: (planId, token) =>
    request('/billing/checkout', { method: 'POST', body: { planId }, token }),

  listSedi: (token) => request('/sedi', { token }),
  createSede: (payload, token) => request('/sedi', { method: 'POST', body: payload, token }),
  updateSede: (id, payload, token) => request(`/sedi/${id}`, { method: 'PUT', body: payload, token }),
  deleteSede: (id, token) => request(`/sedi/${id}`, { method: 'DELETE', token }),

  listAreas: (sedeId, token) => request(`/sedi/${sedeId}/areas`, { token }),
  createArea: (sedeId, payload, token) => request(`/sedi/${sedeId}/areas`, { method: 'POST', body: payload, token }),
  updateArea: (id, payload, token) => request(`/areas/${id}`, { method: 'PUT', body: payload, token }),
  deleteArea: (id, token) => request(`/areas/${id}`, { method: 'DELETE', token }),
  reorderAreas: (sedeId, areaIds, token) =>
    request(`/sedi/${sedeId}/areas/reorder`, { method: 'PUT', body: { areaIds }, token }),

  listStaffingRequirements: (areaId, token) => request(`/staffing/requirements?areaId=${areaId}`, { token }),
  upsertWeeklyStaffing: (payload, token) =>
    request('/staffing/requirements/weekly', { method: 'PUT', body: payload, token }),
  createSingleStaffingRequirement: (payload, token) =>
    request('/staffing/requirements/single', { method: 'POST', body: payload, token }),
  updateSingleStaffingRequirement: (id, payload, token) =>
    request(`/staffing/requirements/single/${id}`, { method: 'PUT', body: payload, token }),
  deleteSingleStaffingRequirement: (id, token) =>
    request(`/staffing/requirements/single/${id}`, { method: 'DELETE', token }),
  editStaffingOccurrence: (id, payload, token) =>
    request(`/staffing/requirements/${id}/occurrence`, { method: 'PUT', body: payload, token }),
  getStaffingCoverage: (token, { areaId, start, end }) =>
    request(`/staffing/coverage?${new URLSearchParams({ areaId, start, end }).toString()}`, { token }),
  generateStaffingGap: (requirementId, date, token) =>
    request(`/staffing/requirements/${requirementId}/generate-gap`, { method: 'POST', body: { date }, token }),
};
