// Local persistence layer.
// Mirrors the small subset of the Claude-artifact `window.storage` API that
// App.jsx uses, but backed by the browser's localStorage so the app works
// as a normal standalone website / desktop app.

const storage = {
  async get(key) {
    try {
      const value = localStorage.getItem(key);
      return value !== null ? { key, value, shared: false } : null;
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
      return { key, value, shared: false };
    } catch (e) {
      console.error("Storage set failed", e);
      return null;
    }
  },
  async delete(key) {
    try {
      localStorage.removeItem(key);
      return { key, deleted: true, shared: false };
    } catch (e) {
      return null;
    }
  },
  async list(prefix = "") {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix));
      return { keys, prefix, shared: false };
    } catch (e) {
      return null;
    }
  },
};

export default storage;
