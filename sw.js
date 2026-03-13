// Learner Tracker — Service Worker v7
const SW_VERSION = 'ait-sw-v5';
self.addEventListener('install',  e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', e => {
  const action = e.action, data = e.notification.data || {};
  e.notification.close();
  if (action === 'done') {
    e.waitUntil(
      self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients => {
        if (clients.length > 0) { clients[0].focus(); clients[0].postMessage({type:'MARK_DONE',taskId:data.taskId}); }
        else self.clients.openWindow((data.url||'/')+'?markdone='+data.taskId);
      })
    ); return;
  }
  if (action === 'skip') return;
  e.waitUntil(
    self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients => {
      if (clients.length > 0) clients[0].focus();
      else self.clients.openWindow(data.url || '/');
    })
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_NOTIFICATIONS') scheduleAll(e.data.payload);
});

let timers = [];
function clearAll(){ timers.forEach(clearTimeout); timers=[]; }

function scheduleAll(p){
  clearAll();
  const now = Date.now();

  p.tasks.forEach(task => {
    if (p.perTaskStart && !p.checkedIds.includes(task.id)) {
      const d = msAt(task.startH, task.startM) - now;
      if (d > 0 && d < 20*3600000) timers.push(setTimeout(()=>fireStart(task,p), d));
    }
    if (p.perTaskEnd && !p.checkedIds.includes(task.id)) {
      const d = msAt(task.endH, task.endM) - now;
      if (d > 0 && d < 20*3600000) timers.push(setTimeout(()=>fireEnd(task,p), d));
    }
  });

  if (p.sectionSummaries) {
    p.sections.forEach(sec => {
      const d = msAt(sec.summaryH, sec.summaryM) - now;
      if (d > 0 && d < 20*3600000) timers.push(setTimeout(()=>fireSec(sec,p), d));
    });
  }

  [
    {key:'morningTime',   icon:'🌅', title:'Good morning, Viku!',  body: p=>`You have ${p.totalTasks} tasks today. First up: ${p.firstTask}`},
    {key:'eveningTime',   icon:'🌆', title:'Evening Summary',             body: p=>`Done today: ${p.checkedIds.length}/${p.totalTasks} tasks ✅`},
    {key:'customTime1',   icon:'⏰', title:'Custom Reminder',             body: p=>p.customMsg1||'Time to check your tracker.'},
    {key:'customTime2',   icon:'⏰', title:'Custom Reminder',             body: p=>p.customMsg2||'Time to check your tracker.'},
  ].forEach(s => {
    if (!p[s.key]) return;
    const [h,m] = p[s.key].split(':').map(Number);
    const d = msAt(h,m) - now;
    if (d > 0 && d < 20*3600000) timers.push(setTimeout(()=>{
      self.registration.showNotification(s.icon+' '+s.title, {
        body:s.body(p), icon:ico(), badge:ico(), tag:s.key,
        data:{url:p.appUrl}, vibrate:[200,100,200]
      });
    }, d));
  });
}

function fireStart(task, p){
  const q = p.motivate ? ('\n'+p.quotes[Math.floor(Math.random()*p.quotes.length)]) : '';
  self.registration.showNotification('⏰ '+task.text, {
    body: fmt(task.startH,task.startM)+' – '+fmt(task.endH,task.endM)+q,
    icon:ico(), badge:ico(), tag:'start-'+task.id,
    data:{url:p.appUrl,taskId:task.id}, vibrate:[150,80,150]
  });
}

function fireEnd(task, p){
  self.registration.showNotification('✅ Did you complete this task?', {
    body: task.text+'\n'+fmt(task.startH,task.startM)+' – '+fmt(task.endH,task.endM),
    icon:ico(), badge:ico(), tag:'end-'+task.id,
    data:{url:p.appUrl,taskId:task.id},
    actions:[{action:'done',title:'✅ Yes, done!'},{action:'skip',title:'❌ Not yet'}],
    vibrate:[300,150,300], requireInteraction:true
  });
}

function fireSec(sec, p){
  const done = p.checkedIds.filter(id=>sec.taskIds.includes(id)).length;
  const total = sec.taskIds.length;
  const pct = Math.round(done/total*100);
  self.registration.showNotification(sec.icon+' '+sec.title+' Summary', {
    body:`${done}/${total} tasks (${pct}%) — ${pct>=80?'Great work! 🔥':'Keep pushing 💪'}`,
    icon:ico(), badge:ico(), tag:'sec-'+sec.id,
    data:{url:p.appUrl}, vibrate:[200,100,200]
  });
}

function msAt(h,m){ const d=new Date(); d.setHours(h,m,0,0); return d.getTime(); }
function fmt(h,m){ const ap=h>=12?'PM':'AM',hh=h%12||12; return hh+':'+String(m).padStart(2,'0')+' '+ap; }
function ico(){ return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="%231E3A5F"/><text y="46" x="8" font-size="42">🤖</text></svg>'; }
