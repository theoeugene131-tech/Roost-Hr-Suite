"use client";
import { useEffect, useState } from "react";
import { loadState, saveState } from "@/lib/store";

const AVATAR_COLORS = ['#E2735B','#C9A227','#4C8577','#7D6BA6','#B3563F','#3E7C8A'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOC_TYPES = [
  {key:'cv', label:'CV / Resume', category:'Onboarding', required:true},
  {key:'offer', label:'Offer Letter', category:'Onboarding', required:true},
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
  overview:'Overview', team:'Team', docs:'Documents', regulatory:'Regulatory', runpayroll:'Run payroll', history:'History',
  compliance:'Compliance', reviews:'Reviews', hiring:'Hiring', reports:'Reports', myprofile:'My profile'
};
function visibleTabs(role){
  if(role==='employee') return ['myprofile'];
  if(role==='admin') return ['overview','team','docs','regulatory','runpayroll','history','compliance','reviews','hiring'];
  return ['overview','team','docs','regulatory','runpayroll','history','compliance','reviews','hiring','reports'];
}
function initials(name){ return name.trim().split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase(); }
function money(n){ return '₦' + Math.round(n).toLocaleString('en-NG'); }
function uid(){ return Math.random().toString(36).slice(2,9); }
function addDays(date,n){ const d=new Date(date); d.setDate(d.getDate()+n); return d; }
function estimateDeductions(gross){
  const annual = gross*12;
  let taxable = Math.max(annual - 300000, 0);
  const bands = [[300000,0.07],[300000,0.11],[500000,0.15],[500000,0.19],[1600000,0.21],[Infinity,0.24]];
  let tax=0, remaining=taxable;
  for(const [s,rate] of bands){ if(remaining<=0) break; const amt=Math.min(s,remaining); tax+=amt*rate; remaining-=amt; }
  const monthlyPAYE=Math.round(tax/12);
  const pensionEmployee=Math.round(gross*0.08);
  const pensionEmployer=Math.round(gross*0.10);
  const nhf=Math.round(gross*0.025);
  const nsitf=Math.round(gross*0.01);
  const net=gross-monthlyPAYE-pensionEmployee-nhf;
  return {monthlyPAYE,pensionEmployee,pensionEmployer,nhf,nsitf,net};
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
  s.employees.forEach(e=>{
    if(!e.documents){ e.documents={}; changed=true; }
    if(e.nin===undefined){ e.nin=''; e.payeTin=''; e.nhfNumber=''; e.pensionPin=''; e.nsitfNumber=''; changed=true; }
    if(e.passportPhoto===undefined){ e.passportPhoto=null; changed=true; }
    DOC_TYPES.forEach(dt=>{ if(e.documents[dt.key]===undefined) e.documents[dt.key]=null; });
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
  return {companyName:'', employees, runs:[], compliance:{}, reviews, candidates, currentRole:'owner', viewingEmployeeId:null};
}

export default function Page(){
  const [state,setState]=useState(null);
  const [currentTab,setCurrentTab]=useState('overview');
  const [expandedRun,setExpandedRun]=useState(null);
  const [online,setOnline]=useState(true);
  const [modal,setModal]=useState(null);
  const [toast,setToast]=useState(null);
  const [docFilter,setDocFilter]=useState('All');

  useEffect(()=>{
    let loaded=loadState();
    if(loaded){ loaded=migrateState(loaded); setState(loaded); }
    else { const s=seedDemo(); setState(s); saveState(s); }
    const updateOnline=()=>setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener('online',updateOnline);
    window.addEventListener('offline',updateOnline);
    if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(()=>{}); }
    return ()=>{ window.removeEventListener('online',updateOnline); window.removeEventListener('offline',updateOnline); };
  },[]);
  useEffect(()=>{ if(state) saveState(state); },[state]);
  useEffect(()=>{ if(!online) setToast("You are offline — changes will sync when you reconnect."); else if(toast && toast.includes("offline")) setToast("Back online ✓"); },[online]);

  if(!state) return <div style={{padding:60,textAlign:'center',color:'#B39FB0'}}>Loading Roost…</div>;
  const tabs=visibleTabs(state.currentRole);
  const activeTabs=tabs.includes(currentTab)?currentTab:tabs[0];
  if(activeTabs!==currentTab) setCurrentTab(activeTabs);
  function update(fn){ setState(s=>{ const ns=JSON.parse(JSON.stringify(s)); fn(ns); return ns; }); }
  function showToast(m){ setToast(m); setTimeout(()=>setToast(null),2800); }
  const period=nextPeriod(state.runs);
  const activeEmployees=state.employees.filter(e=>e.active);

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
        nav.tabs{display:flex;gap:4px;padding:0 40px;border-bottom:1px solid var(--line);overflow-x:auto;}
        .tab-btn{background:none;border:none;color:var(--muted);padding:12px 16px;font-size:13px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;}
        .tab-btn.active{color:var(--paper);border-bottom-color:var(--coral);}
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
        {online? '● Online — synced':'○ Offline — working locally, will sync when reconnected'} &nbsp;|&nbsp; Roost works fully offline
      </div>
      {toast && <div style={{position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)', background:'#201526', color:'#EDEEF2', padding:'10px 16px', borderRadius:8, fontSize:13, zIndex:60}}>{toast}</div>}

      <header>
        <div className="brand">
          <div className="brand-mark"></div>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <h1 style={{fontFamily:'Newsreader, serif', fontSize:22, fontWeight:600, fontStyle:'italic'}}>Roost</h1>
              <span style={{fontSize:10,background:'rgba(237,238,242,0.08)',border:'1px solid var(--line)',padding:'2px 6px',borderRadius:20,color:'var(--muted)'}}>{state.companyName || '—'}</span>
            </div>
            <p style={{fontSize:11.5, color:'var(--muted)', marginTop:2}}>Payroll, compliance & HR for teams of 5–20</p>
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
            <button onClick={()=>{ if(confirm('Reset to demo data?')){ const s=seedDemo(); setState(s); saveState(s); showToast('Demo data restored'); } }} style={{background:'transparent',border:'1px solid var(--line)',color:'var(--muted)',borderRadius:6,padding:'8px 10px',fontSize:11,cursor:'pointer'}}>Reset demo</button>
          </div>
          {state.currentRole!=='employee' && <div className="stats">
            <div className="stat"><div className="label">Team size</div><div className="value">{activeEmployees.length}</div></div>
            <div className="stat"><div className="label">Monthly cost</div><div className="value">{money(activeEmployees.reduce((s,e)=>s+e.gross+estimateDeductions(e.gross).pensionEmployer,0))}</div></div>
            <div className="stat"><div className="label">Next payroll</div><div className="value">{periodLabel(period)}</div></div>
            <div className="stat"><div className="label">Compliance open</div><div className="value" style={{color:'var(--coral)'}}>{state.runs.length? ['paye','pension','nhf','nsitf'].filter(k=>complianceStatus(state, state.runs[state.runs.length-1].period,k)!=='filed').length:0}</div></div>
          </div>}
        </div>
      </header>

      <nav className="tabs">
        {tabs.map(t=><button key={t} className={`tab-btn ${currentTab===t?'active':''}`} onClick={()=>setCurrentTab(t)}>{TAB_LABELS[t]}</button>)}
      </nav>

      <main>
        {currentTab==='overview' && <Overview state={state} setModal={setModal} />}
        {currentTab==='team' && <Team state={state} update={update} setModal={setModal} showToast={showToast} />}
        {currentTab==='docs' && <Documents state={state} update={update} setModal={setModal} showToast={showToast} docFilter={docFilter} setDocFilter={setDocFilter} />}
        {currentTab==='regulatory' && <Regulatory state={state} update={update} />}
        {currentTab==='runpayroll' && <RunPayroll state={state} update={update} setCurrentTab={setCurrentTab} showToast={showToast} />}
        {currentTab==='history' && <History state={state} expandedRun={expandedRun} setExpandedRun={setExpandedRun} />}
        {currentTab==='compliance' && <Compliance state={state} update={update} />}
        {currentTab==='reviews' && <Reviews state={state} update={update} setModal={setModal} />}
        {currentTab==='hiring' && <Hiring state={state} update={update} setModal={setModal} showToast={showToast} />}
        {currentTab==='reports' && <Reports state={state} />}
        {currentTab==='myprofile' && <MyProfile state={state} />}
      </main>

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
  return (<>
    <div className="panel-head"><div><h2>Team</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>Add, edit, or click name for documents</p></div><button className="btn btn-primary" onClick={()=>setModal({type:'employee',data:null})}>+ Add teammate</button></div>
    {state.employees.length===0? <div style={{color:'var(--muted)',textAlign:'center',padding:30}}>No teammates yet.</div> :
      <div className="grid">{state.employees.map(e=>{
        const d=estimateDeductions(e.gross);
        const progress=Math.round(100*DOC_TYPES.filter(dt=>e.documents?.[dt.key]).length/DOC_TYPES.length);
        return <div key={e.id} className={`card ${e.active?'':'inactive'}`}><div style={{display:'flex',gap:12,alignItems:'center'}}><div style={{width:40,height:40,borderRadius:'50%',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Newsreader',fontWeight:600,color:'#fff',background:e.color,flexShrink:0}}>{e.passportPhoto ? <img src={e.passportPhoto} alt='' style={{width:'100%',height:'100%',objectFit:'cover'}}/> : initials(e.name)}</div><div style={{flex:1}}><div style={{fontWeight:600,fontSize:14,cursor:'pointer',color:'#201526',textDecoration:'underline'}} onClick={()=>setModal({type:'staffDocs',data:e.id})}>{e.name}</div><div style={{fontSize:11,opacity:0.6}}>{e.role}{e.active?'':' · inactive'} · {progress}% docs</div></div></div><div style={{display:'flex',justifyContent:'space-between',fontSize:12.5}}><span style={{opacity:0.55}}>Gross monthly</span><span style={{fontFamily:'IBM Plex Mono',fontWeight:600}}>{money(e.gross)}</span></div><div style={{display:'flex',justifyContent:'space-between',fontSize:12.5}}><span style={{opacity:0.55}}>Net pay</span><span style={{fontFamily:'IBM Plex Mono',fontWeight:600}}>{money(d.net)}</span></div>
        <div style={{display:'flex',gap:6,marginTop:2,flexWrap:'wrap'}}><button onClick={()=>setModal({type:'staffDocs',data:e.id})} style={{background:'var(--teal)',color:'#fff',border:'none',borderRadius:5,padding:'6px 10px',fontSize:11.5,cursor:'pointer'}}>📄 Docs</button><button onClick={()=>setModal({type:'employee',data:e.id})} style={{background:'#E0E2E8',border:'none',borderRadius:5,padding:'6px 10px',fontSize:11.5,cursor:'pointer',color:'#201526'}}>Edit</button><button onClick={()=>update(s=>{const emp=s.employees.find(x=>x.id===e.id); emp.active=!emp.active;})} style={{background:'#E0E2E8',border:'none',borderRadius:5,padding:'6px 10px',fontSize:11.5,cursor:'pointer',color:'#201526'}}>{e.active?'Deactivate':'Reactivate'}</button><button onClick={()=>{ if(confirm('Remove this teammate?')) update(s=>{s.employees=s.employees.filter(x=>x.id!==e.id);}); showToast('Removed');}} style={{background:'transparent',border:'1px solid rgba(226,115,91,0.5)',borderRadius:5,padding:'6px 10px',fontSize:11.5,cursor:'pointer',color:'#E2735B'}}>Remove</button></div></div>;
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
function RunPayroll({state,update,setCurrentTab,showToast}){
  const period=nextPeriod(state.runs);
  const active=state.employees.filter(e=>e.active);
  if(!active.length) return <><div className="panel-head"><div><h2>Run payroll</h2></div></div><div style={{color:'var(--muted)',textAlign:'center',padding:30}}>Add at least one active teammate before running payroll.</div></>;
  const lines=active.map(e=>({emp:e,...estimateDeductions(e.gross)}));
  const total=lines.reduce((s,l)=>s+l.emp.gross+l.pensionEmployer,0);
  const netTotal=lines.reduce((s,l)=>s+l.net,0);
  return (<>
    <div className="panel-head"><div><h2>Run payroll — {periodLabel(period)}</h2><p style={{fontSize:12.5,color:'var(--muted)'}}>Review before confirming. This will pay {active.length} active teammates.</p></div></div>
    <div className="run-row" style={{cursor:'default'}}>
      {lines.map(l=><div key={l.emp.id} style={{display:'flex',justifyContent:'space-between',fontSize:12.5,padding:'6px 0'}}><span>{l.emp.name} — {l.emp.role}</span><span style={{fontFamily:'IBM Plex Mono',fontWeight:600}}>Net {money(l.net)}</span></div>)}
      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,borderTop:'1px solid rgba(32,21,38,0.15)',marginTop:6,paddingTop:12,fontSize:13}}><span>Total net pay</span><span style={{fontFamily:'IBM Plex Mono'}}>{money(netTotal)}</span></div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,padding:'6px 0'}}><span>Total cost to company (incl. employer pension)</span><span style={{fontFamily:'IBM Plex Mono',fontWeight:600}}>{money(total)}</span></div>
    </div>
    <button className="btn btn-primary" style={{marginTop:16}} onClick={()=>{
      update(s=>{
        const lines2=active.map(e=>{ const d=estimateDeductions(e.gross); return {employeeId:e.id,name:e.name,role:e.role,gross:e.gross,...d}; });
        s.runs.push({id:uid(),period,createdAt:new Date().toISOString(),lines:lines2,status:'paid'});
      });
      showToast(`Payroll for ${periodLabel(period)} confirmed — works offline too`);
      setCurrentTab('history');
    }}>Confirm & pay {periodLabel(period)}</button>
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
        {open && <div style={{marginTop:14,borderTop:'1px solid rgba(32,21,38,0.1)',paddingTop:12}}>{r.lines.map(l=><div key={l.employeeId} style={{display:'flex',justifyContent:'space-between',fontSize:12.5,padding:'6px 0'}}><span>{l.name} — {l.role}</span><span style={{fontFamily:'IBM Plex Mono'}}>Net {money(l.net)}</span></div>)}</div>}
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

function Modal({modal,setModal,state,update,showToast}){
  const [form,setForm]=useState(()=>{
    if(modal.type==='employee'){
      if(modal.data){ const e=state.employees.find(x=>x.id===modal.data); return {name:e.name,role:e.role,gross:e.gross,bank:e.bank,account:e.account,startDate:e.startDate,dob:e.dob||''}; } else return {name:'',role:'',gross:'',bank:'',account:'',startDate:'',dob:''};
    }
    if(modal.type==='review') return {emp:state.employees.filter(e=>e.active)[0]?.id||'',rating:0,notes:''};
    if(modal.type==='candidate') return {name:'',role:'',notes:''};
    return {};
  });
  const [ids,setIds]=useState(()=>{ if(modal.type==='staffDocs'){ const e=state.employees.find(x=>x.id===modal.data); return {nin:e.nin||'',payeTin:e.payeTin||'',nhfNumber:e.nhfNumber||'',pensionPin:e.pensionPin||'',nsitfNumber:e.nsitfNumber||''}; } return {}; });
  function close(){ setModal(null); }

  async function handleUpload(docKey, file){
    if(!file) return;
    if(file.size>6*1024*1024){ alert('File too large — max 6MB (offline storage limit)'); return; }
    const reader=new FileReader();
    reader.onload=()=>{
      update(s=>{
        const emp=s.employees.find(x=>x.id===modal.data);
        emp.documents[docKey]={fileName:file.name, size:file.size, uploadedAt:new Date().toISOString().slice(0,10), dataUrl: reader.result, status:'pending'};
      });
      showToast(`${DOC_TYPES.find(d=>d.key===docKey).label} uploaded — offline saved`);
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
        update(s=>{ s.employees.find(x=>x.id===e.id).passportPhoto=reader.result; });
        showToast('Passport photo uploaded');
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
              {e.passportPhoto && <button onClick={()=>update(s=>s.employees.find(x=>x.id===e.id).passportPhoto=null)} style={{fontSize:11,marginLeft:6,background:'transparent',border:'1px solid rgba(226,115,91,0.4)',color:'#8C3B28',padding:'4px 8px',borderRadius:5,cursor:'pointer'}}>Remove</button>}
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
          {modal.type==='employee' ? (modal.data?'Edit teammate':'Add teammate') : modal.type==='review' ? 'Add review' : 'Add candidate'}
        </h3><button onClick={close} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,opacity:0.55}}>✕</button></div>

        {modal.type==='employee' && <>
          <div className="field"><label>Full name</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Ada Obi"/></div>
          <div className="field"><label>Role</label><input value={form.role} onChange={e=>setForm({...form,role:e.target.value})} placeholder="e.g. Sales Associate"/></div>
          <div className="field"><label>Gross monthly salary (₦)</label><input type="number" value={form.gross} onChange={e=>setForm({...form,gross:e.target.value})}/></div>
          <div className="field-row"><div className="field"><label>Bank</label><input value={form.bank} onChange={e=>setForm({...form,bank:e.target.value})}/></div><div className="field"><label>Account</label><input value={form.account} onChange={e=>setForm({...form,account:e.target.value})}/></div></div>
          <div className="field-row"><div className="field"><label>Start date</label><input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></div><div className="field"><label>DOB</label><input type="date" value={form.dob} onChange={e=>setForm({...form,dob:e.target.value})}/></div></div>
          <div style={{display:'flex',gap:10,marginTop:20}}><button className="btn btn-primary" onClick={()=>{
            if(!form.name||!form.role||!form.gross || Number(form.gross)<=0){ alert('Fill name, role, valid salary'); return; }
            if(modal.data){ update(s=>{ Object.assign(s.employees.find(x=>x.id===modal.data),{name:form.name,role:form.role,gross:Number(form.gross),bank:form.bank,account:form.account,startDate:form.startDate,dob:form.dob});}); showToast('Teammate updated'); }
            else { update(s=>{ s.employees.push({id:uid(),name:form.name,role:form.role,gross:Number(form.gross),bank:form.bank,account:form.account,startDate:form.startDate,dob:form.dob,active:true,color:AVATAR_COLORS[s.employees.length%AVATAR_COLORS.length], nin:'',payeTin:'',nhfNumber:'',pensionPin:'',nsitfNumber:'', documents: Object.fromEntries(DOC_TYPES.map(dt=>[dt.key,null]))});}); showToast('Teammate added'); }
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

      </div>
    </div>
  );
}
