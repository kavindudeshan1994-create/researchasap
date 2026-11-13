"use strict";
const GROUPS={
"General science":["Nature","Science","Cell","Proceedings of the National Academy of Sciences","Science Advances","Nature Communications","Scientific Reports","eLife"],
"Chemistry":["Journal of the American Chemical Society","Angewandte Chemie International Edition","Nature Chemistry","Chemical Science","ACS Central Science","Organic Letters","The Journal of Organic Chemistry","Chemical Communications","Chemical Reviews","Accounts of Chemical Research","Chemical Society Reviews","Chemistry – A European Journal","Communications Chemistry"],
"Chemical biology & biochemistry":["Nature Chemical Biology","ACS Chemical Biology","Cell Chemical Biology","RSC Chemical Biology","ChemBioChem","Bioconjugate Chemistry","Journal of Medicinal Chemistry","Biochemistry","Journal of Biological Chemistry","Molecular Cell","Nature Structural & Molecular Biology","The EMBO Journal","Protein Science","Journal of Molecular Biology"],
"Cell & membrane biology":["Nature Cell Biology","Journal of Cell Biology","Molecular Biology of the Cell","Current Biology","Cell Reports","Traffic","Biochimica et Biophysica Acta (BBA) - Biomembranes","Journal of Membrane Biology","Journal of General Physiology"],
"Imaging & analytics":["Nature Methods","Analytical Chemistry","ACS Sensors","Biosensors and Bioelectronics","Lab on a Chip"],
"Materials & nanoscience":["Nature Materials","Nature Nanotechnology","Advanced Materials","Advanced Functional Materials","ACS Nano","Nano Letters","Small","Advanced Science","ACS Applied Materials & Interfaces","Materials Horizons","Nanoscale Horizons","Nanoscale","Journal of Materials Chemistry B","Biomaterials Science","The Journal of Physical Chemistry B","The Journal of Physical Chemistry C","The Journal of Physical Chemistry Letters","Nature Photonics","Nature Biomedical Engineering","Nature Biotechnology"]
};
const JOURNALS=[...new Set(Object.values(GROUPS).flat())];
const DEFAULT=["Nature","Science","Cell","Journal of the American Chemical Society","Angewandte Chemie International Edition","Nature Chemical Biology","ACS Chemical Biology","Nature Communications"];
const $=id=>document.getElementById(id);
const load=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}};
const state={selected:new Set(load("rasap.journals",DEFAULT)),saved:load("rasap.saved",{}),papers:[],page:1,view:"latest",query:"",loading:false,request:0,hasMore:false};
const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const plain=s=>String(s??"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
const abstractFromIndex=idx=>{if(!idx)return"";const arr=[];for(const [word,positions] of Object.entries(idx)){for(const p of positions)if(Number.isInteger(p)&&p>=0&&p<5000)arr[p]=word}return arr.filter(Boolean).join(" ")};
const store=()=>{localStorage.setItem("rasap.journals",JSON.stringify([...state.selected]));localStorage.setItem("rasap.saved",JSON.stringify(state.saved))};
const summary=p=>{if(!p.abstract)return "No abstract available in the public metadata. Open the publisher article for details.";const s=p.abstract.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[];return s.slice(0,3).join(" ").trim().slice(0,520)+(p.abstract.length>520?"…":"")};
const normalize=w=>({id:w.id,title:plain(w.title||"Untitled paper"),date:w.publication_date||"",journal:w.primary_location?.source?.display_name||"Unknown journal",authors:(w.authorships||[]).slice(0,8).map(a=>a.author?.display_name).filter(Boolean).join(", "),abstract:abstractFromIndex(w.abstract_inverted_index),doi:w.doi||"",url:w.primary_location?.landing_page_url||w.doi||w.id,openAccess:w.open_access?.is_oa||false});
function updateJournalCount(){const n=state.selected.size;const label=n+" selected";const top=$("selectedJournalCount");if(top)top.textContent=label;const bottom=$("dialogSelectionCount");if(bottom)bottom.textContent=label+" · "+(n>5?"Last 48 hours":"Last 1 year")}
function renderJournals(){const term=$("journalSearch").value.toLowerCase();$("journalList").innerHTML=Object.entries(GROUPS).map(([group,items])=>{const matches=items.filter(j=>j.toLowerCase().includes(term));return matches.length?'<div class="journal-group">'+escapeHTML(group)+'</div>'+matches.map(j=>'<label class="journal-row"><input type="checkbox" data-journal="'+escapeHTML(j)+'" '+(state.selected.has(j)?"checked":"")+'> <span>'+escapeHTML(j)+'</span></label>').join(""):""}).join("");updateJournalCount();}

// Graphical abstracts: only attempt images explicitly identified as graphical abstracts
// in open-access Europe PMC full-text XML. No arbitrary figures or publisher scraping.
const graphicCache=new Map();
const graphicPending=new Set();
const graphicQueue=[];
let graphicWorkers=0;
function journalTheme(journal){
const j=journal.toLowerCase();
if(/chem|organic|catal|jacs|angew|molecular/.test(j))return ["chem","⬡","CHEMISTRY"];
if(/cell|biolog|protein|embo|membrane|biochem/.test(j))return ["bio","✺","LIFE SCIENCES"];
if(/material|nano|physical|photon|science/.test(j))return ["materials","◇","MATERIALS & SCIENCE"];
return ["general","✳","RESEARCH"];
}
function graphicMarkup(p){
const [theme,symbol,category]=journalTheme(p.journal);
return '<div class="paper-visual '+theme+'" data-graphic="'+escapeHTML(p.id)+'"><div class="visual-pattern" aria-hidden="true">'+symbol+'</div><div class="visual-text"><span>'+escapeHTML(category)+'</span><strong>'+escapeHTML(p.journal)+'</strong></div><span class="visual-caption">Journal design · not a graphical abstract</span></div>';
}
async function lookupGraphic(p){
if(!p.doi||!p.openAccess)return null;
const doi=p.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,"");
if(!doi)return null;
const query='DOI:'+doi+' AND OPEN_ACCESS:Y';
const search=await fetch('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query='+encodeURIComponent(query)+'&format=json&pageSize=1');
if(!search.ok)return null;
const item=(await search.json()).resultList?.result?.[0];
if(!item?.pmcid||item.isOpenAccess!=="Y")return null;
const xmlResponse=await fetch('https://www.ebi.ac.uk/europepmc/webservices/rest/'+encodeURIComponent(item.pmcid)+'/fullTextXML');
if(!xmlResponse.ok)return null;
const xml=new DOMParser().parseFromString(await xmlResponse.text(),'application/xml');
if(xml.querySelector('parsererror'))return null;
const figures=[...xml.getElementsByTagName('fig')];
const figure=figures.find(fig=>/graphical abstract|graphic abstract|visual abstract/i.test((fig.getAttribute('fig-type')||'')+' '+(fig.getElementsByTagName('label')[0]?.textContent||'')+' '+(fig.getElementsByTagName('caption')[0]?.textContent||'')));
if(!figure)return null;
const graphic=figure.getElementsByTagName('graphic')[0];
const href=graphic?.getAttribute('xlink:href')||graphic?.getAttributeNS('http://www.w3.org/1999/xlink','href');
if(!href||!/^[-\w.]+$/.test(href))return null;
return 'https://europepmc.org/articles/'+encodeURIComponent(item.pmcid)+'/bin/'+encodeURIComponent(href);
}
function queueGraphics(){
const cards=[...document.querySelectorAll('[data-graphic]')];
for(const card of cards.slice(0,8)){
const id=card.dataset.graphic;
const p=state.papers.find(p=>p.id===id)||state.saved[id];
if(!p)continue;
if(graphicCache.has(id)){applyGraphic(id,graphicCache.get(id));continue}
if(!p.openAccess||!p.doi||graphicPending.has(id))continue;
graphicPending.add(id);graphicQueue.push(p);
}
while(graphicWorkers<2&&graphicQueue.length)runGraphicWorker();
}
async function runGraphicWorker(){
graphicWorkers++;
try{
while(graphicQueue.length){
const p=graphicQueue.shift();
let url=null;
try{url=await lookupGraphic(p)}catch{}
graphicCache.set(p.id,url);
graphicPending.delete(p.id);
applyGraphic(p.id,url);
}
}finally{graphicWorkers--}
}
function applyGraphic(id,url){
if(!url)return;
for(const card of document.querySelectorAll('[data-graphic]')){
if(card.dataset.graphic!==id||card.querySelector('img'))continue;
const img=document.createElement('img');
img.loading='lazy';img.alt='Original graphical abstract (open-access article)';
img.referrerPolicy='no-referrer';
img.onload=()=>{card.classList.add('has-graphic');card.appendChild(img);card.querySelector('.visual-caption').textContent='Graphical abstract · Europe PMC'};
img.onerror=()=>{graphicCache.set(id,null)};
img.src=url;
}
}

