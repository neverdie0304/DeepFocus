import api from './axios';

export async function register({ username, email, password }) {
  const { data } = await api.post('/auth/register/', { username, email, password });
  return data;
}

export async function login({ username, password }) {
  const { data } = await api.post('/auth/login/', { username, password });
  localStorage.setItem('access', data.access);
  localStorage.setItem('refresh', data.refresh);
  return data;
}

export function logout() {
  localStorage.removeItem('access');
  localStorage.removeItem('refresh');
}

export async function getUser() {
  const { data } = await api.get('/auth/user/');
  return data;
}
