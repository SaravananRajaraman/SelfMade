const NOTIF = {
  SCHEDULE: [
    { hour: 7,  min: 0, title: 'SelfMade · Morning',     body: 'Good morning! Log your breakfast and start strong.' },
    { hour: 10, min: 0, title: 'SelfMade · Check-in',    body: 'Mid-morning reminder — water and steps on track?' },
    { hour: 13, min: 0, title: 'SelfMade · Lunch',       body: 'Lunchtime! Don\'t forget to log your meal.' },
    { hour: 17, min: 0, title: 'SelfMade · Check-in',    body: 'Afternoon check — how\'s your step count?' },
    { hour: 20, min: 0, title: 'SelfMade · Evening',     body: 'Time to wrap up — fill in anything you missed today.' },
  ],

  _timers: [],

  get permission() {
    if (!('Notification' in window)) return 'unsupported'
    return Notification.permission
  },

  isEnabled() {
    return localStorage.getItem('selfmade_notif') === '1'
  },

  _setEnabled(val) {
    localStorage.setItem('selfmade_notif', val ? '1' : '0')
  },

  async enable() {
    if (!('Notification' in window)) return 'unsupported'
    if (Notification.permission === 'denied') return 'denied'
    const result = await Notification.requestPermission()
    if (result !== 'granted') return result
    this._setEnabled(true)
    this.schedule()
    return 'granted'
  },

  disable() {
    this._setEnabled(false)
    this._clearTimers()
  },

  _clearTimers() {
    this._timers.forEach(t => clearTimeout(t))
    this._timers = []
  },

  async schedule() {
    this._clearTimers()
    if (!this.isEnabled() || this.permission !== 'granted') return

    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null
    const now = new Date()

    for (const slot of this.SCHEDULE) {
      const target = new Date()
      target.setHours(slot.hour, slot.min, 0, 0)
      const delay = target - now
      if (delay <= 0) continue

      const { title, body } = slot
      const t = setTimeout(async () => {
        try {
          if (reg) {
            await reg.showNotification(title, {
              body,
              icon: './icons/icon-192.png',
              badge: './icons/icon-192.png',
              tag: `selfmade-${slot.hour}`,
            })
          } else {
            new Notification(title, { body, icon: './icons/icon-192.png' })
          }
        } catch (e) {
          console.warn('Notification failed', e)
        }
      }, delay)
      this._timers.push(t)
    }

    // Reschedule at midnight for the next day
    const midnight = new Date()
    midnight.setHours(24, 0, 5, 0)
    const midnightTimer = setTimeout(() => this.schedule(), midnight - now)
    this._timers.push(midnightTimer)
  },

  init() {
    if (this.isEnabled() && this.permission === 'granted') {
      this.schedule()
    }
  },
}
