"use client";

const ink = "#17233B";
const muted = "#5D6B82";
const teal = "#147D78";
const pale = "#F3F7F8";
const coral = "#F08B69";

export default function HomePage() {
  return (
    <main style={{fontFamily:"Arial, sans-serif",color:ink,background:"#fff",overflow:"hidden"}}>
      <header style={{maxWidth:1180,margin:"0 auto",padding:"24px 28px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:20}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:11,textDecoration:"none",color:ink,fontWeight:800,fontSize:21,letterSpacing:"-.6px"}}>
          <span style={{width:35,height:35,background:teal,borderRadius:"11px 11px 11px 3px",display:"inline-block"}}/> MEDASH
        </a>
        <nav style={{display:"flex",alignItems:"center",gap:24,fontSize:14,flexWrap:"wrap"}}>
          <a href="#platform" style={{color:muted,textDecoration:"none"}}>Platform</a>
          <a href="#why-medash" style={{color:muted,textDecoration:"none"}}>Why Medash</a>
          <a href="#global" style={{color:muted,textDecoration:"none"}}>Global readiness</a>
          <a href="/workspace" style={{color:ink,textDecoration:"none",fontWeight:700}}>Log in</a>
          <a href="/workspace?demo=1&local=1" style={{background:teal,color:"#fff",padding:"11px 17px",borderRadius:7,textDecoration:"none",fontWeight:700}}>Explore free demo</a>
        </nav>
      </header>

      <section style={{background:pale,padding:"72px 28px 78px"}}>
        <div style={{maxWidth:1180,margin:"0 auto",display:"grid",gridTemplateColumns:"1.02fr .98fr",gap:50,alignItems:"center"}}>
          <div>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,color:teal,fontSize:12,fontWeight:800,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:20}}>
              <span style={{width:7,height:7,borderRadius:9,background:coral}}/> People operations, made clearer
            </div>
            <h1 style={{fontSize:"clamp(40px,5vw,66px)",lineHeight:1.04,letterSpacing:"-2.8px",margin:"0 0 22px",maxWidth:680}}>Run your people operations with <span style={{color:teal}}>clarity and control.</span></h1>
            <p style={{fontSize:18,lineHeight:1.7,color:muted,maxWidth:610,margin:"0 0 30px"}}>Medash HR Suite brings HR management, payroll and employee training into one organised workspace for growing businesses.</p>
            <div style={{display:"flex",gap:13,flexWrap:"wrap"}}>
              <a href="/workspace?demo=1&local=1" style={{background:teal,color:"#fff",padding:"15px 22px",borderRadius:7,textDecoration:"none",fontWeight:800}}>Explore the free demo →</a>
              <a href="/workspace" style={{border:"1px solid #CBD5DF",color:ink,padding:"15px 22px",borderRadius:7,textDecoration:"none",fontWeight:700}}>Access your workspace</a>
            </div>
            <p style={{fontSize:12,color:muted,marginTop:15}}>Explore sample information. No payment or account required.</p>
          </div>
          <div style={{background:"#fff",border:"1px solid #E3EAF0",borderRadius:15,padding:18,boxShadow:"0 24px 70px rgba(25,45,67,.10)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 8px 17px",borderBottom:"1px solid #E9EEF2"}}>
              <div><div style={{fontWeight:800,fontSize:15}}>Workforce dashboard</div><div style={{fontSize:11,color:muted,marginTop:4}}>Illustrative product preview</div></div>
              <span style={{background:"#E7F4F2",color:teal,padding:"6px 9px",borderRadius:20,fontSize:10,fontWeight:800}}>SAMPLE DATA</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,padding:"17px 0"}}>
              {[["Team members","48"],["Payroll status","Ready"],["Training courses","12"],["Pending leave","03"]].map(([label,value])=><div key={label} style={{background:pale,borderRadius:9,padding:17}}><div style={{fontSize:11,color:muted}}>{label}</div><div style={{fontSize:27,fontWeight:800,marginTop:8}}>{value}</div></div>)}
            </div>
            <div style={{background:ink,color:"#fff",borderRadius:9,padding:17}}>
              <div style={{fontSize:11,color:"#C6D4E1"}}>ONE CONNECTED WORKSPACE</div>
              <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
                {["HR","Payroll","Training"].map(x=><span key={x} style={{background:"rgba(255,255,255,.12)",padding:"9px 13px",borderRadius:6,fontSize:12,fontWeight:700}}>{x}</span>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" style={{maxWidth:1180,margin:"0 auto",padding:"76px 28px"}}>
        <div style={{maxWidth:700,marginBottom:34}}>
          <div style={{color:teal,fontSize:12,fontWeight:800,letterSpacing:"1.4px",textTransform:"uppercase"}}>The Medash platform</div>
          <h2 style={{fontSize:38,letterSpacing:"-1.3px",margin:"12px 0"}}>Three essential areas. One connected suite.</h2>
          <p style={{color:muted,lineHeight:1.7}}>Give your team a more consistent way to manage employee information, pay processes and continuous learning.</p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:18}}>
          {[
            ["01","HR Management","Organise employee records, onboarding documents, leave, attendance, recruitment and performance activities."],
            ["02","Payroll","Prepare payroll, review calculations and maintain payroll history with support for local settings and manual HR review."],
            ["03","Employee Training","Give employees access to structured learning materials, course activities, assessments and completion records."]
          ].map(([n,title,desc])=><article key={title} style={{border:"1px solid #E2E9EF",borderRadius:11,padding:25,background:"#fff"}}>
            <div style={{color:coral,fontWeight:800,fontSize:13}}>{n}</div><h3 style={{fontSize:21,margin:"16px 0 10px"}}>{title}</h3><p style={{color:muted,fontSize:14,lineHeight:1.7,margin:0}}>{desc}</p>
          </article>)}
        </div>
      </section>

      <section id="why-medash" style={{background:ink,color:"#fff",padding:"70px 28px"}}>
        <div style={{maxWidth:1180,margin:"0 auto",display:"grid",gridTemplateColumns:"1fr 1fr",gap:55,alignItems:"center"}}>
          <div><div style={{color:"#8ED0C9",fontSize:12,fontWeight:800,letterSpacing:"1.4px"}}>BUILT FOR PRACTICAL WORK</div><h2 style={{fontSize:38,letterSpacing:"-1.2px",lineHeight:1.15,margin:"14px 0 18px"}}>Less scattered administration. Better workforce visibility.</h2><p style={{color:"#C6D0DC",lineHeight:1.8,fontSize:15}}>Bring day-to-day people processes into a single environment, with clear areas for HR, Payroll and Training. Start with the tools your organisation needs and build from there.</p></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {["Employee records in one place","Payroll preparation and history","Learning and course assessments","Leave and attendance workflows","Recruitment and performance tools","Role-based work areas"].map((x)=><div key={x} style={{border:"1px solid rgba(255,255,255,.16)",borderRadius:8,padding:16,fontSize:13,lineHeight:1.5}}>✓ &nbsp;{x}</div>)}
          </div>
        </div>
      </section>

      <section id="global" style={{maxWidth:1180,margin:"0 auto",padding:"76px 28px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:40,alignItems:"center"}}>
        <div><div style={{color:teal,fontSize:12,fontWeight:800,letterSpacing:"1.4px"}}>INTERNATIONAL DIRECTION</div><h2 style={{fontSize:36,letterSpacing:"-1px",margin:"12px 0"}}>Designed with international businesses in mind.</h2><p style={{color:muted,lineHeight:1.8}}>Medash is being prepared to support organisations operating across different countries, currencies and workforce requirements. Country-specific payroll and statutory settings must be selected and checked before use.</p></div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{["United Kingdom","United States","Nigeria"].map((x)=><div key={x} style={{border:"1px solid #E2E9EF",borderRadius:9,padding:"18px 20px",fontWeight:700,flex:"1 1 140px"}}>{x}<div style={{fontSize:11,color:muted,fontWeight:400,marginTop:6}}>Supported market focus</div></div>)}</div>
      </section>

      <section style={{background:"#EAF4F3",padding:"60px 28px",textAlign:"center"}}>
        <div style={{maxWidth:760,margin:"0 auto"}}><h2 style={{fontSize:36,letterSpacing:"-1px",margin:"0 0 14px"}}>See how Medash works.</h2><p style={{color:muted,lineHeight:1.7,margin:"0 0 25px"}}>Explore the sample workspace before deciding whether Medash is right for your organisation.</p><a href="/workspace?demo=1&local=1" style={{display:"inline-block",background:teal,color:"#fff",padding:"15px 24px",borderRadius:7,textDecoration:"none",fontWeight:800}}>Start your free demo →</a></div>
      </section>
      <footer style={{maxWidth:1180,margin:"0 auto",padding:"28px",display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",fontSize:12,color:muted}}><span>© {new Date().getFullYear()} Medash HR Suite</span><span>HR Management · Payroll · Training</span><a href="/workspace" style={{color:teal,textDecoration:"none",fontWeight:700}}>Client login</a></footer>
      <style jsx>{`@media(max-width:800px){header{align-items:flex-start!important}header nav{gap:12px!important}.hero-grid{grid-template-columns:1fr!important}}`}</style>
    </main>
  );
}
