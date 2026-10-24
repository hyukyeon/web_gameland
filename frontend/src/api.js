async function call(path, { method = 'GET', body, token, base = '/api/auth' } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.');
  return data;
}

async function upload(token, blob) {
  const res = await fetch('/api/auth/avatar', { method: 'POST', headers: { 'Content-Type': blob.type, Authorization: `Bearer ${token}` }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '업로드에 실패했습니다.');
  return data;
}

export const api = {
  stats: (token) => call('/stats', { token }),
  achievements: (token) => call('/achievements', { token }),
  setTitle: (token, title) => call('/title', { method: 'PUT', token, body: { title } }),
  checkin: (token) => call('/checkin', { method: 'POST', token }),
  gaepyeong: (token) => call('/gaepyeong', { method: 'POST', token }),
  slotStatus: (token) => call('/slot/status', { token, base: '/api' }),
  slotSpin: (token) => call('/slot/spin', { method: 'POST', token, base: '/api' }),
  updateProfile: (token, nickname) => call('/profile', { method: 'PUT', token, body: { nickname } }),
  uploadAvatar: upload,
  deleteAvatar: (token) => call('/avatar', { method: 'DELETE', token }),
  login: (username, password) => call('/login', { method: 'POST', body: { username, password } }),
  register: (username, password) => call('/register', { method: 'POST', body: { username, password } }),
  me: (token) => call('/me', { token }),
  records: (token) => call('/records', { token }),
  ranking: (game = 'money') => call(`/ranking?game=${game}`),
};
