const API_BASE="http://localhost:5000";
const DEBOUNCE_DELAY=300;

const form=document.getElementById("searchForm");
const input=document.getElementById("searchBox");
const resultsEl=document.getElementById("results");
const metaEl=document.getElementById("meta");
const pagerEl=document.getElementById("pagination");
const limitEl=document.getElementById("limit");
const suggestionsEl=document.getElementById("suggestions");

let state={q:"",page:1,limit:parseInt(limitEl.value,10)};
let debounceTimer;

form.addEventListener("submit",e=>{e.preventDefault();state.q=input.value.trim();state.page=1;search();});
limitEl.addEventListener("change",()=>{state.limit=parseInt(limitEl.value,10);state.page=1;if(state.q) search();});
input.addEventListener("input",()=>{
  clearTimeout(debounceTimer);
  debounceTimer=setTimeout(()=>{
    state.q=input.value.trim();state.page=1;
    if(state.q){search();fetchSuggestions(state.q);}
    else{clearResults();suggestionsEl.innerHTML="";}
  },DEBOUNCE_DELAY);
});

// ===== SEARCH =====
async function search(){
  if(!state.q) return clearResults();
  const params=new URLSearchParams({q:state.q,page:state.page,limit:state.limit});
  try{
    const res=await fetch(`${API_BASE}/search?`+params.toString());
    if(!res.ok) throw new Error("Network error");
    const data=await res.json();
    render(data);
  }catch(err){console.error(err);resultsEl.innerHTML=`<div class="result">Error fetching results.</div>`;metaEl.textContent="";pagerEl.innerHTML="";}
}
function clearResults(){resultsEl.innerHTML="";metaEl.textContent="";pagerEl.innerHTML="";}
function render({results,total,page,pages,query}){
  if(total===0) metaEl.textContent=`No results for “${query}”.`;
  else{const start=(page-1)*state.limit+1,end=Math.min(page*state.limit,total);metaEl.textContent=`${start}–${end} of ${total} results for “${query}”.`;}
  resultsEl.innerHTML=(results||[]).map(r=>`<div class="result"><a class="title" href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title_html}</a><div class="snippet">${r.snippet_html}</div></div>`).join("");
  renderPagination(page,pages);
}

function renderPagination(page,pages){
  pagerEl.innerHTML="";
  if(pages<=1) return;
  const frag=document.createDocumentFragment();
  const makeBtn=(label,p,disabled=false,active=false)=>{const btn=document.createElement("button");btn.textContent=label;if(active) btn.classList.add("active");btn.disabled=disabled;btn.addEventListener("click",()=>{state.page=p;search();});return btn;}
  frag.appendChild(makeBtn("Prev",Math.max(1,page-1),page===1));
  const windowSize=5; let start=Math.max(1,page-Math.floor(windowSize/2)); let end=Math.min(pages,start+windowSize-1); if(end-start+1<windowSize) start=Math.max(1,end-windowSize+1);
  if(start>1) frag.appendChild(makeBtn("1",1,false,page===1));
  if(start>2){const ell=document.createElement("span");ell.textContent="…";ell.style.padding="8px 4px";frag.appendChild(ell);}
  for(let p=start;p<=end;p++) frag.appendChild(makeBtn(String(p),p,false,p===page));
  if(end<pages-1){const ell=document.createElement("span");ell.textContent="…";ell.style.padding="8px 4px";frag.appendChild(ell);}
  if(end<pages) frag.appendChild(makeBtn(String(pages),pages,false,page===pages));
  frag.appendChild(makeBtn("Next",Math.min(pages,page+1),page===pages));
  pagerEl.appendChild(frag);
}

// ===== SUGGESTIONS =====
async function fetchSuggestions(query){
  if(!query){ suggestionsEl.innerHTML=""; return; }
  try{
    const params=new URLSearchParams({q:query,limit:"5"});
    const res=await fetch(`${API_BASE}/suggest?`+params.toString());
    if(!res.ok) throw new Error("Network error");
    const data=await res.json();
    renderSuggestions(data);
  }catch(err){console.error(err);suggestionsEl.innerHTML="";}
}
function renderSuggestions(items){
  if(!items.length){suggestionsEl.innerHTML=""; return;}
  suggestionsEl.innerHTML=items.map(i=>`<div onclick="openSuggestion('${i.url}')">${highlightText(i.title,state.q)}</div>`).join("");
}
function highlightText(text,q){const keywords=q.split(/\s+/).filter(Boolean); if(!keywords.length) return text; const pattern=new RegExp("("+keywords.map(escapeRegex).join("|")+")","gi"); return text.replace(pattern,"<mark>$1</mark>");}
function openSuggestion(url){window.open(url,"_blank");suggestionsEl.innerHTML="";}
function escapeRegex(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}

// ===== LOAD TOP RESULTS =====
async function loadTopResults(){
  try{
    const res=await fetch(`${API_BASE}/top?limit=10`);
    if(!res.ok) throw new Error("Network error");
    const data=await res.json();
    render({results:data,total:data.length,page:1,pages:1,query:"Top Sites"});
  }catch(err){console.error(err);}
}
if(!state.q) loadTopResults();
