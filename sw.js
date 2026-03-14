// Learner Tracker — Service Worker v10 (reliable)
const SW_VERSION = 'ait-sw-v10';

self.addEventListener('install',  e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// ── NOTIFICATION CLICK ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  const action = e.action, data = e.notification.data || {};
  e.notification.close();

  if (action === 'done') {
    e.waitUntil(
      self.clients.matchAll({type:'window', includeUncontrolled:true}).then(clients => {
        const markUrl = (data.url || self.registration.scope) + '?markdone=' + data.taskId;
        if (clients.length > 0) {
          clients[0].focus();
          clients[0].postMessage({type:'MARK_DONE', taskId:data.taskId});
          return;
        }
        return self.clients.openWindow(markUrl);
      })
    );
    return;
  }

  if (action === 'open' || action === '') {
    e.waitUntil(
      self.clients.matchAll({type:'window', includeUncontrolled:true}).then(clients => {
        if (clients.length > 0) { clients[0].focus(); return; }
        return self.clients.openWindow(data.url || self.registration.scope);
      })
    );
    return;
  }

  if (action === 'skip') return;

  // Default tap — open app
  e.waitUntil(
    self.clients.matchAll({type:'window', includeUncontrolled:true}).then(clients => {
      if (clients.length > 0) clients[0].focus();
      else self.clients.openWindow(data.url || self.registration.scope);
    })
  );
});

// ── MESSAGE FROM PAGE ─────────────────────────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_NOTIFICATIONS') scheduleAll(e.data.payload);
});

// ── SCHEDULER ─────────────────────────────────────────────────────────────────
let timers = [];
function clearAll() { timers.forEach(clearTimeout); timers = []; }

function scheduleAll(p) {
  clearAll();
  const now = Date.now();

  // ── 1. OPEN REMINDER — fires 15 min after midnight ────────────────────────
  // Reminds user to open app and reschedule every morning
  const openReminder = msAt(0, 15) - now;
  if (openReminder > 0 && openReminder < 20 * 3600000) {
    timers.push(setTimeout(() => {
      self.registration.showNotification('🌅 Good morning, Viku!', {
        body: 'Open your tracker to schedule today\'s task reminders 📋',
        icon: ico(), badge: ico(),
        tag: 'daily-open-reminder',
        data: { url: p.appUrl },
        actions: [{ action: 'open', title: '📱 Open App' }],
        vibrate: [200, 100, 200],
        requireInteraction: true,
      });
    }, openReminder));
  }

  // ── 2. MORNING BRIEFING ───────────────────────────────────────────────────
  if (p.morningTime) {
    const [mh, mm] = p.morningTime.split(':').map(Number);
    const d = msAt(mh, mm) - now;
    if (d > 0 && d < 20 * 3600000) {
      timers.push(setTimeout(() => {
        self.registration.showNotification('🌅 Good morning, Viku!', {
          body: `You have ${p.totalTasks} tasks today. First up: ${p.firstTask}`,
          icon: ico(), badge: ico(),
          tag: 'morning',
          data: { url: p.appUrl },
          actions: [{ action: 'open', title: '📱 Open App' }],
          vibrate: [200, 100, 200],
        });
      }, d));
    }
  }

  // ── 3. PER-TASK NOTIFICATIONS ─────────────────────────────────────────────
  p.tasks.forEach(task => {
    // Start notification
    if (p.perTaskStart && !p.checkedIds.includes(task.id)) {
      const d = msAt(task.startH, task.startM) - now;
      if (d > 0 && d < 20 * 3600000) {
        timers.push(setTimeout(() => fireStart(task, p), d));
      }
    }
    // End notification
    if (p.perTaskEnd && !p.checkedIds.includes(task.id)) {
      const d = msAt(task.endH, task.endM) - now;
      if (d > 0 && d < 20 * 3600000) {
        timers.push(setTimeout(() => fireEnd(task, p), d));
      }
    }
  });

  // ── 4. SECTION SUMMARIES ──────────────────────────────────────────────────
  if (p.sectionSummaries) {
    p.sections.forEach(sec => {
      const d = msAt(sec.summaryH, sec.summaryM) - now;
      if (d > 0 && d < 20 * 3600000) {
        timers.push(setTimeout(() => fireSec(sec, p), d));
      }
    });
  }

  // ── 5. EVENING SUMMARY ────────────────────────────────────────────────────
  if (p.eveningTime) {
    const [eh, em] = p.eveningTime.split(':').map(Number);
    const d = msAt(eh, em) - now;
    if (d > 0 && d < 20 * 3600000) {
      timers.push(setTimeout(() => {
        self.registration.showNotification('🌆 Evening Summary', {
          body: `Done today: ${p.checkedIds.length}/${p.totalTasks} tasks ✅`,
          icon: ico(), badge: ico(),
          tag: 'evening',
          data: { url: p.appUrl },
          vibrate: [200, 100, 200],
        });
      }, d));
    }
  }

  // ── 6. CUSTOM REMINDERS ───────────────────────────────────────────────────
  [
    { key: 'customTime1', msg: p.customMsg1 || 'Time to check your tracker.' },
    { key: 'customTime2', msg: p.customMsg2 || 'Time to check your tracker.' },
  ].forEach(s => {
    if (!p[s.key]) return;
    const [h, m] = p[s.key].split(':').map(Number);
    const d = msAt(h, m) - now;
    if (d > 0 && d < 20 * 3600000) {
      timers.push(setTimeout(() => {
        self.registration.showNotification('⏰ Custom Reminder', {
          body: s.msg,
          icon: ico(), badge: ico(),
          tag: s.key,
          data: { url: p.appUrl },
          vibrate: [200, 100, 200],
        });
      }, d));
    }
  });

  // ── 7. RESCHEDULE REMINDER at 10 PM ──────────────────────────────────────
  // If user hasn't opened app today, remind them at 10 PM
  const rescheduleReminder = msAt(22, 0) - now;
  if (rescheduleReminder > 0 && rescheduleReminder < 20 * 3600000) {
    timers.push(setTimeout(() => {
      self.registration.showNotification('🔔 Don\'t forget tomorrow!', {
        body: 'Open your tracker in the morning to activate task reminders 💪',
        icon: ico(), badge: ico(),
        tag: 'reschedule-reminder',
        data: { url: p.appUrl },
        actions: [{ action: 'open', title: '📱 Open App' }],
        vibrate: [200, 100, 200],
      });
    }, rescheduleReminder));
  }
}