function card(p){const saved=!!state.saved[p.id];return '<article class="paper"><div class="meta"><span class="pill">'+escapeHTML(p.journal)+'</span><span>'+escapeHTML(p.date)+'</span>'+(p.openAccess?'<span>🔓 Open access</span>':"")+'</div><h3>'+escapeHTML(p.title)+'</h3><div class="authors">'+escapeHTML(p.authors||"Authors not listed")+'</div><p>'+escapeHTML(summary(p))+'</p><div class="paper-actions"><button class="secondary" data-detail="'+escapeHTML(p.id)+'">Read details</button><button class="save '+(saved?"saved":"")+'" data-save="'+escapeHTML(p.id)+'">'+(saved?"★ Saved":"☆ Save")+'</button></div></article>'}
function currentPapers(){let a=state.view==="saved"?Object.values(state.saved):state.papers;const q=state.query.trim().toLowerCase();if(q)a=a.filter(p=>[p.title,p.authors,p.abstract,p.journal].some(v=>String(v||"").toLowerCase().includes(q)));return [...a].sort((a,b)=>$("sort").value==="oldest"?a.date.localeCompare(b.date):b.date.localeCompare(a.date))}
function render(){const a=currentPapers();$("papers").innerHTML=a.length?a.map(card).join(""):'<div class="empty">'+(state.loading?"Loading papers…":state.view==="saved"?"No saved papers match your search.":"No papers found. Try other journals or refresh.")+'</div>';$("savedCount").textContent=Object.keys(state.saved).length;$("tabLatest").classList.toggle("active",state.view==="latest");$("tabSaved").classList.toggle("active",state.view==="saved");$("previous").disabled=state.view==="saved"||state.page<=1||state.loading;$("next").disabled=state.view==="saved"||!state.hasMore||state.loading;$("pageLabel").textContent=state.view==="latest"?"Page "+state.page:"Saved papers";$("refresh").disabled=state.loading;queueGraphics();}

