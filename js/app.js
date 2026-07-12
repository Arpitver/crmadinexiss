/* ============================= CONFIG ============================= */
const STAGES = [
  {key:'new', label:'New Lead', color:'var(--stage-new)'},
  {key:'contacted', label:'Contacted', color:'var(--stage-contacted)'},
  {key:'qualified', label:'Qualified', color:'var(--stage-qualified)'},
  {key:'proposal', label:'Proposal Sent', color:'var(--stage-proposal)'},
  {key:'won', label:'Won', color:'var(--stage-won)'},
  {key:'lost', label:'Lost', color:'var(--stage-lost)'},
];
const PROJECT_STATUSES = ['Planning','In Progress','Review','Completed','On Hold'];
const TICKET_PRIORITIES = ['Low','Medium','High','Urgent'];
const TICKET_STATUSES = ['Open','In Progress','Waiting on Client','Resolved'];

let DATA = { leads: [], clients: [], projects: [], tickets: [], ledger: [], team: [] };
let currentView = 'dashboard';
let searchTerm = '';
let CURRENT_USER = null;
let CSRF_TOKEN = null;

/* ============================= API HELPERS ============================= */
async function apiGet(path){
  const res = await fetch(path, { credentials: 'same-origin' });
  if (res.status === 401) { showLogin(); throw new Error('Not authenticated'); }
  if (!res.ok) { const e = await res.json().catch(()=>({error:'Request failed'})); throw new Error(e.error || 'Request failed'); }
  return res.json();
}
async function apiPost(path, body){
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF_TOKEN || '' },
    body: JSON.stringify(body || {}),
  });
  if (res.status === 401) { showLogin(); throw new Error('Not authenticated'); }
  if (!res.ok) { const e = await res.json().catch(()=>({error:'Request failed'})); throw new Error(e.error || 'Request failed'); }
  return res.json();
}

/* ============================= HELPERS ============================= */
function uidShort(){ return Math.random().toString(36).slice(2,10); }
function fmtMoney(n){ n = Number(n)||0; return '$' + n.toLocaleString('en-US'); }
function fmtDate(d){ if(!d) return '—'; const dt = new Date(typeof d==='string' && d.length===10 ? d+'T00:00:00' : Number(d)); if(isNaN(dt)) return d; return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function timeAgo(ts){
  const s = Math.floor((Date.now()-ts)/1000);
  if(s<60) return 'just now';
  const m = Math.floor(s/60); if(m<60) return m+'m ago';
  const h = Math.floor(m/60); if(h<24) return h+'h ago';
  const d = Math.floor(h/24); return d+'d ago';
}
function esc(s){ return (s||'').toString().replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function stageLabel(key){ return (STAGES.find(s=>s.key===key)||{}).label || key; }
function clientName(id){ const c = DATA.clients.find(c=>c.id===id); return c ? c.name : '—'; }
function paymentBadge(status){
  const s = status || 'pending';
  return `<span class="pay-badge ${s}">${s === 'done' ? 'Paid' : 'Pending'}</span>`;
}
function initials(name){
  return (name||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('') || '?';
}
function showToast(msg, isError){
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.querySelector('svg').style.color = isError ? 'var(--danger)' : 'var(--success)';
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=> t.classList.remove('show'), 2600);
}
function safeAction(promise){
  return promise.catch(err=>{
    console.error(err);
    if (err.message !== 'Not authenticated') showToast(err.message || 'Something went wrong', true);
  });
}

/* ============================= DATA MAPPING (DB snake_case → JS camelCase) ============================= */
function mapLead(r){
  return { id:r.id, name:r.name, company:r.company, email:r.email, value:Number(r.value)||0,
    stage:r.stage, paymentStatus:r.payment_status, notes:r.notes,
    wonAt: r.won_at ? Number(r.won_at) : null, createdAt: Number(r.created_at) };
}
function mapClient(r){
  return { id:r.id, name:r.name, email:r.email, phone:r.phone, address:r.address, notes:r.notes, createdAt: Number(r.created_at) };
}
function mapProject(r){
  return { id:r.id, name:r.name, clientId:r.client_id, status:r.status, deadline:r.deadline,
    progress:Number(r.progress)||0, notes:r.notes, createdAt: Number(r.created_at) };
}
function mapTicket(r){
  return { id:r.id, subject:r.subject, clientId:r.client_id, priority:r.priority, status:r.status,
    description:r.description, createdAt: Number(r.created_at) };
}
function mapLedgerBlock(b){
  return { index:b.block_index, timestamp:Number(b.timestamp), type:b.type, action:b.action,
    actor:b.actor, details: typeof b.details==='object'?b.details:{}, prevHash:b.prev_hash, hash:b.hash };
}

/* ============================= AUTH ============================= */
function showLogin(){
  document.getElementById('app').style.display = 'none';
  document.getElementById('appLoader').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}
function showApp(){
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
}
function loginError(msg){
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.classList.add('show');
}
function clearLoginError(){
  document.getElementById('loginError').classList.remove('show');
}

document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  clearLoginError();
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; const original = btn.textContent; btn.textContent = 'Signing in…';
  try{
    const username = document.getElementById('li_username').value.trim();
    const password = document.getElementById('li_password').value;
    const res = await fetch('api/auth.php?action=login', {
      method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username, password}),
    });
    const data = await res.json();
    if(!res.ok){ loginError(data.error || 'Login failed.'); return; }
    CURRENT_USER = data.user;
    CSRF_TOKEN = data.csrfToken;
    document.getElementById('loginForm').reset();
    await bootApp();
  } catch(err){
    loginError('Could not reach the server. Check your connection.');
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async ()=>{
  try{ await apiPost('api/auth.php?action=logout', {}); } catch(e){}
  CURRENT_USER = null; CSRF_TOKEN = null;
  showLogin();
});

