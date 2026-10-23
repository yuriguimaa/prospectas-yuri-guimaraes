const UFS={AC:12,AL:27,AP:16,AM:13,BA:29,CE:23,DF:53,ES:32,GO:52,MA:21,MT:51,MS:50,MG:31,PA:15,PB:25,PR:41,PE:26,PI:22,RJ:33,RN:24,RS:43,RO:11,RR:14,SC:42,SP:35,SE:28,TO:17};
const $=id=>document.getElementById(id);
const API_BASE='https://prospecta-br-bot.yuryguimaa.chatgpt.site';
const sessionKey='prospectas_session_v1';
let session=null,signupMode=false;
let refreshing=null;
function refreshSession(){
  if(!session?.refresh_token)return Promise.resolve(false);
  refreshing??=fetch(API_BASE+'/api/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})})
    .then(async res=>{const data=await res.json().catch(()=>({}));if(!res.ok||!data.access_token)return false;session={access_token:data.access_token,refresh_token:data.refresh_token||session.refresh_token};localStorage.setItem(sessionKey,JSON.stringify(session));return true})
    .catch(()=>false).finally(()=>{refreshing=null});
  return refreshing;
}
async function api(path,options={}){
  const send=()=>{const headers=new Headers(options.headers||{});if(session?.access_token)headers.set('Authorization','Bearer '+session.access_token);return fetch(API_BASE+path,{...options,headers})};
  const res=await send();
  if(res.status!==401||path.startsWith('/api/auth/')||!await refreshSession())return res;
  return send();
}
function setAuthMessage(message,error=false){const el=$('auth-message');el.textContent=message;el.classList.toggle('error',error)}
function showAuth(){session=null;localStorage.removeItem(sessionKey);savedRows=[];savedKeys.clear();$('saved-list').replaceChildren();$('saved-count').textContent='0';$('account-email').textContent='';$('auth-gate').hidden=false;$('app-shell').hidden=true}
function restoreSessionFromConfirmation(){const hash=new URLSearchParams(location.hash.slice(1));const accessToken=hash.get('access_token');if(!accessToken)return;session={access_token:accessToken,refresh_token:hash.get('refresh_token')||''};localStorage.setItem(sessionKey,JSON.stringify(session));history.replaceState(null,'',location.pathname+location.search)}
function updateAuthMode(){const submit=$('auth-submit');submit.textContent=signupMode?'Criar conta':'Entrar';$('auth-copy').textContent=signupMode?'Crie sua conta com e-mail e confirme pelo link enviado para sua caixa de entrada.':'Entre com seu e-mail para pesquisar e salvar seus leads.';$('auth-switch').textContent=signupMode?'Já tenho cadastro':'Ainda não tenho cadastro';$('auth-password').autocomplete=signupMode?'new-password':'current-password';setAuthMessage('')}
function authError(data){const code=String(data.error_code||data.code||'');const raw=String(data.error_description||data.msg||data.message||data.error||'');if(code==='invalid_credentials'||/invalid login credentials/i.test(raw))return 'E-mail ou senha incorretos.';if(code==='email_not_confirmed'||/not confirmed/i.test(raw))return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';if(code==='user_already_exists'||/already registered/i.test(raw))return 'Este e-mail já tem cadastro. Use "Já tenho cadastro" para entrar.';if(/invalid api key/i.test(raw))return 'O servidor está com a configuração do banco de dados incorreta. Avise o administrador.';if(/rate limit/i.test(raw))return raw;return raw||'Não foi possível concluir o acesso.'}
async function authenticate(event){event.preventDefault();const email=$('auth-email').value.trim(),password=$('auth-password').value;const button=$('auth-submit');button.disabled=true;setAuthMessage(signupMode?'Criando sua conta…':'Entrando…');try{const res=await api('/api/auth/'+(signupMode?'signup':'login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const data=await res.json();if(!res.ok)throw Error(authError(data));if(signupMode){setAuthMessage('Confira seu e-mail e confirme o cadastro para entrar.');return}session={access_token:data.access_token,refresh_token:data.refresh_token};if(!session.access_token)throw Error('A conta precisa ser confirmada por e-mail antes do primeiro acesso.');localStorage.setItem(sessionKey,JSON.stringify(session));await boot()}catch(error){const message=error.message||'Não foi possível concluir o acesso.';setAuthMessage(/rate limit/i.test(message)?'O serviço de e-mail atingiu o limite temporário. Aguarde uma hora antes de criar outra conta.':message,true)}finally{button.disabled=false}}
const state={rows:[],imported:[],page:0,mode:'',query:null,total:null,hasMore:false,mapsTokens:['']};
const contactCache=new Map();
const savedKeys=new Set();
let savedRows=[];
let pipelineReady=true;
let statusFilter='';
const STATUSES=[['novo','Novo'],['contatado','Contatado'],['negociando','Negociando'],['fechado','Fechado'],['perdido','Perdido']];
const statusLabel=v=>(STATUSES.find(s=>s[0]===v)||STATUSES[0])[1];
let contactPauseUntil=0;
let searchGeneration=0;
const categoryNames={saude:'Saúde',advocacia:'Advocacia',engenharia:'Engenharia',contabilidade:'Contabilidade',outra:'Outra',cnpj:'Empresa'};
const cnaes={advocacia:'6911',engenharia:'7112',contabilidade:'6920'};
for(const uf of Object.keys(UFS).sort()){const o=document.createElement('option');o.value=uf;o.textContent=uf;$('uf').append(o)}
const cityCache={};let cityIndex={};
function validCnpj(value){const c=String(value||'').replace(/\D/g,'');if(!/^\d{14}$/.test(c)||/^(\d)\1{13}$/.test(c))return false;const calc=len=>{let sum=0,pos=len-7;for(let i=len;i>=1;i--){sum+=Number(c[len-i])*pos--;if(pos<2)pos=9}const r=sum%11;return r<2?0:11-r};return calc(12)===Number(c[12])&&calc(13)===Number(c[13])}
function formatCnpj(c){c=String(c||'').replace(/\D/g,'');return c.length===14?c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):c}
function formatPhone(p){const d=String(p||'').replace(/\D/g,'');if(d.length===11)return '('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7);if(d.length===10)return '('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6);return p}
async function loadCities(uf){
  const list=$('city-list');list.replaceChildren();cityIndex={};
  if(!uf)return;
  try{
    if(!cityCache[uf]){const res=await api('/api/municipios?uf='+uf,{headers:{Accept:'application/json'}});if(!res.ok)throw Error();cityCache[uf]=await res.json()}
    if($('uf').value!==uf)return;
    for(const c of cityCache[uf]){cityIndex[normalize(c.nome)]=String(c.id);const o=document.createElement('option');o.value=c.nome;list.append(o)}
  }catch{}
}
function normalize(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function first(o,keys){for(const k of keys){const v=o?.[k];if(v!==undefined&&v!==null&&String(v).trim())return String(v).trim()}return ''}
function setStatus(title,detail,kind='empty'){const s=$('status');s.className='status '+kind;s.replaceChildren();const icon=document.createElement('div');icon.className='status-icon';icon.textContent=kind==='error'?'!':'⌕';const strong=document.createElement('strong');strong.textContent=title;const span=document.createElement('span');span.textContent=detail;s.append(icon,strong,span);s.hidden=false}
function safeUrl(s){try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
const WA_TEMPLATE_KEY='prospectas_wa_template_v1';
const WA_TEMPLATE_DEFAULT='Olá! Tudo bem? Encontrei a {nome} e gostaria de apresentar um serviço que pode ajudar vocês. Posso falar com o responsável?';
function waTemplate(){try{return localStorage.getItem(WA_TEMPLATE_KEY)||WA_TEMPLATE_DEFAULT}catch{return WA_TEMPLATE_DEFAULT}}
function fillTemplate(t,lead){const nome=String(lead?.name||'').split('|')[0].trim();return t.replace(/\{nome\}/gi,nome||'sua empresa').replace(/\{cidade\}/gi,lead?.city||'').replace(/\{categoria\}/gi,String(lead?.category||'').toLowerCase()).replace(/\s{2,}/g,' ').trim()}
function whatsappUrl(phone,lead){let d=String(phone||'').replace(/\D/g,'');if(d.startsWith('0'))d=d.replace(/^0+/,'');if(d.length===10||d.length===11)d='55'+d;if(!/^55\d{10,11}$/.test(d))return '';const text=lead?fillTemplate(waTemplate(),lead):'';return 'https://wa.me/'+d+(text?'?text='+encodeURIComponent(text):'')}
function addWhatsapp(parent,phone,lead,fromSite){const url=whatsappUrl(phone,lead);if(!url)return;const a=document.createElement('a');a.className='whatsapp';a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=fromSite?'WhatsApp do site':'WhatsApp';a.title=fromSite?'Número de WhatsApp divulgado no site da empresa':'Abrir conversa no WhatsApp com a mensagem pronta';parent.append(a)}
function addSocials(parent,r){for(const [k,label] of [['instagram','Instagram'],['facebook','Facebook'],['linkedin','LinkedIn']]){const u=r.socials?.[k];if(u&&safeUrl(u)&&safeUrl(u)!==safeUrl(r.site||'')){const sp=document.createElement('span');setLink(sp,'↗ '+label,safeUrl(u));parent.append(sp)}}}
async function loadSiteContacts(r){
  if(!r.site||r.siteChecked||r.sitePending)return;
  r.sitePending=true;if(state.rows.includes(r))show(state.rows);
  try{
    const res=await api('/api/site-contatos?url='+encodeURIComponent(r.site),{headers:{Accept:'application/json'}});
    if(res.status===429){r.sitePending=false;return}
    const d=res.ok?await res.json():{};
    r.siteChecked=true;
    if(!r.email&&Array.isArray(d.emails)&&d.emails.length){r.email=d.emails[0];r.emailFromSite=true}
    r.socials={instagram:d.instagram||'',facebook:d.facebook||'',linkedin:d.linkedin||''};
    if(d.whatsapp)r.whatsappSite=d.whatsapp;
  }catch{r.siteChecked=true}
  finally{r.sitePending=false;if(state.rows.includes(r))show(state.rows)}
}
async function enrichSites(rows){let next=0;async function worker(){while(state.rows===rows&&next<rows.length){const r=rows[next++];if(r.site&&!r.siteChecked)await loadSiteContacts(r)}}await Promise.all([worker(),worker(),worker()])}
function setLink(parent,text,href){const a=document.createElement('a');a.textContent=text;a.href=href;a.target='_blank';a.rel='noopener noreferrer';parent.append(a)}
async function loadSaved(){
  try{
    const res=await api('/api/leads',{headers:{Accept:'application/json'}});
    if(!res.ok)throw Error('Não foi possível carregar seus leads.');
    pipelineReady=res.headers.get('x-pipeline-ready')!=='0';
    savedRows=await res.json();
    savedKeys.clear();for(const row of savedRows)savedKeys.add(row.record_key);
    renderSaved();if(state.mode)show(state.rows);
  }catch(error){$('saved-status').textContent=error.message||'Banco de dados indisponível.'}
}
function filteredSaved(){
  const term=normalize($('saved-search').value);
  return savedRows.filter(r=>(!statusFilter||(r.status||'novo')===statusFilter)&&(!term||normalize([r.name,r.category,r.city,r.uf,r.phone,r.email,r.notes].join(' ')).includes(term)));
}
function renderPipeline(){
  const bar=$('pipeline-bar');bar.replaceChildren();bar.hidden=!savedRows.length;
  $('pipeline-setup').hidden=pipelineReady||!savedRows.length;
  const counts={};for(const r of savedRows){const k=r.status||'novo';counts[k]=(counts[k]||0)+1}
  for(const [value,label] of [['','Todos'],...STATUSES]){
    const b=document.createElement('button');b.type='button';b.className='pipeline-chip'+(value?' status-'+value:'')+(statusFilter===value?' active':'');
    const n=value?counts[value]||0:savedRows.length;b.textContent=label+' ';const c=document.createElement('span');c.textContent=String(n);b.append(c);
    b.setAttribute('aria-pressed',String(statusFilter===value));
    b.addEventListener('click',()=>{statusFilter=value;renderSaved()});bar.append(b);
  }
}
async function updateLead(row,patch,feedback){
  const previous={status:row.status,notes:row.notes};Object.assign(row,patch);
  if(feedback){feedback.textContent='Salvando…';feedback.className='note-feedback'}
  try{
    const res=await api('/api/leads',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({recordKey:row.record_key,...patch})});
    if(!res.ok)throw Error();
    if(feedback){feedback.textContent='Salvo ✓';feedback.className='note-feedback ok'}
    return true;
  }catch{
    Object.assign(row,previous);
    if(feedback){feedback.textContent='Não foi possível salvar';feedback.className='note-feedback error'}
    else $('saved-status').textContent='Não foi possível atualizar o lead. Tente novamente.';
    return false;
  }
}
function renderSaved(){
  const list=$('saved-list');list.replaceChildren();$('saved-count').textContent=String(savedRows.length);
  renderPipeline();
  const rows=filteredSaved();
  $('saved-export').disabled=!rows.length;
  $('saved-status').textContent=!savedRows.length?'Você ainda não salvou nenhum lead.':!rows.length?'Nenhum lead salvo corresponde ao filtro.':'';
  for(const row of rows){
    const status=row.status||'novo';
    const item=document.createElement('article');item.className='saved-item status-'+status;
    const top=document.createElement('div');top.className='saved-top';
    const details=document.createElement('div');const name=document.createElement('strong');name.textContent=row.name;
    const info=document.createElement('small');info.textContent=[row.category,row.city,row.uf].filter(Boolean).join(' · ');
    const contact=document.createElement('small');
    if(row.phone)setLink(contact,'☎ '+row.phone,'tel:'+row.phone.replace(/[^\d+]/g,''));
    if(row.phone&&row.email)contact.append(' · ');
    if(row.email)setLink(contact,'✉ '+row.email,'mailto:'+row.email);
    if(row.created_at){const d=new Date(row.created_at);if(!isNaN(d)){const span=document.createElement('span');span.className='saved-date';span.textContent=(contact.childNodes.length?' · ':'')+'salvo em '+d.toLocaleDateString('pt-BR');contact.append(span)}}
    details.append(name,info,contact);
    const actions=document.createElement('div');actions.className='saved-actions';
    if(pipelineReady){
      const select=document.createElement('select');select.className='status-select status-'+status;select.setAttribute('aria-label','Etapa do lead '+row.name);
      for(const [value,label] of STATUSES){const o=document.createElement('option');o.value=value;o.textContent=label;o.selected=value===status;select.append(o)}
      select.addEventListener('change',async()=>{select.disabled=true;await updateLead(row,{status:select.value});renderSaved()});
      actions.append(select);
    }
    addWhatsapp(actions,row.phone,{name:row.name,city:row.city,category:row.category});
    const remove=document.createElement('button');remove.type='button';remove.className='save-lead';remove.textContent='Remover';
    remove.addEventListener('click',()=>removeSaved(row.record_key,remove));actions.append(remove);
    top.append(details,actions);item.append(top);
    if(pipelineReady){
      const notes=document.createElement('div');notes.className='saved-notes';
      const area=document.createElement('textarea');area.rows=1;area.maxLength=2000;area.placeholder='Anotações: o que foi conversado, próximo passo, melhor horário…';area.value=row.notes||'';area.setAttribute('aria-label','Anotações sobre '+row.name);
      const feedback=document.createElement('span');feedback.className='note-feedback';
      const grow=()=>{area.style.height='auto';area.style.height=Math.min(area.scrollHeight,160)+'px'};
      area.addEventListener('input',()=>{grow();feedback.textContent='';});
      area.addEventListener('blur',()=>{if(area.value!==(row.notes||''))updateLead(row,{notes:area.value},feedback)});
      notes.append(area,feedback);item.append(notes);requestAnimationFrame(grow);
    }
    list.append(item);
  }
}
$('saved-search').addEventListener('input',renderSaved);
$('saved-export').addEventListener('click',()=>{const rows=filteredSaved();const keys=['name','category','city','uf','phone','email','status','notes','site','source','source_url','created_at'];const labels=['nome','categoria','cidade','uf','telefone','email','etapa','anotacoes','site','fonte','url_fonte','salvo_em'];const fmt=(r,k)=>k==='created_at'&&r[k]?new Date(r[k]).toLocaleDateString('pt-BR'):k==='status'?statusLabel(r.status||'novo'):r[k];const csv='﻿'+[labels.join(';'),...rows.map(r=>keys.map(k=>csvCell(fmt(r,k))).join(';'))].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='prospectas-meus-leads.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
async function removeSaved(recordKey,button){
  button.disabled=true;
  try{const res=await api('/api/leads?recordKey='+encodeURIComponent(recordKey),{method:'DELETE'});if(!res.ok)throw Error();await loadSaved()}
  catch{button.disabled=false;$('saved-status').textContent='Não foi possível remover o lead. Tente novamente.'}
}
async function saveLead(r,button){
  if(savedKeys.has(r.recordKey)){await removeSaved(r.recordKey,button);return}
  button.disabled=true;
  try{
    const res=await api('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recordKey:r.recordKey,name:r.name,category:r.category,city:r.city,uf:r.uf,phone:r.phone,email:r.email,source:r.source,sourceUrl:r.sourceUrl,site:r.site})});
    if(!res.ok)throw Error();await loadSaved();
  }catch{button.disabled=false;$('saved-status').textContent='Não foi possível salvar o lead. Tente novamente.'}
}
async function boot(){
  restoreSessionFromConfirmation();
  if(!session)try{session=JSON.parse(localStorage.getItem(sessionKey)||'null')}catch{session=null}
  if(!session?.access_token){showAuth();return}
  try{
    const me=async()=>(await api('/api/me',{headers:{Accept:'application/json'}})).json();
    let data=await me();
    if(!data.authenticated&&await refreshSession())data=await me();
    if(data.authenticated){$('account-email').textContent=data.email;$('app-shell').hidden=false;$('auth-gate').hidden=true;loadSaved();return}
  }catch{}
  showAuth();
}
$('auth-form').addEventListener('submit',authenticate);$('auth-switch').addEventListener('click',()=>{signupMode=!signupMode;updateAuthMode()});$('logout-btn').addEventListener('click',showAuth);updateAuthMode();
boot();
function partnersBlock(r){
  const box=document.createElement('div');box.className='lead-partners';
  if(Array.isArray(r.partners)){
    if(!r.partners.length){box.textContent='Sócios: não constam na base da Receita.';box.classList.add('empty');return box}
    const top=r.partners.filter(p=>p.decisor);const list=(top.length?top:r.partners);
    const label=document.createElement('span');label.className='partners-label';label.textContent=top.length?'Decisores':'Sócios';box.append(label);
    const shown=r.partnersOpen?r.partners:list.slice(0,3);
    for(const p of shown){const chip=document.createElement('span');chip.className='partner'+(p.decisor?' decisor':'');const n=document.createElement('strong');n.textContent=titleCase(p.nome);const c=document.createElement('small');c.textContent=p.cargo+(p.desde?' · desde '+p.desde.slice(0,4):'');chip.append(n,c);box.append(chip)}
    const hidden=r.partners.length-shown.length;
    if(hidden>0||r.partnersOpen){const more=document.createElement('button');more.type='button';more.className='partners-more';more.textContent=r.partnersOpen?'Mostrar menos':'+'+hidden+' sócio'+(hidden>1?'s':'');more.addEventListener('click',()=>{r.partnersOpen=!r.partnersOpen;show(state.rows)});box.append(more)}
    return box;
  }
  const btn=document.createElement('button');btn.type='button';btn.className='contact-fetch';
  btn.textContent=r.partnersPending?'Buscando sócios…':r.partnersError||'Ver sócios e decisores';btn.disabled=Boolean(r.partnersPending);
  btn.addEventListener('click',()=>loadPartners(r));box.append(btn);return box;
}
function titleCase(s){return String(s||'').toLowerCase().replace(/(^|\s)([a-zà-ÿ])/g,(m,a,b)=>a+b.toUpperCase()).replace(/\s(De|Da|Do|Das|Dos|E)\s/g,m=>m.toLowerCase())}
async function loadPartners(r){
  if(!r.cnpj||r.partnersPending)return;
  r.partnersPending=true;r.partnersError='';show(state.rows);
  try{const res=await api('/api/socios?cnpj='+r.cnpj,{headers:{Accept:'application/json'}});if(!res.ok)throw new Error(String(res.status));const d=await res.json();r.partners=d.partners||[]}
  catch(e){r.partnersError=e.message==='429'?'Muitas consultas: tente em 1 minuto':'Sócios indisponíveis: tentar de novo'}
  finally{r.partnersPending=false;if(state.rows.includes(r))show(state.rows)}
}
function show(rows){
  const list=$('result-list');
  list.replaceChildren();
  const visible=rows.filter(r=>!r.exclude);
  const pending=rows.filter(r=>r.cnpj&&!r.exclude&&!r.contactChecked).length;
  const excluded=rows.filter(r=>r.exclude).length;
  const verified=rows.filter(r=>r.verified).length;
  const summary=$('verification-summary');
  summary.hidden=state.mode!=='company'||!rows.length;
  summary.textContent=verified+' cadastros confirmados · '+pending+' em verificação · '+excluded+' fora dos filtros';
  const filtered=$('only-contact').checked?visible.filter(r=>r.phone||r.email):visible;
  $('count').textContent=String(filtered.length);
  $('export-btn').disabled=!filtered.some(r=>state.mode!=='company'||r.verified);
  for(const r of filtered){
    const card=document.createElement('article');card.className='lead';
    const main=document.createElement('div');
    const title=document.createElement('div');title.className='lead-title';
    const h=document.createElement('h3');h.textContent=r.name||'Sem nome informado';
    const type=document.createElement('span');type.className='lead-type';type.textContent=r.category;
    title.append(h,type);
    if(r.cnpj&&state.mode==='company'){
      const badge=document.createElement('span');badge.className='lead-verification';
      badge.textContent=r.verified?(r.categoryVerified?'Cadastro confirmado':'Cadastro ativo · atividade por texto'):r.contactPending?'Conferindo cadastro…':'Cadastro a conferir';
      title.append(badge);
    }
    if(r.situacao&&normalize(r.situacao)!=='ativa'){const warn=document.createElement('span');warn.className='lead-verification lead-warning';warn.textContent='Situação: '+r.situacao;title.append(warn)}
    const place=document.createElement('div');place.className='lead-place';place.textContent=[r.rating?'★ '+String(r.rating).replace('.',',')+' ('+r.reviews+' avaliações)':'',r.address,r.address&&state.mode==='maps'?'':([r.city,r.uf].filter(Boolean).join(' · ')||'Localidade não informada'),r.cnpj?'CNPJ '+formatCnpj(r.cnpj):''].filter(Boolean).join(' · ');
    const meta=document.createElement('div');meta.className='lead-meta';
    const phone=document.createElement('span');
    if(r.phone){setLink(phone,'☎ '+r.phone,'tel:'+r.phone.replace(/[^\d+]/g,''))}
    else{phone.className='missing';phone.textContent='Telefone não informado'}
    const email=document.createElement('span');
    if(r.email){setLink(email,'✉ '+r.email,'mailto:'+r.email);if(r.emailFromSite)email.title='E-mail publicado no site da empresa'}
    else if(r.sitePending){email.className='missing';email.textContent='Procurando e-mail no site…'}
    else{email.className='missing';email.textContent=r.siteChecked?'E-mail não encontrado no site':'E-mail não informado'}
    meta.append(phone,email);
    for(const extra of (r.phones||[]).filter(x=>x&&x.replace(/\D/g,'')!==String(r.phone||'').replace(/\D/g,'')).slice(0,2)){const sp=document.createElement('span');setLink(sp,'☎ '+formatPhone(extra),'tel:'+extra.replace(/\D/g,''));meta.append(sp)}
    if(r.whatsappSite)addWhatsapp(meta,r.whatsappSite,r,true);
    else if(r.phone)addWhatsapp(meta,r.phone,r);
    if(r.site&&safeUrl(r.site)){const site=document.createElement('span');setLink(site,/instagram\.com/i.test(r.site)?'↗ Instagram':/facebook\.com/i.test(r.site)?'↗ Facebook':'↗ Site',safeUrl(r.site));meta.append(site)}
    addSocials(meta,r);
    if(r.cnpj&&(!r.contactChecked||!r.phone||!r.email)){
      const btn=document.createElement('button');btn.type='button';btn.className='contact-fetch';
      btn.textContent=r.contactPending?(r.query?'Conferindo cadastro…':'Buscando contatos…'):r.contactChecked?'Sem outros contatos cadastrados':r.contactError||(r.query?'Conferir cadastro e contatos':'Buscar mais contatos pelo CNPJ');
      btn.disabled=Boolean(r.contactPending||r.contactChecked);
      btn.addEventListener('click',()=>loadContact(r));meta.append(btn);
    }
    if(r.recordKey){
      const save=document.createElement('button');save.type='button';save.className='save-lead';
      save.textContent=savedKeys.has(r.recordKey)?'✓ Salvo · remover':'☆ Salvar lead';
      save.disabled=Boolean(r.cnpj&&!r.verified);
      save.addEventListener('click',()=>saveLead(r,save));meta.append(save);
    }
    main.append(title,place,meta);
    if(r.cnpj)main.append(partnersBlock(r));
    const source=document.createElement('div');source.className='lead-source';
    if(r.sourceUrl){setLink(source,'Fonte: '+r.source,r.sourceUrl)}else source.textContent='Fonte: '+r.source;
    card.append(main,source);list.append(card);
  }
  if(filtered.length){$('status').hidden=true}
  else setStatus(state.mode==='company'&&excluded?'Nenhuma empresa confirmada nesta página':'Nenhum contato nesta página',pending?'Aguarde a conferência dos cadastros.':'Ajuste os filtros ou avance para a próxima página.');
  $('page-label').textContent='Página '+(state.page+1);
  $('prev-btn').disabled=!['cnes','company','maps'].includes(state.mode)||state.page===0;
  $('next-btn').disabled=!['cnes','company','maps'].includes(state.mode)||!state.hasMore;
}
function mapCnes(o){const code=first(o,['codigo_cnes','co_cnes','cnes']);const ufCode=first(o,['codigo_uf']);const uf=first(o,['uf','sigla_uf','estado'])||Object.keys(UFS).find(k=>String(UFS[k])===ufCode)||'';const rawPhone=first(o,['numero_telefone_estabelecimento','numero_telefone','telefone','estabelecimento_telefone','nu_telefone','ddd_telefone']);const rawEmail=first(o,['endereco_email_estabelecimento','endereco_email','email','estabelecimento_email','ds_email']);const cnpj=first(o,['numero_cnpj','cnpj','numero_cnpj_entidade']).replace(/\D/g,'');const phone=rawPhone.replace(/\D/g,'').length>=8?rawPhone:'';const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)?rawEmail:'';const address=[first(o,['endereco_estabelecimento','logradouro']),first(o,['numero_estabelecimento']),first(o,['bairro_estabelecimento'])].filter(Boolean).join(', ');return {name:first(o,['nome_fantasia','estabelecimento_nome_fantasia','nome_razao_social','razao_social','no_fantasia','nome'])||('Estabelecimento CNES '+code),category:'Saúde',city:first(o,['nome_municipio','municipio','no_municipio','municipio_nome'])||('Município IBGE '+first(o,['codigo_municipio'])),uf,address,phone,email,site:'',cnpj:validCnpj(cnpj)?cnpj:'',verified:true,contactChecked:!validCnpj(cnpj)||Boolean(phone&&email),recordKey:code?'cnes:'+code:'',source:'CNES · Ministério da Saúde',sourceUrl:code?'https://cnes.datasus.gov.br/pages/estabelecimentos/consulta.jsp':'https://apidadosabertos.saude.gov.br/'}}
function extractRows(data){if(Array.isArray(data))return data;for(const k of ['estabelecimentos','resultados','dados','data','results','items','content'])if(Array.isArray(data?.[k]))return data[k];return []}
async function searchCnes(){
  const generation=++searchGeneration;const uf=$('uf').value;const cityName=$('term').value.trim();
  const p=new URLSearchParams({offset:String(state.page*20)});if(uf)p.set('uf',uf);
  const tipo=$('cnes-type').value;if(tipo)p.set('tipo',tipo);
  if(cityName){
    if(!uf){state.rows=[];state.mode='';state.hasMore=false;show([]);setStatus('Escolha o estado','Para filtrar por cidade, selecione primeiro o estado.');$('uf').focus();return}
    if(!cityCache[uf])await loadCities(uf);
    const code=cityIndex[normalize(cityName)];
    if(!code){state.rows=[];state.mode='';state.hasMore=false;show([]);setStatus('Cidade não encontrada','Confira o nome da cidade em '+uf+' ou escolha uma das sugestões da lista.');$('term').focus();return}
    p.set('municipio',code);
  }
  setStatus('Consultando o CNES','Aguarde a resposta da base pública.','loading');$('search-btn').disabled=true;
  try{
    const res=await api('/api/cnes?'+p,{headers:{Accept:'application/json'}});
    if(!res.ok)throw new Error(String(res.status));
    const data=await res.json();if(generation!==searchGeneration)return;
    state.rows=extractRows(data).map(mapCnes);state.mode='cnes';state.hasMore=state.rows.length===20;show(state.rows);
    if(!state.rows.length)setStatus('Nenhum estabelecimento encontrado','Tente outro tipo de estabelecimento, outra cidade ou apenas o estado.');
    else enrichAllRows(state.rows);
  }catch(err){
    if(generation!==searchGeneration)return;state.rows=[];state.mode='';state.hasMore=false;show([]);
    setStatus(err.message==='429'?'Muitas consultas seguidas':'Não foi possível consultar o CNES',err.message==='429'?'Aguarde um minuto e tente novamente.':'A fonte pública pode estar indisponível. Tente novamente mais tarde ou importe um CSV.','error');
  }finally{if(generation===searchGeneration)$('search-btn').disabled=false}
}
async function searchCnpj(){
  const generation=++searchGeneration;const cnpj=$('cnpj-input').value.replace(/\D/g,'');
  if(!validCnpj(cnpj)){state.rows=[];state.mode='';state.hasMore=false;show([]);setStatus('CNPJ inválido','Confira os 14 números do CNPJ.');$('cnpj-input').focus();return}
  setStatus('Consultando o CNPJ','Buscando em OpenCNPJ, BrasilAPI e CNPJ.ws.','loading');$('search-btn').disabled=true;
  try{
    const res=await api('/api/cnpj?cnpj='+cnpj,{headers:{Accept:'application/json'}});
    if(!res.ok)throw new Error(String(res.status));
    const d=await res.json();if(generation!==searchGeneration)return;
    contactCache.set(cnpj,d);
    state.rows=[{name:d.name||d.razaoSocial||('Empresa '+formatCnpj(cnpj)),category:d.mainActivity||'Empresa',city:d.city,uf:d.uf,address:d.address,phone:d.phone?formatPhone(d.phone):'',phones:d.phones||[],email:d.email,site:'',cnpj,situacao:d.status,verified:true,contactChecked:true,recordKey:'cnpj:'+cnpj,source:d.source||'Cadastro empresarial',sourceUrl:d.sourceUrl||'',partners:Array.isArray(d.partners)?d.partners:undefined}];
    state.mode='cnpj';state.hasMore=false;show(state.rows);enrichSites(state.rows);
  }catch(err){
    if(generation!==searchGeneration)return;state.rows=[];state.mode='';state.hasMore=false;show([]);
    const c=err.message;setStatus(c==='404'?'CNPJ não encontrado':c==='429'?'Limite temporário das fontes':'Não foi possível consultar o CNPJ',c==='404'?'Nenhuma das bases públicas tem esse CNPJ.':c==='429'?'Aguarde um minuto e tente novamente.':'As fontes podem estar indisponíveis. Tente novamente em instantes.','error');
  }finally{if(generation===searchGeneration)$('search-btn').disabled=false}
}
function mapCompany(o){const address=o.endereco&&typeof o.endereco==='object'?o.endereco:{};const cnpj=first(o,['cnpj','CNPJ']).replace(/\D/g,'');const phone=first(o,['telefone','telefone1','telefone_1','telefone_principal','ddd_telefone_1','ddd_telefone_2'])||first(address,['telefone']);const email=first(o,['email','correio_eletronico','email_principal'])||first(address,['email']);return {name:first(o,['nome_fantasia','razao_social','nome','nome_empresarial'])||('Empresa '+cnpj),category:categoryNames[$('category').value]||'Empresa',city:first(o,['municipio','cidade','nome_municipio'])||first(address,['municipio','cidade']),uf:first(o,['uf','estado'])||first(address,['uf','estado']),phone:phone.replace(/\D/g,'').length>=8?phone:'',email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'',site:safeUrl(first(o,['site','website','url_site'])),cnpj,recordKey:cnpj?'cnpj:'+cnpj:'',contactChecked:false,source:'SINTEGRA Brasil · cadastro empresarial',sourceUrl:cnpj.length===14?'https://www.sintegrabrasil.com.br/cnpj/'+cnpj:'https://www.sintegrabrasil.com.br/api'}}
async function searchCompany(){const generation=++searchGeneration;const key=$('api-key').value.trim();if(!key){state.rows=[];state.mode='';state.hasMore=false;show([]);setStatus('Informe sua chave gratuita','Crie a chave no link acima, cole neste campo e faça a busca.','empty');$('api-key').focus();return}const category=$('category').value;let cnae=category==='outra'?$('cnae').value.trim():cnaes[category];if(/^\d{4}[\d./-]+$/.test(cnae))cnae=cnae.slice(0,4);if(!cnae){state.rows=[];state.mode='';state.hasMore=false;show([]);setStatus('Informe uma atividade','Digite uma atividade ou código CNAE para buscar outras categorias.');$('cnae').focus();return}const query={cnae,uf:$('uf').value,city:$('term').value.trim(),category:categoryNames[category]||'Empresa'};const p=new URLSearchParams({cnae,limit:'20',offset:String(state.page*20)});if(query.uf)p.set('uf',query.uf);if(query.city)p.set('municipio',query.city);setStatus('Buscando empresas','Consultando a base gratuita por atividade e região.','loading');$('search-btn').disabled=true;try{const res=await api('/api/empresas?'+p,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({apiKey:key})});if(!res.ok)throw new Error(String(res.status));const data=await res.json();if(generation!==searchGeneration)return;const raw=extractRows(data);state.rows=[...new Map(raw.map(mapCompany).filter(r=>r.cnpj.length===14).map(r=>[r.cnpj,r])).values()];for(const r of state.rows){r.phone='';r.email='';r.category=query.category;r.query=query;const cached=contactCache.get(r.cnpj);if(cached)applyCompanyVerification(r,cached)}state.mode='company';state.hasMore=Boolean(data.hasMore??data.has_more??(raw.length===20));show(state.rows);if(state.rows.length)enrichAllRows(state.rows);if(!state.rows.length)setStatus('Nenhuma empresa encontrada','Tente outra cidade, estado ou atividade. A cobertura depende da fonte.')}catch(err){if(generation!==searchGeneration)return;state.rows=[];state.mode='';state.hasMore=false;show([]);const code=err.message;setStatus(code==='401'?'Chave não aceita':code==='429'?'Limite gratuito atingido':'Não foi possível buscar empresas',code==='401'?'Confira a chave criada no painel da API SINTEGRA Brasil.':code==='429'?'Aguarde a liberação de novas consultas no painel da API.':'Confira sua conexão e tente novamente. A fonte pode estar indisponível.','error')}finally{if(generation===searchGeneration)$('search-btn').disabled=false}}
function applyCompanyVerification(r,data){
  const q=r.query;
  if(!q){
    r.contactChecked=true;
    if(!r.phone&&data.phone)r.phone=formatPhone(data.phone);
    r.phones=[...new Set([...(r.phones||[]),...(data.phones||[])])];
    if(Array.isArray(data.partners))r.partners=data.partners;
    if(!r.email&&data.email)r.email=data.email;
    if(!r.address&&data.address)r.address=data.address;
    if(data.status)r.situacao=data.status;
    if(data.phone||data.email)r.source=r.source.split(' + ')[0]+' + '+String(data.source||'CNPJ').split(' · ')[0];
    return true;
  }
  const numericCnae=Boolean(q&&/^\d{4}$/.test(q.cnae));
  const matches=Boolean(q&&data.cnpj===r.cnpj&&normalize(data.status)==='ativa'&&(!numericCnae||(Array.isArray(data.cnaes)&&data.cnaes.some(code=>code.startsWith(q.cnae))))&&(!q.uf||data.uf===q.uf)&&(!q.city||normalize(data.city)===normalize(q.city)));
  r.contactChecked=true;
  r.verified=matches;
  r.categoryVerified=numericCnae;
  r.exclude=!matches;
  if(matches){
    r.name=data.name||r.name;
    r.city=data.city||r.city;
    r.uf=data.uf||r.uf;
    r.phone=data.phone?formatPhone(data.phone):'';
    r.phones=data.phones||[];
    r.email=data.email||'';
    r.address=data.address||r.address;
    if(Array.isArray(data.partners))r.partners=data.partners;
    r.source='SINTEGRA Brasil + '+String(data.source||'OpenCNPJ').split(' · ')[0];
    r.sourceUrl=data.sourceUrl||r.sourceUrl;
  }
  return matches;
}
async function loadContact(r){
  if(!r.cnpj||r.contactPending||r.contactChecked)return false;
  if(Date.now()<contactPauseUntil){r.contactError='Limite da fonte: tente em 1 minuto';show(state.rows);return false}
  r.contactPending=true;r.contactError='';show(state.rows);
  try{
    const res=await api('/api/contato?cnpj='+encodeURIComponent(r.cnpj)+'&source=verified-v2',{headers:{Accept:'application/json'}});
    if(!res.ok)throw new Error(String(res.status));
    const data=await res.json();
    applyCompanyVerification(r,data);
    contactCache.set(r.cnpj,data);
    return true;
  }catch(err){
    if(err.message==='429'){contactPauseUntil=Date.now()+60000;r.contactError='Limite da fonte: tente em 1 minuto'}
    else if(err.message==='404'){r.contactChecked=true;r.contactError=''}
    else r.contactError='Contato indisponível: tentar de novo';
    return false;
  }finally{r.contactPending=false;if(state.rows.includes(r))show(state.rows)}
}
async function enrichAllRows(rows){let next=0;async function worker(){while(state.rows===rows&&next<rows.length&&Date.now()>=contactPauseUntil){const r=rows[next++];if(r.cnpj&&!r.contactChecked)await loadContact(r)}}await Promise.all([worker(),worker(),worker()])}
function filterImported(){const cat=$('category').value;const uf=$('uf').value;const term=normalize($('term').value);return state.imported.filter(r=>{const c=normalize(r.category);const matchCategory=cat==='outra'?!['saude','medico','medicina','clinica','advocacia','advogado','engenharia','engenheiro','contabilidade','contador'].some(w=>c.includes(w)):cat==='saude'?['saude','medico','medicina','clinica'].some(w=>c.includes(w)):cat==='advocacia'?['advocacia','advogado'].some(w=>c.includes(w)):cat==='engenharia'?['engenharia','engenheiro'].some(w=>c.includes(w)):['contabilidade','contador'].some(w=>c.includes(w));return matchCategory&&(!uf||normalize(r.uf)===normalize(uf))&&(!term||normalize(r.name+' '+r.city).includes(term))})}
function search(){searchGeneration++;state.page=0;if($('category').value==='saude'){searchCnes();return}if($('category').value==='cnpj'){searchCnpj();return}if($('api-key').value.trim()){searchCompany();return}if(!state.imported.length){searchCompany();return}state.rows=filterImported();state.mode='csv';state.hasMore=false;show(state.rows);if(!state.rows.length)setStatus('Nenhum contato encontrado','Confira categoria, estado e cidade na planilha importada.')}
$('search-form').addEventListener('submit',e=>{e.preventDefault();search()});
function updateCategory(){
  const category=$('category').value;const health=category==='saude';const byCnpj=category==='cnpj';
  $('api-setup').hidden=health||byCnpj;$('company-contact-note').hidden=health||byCnpj;$('custom-cnae').hidden=category!=='outra';
  $('cnes-setup').hidden=!health;$('cnpj-setup').hidden=!byCnpj;
  $('source-hint').textContent=health?'Busca ao vivo na base pública CNES, por estado, cidade e tipo de estabelecimento.':byCnpj?'Consulta direta em três bases públicas de CNPJ.':'Busca empresas por atividade CNAE; não confirma registro profissional individual.';
  $('source-name').textContent=health?'CNES • Ministério da Saúde':byCnpj?'OpenCNPJ • BrasilAPI • CNPJ.ws':'SINTEGRA Brasil • empresas';
  $('term').disabled=byCnpj;$('uf').disabled=byCnpj;
  $('term').placeholder=byCnpj?'Não se aplica à consulta por CNPJ':health?'Escolha o estado e digite a cidade':'Ex.: Campinas';
  if(health&&$('uf').value)loadCities($('uf').value);
}
$('uf').addEventListener('change',()=>{if($('category').value==='saude')loadCities($('uf').value)});
$('cnpj-input').addEventListener('input',e=>{const d=e.target.value.replace(/\D/g,'').slice(0,14);e.target.value=d.length===14?formatCnpj(d):d});
$('category').addEventListener('change',updateCategory);updateCategory();
$('only-contact').addEventListener('change',()=>show(state.rows));

async function searchMaps(){
  const generation=++searchGeneration;const q=$('maps-q').value.trim();
  if(q.length<2){$('maps-q').focus();return}
  const token=state.mapsTokens?.[state.page]||'';
  const p=new URLSearchParams({q});const uf=$('maps-uf').value,city=$('maps-city').value.trim();if(uf)p.set('uf',uf);if(city)p.set('cidade',city);if(token)p.set('page',token);
  setStatus('Buscando no Google Maps','Procurando "'+q+'"'+(city||uf?' em '+[city,uf].filter(Boolean).join(', '):'')+'.','loading');$('maps-btn').disabled=true;
  document.getElementById('results-title').scrollIntoView({behavior:'smooth',block:'start'});
  try{
    const res=await api('/api/maps?'+p,{headers:{Accept:'application/json'}});const data=await res.json().catch(()=>({}));
    if(!res.ok){const e=new Error(data.error||String(res.status));e.code=data.code||res.status;throw e}
    if(generation!==searchGeneration)return;
    state.rows=(data.places||[]).map(pl=>({name:pl.name,category:pl.category||'Estabelecimento',address:pl.address,city:pl.city,uf:pl.uf,phone:pl.phone,email:'',site:pl.site,rating:pl.rating,reviews:pl.reviews,situacao:pl.temporarilyClosed?'Fechado temporariamente':'',recordKey:'gmaps:'+pl.id,source:'Google Maps',sourceUrl:pl.mapsUrl}));
    state.mode='maps';state.mapsTokens[state.page+1]=data.nextPage||'';state.hasMore=Boolean(data.nextPage);show(state.rows);enrichSites(state.rows);
    if(!state.rows.length)setStatus('Nada encontrado no Google Maps','Tente outro termo (ex.: "dentista" em vez de "odontologia") ou uma região maior.');
  }catch(err){
    if(generation!==searchGeneration)return;state.rows=[];state.mode='';state.hasMore=false;show([]);
    setStatus(err.code==='maps_not_configured'?'Google Maps ainda não configurado':'Não foi possível buscar no Google Maps',err.code==='maps_not_configured'?'O administrador precisa cadastrar a chave GOOGLE_MAPS_API_KEY no Cloudflare.':err.message,'error');
  }finally{if(generation===searchGeneration)$('maps-btn').disabled=false}
}
$('maps-form').addEventListener('submit',e=>{e.preventDefault();searchGeneration++;state.page=0;state.mapsTokens=[''];searchMaps()});
function searchPage(){if(state.mode==='cnes')searchCnes();else if(state.mode==='company')searchCompany();else if(state.mode==='maps')searchMaps()}
$('prev-btn').addEventListener('click',()=>{if(state.page>0){state.page--;searchPage()}});
$('next-btn').addEventListener('click',()=>{if(state.hasMore){state.page++;searchPage()}});
function csvParse(text){const firstLine=text.split(/\r?\n/,1)[0];const sep=(firstLine.match(/;/g)||[]).length>(firstLine.match(/,/g)||[]).length?';':',';const out=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(ch===sep&&!quoted){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))out.push(row);row=[];cell=''}else cell+=ch}row.push(cell);if(row.some(v=>v.trim()))out.push(row);return out}
function importRows(raw){if(raw.length<2)throw Error('O arquivo precisa de cabeçalho e pelo menos uma linha.');const headers=raw[0].map(x=>normalize(x).replace(/[^a-z0-9]/g,''));const get=(row,names)=>{for(const n of names){const i=headers.indexOf(n);if(i>=0)return String(row[i]??'').trim()}return ''};if(!headers.includes('nome')&&!headers.includes('name'))throw Error('Inclua uma coluna chamada nome.');return raw.slice(1).map((row,index)=>({recordKey:'csv:'+index+':'+normalize(get(row,['nome','name','nomerazaosocial','razaosocial','nomefantasia'])).slice(0,90),name:get(row,['nome','name','nomerazaosocial','razaosocial','nomefantasia']),category:get(row,['categoria','category','profissao','segmento']),city:get(row,['cidade','municipio','city']),uf:get(row,['uf','estado']),phone:get(row,['telefone','phone','celular']),email:get(row,['email','correioeletronico']),site:get(row,['site','website','url']),source:get(row,['fonte','source'])||'CSV importado',sourceUrl:safeUrl(get(row,['urlfonte','linkfonte']))})).filter(r=>r.name)}
$('csv-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>10*1024*1024){$('import-count').textContent='Arquivo acima de 10 MB';return}try{const text=(await file.text()).replace(/^\uFEFF/,'');const rows=importRows(csvParse(text));state.imported=rows;$('import-count').textContent=rows.length+' contatos carregados';state.rows=rows;state.mode='csv';state.hasMore=false;state.page=0;show(rows);document.getElementById('results-title').scrollIntoView({behavior:'smooth'})}catch(err){$('import-count').textContent=err.message||'CSV inválido'}});
function csvCell(v){let value=String(v??'');if(/^[\s]*[=+\-@]/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"'}
$('export-btn').addEventListener('click',()=>{const rows=($('only-contact').checked?state.rows.filter(r=>r.phone||r.email):state.rows).filter(r=>!r.exclude&&(state.mode!=='company'||r.verified));const keys=['name','category','city','uf','phone','email','whatsapp','redes','socios','source','sourceUrl','site'];const labels=['nome','categoria','cidade','uf','telefone','email','whatsapp_site','redes_sociais','socios_decisores','fonte','url_fonte','site'];for(const r of rows){r.whatsapp=r.whatsappSite||'';r.redes=r.socials?Object.values(r.socials).filter(Boolean).join(' '):''}for(const r of rows)r.socios=Array.isArray(r.partners)?r.partners.filter(p=>p.decisor).concat(r.partners.filter(p=>!p.decisor)).slice(0,5).map(p=>titleCase(p.nome)+' ('+p.cargo+')').join(', '):'';const csv='\uFEFF'+[labels.join(';'),...rows.map(r=>keys.map(k=>csvCell(r[k])).join(';'))].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='prospectas-yuri-guimaraes-contatos.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});

(function(){const area=document.getElementById('wa-template');if(!area)return;area.value=waTemplate();const fb=document.getElementById('wa-template-status');
area.addEventListener('input',()=>{try{localStorage.setItem(WA_TEMPLATE_KEY,area.value.trim()||WA_TEMPLATE_DEFAULT);fb.textContent='Salvo neste navegador ✓'}catch{fb.textContent='Não foi possível salvar neste navegador'}});
document.getElementById('wa-template-reset').addEventListener('click',()=>{area.value=WA_TEMPLATE_DEFAULT;try{localStorage.removeItem(WA_TEMPLATE_KEY)}catch{}fb.textContent='Mensagem padrão restaurada';});
document.getElementById('wa-template-preview').textContent=fillTemplate(waTemplate(),{name:'Clínica Exemplo',city:'Porto Alegre',category:'Dentista'});
area.addEventListener('input',()=>{document.getElementById('wa-template-preview').textContent=fillTemplate(area.value||WA_TEMPLATE_DEFAULT,{name:'Clínica Exemplo',city:'Porto Alegre',category:'Dentista'})});})();
