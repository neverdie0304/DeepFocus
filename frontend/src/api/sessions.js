import api from './axios';

export async function createSession(data) {
  const res = await api.post('/sessions/', data);
  return res.data;
}

export async function updateSession(id, data) {
  const res = await api.patch(`/sessions/${id}/`, data);
  return res.data;
}

export async function uploadEvents(sessionId, events) {
  const res = await api.post(`/sessions/${sessionId}/events/`, { events });
  return res.data;
}

export async function getSession(id) {
  const res = await api.get(`/sessions/${id}/`);
  return res.data;
}

export async function listSessions(params) {
  const res = await api.get('/sessions/', { params });
  return res.data;
}

export async function getWeeklyAnalytics(date) {
  const res = await api.get('/analytics/weekly/', { params: { date } });
  return res.data;
}

export async function submitSelfReport(sessionId, data) {
  const res = await api.post(`/sessions/${sessionId}/reports/`, data);
  return res.data;
}