async function checkSession(){
  try{
    const res = await fetch('api/auth.php?action=check', { credentials:'same-origin' });
    const data = await res.json();
    if(data.authenticated){
      CURRENT_USER = data.user;
      CSRF_TOKEN = data.csrfToken;
      return true;
    }
    return false;
  }catch(e){ return false; }
}

/* ============================= NAV ============================= */
const viewMeta = {
  dashboard: {title:'Dashboard', sub:'Snapshot of sales, delivery and support', addLabel:null},
  addlead: {title:'Add Lead', sub:'Create a new opportunity and drop it into the pipeline', addLabel:null},
  pipeline: {title:'Sales Pipeline', sub:'Drag leads across stages as deals progress', addLabel:'Add Lead'},
  clients: {title:'Clients', sub:'Every account Adinexis manages', addLabel:'Add Client'},
  projects: {title:'Projects', sub:'Delivery work in flight for clients', addLabel:'Add Project'},
  tickets: {title:'Support Tickets', sub:'Client issues and requests', addLabel:'Add Ticket'},
  ledger: {title:'Blockchain Ledger', sub:'Immutable, hash-chained audit trail — verified live against MySQL', addLabel:null},
  team: {title:'Team', sub:'Everyone with access to this CRM', addLabel:null},
};

document.querySelectorAll('.nav-item').forEach(el=>{
  el.addEventListener('click', ()=> switchView(el.dataset.view));
});