// ── NOTIFICATION TYPES ────────────────────────────────────────────────────────
function fireStart(task, p) {
  const q = p.motivate
    ? ('\n' + p.quotes[Math.floor(Math.random() * p.quotes.length)])
    : '';
  self.registration.showNotification('⏰ ' + task.text, {
    body: fmt(task.startH, task.startM) + ' – ' + fmt(task.endH, task.endM) + q,
    icon: ico(), badge: ico(),
    tag: 'start-' + task.id,
    data: { url: p.appUrl, taskId: task.id },
    vibrate: [150, 80, 150],
  });
}

function fireEnd(task, p) {
  self.registration.showNotification('✅ Did you complete this task?', {
    body: task.text + '\n' + fmt(task.startH, task.startM) + ' – ' + fmt(task.endH, task.endM),
    icon: ico(), badge: ico(),
    tag: 'end-' + task.id,
    data: { url: p.appUrl, taskId: task.id },
    actions: [
      { action: 'done',  title: '✅ Yes, done!' },
      { action: 'skip',  title: '❌ Not yet'    },
    ],
    vibrate: [300, 150, 300],
    requireInteraction: true,
  });
}

function fireSec(sec, p) {
  const done  = p.checkedIds.filter(id => sec.taskIds.includes(id)).length;
  const total = sec.taskIds.length;
  const pct   = Math.round(done / total * 100);
  self.registration.showNotification(sec.icon + ' ' + sec.title + ' Summary', {
    body: `${done}/${total} tasks (${pct}%) — ${pct >= 80 ? 'Great work! 🔥' : 'Keep pushing 💪'}`,
    icon: ico(), badge: ico(),
    tag: 'sec-' + sec.id,
    data: { url: p.appUrl },
    vibrate: [200, 100, 200],
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function msAt(h, m) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function fmt(h, m) {
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return hh + ':' + String(m).padStart(2, '0') + ' ' + ap;
}

function ico() {
  return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="%231E3A5F"/><text y="46" x="8" font-size="42">🤖</text></svg>';
}
