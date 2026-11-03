"use client";
import { useEffect, useState } from "react";
import { loadState, saveState } from "@/lib/store";
import { normalizeKey, isValidFormat, getStoredKey, saveLicense, clearLicense } from "@/lib/license";
import { getApiBase, setApiBaseOverride, getToken, setSession, getSessionUser, clearSession, AuthAPI, EmployeesAPI, PayrollAPI } from "@/lib/api";

const AVATAR_COLORS = ['#E2735B','#C9A227','#4C8577','#7D6BA6','#B3563F','#3E7C8A'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOC_TYPES = [
  {key:'passport', label:'Passport Photo', category:'Onboarding', required:true},
  {key:'cv', label:'CV / Resume', category:'Onboarding', required:true},
  {key:'offer', label:'Offer Letter / Contract', category:'Onboarding', required:true},
  {key:'acceptance', label:'Acceptance Letter', category:'Onboarding', required:true},
  {key:'deployment', label:'Deployment to Unit', category:'Onboarding', required:true},
  {key:'jd', label:'Job Description', category:'Onboarding', required:true},
  {key:'medicals', label:'Medicals', category:'Onboarding', required:true},
  {key:'nin', label:'NIN Slip', category:'IDs & Statutory', required:true},
  {key:'paye_tin', label:'PAYE / TIN', category:'IDs & Statutory', required:true},
  {key:'nhf', label:'NHF Number', category:'IDs & Statutory', required:false},
  {key:'pension', label:'Pension PIN', category:'IDs & Statutory', required:true},
  {key:'nsitf', label:'NSITF Reg', category:'IDs & Statutory', required:false},
  {key:'quarterly', label:'Quarterly Appraisal', category:'Appraisals', required:false},
  {key:'annual', label:'Annual Appraisal', category:'Appraisals', required:false},
];
const TAB_LABELS = {
  overview:'Home', team:'Team roster', docs:'Documents', regulatory:'Regulatory', training:'Training', leave:'Leave', attendance:'Attendance', org:'Org Chart', runpayroll:'Run payroll', history:'History',
  compliance:'Compliance', reviews:'Reviews', hiring:'Hiring', reports:'Reports', myprofile:'My profile'
};
function visibleTabs(role){
  if(role==='employee') return ['myprofile','training','leave','attendance'];
  if(role==='admin') return ['overview','team','docs','regulatory','training','leave','attendance','org','runpayroll','history','compliance','reviews','hiring'];
  return ['overview','team','docs','regulatory','training','leave','attendance','org','runpayroll','history','compliance','reviews','hiring','reports'];
}
const LEAVE_TYPES = [
  {key:'annual', label:'Annual Leave', days:21, color:'#4C8577'},
  {key:'sick', label:'Sick Leave', days:10, color:'#E2735B'},
  {key:'casual', label:'Casual Leave', days:7, color:'#C9A227'},
  {key:'maternity', label:'Maternity/Paternity', days:84, color:'#7D6BA6'},
];
function initials(name){ return name.trim().split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase(); }
function money(n){ return '₦' + Math.round(n).toLocaleString('en-NG'); }
function uid(){ return Math.random().toString(36).slice(2,9); }
function addDays(date,n){ const d=new Date(date); d.setDate(d.getDate()+n); return d; }
// PAYE per the (pre-2026) Personal Income Tax Act graduated bands, applied to
// income AFTER the Consolidated Relief Allowance and pension are deducted —
// the previous version taxed a flat (annual - 300,000) with no CRA and no
// pension relief, which overstates tax owed for nearly every salary level.
//
// IMPORTANT: Nigeria's tax rules changed under the Tax Reform Act effective
// Jan 2026. Verify current bands/reliefs with FIRS or an accountant before
// relying on this for real payslips or statutory filings — do not treat
// this function as compliance-certified as-is.
function estimateDeductions(gross){
  const annual = gross*12;
  // Consolidated Relief Allowance: higher of ₦200,000 or 1% of gross income,
  // plus 20% of gross income.
  const cra = Math.max(200000, annual*0.01) + annual*0.20;
  const pensionEmployeeAnnual = annual*0.08;
  const pensionEmployerAnnual = annual*0.10;
  const taxable = Math.max(annual - cra - pensionEmployeeAnnual, 0);
  const bands = [[300000,0.07],[300000,0.11],[500000,0.15],[500000,0.19],[1600000,0.21],[Infinity,0.24]];
  let tax=0, remaining=taxable;
  for(const [size,rate] of bands){ if(remaining<=0) break; const amt=Math.min(size,remaining); tax+=amt*rate; remaining-=amt; }
  const monthlyPAYE=Math.round(tax/12);
  const pensionEmployee=Math.round(pensionEmployeeAnnual/12);
  const pensionEmployer=Math.round(pensionEmployerAnnual/12);
  const nhf=Math.round(gross*0.025);
  const nsitf=Math.round(gross*0.01);
  const net=gross-monthlyPAYE-pensionEmployee-nhf;
  return {monthlyPAYE,pensionEmployee,pensionEmployer,nhf,nsitf,net};
}
// ---- Cloud backend (opt-in) helpers ----
// Map backend employee rows to the local state shape (frontend-only extras
// like avatar color, department, documents stay local).
const CLOUD_OFF_KEY='roost_cloud_off';
function cloudEmployeeToLocal(e,i){
  const docs={}; try{ DOC_TYPES.forEach(dt=> docs[dt.key]=null); }catch{}
  return { id:e.id, name:e.name, role:e.role, gross:Number(e.gross)||0, bank:e.bank||'', account:e.account||'', startDate:e.startDate||'', dob:e.dob||'', active:e.active!==false, color:AVATAR_COLORS[(i||0)%AVATAR_COLORS.length], department:null, nin:e.nin||'', payeTin:e.payeTin||'', nhfNumber:e.nhfNumber||'', pensionPin:e.pensionPin||'', nsitfNumber:e.nsitfNumber||'', passportPhoto:null, documents:docs };
}
function cloudRunToLocal(r){
  const lines=(r.lines||[]).map(l=>({ employeeId:l.employeeId, name:l.name, role:l.role, gross:l.gross, bank:l.bank||'', account:l.account||'', monthlyPAYE:l.monthlyPAYE, pensionEmployee:l.pensionEmployee, pensionEmployer:l.pensionEmployer, nhf:l.nhf, nsitf:Math.round((l.gross||0)*0.01), net:l.net }));
  return { id:r.id, period:r.period, createdAt:r.createdAt, lines, status:r.status||'paid' };
}
function nextPeriod(runs){
  const now=new Date();
  if(!runs.length) return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const last=runs[runs.length-1].period; const [y,m]=last.split('-').map(Number);
  const d=new Date(y,m-1+1,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function periodLabel(p){ const [y,m]=p.split('-').map(Number); return `${MONTHS[m-1]} ${y}`; }
function periodEndDate(p){ const [y,m]=p.split('-').map(Number); return new Date(y,m,0); }
function getDueDates(period){
  const end=periodEndDate(period);
  const add=(d,days)=>{ const nd=new Date(d); nd.setDate(nd.getDate()+days); return nd; };
  return { paye:add(end,10), pension:add(end,7), nhf:add(end,30), nsitf:add(end,90) };
}
function daysUntil(date){ const ms=new Date(date).setHours(0,0,0,0)-new Date().setHours(0,0,0,0); return Math.round(ms/86400000); }
function complianceStatus(state, period, item){
  const rec=state.compliance[period]||{}; if(rec[item]) return 'filed';
  const due=getDueDates(period)[item]; const d=daysUntil(new Date(due)); if(d<0) return 'overdue'; return 'pending';
}
function migrateState(s){
  let changed=false;
  if(!s.companyName){ s.companyName=''; changed=true; }
  if(!s.trainings || s.trainings.length===0){ 
    const fresh=seedDemo(); s.trainings=fresh.trainings; s.enrollments=fresh.enrollments; s.certificates=fresh.certificates; changed=true;
  }
  if(!s.enrollments){ s.enrollments=[]; changed=true; }
  if(!s.certificates){ s.certificates=[]; changed=true; }
  if(!s.leaves){ s.leaves=[]; changed=true; }
  if(!s.attendance){ s.attendance=[]; changed=true; }
  if(!s.orgUnits){ s.orgUnits=[
    {id:'dept1', name:'Operations', head: s.employees[0]?.id||null, color:'#4C8577'},
    {id:'dept2', name:'Sales & Support', head: s.employees[1]?.id||null, color:'#E2735B'},
    {id:'dept3', name:'Finance', head: s.employees[2]?.id||null, color:'#C9A227'},
  ]; changed=true; }
  s.employees.forEach(em=>{
    if(em.department===undefined){ em.department = s.orgUnits[Math.floor(Math.random()*s.orgUnits.length)]?.id || 'dept1'; changed=true; }
  });
  // front-load additional courses if missing (customer service already, add work-life balance, grit, etc.)
  const mustHave=[
    {title:'Customer Service Excellence', def:{category:'Skills', duration:'3h', description:'Handling complaints, empathy and service recovery for frontline teams.', modules:[{title:'Service Framework & Empathy',type:'doc',duration:'60m'},{title:'Role-play: Difficult Customer',type:'assignment',duration:'30m'},{title:'Quiz — Service',type:'quiz',duration:'15m'}]}},
    {title:'Work-Life Balance', def:{category:'Wellness', duration:'1.5h', description:'Managing stress, boundaries, burnout prevention and productivity.', modules:[{title:'Understanding Burnout',type:'doc',duration:'20m'},{title:'Time & Energy Management',type:'video',duration:'30m'},{title:'Self-assessment — Balance',type:'assignment',duration:'20m'}]}},
    {title:'Grit & Resilience', def:{category:'Mindset', duration:'2h', description:'Growth mindset, perseverance through obstacles, grit at work.', modules:[{title:'Grit Principles',type:'doc',duration:'30m'},{title:'Resilience Stories',type:'video',duration:'40m'},{title:'Quiz — Grit',type:'quiz',duration:'15m'}]}},
    {title:'Effective Communication', def:{category:'Skills', duration:'1h', description:'Clear writing, active listening, feedback without friction.', modules:[{title:'Communication Essentials',type:'doc',duration:'30m'},{title:'Practice: Feedback Lab',type:'assignment',duration:'20m'}]}},
  ];
  // ensure all 6 preloaded courses exist (migrate old installs that had only 3)
  const seedAllTitles=['Workplace Safety Essentials','HR Compliance & Ethics','Customer Service Excellence','Work-Life Balance','Grit & Resilience','Effective Communication'];
  if(s.trainings.length < 6 || !seedAllTitles.every(t=> s.trainings.some(x=>x.title===t))){
    // inject missing via full reseed but keep enrollments if possible — just add missing
    mustHave.forEach(m=>{
      if(!s.trainings.some(t=>t.title===m.title)){
        s.trainings.push({id:uid(), title:m.title, category:m.def.category, duration:m.def.duration, description:m.def.description, required:false, createdAt:new Date().toISOString().slice(0,10), modules: m.def.modules.map(mm=>({id:uid(), title:mm.title, type:mm.type, content:mm.type==='quiz'?'Pass 70%':mm.title, duration:mm.duration}))});
        changed=true;
      }
    });
    const coreMissing=['Workplace Safety Essentials','HR Compliance & Ethics'].filter(t=> !s.trainings.some(x=>x.title===t));
    coreMissing.forEach(title=>{
      const isWorkplace=title==='Workplace Safety Essentials';
      s.trainings.unshift({id:uid(), title, category:'Compliance', duration:isWorkplace?'2h':'1.5h', description:isWorkplace?'Mandatory safety, hygiene and emergency procedures for all staff.':'Code of conduct, data protection, anti-harassment.', required:true, createdAt:new Date().toISOString().slice(0,10), modules: isWorkplace? [{id:uid(),title:'Safety Policies & Emergency Exits',type:'doc',content:'Review safety handbook',duration:'30m'},{id:uid(),title:'Hygiene & Incident Reporting',type:'video',content:'Video demo',duration:'45m'},{id:uid(),title:'Quiz — Safety',type:'quiz',content:'Pass mark 70%',duration:'15m'}] : [{id:uid(),title:'Code of Conduct',type:'doc',content:'Company code',duration:'30m'},{id:uid(),title:'Quiz — Ethics',type:'quiz',content:'Pass mark 70%',duration:'15m'}]});
      changed=true;
    });
  }
  // upgrade weak courses (<5 modules) to robust 5-module versions
  const robustMap={
    'Work-Life Balance': [{title:'1. Understanding Burnout — Signals',type:'doc',duration:'20m',content:'Maslach inventory + 12 signals checklist'},{title:'2. Time & Energy Management',type:'video',duration:'30m',content:'Pomodoro, deep work (video)'},{title:'3. Recovery Toolkit',type:'doc',duration:'20m',content:'Sleep, movement, mindfulness'},{title:'4. Wellness Plan Worksheet',type:'assignment',duration:'25m',content:'Draft 7-day plan'},{title:'5. Assessment — Balance',type:'quiz',duration:'15m',content:'10 Qs, 70% pass'}],
    'Grit & Resilience': [{title:'1. Grit Principles',type:'doc',duration:'25m',content:'Angela Duckworth framework'},{title:'2. Growth Mindset in Practice',type:'video',duration:'30m',content:'Carol Dweck cases'},{title:'3. Resilience Stories — Nigeria',type:'video',duration:'30m',content:'Local entrepreneurs'},{title:'4. Reflection Journal',type:'assignment',duration:'20m',content:'Write 300-word story'},{title:'5. Final Test — Grit',type:'quiz',duration:'15m',content:'12 Qs, 70% pass'}],
    'Effective Communication': [{title:'1. Writing Clearly — 5 Rules',type:'doc',duration:'25m',content:'Guide + examples'},{title:'2. Active Listening Lab',type:'video',duration:'20m',content:'Mirroring demos'},{title:'3. Feedback without Friction',type:'doc',duration:'20m',content:'SBI model'},{title:'4. Practice: Feedback Lab',type:'assignment',duration:'25m',content:'Peer feedback'},{title:'5. Quiz — Communication',type:'quiz',duration:'10m',content:'10 Qs, 70% pass'}],
    'Customer Service Excellence': [{title:'1. Service Mindset & Empathy Map',type:'doc',duration:'40m',content:'Playbook + empathy canvas'},{title:'2. Handling Complaints — HEARD',type:'video',duration:'45m',content:'HEARD technique demos'},{title:'3. Role-play: Difficult Customer',type:'assignment',duration:'30m',content:'Record 2-min voice note'},{title:'4. NPS & Follow-up',type:'doc',duration:'25m',content:'Follow-up scripts'},{title:'5. Final Test — Service',type:'quiz',duration:'20m',content:'15 Qs, 70% pass'}],
  };
  Object.entries(robustMap).forEach(([title,mods])=>{
    const tr=s.trainings.find(t=>t.title===title);
    if(tr && tr.modules.length < 5){
      tr.modules=mods.map(m=>({id:uid(), title:m.title, type:m.type, content:m.content, duration:m.duration}));
      tr.description = title==='Work-Life Balance'?'Stress, boundaries, burnout prevention, focus & recovery.': title==='Grit & Resilience'?'Duckworth grit, growth mindset, bouncing back from failure.': title==='Effective Communication'?'Writing, listening, feedback without friction, remote comms.':'Handling complaints, empathy and service recovery for frontline teams.';
      tr.duration= title==='Customer Service Excellence'?'3h': title==='Work-Life Balance'?'2h': title==='Grit & Resilience'?'2h':'1.5h';
      changed=true;
    }
  });
  s.employees.forEach(e=>{
    if(!e.documents){ e.documents={}; changed=true; }
    if(e.nin===undefined){ e.nin=''; e.payeTin=''; e.nhfNumber=''; e.pensionPin=''; e.nsitfNumber=''; changed=true; }
    if(e.passportPhoto===undefined){ e.passportPhoto=null; changed=true; }
    DOC_TYPES.forEach(dt=>{ if(e.documents[dt.key]===undefined) e.documents[dt.key]=null; });
    if(e.passportPhoto && !e.documents['passport']){ e.documents['passport']={fileName:'passport.jpg', size:0, uploadedAt: new Date().toISOString().slice(0,10), dataUrl:e.passportPhoto, status:'verified'}; changed=true; }
    if(e.documents['passport']?.dataUrl && !e.passportPhoto){ e.passportPhoto=e.documents['passport'].dataUrl; changed=true; }
  });
  return s;
}
function seedDemo(){
  const today=new Date(); const fmt=(d)=>d.toISOString().slice(0,10);
  const team=[
    ['Chiamaka Nwosu','Operations Manager',420000, fmt(addDays(today,10-365*3)), '1990-06-15'],
    ['Emeka Obi','Sales Lead',350000, fmt(addDays(today,-400)), fmt(addDays(today,10))],
    ['Halima Sule','Accountant',380000, fmt(addDays(today,18-365*2)), '1988-11-02'],
    ['Tobi Ogundele','Warehouse Supervisor',220000, fmt(addDays(today,-200)), '1995-01-20'],
    ['Rita Ekwueme','Customer Support',180000, fmt(addDays(today,-90)), '1997-04-09'],
    ['Yusuf Danladi','Driver',150000, fmt(addDays(today,-500)), '1992-08-30'],
  ];
  const employees=team.map(([name,role,gross,startDate,dob],i)=>({
    id:uid(),name,role,gross,bank:'GTBank',account:'0123456789',startDate,dob,active:true,color:AVATAR_COLORS[i%AVATAR_COLORS.length],
    nin:'', payeTin:'', nhfNumber:'', pensionPin:'', nsitfNumber:'', passportPhoto:null, documents:{}
  }));
  employees.forEach(e=> DOC_TYPES.forEach(dt=> e.documents[dt.key]=null));
  // seed some docs for demo
  employees[0].documents['cv']={fileName:'Chiamaka_CV.pdf', size:124000, uploadedAt:fmt(addDays(today,-300)), dataUrl:null, status:'verified'};
  employees[0].documents['offer']={fileName:'Offer.pdf', size:89000, uploadedAt:fmt(addDays(today,-295)), dataUrl:null, status:'verified'};
  employees[0].nin='12345678901'; employees[0].payeTin='PAYE-001'; employees[0].nhfNumber='NHF-8841'; employees[0].pensionPin='PEN123456';
  employees[1].nin='98765432109'; employees[1].payeTin='PAYE-002';
  const reviews=[
    {id:uid(), employeeId:employees[0].id, rating:5, notes:'Consistently keeps operations running smoothly.', date:fmt(addDays(today,-45))},
    {id:uid(), employeeId:employees[1].id, rating:4, notes:'Strong quarter on new client acquisition.', date:fmt(addDays(today,-20))},
  ];
  const candidates=[
    {id:uid(), name:'Ngozi Umeh', role:'Warehouse Assistant', stage:'Interview', appliedDate:fmt(addDays(today,-6)), notes:'Referred by Tobi'},
    {id:uid(), name:'Femi Bello', role:'Sales Associate', stage:'Applied', appliedDate:fmt(addDays(today,-2)), notes:''},
    {id:uid(), name:'Kelechi Ude', role:'Accountant (Assistant)', stage:'Offer', appliedDate:fmt(addDays(today,-12)), notes:'Offer sent'},
  ];
  const trainings=[
    {id:uid(), title:'Workplace Safety Essentials', category:'Compliance', duration:'2.5h', description:'HSE Act-aligned: emergency, PPE, fire, hygiene, and incident reporting. Mandatory for all staff.', objectives:'Identify hazards, follow PPE, report incidents, evacuate safely.', modules:[
      {id:uid(), title:'1. HSE Policy & Legal Duties', type:'doc', content:'Handbook: OSHA/Nigeria Factories Act duties (PDF + checklist)', duration:'30m'},
      {id:uid(), title:'2. PPE & Workplace Hazards', type:'video', content:'Video: PPE demo, slips/trips, electrical', duration:'25m'},
      {id:uid(), title:'3. Fire & Emergency Evacuation', type:'video', content:'Drill walkthrough + exit mapping exercise', duration:'30m'},
      {id:uid(), title:'4. Hygiene & Incident Reporting', type:'assignment', content:'Complete incident form sample — submit for review', duration:'25m'},
      {id:uid(), title:'5. Final Assessment — Safety', type:'quiz', content:'20 Qs, 70% pass, 3 attempts, certificate on pass', duration:'20m'},
    ], required:true, createdAt:fmt(today)},
    {id:uid(), title:'HR Compliance & Ethics', category:'Compliance', duration:'1.5h', description:'Code of conduct, confidentiality, anti-harassment, data protection (NDPA 2023).', objectives:'Apply code, protect data, handle grievances ethically.', modules:[
      {id:uid(), title:'1. Code of Conduct & Conflicts', type:'doc', content:'Policy doc + scenario cards (10 cases)', duration:'30m'},
      {id:uid(), title:'2. Confidentiality & NDPA', type:'doc', content:'Data handling guide + do/don\'ts', duration:'20m'},
      {id:uid(), title:'3. Anti-Harassment & Grievance', type:'video', content:'Role-plays: speaking up safely', duration:'20m'},
      {id:uid(), title:'4. Assessment — Ethics', type:'quiz', content:'15 Qs, 70% pass', duration:'15m'},
    ], required:true, createdAt:fmt(today)},
    {id:uid(), title:'Customer Service Excellence', category:'Skills', duration:'3h', description:'Service recovery, empathy, difficult customers, NPS. For Sales & Support.', objectives:'De-escalate, empathize, close with satisfaction.', modules:[
      {id:uid(), title:'1. Service Mindset & Empathy Map', type:'doc', content:'Playbook + empathy canvas', duration:'40m'},
      {id:uid(), title:'2. Handling Complaints — HEARD', type:'video', content:'HEARD technique demos (5 videos)', duration:'45m'},
      {id:uid(), title:'3. Role-play: Difficult Customer', type:'assignment', content:'Record 2-min voice note — peer review', duration:'30m'},
      {id:uid(), title:'4. NPS & Follow-up', type:'doc', content:'Follow-up scripts + survey', duration:'25m'},
      {id:uid(), title:'5. Final Test — Service', type:'quiz', content:'15 Qs, 70% pass', duration:'20m'},
    ], required:false, createdAt:fmt(today)},
    {id:uid(), title:'Work-Life Balance', category:'Wellness', duration:'2h', description:'Stress, boundaries, burnout prevention, focus & recovery.', objectives:'Set boundaries, manage energy, build recovery routine.', modules:[
      {id:uid(), title:'1. Understanding Burnout — Signals', type:'doc', content:'Maslach inventory + 12 signals checklist', duration:'20m'},
      {id:uid(), title:'2. Time & Energy Management', type:'video', content:'Pomodoro, deep work, no-meeting blocks (video)', duration:'30m'},
      {id:uid(), title:'3. Recovery Toolkit', type:'doc', content:'Sleep, movement, mindfulness micro-habits', duration:'20m'},
      {id:uid(), title:'4. Wellness Plan Worksheet', type:'assignment', content:'Draft 7-day balance plan — manager review', duration:'25m'},
      {id:uid(), title:'5. Assessment — Balance', type:'quiz', content:'10 Qs, 70% pass', duration:'15m'},
    ], required:false, createdAt:fmt(today)},
    {id:uid(), title:'Grit & Resilience', category:'Mindset', duration:'2h', description:'Duckworth grit, growth mindset, bouncing back from failure.', objectives:'Reframe failure, sustain effort, build resilience.', modules:[
      {id:uid(), title:'1. Grit Principles', type:'doc', content:'Angela Duckworth framework + self-test', duration:'25m'},
      {id:uid(), title:'2. Growth Mindset in Practice', type:'video', content:'Carol Dweck cases — fixed vs growth', duration:'30m'},
      {id:uid(), title:'3. Resilience Stories — Nigeria', type:'video', content:'Local entrepreneurs & grit interviews', duration:'30m'},
      {id:uid(), title:'4. Reflection Journal', type:'assignment', content:'Write 300-word grit story', duration:'20m'},
      {id:uid(), title:'5. Final Test — Grit', type:'quiz', content:'12 Qs, 70% pass', duration:'15m'},
    ], required:false, createdAt:fmt(today)},
    {id:uid(), title:'Effective Communication', category:'Skills', duration:'1.5h', description:'Writing, listening, feedback without friction, remote comms.', objectives:'Write clearly, listen actively, give feedback well.', modules:[
      {id:uid(), title:'1. Writing Clearly — 5 Rules', type:'doc', content:'Guide + before/after examples', duration:'25m'},
      {id:uid(), title:'2. Active Listening Lab', type:'video', content:'Mirroring, paraphrasing demos', duration:'20m'},
      {id:uid(), title:'3. Feedback without Friction', type:'doc', content:'SBI model + scripts', duration:'20m'},
      {id:uid(), title:'4. Practice: Feedback Lab', type:'assignment', content:'Peer feedback — record & reflect', duration:'25m'},
      {id:uid(), title:'5. Quiz — Communication', type:'quiz', content:'10 Qs, 70% pass', duration:'10m'},
    ], required:false, createdAt:fmt(today)},
  ];
  const enrollments=[
    {id:uid(), employeeId:employees[2].id, trainingId: trainings[0].id, progress:66, completedModules:[trainings[0].modules[0].id], enrolledAt:fmt(addDays(today,-10)), completedAt:null, score:null, certificateId:null},
    {id:uid(), employeeId:employees[0].id, trainingId: trainings[1].id, progress:100, completedModules: trainings[1].modules.map(m=>m.id), enrolledAt:fmt(addDays(today,-20)), completedAt:fmt(addDays(today,-5)), score:85, certificateId: uid()},
  ];
  const certificates=enrollments.filter(e=>e.certificateId).map(e=>({id:e.certificateId, employeeId:e.employeeId, trainingId:e.trainingId, issuedAt:e.completedAt, score:e.score}));
  const leaves=[
    {id:uid(), employeeId:employees[0].id, type:'annual', from:fmt(addDays(today,5)), to:fmt(addDays(today,9)), days:5, reason:'Family event', status:'approved', createdAt:fmt(addDays(today,-2))},
    {id:uid(), employeeId:employees[1].id, type:'sick', from:fmt(addDays(today,1)), to:fmt(addDays(today,2)), days:2, reason:'Medical', status:'pending', createdAt:fmt(today)},
  ];
  const attendance=[
    {id:uid(), employeeId:employees[0].id, date:fmt(today), clockIn:'08:12', clockOut:'17:05', status:'present'},
    {id:uid(), employeeId:employees[1].id, date:fmt(today), clockIn:'08:45', clockOut:null, status:'present'},
    {id:uid(), employeeId:employees[3].id, date:fmt(today), clockIn:null, clockOut:null, status:'absent'},
  ];
  const orgUnits=[
    {id:'dept1', name:'Operations', head:employees[0].id, color:'#4C8577'},
    {id:'dept2', name:'Sales & Support', head:employees[1].id, color:'#E2735B'},
    {id:'dept3', name:'Finance', head:employees[2].id, color:'#C9A227'},
    {id:'dept4', name:'Warehouse', head:employees[3].id, color:'#7D6BA6'},
  ];
  employees.forEach((e,i)=> e.department = orgUnits[i%orgUnits.length].id);
  return {companyName:'', employees, runs:[], compliance:{}, reviews, candidates, trainings, enrollments, certificates, leaves, attendance, orgUnits, currentRole:'owner', viewingEmployeeId:null};
}

export default function Page(){
  const [state,setState]=useState(null);
  const [demoMode,setDemoMode]=useState(false);
  const [currentTab,setCurrentTab]=useState('overview');
  const [expandedRun,setExpandedRun]=useState(null);
  const [online,setOnline]=useState(true);
  const [modal,setModal]=useState(null);
  const [toast,setToast]=useState(null);
  const [docFilter,setDocFilter]=useState('All');
  const [licenseKey,setLicenseKey]=useState('');
  const [licenseOk,setLicenseOk]=useState(false);
  const [licenseChecking,setLicenseChecking]=useState(true);
  const [apiUser,setApiUser]=useState(null);
  const [cloudLoading,setCloudLoading]=useState(false);
  const [authForm,setAuthForm]=useState({mode:'login',companyName:'',name:'',email:'',password:''});

  function cloudOff(){
    try{
      const params=new URLSearchParams(window.location.search);
      return params.get('local')==='1' || localStorage.getItem(CLOUD_OFF_KEY)==='1';
    }catch{ return true; }
  }
  async function hydrateCloud(){
    const me=getSessionUser();
    if(me) setApiUser(me);
    setCloudLoading(true);
    try{
      const [emps,runs]=await Promise.all([EmployeesAPI.list().catch(()=>null), PayrollAPI.list().catch(()=>null)]);
      setState(s=>{
        if(!s) return s;
        const ns=JSON.parse(JSON.stringify(s));
        if(Array.isArray(emps)){
          if(me && me.role==='employee'){
            ns.employees=emps.map((e,i)=>cloudEmployeeToLocal(e,i));
            ns.currentRole='employee';
            ns.viewingEmployeeId=me.employeeId||emps[0]?.id||null;
          } else {
            ns.employees=emps.map((e,i)=>{
              const prev=(s.employees||[]).find(x=>x.id===e.id);
              const m=cloudEmployeeToLocal(e,i);
              if(prev){ m.color=prev.color; m.department=prev.department||m.department; m.documents=prev.documents||m.documents; m.passportPhoto=prev.passportPhoto||null; }
              if(!m.department && ns.orgUnits && ns.orgUnits.length) m.department=ns.orgUnits[i%ns.orgUnits.length].id;
              return m;
            });
          }
        }
        if(Array.isArray(runs)){
          if(me && me.role==='employee'){
            ns.runs=runs.map((r,i)=>({ id:'cloud-'+r.period+'-'+i, period:r.period, createdAt:r.createdAt, lines:r.line?[{...r.line,bank:r.line.bank||'',account:r.line.account||'',nsitf:Math.round((r.line.gross||0)*0.01)}]:[], status:'paid' }));
          } else ns.runs=runs.map(cloudRunToLocal);
        }
        return ns;
      });
    }finally{ setCloudLoading(false); }
  }

  useEffect(()=>{
    const demoParams=new URLSearchParams(window.location.search);
    const isPublicDemo=demoParams.get('demo')==='1';
    setDemoMode(isPublicDemo);
    let loaded=loadState(isPublicDemo ? 'medash_public_demo_v1' : undefined);
    if(loaded){ loaded=migrateState(loaded); setState(loaded); }
    else { const s=seedDemo(); setState(s); saveState(s,isPublicDemo ? 'medash_public_demo_v1' : undefined); }
    // Cloud backend (opt-in): hydrate employees + payroll when configured + logged in
    try{ if(getApiBase() && !cloudOff() && getToken()) hydrateCloud(); else { const me=getSessionUser(); if(me && getToken()) setApiUser(me); } }catch{}
    const updateOnline=()=>setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener('online',updateOnline);
    window.addEventListener('offline',updateOnline);
    if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(()=>{}); }
    // SaaS license check — Selar. Allow bypass via ?license=ROOST-xxx or ?demo=1 for owner testing
    const params=new URLSearchParams(window.location.search);
    const urlKey=params.get('license');
    const demoBypass=params.get('demo')==='1';
    if(demoBypass){ setLicenseOk(true); setLicenseChecking(false); }
    else if(urlKey && isValidFormat(urlKey)){ saveLicense(urlKey,{plan:'url'}); setLicenseKey(normalizeKey(urlKey)); setLicenseOk(true); setLicenseChecking(false); }
    else {
      const stored=getStoredKey();
      if(stored && isValidFormat(stored)){
        // verify with API (offline falls back to format check)
        fetch('/api/verify',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key:stored})}).then(r=>r.json()).then(j=>{
          setLicenseOk(!!j.valid); setLicenseChecking(false); if(!j.valid) setLicenseKey(stored);
        }).catch(()=>{ setLicenseOk(true); setLicenseChecking(false); });
      } else { if(stored) setLicenseKey(stored); setLicenseOk(false); setLicenseChecking(false); }
    }
    return ()=>{ window.removeEventListener('online',updateOnline); window.removeEventListener('offline',updateOnline); };
  },[]);
  useEffect(()=>{ if(state) saveState(state,demoMode ? 'medash_public_demo_v1' : undefined); },[state,demoMode]);
  useEffect(()=>{ if(!online) setToast("You are offline — changes will sync when you reconnect."); else if(toast && toast.includes("offline")) setToast("Back online ✓"); },[online]);

  if(licenseChecking || !state) return <div style={{padding:60,textAlign:'center',color:'#B39FB0'}}>Loading Medash HR Suite…</div>;
  async function handleLicenseSubmit(e){
    e.preventDefault();
    if(!isValidFormat(licenseKey)) { showToast('Invalid key. Format: ROOST-XXXX-XXXX-...'); return; }
    try{
      const res=await fetch('/api/verify',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key:licenseKey})});
      const j=await res.json();
      if(j.valid){ saveLicense(licenseKey,{plan:j.plan}); setLicenseOk(true); showToast('License activated ✓'); }
      else { showToast(j.reason||'Invalid license'); }
    }catch{
      // offline: accept format-valid key
      saveLicense(licenseKey,{plan:'offline'}); setLicenseOk(true); showToast('License saved (offline)');
    }
  }
  if(!licenseOk){
    return (
      <div style={{minHeight:'100vh', background:'#241623', color:'#EDEEF2', display:'flex', alignItems:'center', justifyContent:'center', padding:24}}>
        <div style={{maxWidth:520, width:'100%', background:'#EDEEF2', color:'#201526', borderRadius:12, padding:32, boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}><div style={{width:36,height:36,borderRadius:'50% 50% 50% 6px',background:'#E2735B'}}/><div><div style={{fontFamily:'Newsreader, serif',fontStyle:'italic',fontWeight:700,fontSize:22}} >Medash HR Suite</div><div style={{fontSize:12,opacity:0.6}}>Payroll, HR & Compliance — SaaS License</div></div></div>
          <h2 style={{fontFamily:'Newsreader, serif',fontSize:18,marginBottom:8}}>Enter your license key</h2>
          <p style={{fontSize:13,opacity:0.7,lineHeight:1.5}}>You purchased on <b>Selar</b>. Paste the key from your delivery email. Keys look like <code style={{background:'#fff',padding:'2px 6px',borderRadius:4}}>ROOST-XXXX-XXXX-XXXX</code>. Need help? Contact your Medash administrator.</p>
          <form onSubmit={handleLicenseSubmit} style={{marginTop:16}}>
            <input value={licenseKey} onChange={ev=>setLicenseKey(ev.target.value)} placeholder="ROOST-XXXX-XXXX-XXXX" style={{width:'100%',padding:'12px 14px',borderRadius:8,border:'1px solid rgba(32,21,38,0.2)',fontFamily:'IBM Plex Mono',fontSize:14,background:'#fff'}}/>
            <button type="submit" className="btn btn-primary" style={{width:'100%',marginTop:12,padding:12}}>Activate license</button>
          </form>
          <div style={{marginTop:14,display:'flex',gap:8,flexWrap:'wrap'}}>
            <a href="https://selar.co/m/theoeugene131-tech" target="_blank" rel="noreferrer" style={{fontSize:12,background:'#201526',color:'#fff',padding:'8px 12px',borderRadius:6,textDecoration:'none'}}>Buy on Selar</a>
            <a href="?demo=1" style={{fontSize:12,border:'1px solid rgba(32,21,38,0.2)',padding:'8px 12px',borderRadius:6,textDecoration:'none',color:'#201526'}}>Continue as demo (owner test)</a>
            <button onClick={()=>{ setLicenseKey(''); clearLicense(); }} style={{fontSize:12,background:'transparent',border:'1px solid rgba(32,21,38,0.2)',padding:'8px 12px',borderRadius:6,cursor:'pointer'}}>Clear</button>
          </div>
          <p style={{fontSize:11,opacity:0.55,marginTop:14}}>Developed by <b>Next Level Global</b>. Secure SaaS — key verified via <code>/api/verify</code>. Offline keys accepted after first online activation. Selar webhook → <code>/api/selar-webhook</code> auto-generates keys on purchase.</p>
        </div>
      </div>
    );
  }
  const cloudBase=getApiBase();
  const cloudMode=!!(!demoMode && cloudBase && !cloudOff() && apiUser && getToken());
  const tabs=visibleTabs(cloudMode && apiUser.role==='employee' ? 'employee' : state.currentRole);
  const activeTabs=tabs.includes(currentTab)?currentTab:tabs[0];
  if(activeTabs!==currentTab) setCurrentTab(activeTabs);
  function update(fn){ setState(s=>{ const ns=JSON.parse(JSON.stringify(s)); fn(ns); return ns; }); }
  function showToast(m){ setToast(m); setTimeout(()=>setToast(null),2800); }
  const period=nextPeriod(state.runs);
  const activeEmployees=state.employees.filter(e=>e.active);
  if(!demoMode && cloudBase && !cloudOff() && !apiUser){
    return <AuthScreen authForm={authForm} setAuthForm={setAuthForm} showToast={showToast} onAuth={()=>{ hydrateCloud(); }} />;
  }

  return (
    <>
      <style>{`
        :root{--bg:#241623;--bg-2:#2E1D2D;--paper:#EDEEF2;--paper-dim:#E0E2E8;--ink:#201526;--coral:#E2735B;--gold:#C9A227;--teal:#4C8577;--muted:#B39FB0;--line:rgba(237,238,242,0.09);}
        header{padding:30px 40px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:20px;}
        .brand{display:flex;align-items:center;gap:12px;padding-bottom:22px;}
        .brand-mark{width:32px;height:32px;border-radius:50% 50% 50% 6px;background:var(--coral);position:relative;flex-shrink:0;}
        .brand-mark::after{content:'';position:absolute;inset:0;margin:auto;width:11px;height:11px;border-radius:50%;background:var(--bg);}
        .stats{display:flex;gap:30px;flex-wrap:wrap;padding-bottom:22px;}
        .stat .label{font-size:10.5px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:4px;}
        .stat .value{font-family:'Newsreader',serif;font-size:23px;font-weight:600;}
        nav.tabs{display:flex;align-items:center;gap:12px;padding:14px 40px;border-bottom:1px solid var(--line);flex-wrap:wrap;}
        .nav-picker{display:flex;align-items:center;gap:8px;min-width:0;}
        .nav-picker label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700;}
        .nav-picker select{max-width:100%;background:var(--bg-2);color:var(--paper);border:1px solid var(--line);border-radius:7px;padding:10px 12px;font-size:13px;min-width:180px;cursor:pointer;}
        .nav-picker.page-picker select{min-width:210px;}
        .nav-context{font-size:12px;color:var(--muted);margin-left:auto;}
        @media(max-width:720px){nav.tabs{gap:10px;} .nav-picker{width:100%;justify-content:space-between;} .nav-picker select,.nav-picker.page-picker select{flex:1;min-width:0;} .nav-context{display:none;}}
        main{padding:28px 40px 60px;}
        .panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:14px;}
        .panel-head h2{font-family:'Newsreader',serif;font-size:19px;font-weight:600;}
        .btn{font-size:13px;font-weight:600;padding:10px 18px;border-radius:6px;border:none;cursor:pointer;}
        .btn-primary{background:var(--coral);color:var(--paper);}
        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;}
        .card{background:var(--paper);color:var(--ink);border-radius:8px;padding:18px;box-shadow:0 10px 26px rgba(0,0,0,0.18);display:flex;flex-direction:column;gap:12px;}
        .card.inactive{opacity:0.5;}
        .run-row{background:var(--paper);color:var(--ink);border-radius:8px;padding:16px 20px;margin-bottom:10px;box-shadow:0 6px 18px rgba(0,0,0,0.14);}
        .overlay{position:fixed;inset:0;background:rgba(9,8,12,0.72);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:50;padding:24px;}
        .modal{background:var(--paper);color:var(--ink);width:100%;max-width:640px;border-radius:8px;padding:28px 30px;max-height:88vh;overflow-y:auto;}
        .field{margin-bottom:12px;}
        .field label{display:block;font-size:12px;font-weight:600;margin-bottom:5px;}
        .field input,.field select{width:100%;padding:9px 11px;border-radius:5px;border:1px solid rgba(32,21,38,0.2);font-size:13px;background:#fff;}
        .field-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
        @media(max-width:720px){header,main,nav.tabs{padding-left:20px;padding-right:20px;}.field-row{grid-template-columns:1fr;}}
      `}</style>

      <div style={{background: online? '#4C8577':'#E2735B', color:'#fff', textAlign:'center', fontSize:12, padding:'6px 10px', fontWeight:600}}>
        {demoMode ? '● FREE DEMO — sample data only; changes stay in this browser' : (online? '● Online — synced':'○ Offline — working locally, will sync when reconnected') + '  |  Medash HR Suite'}
        {!demoMode && <button onClick={()=>{ if(confirm('Remove license?')){ clearLicense(); setLicenseOk(false); setLicenseKey(''); location.reload(); } }} style={{marginLeft:10, background:'rgba(0,0,0,0.2)', color:'#fff', border:'none', padding:'2px 8px', borderRadius:10, fontSize:10, cursor:'pointer'}}>Sign out</button>}
      </div>
      {toast && <div style={{position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)', background:'#201526', color:'#EDEEF2', padding:'10px 16px', borderRadius:8, fontSize:13, zIndex:60}}>{toast}</div>}

      <header>
        <div className="brand">
          <div className="brand-mark"></div>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <h1 style={{fontFamily:'Newsreader, serif', fontSize:22, fontWeight:600, fontStyle:'italic'}}>Medash HR Suite</h1>
              <span style={{fontSize:10,background:'rgba(237,238,242,0.08)',border:'1px solid var(--line)',padding:'2px 6px',borderRadius:20,color:'var(--muted)'}}>{state.companyName || '—'}</span>
            </div>
            <p style={{fontSize:11.5, color:'var(--muted)', marginTop:2}}>HR Management · Payroll · Training</p>
            <div style={{marginTop:8,display:'flex',gap:6,alignItems:'center'}}>
              <input
                placeholder="Company name — e.g. GreenField Ltd"
                value={state.companyName||''}
                onChange={e=>update(s=>s.companyName=e.target.value)}
                onBlur={()=>showToast(state.companyName? `Company: ${state.companyName}` : 'Company name cleared')}
                style={{background:'var(--bg-2)',color:'var(--paper)',border:'1px solid var(--line)',borderRadius:6,padding:'7px 10px',fontSize:12.5, minWidth:240, maxWidth:320}}
              />
              <span style={{fontSize:10,color:'var(--muted)'}}>shown on payslips & reports</span>
            </div>
          </div>
        </div>
        <div>
          <div style={{display:'flex',gap:8,alignItems:'center',paddingBottom:22, flexWrap:'wrap'}}>
            <select value={state.currentRole} onChange={e=>update(s=>{s.currentRole=e.target.value; if(s.currentRole==='employee'&& !s.viewingEmployeeId && s.employees.length) s.viewingEmployeeId=s.employees[0].id;})} style={{background:'var(--bg-2)',color:'var(--paper)',border:'1px solid var(--line)',borderRadius:6,padding:'8px 10px',fontSize:12.5}}>
              <option value="owner">Viewing as: Owner</option>
              <option value="admin">Viewing as: HR Admin</option>
              <option value="employee">Viewing as: Employee</option>
            </select>
            {state.currentRole==='employee' && <select value={state.viewingEmployeeId||state.employees[0]?.id} onChange={e=>update(s=>s.viewingEmployeeId=e.target.value)} style={{background:'var(--bg-2)',color:'var(--paper)',border:'1px solid var(--line)',borderRadius:6,padding:'8px 10px',fontSize:12.5}}>
              {state.employees.map(emp=><option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>}
            <button onClick={()=>{
              const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
              const url=URL.createObjectURL(blob);
              const a=document.createElement('a'); a.href=url; a.download=`medash-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); showToast('Backup saved — keeps all data offline-safe');
            }} style={{background:'#4C8577',color:'#fff',border:'none',borderRadius:6,padding:'8px 10px',fontSize:11,cursor:'pointer',fontWeight:700}}>⬇ Save / Backup</button>
            <label style={{background:'transparent',border:'1px solid var(--line)',color:'var(--muted)',borderRadius:6,padding:'8px 10px',fontSize:11,cursor:'pointer'}}>⬆ Restore<input type="file" accept=".json" style={{display:'none'}} onChange={ev=>{ const f=ev.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ const j=JSON.parse(r.result); if(!j.employees) throw new Error('Invalid backup'); if(confirm(`Restore backup from ${j.companyName||'file'}? This will overwrite current data.`)){ const mig=migrateState(j); setState(mig); saveState(mig,demoMode ? 'medash_public_demo_v1' : undefined); showToast('Backup restored ✓'); }}catch(e){ alert('Invalid backup file'); } }; r.readAsText(f); }}/></label>
            <button onClick={()=>{ if(confirm('Reset to demo data?')){ const s=seedDemo(); setState(s); saveState(s,demoMode ? 'medash_public_demo_v1' : undefined); showToast('Demo data restored'); } }} style={{background:'transparent',border:'1px solid var(--line)',color:'var(--muted)',borderRadius:6,padding:'8px 10px',fontSize:11,cursor:'pointer'}}>Reset demo</button>
            {cloudMode
              ? <span style={{fontSize:11,background:'rgba(76,133,119,0.2)',border:'1px solid rgba(76,133,119,0.5)',color:'#7FD1B9',borderRadius:6,padding:'8px 10px'}}>☁ {apiUser.email||apiUser.role}{cloudLoading?' · syncing…':''}</span>
              : cloudBase
                ? <span style={{fontSize:11,background:'transparent',border:'1px solid var(--line)',color:'var(--muted)',borderRadius:6,padding:'8px 10px'}}>○ Offline mode</span>
                : null}
            {cloudMode && <button onClick={()=>{ if(confirm('Sign out of cloud? Local offline copy is kept.')){ clearSession(); setApiUser(null); showToast('Signed out of cloud'); } }} style={{background:'transparent',border:'1px solid var(--line)',color:'var(--muted)',borderRadius:6,padding:'8px 10px',fontSize:11,cursor:'pointer'}}>Sign out</button>}
            {!cloudBase && <button onClick={()=>{ const u=prompt('Cloud backend URL (e.g. https://your-api.railway.app). Empty = stay offline:', ''); if(u && u.trim()){ setApiBaseOverride(u.trim()); location.reload(); } }} style={{background:'transparent',border:'1px solid var(--line)',color:'var(--muted)',borderRadius:6,padding:'8px 10px',fontSize:11,cursor:'pointer'}}>☁ Connect backend</button>}
          </div>
          {state.currentRole!=='employee' && <div className="stats">
            <div className="stat"><div className="label">Team size</div><div className="value">{activeEmployees.length}</div></div>
            <div className="stat"><div className="label">Monthly cost</div><div className="value">{money(activeEmployees.reduce((s,e)=>s+e.gross+estimateDeductions(e.gross).pensionEmployer,0))}</div></div>
            <div className="stat"><div className="label">Next payroll</div><div className="value">{periodLabel(period)}</div></div>
            <div className="stat"><div className="label">Compliance open</div><div className="value" style={{color:'var(--coral)'}}>{state.runs.length? ['paye','pension','nhf','nsitf'].filter(k=>complianceStatus(state, state.runs[state.runs.length-1].period,k)!=='filed').length:0}</div></div>
          </div>}
        </div>
      </header>

      <nav className="tabs" aria-label="Main navigation">
        {(() => {
          const navGroups = [
            {label:'HR', tabs:['overview','team','docs','org','leave','attendance','reviews','hiring','myprofile']},
            {label:'Payroll', tabs:['runpayroll','history','regulatory','compliance','reports']},
            {label:'Training', tabs:['training']},
          ].map(group=>({...group,tabs:group.tabs.filter(t=>tabs.includes(t))})).filter(group=>group.tabs.length);
          const activeGroup = navGroups.find(group=>group.tabs.includes(currentTab)) || navGroups[0];
          return <>
            <div className="nav-picker">
              <label htmlFor="nav-section">Section</label>
              <select id="nav-section" value={activeGroup?.label||''} onChange={e=>{
                const next=navGroups.find(group=>group.label===e.target.value);
                if(next?.tabs.length) setCurrentTab(next.tabs[0]);
              }}>
                {navGroups.map(group=><option key={group.label} value={group.label}>{group.label}</option>)}
              </select>
            </div>
            <div className="nav-picker page-picker">
              <label htmlFor="nav-page">Page</label>
              <select id="nav-page" value={currentTab} onChange={e=>setCurrentTab(e.target.value)}>
                {(activeGroup?.tabs||tabs).map(t=><option key={t} value={t}>{TAB_LABELS[t]}</option>)}
              </select>
            </div>
            <span className="nav-context">{TAB_LABELS[currentTab]}{state.companyName ? ' · '+state.companyName : ''}</span>
          </>;
        })()}
      </nav>

      <main>
        {currentTab==='overview' && <Overview state={state} setModal={setModal} />}
        {currentTab==='team' && <Team state={state} update={update} setModal={setModal} showToast={showToast} />}
        {currentTab==='docs' && <Documents state={state} update={update} setModal={setModal} showToast={showToast} docFilter={docFilter} setDocFilter={setDocFilter} />}
        {currentTab==='regulatory' && <Regulatory state={state} update={update} />}
        {currentTab==='training' && <Training state={state} update={update} setModal={setModal} showToast={showToast} />}
        {currentTab==='leave' && <Leave state={state} update={update} setModal={setModal} showToast={showToast} />}
        {currentTab==='attendance' && <Attendance state={state} update={update} setModal={setModal} showToast={showToast} />}
        {currentTab==='org' && <Org state={state} update={update} setModal={setModal} showToast={showToast} />}
        {currentTab==='runpayroll' && <RunPayroll state={state} update={update} setCurrentTab={setCurrentTab} showToast={showToast} />}
        {currentTab==='history' && <History state={state} expandedRun={expandedRun} setExpandedRun={setExpandedRun} />}
        {currentTab==='compliance' && <Compliance state={state} update={update} />}
        {currentTab==='reviews' && <Reviews state={state} update={update} setModal={setModal} />}
        {currentTab==='hiring' && <Hiring state={state} update={update} setModal={setModal} showToast={showToast} />}
        {currentTab==='reports' && <Reports state={state} />}
        {currentTab==='myprofile' && <MyProfile state={state} />}
      </main>
      <footer style={{borderTop:'1px solid var(--line)',padding:'16px 40px',textAlign:'center',fontSize:12,color:'var(--muted)',background:'rgba(0,0,0,0.15)'}}>
        Medash HR Suite · HR Management · Payroll · Training
      </footer>

      {modal && <Modal modal={modal} setModal={setModal} state={state} update={update} showToast={showToast} />}
    </>
  );
}

function Overview({state,setModal}){
  const lastRun=state.runs[state.runs.length-1];
  const items=[{key:'paye',what:'PAYE remittance',agency:'State IRS'},{key:'pension',what:'Pension remittance',agency:'PenCom / PFA'},{key:'nhf',what:'NHF remittance',agency:'Federal Mortgage Bank'},{key:'nsitf',what:'NSITF contribution',agency:'NSITF'}];
  const celebs=(()=>{
    const today=new Date(); today.setHours(0,0,0,0);
    const out=[];
    state.employees.filter(e=>e.active).forEach(e=>{
      if(e.dob){ const dob=new Date(e.dob); let next=new Date(today.getFullYear(),dob.getMonth(),dob.getDate()); if(next<today) next=new Date(today.getFullYear()+1,dob.getMonth(),dob.getDate()); const d=Math.round((next-today)/86400000); if(d<=30) out.push({emoji:'🎂',what:`${e.name}'s birthday`,when:d===0?'Today':`in ${d}d`,days:d}); }
      if(e.startDate){ const sd=new Date(e.startDate); let next=new Date(today.getFullYear(),sd.getMonth(),sd.getDate()); if(next<today) next=new Date(today.getFullYear()+1,sd.getMonth(),sd.getDate()); const y=next.getFullYear()-sd.getFullYear(); const d=Math.round((next-today)/86400000); if(d<=30&&y>0) out.push({emoji:'🎉',what:`${e.name}'s ${y}-year anniversary`,when:d===0?'Today':`in ${d}d`,days:d}); }
    });
    return out.sort((a,b)=>a.days-b.days);
  })();
  const docCompletion = state.employees.length? Math.round(100 * state.employees.reduce((s,e)=> s + DOC_TYPES.filter(dt=> e.documents?.[dt.key]).length / DOC_TYPES.length,0)/state.employees.length):0;
  return (<>
    {celebs.length>0 && <><div className="panel-head"><div><h2>Upcoming celebrations</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>Birthdays and work anniversaries in next 30 days</p></div></div>
    <div style={{display:'flex',gap:12,overflowX:'auto',paddingBottom:6,marginBottom:32}}>{celebs.map((c,i)=><div key={i} style={{flex:'0 0 auto',minWidth:200,background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:'14px 16px',display:'flex',gap:12,alignItems:'center'}}><span style={{fontSize:22}}>{c.emoji}</span><div><div style={{fontSize:12.5,fontWeight:600}}>{c.what}</div><div style={{fontSize:11,color:'var(--muted)'}}>{c.when}</div></div></div>)}</div></>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:14}}><div style={{fontSize:10,letterSpacing:0.06+'em',textTransform:'uppercase',color:'var(--muted)'}}>Doc compliance</div><div style={{fontFamily:'Newsreader',fontSize:22,fontWeight:600}}>{docCompletion}%</div><div style={{fontSize:11,color:'var(--muted)'}}>avg across team</div></div>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:14}}><div style={{fontSize:10,letterSpacing:0.06+'em',textTransform:'uppercase',color:'var(--muted)'}}>Staff with docs</div><div style={{fontFamily:'Newsreader',fontSize:22,fontWeight:600}}>{state.employees.filter(e=>DOC_TYPES.some(dt=>e.documents?.[dt.key])).length}/{state.employees.length}</div></div>
    </div>
    <div className="panel-head"><div><h2>Compliance calendar</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>Deadlines for most recent payroll run</p></div></div>
    {!lastRun ? <div style={{color:'var(--muted)',textAlign:'center',padding:'30px 0'}}>Run your first payroll to start tracking compliance deadlines.</div> :
      <div style={{display:'flex',gap:12,overflowX:'auto',paddingBottom:6,marginBottom:32}}>
        {items.map(it=>{
          const status=complianceStatus(state,lastRun.period,it.key);
          const due=getDueDates(lastRun.period)[it.key];
          const d=daysUntil(new Date(due));
          const dayText=status==='filed'?'✓':d<0?`${Math.abs(d)}d over`:`${d}d`;
          return <div key={it.key} style={{flex:'0 0 auto',minWidth:190,background:'var(--bg-2)',border:`1px solid ${status==='overdue'?'rgba(226,115,91,0.6)':'var(--line)'}`,borderRadius:8,padding:'14px 16px'}}>
            <div style={{fontFamily:'IBM Plex Mono',fontSize:19,fontWeight:600,color:status==='filed'?'var(--teal)':status==='overdue'?'var(--coral)':'var(--gold)'}}>{dayText}</div>
            <div style={{fontSize:12.5,marginTop:4,fontWeight:500}}>{it.what}</div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{it.agency} · {periodLabel(lastRun.period)}</div>
          </div>;
        })}
      </div>
    }
    <div className="panel-head"><div><h2>Team roster</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>Click name to view documents — {state.employees.filter(e=>e.active).length} active</p></div></div>
    <div className="grid">{state.employees.map(e=>{
      const d=estimateDeductions(e.gross);
      const progress=Math.round(100*DOC_TYPES.filter(dt=>e.documents?.[dt.key]).length/DOC_TYPES.length);
      return <div key={e.id} className={`card ${e.active?'':'inactive'}`}><div style={{display:'flex',gap:12,alignItems:'center'}}><div style={{width:40,height:40,borderRadius:'50%',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Newsreader',fontWeight:600,color:'#fff',background:e.color,flexShrink:0}}>{e.passportPhoto ? <img src={e.passportPhoto} alt='' style={{width:'100%',height:'100%',objectFit:'cover'}}/> : initials(e.name)}</div><div style={{flex:1}}><div style={{fontWeight:600,fontSize:14,cursor:'pointer',textDecoration:'underline',textDecorationColor:'rgba(32,21,38,0.15)'}} onClick={()=>setModal({type:'staffDocs',data:e.id})}>{e.name}</div><div style={{fontSize:11,opacity:0.6}}>{e.role}</div></div><div style={{fontSize:10,background:progress===100?'var(--teal)':progress>50?'var(--gold)':'rgba(226,115,91,0.2)',color:progress===100?'#fff':progress>50?'#fff':'#8C3B28',padding:'4px 6px',borderRadius:20,fontFamily:'IBM Plex Mono'}}>{progress}% docs</div></div><div style={{display:'flex',justifyContent:'space-between',fontSize:12.5}}><span style={{opacity:0.55}}>Gross</span><span style={{fontFamily:'IBM Plex Mono',fontWeight:600}}>{money(e.gross)}</span></div><div style={{display:'flex',justifyContent:'space-between',fontSize:12.5}}><span style={{opacity:0.55}}>Net pay</span><span style={{fontFamily:'IBM Plex Mono',fontWeight:600}}>{money(d.net)}</span></div>
      <div style={{height:4,background:'rgba(32,21,38,0.1)',borderRadius:4,overflow:'hidden'}}><div style={{width:`${progress}%`,height:'100%',background:'var(--teal)'}} /></div>
      </div>;
    })}</div>
  </>);
}
function Team({state,update,setModal,showToast}){
  const cloudOn=!!(getApiBase() && getToken());
  const cloudRole=getSessionUser()?.role;
  async function cloudToggle(e){
    try{ const r=await EmployeesAPI.update(e.id,{active:!e.active}); update(s=>{ s.employees.find(x=>x.id===e.id).active=r.active!==false; }); showToast(r.active!==false?'Reactivated (cloud) ✓':'Deactivated (cloud) ✓'); }
    catch(err){ showToast('Cloud update failed: '+err.message); }
  }
  async function cloudRemove(e){
    if(!confirm('Remove this teammate?')) return;
    try{ await EmployeesAPI.remove(e.id); update(s=>{ s.employees=s.employees.filter(x=>x.id!==e.id); }); showToast('Removed (cloud) ✓'); }
    catch(err){ showToast('Cloud remove failed: '+err.message); }
  }
  async function cloudInvite(e){
    const email=prompt(`Invite ${e.name} — their login email:`);
    if(!email) return;
    try{ const r=await AuthAPI.inviteEmployee({employeeId:e.id,email}); prompt('Share this one-time invite link (7-day expiry):', r.inviteUrl); showToast('Invite created ✓'); }
    catch(err){ showToast('Invite failed: '+err.message); }
  }
  return (<>
    <div className="panel-head"><div><h2>Team</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>Add, edit, or click name for documents{cloudOn?' · ☁ cloud sync on':''}</p></div><div style={{display:'flex',gap:8}}><button className="btn btn-primary" onClick={()=>setModal({type:'employee',data:null})}>+ Add teammate</button></div></div>
    {state.employees.length===0? <div style={{color:'var(--muted)',textAlign:'center',padding:30}}>No teammates yet.</div> :
      <div className="grid">{state.employees.map(e=>{
        const d=estimateDeductions(e.gross);
        const progress=Math.round(100*DOC_TYPES.filter(dt=>e.documents?.[dt.key]).length/DOC_TYPES.length);
        return <div key={e.id} className={`card ${e.active?'':'inactive'}`}><div style={{display:'flex',gap:12,alignItems:'center'}}><div style={{width:40,height:40,borderRadius:'50%',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Newsreader',fontWeight:600,color:'#fff',background:e.color,flexShrink:0}}>{e.passportPhoto ? <img src={e.passportPhoto} alt='' style={{width:'100%',height:'100%',objectFit:'cover'}}/> : initials(e.name)}</div><div style={{flex:1}}><div style={{fontWeight:600,fontSize:14,cursor:'pointer',color:'#201526',textDecoration:'underline'}} onClick={()=>setModal({type:'staffDocs',data:e.id})}>{e.name}</div><div style={{fontSize:11,opacity:0.6}}>{e.role}{e.active?'':' · inactive'} · {progress}% docs</div></div></div><div style={{display:'flex',justifyContent:'space-between',fontSize:12.5}}><span style={{opacity:0.55}}>Gross monthly</span><span style={{fontFamily:'IBM Plex Mono',fontWeight:600}}>{money(e.gross)}</span></div><div style={{display:'flex',justifyContent:'space-between',fontSize:12.5}}><span style={{opacity:0.55}}>Net pay</span><span style={{fontFamily:'IBM Plex Mono',fontWeight:600}}>{money(d.net)}</span></div>
        <div style={{display:'flex',gap:6,marginTop:2,flexWrap:'wrap'}}><button onClick={()=>setModal({type:'staffDocs',data:e.id})} style={{background:'var(--teal)',color:'#fff',border:'none',borderRadius:5,padding:'6px 10px',fontSize:11.5,cursor:'pointer'}}>📄 Docs</button><button onClick={()=>setModal({type:'employee',data:e.id})} style={{background:'#E0E2E8',border:'none',borderRadius:5,padding:'6px 10px',fontSize:11.5,cursor:'pointer',color:'#201526'}}>Edit</button><button onClick={()=>{ if(cloudOn) cloudToggle(e); else update(s=>{const emp=s.employees.find(x=>x.id===e.id); emp.active=!emp.active;}); }} style={{background:'#E0E2E8',border:'none',borderRadius:5,padding:'6px 10px',fontSize:11.5,cursor:'pointer',color:'#201526'}}>{e.active?'Deactivate':'Reactivate'}</button>{cloudOn && cloudRole!=='employee' && <button onClick={()=>cloudInvite(e)} style={{background:'#4C8577',color:'#fff',border:'none',borderRadius:5,padding:'6px 10px',fontSize:11.5,cursor:'pointer'}}>✉ Invite</button>}<button onClick={()=>{ if(cloudOn) cloudRemove(e); else { if(confirm('Remove this teammate?')) update(s=>{s.employees=s.employees.filter(x=>x.id!==e.id);}); showToast('Removed'); } }} style={{background:'transparent',border:'1px solid rgba(226,115,91,0.5)',borderRadius:5,padding:'6px 10px',fontSize:11.5,cursor:'pointer',color:'#E2735B'}}>Remove</button></div></div>;
      })}</div>
    }
  </>);
}
function Documents({state,update,setModal,showToast,docFilter,setDocFilter}){
  const cats=['All','Onboarding','IDs & Statutory','Appraisals'];
  const shown=docFilter==='All'? DOC_TYPES : DOC_TYPES.filter(d=>d.category===docFilter);
  const overall=state.employees.length? state.employees.reduce((s,e)=> s + DOC_TYPES.filter(dt=>e.documents?.[dt.key]).length,0) :0;
  const totalReq=state.employees.length * DOC_TYPES.length;
  return (<>
    <div className="panel-head"><div><h2>Document repository</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>Progress of staff compliance — proper order: onboarding → IDs → appraisals · {overall}/{totalReq} docs uploaded</p></div><button className="btn btn-ghost" style={{color:'var(--paper)',borderColor:'var(--line)'}} onClick={()=>{
      const header=['Staff',...DOC_TYPES.map(d=>d.label)].join(',');
      const rows=state.employees.map(e=> [ `"${e.name}"`, ...DOC_TYPES.map(dt=> e.documents?.[dt.key]?'✓':'' ) ].join(',')).join('\n');
      const csv=header+'\n'+rows; const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='roost-doc-compliance.csv'; a.click(); URL.revokeObjectURL(url);
      showToast('CSV exported');
    }}>Export CSV</button></div>
    <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
      {cats.map(c=><button key={c} onClick={()=>setDocFilter(c)} style={{padding:'6px 12px',borderRadius:20,fontSize:12,border:'1px solid var(--line)',background:docFilter===c?'var(--paper)':'transparent',color:docFilter===c?'var(--ink)':'var(--muted)',cursor:'pointer'}}>{c}</button>)}
      <span style={{marginLeft:'auto',fontSize:12,color:'var(--muted)'}}>Click row to edit staff docs · IDs (NIN/PAYE/NHF) editable inline</span>
    </div>
    <div style={{overflowX:'auto',background:'#EDEEF2',borderRadius:8,padding:12}}>
      <table style={{width:'100%',borderCollapse:'collapse',color:'#201526',fontSize:12, minWidth:900}}>
        <thead><tr style={{background:'#E0E2E8'}}>
          <th style={{textAlign:'left',padding:'8px 10px',position:'sticky',left:0,background:'#E0E2E8',minWidth:160}}>Staff</th>
          {shown.map(dt=> <th key={dt.key} style={{textAlign:'center',padding:'8px 6px',fontSize:10,lineHeight:1.2}}><div>{dt.label}</div><div style={{fontSize:9,opacity:0.55}}>{dt.required?'*':''}</div></th>)}
          <th style={{textAlign:'center',padding:'8px 10px'}}>IDs</th>
          <th style={{textAlign:'center',padding:'8px 10px'}}>%</th>
        </tr></thead>
        <tbody>
          {state.employees.map(e=>{
            const pct=Math.round(100*DOC_TYPES.filter(dt=>e.documents?.[dt.key]).length/DOC_TYPES.length);
            return <tr key={e.id} style={{borderBottom:'1px solid rgba(32,21,38,0.07)',cursor:'pointer'}} onClick={()=>setModal({type:'staffDocs',data:e.id})}>
              <td style={{padding:'8px 10px',fontWeight:600,position:'sticky',left:0,background:'#EDEEF2',display:'flex',gap:8,alignItems:'center'}}><span style={{width:28,height:28,borderRadius:'50%',background:e.color,color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,overflow:'hidden',flexShrink:0}}>{e.passportPhoto ? <img src={e.passportPhoto} alt='' style={{width:'100%',height:'100%',objectFit:'cover'}}/> : initials(e.name)}</span>{e.name}<span style={{fontSize:10,opacity:0.55,marginLeft:4}}>{e.role}</span></td>
              {shown.map(dt=>{
                const doc=e.documents?.[dt.key];
                return <td key={dt.key} style={{textAlign:'center',padding:'6px'}}><span style={{display:'inline-flex',width:22,height:22,borderRadius:'50%',alignItems:'center',justifyContent:'center',fontSize:12, background: doc?'#4C8577':'rgba(32,21,38,0.08)',color:doc?'#fff':'#8C3B28'}}>{doc?'✓':'·'}</span></td>;
              })}
              <td style={{padding:'6px 10px',fontSize:10,opacity:0.7}} onClick={ev=>ev.stopPropagation()}>
                <div>NIN:{e.nin||'—'} · PAYE:{e.payeTin||'—'} · NHF:{e.nhfNumber||'—'}</div>
              </td>
              <td style={{textAlign:'center',fontFamily:'IBM Plex Mono',fontWeight:700, color: pct===100?'#4C8577':pct>=50?'#8A6B0F':'#8C3B28'}}>{pct}%</td>
            </tr>;
          })}
        </tbody>
      </table>
      <div style={{fontSize:10,color:'rgba(32,21,38,0.55)',marginTop:8}}>* Required docs. IDs editable inside staff drawer. Files stored offline as base64 in localStorage (max ~5MB per file).</div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12,marginTop:16}}>
      {DOC_TYPES.map(dt=>{
        const count=state.employees.filter(e=>e.documents?.[dt.key]).length;
        const pct=state.employees.length? Math.round(100*count/state.employees.length):0;
        return <div key={dt.key} style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:12}}><div style={{fontSize:11,color:'var(--muted)',textTransform:'uppercase'}}>{dt.category}</div><div style={{fontSize:13,fontWeight:600,marginTop:2}}>{dt.label}</div><div style={{display:'flex',alignItems:'center',gap:8,marginTop:8}}><div style={{flex:1,height:6,background:'rgba(237,238,242,0.15)',borderRadius:6,overflow:'hidden'}}><div style={{width:`${pct}%`,height:'100%',background:'var(--teal)'}}/></div><span style={{fontSize:11,fontFamily:'IBM Plex Mono'}}>{count}/{state.employees.length} · {pct}%</span></div></div>;
      })}
    </div>
  </>);
}
function Regulatory({state,update}){
  if(!state.runs.length) return <><div className="panel-head"><div><h2>Regulatory Payables</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>Aggregated remittances due per period — PAYE, Pension, NHF, NSITF</p></div></div><div style={{color:'var(--muted)',textAlign:'center',padding:30}}>Run payroll to generate regulatory totals.</div></>;
  const items=[
    {key:'paye', label:'PAYE (State IRS)', color:'#E2735B'},
    {key:'pension', label:'Pension (PenCom) — Employee + Employer', color:'#4C8577'},
    {key:'nhf', label:'NHF (FMBN)', color:'#C9A227'},
    {key:'nsitf', label:'NSITF (1% Employer)', color:'#7D6BA6'},
  ];
  const rows = [...state.runs].reverse().map(r=>{
    const totals=r.lines.reduce((acc,l)=>({paye:acc.paye+l.monthlyPAYE, penEmp:acc.penEmp+l.pensionEmployee, penEmpr:acc.penEmpr+l.pensionEmployer, nhf:acc.nhf+l.nhf, nsitf:acc.nsitf+l.nsitf}), {paye:0,penEmp:0,penEmpr:0,nhf:0,nsitf:0});
    const pensionTotal=totals.penEmp+totals.penEmpr;
    const grand=totals.paye+pensionTotal+totals.nhf+totals.nsitf;
    const statuses=items.map(it=> complianceStatus(state,r.period, it.key==='paye'?'paye':it.key==='pension'?'pension':it.key==='nhf'?'nhf':'nsitf'));
    return {period:r.period, totals, pensionTotal, grand, statuses, lines:r.lines.length, createdAt:r.createdAt};
  });
  const allTotals=rows.reduce((a,r)=>({paye:a.paye+r.totals.paye, pension:a.pension+r.pensionTotal, nhf:a.nhf+r.totals.nhf, nsitf:a.nsitf+r.totals.nsitf, grand:a.grand+r.grand}),{paye:0,pension:0,nhf:0,nsitf:0,grand:0});
  return (<>
    <div className="panel-head"><div><h2>Regulatory Payables</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>All statutory remittances aggregated per payroll run — mark filed in Compliance tab</p></div>
      <button className="btn btn-primary" onClick={()=>{
        const header=['Period','PAYE','Pension','NHF','NSITF','Grand Total','Status'].join(',');
        const csv=[header, ...rows.map(r=> [periodLabel(r.period), r.totals.paye, r.pensionTotal, r.totals.nhf, r.totals.nsitf, r.grand, r.statuses.every(s=>s==='filed')?'Filed':'Pending'].join(','))].join('\n');
        const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='regulatory-payables.csv'; a.click(); URL.revokeObjectURL(url);
      }}>Export CSV</button>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:16}}>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:14}}><div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase'}}>Total PAYE due</div><div style={{fontFamily:'Newsreader',fontSize:20,fontWeight:600}}>{money(allTotals.paye)}</div></div>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:14}}><div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase'}}>Total Pension</div><div style={{fontFamily:'Newsreader',fontSize:20,fontWeight:600}}>{money(allTotals.pension)}</div><div style={{fontSize:11,color:'var(--muted)'}}>Ee + Er</div></div>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:14}}><div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase'}}>Total NHF</div><div style={{fontFamily:'Newsreader',fontSize:20,fontWeight:600}}>{money(allTotals.nhf)}</div></div>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:14}}><div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase'}}>Total NSITF</div><div style={{fontFamily:'Newsreader',fontSize:20,fontWeight:600}}>{money(allTotals.nsitf)}</div></div>
      <div style={{background:'var(--paper)',color:'var(--ink)',borderRadius:8,padding:14}}><div style={{fontSize:10,opacity:0.55,textTransform:'uppercase'}}>Grand remittable</div><div style={{fontFamily:'Newsreader',fontSize:20,fontWeight:600}}>{money(allTotals.grand)}</div></div>
    </div>
    <div style={{overflowX:'auto',background:'#EDEEF2',borderRadius:8}}>
      <table style={{width:'100%',borderCollapse:'collapse',color:'#201526',fontSize:13}}>
        <thead><tr style={{background:'#E0E2E8'}}>
          <th style={{textAlign:'left',padding:'12px 16px',fontSize:10.5,textTransform:'uppercase',opacity:0.55}}>Period</th>
          <th style={{textAlign:'right',padding:'12px 10px',fontSize:10.5,textTransform:'uppercase',opacity:0.55}}>PAYE</th>
          <th style={{textAlign:'right',padding:'12px 10px',fontSize:10.5,textTransform:'uppercase',opacity:0.55}}>Pension</th>
          <th style={{textAlign:'right',padding:'12px 10px',fontSize:10.5,textTransform:'uppercase',opacity:0.55}}>NHF</th>
          <th style={{textAlign:'right',padding:'12px 10px',fontSize:10.5,textTransform:'uppercase',opacity:0.55}}>NSITF</th>
          <th style={{textAlign:'right',padding:'12px 16px',fontSize:10.5,textTransform:'uppercase',opacity:0.55}}>Total</th>
          <th style={{textAlign:'left',padding:'12px 16px',fontSize:10.5,textTransform:'uppercase',opacity:0.55}}>Status</th>
        </tr></thead>
        <tbody>
          {rows.map(r=>{
            const allFiled=r.statuses.every(s=>s==='filed');
            const anyOver=r.statuses.some(s=>s==='overdue');
            return <tr key={r.period} style={{borderBottom:'1px solid rgba(32,21,38,0.07)'}}>
              <td style={{padding:'12px 16px'}}><div style={{fontWeight:600}}>{periodLabel(r.period)}</div><div style={{fontSize:11,opacity:0.55}}>{r.lines} staff · {new Date(r.createdAt).toLocaleDateString('en-NG')}</div></td>
              <td style={{textAlign:'right',padding:'12px 10px',fontFamily:'IBM Plex Mono'}}>{money(r.totals.paye)}</td>
              <td style={{textAlign:'right',padding:'12px 10px',fontFamily:'IBM Plex Mono'}}>{money(r.pensionTotal)}</td>
              <td style={{textAlign:'right',padding:'12px 10px',fontFamily:'IBM Plex Mono'}}>{money(r.totals.nhf)}</td>
              <td style={{textAlign:'right',padding:'12px 10px',fontFamily:'IBM Plex Mono'}}>{money(r.totals.nsitf)}</td>
              <td style={{textAlign:'right',padding:'12px 16px',fontFamily:'IBM Plex Mono',fontWeight:700}}>{money(r.grand)}</td>
              <td style={{padding:'12px 16px'}}><span style={{fontSize:11,padding:'4px 8px',borderRadius:20, background: allFiled?'rgba(76,133,119,0.15)':anyOver?'rgba(226,115,91,0.18)':'rgba(201,162,39,0.18)', color: allFiled?'#2E5C51':anyOver?'#8C3B28':'#8A6B0F'}}>{allFiled?'All filed':anyOver?'Overdue':'Pending'}</span></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <div style={{marginTop:12,display:'flex',gap:8,flexWrap:'wrap'}}>
      {items.map(it=> <span key={it.key} style={{fontSize:11,background:it.color,color:'#fff',padding:'4px 10px',borderRadius:20}}>{it.label}</span>)}
    </div>
  </>);
}
function printSchedule({companyName, period, lines}){
  const totalNet=lines.reduce((s,l)=>s+(l.net||0),0);
  const totalGross=lines.reduce((s,l)=>s+(l.gross||0),0);
  const w=window.open('','_blank');
  if(!w){ alert('Please allow pop-ups to print'); return; }
  w.document.write(`
  <html><head><title>Payment Schedule — ${periodLabel(period)}</title>
  <style>
    body{font-family:Inter, sans-serif; color:#1a1a1a; padding:32px; font-size:12px}
    h1{font-family:Newsreader, serif; font-size:20px; margin:0}
    h2{font-size:13px; color:#555; margin:4px 0 16px}
    table{width:100%; border-collapse:collapse; margin-top:12px}
    th{font-size:10px; text-transform:uppercase; letter-spacing:0.06em; text-align:left; padding:8px 6px; border-bottom:2px solid #222; background:#f3f3f3}
    td{padding:8px 6px; border-bottom:1px solid #ddd; font-size:12px}
    td.num{font-family:monospace; text-align:right}
    .tot{font-weight:700; background:#f9f9f9}
    .sign{margin-top:36px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px; font-size:12px}
    .sign div{border-top:1px solid #222; padding-top:6px}
    .hdr{display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #222; padding-bottom:12px}
    @media print{ button{display:none} }
  </style></head><body>
  <div class="hdr"><div><h1>${companyName || 'Company'}</h1><h2>Monthly Payment Schedule — ${periodLabel(period)} &nbsp;|&nbsp; Generated ${new Date().toLocaleDateString('en-NG')} ${new Date().toLocaleTimeString()}</h2></div><div style="text-align:right; font-size:11px">Medash HR Suite<br/>HR Management · Payroll · Training</div></div>
  <table>
    <thead><tr><th>#</th><th>Staff Name</th><th>Role</th><th>Bank</th><th>Account No.</th><th style="text-align:right">Gross</th><th style="text-align:right">PAYE</th><th style="text-align:right">Pension (8%)</th><th style="text-align:right">NHF</th><th style="text-align:right">Net Pay</th><th>Signature</th></tr></thead>
    <tbody>
      ${lines.map((l,i)=>`<tr><td>${i+1}</td><td>${l.name}</td><td>${l.role||''}</td><td>${l.bank||'—'}</td><td style="font-family:monospace">${l.account||'—'}</td><td class="num">${money(l.gross)}</td><td class="num">${money(l.monthlyPAYE||0)}</td><td class="num">${money(l.pensionEmployee||0)}</td><td class="num">${money(l.nhf||0)}</td><td class="num" style="font-weight:700">${money(l.net)}</td><td style="min-width:80px"></td></tr>`).join('')}
      <tr class="tot"><td colspan="5" style="text-align:right">TOTAL</td><td class="num">${money(totalGross)}</td><td class="num">${money(lines.reduce((s,l)=>s+(l.monthlyPAYE||0),0))}</td><td class="num">${money(lines.reduce((s,l)=>s+(l.pensionEmployee||0),0))}</td><td class="num">${money(lines.reduce((s,l)=>s+(l.nhf||0),0))}</td><td class="num">${money(totalNet)}</td><td></td></tr>
    </tbody>
  </table>
  <div style="margin-top:12px; font-size:11px; color:#555">Total Cost to Company (incl. 10% employer pension): <b>${money(lines.reduce((s,l)=>s+l.gross+(l.pensionEmployer||0),0))}</b> &nbsp;|&nbsp; ${lines.length} staff &nbsp;|&nbsp; Amount in words: ___________________________</div>
  <div class="sign"><div>Prepared by<br/><br/><br/>Name / Signature / Date</div><div>Checked by Finance<br/><br/><br/>Name / Signature / Date</div><div>Approved by CEO<br/><br/><br/>Name / Signature / Date</div></div>
  <div style="margin-top:24px; text-align:center"><button onclick="window.print()" style="padding:10px 18px; background:#201526; color:#fff; border:none; border-radius:6px; cursor:pointer">Print / Save as PDF</button> <button onclick="window.close()" style="padding:10px 18px; margin-left:8">Close</button></div>
  </body></html>`);
  w.document.close();
}
function printCertificate({companyName, cert, employee, training}){
  const w=window.open('','_blank');
  if(!w){ alert('Allow pop-ups'); return; }
  w.document.write(`
  <html><head><title>Certificate — ${training.title}</title>
  <style>body{font-family:Newsreader, serif; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f7f5ef; margin:0; padding:32px}
  .cert{background:#fff; border:6px double #201526; padding:40px 48px; max-width:720px; width:100%; text-align:center}
  h1{font-size:28px; margin:0; font-style:italic} h2{font-size:15px; color:#555; margin:8px 0}
  .name{font-size:26px; font-weight:700; margin:18px 0 4px} .score{font-family:monospace; color:#4C8577}
  .foot{margin-top:32px; display:grid; grid-template-columns:1fr 1fr; gap:24px; font-size:12px} .foot div{border-top:1px solid #222; padding-top:6px}
  @media print{ button{display:none} }
  </style></head><body>
  <div class="cert">
    <div style="font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#888">${companyName||'Company'}</div>
    <h1>Certificate of Completion</h1><h2>${training.title} · ${training.category}</h2>
    <div style="margin:20px 0; font-size:13px">This is to certify that</div>
    <div class="name">${employee.name}</div><div style="font-size:12px; opacity:0.7">${employee.role} · ${companyName||''}</div>
    <div style="margin:18px 0; font-size:13px">has successfully completed the training with score <span class="score">${cert.score||'—'}%</span></div>
    <div style="font-size:11px; color:#666">Issued ${new Date(cert.issuedAt).toLocaleDateString('en-NG')} · Certificate ID ${cert.id.slice(0,8).toUpperCase()} · Medash HR Suite</div>
    <div class="foot"><div>Training Coordinator<br/><br/>Signature / Date</div><div>CEO / HR Head<br/><br/>Signature / Date</div></div>
    <div style="margin-top:18px"><button onclick="window.print()" style="padding:10px 18px; background:#201526; color:#fff; border:none; border-radius:6px; cursor:pointer">Print / Save PDF</button> <button onclick="window.close()" style="padding:10px 18px">Close</button></div>
  </div></body></html>`);
  w.document.close();
}
function Training({state,update,setModal,showToast}){
  const [tab,setTab]=useState('catalog');
  const isEmployee=state.currentRole==='employee';
  const myId=state.viewingEmployeeId||state.employees[0]?.id;
  // force trainings to exist — if corrupted localStorage, seed robust 6
  if(!state.trainings || state.trainings.length===0){
    return <div style={{padding:20,textAlign:'center'}}><div style={{color:'#8C3B28'}}>Courses not loaded — local data corrupted.</div><button className="btn btn-primary" style={{marginTop:10}} onClick={()=>{ if(confirm('Reload 6 robust courses?')){ const fresh=seedDemo(); update(s=>{ s.trainings=fresh.trainings; s.enrollments=fresh.enrollments; s.certificates=fresh.certificates; }); showToast('Courses restored'); } }}>Reload 6 Courses</button><button className="btn" style={{marginLeft:8, marginTop:10}} onClick={()=>{ localStorage.clear(); location.reload(); }}>Hard Reset</button></div>;
  }
  const visibleEnrollments=isEmployee? state.enrollments.filter(e=>e.employeeId===myId) : state.enrollments;
  const visibleCerts=isEmployee? state.certificates.filter(c=>c.employeeId===myId) : state.certificates;
  const enrolledCount=visibleEnrollments.length;
  const completedCount=visibleEnrollments.filter(e=>e.progress===100).length;
  const pendingCount=enrolledCount-completedCount;
  const certCount=visibleCerts.length;
  return (<>
    <div className="panel-head"><div><h2>Training Suite</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>{isEmployee? 'Your courses — learn offline, get certified' : 'Courses + Assignments + Progress + Certificates — offline & printable'}</p></div>
      {!isEmployee && <div style={{display:'flex',gap:8}}><button className="btn btn-primary" onClick={()=>setModal({type:'course'})}>+ New course</button><button className="btn" style={{background:'#fff',color:'#201526'}} onClick={()=>setModal({type:'enroll'})}>+ Enroll staff</button></div>}
      {isEmployee && <div style={{fontSize:11,color:'var(--muted)',background:'rgba(237,238,242,0.08)',padding:'6px 10px',borderRadius:20}}>Employee view — contact HR to enroll</div>}
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12,marginBottom:14}}>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:12}}><div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase'}}>Courses</div><div style={{fontFamily:'Newsreader',fontSize:22,fontWeight:600}}>{state.trainings.length}</div></div>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:12}}><div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase'}}>Enrolled</div><div style={{fontFamily:'Newsreader',fontSize:22,fontWeight:600}}>{enrolledCount}</div></div>
      <div style={{background:'var(--teal)',borderRadius:8,padding:12,color:'#fff'}}><div style={{fontSize:10,textTransform:'uppercase',opacity:0.85}}>Completed</div><div style={{fontFamily:'Newsreader',fontSize:22,fontWeight:600}}>{completedCount}</div></div>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:12}}><div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase'}}>Pending</div><div style={{fontFamily:'Newsreader',fontSize:22,fontWeight:600}}>{pendingCount}</div></div>
      <div style={{background:'var(--paper)',color:'#201526',borderRadius:8,padding:12}}><div style={{fontSize:10,opacity:0.55,textTransform:'uppercase'}}>Certificates</div><div style={{fontFamily:'Newsreader',fontSize:22,fontWeight:600}}>{certCount}</div></div>
    </div>
    <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
      {['catalog','enrollments','certificates'].map(t=> <button key={t} onClick={()=>setTab(t)} style={{padding:'6px 12px',borderRadius:20,fontSize:12,border:'1px solid var(--line)',background:tab===t?'var(--paper)':'transparent',color:tab===t?'#201526':'var(--muted)',cursor:'pointer',textTransform:'capitalize'}}>{t}</button>)}
    </div>

    {tab==='catalog' && <div className="grid">
      {state.trainings.map(tr=>{
        const enrolled=state.enrollments.filter(e=>e.trainingId===tr.id).length;
        const myEnroll=state.enrollments.find(e=>e.trainingId===tr.id && e.employeeId===myId);
        const hasQuiz=tr.modules.some(m=>m.type==='quiz');
        return <div key={tr.id} className="card" style={{gap:10}}>
          <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:10,background:tr.required?'#E2735B':'#E0E2E8',color:tr.required?'#fff':'#201526',padding:'3px 7px',borderRadius:20}}>{tr.category} {tr.required?'· Required':''}</span><span style={{fontSize:11,opacity:0.55}}>{tr.duration}</span></div>
          <div style={{fontWeight:700,fontSize:15}}>{tr.title}</div><div style={{fontSize:12,opacity:0.7,lineHeight:1.4}}>{tr.description}</div>
          <div style={{fontSize:11,opacity:0.65}}>{tr.modules.length} modules: {tr.modules.map(m=>m.title).join(' · ')}</div>
          <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap'}}>
            <button onClick={()=>setModal({type:'courseView', data:tr.id})} style={{background:'#fff',border:'1px solid #ddd',borderRadius:5,padding:'6px 10px',fontSize:11,cursor:'pointer'}}>View & Take Test{hasQuiz?' 📝':''}</button>
            {isEmployee ? (
              myEnroll? <span style={{fontSize:11,background:myEnroll.progress===100?'#4C8577':'#E2735B',color:'#fff',padding:'6px 10px',borderRadius:5}}>{myEnroll.progress===100?'Completed ✓':`${myEnroll.progress}% — Enrolled`}</span>
              : <button onClick={()=>{ update(s=>{ s.enrollments.push({id:uid(), employeeId:myId, trainingId:tr.id, progress:0, completedModules:[], enrolledAt:new Date().toISOString().slice(0,10), completedAt:null, score:null, certificateId:null}); }); showToast('Enrolled — open View & Take Test to start'); }} style={{background:'var(--teal)',color:'#fff',border:'none',borderRadius:5,padding:'6px 10px',fontSize:11,cursor:'pointer'}}>Enroll me</button>
            ) : (
              <>
                <button onClick={()=>setModal({type:'enroll', preset:tr.id})} style={{background:'var(--teal)',color:'#fff',border:'none',borderRadius:5,padding:'6px 10px',fontSize:11,cursor:'pointer'}}>Enroll staff ({enrolled})</button>
                <button onClick={()=>{ const uid2=uid(); update(s=>{ let my=s.enrollments.find(e=>e.employeeId===myId && e.trainingId===tr.id); if(!my){ my={id:uid2, employeeId:myId, trainingId:tr.id, progress:0, completedModules:[], enrolledAt:new Date().toISOString().slice(0,10), completedAt:null, score:null, certificateId:null}; s.enrollments.push(my); } }); setModal({type:'courseView', data:tr.id}); }} style={{background:'#201526',color:'#fff',border:'none',borderRadius:5,padding:'6px 10px',fontSize:11,cursor:'pointer'}}>Take as HR</button>
                <button onClick={()=>setModal({type:'editCourse', data:tr.id})} style={{background:'#E0E2E8',border:'none',borderRadius:5,padding:'6px 10px',fontSize:11,cursor:'pointer'}}>Edit</button>
                <button onClick={()=>{ if(confirm('Delete course?')) update(s=>{ s.trainings=s.trainings.filter(x=>x.id!==tr.id); s.enrollments=s.enrollments.filter(e=>e.trainingId!==tr.id); }); }} style={{background:'transparent',border:'1px solid rgba(226,115,91,0.4)',color:'#8C3B28',borderRadius:5,padding:'6px 10px',fontSize:11,cursor:'pointer'}}>Remove</button>
              </>
            )}
          </div>
        </div>;
      })}
      {state.trainings.length===0 && <div style={{color:'var(--muted)',padding:20}}>No courses yet — create your first.</div>}
    </div>}

    {tab==='enrollments' && <div style={{background:'#EDEEF2',borderRadius:8,padding:8}}>
      {visibleEnrollments.length===0? <div style={{color:'rgba(32,21,38,0.6)',textAlign:'center',padding:24}}>{isEmployee?'Not enrolled yet — join a course from Catalog':'No enrollments yet.'}</div> :
      <table style={{width:'100%',borderCollapse:'collapse',color:'#201526',fontSize:12}}>
        <thead><tr style={{background:'#E0E2E8'}}><th style={{textAlign:'left',padding:'8px'}}>Staff</th><th style={{textAlign:'left',padding:'8px'}}>Course</th><th style={{textAlign:'center',padding:'8px'}}>Progress</th><th style={{textAlign:'center',padding:'8px'}}>Score</th><th style={{textAlign:'left',padding:'8px'}}>Action</th></tr></thead>
        <tbody>{visibleEnrollments.map(en=>{
          const emp=state.employees.find(e=>e.id===en.employeeId);
          const tr=state.trainings.find(t=>t.id===en.trainingId);
          return <tr key={en.id} style={{borderBottom:'1px solid rgba(32,21,38,0.07)'}}>
            <td style={{padding:'8px',fontWeight:600}}>{emp?emp.name:'—'}</td>
            <td style={{padding:'8px'}}>{tr?tr.title:'—'}</td>
            <td style={{padding:'8px'}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{flex:1,height:6,background:'rgba(32,21,38,0.1)',borderRadius:6,overflow:'hidden'}}><div style={{width:`${en.progress}%`,height:'100%',background:en.progress===100?'#4C8577':'#E2735B'}}/></div><span style={{fontFamily:'monospace',fontSize:11}}>{en.progress}%</span></div>
              <div style={{fontSize:10,opacity:0.55}}>{en.completedModules.length}/{tr?.modules.length||0} modules</div>
            </td>
            <td style={{textAlign:'center',padding:'8px',fontFamily:'monospace'}}>{en.score ?? '—'}{en.score!==null?'%':''}</td>
            <td style={{padding:'8px',display:'flex',gap:6,flexWrap:'wrap'}}>
              {en.progress<100 && <button onClick={()=>setModal({type:'courseView',data:en.trainingId})} style={{fontSize:11,background:'#201526',color:'#fff',border:'none',padding:'5px 8px',borderRadius:5,cursor:'pointer'}}>Study course</button>}
              {en.progress===100 && <button onClick={()=>{ const cert=state.certificates.find(c=>c.id===en.certificateId); const emp2=state.employees.find(e=>e.id===en.employeeId); const tr2=state.trainings.find(t=>t.id===en.trainingId); if(cert&&emp2&&tr2) printCertificate({companyName:state.companyName, cert, employee:emp2, training:tr2}); }} style={{fontSize:11,background:'#4C8577',color:'#fff',border:'none',padding:'5px 8px',borderRadius:5,cursor:'pointer'}}>Certificate</button>}
              {!isEmployee && <button onClick={()=>{ if(confirm('Unenroll?')) update(s=>{ s.enrollments=s.enrollments.filter(x=>x.id!==en.id); s.certificates=s.certificates.filter(c=>c.id!==en.certificateId); }); }} style={{fontSize:11,background:'transparent',border:'1px solid rgba(226,115,91,0.4)',color:'#8C3B28',padding:'5px 8px',borderRadius:5,cursor:'pointer'}}>Remove</button>}
              {isEmployee && en.employeeId===myId && en.progress<100 && <span style={{fontSize:10,opacity:0.55}}>HR unenrolls</span>}
            </td>
          </tr>;
        })}</tbody>
      </table>}
    </div>}

    {tab==='certificates' && <div className="grid">
      {visibleCerts.map(c=>{
        const emp=state.employees.find(e=>e.id===c.employeeId);
        const tr=state.trainings.find(t=>t.id===c.trainingId);
        return <div key={c.id} style={{background:'#fff',color:'#201526',borderRadius:8,padding:16,border:'2px solid #EDEEF2'}}>
          <div style={{fontSize:10,letterSpacing:0.1+'em',textTransform:'uppercase',opacity:0.55}}>{state.companyName||'Company'} · Certificate</div>
          <div style={{fontFamily:'Newsreader',fontStyle:'italic',fontSize:16,fontWeight:700,marginTop:4}}>{tr?tr.title:'Course'}</div>
          <div style={{fontSize:13,marginTop:6}}>Awarded to <b>{emp?emp.name:'—'}</b> · {emp?emp.role:''}</div>
          <div style={{fontSize:11,opacity:0.6,marginTop:4}}>Issued {new Date(c.issuedAt).toLocaleDateString('en-NG')} · ID {c.id.slice(0,8).toUpperCase()} · Score {c.score||'—'}%</div>
          <button onClick={()=>printCertificate({companyName:state.companyName, cert:c, employee:emp, training:tr})} style={{marginTop:10,background:'#201526',color:'#fff',border:'none',padding:'7px 12px',borderRadius:6,fontSize:12,cursor:'pointer'}}>Print / Save PDF</button>
        </div>;
      })}
      {visibleCerts.length===0 && <div style={{color:'var(--muted)',padding:20}}>{isEmployee?'Complete a course to earn your certificate':'No certificates yet — complete a training to generate.'}</div>}
    </div>}
  </>);
}
function Leave({state,update,setModal,showToast}){
  const isEmployee=state.currentRole==='employee';
  const myId=state.viewingEmployeeId||state.employees[0]?.id;
  const leaves=isEmployee? state.leaves.filter(l=>l.employeeId===myId) : state.leaves;
  function balance(empId, type){
    const taken=state.leaves.filter(l=>l.employeeId===empId && l.type===type && l.status==='approved').reduce((s,l)=>s+l.days,0);
    const quota=LEAVE_TYPES.find(t=>t.key===type).days;
    return quota - taken;
  }
  return (<>
    <div className="panel-head"><div><h2>Leave Management</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>{isEmployee?'Your leave requests & balances':'Team leave — request, approve, track balances'}</p></div><button className="btn btn-primary" onClick={()=>setModal({type:'leave'})}>+ Request leave</button></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:14}}>
      {LEAVE_TYPES.map(t=>{
        const bal=isEmployee? balance(myId,t.key) : null;
        return <div key={t.key} style={{background:'var(--bg-2)',borderLeft:`4px solid ${t.color}`,borderRadius:8,padding:12}}>
          <div style={{fontSize:11,fontWeight:600}}>{t.label}</div><div style={{fontSize:11,opacity:0.6}}>{t.days} days/year</div>{isEmployee && <div style={{fontFamily:'IBM Plex Mono',fontSize:13,marginTop:4, color: bal<5?'#E2735B':'#fff'}}>Remaining: {bal}d</div>}
        </div>;
      })}
    </div>
    {!isEmployee && <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginBottom:12}}>
      {state.employees.filter(e=>e.active).map(e=>(
        <div key={e.id} style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:10}}>
          <div style={{fontSize:12,fontWeight:700}}>{e.name}</div><div style={{fontSize:10,opacity:0.6}}>{LEAVE_TYPES.map(t=> `${t.label.split(' ')[0]}:${balance(e.id,t.key)}d`).join(' · ')}</div>
        </div>
      ))}
    </div>}
    <div style={{background:'#EDEEF2',borderRadius:8,overflow:'hidden'}}>
      <table style={{width:'100%',borderCollapse:'collapse',color:'#201526',fontSize:12}}>
        <thead><tr style={{background:'#E0E2E8'}}><th style={{textAlign:'left',padding:'8px'}}>Staff</th><th style={{padding:'8px'}}>Type</th><th style={{padding:'8px'}}>Dates</th><th style={{padding:'8px'}}>Days</th><th style={{padding:'8px'}}>Status</th><th style={{padding:'8px'}}>Action</th></tr></thead>
        <tbody>{leaves.length===0? <tr><td colSpan={6} style={{textAlign:'center',padding:20,opacity:0.6}}>No leave requests</td></tr> :
          leaves.slice().reverse().map(l=>{
            const emp=state.employees.find(e=>e.id===l.employeeId);
            const lt=LEAVE_TYPES.find(t=>t.key===l.type);
            return <tr key={l.id} style={{borderBottom:'1px solid rgba(32,21,38,0.08)'}}><td style={{padding:'8px',fontWeight:600}}>{emp?emp.name:'—'}</td><td style={{padding:'8px'}}><span style={{background:lt.color,color:'#fff',padding:'3px 7px',borderRadius:10,fontSize:11}}>{lt.label}</span></td><td style={{padding:'8px',fontFamily:'monospace'}}>{l.from} → {l.to}</td><td style={{padding:'8px',textAlign:'center'}}>{l.days}</td><td style={{padding:'8px'}}><span style={{padding:'3px 7px',borderRadius:10,fontSize:11,background:l.status==='approved'?'#4C8577':l.status==='rejected'?'#E2735B':'#C9A227',color:'#fff'}}>{l.status}</span></td><td style={{padding:'8px',display:'flex',gap:6}}>
              {!isEmployee && l.status==='pending' && <><button onClick={()=>update(s=>{ s.leaves.find(x=>x.id===l.id).status='approved'; })} style={{background:'#4C8577',color:'#fff',border:'none',padding:'4px 8px',borderRadius:5,fontSize:11,cursor:'pointer'}}>Approve</button><button onClick={()=>update(s=>{ s.leaves.find(x=>x.id===l.id).status='rejected'; })} style={{background:'#E2735B',color:'#fff',border:'none',padding:'4px 8px',borderRadius:5,fontSize:11,cursor:'pointer'}}>Reject</button></>}
              {(isEmployee|| l.employeeId===myId) && l.status==='pending' && <button onClick={()=>{ if(confirm('Cancel request?')) update(s=> s.leaves=s.leaves.filter(x=>x.id!==l.id));}} style={{background:'transparent',border:'1px solid rgba(32,21,38,0.2)',padding:'4px 8px',borderRadius:5,fontSize:11,cursor:'pointer'}}>Cancel</button>}
            </td></tr>;
          })}
        </tbody>
      </table>
    </div>
  </>);
}
function Attendance({state,update,setModal,showToast}){
  const isEmployee=state.currentRole==='employee';
  const myId=state.viewingEmployeeId||state.employees[0]?.id;
  const todayStr=new Date().toISOString().slice(0,10);
  const todayRec=state.attendance.find(a=>a.employeeId===myId && a.date===todayStr);
  const list=isEmployee? state.attendance.filter(a=>a.employeeId===myId) : state.attendance;
  function clock(type){
    const now=new Date(); const hh=String(now.getHours()).padStart(2,'0'); const mm=String(now.getMinutes()).padStart(2,'0');
    const time=`${hh}:${mm}`;
    update(s=>{
      let rec=s.attendance.find(a=>a.employeeId===myId && a.date===todayStr);
      if(!rec){ rec={id:uid(), employeeId:myId, date:todayStr, clockIn:null, clockOut:null, status:'present'}; s.attendance.push(rec); }
      if(type==='in'){ if(rec.clockIn) return; rec.clockIn=time; const late = hh>='09' && !(hh==='08' && mm<='30') ? true : parseInt(hh)>8; if(late && !rec.status.includes('late')) rec.status='late'; }
      if(type==='out'){ if(!rec.clockIn){ showToast('Clock in first'); return; } rec.clockOut=time; }
    });
  }
  const presentToday=state.attendance.filter(a=>a.date===todayStr && a.status!=='absent').length;
  return (<>
    <div className="panel-head"><div><h2>Time & Attendance</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>Clock in/out, late & absent tracking — offline</p></div>
      <div style={{display:'flex',gap:8}}><button className="btn btn-primary" onClick={()=>clock('in')} disabled={!!todayRec?.clockIn} style={{opacity: todayRec?.clockIn?0.5:1}}>Clock In {todayRec?.clockIn||''}</button><button className="btn" style={{background:'#EDEEF2',color:'#201526',opacity: todayRec?.clockOut?0.5:1}} onClick={()=>clock('out')} disabled={!!todayRec?.clockOut}>Clock Out {todayRec?.clockOut||''}</button><button className="btn" style={{background:'transparent',border:'1px solid var(--line)',color:'var(--muted)'}} onClick={()=>setModal({type:'attendance'})}>+ Manual entry</button></div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:12}}>
      <div style={{background:'var(--bg-2)',borderRadius:8,padding:12,border:'1px solid var(--line)'}}><div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase'}}>Today present</div><div style={{fontFamily:'Newsreader',fontSize:22,fontWeight:600}}>{presentToday}/{state.employees.filter(e=>e.active).length}</div><div style={{fontSize:11,opacity:0.6}}>{todayStr}</div></div>
      <div style={{background: todayRec?.status==='late'?'#C9A227':'#4C8577',color:'#fff',borderRadius:8,padding:12}}><div style={{fontSize:10,textTransform:'uppercase',opacity:0.9}}>My status today</div><div style={{fontWeight:700,marginTop:4}}>{todayRec? (todayRec.clockIn? (todayRec.status + ' · '+todayRec.clockIn+(todayRec.clockOut?' → '+todayRec.clockOut:'')) : 'Not clocked') : 'Not clocked'}</div></div>
    </div>
    <div style={{background:'#EDEEF2',borderRadius:8,overflow:'auto',maxHeight:380}}>
      <table style={{width:'100%',borderCollapse:'collapse',color:'#201526',fontSize:12, minWidth:600}}>
        <thead><tr style={{background:'#E0E2E8',position:'sticky',top:0}}><th style={{textAlign:'left',padding:'8px'}}>Date</th><th style={{textAlign:'left',padding:'8px'}}>Staff</th><th style={{padding:'8px'}}>Clock In</th><th style={{padding:'8px'}}>Clock Out</th><th style={{padding:'8px'}}>Status</th><th style={{padding:'8px'}}>Hours</th></tr></thead>
        <tbody>{list.slice().sort((a,b)=> b.date.localeCompare(a.date)).slice(0,60).map(a=>{
          const emp=state.employees.find(e=>e.id===a.employeeId);
          const hours=a.clockIn && a.clockOut ? ((parseInt(a.clockOut.split(':')[0])*60+parseInt(a.clockOut.split(':')[1]) - (parseInt(a.clockIn.split(':')[0])*60+parseInt(a.clockIn.split(':')[1])))/60).toFixed(1)+'h' : '—';
          return <tr key={a.id} style={{borderBottom:'1px solid rgba(32,21,38,0.07)'}}><td style={{padding:'8px',fontFamily:'monospace'}}>{a.date}</td><td style={{padding:'8px',fontWeight:600}}>{emp?emp.name:'—'}</td><td style={{padding:'8px',textAlign:'center'}}>{a.clockIn||'—'}</td><td style={{padding:'8px',textAlign:'center'}}>{a.clockOut||'—'}</td><td style={{padding:'8px'}}><span style={{padding:'3px 7px',borderRadius:10,fontSize:11, background: a.status==='present'?'#4C8577':a.status==='late'?'#C9A227':'#E2735B', color:'#fff'}}>{a.status}</span></td><td style={{padding:'8px',textAlign:'center',fontFamily:'monospace'}}>{hours}</td></tr>;
        })}</tbody>
      </table>
    </div>
  </>);
}
function Org({state,update,setModal,showToast}){
  return (<>
    <div className="panel-head"><div><h2>Org Management</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>Departments, reporting lines, heads — drag staff between units</p></div>
      <div style={{display:'flex',gap:8}}><button className="btn btn-primary" onClick={()=>setModal({type:'orgUnit'})}>+ New department</button><button className="btn" style={{background:'#fff',color:'#201526'}} onClick={()=>setModal({type:'assignDept'})}>Assign staff</button></div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:14}}>
      {state.orgUnits.map(dept=>{
        const head=state.employees.find(e=>e.id===dept.head);
        const members=state.employees.filter(e=>e.department===dept.id);
        return <div key={dept.id} style={{background:'#EDEEF2',color:'#201526',borderRadius:8,padding:16,borderLeft:`6px solid ${dept.color}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h3 style={{fontWeight:700}}>{dept.name}</h3><span style={{fontSize:11,background:dept.color,color:'#fff',padding:'3px 7px',borderRadius:10}}>{members.length} staff</span></div>
          <div style={{fontSize:12,opacity:0.6,marginTop:4}}>Head: {head?head.name:'— Vacant'} · <a onClick={()=>setModal({type:'orgUnit', data:dept.id})} style={{color:'#4C8577',cursor:'pointer',textDecoration:'underline'}}>Edit</a></div>
          <div style={{marginTop:10, display:'flex',flexDirection:'column',gap:6}}>
            {members.map(m=> <div key={m.id} style={{display:'flex',alignItems:'center',gap:8,background:'#fff',padding:'8px 10px',borderRadius:6,fontSize:12}}>
              <div style={{width:28,height:28,borderRadius:'50%',overflow:'hidden',background:m.color,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11}}>{m.passportPhoto? <img src={m.passportPhoto} alt='' style={{width:'100%',height:'100%',objectFit:'cover'}}/> : initials(m.name)}</div>
              <div style={{flex:1}}><div style={{fontWeight:600}}>{m.name}</div><div style={{fontSize:10,opacity:0.6}}>{m.role}</div></div>
              <select value={m.department} onChange={e=>update(s=>{ s.employees.find(x=>x.id===m.id).department=e.target.value; })} style={{fontSize:11,padding:4,borderRadius:4,border:'1px solid #ddd',background:'#fff'}}>
                {state.orgUnits.map(d=> <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>)}
            {members.length===0 && <div style={{fontSize:12,opacity:0.5,padding:8}}>No staff in this unit.</div>}
          </div>
          <button onClick={()=>{ if(confirm('Delete department? Staff will move to first unit.')) update(s=>{ const fallback=s.orgUnits.find(u=>u.id!==dept.id)?.id; s.employees.filter(e=>e.department===dept.id).forEach(e=> e.department=fallback); s.orgUnits=s.orgUnits.filter(u=>u.id!==dept.id); }); }} style={{marginTop:10,background:'transparent',border:'1px solid rgba(226,115,91,0.4)',color:'#8C3B28',padding:'5px 10px',borderRadius:5,fontSize:11,cursor:'pointer'}}>Delete unit</button>
        </div>;
      })}
    </div>
    <div style={{marginTop:14,background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:12}}>
      <div style={{fontSize:11,opacity:0.7}}>Org chart is offline — head, units and assignments saved locally. Use Assign staff to bulk move.</div>
    </div>
  </>);
}
function RunPayroll({state,update,setCurrentTab,showToast}){
  const period=nextPeriod(state.runs);
  const active=state.employees.filter(e=>e.active);
  if(!active.length) return <><div className="panel-head"><div><h2>Run payroll</h2></div></div><div style={{color:'var(--muted)',textAlign:'center',padding:30}}>Add at least one active teammate before running payroll.</div></>;
  const lines=active.map(e=>({emp:e,...estimateDeductions(e.gross)}));
  const total=lines.reduce((s,l)=>s+l.emp.gross+l.pensionEmployer,0);
  const netTotal=lines.reduce((s,l)=>s+l.net,0);
  const scheduleLines=active.map(e=>{ const d=estimateDeductions(e.gross); return {employeeId:e.id,name:e.name,role:e.role,gross:e.gross,bank:e.bank,account:e.account,...d}; });
  return (<>
    <div className="panel-head"><div><h2>Run payroll — {periodLabel(period)}</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>Review before confirming. This will pay {active.length} active teammates.</p></div>
      <div style={{display:'flex',gap:8}}><button className="btn" style={{background:'#fff',color:'#201526',border:'1px solid #ddd'}} onClick={()=>printSchedule({companyName: state.companyName, period, lines: scheduleLines})}>🖨 Printable schedule</button></div>
    </div>
    <div className="run-row" style={{cursor:'default'}}>
      <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1.1fr',gap:8,padding:'6px 0 8px',fontSize:10,opacity:0.55,textTransform:'uppercase',letterSpacing:0.05+'em',borderBottom:'1px solid rgba(32,21,38,0.08)'}}><span>Staff</span><span>Account</span><span style={{textAlign:'right'}}>Net pay</span></div>
      {lines.map(l=><div key={l.emp.id} style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1.1fr',gap:8,alignItems:'center',fontSize:12.5,padding:'8px 0',borderBottom:'1px solid rgba(32,21,38,0.05)'}}><span>{l.emp.name}<span style={{opacity:0.55}}> — {l.emp.role}</span></span><span style={{fontFamily:'IBM Plex Mono',fontSize:12}}>{l.emp.bank || '—'} · {l.emp.account || '—'}</span><span style={{fontFamily:'IBM Plex Mono',fontWeight:600,textAlign:'right'}}>{money(l.net)}</span></div>)}
      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,borderTop:'1px solid rgba(32,21,38,0.15)',marginTop:6,paddingTop:12,fontSize:13}}><span>Total net pay</span><span style={{fontFamily:'IBM Plex Mono'}}>{money(netTotal)}</span></div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,padding:'6px 0'}}><span>Total cost to company (incl. employer pension)</span><span style={{fontFamily:'IBM Plex Mono',fontWeight:600}}>{money(total)}</span></div>
      <div style={{fontSize:11,color:'rgba(32,21,38,0.55)',marginTop:6}}>Edit bank/account in Team → Edit. Pays to listed accounts.</div>
    </div>
    <div style={{display:'flex',gap:10,marginTop:16,flexWrap:'wrap'}}>
      <button className="btn btn-primary" onClick={async ()=>{
        if(getApiBase() && getToken()){
          try{
            const run=await PayrollAPI.run();
            const local=cloudRunToLocal(run);
            update(s=>{ s.runs.push(local); });
            showToast(`Payroll for ${periodLabel(local.period)} confirmed — server-computed ✓`);
          }catch(err){ showToast('Cloud payroll failed: '+err.message); return; }
        } else {
          update(s=>{
            const lines2=active.map(e=>{ const d=estimateDeductions(e.gross); return {employeeId:e.id,name:e.name,role:e.role,gross:e.gross, bank:e.bank, account:e.account, ...d}; });
            s.runs.push({id:uid(),period,createdAt:new Date().toISOString(),lines:lines2,status:'paid'});
          });
          showToast(`Payroll for ${periodLabel(period)} confirmed — works offline too`);
        }
        setCurrentTab('history');
      }}>Confirm & pay {periodLabel(period)}{getApiBase() && getToken()?' ☁':''}</button>
      <button className="btn" style={{background:'#EDEEF2',color:'#201526'}} onClick={()=>printSchedule({companyName: state.companyName, period, lines: scheduleLines})}>🖨 Print payment schedule for Finance/CEO</button>
    </div>
  </>);
}
function History({state,expandedRun,setExpandedRun}){
  if(!state.runs.length) return <><div className="panel-head"><div><h2>History</h2></div></div><div style={{color:'var(--muted)',textAlign:'center',padding:30}}>No payroll runs yet.</div></>;
  const runs=[...state.runs].reverse();
  return (<><div className="panel-head"><div><h2>Payroll history</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>{state.runs.length} run{state.runs.length>1?'s':''} recorded</p></div></div>
    {runs.map(r=>{
      const total=r.lines.reduce((s,l)=>s+l.gross+l.pensionEmployer,0);
      const open=expandedRun===r.id;
      return <div key={r.id} className="run-row" style={{cursor:'pointer'}} onClick={()=>setExpandedRun(open?null:r.id)}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontFamily:'Newsreader',fontWeight:600,fontSize:16}}>{periodLabel(r.period)}</div><div style={{fontSize:12,opacity:0.6,marginTop:2}}>{r.lines.length} teammates · {new Date(r.createdAt).toLocaleDateString('en-NG')}</div></div><div style={{fontFamily:'IBM Plex Mono',fontWeight:600}}>{money(total)}</div></div>
        {open && <div style={{marginTop:14,borderTop:'1px solid rgba(32,21,38,0.1)',paddingTop:12}}>
          <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1fr',gap:8,padding:'6px 0',fontSize:10,opacity:0.55,textTransform:'uppercase',letterSpacing:0.05+'em',borderBottom:'1px solid rgba(32,21,38,0.08)'}}><span>Staff</span><span>Account</span><span style={{textAlign:'right'}}>Net</span></div>
          {r.lines.map(l=><div key={l.employeeId} style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1fr',gap:8,alignItems:'center',fontSize:12.5,padding:'6px 0'}}><span>{l.name}</span><span style={{fontFamily:'IBM Plex Mono',fontSize:11}}>{l.bank||'—'} · {l.account||'—'}</span><span style={{fontFamily:'IBM Plex Mono',textAlign:'right'}}>{money(l.net)}</span></div>)}
          <div style={{marginTop:12,display:'flex',gap:8}}><button onClick={(ev)=>{ev.stopPropagation(); printSchedule({companyName: state.companyName, period: r.period, lines: r.lines});}} style={{fontSize:12,background:'#201526',color:'#fff',border:'none',padding:'7px 12px',borderRadius:5,cursor:'pointer'}}>🖨 Printable schedule for Finance/CEO</button></div>
        </div>}
      </div>;
    })}
  </>);
}
function Compliance({state,update}){
  if(!state.runs.length) return <><div className="panel-head"><div><h2>Compliance</h2></div></div><div style={{color:'var(--muted)',textAlign:'center',padding:30}}>Run payroll to generate compliance obligations.</div></>;
  const items=[{key:'paye',what:'PAYE remittance',agency:'State IRS'},{key:'pension',what:'Pension remittance',agency:'PenCom / PFA'},{key:'nhf',what:'NHF remittance',agency:'Federal Mortgage Bank'},{key:'nsitf',what:'NSITF contribution',agency:'NSITF'}];
  const rows=[];
  [...state.runs].reverse().forEach(r=>items.forEach(it=>rows.push({period:r.period,...it,status:complianceStatus(state,r.period,it.key),due:getDueDates(r.period)[it.key]})));
  return (<>
    <div className="panel-head"><div><h2>Compliance</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>Statutory obligations across every payroll run</p></div></div>
    <div style={{overflowX:'auto',background:'#EDEEF2',borderRadius:8}}>
    <table style={{width:'100%',borderCollapse:'collapse',color:'#201526',fontSize:13}}>
      <thead><tr style={{background:'#E0E2E8'}}><th style={{textAlign:'left',padding:'12px 16px',fontSize:10.5,textTransform:'uppercase',opacity:0.55}}>Period</th><th style={{textAlign:'left',padding:'12px 16px',fontSize:10.5,textTransform:'uppercase',opacity:0.55}}>Obligation</th><th style={{textAlign:'left',padding:'12px 16px',fontSize:10.5,textTransform:'uppercase',opacity:0.55}}>Agency</th><th style={{textAlign:'left',padding:'12px 16px',fontSize:10.5,textTransform:'uppercase',opacity:0.55}}>Due</th><th style={{textAlign:'left',padding:'12px 16px',fontSize:10.5,textTransform:'uppercase',opacity:0.55}}>Status</th><th></th></tr></thead>
      <tbody>{rows.map((row,i)=>{
        const bg=row.status==='filed'?'rgba(76,133,119,0.15)':row.status==='overdue'?'rgba(226,115,91,0.18)':'rgba(201,162,39,0.18)';
        const color=row.status==='filed'?'#2E5C51':row.status==='overdue'?'#8C3B28':'#8A6B0F';
        const label=row.status==='filed'?'Filed':row.status==='overdue'?'Overdue':'Pending';
        return <tr key={i} style={{borderBottom:'1px solid rgba(32,21,38,0.07)'}}><td style={{padding:'12px 16px'}}>{periodLabel(row.period)}</td><td style={{padding:'12px 16px'}}>{row.what}</td><td style={{padding:'12px 16px'}}>{row.agency}</td><td style={{padding:'12px 16px',fontFamily:'IBM Plex Mono'}}>{new Date(row.due).toLocaleDateString('en-NG')}</td><td style={{padding:'12px 16px'}}><span style={{fontFamily:'IBM Plex Mono',fontSize:10,padding:'4px 8px',borderRadius:20,background:bg,color}}>{label}</span></td><td style={{padding:'12px 16px'}}><button onClick={()=>update(s=>{if(!s.compliance[row.period]) s.compliance[row.period]={}; s.compliance[row.period][row.key]=!s.compliance[row.period][row.key];})} style={{background:row.status==='filed'?'var(--teal)':'none',color:row.status==='filed'?'#fff':'var(--ink)',border:'1px solid rgba(32,21,38,0.2)',borderRadius:20,padding:'5px 12px',fontSize:11.5,cursor:'pointer'}}>{row.status==='filed'?'Filed ✓':'Mark filed'}</button></td></tr>;
      })}</tbody>
    </table>
    </div>
  </>);
}
function Reviews({state,update,setModal}){
  const emp=(id)=>state.employees.find(e=>e.id===id);
  const list=[...state.reviews].sort((a,b)=>new Date(b.date)-new Date(a.date));
  return (<>
    <div className="panel-head"><div><h2>Performance reviews</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>{state.reviews.length} review{state.reviews.length!==1?'s':''} recorded</p></div><button className="btn btn-primary" onClick={()=>setModal({type:'review'})}>+ Add review</button></div>
    {list.length? list.map(r=>{
      const e=emp(r.employeeId);
      return <div key={r.id} style={{background:'var(--paper)',color:'var(--ink)',borderRadius:8,padding:'16px 18px',marginBottom:10}}><div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontWeight:600,fontSize:14}}>{e?e.name:'Former teammate'}{e?` — ${e.role}`:''}</span><span style={{fontSize:11.5,opacity:0.55}}>{new Date(r.date).toLocaleDateString('en-NG')}</span></div><div style={{color:'var(--gold)',marginTop:4}}>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div><div style={{fontSize:13,marginTop:8,opacity:0.85}}>{r.notes}</div></div>;
    }): <div style={{color:'var(--muted)',textAlign:'center',padding:30}}>No reviews yet.</div>}
  </>);
}
function Hiring({state,update,setModal,showToast}){
  const stages=['Applied','Screening','Interview','Offer','Hired','Rejected'];
  return (<>
    <div className="panel-head"><div><h2>Hiring pipeline</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>{state.candidates.length} candidate{state.candidates.length!==1?'s':''} in pipeline</p></div><button className="btn btn-primary" onClick={()=>setModal({type:'candidate'})}>+ Add candidate</button></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(6, minmax(160px,1fr))',gap:12,overflowX:'auto'}}>
      {stages.map(stage=>{
        const inStage=state.candidates.filter(c=>c.stage===stage);
        return <div key={stage} style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:12,minWidth:160}}><h4 style={{fontSize:11.5,textTransform:'uppercase',color:'var(--muted)',marginBottom:10}}>{stage} ({inStage.length})</h4>
          {inStage.map(c=><div key={c.id} style={{background:'var(--paper)',color:'var(--ink)',borderRadius:6,padding:'10px 12px',marginBottom:8,fontSize:12.5}}><div style={{fontWeight:600}}>{c.name}</div><div style={{opacity:0.6,fontSize:11}}>{c.role}</div><select value={c.stage} onChange={e=>update(s=>{s.candidates.find(x=>x.id===c.id).stage=e.target.value;})} style={{width:'100%',marginTop:8,fontSize:11,padding:5,borderRadius:4,border:'1px solid rgba(32,21,38,0.2)',background:'#fff'}}>{stages.map(s=><option key={s} value={s}>{s}</option>)}</select>{c.stage==='Offer' && <button onClick={()=>{update(s=>{const cand=s.candidates.find(x=>x.id===c.id); cand.stage='Hired'; s.employees.push({id:uid(),name:cand.name,role:cand.role,gross:0,bank:'',account:'',startDate:new Date().toISOString().slice(0,10),dob:'',active:true,color:AVATAR_COLORS[s.employees.length%AVATAR_COLORS.length], nin:'',payeTin:'',nhfNumber:'',pensionPin:'',nsitfNumber:'', passportPhoto:null, documents: Object.fromEntries(DOC_TYPES.map(dt=>[dt.key,null]))});}); showToast(`${c.name} hired — set salary in Team`);}} style={{width:'100%',marginTop:6,background:'var(--teal)',color:'#fff',border:'none',borderRadius:4,padding:6,fontSize:11,cursor:'pointer'}}>Mark hired</button>}</div>)}
        </div>;
      })}
    </div>
  </>);
}
function Reports({state}){
  const runs=state.runs; const active=state.employees.filter(e=>e.active);
  const totalPaidOut=runs.reduce((s,r)=>s+r.lines.reduce((s2,l)=>s2+l.gross+l.pensionEmployer,0),0);
  const avgNet=active.length?Math.round(active.reduce((s,e)=>s+estimateDeductions(e.gross).net,0)/active.length):0;
  const rows=[]; runs.forEach(r=>['paye','pension','nhf','nsitf'].forEach(item=>rows.push(complianceStatus(state,r.period,item))));
  const filedRate=rows.length?Math.round(100*rows.filter(s=>s==='filed').length/rows.length):0;
  const turnover=state.employees.length?Math.round(100*state.employees.filter(e=>!e.active).length/state.employees.length):0;
  const maxCost=Math.max(...runs.map(r=>r.lines.reduce((s,l)=>s+l.gross+l.pensionEmployer,0)),1);
  return (<>
    <div className="panel-head"><div><h2>Reports</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>Trends across your payroll and team history</p></div></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14,marginBottom:30}}>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:16}}><div style={{fontSize:10.5,textTransform:'uppercase',color:'var(--muted)',marginBottom:6}}>Total paid out</div><div style={{fontFamily:'Newsreader',fontSize:22,fontWeight:600}}>{money(totalPaidOut)}</div></div>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:16}}><div style={{fontSize:10.5,textTransform:'uppercase',color:'var(--muted)',marginBottom:6}}>Avg. net pay</div><div style={{fontFamily:'Newsreader',fontSize:22,fontWeight:600}}>{money(avgNet)}</div></div>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:16}}><div style={{fontSize:10.5,textTransform:'uppercase',color:'var(--muted)',marginBottom:6}}>Compliance filing rate</div><div style={{fontFamily:'Newsreader',fontSize:22,fontWeight:600}}>{filedRate}%</div></div>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--line)',borderRadius:8,padding:16}}><div style={{fontSize:10.5,textTransform:'uppercase',color:'var(--muted)',marginBottom:6}}>Turnover rate</div><div style={{fontFamily:'Newsreader',fontSize:22,fontWeight:600}}>{turnover}%</div></div>
    </div>
    <div className="panel-head"><div><h2>Payroll cost per run</h2></div></div>
    {runs.length? <div style={{display:'flex',alignItems:'flex-end',gap:10,height:140,padding:'10px 0'}}>{runs.map(r=>{
      const cost=r.lines.reduce((s,l)=>s+l.gross+l.pensionEmployer,0);
      const h=Math.round((cost/maxCost)*110)+10;
      return <div key={r.id} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,flex:1}}><div style={{fontSize:10.5,fontFamily:'IBM Plex Mono'}}>{(cost/1000).toFixed(0)}k</div><div style={{width:'100%',maxWidth:36,background:'var(--coral)',borderRadius:'4px 4px 0 0',height:h}}></div><div style={{fontSize:10,color:'var(--muted)'}}>{periodLabel(r.period).slice(0,3)}</div></div>;
    })}</div> : <div style={{color:'var(--muted)',textAlign:'center',padding:30}}>Run payroll to see cost trends.</div>}
  </>);
}
function MyProfile({state}){
  const e=state.employees.find(x=>x.id===state.viewingEmployeeId)||state.employees[0];
  if(!e) return <div style={{color:'var(--muted)',textAlign:'center',padding:30}}>No employee record</div>;
  const d=estimateDeductions(e.gross);
  const myRuns=state.runs.map(r=>({period:r.period,line:r.lines.find(l=>l.employeeId===e.id)})).filter(r=>r.line);
  const myReviews=state.reviews.filter(r=>r.employeeId===e.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  return (<>
    <div className="panel-head"><div><h2>{e.name}</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>{e.role}</p></div></div>
    <div style={{fontSize:10.5,textTransform:'uppercase',opacity:0.55,fontWeight:600,margin:'16px 0 8px'}}>Current payslip</div>
    <div className="run-row" style={{cursor:'default'}}>
      <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid rgba(32,21,38,0.08)',fontSize:13}}><span>Gross salary</span><span style={{fontFamily:'IBM Plex Mono',fontWeight:500}}>{money(e.gross)}</span></div>
      <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid rgba(32,21,38,0.08)',fontSize:13,color:'#8C3B28'}}><span>PAYE tax</span><span style={{fontFamily:'IBM Plex Mono'}}>− {money(d.monthlyPAYE)}</span></div>
      <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid rgba(32,21,38,0.08)',fontSize:13,color:'#8C3B28'}}><span>Pension (8%)</span><span style={{fontFamily:'IBM Plex Mono'}}>− {money(d.pensionEmployee)}</span></div>
      <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid rgba(32,21,38,0.08)',fontSize:13,color:'#8C3B28'}}><span>NHF (2.5%)</span><span style={{fontFamily:'IBM Plex Mono'}}>− {money(d.nhf)}</span></div>
      <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',fontWeight:700,fontSize:14.5}}><span>Net pay</span><span style={{fontFamily:'IBM Plex Mono'}}>{money(d.net)}</span></div>
    </div>
    <div className="panel-head" style={{marginTop:26}}><div><h2>Payslip history</h2></div></div>
    {myRuns.length? myRuns.map(r=><div key={r.period} className="run-row" style={{cursor:'default',display:'flex',justifyContent:'space-between'}}><span style={{fontFamily:'Newsreader',fontWeight:600}}>{periodLabel(r.period)}</span><span style={{fontFamily:'IBM Plex Mono',fontWeight:600}}>{money(r.line.net)}</span></div>) : <div style={{color:'var(--muted)',textAlign:'center',padding:20}}>No payroll runs yet.</div>}
    <div className="panel-head" style={{marginTop:26}}><div><h2>My reviews</h2></div></div>
    {myReviews.length? myReviews.map(r=><div key={r.id} style={{background:'var(--paper)',color:'var(--ink)',borderRadius:8,padding:'16px 18px',marginBottom:10}}><div style={{color:'var(--gold)'}}>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div><div style={{fontSize:13,marginTop:8}}>{r.notes}</div><div style={{fontSize:11,opacity:0.55,marginTop:4}}>{new Date(r.date).toLocaleDateString('en-NG')}</div></div>): <div style={{color:'var(--muted)',textAlign:'center',padding:20}}>No reviews yet.</div>}
  </>);
}


const COURSE_LESSONS = {
  'Workplace Safety Essentials': [
    {heading:'Recognising hazards before harm occurs',body:'A hazard is anything with the potential to cause injury, illness or damage. Risk is the combination of how likely harm is and how serious the outcome could be. Common workplace hazards include wet floors, exposed wiring, blocked exits, unguarded machinery, unsafe lifting, poor lighting, fatigue and aggressive behaviour. A near miss is an event that could have caused harm even when nobody was injured; it should be reported because it reveals a weakness in the system.',scenario:'A worker notices a loose cable crossing a busy walkway. Nobody has tripped yet. Treat this as a hazard now: keep people away, report it and arrange a safe repair rather than waiting for an accident.',activity:'Walk through your work area and list five hazards. For each one, record who could be harmed, the possible consequence and one practical control.'},
    {heading:'Using personal protective equipment correctly',body:'Personal protective equipment (PPE) is the last line of defence after hazards have been eliminated, substituted or controlled through engineering and safe procedures. Select PPE for the actual task: examples include safety footwear, gloves, eye protection, hearing protection, helmets and high-visibility clothing. PPE must fit, be suitable for the hazard, be inspected before use, cleaned and stored correctly. Damaged or poorly fitting equipment should be replaced.',scenario:'A colleague uses ordinary spectacles instead of approved impact-rated eye protection while grinding. The equipment may look similar, but it has not been designed to protect against flying particles.',activity:'Choose one task in your workplace. Identify the hazard, the required PPE, how to inspect it and when it must be replaced.'},
    {heading:'Fire prevention and emergency response',body:'Prevent fires by controlling ignition sources, storing flammable materials safely, maintaining electrical equipment and keeping escape routes clear. Know the alarm signal, nearest safe exits, assembly point and the person responsible for coordinating evacuation. When an alarm sounds, stop work, leave promptly by the safest route, do not use lifts and do not re-enter until authorised. Only use firefighting equipment if trained, the fire is small, an escape route remains available and doing so does not put anyone at risk.',scenario:'Smoke is visible in a storage room. Do not open the door to investigate or collect belongings. Raise the alarm, evacuate and report the location to the response team.',activity:'Draw a simple evacuation route from your normal workstation and identify an alternative exit and assembly point.'},
    {heading:'Safe work practices, ergonomics and incident reporting',body:'Safe work depends on clear procedures, maintained equipment, competent supervision and workers who stop when a task becomes unsafe. Use mechanical aids or team lifting for heavy or awkward loads; keep loads close to the body and avoid twisting. Set screens, chairs and work surfaces to reduce strain. Report injuries, unsafe conditions, near misses and property damage promptly, using factual details: what happened, where, when, who was involved and what immediate action was taken.',scenario:'A worker strains their back while lifting a box alone. The report should identify the load, lifting conditions, available equipment and any procedure that was missing or not followed—not assign blame without evidence.',activity:'Draft a short near-miss report using the facts in the scenario. Suggest one immediate action and one longer-term prevention measure.'},
    {heading:'Putting the safety system into daily practice',body:'A safe workplace is maintained through repeated checks, consultation, training and follow-up. Supervisors should make responsibilities clear, investigate causes rather than blame individuals, and verify that corrective actions work. Workers should participate in briefings, follow approved procedures and raise concerns. Safety rules and legal duties differ by country and industry, so organisations must check the requirements of the jurisdiction and competent regulator where they operate.',scenario:'The same trip hazard appears in weekly inspections. Repeated reminders are not enough; the organisation should investigate why the route remains obstructed and change storage, layout or accountability.',activity:'Create a three-point safety improvement plan: the issue, the person responsible and the date the control will be checked.'}
  ],
  'HR Compliance & Ethics': [
    {heading:'Professional conduct and conflicts of interest',body:'A code of conduct explains expected behaviour, including honesty, respect, responsible use of company resources, confidentiality and compliance with workplace rules. A conflict of interest occurs when personal, family or financial interests could influence—or appear to influence—a work decision. The correct response is to disclose the conflict promptly, avoid participating in the affected decision and follow the organisation’s documented review process.',scenario:'A manager is asked to shortlist a relative for a vacancy. The manager should disclose the relationship and step away from scoring or approving that application.',activity:'Write down two situations in your role that could create an actual or perceived conflict and how you would disclose them.'},
    {heading:'Confidentiality and responsible data handling',body:'Employee records may contain identity details, contact information, salary, bank details, health information and performance records. Access should be limited to people with a legitimate business need. Collect only what is necessary, use approved systems, verify recipients before sharing, protect devices and report suspected loss or unauthorised access immediately. Do not send sensitive records to personal email or unapproved messaging accounts.',scenario:'A colleague requests the full payroll spreadsheet by personal email because they are working from home. Confirm their authority and use the approved secure channel instead.',activity:'Review a routine HR task and identify what personal data it uses, who needs access, where it is stored and when it should be securely deleted.'},
    {heading:'Fair treatment, harassment and respectful workplaces',body:'A respectful workplace is free from bullying, harassment, discrimination, intimidation and retaliation. Managers should respond to concerns promptly, listen without prejudging, preserve confidentiality as far as possible and follow a fair investigation process. Decisions should be based on relevant evidence and consistent criteria. Legal definitions and protected characteristics vary by jurisdiction; employers must apply local law and their own policies together.',scenario:'An employee reports repeated offensive comments from a senior colleague. Do not dismiss the concern as banter or promise absolute secrecy. Explain the process, record the report and refer it through the designated channel.',activity:'Practise a neutral first response to a colleague who reports inappropriate conduct. Include listening, immediate safety and the next step.'},
    {heading:'Recruitment, records and fair HR decisions',body:'HR decisions should be consistent, documented and based on role-related criteria. Recruitment records should show the job requirements, selection method, interview evidence and reasons for the decision. Employment records should be accurate, access-controlled and updated when circumstances change. Avoid assumptions based on age, family status, disability, nationality or other irrelevant personal characteristics.',scenario:'Two candidates have similar experience, but one interviewer prefers a candidate because they attended the same school. Return to the published job criteria and evidence from the structured interview.',activity:'Build a five-criterion interview scorecard for a role and explain how each criterion relates to job performance.'},
    {heading:'Raising concerns and applying ethical judgement',body:'Ethical decisions require recognising the issue, checking relevant policy and law, considering who may be affected, seeking appropriate advice and recording the decision. Employees should know how to raise concerns safely and how reports are handled. Retaliation against someone who raises a concern in good faith is unacceptable. When in doubt, pause the action and consult the authorised HR, compliance or legal contact.',scenario:'A supervisor asks you to change an attendance record to make a preferred employee eligible for a bonus. Do not alter the record; preserve the original information and escalate the request.',activity:'Use the steps in this lesson to write a brief response to the scenario, including what you would document and whom you would contact.'}
  ],
  'Customer Service Excellence': [
    {heading:'Understanding customer needs and service standards',body:'Excellent service starts with understanding what the customer is trying to achieve, not simply responding to the words they use. Listen without interrupting, ask focused questions, confirm the issue and explain what will happen next. Service standards should define response times, ownership, accuracy, accessibility and how updates are provided. Never promise an outcome or deadline that you cannot control.',scenario:'A customer says an order is late and they need it for an event tomorrow. Confirm the order reference, delivery status and latest acceptable outcome before offering realistic options.',activity:'Write three open questions that would help you understand a customer’s problem without making assumptions.'},
    {heading:'Empathy, listening and clear communication',body:'Empathy means acknowledging the customer’s experience while remaining professional. Active listening includes giving attention, paraphrasing the issue, checking understanding and noticing what the customer needs next. Use plain language, avoid jargon and explain unfamiliar terms. A calm tone and clear next step can reduce frustration even when the problem cannot be resolved immediately.',scenario:'A customer repeats the same complaint because previous agents have not explained the delay. Summarise what you heard, acknowledge the repeated effort and state who will own the next update.',activity:'Turn a defensive response such as “That is not our fault” into a helpful, accountable response.'},
    {heading:'Complaint handling and service recovery',body:'A practical recovery sequence is: listen, acknowledge, investigate, resolve or offer options, and follow up. Separate facts from assumptions. If the issue is outside your authority, explain the escalation route and expected update time. Record the complaint accurately so the organisation can identify recurring failures. Do not argue, blame another team or disclose another customer’s information.',scenario:'A customer was charged twice. Verify the transactions, explain the refund process and timeline, escalate where approval is required and give the customer a reference number.',activity:'Create a five-step response for a complaint that you cannot resolve during the first contact.'},
    {heading:'Managing expectations and communicating delays',body:'Customers value timely, honest updates. State what is known, what remains uncertain, who is responsible and when the next update will be sent. If a deadline changes, tell the customer before they have to chase you. Offer alternatives where possible and record commitments so another colleague can continue the case without making the customer repeat everything.',scenario:'A replacement item will take three extra days. Contact the customer with the revised date, reason if confirmed, available alternatives and a specific time for the next update.',activity:'Draft a concise delay update that is honest, empathetic and includes a clear next action.'},
    {heading:'Learning from feedback and measuring service quality',body:'Useful service measures may include first-contact resolution, response time, complaint recurrence, customer satisfaction and quality review results. Metrics need context: a fast response is not good service if the answer is wrong. Review feedback for patterns, identify root causes and agree improvements with owners and deadlines. Protect customer information when analysing or sharing examples.',scenario:'A team’s response time improves but repeat complaints increase. Investigate whether agents are closing cases too early or giving incomplete answers.',activity:'Choose two service measures for your team and explain what behaviour each one should encourage—and what it might accidentally reward.'}
  ],
  'Work-Life Balance': [
    {heading:'Recognising stress and early signs of burnout',body:'Work-related stress can affect concentration, sleep, mood, relationships and physical wellbeing. Burnout is commonly associated with sustained workplace stress that has not been successfully managed; warning signs may include exhaustion, cynicism or detachment, and reduced professional effectiveness. These signs are not a personal failure. Workload, unclear expectations, low control, poor support and repeated recovery-free periods can all contribute.',scenario:'A dependable colleague begins missing deadlines, withdrawing from meetings and making unusual errors. A supportive manager should check in privately, listen and explore work-related causes rather than label the person as lazy.',activity:'Identify three early warning signs you might notice in yourself or a team and one safe action for each.'},
    {heading:'Prioritising work and managing time realistically',body:'Effective time management begins with agreeing priorities and outcomes. Separate urgent work from important work, break large tasks into smaller actions and estimate effort realistically. Use focused work periods and planned breaks; protect time for tasks requiring concentration. When capacity is exceeded, raise the conflict early and ask which priority should move rather than silently accepting impossible deadlines.',scenario:'Three managers assign tasks due on the same afternoon. Clarify the business impact and deadlines with your supervisor and agree the order before work is compromised.',activity:'Plan a realistic workday with three priority outcomes, focused blocks, breaks and one contingency buffer.'},
    {heading:'Healthy boundaries and sustainable availability',body:'Boundaries make expectations about availability, workload and communication clearer. Agree working hours, response expectations and escalation arrangements with your manager and team. Use leave and breaks appropriately, and avoid treating constant availability as proof of commitment. Managers should model boundaries and ensure urgent cover does not depend on one person being permanently online.',scenario:'A team chat continues sending non-urgent messages late at night. Agree a channel for genuine emergencies and schedule ordinary requests for working hours.',activity:'Write a respectful boundary statement that explains your availability and how urgent matters should be handled.'},
    {heading:'Recovery, wellbeing and asking for support',body:'Recovery includes adequate rest, movement, social connection and time away from work. Small routines can help, but individual habits cannot compensate for unsafe workloads or poor management. Seek support early through a manager, HR, employee assistance service or qualified health professional where available. Respect colleagues’ privacy and do not pressure anyone to disclose personal health details.',scenario:'A team member says their workload is affecting their sleep. Listen, ask what work adjustments may help and explain available support without attempting to diagnose them.',activity:'Design a practical weekly recovery plan and identify one workplace change that would make it more achievable.'},
    {heading:'Building a team culture that prevents burnout',body:'Sustainable teams plan capacity, clarify roles, review workload distribution and make it safe to raise concerns. Managers should monitor patterns such as persistent overtime, unused leave, repeated errors and high turnover. Interventions may include reprioritising work, adding cover, improving tools or changing unrealistic service expectations. Wellbeing initiatives should be evaluated alongside working conditions.',scenario:'One employee handles every urgent customer escalation. Cross-train colleagues, document the process and rotate responsibility to reduce dependency and fatigue.',activity:'Recommend two team-level changes that could reduce avoidable stress and describe how you would measure whether they help.'}
  ],
  'Grit & Resilience': [
    {heading:'Understanding grit, resilience and realistic goals',body:'Grit is often described as sustained interest and effort toward long-term goals; resilience is the capacity to adapt and recover when facing difficulty. Neither means ignoring harm, refusing help or working without limits. Useful goals are specific, meaningful and broken into milestones. Progress should be reviewed so that persistence remains connected to evidence and purpose.',scenario:'A project misses its first milestone. The team reviews what happened, adjusts the plan and keeps the meaningful outcome while changing an ineffective method.',activity:'Choose a meaningful work goal and break it into three milestones with evidence that will show progress.'},
    {heading:'Learning from setbacks with a growth mindset',body:'A growth mindset treats skills as developable through practice, feedback, effective strategies and support. It does not mean every outcome is within personal control. After a setback, distinguish facts from interpretations, identify what was controllable, seek feedback and decide what to try differently. Avoid turning one mistake into a fixed judgement about your ability.',scenario:'A presentation receives critical feedback. Instead of concluding “I am bad at presenting”, identify the specific issue—such as unclear structure—and practise a revised opening.',activity:'Use a recent manageable setback to write: what happened, what I learned, what I will change and what support I need.'},
    {heading:'Managing pressure and solving problems step by step',body:'Under pressure, people can rush, narrow their attention or react emotionally. Pause where possible, define the problem, gather reliable information, identify options and assess risks before acting. Break complex work into the next safe and useful step. Escalate early when the impact exceeds your authority or expertise.',scenario:'A key system becomes unavailable shortly before a deadline. Confirm the scope, activate the approved fallback, inform affected people and avoid unapproved workarounds that could expose data.',activity:'Create a simple response plan for a work disruption: first action, person to notify, fallback and recovery check.'},
    {heading:'Using feedback, support and reflection',body:'Resilience is strengthened by relationships and constructive feedback, not by handling every challenge alone. Ask specific questions, listen for actionable information and clarify what good performance looks like. Reflection should focus on learning and next steps rather than blame. Managers can help by making feedback timely, respectful and linked to observable behaviour.',scenario:'A colleague says your handovers are incomplete. Ask which information is missing, agree a checklist and review the next two handovers together.',activity:'Prepare three questions you could ask a trusted colleague or manager to get useful feedback on a current goal.'},
    {heading:'Maintaining progress without sacrificing wellbeing',body:'Long-term performance requires pacing, rest, flexibility and willingness to revise goals when circumstances change. Track progress, celebrate meaningful milestones and notice when a strategy is no longer effective. Persistence is not the same as staying with an unsafe or unethical course of action. Seek help, reset priorities or stop when the evidence calls for it.',scenario:'A team continues using an outdated process because “we have always done it this way”. Resilience means learning and adapting, not defending an ineffective routine.',activity:'Write a personal progress review with one achievement, one lesson, one adjustment and one boundary that will protect sustainable effort.'}
  ],
  'Effective Communication': [
    {heading:'Choosing the right message and channel',body:'Effective communication starts with purpose: inform, request, decide, resolve or document. Consider the audience, urgency, sensitivity and need for a record. Use a conversation for complex or emotional issues, an approved written channel for decisions and records, and accessible formats where needed. Sensitive employee or customer information must only be shared through authorised channels with appropriate recipients.',scenario:'A performance concern is being discussed in a large group chat. Move the sensitive discussion to a private, appropriate channel and document agreed actions securely.',activity:'Choose three routine work messages and explain the best channel and why it fits each one.'},
    {heading:'Writing clearly and professionally',body:'A clear work message puts the main point early, uses short sentences, names the required action and gives a realistic deadline. Use headings or bullets for complex instructions. Check names, dates, figures and attachments before sending. Avoid ambiguous phrases such as “soon” or “handle this”; state who will do what and by when.',scenario:'“Please sort the report quickly” is unclear. A stronger request names the report, required figures, owner and agreed due date.',activity:'Rewrite a vague work request as a concise message with context, action, owner and deadline.'},
    {heading:'Active listening and asking better questions',body:'Active listening means giving attention, allowing the speaker to finish, asking clarifying questions and summarising the key message. Open questions invite explanation; closed questions confirm specific facts. Do not assume silence means agreement. Check understanding, especially when instructions, risks or deadlines matter.',scenario:'A colleague says a process is “not working”. Ask what step fails, when it occurs, what they expected and what evidence they have before proposing a fix.',activity:'Prepare two open questions and two confirmation questions for a work problem you need to understand.'},
    {heading:'Giving and receiving constructive feedback',body:'Useful feedback is timely, specific, respectful and focused on observable behaviour and its impact. Describe the situation, the behaviour and the effect, then invite the other person’s perspective and agree a practical next step. When receiving feedback, listen, ask for an example and decide what action is appropriate. Avoid labels, public humiliation and personal attacks.',scenario:'Instead of saying “You are careless”, explain that the client report contained two incorrect figures, describe the impact and agree a checking step before submission.',activity:'Draft one feedback statement using situation, behaviour and impact, followed by a question that invites discussion.'},
    {heading:'Meetings, handovers and communication across teams',body:'A useful meeting has a purpose, the right participants and a clear outcome. Share an agenda, keep discussion focused and record decisions, owners and due dates. Good handovers include current status, relevant facts, outstanding risks, next action and contact details. In remote or cross-cultural teams, avoid idioms, confirm time zones and check understanding without making assumptions.',scenario:'A shift ends with an unresolved customer issue. A complete handover records the case reference, what has been checked, what remains outstanding, the promised update time and the next owner.',activity:'Create a short handover note for an unfinished task using status, evidence, risk, next action, owner and deadline.'}
  ]
};
const COURSE_QUIZZES = {
  'Workplace Safety Essentials': [
    {q:'A hazard is best described as:',a:['Anything with potential to cause harm','An injury that has already happened','Only a broken machine'],correct:0},
    {q:'A near miss should be reported because:',a:['It proves someone is at fault','It reveals a risk before harm occurs','No injury means no action is needed'],correct:1},
    {q:'PPE should normally be selected after:',a:['Hazards are assessed and higher-level controls considered','A worker chooses what looks comfortable','An incident has happened'],correct:0},
    {q:'If PPE is damaged, you should:',a:['Continue carefully','Share it with a colleague','Stop using it and report/replace it'],correct:2},
    {q:'When an evacuation alarm sounds, you should:',a:['Collect personal belongings first','Leave by a safe route and go to the assembly point','Use the lift to save time'],correct:1},
    {q:'A safe manual lift generally involves:',a:['Keeping the load close and avoiding twisting','Twisting while holding the load away','Lifting beyond your capability'],correct:0},
    {q:'An incident report should contain:',a:['Rumours about who is responsible','Factual details, location, time and action taken','Only the injured person’s opinion'],correct:1},
    {q:'Who has a role in reporting workplace hazards?',a:['Only the safety manager','Only supervisors','Everyone who identifies a hazard'],correct:2},
    {q:'Repeated blocked exits require:',a:['A lasting control and follow-up','Another reminder only','Ignoring it if no fire occurred'],correct:0},
    {q:'Safety rules should be checked against:',a:['A colleague’s memory','The relevant local law, regulator and workplace procedure','Rules from an unrelated country'],correct:1}
  ],
  'HR Compliance & Ethics': [
    {q:'A conflict of interest should be:',a:['Disclosed promptly and managed transparently','Hidden if no one asks','Decided privately by the person involved'],correct:0},
    {q:'Employee records should be accessed by:',a:['Anyone in the company','Only people with a legitimate authorised need','All external suppliers'],correct:1},
    {q:'The safest response to a harassment report is to:',a:['Dismiss it as a joke','Promise absolute secrecy','Listen, record appropriately and follow the reporting process'],correct:2},
    {q:'Fair recruitment decisions should be based on:',a:['Role-related criteria and evidence','Personal similarity to the interviewer','Unverified assumptions'],correct:0},
    {q:'If asked to falsify an attendance record, you should:',a:['Make the change if a manager asks','Preserve accurate records and escalate the request','Delete the original record'],correct:1},
    {q:'Data minimisation means:',a:['Collecting only information needed for a defined purpose','Collecting every possible detail','Keeping data forever'],correct:0},
    {q:'Confidential information should be sent:',a:['To any personal email for convenience','In a public group chat','Only through approved channels to authorised recipients'],correct:2},
    {q:'A fair investigation should:',a:['Assume the accused person is guilty','Consider evidence impartially and follow policy','Share details widely'],correct:1},
    {q:'Retaliation against a good-faith report is:',a:['Acceptable if the report is inconvenient','A management preference','Unacceptable and should be addressed'],correct:2},
    {q:'When uncertain about an ethical decision, you should:',a:['Pause and seek authorised advice','Proceed secretly','Destroy related records'],correct:0}
  ],
  'Customer Service Excellence': [
    {q:'The first step in understanding a complaint is to:',a:['Interrupt with a solution','Listen and clarify the customer’s issue','Blame another department'],correct:1},
    {q:'Empathy in service means:',a:['Agreeing to every demand','Acknowledging the customer’s experience respectfully','Making promises you cannot keep'],correct:1},
    {q:'A good recovery process includes:',a:['Listen, acknowledge, investigate, resolve and follow up','Argue until the customer stops','Close the case without explanation'],correct:0},
    {q:'If a resolution is outside your authority, you should:',a:['Explain the escalation and next update','Ignore the customer','Invent an approval'],correct:0},
    {q:'When a delivery is delayed, communicate:',a:['Only when the customer complains again','Confirmed facts, options and next update time','An unverified delivery promise'],correct:1},
    {q:'A service metric should be interpreted:',a:['With context and quality evidence','As the only measure of success','Without considering repeat complaints'],correct:0},
    {q:'A useful open question is:',a:['“You are wrong, aren’t you?”','“Why did you do that?”','“Can you describe what happened?”'],correct:2},
    {q:'Complaint records help the organisation:',a:['Identify recurring causes and improve service','Punish every customer','Avoid investigating patterns'],correct:0},
    {q:'A customer should not have to:',a:['Receive a reference number','Repeat the same information unnecessarily','Be told the next step'],correct:1},
    {q:'A fast response is not good service if it is:',a:['Accurate','Helpful','Incorrect or incomplete'],correct:2}
  ],
  'Work-Life Balance': [
    {q:'Burnout is commonly associated with:',a:['Sustained unmanaged workplace stress','A single busy afternoon only','Lack of ambition'],correct:0},
    {q:'When priorities conflict, an employee should:',a:['Silently accept every deadline','Clarify impact and agree priorities with the manager','Ignore all tasks'],correct:1},
    {q:'Healthy boundaries help to:',a:['Make availability expectations clear','Prevent all teamwork','Avoid accountability'],correct:0},
    {q:'A wellbeing habit can:',a:['Replace safe staffing and workload planning','Support recovery but not replace good work design','Guarantee nobody experiences stress'],correct:1},
    {q:'A supportive response to a colleague under strain is to:',a:['Diagnose their condition','Listen and discuss work support options','Share their concern with the whole team'],correct:1},
    {q:'A sustainable team should:',a:['Depend on one person for every emergency','Ignore overtime patterns','Review workload and build appropriate cover'],correct:2},
    {q:'If capacity is exceeded, raise it:',a:['Early, with clear priorities and options','Only after a deadline is missed','Never'],correct:0},
    {q:'Managers should monitor:',a:['Only output numbers','Workload patterns, overtime and repeated errors','Private medical details without permission'],correct:1},
    {q:'Recovery may include:',a:['Rest, movement and time away from work','Working through every break','Constant online availability'],correct:0},
    {q:'Wellbeing initiatives should be assessed alongside:',a:['Workload and working conditions','Office decorations only','Social media likes'],correct:0}
  ],
  'Grit & Resilience': [
    {q:'Resilience is best understood as:',a:['Never asking for help','Adapting and recovering when facing difficulty','Ignoring unsafe conditions'],correct:1},
    {q:'A useful goal should be:',a:['Meaningful and broken into milestones','Impossible to measure','Changed every hour'],correct:0},
    {q:'A growth mindset focuses on:',a:['Skills developing through practice, feedback and support','Believing effort alone guarantees success','Avoiding difficult tasks'],correct:0},
    {q:'After a setback, first:',a:['Separate facts from assumptions and identify learning','Blame a colleague','Hide the outcome'],correct:0},
    {q:'Under pressure, a useful approach is to:',a:['Rush without checking','Define the problem, gather facts and assess options','Avoid informing anyone'],correct:1},
    {q:'Constructive feedback should be:',a:['Specific and linked to observable behaviour','Personal and insulting','Shared publicly to embarrass'],correct:0},
    {q:'Persistence should not mean:',a:['Learning from evidence','Adjusting an ineffective strategy','Continuing an unsafe or unethical action'],correct:2},
    {q:'When a disruption exceeds your authority, you should:',a:['Escalate and use an approved fallback','Invent a workaround','Keep quiet'],correct:0},
    {q:'Resilience is strengthened by:',a:['Supportive relationships and useful feedback','Isolation at all times','Never taking breaks'],correct:0},
    {q:'A progress review should include:',a:['Only failures','Achievements, lessons and adjustments','Personal blame'],correct:1}
  ],
  'Effective Communication': [
    {q:'Before sending a message, identify its:',a:['Purpose and audience','Font colour only','Length only'],correct:0},
    {q:'A clear request should state:',a:['“Do it soon”','Action, owner and realistic deadline','Only the sender’s frustration'],correct:1},
    {q:'Active listening includes:',a:['Interrupting to finish sentences','Assuming silence means agreement','Summarising and checking understanding'],correct:2},
    {q:'Sensitive employee information should be:',a:['Shared in a public group','Sent only to authorised recipients through approved channels','Forwarded to personal accounts'],correct:1},
    {q:'Constructive feedback should focus on:',a:['Observable behaviour and its impact','Personality labels','Rumours'],correct:0},
    {q:'A useful handover includes:',a:['Status, risks, next action, owner and deadline','Only “please continue”','Unverified assumptions'],correct:0},
    {q:'An open question is useful because it:',a:['Invites explanation','Forces a yes/no answer','Prevents clarification'],correct:0},
    {q:'For complex or emotional issues, a suitable channel may be:',a:['A public noticeboard','A private conversation with appropriate follow-up record','An anonymous group chat'],correct:1},
    {q:'Meeting notes should capture:',a:['Decisions, owners and due dates','Every unrelated conversation','Only attendance'],correct:0},
    {q:'In cross-time-zone teams, confirm:',a:['Local time and deadlines','That everyone uses the same idioms','Nothing; assumptions are enough'],correct:0}
  ]
};
function courseLessonMaterial(courseTitle,index){
  const lessons=COURSE_LESSONS[courseTitle]||[];
  return lessons[index]||{heading:'Lesson notes',body:'Read the lesson summary, discuss how the topic applies to your role and follow your organisation’s approved procedures. Requirements may differ by country, sector and workplace.',scenario:'Consider a realistic situation from your team and identify the safest, fairest and most practical response.',activity:'Write one action you can apply at work and how you will know it has helped.'};
}

function CourseView({tr, state, update, showToast, close}){
  const [answers,setAnswers]=useState({});
  const [showResult,setShowResult]=useState(null);
  const [selectedLesson,setSelectedLesson]=useState(0);
  if(!tr) return <div style={{padding:20,color:'#8C3B28'}}>Course not found — please refresh and try again.</div>;
  const myId=state.viewingEmployeeId||state.employees[0]?.id;
  const quizQuestions=COURSE_QUIZZES[tr.title]||COURSE_QUIZZES['Effective Communication'];
  const quizModule=tr.modules.find(m=>m.type==='quiz');
  const enrollment=state.enrollments.find(e=>e.employeeId===myId&&e.trainingId===tr.id);
  const completedIds=enrollment?.completedModules||[];
  function markModuleComplete(module){
    update(s=>{
      let record=s.enrollments.find(e=>e.employeeId===myId&&e.trainingId===tr.id);
      if(!record){record={id:uid(),employeeId:myId,trainingId:tr.id,progress:0,completedModules:[],enrolledAt:new Date().toISOString().slice(0,10),completedAt:null,score:null,certificateId:null};s.enrollments.push(record);}
      if(!record.completedModules.includes(module.id)) record.completedModules.push(module.id);
      record.progress=Math.round(100*record.completedModules.length/tr.modules.length);
      if(record.progress===100&&!record.certificateId){const cid=uid();record.certificateId=cid;record.completedAt=new Date().toISOString().slice(0,10);s.certificates.push({id:cid,employeeId:myId,trainingId:tr.id,issuedAt:record.completedAt,score:record.score||null});}
    });
    showToast('Lesson marked complete');
  }
  function submitQuiz(){
    const score=quizQuestions.reduce((total,question,index)=>total+(answers[index]===question.correct?1:0),0);
    const pct=Math.round(100*score/quizQuestions.length);
    const pass=pct>=70;
    setShowResult({score:pct,pass});
    if(pass){
      update(s=>{
        let record=s.enrollments.find(e=>e.employeeId===myId&&e.trainingId===tr.id);
        if(!record){record={id:uid(),employeeId:myId,trainingId:tr.id,progress:0,completedModules:[],enrolledAt:new Date().toISOString().slice(0,10),completedAt:null,score:null,certificateId:null};s.enrollments.push(record);}
        if(quizModule&&!record.completedModules.includes(quizModule.id))record.completedModules.push(quizModule.id);
        record.score=pct;
        record.progress=Math.round(100*record.completedModules.length/tr.modules.length);
        if(record.progress===100&&!record.certificateId){const cid=uid();record.certificateId=cid;record.completedAt=new Date().toISOString().slice(0,10);s.certificates.push({id:cid,employeeId:myId,trainingId:tr.id,issuedAt:record.completedAt,score:pct});}
      });
    }
  }
  const lessonModules=tr.modules.filter(m=>m.type!=='quiz');
  const selectedModule=lessonModules[selectedLesson]||lessonModules[0];
  const material=selectedModule?courseLessonMaterial(tr.title,selectedLesson):null;
  return <>
    <div style={{background:'rgba(32,21,38,0.05)',borderRadius:8,padding:12,marginBottom:12}}>
      <div style={{fontSize:11,opacity:0.6}}>{tr.category} · {tr.duration} · {tr.required?'Required':''}</div>
      <div style={{fontWeight:700,marginTop:4}}>{tr.title}</div>
      <div style={{fontSize:12,opacity:0.7,marginTop:4}}>{tr.description}</div>
      <div style={{fontSize:11,marginTop:8,fontWeight:600}}>Course progress: {enrollment?.progress||0}% · {completedIds.length}/{tr.modules.length} learning activities completed</div>
    </div>
    <div style={{fontSize:11,fontWeight:600,letterSpacing:0.05+'em',textTransform:'uppercase',opacity:0.6,marginBottom:6}}>Course lessons</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:7,marginBottom:12}}>
      {lessonModules.map((m,i)=><button key={m.id} onClick={()=>setSelectedLesson(i)} style={{textAlign:'left',padding:10,borderRadius:7,border:selectedLesson===i?'2px solid #4C8577':'1px solid #ddd',background:selectedLesson===i?'#edf5f2':'#fff',color:'#201526',cursor:'pointer'}}>
        <div style={{fontSize:11,opacity:0.6}}>LESSON {i+1} · {m.duration}</div><div style={{fontSize:12,fontWeight:700,marginTop:3}}>{m.title}</div><div style={{fontSize:10,marginTop:4,color:completedIds.includes(m.id)?'#287454':'#777'}}>{completedIds.includes(m.id)?'Completed ✓':'Not completed'}</div>
      </button>)}
    </div>
    {selectedModule&&material&&<section style={{background:'#fff',color:'#201526',border:'1px solid #ddd',borderRadius:8,padding:16,marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'#4C8577'}}>STUDY LESSON {selectedLesson+1}</div>
      <h3 style={{fontSize:18,fontWeight:700,margin:'5px 0 12px'}}>{material.heading}</h3>
      <p style={{fontSize:13,lineHeight:1.75,whiteSpace:'pre-wrap'}}>{material.body}</p>
      <div style={{background:'#f4f5f6',borderLeft:'3px solid #C9A227',padding:12,borderRadius:5,marginTop:12}}>
        <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',marginBottom:5}}>Workplace example</div><p style={{fontSize:12,lineHeight:1.6,margin:0}}>{material.scenario}</p>
      </div>
      <div style={{background:'#edf5f2',borderLeft:'3px solid #4C8577',padding:12,borderRadius:5,marginTop:10}}>
        <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',marginBottom:5}}>Practical exercise</div><p style={{fontSize:12,lineHeight:1.6,margin:0}}>{material.activity}</p>
      </div>
      <button onClick={()=>markModuleComplete(selectedModule)} disabled={completedIds.includes(selectedModule.id)} style={{marginTop:12,background:completedIds.includes(selectedModule.id)?'#e3e8e5':'#4C8577',color:completedIds.includes(selectedModule.id)?'#287454':'#fff',border:'none',padding:'9px 14px',borderRadius:6,fontSize:12,fontWeight:600,cursor:completedIds.includes(selectedModule.id)?'default':'pointer'}}>{completedIds.includes(selectedModule.id)?'Lesson completed ✓':'Mark lesson complete'}</button>
    </section>}
    {quizModule&&<section id="quiz-area" style={{marginTop:14,background:'#fff',color:'#201526',border:'1px solid #ddd',borderRadius:8,padding:14}}>
      <div style={{fontWeight:700,fontSize:15}}>Final assessment — {tr.title}</div>
      <div style={{fontSize:11,opacity:0.65,marginTop:3}}>{quizQuestions.length} course-specific questions · 70% pass mark · Complete the lessons before attempting the assessment.</div>
      {showResult?<div style={{textAlign:'center',padding:16}}>
        <div style={{fontSize:22,fontWeight:700,color:showResult.pass?'#4C8577':'#E2735B'}}>{showResult.pass?'Passed ✓':'Not passed yet'}</div>
        <div style={{fontFamily:'monospace',fontSize:18,marginTop:6}}>{showResult.score}%</div>
        <div style={{fontSize:11,opacity:0.7,marginTop:4}}>{showResult.pass?(tr.modules.every(m=>(m.type==='quiz'?true:completedIds.includes(m.id)))?'Assessment passed. Your course completion is being recorded.':'Assessment passed. Complete every lesson to earn your certificate.'):'Review the lessons and try again.'}</div>
        <button onClick={()=>{setShowResult(null);setAnswers({});}} style={{marginTop:10,background:'#201526',color:'#fff',border:'none',padding:'7px 12px',borderRadius:6,fontSize:12,cursor:'pointer'}}>Retake assessment</button>
      </div>:<div>
        {quizQuestions.map((question,index)=><div key={index} style={{marginTop:10,padding:10,background:'rgba(32,21,38,0.04)',borderRadius:6}}>
          <div style={{fontSize:12,fontWeight:600}}>{index+1}. {question.q}</div>
          <div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}}>{question.a.map((option,optionIndex)=><label key={optionIndex} style={{fontSize:11,background:answers[index]===optionIndex?'#201526':'#fff',color:answers[index]===optionIndex?'#fff':'#201526',border:'1px solid #ddd',padding:'6px 10px',borderRadius:20,cursor:'pointer'}}><input type="radio" name={`q-${tr.id}-${index}`} checked={answers[index]===optionIndex} onChange={()=>setAnswers(previous=>({...previous,[index]:optionIndex}))} style={{display:'none'}}/>{option}</label>)}</div>
        </div>)}
        <button onClick={submitQuiz} disabled={Object.keys(answers).length!==quizQuestions.length} style={{marginTop:12,background:Object.keys(answers).length===quizQuestions.length?'#E2735B':'#aaa',color:'#fff',border:'none',padding:'9px 14px',borderRadius:6,fontSize:12,cursor:'pointer',width:'100%'}}>Submit assessment</button>
        <div style={{fontSize:10,opacity:0.55,marginTop:6}}>A pass records the assessment. A certificate is issued only after every lesson and the assessment are completed.</div>
      </div>}
    </section>}
    <div style={{marginTop:12,textAlign:'right'}}><button onClick={close} style={{background:'#201526',color:'#fff',border:'none',padding:'7px 12px',borderRadius:6,fontSize:12,cursor:'pointer'}}>Close</button></div>
  </>;
}
function AuthScreen({authForm,setAuthForm,onAuth,showToast}){
  const [busy,setBusy]=useState(false);
  const f=authForm;
  async function submit(e){
    e.preventDefault();
    setBusy(true);
    try{
      if(f.mode==='signup'){
        if(!f.companyName||!f.name||!f.email||f.password.length<8){ showToast('Fill company, name, valid email, password 8+ chars'); setBusy(false); return; }
        const r=await AuthAPI.signup({companyName:f.companyName,name:f.name,email:f.email,password:f.password});
        setSession(r.token,r.user); showToast('Company created — welcome ✓'); onAuth();
      } else {
        if(!f.email||!f.password){ showToast('Enter email + password'); setBusy(false); return; }
        const r=await AuthAPI.login({email:f.email,password:f.password});
        setSession(r.token,r.user); showToast(`Welcome back, ${r.user.name} ✓`); onAuth();
      }
    }catch(err){ showToast(err.message||'Login failed'); }
    setBusy(false);
  }
  return (
    <div style={{minHeight:'100vh', background:'#241623', color:'#EDEEF2', display:'flex', alignItems:'center', justifyContent:'center', padding:24}}>
      <div style={{maxWidth:480, width:'100%', background:'#EDEEF2', color:'#201526', borderRadius:12, padding:32, boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}><div style={{width:36,height:36,borderRadius:'50% 50% 50% 6px',background:'#E2735B'}}/><div><div style={{fontFamily:'Newsreader, serif',fontStyle:'italic',fontWeight:700,fontSize:22}}>Medash HR Suite</div><div style={{fontSize:12,opacity:0.6}}>Real login · Postgres · server payroll — {getApiBase()}</div></div></div>
        <div style={{display:'flex',gap:8,marginBottom:16}}>
          {['login','signup'].map(m=><button key={m} onClick={()=>setAuthForm({...f,mode:m})} style={{flex:1,padding:'9px 0',borderRadius:6,border:'1px solid rgba(32,21,38,0.2)',background:f.mode===m?'#201526':'transparent',color:f.mode===m?'#fff':'#201526',fontSize:13,fontWeight:600,cursor:'pointer',textTransform:'capitalize'}}>{m==='login'?'Log in':'New company'}</button>)}
        </div>
        <form onSubmit={submit}>
          {f.mode==='signup' && <><div className="field"><label>Company name</label><input value={f.companyName} onChange={e=>setAuthForm({...f,companyName:e.target.value})} placeholder="e.g. GreenField Ltd"/></div>
          <div className="field"><label>Your name</label><input value={f.name} onChange={e=>setAuthForm({...f,name:e.target.value})} placeholder="e.g. Ada Obi"/></div></>}
          <div className="field"><label>Email</label><input value={f.email} onChange={e=>setAuthForm({...f,email:e.target.value})} placeholder="you@company.com"/></div>
          <div className="field"><label>Password (8+ chars)</label><input type="password" value={f.password} onChange={e=>setAuthForm({...f,password:e.target.value})}/></div>
          <button type="submit" disabled={busy} className="btn btn-primary" style={{width:'100%',marginTop:4,padding:12,opacity:busy?0.6:1}}>{busy?'Please wait…':f.mode==='signup'?'Create company + owner login':'Log in'}</button>
        </form>
        <div style={{marginTop:14,display:'flex',gap:8,flexWrap:'wrap'}}>
          <button onClick={()=>{ localStorage.setItem(CLOUD_OFF_KEY,'1'); location.reload(); }} style={{fontSize:12,border:'1px solid rgba(32,21,38,0.2)',padding:'8px 12px',borderRadius:6,background:'transparent',cursor:'pointer'}}>Continue offline (no cloud)</button>
          <button onClick={()=>{ const u=prompt('Backend URL (empty = default from deploy):', localStorage.getItem('roost_api_base')||''); if(u!==null){ setApiBaseOverride(u.trim()); location.reload(); } }} style={{fontSize:12,border:'1px solid rgba(32,21,38,0.2)',padding:'8px 12px',borderRadius:6,background:'transparent',cursor:'pointer'}}>Change backend URL</button>
        </div>
        <p style={{fontSize:11,opacity:0.55,marginTop:14}}>Each person logs in with their own email — employees only ever see their own payslip. Invite them from Team → Invite after logging in.</p>
      </div>
    </div>
  );
}
function Modal({modal,setModal,state,update,showToast}){
  const [form,setForm]=useState(()=>{
    if(modal.type==='employee'){
      if(modal.data){ const e=state.employees.find(x=>x.id===modal.data); return {name:e.name,role:e.role,gross:e.gross,bank:e.bank,account:e.account,startDate:e.startDate,dob:e.dob||''}; } else return {name:'',role:'',gross:'',bank:'',account:'',startDate:'',dob:''};
    }
    if(modal.type==='review') return {emp:state.employees.filter(e=>e.active)[0]?.id||'',rating:0,notes:''};
    if(modal.type==='candidate') return {name:'',role:'',notes:''};
    if(modal.type==='course') return {title:'',category:'Compliance',duration:'2h',description:'',required:true};
    if(modal.type==='editCourse'){ const tr=state.trainings.find(x=>x.id===modal.data); return {title:tr.title,category:tr.category,duration:tr.duration,description:tr.description,required:tr.required}; }
    if(modal.type==='enroll') return {employeeId: state.employees.filter(e=>e.active)[0]?.id||'', trainingId: modal.preset|| state.trainings[0]?.id||''};
    if(modal.type==='leave') return {employeeId: state.employees.filter(e=>e.active)[0]?.id||'', type:'annual', from:'', to:'', reason:''};
    if(modal.type==='attendance') return {employeeId: state.employees.filter(e=>e.active)[0]?.id||'', date:new Date().toISOString().slice(0,10), clockIn:'08:00', clockOut:'', status:'present'};
    if(modal.type==='orgUnit'){ if(modal.data){ const u=state.orgUnits.find(x=>x.id===modal.data); return {name:u.name, head:u.head||'', color:u.color}; } return {name:'', head:'', color:'#4C8577'}; }
    if(modal.type==='assignDept') return {employeeId: state.employees[0]?.id||'', dept: state.orgUnits[0]?.id||''};
    return {};
  });
  const [ids,setIds]=useState(()=>{ if(modal.type==='staffDocs'){ const e=state.employees.find(x=>x.id===modal.data); return {nin:e.nin||'',payeTin:e.payeTin||'',nhfNumber:e.nhfNumber||'',pensionPin:e.pensionPin||'',nsitfNumber:e.nsitfNumber||''}; } return {}; });
  function close(){ setModal(null); }

  async function handleUpload(docKey, file){
    if(!file) return;
    if(file.size>6*1024*1024){ alert('File too large — max 6MB (offline storage limit)'); return; }
    if(docKey==='passport' && file.type && !file.type.startsWith('image/')){ alert('Passport photo must be an image (JPG/PNG)'); return; }
    const reader=new FileReader();
    reader.onload=()=>{
      update(s=>{
        const emp=s.employees.find(x=>x.id===modal.data);
        emp.documents[docKey]={fileName:file.name, size:file.size, uploadedAt:new Date().toISOString().slice(0,10), dataUrl: reader.result, status:'pending'};
        if(docKey==='passport'){ emp.passportPhoto=reader.result; }
      });
      showToast(`${DOC_TYPES.find(d=>d.key===docKey).label} uploaded — ${docKey==='passport'?'profile picture updated': 'offline saved'}`);
    };
    reader.readAsDataURL(file);
  }

  if(modal.type==='staffDocs'){
    const e=state.employees.find(x=>x.id===modal.data);
    const pct=Math.round(100*DOC_TYPES.filter(dt=>e.documents?.[dt.key]).length/DOC_TYPES.length);
    const grouped={};
    DOC_TYPES.forEach(dt=>{ if(!grouped[dt.category]) grouped[dt.category]=[]; grouped[dt.category].push(dt); });
    async function handlePassport(file){
      if(!file) return;
      if(file.size>4*1024*1024){ alert('Passport photo too large — max 4MB'); return; }
      if(!file.type.startsWith('image/')){ alert('Please upload an image (JPG/PNG)'); return; }
      const reader=new FileReader();
      reader.onload=()=>{
        update(s=>{ const emp=s.employees.find(x=>x.id===e.id); emp.passportPhoto=reader.result; emp.documents['passport']={fileName:file.name, size:file.size, uploadedAt:new Date().toISOString().slice(0,10), dataUrl:reader.result, status:'pending'}; });
        showToast('Passport photo uploaded — profile updated');
      };
      reader.readAsDataURL(file);
    }
    return (
      <div className="overlay" onClick={e2=>{if(e2.target.classList.contains('overlay')) close();}}>
        <div className="modal" style={{maxWidth:720}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><div style={{display:'flex',gap:14,alignItems:'center'}}>
            <div style={{width:64,height:64,borderRadius:'50%',overflow:'hidden',background:e.color,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,border:'2px solid rgba(32,21,38,0.1)'}}>
              {e.passportPhoto ? <img src={e.passportPhoto} alt="passport" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <span style={{color:'#fff',fontFamily:'Newsreader',fontWeight:700,fontSize:20}}>{initials(e.name)}</span>}
            </div>
            <div><h3 style={{fontFamily:'Newsreader',fontSize:20,fontWeight:600}}>{e.name}</h3><p style={{fontSize:12,opacity:0.6}}>{e.role} · {pct}% docs complete</p>
              <label style={{fontSize:11,background:'var(--paper-dim)',padding:'4px 8px',borderRadius:5,cursor:'pointer',marginTop:6,display:'inline-block'}}>📷 {e.passportPhoto?'Change':'Upload'} passport photo<input type="file" accept="image/*" style={{display:'none'}} onChange={ev=>handlePassport(ev.target.files[0])}/></label>
              {e.passportPhoto && <button onClick={()=>update(s=>{ const emp=s.employees.find(x=>x.id===e.id); emp.passportPhoto=null; emp.documents['passport']=null; })} style={{fontSize:11,marginLeft:6,background:'transparent',border:'1px solid rgba(226,115,91,0.4)',color:'#8C3B28',padding:'4px 8px',borderRadius:5,cursor:'pointer'}}>Remove</button>}
            </div>
          </div><button onClick={close} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,opacity:0.55,height:32}}>✕</button></div>
          <div style={{height:6,background:'rgba(32,21,38,0.1)',borderRadius:6,overflow:'hidden',marginBottom:16}}><div style={{width:`${pct}%`,height:'100%',background:'var(--teal)'}}/></div>

          <div style={{background:'rgba(32,21,38,0.05)',borderRadius:8,padding:14,marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:600,letterSpacing:0.06+'em',textTransform:'uppercase',opacity:0.6,marginBottom:8}}>Required IDs & Numbers</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div className="field" style={{marginBottom:0}}><label>NIN (11 digits)</label><input value={ids.nin} onChange={ev=>setIds({...ids,nin:ev.target.value})} placeholder="12345678901"/></div>
              <div className="field" style={{marginBottom:0}}><label>PAYE / TIN</label><input value={ids.payeTin} onChange={ev=>setIds({...ids,payeTin:ev.target.value})} placeholder="PAYE-..."/></div>
              <div className="field" style={{marginBottom:0}}><label>NHF Number</label><input value={ids.nhfNumber} onChange={ev=>setIds({...ids,nhfNumber:ev.target.value})} placeholder="NHF-..."/></div>
              <div className="field" style={{marginBottom:0}}><label>Pension PIN</label><input value={ids.pensionPin} onChange={ev=>setIds({...ids,pensionPin:ev.target.value})} placeholder="PEN..."/></div>
              <div className="field" style={{marginBottom:0}}><label>NSITF Number</label><input value={ids.nsitfNumber} onChange={ev=>setIds({...ids,nsitfNumber:ev.target.value})} placeholder="NSITF-..."/></div>
              <div style={{display:'flex',alignItems:'flex-end'}}><button className="btn btn-primary btn-sm" onClick={()=>{ update(s=>{ const emp=s.employees.find(x=>x.id===e.id); emp.nin=ids.nin; emp.payeTin=ids.payeTin; emp.nhfNumber=ids.nhfNumber; emp.pensionPin=ids.pensionPin; emp.nsitfNumber=ids.nsitfNumber; }); showToast('IDs saved — offline'); }}>Save IDs</button></div>
            </div>
          </div>

          {Object.entries(grouped).map(([cat,docs])=> <div key={cat} style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:600,letterSpacing:0.06+'em',textTransform:'uppercase',opacity:0.55,marginBottom:8}}>{cat}</div>
            {docs.map(dt=>{
              const doc=e.documents?.[dt.key];
              return <div key={dt.key} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#fff',border:'1px solid rgba(32,21,38,0.08)',borderRadius:6,marginBottom:6}}>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{dt.label} {dt.required && <span style={{color:'var(--coral)',fontSize:10}}>*</span>}</div><div style={{fontSize:11,opacity:0.6}}>{doc? `${doc.fileName} · ${doc.uploadedAt} · ${(doc.size/1024).toFixed(0)}KB · ${doc.status}` : 'Not uploaded'}</div></div>
                {doc && doc.dataUrl && <a href={doc.dataUrl} download={doc.fileName} style={{fontSize:11,background:'var(--paper-dim)',padding:'6px 10px',borderRadius:5,textDecoration:'none',color:'var(--ink)'}}>Download</a>}
                {doc && <button onClick={()=>{ if(confirm('Remove document?')) update(s=>{ s.employees.find(x=>x.id===e.id).documents[dt.key]=null; }); }} style={{fontSize:11,background:'transparent',border:'1px solid rgba(226,115,91,0.4)',color:'var(--coral)',padding:'6px 10px',borderRadius:5,cursor:'pointer'}}>Remove</button>}
                <label style={{fontSize:11,background:doc?'var(--paper-dim)':'var(--coral)',color:doc?'var(--ink)':'#fff',padding:'6px 10px',borderRadius:5,cursor:'pointer'}}>
                  {doc?'Replace':'Upload'}
                  <input type="file" style={{display:'none'}} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={ev=>handleUpload(dt.key, ev.target.files[0])}/>
                </label>
              </div>;
            })}
          </div>)}
          <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>Proper order: CV → Offer → Acceptance → Deployment → JD → Medicals → IDs → Appraisals. Stored offline in browser.</div>
          <div style={{marginTop:16,textAlign:'right'}}><button onClick={close} className="btn" style={{background:'var(--ink)',color:'#fff'}}>Close</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={e=>{if(e.target.classList.contains('overlay')) close();}}>
      <div className="modal">
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}><h3 style={{fontFamily:'Newsreader',fontSize:20,fontWeight:600}}>
          {modal.type==='employee' ? (modal.data?'Edit teammate':'Add teammate') : modal.type==='review' ? 'Add review' : modal.type==='candidate' ? 'Add candidate' : modal.type==='course' ? 'New course' : modal.type==='editCourse' ? 'Edit course' : modal.type==='enroll' ? 'Enroll staff' : modal.type==='leave' ? 'Request leave' : modal.type==='attendance' ? 'Manual attendance' : modal.type==='orgUnit' ? (modal.data?'Edit department':'New department') : modal.type==='assignDept' ? 'Assign staff to department' : ''}
        </h3><button onClick={close} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,opacity:0.55}}>✕</button></div>

        {modal.type==='employee' && <>
          <div className="field"><label>Full name</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Ada Obi"/></div>
          <div className="field"><label>Role</label><input value={form.role} onChange={e=>setForm({...form,role:e.target.value})} placeholder="e.g. Sales Associate"/></div>
          <div className="field"><label>Gross monthly salary (₦)</label><input type="number" value={form.gross} onChange={e=>setForm({...form,gross:e.target.value})}/></div>
          <div className="field-row"><div className="field"><label>Bank</label><input value={form.bank} onChange={e=>setForm({...form,bank:e.target.value})}/></div><div className="field"><label>Account</label><input value={form.account} onChange={e=>setForm({...form,account:e.target.value})}/></div></div>
          <div className="field-row"><div className="field"><label>Start date</label><input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></div><div className="field"><label>DOB</label><input type="date" value={form.dob} onChange={e=>setForm({...form,dob:e.target.value})}/></div></div>
          <div style={{display:'flex',gap:10,marginTop:20}}><button className="btn btn-primary" onClick={async ()=>{
            if(!form.name||!form.role||!form.gross || Number(form.gross)<=0){ alert('Fill name, role, valid salary'); return; }
            if(getApiBase() && getToken()){
              try{
                const payload={name:form.name,role:form.role,gross:Number(form.gross),bank:form.bank||'',account:form.account||'',startDate:form.startDate||'',dob:form.dob||''};
                if(modal.data){
                  const r=await EmployeesAPI.update(modal.data,payload);
                  update(s=>{ const ex=s.employees.find(x=>x.id===modal.data); if(ex) Object.assign(ex,{name:r.name,role:r.role,gross:r.gross,bank:r.bank||'',account:r.account||'',startDate:r.startDate||'',dob:r.dob||''}); });
                  showToast('Teammate updated (cloud) ✓');
                } else {
                  const r=await EmployeesAPI.create(payload);
                  update(s=>{ const m=cloudEmployeeToLocal(r,s.employees.length); if(s.orgUnits&&s.orgUnits.length) m.department=s.orgUnits[s.employees.length%s.orgUnits.length].id; s.employees.push(m); });
                  showToast('Teammate added (cloud) ✓');
                }
              }catch(err){ showToast('Cloud save failed: '+err.message); return; }
            } else {
              if(modal.data){ update(s=>{ Object.assign(s.employees.find(x=>x.id===modal.data),{name:form.name,role:form.role,gross:Number(form.gross),bank:form.bank,account:form.account,startDate:form.startDate,dob:form.dob});}); showToast('Teammate updated'); }
              else { update(s=>{ s.employees.push({id:uid(),name:form.name,role:form.role,gross:Number(form.gross),bank:form.bank,account:form.account,startDate:form.startDate,dob:form.dob,active:true,color:AVATAR_COLORS[s.employees.length%AVATAR_COLORS.length], nin:'',payeTin:'',nhfNumber:'',pensionPin:'',nsitfNumber:'',passportPhoto:null, documents: Object.fromEntries(DOC_TYPES.map(dt=>[dt.key,null]))});}); showToast('Teammate added'); }
            }
            close();
          }}>{modal.data?'Save changes':'Add teammate'}</button><button className="btn" style={{background:'transparent',border:'1px solid rgba(32,21,38,0.25)'}} onClick={close}>Cancel</button></div>
        </>}

        {modal.type==='review' && <>
          <div className="field"><label>Teammate</label><select value={form.emp} onChange={e=>setForm({...form,emp:e.target.value})}>{state.employees.filter(e=>e.active).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
          <div className="field"><label>Rating</label><div style={{display:'flex',gap:4}}>{[1,2,3,4,5].map(n=><button key={n} onClick={()=>setForm({...form,rating:n})} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color: form.rating>=n ? 'var(--gold)':'rgba(32,21,38,0.2)'}}>★</button>)}</div></div>
          <div className="field"><label>Notes</label><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="What stood out?"/></div>
          <div style={{display:'flex',gap:10,marginTop:20}}><button className="btn btn-primary" onClick={()=>{ if(!form.rating) {alert('Choose rating');return;} update(s=>{s.reviews.push({id:uid(),employeeId:form.emp,rating:form.rating,notes:form.notes,date:new Date().toISOString().slice(0,10)});}); showToast('Review saved'); close();}}>Save review</button><button className="btn" style={{background:'transparent',border:'1px solid rgba(32,21,38,0.25)'}} onClick={close}>Cancel</button></div>
        </>}

        {modal.type==='candidate' && <>
          <div className="field"><label>Full name</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
          <div className="field"><label>Role applying for</label><input value={form.role} onChange={e=>setForm({...form,role:e.target.value})}/></div>
          <div className="field"><label>Notes</label><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
          <div style={{display:'flex',gap:10,marginTop:20}}><button className="btn btn-primary" onClick={()=>{ if(!form.name||!form.role){alert('Fill name & role');return;} update(s=>{s.candidates.push({id:uid(),name:form.name,role:form.role,stage:'Applied',appliedDate:new Date().toISOString().slice(0,10),notes:form.notes});}); showToast('Candidate added'); close();}}>Add candidate</button><button className="btn" style={{background:'transparent',border:'1px solid rgba(32,21,38,0.25)'}} onClick={close}>Cancel</button></div>
        </>}
        {modal.type==='course' && <>
          <div className="field"><label>Title *</label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Data Protection"/></div>
          <div className="field-row"><div className="field"><label>Category</label><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option>Compliance</option><option>Skills</option><option>Onboarding</option><option>Safety</option></select></div><div className="field"><label>Duration</label><input value={form.duration} onChange={e=>setForm({...form,duration:e.target.value})} placeholder="2h"/></div></div>
          <div className="field"><label>Description</label><input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="What will staff learn?"/></div>
          <div className="field"><label><input type="checkbox" checked={form.required} onChange={e=>setForm({...form,required:e.target.checked})}/> Required for all staff</label></div>
          <div style={{display:'flex',gap:10,marginTop:20}}><button className="btn btn-primary" onClick={()=>{
            if(!form.title){ alert('Title required'); return;}
            update(s=>{ s.trainings.push({id:uid(), title:form.title, category:form.category, duration:form.duration, description:form.description, required:form.required, createdAt:new Date().toISOString().slice(0,10), modules:[{id:uid(), title:'Module 1 — Overview', type:'doc', content:'Introduction', duration:'30m'}]}); });
            showToast('Course created'); close();
          }}>Create course</button><button className="btn" style={{background:'transparent',border:'1px solid rgba(32,21,38,0.25)'}} onClick={close}>Cancel</button></div>
        </>}
        {modal.type==='editCourse' && <>
          <div className="field"><label>Title *</label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></div>
          <div className="field-row"><div className="field"><label>Category</label><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option>Compliance</option><option>Skills</option><option>Onboarding</option><option>Safety</option></select></div><div className="field"><label>Duration</label><input value={form.duration} onChange={e=>setForm({...form,duration:e.target.value})}/></div></div>
          <div className="field"><label>Description</label><input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
          <div className="field"><label><input type="checkbox" checked={form.required} onChange={e=>setForm({...form,required:e.target.checked})}/> Required</label></div>
          <div style={{display:'flex',gap:10,marginTop:20}}><button className="btn btn-primary" onClick={()=>{
            update(s=>{ const tr=s.trainings.find(x=>x.id===modal.data); Object.assign(tr,{title:form.title,category:form.category,duration:form.duration,description:form.description,required:form.required});});
            showToast('Course updated'); close();
          }}>Save</button><button className="btn" style={{background:'transparent',border:'1px solid rgba(32,21,38,0.25)'}} onClick={close}>Cancel</button></div>
        </>}
        {modal.type==='enroll' && <>
          <div className="field"><label>Staff</label><select value={form.employeeId} onChange={e=>setForm({...form,employeeId:e.target.value})}>{state.employees.filter(e=>e.active).map(e=> <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}</select></div>
          <div className="field"><label>Course</label><select value={form.trainingId} onChange={e=>setForm({...form,trainingId:e.target.value})}>{state.trainings.map(t=> <option key={t.id} value={t.id}>{t.title} ({t.category})</option>)}</select></div>
          <div style={{display:'flex',gap:10,marginTop:20}}><button className="btn btn-primary" onClick={()=>{
            if(state.enrollments.some(en=>en.employeeId===form.employeeId && en.trainingId===form.trainingId)){ alert('Already enrolled'); return; }
            update(s=>{ s.enrollments.push({id:uid(), employeeId:form.employeeId, trainingId:form.trainingId, progress:0, completedModules:[], enrolledAt:new Date().toISOString().slice(0,10), completedAt:null, score:null, certificateId:null}); });
            showToast('Enrolled — progress tracked'); close();
          }}>Enroll</button><button className="btn" style={{background:'transparent',border:'1px solid rgba(32,21,38,0.25)'}} onClick={close}>Cancel</button></div>
        </>}
        {modal.type==='courseView' && <CourseView tr={state.trainings.find(t=>t.id===modal.data)} state={state} update={update} showToast={showToast} close={close} />}
        {modal.type==='leave' && <>
          <div className="field"><label>Staff</label><select value={form.employeeId||state.employees.filter(e=>e.active)[0]?.id} onChange={e=>setForm({...form,employeeId:e.target.value})} disabled={state.currentRole==='employee'}>{state.employees.filter(e=>e.active).map(e=> <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
          <div className="field"><label>Leave type</label><select value={form.type||'annual'} onChange={e=>setForm({...form,type:e.target.value})}>{LEAVE_TYPES.map(t=> <option key={t.key} value={t.key}>{t.label} ({t.days}d/year)</option>)}</select></div>
          <div className="field-row"><div className="field"><label>From</label><input type="date" value={form.from||''} onChange={e=>setForm({...form,from:e.target.value})}/></div><div className="field"><label>To</label><input type="date" value={form.to||''} onChange={e=>setForm({...form,to:e.target.value})}/></div></div>
          <div className="field"><label>Reason</label><input value={form.reason||''} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="Reason for leave"/></div>
          <div style={{display:'flex',gap:10,marginTop:20}}><button className="btn btn-primary" onClick={()=>{
            const empId = state.currentRole==='employee'? (state.viewingEmployeeId||state.employees[0]?.id) : (form.employeeId||state.employees[0]?.id);
            if(!form.from || !form.to){ alert('Select dates'); return; }
            const d1=new Date(form.from), d2=new Date(form.to); const days=Math.max(1, Math.round((d2-d1)/86400000)+1);
            if(days<=0){ alert('Invalid dates'); return; }
            update(s=>{ s.leaves.push({id:uid(), employeeId:empId, type:form.type||'annual', from:form.from, to:form.to, days, reason:form.reason||'', status:'pending', createdAt:new Date().toISOString().slice(0,10)}); });
            showToast('Leave request sent — pending approval'); close();
          }}>Submit request</button><button className="btn" style={{background:'transparent',border:'1px solid rgba(32,21,38,0.25)'}} onClick={close}>Cancel</button></div>
        </>}
        {modal.type==='attendance' && <>
          <div className="field"><label>Staff</label><select value={form.employeeId||state.employees.filter(e=>e.active)[0]?.id} onChange={e=>setForm({...form,employeeId:e.target.value})}>{state.employees.filter(e=>e.active).map(e=> <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
          <div className="field"><label>Date</label><input type="date" value={form.date||new Date().toISOString().slice(0,10)} onChange={e=>setForm({...form,date:e.target.value})}/></div>
          <div className="field-row"><div className="field"><label>Clock In</label><input type="time" value={form.clockIn||''} onChange={e=>setForm({...form,clockIn:e.target.value})}/></div><div className="field"><label>Clock Out</label><input type="time" value={form.clockOut||''} onChange={e=>setForm({...form,clockOut:e.target.value})}/></div></div>
          <div className="field"><label>Status</label><select value={form.status||'present'} onChange={e=>setForm({...form,status:e.target.value})}><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select></div>
          <div style={{display:'flex',gap:10,marginTop:20}}><button className="btn btn-primary" onClick={()=>{
            const empId=form.employeeId||state.employees[0]?.id;
            const date=form.date||new Date().toISOString().slice(0,10);
            if(state.attendance.some(a=>a.employeeId===empId && a.date===date)){ alert('Record exists for this date — edit via table'); return; }
            update(s=>{ s.attendance.push({id:uid(), employeeId:empId, date, clockIn:form.clockIn||null, clockOut:form.clockOut||null, status:form.status||'present'}); });
            showToast('Attendance saved'); close();
          }}>Save</button><button className="btn" style={{background:'transparent',border:'1px solid rgba(32,21,38,0.25)'}} onClick={close}>Cancel</button></div>
        </>}
        {modal.type==='orgUnit' && <>
          <div className="field"><label>Department name *</label><input value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Marketing"/></div>
          <div className="field"><label>Head</label><select value={form.head||''} onChange={e=>setForm({...form,head:e.target.value})}><option value="">— Vacant —</option>{state.employees.filter(e=>e.active).map(e=> <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
          <div className="field"><label>Color</label><input type="color" value={form.color||'#4C8577'} onChange={e=>setForm({...form,color:e.target.value})} style={{height:40,padding:2}}/></div>
          <div style={{display:'flex',gap:10,marginTop:20}}>
            <button className="btn btn-primary" onClick={()=>{
              if(!form.name){ alert('Name required'); return; }
              if(modal.data){ update(s=>{ const u=s.orgUnits.find(x=>x.id===modal.data); Object.assign(u,{name:form.name,head:form.head||null,color:form.color||'#4C8577'}); }); showToast('Department updated'); }
              else { update(s=>{ s.orgUnits.push({id:'dept'+uid(), name:form.name, head:form.head||null, color:form.color||'#4C8577'}); }); showToast('Department created'); }
              close();
            }}>{modal.data?'Save':'Create'}</button><button className="btn" style={{background:'transparent',border:'1px solid rgba(32,21,38,0.25)'}} onClick={close}>Cancel</button>
          </div>
        </>}
        {modal.type==='assignDept' && <>
          <div className="field"><label>Staff</label><select value={form.employeeId||state.employees[0]?.id} onChange={e=>setForm({...form,employeeId:e.target.value})}>{state.employees.map(e=> <option key={e.id} value={e.id}>{e.name} — {state.orgUnits.find(u=>u.id===e.department)?.name||'—'}</option>)}</select></div>
          <div className="field"><label>Move to department</label><select value={form.dept||state.orgUnits[0]?.id} onChange={e=>setForm({...form,dept:e.target.value})}>{state.orgUnits.map(u=> <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          <div style={{display:'flex',gap:10,marginTop:20}}><button className="btn btn-primary" onClick={()=>{
            update(s=>{ s.employees.find(e=>e.id===form.employeeId).department=form.dept; }); showToast('Assigned'); close();
          }}>Assign</button><button className="btn" style={{background:'transparent',border:'1px solid rgba(32,21,38,0.25)'}} onClick={close}>Cancel</button></div>
        </>}

      </div>
    </div>
  );
}
