const NOTIF = {
  _timer: null,

  get permission() {
    if (!('Notification' in window)) return 'unsupported'
    return Notification.permission
  },

  isEnabled() {
    return localStorage.getItem('selfmade_notif') === '1'
  },

  _setEnabled(val) {
    localStorage.setItem('selfmade_notif', val ? '1' : '0')
    NOTIF_STORE.setEnabled(val)
  },

  async enable() {
    if (!('Notification' in window)) return 'unsupported'
    if (Notification.permission === 'denied') return 'denied'
    const result = await Notification.requestPermission()
    if (result !== 'granted') return result
    this._setEnabled(true)
    this.schedule()
    this._registerPeriodicSync()
    return 'granted'
  },

  disable() {
    this._setEnabled(false)
    this._stop()
    this._unregisterPeriodicSync()
  },

  _stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  // Check every minute (and immediately) whether a reminder is due.
  // A repeating check survives tab freezes/throttling better than one
  // long setTimeout per slot — the first tick after unfreeze catches up.
  schedule() {
    this._stop()
    if (!this.isEnabled() || this.permission !== 'granted') return
    const check = () => this._check()
    check()
    this._timer = setInterval(check, 60 * 1000)
  },

  async _check() {
    if (!this.isEnabled() || this.permission !== 'granted') return
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null
      await showDueNotifications(reg)
    } catch (e) {
      console.warn('Notification check failed', e)
    }
  },

  // Periodic Background Sync lets the service worker fire reminders while
  // the app is closed (installed PWA on Android Chrome; best-effort elsewhere).
  async _registerPeriodicSync() {
    try {
      const reg = await navigator.serviceWorker.ready
      if ('periodicSync' in reg) {
        await reg.periodicSync.register('selfmade-reminders', { minInterval: 60 * 60 * 1000 })
      }
    } catch (_) {}
  },

  async _unregisterPeriodicSync() {
    try {
      const reg = await navigator.serviceWorker.ready
      if ('periodicSync' in reg) await reg.periodicSync.unregister('selfmade-reminders')
    } catch (_) {}
  },

  init() {
    if (this.isEnabled() && this.permission === 'granted') {
      NOTIF_STORE.setEnabled(true) // backfill the SW-visible flag for existing users
      this.schedule()
      this._registerPeriodicSync()
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.schedule()
    })
  },
}
