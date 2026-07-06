// Shared by the page (script tag) and the service worker (importScripts).
// Keeps the reminder schedule and shown-slot bookkeeping in one place so
// page timers and periodic background sync never double-notify.

const NOTIF_SCHEDULE = [
  { hour: 7,  min: 0, title: 'SelfMade · Morning',  body: 'Good morning! Log your breakfast and start strong.' },
  { hour: 10, min: 0, title: 'SelfMade · Check-in', body: 'Mid-morning reminder — water and steps on track?' },
  { hour: 13, min: 0, title: 'SelfMade · Lunch',    body: 'Lunchtime! Don\'t forget to log your meal.' },
  { hour: 17, min: 0, title: 'SelfMade · Check-in', body: 'Afternoon check — how\'s your step count?' },
  { hour: 20, min: 0, title: 'SelfMade · Evening',  body: 'Time to wrap up — fill in anything you missed today.' },
]

const NOTIF_WINDOW_MS = 3 * 60 * 60 * 1000 // a slot can still fire up to 3h late

// Tiny IndexedDB key-value store — localStorage is not available in the
// service worker, so both contexts share this.
const NOTIF_STORE = {
  _open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('selfmade-notif', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('kv')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  },

  async _get(key, fallback) {
    try {
      const db = await this._open()
      return await new Promise(resolve => {
        const req = db.transaction('kv').objectStore('kv').get(key)
        req.onsuccess = () => resolve(req.result !== undefined ? req.result : fallback)
        req.onerror = () => resolve(fallback)
      })
    } catch { return fallback }
  },

  async _set(key, value) {
    try {
      const db = await this._open()
      await new Promise(resolve => {
        const tx = db.transaction('kv', 'readwrite')
        tx.objectStore('kv').put(value, key)
        tx.oncomplete = resolve
        tx.onerror = resolve
      })
    } catch {}
  },

  getEnabled() { return this._get('enabled', false) },
  setEnabled(val) { return this._set('enabled', !!val) },
  getShown(dateKey) { return this._get('shown:' + dateKey, []) },
  async markShown(dateKey, hour) {
    const shown = await this.getShown(dateKey)
    if (!shown.includes(hour)) shown.push(hour)
    await this._set('shown:' + dateKey, shown)
  },
}

function notifDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Show any reminder whose time has passed today (within the late window)
// and hasn't been shown yet. `reg` is a ServiceWorkerRegistration, or null
// to fall back to the plain Notification constructor.
async function showDueNotifications(reg) {
  if (!(await NOTIF_STORE.getEnabled())) return
  const now = new Date()
  const key = notifDateKey(now)
  const shown = await NOTIF_STORE.getShown(key)

  for (const slot of NOTIF_SCHEDULE) {
    const target = new Date(now)
    target.setHours(slot.hour, slot.min, 0, 0)
    const late = now - target
    if (late < 0 || late > NOTIF_WINDOW_MS) continue
    if (shown.includes(slot.hour)) continue

    await NOTIF_STORE.markShown(key, slot.hour)
    const options = {
      body: slot.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: `selfmade-${key}-${slot.hour}`,
    }
    if (reg) await reg.showNotification(slot.title, options)
    else new Notification(slot.title, options)
  }
}