function switchView(view){
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(el=> el.classList.toggle('active', el.dataset.view===view));
  document.querySelectorAll('.view').forEach(el=> el.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  const meta = viewMeta[view];
  document.getElementById('viewTitle').textContent = meta.title;
  document.getElementById('viewSubtitle').textContent = meta.sub;
  const addBtn = document.getElementById('primaryAddBtn');
  const searchBox = document.getElementById('searchBox');
  if(meta.addLabel){
    addBtn.style.display = 'inline-flex';
    document.getElementById('primaryAddLabel').textContent = meta.addLabel;
  } else {
    addBtn.style.display = 'none';
  }
  searchBox.style.display = (view==='clients'||view==='projects'||view==='tickets') ? 'flex' : 'none';
  document.getElementById('searchInput').value = '';
  searchTerm = '';
  if(view==='addlead') populateAddLeadForm();
  if(view==='team') document.getElementById('addTeamPanel').style.display = (CURRENT_USER && CURRENT_USER.role==='admin') ? 'block' : 'none';
  renderAll();
}

document.getElementById('searchInput').addEventListener('input', (e)=>{
  searchTerm = e.target.value.toLowerCase();
  renderAll();
});

document.getElementById('primaryAddBtn').addEventListener('click', ()=>{
  if(currentView==='pipeline') switchView('addlead');
  else if(currentView==='clients') openClientModal();
  else if(currentView==='projects') openProjectModal();
  else if(currentView==='tickets') openTicketModal();
});

document.getElementById('exportBtn').addEventListener('click', ()=>{
  window.open('api/backup.php', '_blank');
});

/* ============================= ADD LEAD SECTION ============================= */
function populateAddLeadForm(){
  const stageSel = document.getElementById('al_stage');
  stageSel.innerHTML = STAGES.map(s=>`<option value="${s.key}">${s.label}</option>`).join('');
}
document.getElementById('addLeadForm').addEventListener('submit', function(e){
  e.preventDefault();
  const name = document.getElementById('al_name').value.trim();
  if(!name){ showToast('Contact name is required', true); return; }
  const payload = {
    _op: 'create', name,
    company: document.getElementById('al_company').value.trim(),
    email: document.getElementById('al_email').value.trim(),
    value: Number(document.getElementById('al_value').value)||0,
    stage: document.getElementById('al_stage').value,
    paymentStatus: document.getElementById('al_payment').value,
    notes: document.getElementById('al_notes').value.trim(),
  };
  safeAction((async ()=>{
    await apiPost('api/leads.php', payload);
    this.reset(); populateAddLeadForm();
    showToast('Lead added');
    switchView('pipeline');
    await refreshAll();
  })());
});

/* ============================= RENDER ============================= */
function renderAll(){
  document.getElementById('countLeads').textContent = DATA.leads.filter(l=> !['won','lost'].includes(l.stage)).length;
  document.getElementById('countClients').textContent = DATA.clients.length;
  document.getElementById('countProjects').textContent = DATA.projects.filter(p=>p.status!=='Completed').length;
  document.getElementById('countTickets').textContent = DATA.tickets.filter(t=>t.status!=='Resolved').length;
  document.getElementById('countLedger').textContent = DATA.ledger.length;
  document.getElementById('countTeam').textContent = DATA.team.length;

  if(currentView==='dashboard') renderDashboard();
  if(currentView==='pipeline') renderKanban();
  if(currentView==='clients') renderClients();
  if(currentView==='projects') renderProjects();
  if(currentView==='tickets') renderTickets();
  if(currentView==='ledger') renderLedger();
  if(currentView==='team') renderTeam();
}

/* ---------- Dashboard ---------- */
function renderDashboard(){
  const openLeads = DATA.leads.filter(l=> !['won','lost'].includes(l.stage));
  const pipelineValue = openLeads.reduce((s,l)=> s + (Number(l.value)||0), 0);
  document.getElementById('statPipelineValue').textContent = fmtMoney(pipelineValue);
  document.getElementById('statPipelineCount').textContent = openLeads.length + ' active lead' + (openLeads.length===1?'':'s');

  const now = new Date();
  const wonThisMonth = DATA.leads.filter(l=> l.stage==='won' && l.wonAt && new Date(l.wonAt).getMonth()===now.getMonth() && new Date(l.wonAt).getFullYear()===now.getFullYear());
  document.getElementById('statWonValue').textContent = fmtMoney(wonThisMonth.reduce((s,l)=>s+(Number(l.value)||0),0));
  document.getElementById('statWonCount').textContent = wonThisMonth.length + ' deal' + (wonThisMonth.length===1?'':'s') + ' closed';

  const pendingPayments = DATA.leads.filter(l=> (l.paymentStatus||'pending')==='pending' && l.value>0);
  document.getElementById('statPaymentPending').textContent = fmtMoney(pendingPayments.reduce((s,l)=>s+(Number(l.value)||0),0));
  document.getElementById('statPaymentPendingSub').textContent = pendingPayments.length + ' invoice' + (pendingPayments.length===1?'':'s') + ' outstanding';

  const openTickets = DATA.tickets.filter(t=>t.status!=='Resolved');
  document.getElementById('statTickets').textContent = openTickets.length;
  document.getElementById('statTicketsSub').textContent = openTickets.filter(t=>t.priority==='Urgent').length + ' marked urgent';

  document.getElementById('ledgerCountNote').textContent = DATA.ledger.length;

  const items = [
    ...DATA.leads.map(l=>({ts:l.createdAt, text:`<b>${esc(l.name)}</b> added to pipeline (${stageLabel(l.stage)})`, color:'var(--blue-600)'})),
    ...DATA.clients.map(c=>({ts:c.createdAt, text:`<b>${esc(c.name)}</b> added as a client`, color:'var(--success)'})),
    ...DATA.projects.map(p=>({ts:p.createdAt, text:`Project <b>${esc(p.name)}</b> created for ${esc(clientName(p.clientId))}`, color:'var(--warning)'})),
    ...DATA.tickets.map(t=>({ts:t.createdAt, text:`Ticket <b>${esc(t.subject)}</b> opened (${t.priority})`, color:'var(--danger)'})),
  ].filter(i=>i.ts).sort((a,b)=> b.ts-a.ts).slice(0,7);

  const feed = document.getElementById('activityFeed');
  feed.innerHTML = items.length ? items.map(i=>`
    <div class="activity-item">
      <div class="activity-dot" style="background:${i.color}"></div>
      <div>
        <div class="activity-text">${i.text}</div>
        <div class="activity-time">${timeAgo(i.ts)}</div>
      </div>
    </div>`).join('') : '<div style="color:var(--text-400); font-size:13px; padding:10px 0;">Nothing yet — activity will show up here as you use the CRM.</div>';

  const mini = document.getElementById('pipelineMini');
  const maxCount = Math.max(1, ...STAGES.map(s=> DATA.leads.filter(l=>l.stage===s.key).length));
  mini.innerHTML = STAGES.map(s=>{
    const count = DATA.leads.filter(l=>l.stage===s.key).length;
    return `<div class="pipeline-mini-row">
      <div class="pipeline-mini-label">${s.label}</div>
      <div class="pipeline-mini-bar-track"><div class="pipeline-mini-bar" style="width:${(count/maxCount*100)}%; background:${s.color}"></div></div>
      <div class="pipeline-mini-count">${count}</div>
    </div>`;
  }).join('');
}

/* ---------- Kanban ---------- */
function renderKanban(){
  const board = document.getElementById('kanbanBoard');
  board.innerHTML = STAGES.map(stage=>{
    const leads = DATA.leads.filter(l=>l.stage===stage.key);
    return `
    <div class="kanban-col">
      <div class="kanban-col-head" style="border-top-color:${stage.color}; background:color-mix(in srgb, ${stage.color} 10%, var(--surface-2));">
        <span class="kanban-col-title" style="color:${stage.color}">${stage.label}</span>
        <span class="kanban-col-count">${leads.length}</span>
      </div>
      <div class="kanban-col-body" data-stage="${stage.key}">
        ${leads.length ? leads.map(l=> leadCardHtml(l)).join('') : '<div class="kanban-empty">No leads here</div>'}
      </div>
    </div>`;
  }).join('');

  board.querySelectorAll('.lead-card').forEach(card=>{
    card.addEventListener('dragstart', e=>{
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.id);
    });
    card.addEventListener('dragend', ()=> card.classList.remove('dragging'));
  });
  board.querySelectorAll('.kanban-col-body').forEach(col=>{
    col.addEventListener('dragover', e=>{ e.preventDefault(); col.classList.add('dragover'); });
    col.addEventListener('dragleave', ()=> col.classList.remove('dragover'));
    col.addEventListener('drop', e=>{
      e.preventDefault(); col.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/plain');
      const lead = DATA.leads.find(l=>l.id===id);
      const newStage = col.dataset.stage;
      if(lead && lead.stage !== newStage){
        safeAction((async ()=>{
          await apiPost('api/leads.php', {
            _op:'update', id: lead.id, name: lead.name, company: lead.company, email: lead.email,
            value: lead.value, stage: newStage, paymentStatus: lead.paymentStatus, notes: lead.notes,
          });
          await refreshAll();
        })());
      }
    });
  });
}