async function timedJSON(url,ms=9000){
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),ms);
 try{const r=await fetch(url,{signal:ctrl.signal});if(!r.ok)throw Error("HTTP "+r.status);return await r.json()}
 finally{clearTimeout(timer)}
}
const CROSSREF_ISSN={"Nature":"1476-4687","Science":"1095-9203","Cell":"1097-4172","Journal of the American Chemical Society":"1520-5126","Angewandte Chemie International Edition":"1521-3773","Nature Chemical Biology":"1552-4469","ACS Chemical Biology":"1554-8937","Nature Communications":"2041-1723","Science Advances":"2375-2548","Scientific Reports":"2045-2322","Chemical Science":"2041-6539","Organic Letters":"1523-7052","ACS Nano":"1936-086X","Nano Letters":"1530-6992","Nature Materials":"1476-4660","Nature Nanotechnology":"1748-3395","Nature Cell Biology":"1476-4679","Nature Methods":"1548-7105","Advanced Materials":"1521-4095","Analytical Chemistry":"1520-6882"};
async function fetchCrossref(names,cutoff){
 const found=new Map();
 const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const chosen=names.slice(0,Math.min(names.length,12));
 const results=await Promise.allSettled(chosen.map(n=>timedJSON(CROSSREF_ISSN[n]?"https://api.crossref.org/journals/"+CROSSREF_ISSN[n]+"/works?filter=from-pub-date:"+cutoff+"&rows=60&sort=published&order=desc":"https://api.crossref.org/works?query.container-title="+encodeURIComponent(n)+"&filter=from-pub-date:"+cutoff+"&rows=100&sort=published&order=desc",15000)));
 let errors=0;
 results.forEach((result,i)=>{
  if(result.status!=="fulfilled"){errors++;return}
  const target=norm(chosen[i]);
  for(const w of result.value.message?.items||[]){
   if(!w.DOI)continue;
   const journal=w["container-title"]?.[0]||"";
   const candidate=norm(journal);
   if(!CROSSREF_ISSN[chosen[i]] && candidate!==target && !(target.length>8&&(candidate.includes(target)||target.includes(candidate))) && !(candidate.length>8&&target.includes(candidate)))continue;
   const d=w.published?.["date-parts"]?.[0]||w.issued?.["date-parts"]?.[0]||[];
   const date=d.map((x,k)=>k?String(x).padStart(2,"0"):String(x)).join("-");
   if(date&&date.padEnd(10,"-01")<cutoff)continue;
   const p={id:"crossref:"+w.DOI,title:plain(w.title?.[0]||"Untitled"),date,journal,authors:(w.author||[]).slice(0,8).map(a=>[a.given,a.family].filter(Boolean).join(" ")).join(", "),abstract:plain(w.abstract||""),doi:"https://doi.org/"+w.DOI,url:w.URL||"https://doi.org/"+w.DOI,openAccess:false};
   found.set(p.id,p);
  }
 });
 return {papers:[...found.values()].sort((a,b)=>b.date.localeCompare(a.date)),errors,checked:chosen.length};
}
async function fetchPapers(){
 const request=++state.request;
 state.loading=true;state.hasMore=false;
 if(!state.selected.size){state.papers=[];$("status").textContent="Select at least one journal.";state.loading=false;render();return}
 $("status").textContent="Checking recent papers through Crossref…";render();
 const selected=[...state.selected],cache=load("rasap.sourceIds",{}),ids=[];
 const shortWindow=selected.length>5;
 const cutoff=new Date(Date.now()-(shortWindow?48*3600000:365*86400000)).toISOString().slice(0,10);
 const windowLabel=shortWindow?"Last 48 hours":"Last 1 year";
 try{
  const backup=await fetchCrossref(selected,cutoff);
  if(request!==state.request)return;
  if(backup.papers.length){
   state.papers=backup.papers;
   state.hasMore=false;
   state.loading=false;
   $("status").textContent="Showing "+backup.papers.length+" Crossref papers · "+windowLabel+" · "+backup.checked+" journals checked"+(backup.errors?" · Some journal requests failed":"");
   $("updated").textContent="Checked "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
   render();return;
  }
  $("status").textContent="Crossref returned no matching papers ("+backup.errors+"/"+backup.checked+" requests failed); checking OpenAlex…";render();
 }catch(e){$("status").textContent="Crossref error: "+e.message+"; checking OpenAlex…";render()}

 let cursor=0;let failures=0;let papers=[];
 try{
  const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
  async function sourceWorker(){
   while(cursor<selected.length){
    if(request!==state.request)return;
    const name=selected[cursor++];
    if(cache[name]){ids.push(cache[name]);continue}
    try{
     const data=await timedJSON("https://api.openalex.org/sources?search="+encodeURIComponent(name)+"&per-page=10",7000);
     const match=(data.results||[]).find(x=>norm(x.display_name)===norm(name));
     if(match){cache[name]=match.id;ids.push(match.id)}
    }catch{failures++}
   }
  }
  await Promise.all(Array.from({length:Math.min(3,selected.length)},()=>sourceWorker()));
  if(request!==state.request)return;
  try{localStorage.setItem("rasap.sourceIds",JSON.stringify(cache))}catch{}
  const unique=[...new Set(ids)],groups=[];
  for(let i=0;i<unique.length;i+=12)groups.push(unique.slice(i,i+12));
  let index=0;const responses=[];
  const date=cutoff;
  async function worksWorker(){
   while(index<groups.length){
    if(request!==state.request)return;
    const group=groups[index++];
    try{
     const filter="primary_location.source.id:"+group.join("|")+",from_publication_date:"+date;
     const url="https://api.openalex.org/works?filter="+encodeURIComponent(filter)+"&sort=publication_date:desc&per-page=24&page="+state.page;
     responses.push(await timedJSON(url,10000));
    }catch{failures++}
   }
  }
  await Promise.all(Array.from({length:Math.min(2,groups.length)},()=>worksWorker()));
  if(request!==state.request)return;
  const found=new Map();
  for(const data of responses)for(const w of data.results||[])found.set(w.id,normalize(w));
  papers=[...found.values()].sort((a,b)=>b.date.localeCompare(a.date));
  state.hasMore=responses.some(x=>(x.meta?.count||0)>state.page*24);
 }catch{failures++}
 if(request!==state.request)return;
 try{
  if(!papers.length){
   $("status").textContent="Trying backup paper source…";render();
   const fallback=await fetchCrossref(selected,cutoff);
   papers=fallback.papers;
   state.hasMore=false;
   if(request!==state.request)return;
   $("status").textContent=papers.length?"Showing Crossref backup papers · "+windowLabel:"No papers returned · "+windowLabel+" · "+failures+" OpenAlex request failures. Try selecting Nature or Science to test the connection.";
  }else $("status").textContent="Showing "+papers.length+" recent papers · "+windowLabel+(failures?" · Some requests failed":"");
  state.papers=papers;
  $("updated").textContent="Checked "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
 }catch(e){$("status").textContent="Paper services unavailable: "+e.message}
 finally{if(request===state.request){state.loading=false;render()}}
}
function showDetail(id){const p=state.papers.find(p=>p.id===id)||state.saved[id];if(!p)return;$("detailContent").innerHTML='<p class="muted">'+escapeHTML(p.journal)+" · "+escapeHTML(p.date)+'</p><h2>'+escapeHTML(p.title)+'</h2><p>'+escapeHTML(p.authors)+'</p><h3>Abstract-based preview</h3><p>'+escapeHTML(summary(p))+'</p><h3>Full abstract</h3><p class="abstract">'+escapeHTML(p.abstract||"No abstract available in OpenAlex metadata.")+'</p><p><strong>DOI:</strong> '+(p.doi?'<a class="link" target="_blank" rel="noopener noreferrer" href="'+escapeHTML(p.doi)+'">'+escapeHTML(p.doi)+'</a>':"Not available")+'</p><p><a class="link" target="_blank" rel="noopener noreferrer" href="'+escapeHTML(p.url)+'">Open original paper ↗</a></p><p class="muted">Summaries are excerpts from metadata abstracts, not independently generated AI analysis. Graphical abstracts are shown only when a matching image is found in open-access Europe PMC full text; otherwise the card uses a journal-themed illustration.</p>';$("details").showModal()}
$("journalList").addEventListener("change",e=>{const j=e.target.dataset.journal;if(!j)return;e.target.checked?state.selected.add(j):state.selected.delete(j);store();state.page=1;updateJournalCount()});
$("journalSearch").addEventListener("input",renderJournals);
$("allJournals").onclick=()=>{state.selected=new Set(JOURNALS);store();renderJournals();state.page=1};
$("clearJournals").onclick=()=>{state.selected.clear();store();renderJournals();state.page=1;updateJournalCount()};
$("refresh").onclick=fetchPapers;
$("tabLatest").onclick=()=>{state.view="latest";render()};
$("tabSaved").onclick=()=>{state.view="saved";$("status").textContent="Saved papers are stored only on this device.";render()};
$("paperSearch").addEventListener("input",e=>{state.query=e.target.value;render()});
$("sort").addEventListener("change",render);
$("previous").onclick=()=>{if(state.page>1){state.page--;fetchPapers();window.scrollTo({top:0,behavior:"smooth"})}};
$("next").onclick=()=>{if(state.hasMore){state.page++;fetchPapers();window.scrollTo({top:0,behavior:"smooth"})}};
$("papers").addEventListener("click",e=>{const detail=e.target.closest("[data-detail]");if(detail){showDetail(detail.dataset.detail);return}const save=e.target.closest("[data-save]");if(save){const id=save.dataset.save;const p=state.papers.find(p=>p.id===id)||state.saved[id];if(!p)return;if(state.saved[id])delete state.saved[id];else state.saved[id]=p;store();render()}});
$("closeDetails").onclick=()=>$("details").close();
const journalSidebar=document.querySelector(".sidebar");const journalPopup=$("journalDialog");if(journalSidebar.parentElement!==$("journalDialogBody"))$("journalDialogBody").appendChild(journalSidebar);const openJournalPopup=()=>{journalPopup.hidden=false;document.body.classList.add("journal-popup-open");renderJournals()};const closeJournalPopup=()=>{journalPopup.hidden=true;document.body.classList.remove("journal-popup-open")};$("openJournals").addEventListener("click",openJournalPopup);$("closeJournals").addEventListener("click",closeJournalPopup);$("applyJournals").addEventListener("click",()=>{closeJournalPopup();state.page=1;fetchPapers()});journalPopup.addEventListener("click",e=>{if(e.target===journalPopup)closeJournalPopup()});document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!journalPopup.hidden)closeJournalPopup()});renderJournals();render();fetchPapers();