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
function renderJournals(){const term=$("journalSearch").value.toLowerCase();$("journalList").innerHTML=Object.entries(GROUPS).map(([group,items])=>{const matches=items.filter(j=>j.toLowerCase().includes(term));return matches.length?'<div class="journal-group">'+escapeHTML(group)+'</div>'+matches.map(j=>'<label class="journal-row"><input type="checkbox" data-journal="'+escapeHTML(j)+'" '+(state.selected.has(j)?"checked":"")+'> <span>'+escapeHTML(j)+'</span></label>').join(""):""}).join("");}
function card(p){const saved=!!state.saved[p.id];return '<article class="paper"><div class="meta"><span class="pill">'+escapeHTML(p.journal)+'</span><span>'+escapeHTML(p.date)+'</span>'+(p.openAccess?'<span>🔓 Open access</span>':"")+'</div><h3>'+escapeHTML(p.title)+'</h3><div class="authors">'+escapeHTML(p.authors||"Authors not listed")+'</div><p>'+escapeHTML(summary(p))+'</p><div class="paper-actions"><button class="secondary" data-detail="'+escapeHTML(p.id)+'">Read details</button><button class="save '+(saved?"saved":"")+'" data-save="'+escapeHTML(p.id)+'">'+(saved?"★ Saved":"☆ Save")+'</button></div></article>'}
function currentPapers(){let a=state.view==="saved"?Object.values(state.saved):state.papers;const q=state.query.trim().toLowerCase();if(q)a=a.filter(p=>[p.title,p.authors,p.abstract,p.journal].some(v=>String(v||"").toLowerCase().includes(q)));return [...a].sort((a,b)=>$("sort").value==="oldest"?a.date.localeCompare(b.date):b.date.localeCompare(a.date))}
function render(){const a=currentPapers();$("papers").innerHTML=a.length?a.map(card).join(""):'<div class="empty">'+(state.loading?"Loading papers…":state.view==="saved"?"No saved papers match your search.":"No papers found. Try other journals or refresh.")+'</div>';$("savedCount").textContent=Object.keys(state.saved).length;$("tabLatest").classList.toggle("active",state.view==="latest");$("tabSaved").classList.toggle("active",state.view==="saved");$("previous").disabled=state.view==="saved"||state.page<=1||state.loading;$("next").disabled=state.view==="saved"||!state.hasMore||state.loading;$("pageLabel").textContent=state.view==="latest"?"Page "+state.page:"Saved papers";$("refresh").disabled=state.loading;}
async function fetchPapers(){
const request=++state.request;
state.loading=true;state.papers=[];state.hasMore=false;render();
if(!state.selected.size){$("status").textContent="Select at least one journal to load papers.";state.loading=false;render();return}
$("status").textContent="Finding recent papers and matching journals…";
try{
const selected=[...state.selected];
const cache=load("rasap.sourceIds",{});
const normalized=s=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
const resolved=new Array(selected.length).fill(null);
let cursor=0,failedLookups=0;
async function lookupWorker(){
while(cursor<selected.length){
const i=cursor++,name=selected[i];
if(cache[name]){resolved[i]=cache[name];continue}
try{
const response=await fetch("https://api.openalex.org/sources?search="+encodeURIComponent(name)+"&per-page=10");
if(!response.ok)throw Error("Source lookup HTTP "+response.status);
const data=await response.json();
const found=(data.results||[]).find(x=>normalized(x.display_name)===normalized(name));
if(found){resolved[i]=found.id;cache[name]=found.id}
}catch(err){failedLookups++}
}
}
await Promise.all(Array.from({length:Math.min(4,selected.length)},()=>lookupWorker()));
if(request!==state.request)return;
try{localStorage.setItem("rasap.sourceIds",JSON.stringify(cache))}catch{}
const ids=[...new Set(resolved.filter(Boolean))];
if(!ids.length)throw Error(failedLookups?"Journal lookups were blocked or failed. Please wait a minute and refresh.":"No selected journals could be matched in OpenAlex.");
// Query small OR-filter batches to avoid API filter-size limits.
// A failed batch must not erase successful results from other batches.
const batches=[];for(let i=0;i<ids.length;i+=15)batches.push(ids.slice(i,i+15));
const fromDate=new Date(Date.now()-120*86400000).toISOString().slice(0,10);
let nextBatch=0;const results=new Array(batches.length);let failedBatches=0;
async function paperWorker(){
while(nextBatch<batches.length){
const i=nextBatch++;
try{
const filter="primary_location.source.id:"+batches[i].join("|")+",from_publication_date:"+fromDate;
const url="https://api.openalex.org/works?filter="+encodeURIComponent(filter)+"&sort=publication_date:desc&per-page=24&page="+state.page;
const response=await fetch(url);
if(!response.ok)throw Error("Works HTTP "+response.status);
results[i]=await response.json();
}catch(err){failedBatches++;results[i]=null}
}
}
await Promise.all(Array.from({length:Math.min(3,batches.length)},()=>paperWorker()));
if(request!==state.request)return;
const successful=results.filter(Boolean);
if(!successful.length)throw Error("All paper requests failed. OpenAlex may be rate limiting requests; try refreshing shortly.");
const unique=new Map();
for(const data of successful)for(const work of data.results||[])if(!unique.has(work.id))unique.set(work.id,normalize(work));
state.papers=[...unique.values()].sort((a,b)=>b.date.localeCompare(a.date));
state.hasMore=successful.some(data=>(data.meta?.count||0)>state.page*24);
$("updated").textContent="Updated "+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
const warning=failedLookups||failedBatches?" · Partial results ("+(failedLookups+failedBatches)+" requests failed)":"";
$("status").textContent=state.papers.length?state.papers.length+" papers loaded · Last 120 days · Abstract-derived previews"+warning:"No recent papers returned"+warning;
}catch(err){if(request===state.request)$("status").textContent="Unable to load papers: "+err.message}
finally{if(request===state.request){state.loading=false;render()}}
}
function showDetail(id){const p=state.papers.find(p=>p.id===id)||state.saved[id];if(!p)return;$("detailContent").innerHTML='<p class="muted">'+escapeHTML(p.journal)+" · "+escapeHTML(p.date)+'</p><h2>'+escapeHTML(p.title)+'</h2><p>'+escapeHTML(p.authors)+'</p><h3>Abstract-based preview</h3><p>'+escapeHTML(summary(p))+'</p><h3>Full abstract</h3><p class="abstract">'+escapeHTML(p.abstract||"No abstract available in OpenAlex metadata.")+'</p><p><strong>DOI:</strong> '+(p.doi?'<a class="link" target="_blank" rel="noopener noreferrer" href="'+escapeHTML(p.doi)+'">'+escapeHTML(p.doi)+'</a>':"Not available")+'</p><p><a class="link" target="_blank" rel="noopener noreferrer" href="'+escapeHTML(p.url)+'">Open original paper ↗</a></p><p class="muted">Summaries are excerpts from metadata abstracts, not independently generated AI analysis. Graphical abstracts are not included unless reliable image rights and sources can be established.</p>';$("details").showModal()}
$("journalList").addEventListener("change",e=>{const j=e.target.dataset.journal;if(!j)return;e.target.checked?state.selected.add(j):state.selected.delete(j);store();state.page=1;fetchPapers()});
$("journalSearch").addEventListener("input",renderJournals);
$("allJournals").onclick=()=>{state.selected=new Set(JOURNALS);store();renderJournals();state.page=1;fetchPapers()};
$("clearJournals").onclick=()=>{state.selected.clear();store();renderJournals();state.page=1;fetchPapers()};
$("refresh").onclick=fetchPapers;
$("tabLatest").onclick=()=>{state.view="latest";render()};
$("tabSaved").onclick=()=>{state.view="saved";$("status").textContent="Saved papers are stored only on this device.";render()};
$("paperSearch").addEventListener("input",e=>{state.query=e.target.value;render()});
$("sort").addEventListener("change",render);
$("previous").onclick=()=>{if(state.page>1){state.page--;fetchPapers();window.scrollTo({top:0,behavior:"smooth"})}};
$("next").onclick=()=>{if(state.hasMore){state.page++;fetchPapers();window.scrollTo({top:0,behavior:"smooth"})}};
$("papers").addEventListener("click",e=>{const detail=e.target.closest("[data-detail]");if(detail){showDetail(detail.dataset.detail);return}const save=e.target.closest("[data-save]");if(save){const id=save.dataset.save;const p=state.papers.find(p=>p.id===id)||state.saved[id];if(!p)return;if(state.saved[id])delete state.saved[id];else state.saved[id]=p;store();render()}});
$("closeDetails").onclick=()=>$("details").close();
renderJournals();render();fetchPapers();