function leadCardHtml(l){
  return `<div class="lead-card" draggable="true" data-id="${l.id}">
    <div class="lead-card-name">${esc(l.name)}</div>
    <div class="lead-card-company">${esc(l.company||'')}</div>
    <div style="display:flex; align-items:center; justify-content:space-between; margin-top:9px;">
      <div class="lead-card-value mono">${fmtMoney(l.value)}</div>
      ${paymentBadge(l.paymentStatus)}
    </div>
    <div class="lead-card-foot">
      <div class="lead-card-company">${esc(l.email||'')}</div>
      <div class="lead-card-actions">
        <button class="icon-btn" onclick="openLeadModal('${l.id}')" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
        <button class="icon-btn" onclick="deleteItem('leads','${l.id}')" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
      </div>
    </div>
  </div>`;
}

/* ---------- Clients ---------- */
function renderClients(){
  let list = DATA.clients.slice().sort((a,b)=> b.createdAt-a.createdAt);
  if(searchTerm) list = list.filter(c=> (c.name+c.company+c.email).toLowerCase().includes(searchTerm));
  document.getElementById('clientsCountLabel').textContent = list.length + ' client' + (list.length===1?'':'s');
  document.getElementById('clientsEmpty').style.display = list.length ? 'none':'block';
  document.getElementById('clientsTableBody').innerHTML = list.map(c=>{
    const projCount = DATA.projects.filter(p=>p.clientId===c.id).length;
    return `<tr class="table-row">
      <td><div class="cell-primary">${esc(c.name)}</div></td>
      <td><div>${esc(c.email||'—')}</div><div class="cell-sub">${esc(c.phone||'')}</div></td>
      <td>${projCount}</td>
      <td class="cell-sub">${fmtDate(c.createdAt)}</td>
      <td>
        <div class="lead-card-actions" style="justify-content:flex-end;">
          <button class="icon-btn" onclick="openClientModal('${c.id}')" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
          <button class="icon-btn" onclick="deleteItem('clients','${c.id}')" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ---------- Projects ---------- */
function statusBadge(status){
  const map = {
    'Planning':['var(--text-600)','var(--surface-2)'], 'In Progress':['var(--blue-700)','var(--blue-100)'],
    'Review':['var(--warning)','var(--warning-bg)'], 'Completed':['var(--success)','var(--success-bg)'],
    'On Hold':['var(--danger)','var(--danger-bg)'], 'Open':['var(--danger)','var(--danger-bg)'],
    'Waiting on Client':['var(--warning)','var(--warning-bg)'], 'Resolved':['var(--success)','var(--success-bg)'],
  };
  const c = map[status] || ['var(--text-600)','var(--surface-2)'];
  return `<span class="badge" style="color:${c[0]}; background:${c[1]}">${esc(status)}</span>`;
}
function priorityBadge(p){
  const map = {'Low':['var(--text-600)','var(--surface-2)'],'Medium':['var(--blue-700)','var(--blue-100)'],'High':['var(--warning)','var(--warning-bg)'],'Urgent':['var(--danger)','var(--danger-bg)']};
  const c = map[p]||map['Low'];
  return `<span class="badge" style="color:${c[0]}; background:${c[1]}">${esc(p)}</span>`;
}
function renderProjects(){
  let list = DATA.projects.slice().sort((a,b)=> b.createdAt-a.createdAt);
  if(searchTerm) list = list.filter(p=> (p.name+clientName(p.clientId)).toLowerCase().includes(searchTerm));
  document.getElementById('projectsCountLabel').textContent = list.length + ' project' + (list.length===1?'':'s');
  document.getElementById('projectsEmpty').style.display = list.length ? 'none':'block';
  document.getElementById('projectsTableBody').innerHTML = list.map(p=>`
    <tr class="table-row">
      <td><div class="cell-primary">${esc(p.name)}</div></td>
      <td>${esc(clientName(p.clientId))}</td>
      <td>${statusBadge(p.status)}</td>
      <td style="width:130px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="flex:1; background:var(--surface-2); border-radius:6px; height:6px; overflow:hidden;">
            <div style="width:${p.progress||0}%; height:100%; background:var(--blue-600);"></div>
          </div>
          <span class="mono" style="font-size:11px; color:var(--text-400);">${p.progress||0}%</span>
        </div>
      </td>
      <td class="cell-sub">${fmtDate(p.deadline)}</td>
      <td>
        <div class="lead-card-actions" style="justify-content:flex-end;">
          <button class="icon-btn" onclick="openProjectModal('${p.id}')" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
          <button class="icon-btn" onclick="deleteItem('projects','${p.id}')" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
        </div>
      </td>
    </tr>`).join('');
}

/* ---------- Tickets ---------- */
function renderTickets(){
  let list = DATA.tickets.slice().sort((a,b)=> b.createdAt-a.createdAt);
  if(searchTerm) list = list.filter(t=> (t.subject+clientName(t.clientId)).toLowerCase().includes(searchTerm));
  document.getElementById('ticketsCountLabel').textContent = list.length + ' ticket' + (list.length===1?'':'s');
  document.getElementById('ticketsEmpty').style.display = list.length ? 'none':'block';
  document.getElementById('ticketsTableBody').innerHTML = list.map(t=>`
    <tr class="table-row">
      <td><div class="cell-primary">${esc(t.subject)}</div></td>
      <td>${esc(clientName(t.clientId))}</td>
      <td>${priorityBadge(t.priority)}</td>
      <td>${statusBadge(t.status)}</td>
      <td class="cell-sub">${fmtDate(t.createdAt)}</td>
      <td>
        <div class="lead-card-actions" style="justify-content:flex-end;">
          <button class="icon-btn" onclick="openTicketModal('${t.id}')" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
          <button class="icon-btn" onclick="deleteItem('tickets','${t.id}')" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
        </div>
      </td>
    </tr>`).join('');
}

/* ---------- Ledger ---------- */
const LEDGER_ICONS = {
  lead: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4h18l-7 8v6l-4 2v-8L3 4z"/></svg>',
  payment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  client: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  project: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3v18M5 4h11l-2 4 2 4H5"/></svg>',
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z"/></svg>',
  auth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>',
};
const LEDGER_COLORS = {
  lead:'var(--blue-600)', payment:'var(--warning)', client:'var(--success)',
  project:'#7C5CFC', ticket:'var(--danger)', system:'var(--navy-700)', auth:'#0891B2',
};
function renderLedger(){
  const list = document.getElementById('ledgerList');
  if(!DATA.ledger.length){
    list.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
      <div class="empty-state-title">No ledger entries yet</div>
      <div>Blocks appear here automatically as you use the CRM.</div>
    </div>`;
    return;
  }
  const ordered = DATA.ledger.slice().sort((a,b)=> a.index - b.index);
  list.innerHTML = ordered.map((b, i)=>{
    const color = LEDGER_COLORS[b.type] || LEDGER_COLORS.system;
    const icon = LEDGER_ICONS[b.type] || LEDGER_ICONS.system;
    const detailsStr = Object.entries(b.details||{}).map(([k,v])=> `${k}: ${v}`).join(' · ');
    const connector = i>0 ? '<div class="ledger-connector"></div>' : '';
    const time = new Date(b.timestamp).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    return `${connector}<div class="ledger-block" id="ledger-block-${b.index}">
      <div class="ledger-block-head ledger-toggle" onclick="toggleLedgerHashes(${b.index})">
        <div class="ledger-icon" style="background:${color}">${icon}</div>
        <div>
          <div class="ledger-title">${esc(b.action)}</div>
          <div class="ledger-meta">by ${esc(b.actor||'system')} · ${detailsStr ? esc(detailsStr)+' · ' : ''}${fmtDate(b.timestamp)} ${time}</div>
        </div>
        <div class="ledger-index">Block #${b.index}</div>
      </div>
      <div class="ledger-hashes" id="ledger-hashes-${b.index}">
        <div class="hash-row"><div class="hash-label">Hash</div><div class="hash-val">${b.hash}</div></div>
        <div class="hash-row"><div class="hash-label">Prev Hash</div><div class="hash-val">${b.prevHash}</div></div>
      </div>
    </div>`;
  }).join('');
}
function toggleLedgerHashes(index){
  const el = document.getElementById('ledger-hashes-'+index);
  if(el) el.classList.toggle('open');
}
async function verifyChain(){
  const btn = document.getElementById('verifyChainBtn');
  const resultEl = document.getElementById('verifyResult');
  const original = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = 'Verifying…';
  document.querySelectorAll('.ledger-block').forEach(el=> el.classList.remove('tampered'));
  try{
    const result = await apiGet('api/ledger.php?action=verify');
    resultEl.style.display = 'block';
    if(result.ok){
      resultEl.innerHTML = `<div class="verify-banner ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg> Chain verified against MySQL — all ${result.totalBlocks} blocks intact, no tampering detected.</div>`;
    } else {
      document.getElementById('ledger-block-'+result.brokenAt)?.classList.add('tampered');
      resultEl.innerHTML = `<div class="verify-banner bad"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 9v13M12 3v.01"/><circle cx="12" cy="12" r="10"/></svg> Integrity check failed at Block #${result.brokenAt} — this record doesn't match its stored hash.</div>`;
    }
  } catch(err){
    showToast(err.message || 'Verification failed', true);
  } finally {
    btn.disabled = false; btn.innerHTML = original;
  }
}
document.getElementById('verifyChainBtn').addEventListener('click', verifyChain);

/* ---------- Team ---------- */
function renderTeam(){
  document.getElementById('teamCountLabel').textContent = DATA.team.length + ' team member' + (DATA.team.length===1?'':'s');
  const isAdmin = CURRENT_USER && CURRENT_USER.role === 'admin';
  const list = document.getElementById('teamList');
  list.innerHTML = DATA.team.map(u=>{
    const isSelf = CURRENT_USER && u.id === CURRENT_USER.id;
    return `<div class="team-row">
      <div class="team-avatar">${esc(initials(u.name))}</div>
      <div style="flex:1;">
        <div class="cell-primary">${esc(u.name)} ${isSelf ? '<span style="color:var(--text-400); font-weight:400; font-size:12px;">(you)</span>' : ''}</div>
        <div class="cell-sub">@${esc(u.username)} ${u.email ? '· '+esc(u.email) : ''}</div>
      </div>
      <span class="role-pill ${u.role}">${u.role}</span>
      <div style="width:110px; font-size:12px; color:var(--text-400);">
        <span class="status-dot ${u.active ? 'active':'inactive'}"></span>${u.active ? 'Active' : 'Deactivated'}
      </div>
      <div style="width:130px; font-size:11.5px; color:var(--text-400);">${u.last_login ? timeAgo(Number(u.last_login)) : 'Never signed in'}</div>
      ${isAdmin && !isSelf ? `<button class="btn btn-ghost btn-sm" onclick="toggleTeamActive('${u.id}')">${u.active?'Deactivate':'Reactivate'}</button>` : '<div style="width:88px;"></div>'}
    </div>`;
  }).join('');
}
function toggleTeamActive(id){
  safeAction((async ()=>{
    await apiPost('api/users.php', {_op:'toggle_active', id});
    showToast('Team member updated');
    await refreshAll();
  })());
}
document.getElementById('addTeamForm').addEventListener('submit', function(e){
  e.preventDefault();
  const payload = {
    _op:'create',
    name: document.getElementById('tm_name').value.trim(),
    username: document.getElementById('tm_username').value.trim(),
    email: document.getElementById('tm_email').value.trim(),
    role: document.getElementById('tm_role').value,
    password: document.getElementById('tm_password').value,
  };
  safeAction((async ()=>{
    await apiPost('api/users.php', payload);
    this.reset();
    showToast('Team member added');
    await refreshAll();
  })());
});

/* ============================= MODALS (edit existing records) ============================= */
const backdrop = document.getElementById('modalBackdrop');
const modalContent = document.getElementById('modalContent');
function closeModal(){ backdrop.classList.remove('active'); modalContent.innerHTML=''; }
backdrop.addEventListener('click', e=>{ if(e.target===backdrop) closeModal(); });
function openModal(html){ modalContent.innerHTML = html; backdrop.classList.add('active'); }

function clientOptions(selectedId){
  if(!DATA.clients.length) return '<option value="">No clients yet — add one first</option>';
  return '<option value="">Select a client…</option>' + DATA.clients.map(c=>
    `<option value="${c.id}" ${c.id===selectedId?'selected':''}>${esc(c.name)}</option>`).join('');
}

function openLeadModal(id){
  const lead = id ? DATA.leads.find(l=>l.id===id) : null;
  openModal(`
    <div class="modal-head"><h2>${lead?'Edit Lead':'Add Lead'}</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-row">
      <div class="form-group"><label>Contact name</label><input type="text" id="f_name" value="${esc(lead?.name||'')}" placeholder="Jordan Blake"></div>
      <div class="form-group"><label>Company</label><input type="text" id="f_company" value="${esc(lead?.company||'')}" placeholder="Company name"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input type="email" id="f_email" value="${esc(lead?.email||'')}" placeholder="name@company.com"></div>
      <div class="form-group"><label>Deal value ($)</label><input type="number" id="f_value" value="${lead?.value||''}" placeholder="15000"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Stage</label>
        <select id="f_stage">${STAGES.map(s=>`<option value="${s.key}" ${lead&&lead.stage===s.key?'selected':''}>${s.label}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Payment status</label>
        <select id="f_payment">
          <option value="pending" ${(!lead||lead.paymentStatus!=='done')?'selected':''}>Pending</option>
          <option value="done" ${lead&&lead.paymentStatus==='done'?'selected':''}>Done</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label>Notes</label><textarea id="f_notes" placeholder="Context on this deal…">${esc(lead?.notes||'')}</textarea></div>
    <div class="modal-actions">
      ${lead?`<button class="btn btn-danger-ghost" onclick="deleteItem('leads','${lead.id}'); closeModal();">Delete</button>`:''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveLead('${lead?lead.id:''}')">Save Lead</button>
    </div>
  `);
}
function saveLead(id){
  const name = document.getElementById('f_name').value.trim();
  if(!name){ showToast('Contact name is required', true); return; }
  const payload = {
    _op: id ? 'update' : 'create', id: id || undefined, name,
    company: document.getElementById('f_company').value.trim(),
    email: document.getElementById('f_email').value.trim(),
    value: Number(document.getElementById('f_value').value)||0,
    stage: document.getElementById('f_stage').value,
    paymentStatus: document.getElementById('f_payment').value,
    notes: document.getElementById('f_notes').value.trim(),
  };
  safeAction((async ()=>{
    await apiPost('api/leads.php', payload);
    closeModal(); showToast('Lead saved');
    await refreshAll();
  })());
}

function openClientModal(id){
  const c = id ? DATA.clients.find(c=>c.id===id) : null;
  openModal(`
    <div class="modal-head"><h2>${c?'Edit Client':'Add Client'}</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-group"><label>Client / company name</label><input type="text" id="f_name" value="${esc(c?.name||'')}" placeholder="Acme Corporation"></div>
    <div class="form-row">
      <div class="form-group"><label>Primary contact email</label><input type="email" id="f_email" value="${esc(c?.email||'')}" placeholder="contact@acme.com"></div>
      <div class="form-group"><label>Phone</label><input type="tel" id="f_phone" value="${esc(c?.phone||'')}" placeholder="+1 555 0100"></div>
    </div>
    <div class="form-group"><label>Address</label><input type="text" id="f_address" value="${esc(c?.address||'')}" placeholder="City, Country"></div>
    <div class="form-group"><label>Notes</label><textarea id="f_notes" placeholder="Account context…">${esc(c?.notes||'')}</textarea></div>
    <div class="modal-actions">
      ${c?`<button class="btn btn-danger-ghost" onclick="deleteItem('clients','${c.id}'); closeModal();">Delete</button>`:''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveClient('${c?c.id:''}')">Save Client</button>
    </div>
  `);
}
function saveClient(id){
  const name = document.getElementById('f_name').value.trim();
  if(!name){ showToast('Client name is required', true); return; }
  const payload = {
    _op: id ? 'update' : 'create', id: id || undefined, name,
    email: document.getElementById('f_email').value.trim(),
    phone: document.getElementById('f_phone').value.trim(),
    address: document.getElementById('f_address').value.trim(),
    notes: document.getElementById('f_notes').value.trim(),
  };
  safeAction((async ()=>{
    await apiPost('api/clients.php', payload);
    closeModal(); showToast('Client saved');
    await refreshAll();
  })());
}

function openProjectModal(id){
  const p = id ? DATA.projects.find(p=>p.id===id) : null;
  openModal(`
    <div class="modal-head"><h2>${p?'Edit Project':'Add Project'}</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-group"><label>Project name</label><input type="text" id="f_name" value="${esc(p?.name||'')}" placeholder="ERP Rollout — Phase 1"></div>
    <div class="form-group"><label>Client</label><select id="f_client">${clientOptions(p?.clientId)}</select></div>
    <div class="form-row">
      <div class="form-group"><label>Status</label><select id="f_status">${PROJECT_STATUSES.map(s=>`<option ${p&&p.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label>Deadline</label><input type="date" id="f_deadline" value="${p?.deadline||''}"></div>
    </div>
    <div class="form-group"><label>Progress (%)</label><input type="number" id="f_progress" min="0" max="100" value="${p?.progress??0}"></div>
    <div class="form-group"><label>Notes</label><textarea id="f_notes">${esc(p?.notes||'')}</textarea></div>
    <div class="modal-actions">
      ${p?`<button class="btn btn-danger-ghost" onclick="deleteItem('projects','${p.id}'); closeModal();">Delete</button>`:''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveProject('${p?p.id:''}')">Save Project</button>
    </div>
  `);
}
function saveProject(id){
  const name = document.getElementById('f_name').value.trim();
  const clientId = document.getElementById('f_client').value;
  if(!name){ showToast('Project name is required', true); return; }
  if(!clientId){ showToast('Please select a client', true); return; }
  const payload = {
    _op: id ? 'update' : 'create', id: id || undefined, name, clientId,
    status: document.getElementById('f_status').value,
    deadline: document.getElementById('f_deadline').value,
    progress: Math.max(0, Math.min(100, Number(document.getElementById('f_progress').value)||0)),
    notes: document.getElementById('f_notes').value.trim(),
  };
  safeAction((async ()=>{
    await apiPost('api/projects.php', payload);
    closeModal(); showToast('Project saved');
    await refreshAll();
  })());
}

function openTicketModal(id){
  const t = id ? DATA.tickets.find(t=>t.id===id) : null;
  openModal(`
    <div class="modal-head"><h2>${t?'Edit Ticket':'Add Ticket'}</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-group"><label>Subject</label><input type="text" id="f_subject" value="${esc(t?.subject||'')}" placeholder="Login errors on staging"></div>
    <div class="form-group"><label>Client</label><select id="f_client">${clientOptions(t?.clientId)}</select></div>
    <div class="form-row">
      <div class="form-group"><label>Priority</label><select id="f_priority">${TICKET_PRIORITIES.map(p=>`<option ${t&&t.priority===p?'selected':''}>${p}</option>`).join('')}</select></div>
      <div class="form-group"><label>Status</label><select id="f_status">${TICKET_STATUSES.map(s=>`<option ${t&&t.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="f_desc" placeholder="What's going on?">${esc(t?.description||'')}</textarea></div>
    <div class="modal-actions">
      ${t?`<button class="btn btn-danger-ghost" onclick="deleteItem('tickets','${t.id}'); closeModal();">Delete</button>`:''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveTicket('${t?t.id:''}')">Save Ticket</button>
    </div>
  `);
}
function saveTicket(id){
  const subject = document.getElementById('f_subject').value.trim();
  const clientId = document.getElementById('f_client').value;
  if(!subject){ showToast('Subject is required', true); return; }
  if(!clientId){ showToast('Please select a client', true); return; }
  const payload = {
    _op: id ? 'update' : 'create', id: id || undefined, subject, clientId,
    priority: document.getElementById('f_priority').value,
    status: document.getElementById('f_status').value,
    description: document.getElementById('f_desc').value.trim(),
  };
  safeAction((async ()=>{
    await apiPost('api/tickets.php', payload);
    closeModal(); showToast('Ticket saved');
    await refreshAll();
  })());
}

function deleteItem(type, id){
  if(!confirm('Delete this record? This cannot be undone (though the deletion itself will be logged in the ledger).')) return;
  safeAction((async ()=>{
    await apiPost(`api/${type}.php`, {_op:'delete', id});
    closeModal(); showToast('Deleted');
    await refreshAll();
  })());
}

/* ============================= DATA REFRESH ============================= */
async function refreshAll(){
  const [leads, clients, projects, tickets, ledger, team] = await Promise.all([
    apiGet('api/leads.php'), apiGet('api/clients.php'), apiGet('api/projects.php'),
    apiGet('api/tickets.php'), apiGet('api/ledger.php?action=list'), apiGet('api/users.php'),
  ]);
  DATA.leads = leads.map(mapLead);
  DATA.clients = clients.map(mapClient);
  DATA.projects = projects.map(mapProject);
  DATA.tickets = tickets.map(mapTicket);
  DATA.ledger = ledger.map(mapLedgerBlock);
  DATA.team = team;
  renderAll();
}

/* ============================= INIT ============================= */
function applyUserBadge(){
  if(!CURRENT_USER) return;
  document.getElementById('userAvatar').textContent = initials(CURRENT_USER.name);
  document.getElementById('userNameLabel').textContent = CURRENT_USER.name;
  document.getElementById('userRoleLabel').textContent = CURRENT_USER.role;
}

async function bootApp(){
  showApp();
  document.getElementById('appLoader').style.display = 'flex';
  applyUserBadge();
  try{
    await refreshAll();
    switchView('dashboard');
  } catch(err){
    if (err.message !== 'Not authenticated') showToast('Failed to load data from the server', true);
  } finally {
    document.getElementById('appLoader').style.display = 'none';
  }
}

(async function init(){
  const ok = await checkSession();
  if(ok){ await bootApp(); }
  else { showLogin(); }
})();
