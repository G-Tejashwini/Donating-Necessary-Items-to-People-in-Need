let token = localStorage.getItem("dc_token") || "";
let currentUser = null;
let authMode = "login";

const $ = (id) => document.getElementById(id);
const money = (value) => "₹" + Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function message(id, text, error = false) {
  const el = $(id); el.textContent = text; el.className = `text-sm mt-4 ${error ? "text-red-600" : "text-emerald-700"}`;
}
function view(name) {
  ["homeView", "authView", "dashboardView"].forEach(id => $(id).classList.add("hidden-view"));
  $(name).classList.remove("hidden-view");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function showHome() { view("homeView"); loadPublicDrives(); }
function openAuth(role) {
  view("authView"); setAuthMode("login");
  if (role) { $("authRole").value = role; setAuthMode("register"); }
}
function setAuthMode(mode) {
  authMode = mode;
  $("authTitle").textContent = mode === "login" ? "Welcome back" : "Create your account";
  $("authSubtitle").textContent = mode === "login" ? "Sign in to your Donation Connect account." : "Join the community as a donor or recipient.";
  $("nameField").classList.toggle("hidden-view", mode === "login");
  $("roleField").classList.toggle("hidden-view", mode === "login");
  $("demoAccounts").classList.toggle("hidden-view", mode !== "login");
  $("loginTab").className = `flex-1 btn ${mode === "login" ? "btn-primary" : ""}`;
  $("registerTab").className = `flex-1 btn ${mode === "register" ? "btn-primary" : ""}`;
  $("authSubmit").textContent = mode === "login" ? "Sign in" : "Create account";
  message("authMessage", "");
}
$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = { email: $("authEmail").value, password: $("authPassword").value };
    let result;
    if (authMode === "register") {
      payload.name = $("authName").value;
      payload.role = $("authRole").value;
      result = await api("/api/auth/register", { method: "POST", body: JSON.stringify(payload) });
    } else {
      result = await api("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
    }
    token = result.token; currentUser = result.user;
    localStorage.setItem("dc_token", token);
    updateNav(); await loadDashboard();
  } catch (error) { message("authMessage", error.message, true); }
});
function updateNav() {
  $("navLogin").classList.toggle("hidden-view", !!currentUser);
  $("navLogout").classList.toggle("hidden-view", !currentUser);
  $("navUser").textContent = currentUser ? `${currentUser.name} · ${currentUser.role}` : "";
}
function logout() {
  token = ""; currentUser = null; localStorage.removeItem("dc_token"); updateNav(); showHome();
}
function progress(drive) {
  const pct = drive.target_amount > 0 ? Math.min(100, Math.round(drive.raised_amount / drive.target_amount * 100)) : 0;
  return `<div class="w-full bg-slate-100 rounded-full h-2.5 mt-3"><div class="bg-blue-600 h-2.5 rounded-full" style="width:${pct}%"></div></div><div class="flex justify-between text-xs muted mt-2"><span>${money(drive.raised_amount)} raised</span><span>${pct}% of ${money(drive.target_amount)}</span></div>`;
}
async function loadPublicDrives() {
  try {
    const { drives } = await api("/api/drives");
    const active = drives.filter(d => d.status === "active");
    $("publicDrives").innerHTML = active.map(d => `
      <article class="panel p-6">
        <div class="flex justify-between items-center"><span class="text-xs font-bold uppercase tracking-wider text-blue-700">${escapeHtml(d.category)}</span><span class="text-xs text-emerald-700 font-bold">● Active</span></div>
        <h3 class="text-xl font-extrabold mt-3">${escapeHtml(d.title)}</h3><p class="muted text-sm mt-2 min-h-12">${escapeHtml(d.description)}</p>
        ${progress(d)}
        <button class="btn btn-primary w-full mt-5" onclick="openAuth('donor')">Support this drive</button>
      </article>`).join("") || `<div class="panel p-8 text-center muted md:col-span-3">No active drives at the moment.</div>`;
    const raised = drives.reduce((sum,d) => sum + Number(d.raised_amount), 0);
    $("impactRaised").textContent = raised >= 100000 ? `₹${(raised/100000).toFixed(2)}L` : money(raised);
    $("impactDrives").textContent = active.length;
  } catch (error) { $("publicDrives").innerHTML = `<p class="text-red-600">${escapeHtml(error.message)}</p>`; }
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}
async function loadDashboard() {
  if (!currentUser) return openAuth();
  view("dashboardView");
  $("roleLabel").textContent = `${currentUser.role} workspace`;
  $("dashboardTitle").textContent = `Welcome, ${currentUser.name}`;
  const descriptions = { admin:"Manage donation drives, review requests and monitor platform activity.", donor:"Choose a cause, contribute and track your donation history.", recipient:"Tell the community what support you need and track your requests." };
  $("dashboardDesc").textContent = descriptions[currentUser.role];
  if (currentUser.role === "admin") await adminDashboard();
  if (currentUser.role === "donor") await donorDashboard();
  if (currentUser.role === "recipient") await recipientDashboard();
}
function statCard(label, value, icon) {
  return `<div class="panel p-5"><div class="flex justify-between"><span class="muted text-sm font-semibold">${label}</span><span class="text-2xl">${icon}</span></div><div class="stat mt-2">${value}</div></div>`;
}
async function adminDashboard() {
  const [{stats}, {requests}, {donations}, {drives}] = await Promise.all([
    api("/api/admin/overview"), api("/api/admin/requests"), api("/api/admin/donations"), api("/api/drives")
  ]);
  $("dashboardContent").innerHTML = `
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      ${statCard("Total users",stats.users,"👥")}${statCard("Total raised",money(stats.totalRaised),"💰")}${statCard("Donation drives",stats.drives,"🎯")}${statCard("Pending requests",stats.pendingRequests,"📨")}
    </div>
    <div class="grid lg:grid-cols-2 gap-5 mt-6">
      <section class="panel p-6"><h2 class="text-xl font-extrabold">Create a donation drive</h2>
        <form id="driveForm" class="space-y-3 mt-4">
          <input class="field" name="title" placeholder="Drive title" required>
          <textarea class="field" name="description" placeholder="Description" required rows="3"></textarea>
          <div class="grid grid-cols-2 gap-3"><select class="field" name="category"><option>Emergency</option><option>Food</option><option>Education</option><option>Medical</option><option>Clothing</option></select><input class="field" name="target_amount" type="number" min="0" placeholder="Target amount (₹)" required></div>
          <button class="btn btn-primary">Create drive</button><p id="driveMsg" class="text-sm"></p>
        </form>
      </section>
      <section class="panel p-6"><h2 class="text-xl font-extrabold">Donation drives</h2><div class="space-y-3 mt-4">${drives.map(d=>`<div class="border-b border-slate-100 pb-3"><div class="flex justify-between gap-3"><b>${escapeHtml(d.title)}</b><span class="text-xs font-bold">${escapeHtml(d.status)}</span></div>${progress(d)}<div class="flex gap-2 mt-3">${["active","paused","completed"].filter(s=>s!==d.status).map(s=>`<button class="text-xs btn btn-soft" onclick="changeDriveStatus(${d.id},'${s}')">Set ${s}</button>`).join("")}</div></div>`).join("")}</div></section>
    </div>
    <section class="panel p-6 mt-6"><h2 class="text-xl font-extrabold">Recipient support requests</h2><div class="overflow-x-auto mt-4"><table class="w-full text-sm text-left"><thead><tr class="text-slate-500 border-b"><th class="py-3">Recipient</th><th>Request</th><th>Category</th><th>People</th><th>Status</th><th>Action</th></tr></thead><tbody>${requests.map(r=>`<tr class="border-b border-slate-100"><td class="py-3">${escapeHtml(r.recipient_name)}</td><td><b>${escapeHtml(r.title)}</b><div class="muted text-xs">${escapeHtml(r.description)}</div></td><td>${escapeHtml(r.category)}</td><td>${r.people_count}</td><td>${escapeHtml(r.status)}</td><td>${r.status==="pending"?`<div class="flex gap-1"><button class="text-xs btn btn-soft" onclick="reviewRequest(${r.id},'approved')">Approve</button><button class="text-xs btn bg-red-50 text-red-700" onclick="reviewRequest(${r.id},'rejected')">Reject</button></div>`:"—"}</td></tr>`).join("") || `<tr><td colspan="6" class="py-5 muted">No requests submitted yet.</td></tr>`}</tbody></table></div></section>
    <section class="panel p-6 mt-6"><h2 class="text-xl font-extrabold">Recent donations</h2><div class="overflow-x-auto mt-3"><table class="w-full text-sm text-left"><thead><tr class="text-slate-500 border-b"><th class="py-3">Donor</th><th>Drive</th><th>Amount</th><th>Date</th></tr></thead><tbody>${donations.map(d=>`<tr class="border-b border-slate-100"><td class="py-3">${escapeHtml(d.donor_name)}</td><td>${escapeHtml(d.drive_title)}</td><td>${money(d.amount)}</td><td>${escapeHtml(d.created_at)}</td></tr>`).join("") || `<tr><td colspan="4" class="py-5 muted">No donations recorded yet.</td></tr>`}</tbody></table></div></section>`;
  $("driveForm").addEventListener("submit", async e => {
    e.preventDefault(); const data = Object.fromEntries(new FormData(e.target).entries()); data.target_amount = Number(data.target_amount);
    try { await api("/api/drives",{method:"POST",body:JSON.stringify(data)}); await adminDashboard(); } catch(err) { $("driveMsg").textContent=err.message; }
  });
}
async function changeDriveStatus(id,status) {
  try { await api(`/api/drives/${id}/status`,{method:"PATCH",body:JSON.stringify({status})}); await adminDashboard(); } catch(e) { alert(e.message); }
}
async function reviewRequest(id,status) {
  const note = prompt("Optional note for the recipient:") || "";
  try { await api(`/api/admin/requests/${id}`,{method:"PATCH",body:JSON.stringify({status,admin_note:note})}); await adminDashboard(); } catch(e) { alert(e.message); }
}
async function donorDashboard() {
  const [{drives},{donations}] = await Promise.all([api("/api/drives"),api("/api/donations/mine")]);
  const active = drives.filter(d=>d.status==="active");
  const total = donations.reduce((sum,d)=>sum+Number(d.amount),0);
  $("dashboardContent").innerHTML = `
    <div class="grid sm:grid-cols-3 gap-4">${statCard("Your contributions",money(total),"💝")}${statCard("Donations made",donations.length,"🧾")}${statCard("Active drives",active.length,"🎯")}</div>
    <div class="grid lg:grid-cols-2 gap-5 mt-6">
      <section class="panel p-6"><h2 class="text-xl font-extrabold">Make a donation</h2>
        <form id="donationForm" class="space-y-3 mt-4">
          <label class="text-sm font-bold">Select a drive</label><select class="field" name="drive_id" required>${active.map(d=>`<option value="${d.id}">${escapeHtml(d.title)} · ${money(d.raised_amount)} raised</option>`).join("")}</select>
          <label class="text-sm font-bold">Amount (₹)</label><input class="field" name="amount" type="number" min="1" step="1" placeholder="Enter amount" required>
          <label class="text-sm font-bold">Message (optional)</label><textarea class="field" name="note" rows="3" placeholder="Add a message"></textarea>
          <button class="btn btn-primary">Confirm donation</button><p id="donationMsg" class="text-sm"></p>
        </form>
      </section>
      <section class="panel p-6"><h2 class="text-xl font-extrabold">Active drives</h2><div class="space-y-5 mt-4">${active.map(d=>`<div><b>${escapeHtml(d.title)}</b><p class="muted text-sm mt-1">${escapeHtml(d.description)}</p>${progress(d)}</div>`).join("") || `<p class="muted mt-4">No active drives.</p>`}</div></section>
    </div>
    <section class="panel p-6 mt-6"><h2 class="text-xl font-extrabold">Your donation history</h2><div class="overflow-x-auto mt-3"><table class="w-full text-sm text-left"><thead><tr class="text-slate-500 border-b"><th class="py-3">Drive</th><th>Amount</th><th>Message</th><th>Date</th></tr></thead><tbody>${donations.map(d=>`<tr class="border-b border-slate-100"><td class="py-3">${escapeHtml(d.drive_title)}</td><td>${money(d.amount)}</td><td>${escapeHtml(d.note)}</td><td>${escapeHtml(d.created_at)}</td></tr>`).join("") || `<tr><td colspan="4" class="py-5 muted">Your donations will appear here.</td></tr>`}</tbody></table></div></section>`;
  $("donationForm").addEventListener("submit", async e=>{
    e.preventDefault(); const data=Object.fromEntries(new FormData(e.target).entries()); data.drive_id=Number(data.drive_id); data.amount=Number(data.amount);
    try { await api("/api/donations",{method:"POST",body:JSON.stringify(data)}); await donorDashboard(); } catch(err) { $("donationMsg").textContent=err.message; }
  });
}
async function recipientDashboard() {
  const {requests} = await api("/api/requests/mine");
  const pending = requests.filter(r=>r.status==="pending").length;
  $("dashboardContent").innerHTML = `
    <div class="grid sm:grid-cols-3 gap-4">${statCard("Requests submitted",requests.length,"📨")}${statCard("Awaiting review",pending,"⏳")}${statCard("Approved",requests.filter(r=>r.status==="approved"||r.status==="fulfilled").length,"✅")}</div>
    <div class="grid lg:grid-cols-2 gap-5 mt-6">
      <section class="panel p-6"><h2 class="text-xl font-extrabold">Request support</h2>
        <form id="requestForm" class="space-y-3 mt-4">
          <input class="field" name="title" placeholder="What support do you need?" required>
          <textarea class="field" name="description" rows="4" placeholder="Explain your situation and what is needed" required></textarea>
          <div class="grid grid-cols-2 gap-3"><select class="field" name="category"><option>Food</option><option>Education</option><option>Medical</option><option>Clothing</option><option>Shelter</option><option>Other</option></select><input class="field" type="number" min="1" name="people_count" value="1" placeholder="People" required></div>
          <button class="btn btn-primary">Submit request</button><p id="requestMsg" class="text-sm"></p>
        </form>
      </section>
      <section class="panel p-6"><h2 class="text-xl font-extrabold">Your request status</h2><div class="space-y-3 mt-4">${requests.map(r=>`<div class="border border-slate-100 rounded-xl p-4"><div class="flex justify-between gap-2"><b>${escapeHtml(r.title)}</b><span class="text-xs font-bold capitalize ${r.status==="approved"?"text-emerald-700":r.status==="rejected"?"text-red-700":"text-amber-700"}">${escapeHtml(r.status)}</span></div><p class="muted text-sm mt-1">${escapeHtml(r.description)}</p><p class="text-xs muted mt-2">${escapeHtml(r.category)} · ${r.people_count} people</p>${r.admin_note?`<p class="text-sm mt-2 bg-slate-50 rounded-lg p-2">Admin note: ${escapeHtml(r.admin_note)}</p>`:""}</div>`).join("") || `<p class="muted">You have not submitted a request yet.</p>`}</div></section>
    </div>`;
  $("requestForm").addEventListener("submit", async e=>{
    e.preventDefault(); const data=Object.fromEntries(new FormData(e.target).entries()); data.people_count=Number(data.people_count);
    try { await api("/api/requests",{method:"POST",body:JSON.stringify(data)}); await recipientDashboard(); } catch(err) { $("requestMsg").textContent=err.message; }
  });
}
async function init() {
  await loadPublicDrives();
  if (token) {
    try { const data = await api("/api/me"); currentUser=data.user; updateNav(); await loadDashboard(); }
    catch { logout(); }
  }
}
init();
