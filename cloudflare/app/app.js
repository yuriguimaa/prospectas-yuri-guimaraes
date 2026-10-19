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
const state={rows:[],imported:[],page:0,mode:'',query:null,total:null,hasMore:false};
const contactCache=new Map();
const savedKeys=new Set();
let savedRows=[];
let contactPauseUntil=0;
let searchGeneration=0;
const categoryNames={saude:'Saúde',advocacia:'Advocacia',engenharia:'Engenharia',contabilidade:'Contabilidade',outra:'Outra'};
const cnaes={advocacia:'6911',engenharia:'7112',contabilidade:'6920'};
for(const uf of Object.keys(UFS).sort()){const o=document.createElement('option');o.value=uf;o.textContent=uf;$('uf').append(o)}
function normalize(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function first(o,keys){for(const k of keys){const v=o?.[k];if(v!==undefined&&v!==null&&String(v).trim())return String(v).trim()}return ''}
function setStatus(title,detail,kind='empty'){const s=$('status');s.className='status '+kind;s.replaceChildren();const icon=document.createElement('div');icon.className='status-icon';icon.textContent=kind==='error'?'!':'⌕';const strong=document.createElement('strong');strong.textContent=title;const span=document.createElement('span');span.textContent=detail;s.append(icon,strong,span);s.hidden=false}
function safeUrl(s){try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
function whatsappUrl(phone){let d=String(phone||'').replace(/\D/g,'');if(d.startsWith('0'))d=d.replace(/^0+/,'');if(d.length===10||d.length===11)d='55'+d;return /^55\d{10,11}$/.test(d)?'https://wa.me/'+d:''}
function addWhatsapp(parent,phone){const url=whatsappUrl(phone);if(!url)return;const a=document.createElement('a');a.className='whatsapp';a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='WhatsApp';a.title='Abrir conversa no WhatsApp';parent.append(a)}
function setLink(parent,text,href){const a=document.createElement('a');a.textContent=text;a.href=href;a.target='_blank';a.rel='noopener noreferrer';parent.append(a)}
async function loadSaved(){
  try{
    const res=await api('/api/leads',{headers:{Accept:'application/json'}});
    if(!res.ok)throw Error('Não foi possível carregar seus leads.');
    savedRows=await res.json();
    savedKeys.clear();for(const row of savedRows)savedKeys.add(row.record_key);
    renderSaved();if(state.mode)show(state.rows);
  }catch(error){$('saved-status').textContent=error.message||'Banco de dados indisponível.'}
}
function renderSaved(){
  const list=$('saved-list');list.replaceChildren();$('saved-count').textContent=String(savedRows.length);
  const term=normalize($('saved-search').value);
  const rows=term?savedRows.filter(r=>normalize([r.name,r.category,r.city,r.uf,r.phone,r.email].join(' ')).includes(term)):savedRows;
  $('saved-export').disabled=!rows.length;
  $('saved-status').textContent=!savedRows.length?'Você ainda não salvou nenhum lead.':!rows.length?'Nenhum lead salvo corresponde à busca.':'';
  for(const row of rows){
    const item=document.createElement('article');item.className='saved-item';
    const details=document.createElement('div');const name=document.createElement('strong');name.textContent=row.name;
    const info=document.createElement('small');info.textContent=[row.category,row.city,row.uf].filter(Boolean).join(' · ');
    const contact=document.createElement('small');
    if(row.phone)setLink(contact,'☎ '+row.phone,'tel:'+row.phone.replace(/[^\d+]/g,''));
    if(row.phone&&row.email)contact.append(' · ');
    if(row.email)setLink(contact,'✉ '+row.email,'mailto:'+row.email);
    if(row.created_at){const d=new Date(row.created_at);if(!isNaN(d)){const span=document.createElement('span');span.className='saved-date';span.textContent=(contact.childNodes.length?' · ':'')+'salvo em '+d.toLocaleDateString('pt-BR');contact.append(span)}}
    details.append(name,info,contact);
    const actions=document.createElement('div');actions.className='saved-actions';addWhatsapp(actions,row.phone);
    const remove=document.createElement('button');remove.type='button';remove.className='save-lead';remove.textContent='Remover';
    remove.addEventListener('click',()=>removeSaved(row.record_key,remove));actions.append(remove);
    item.append(details,actions);list.append(item);
  }
}
$('saved-search').addEventListener('input',renderSaved);
$('saved-export').addEventListener('click',()=>{const term=normalize($('saved-search').value);const rows=term?savedRows.filter(r=>normalize([r.name,r.category,r.city,r.uf,r.phone,r.email].join(' ')).includes(term)):savedRows;const keys=['name','category','city','uf','phone','email','site','source','source_url','created_at'];const labels=['nome','categoria','cidade','uf','telefone','email','site','fonte','url_fonte','salvo_em'];const csv='\uFEFF'+[labels.join(';'),...rows.map(r=>keys.map(k=>csvCell(k==='created_at'&&r[k]?new Date(r[k]).toLocaleDateString('pt-BR'):r[k])).join(';'))].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='prospectas-meus-leads.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
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
    if(r.cnpj){
      const badge=document.createElement('span');badge.className='lead-verification';
      badge.textContent=r.verified?(r.categoryVerified?'Cadastro confirmado':'Cadastro ativo · atividade por texto'):r.contactPending?'Conferindo cadastro…':'Cadastro a conferir';
      title.append(badge);
    }
    const place=document.createElement('div');place.className='lead-place';place.textContent=[r.city,r.uf].filter(Boolean).join(' · ')||'Localidade não informada';
    const meta=document.createElement('div');meta.className='lead-meta';
    const phone=document.createElement('span');
    if(r.phone){setLink(phone,'☎ '+r.phone,'tel:'+r.phone.replace(/[^\d+]/g,''))}
    else{phone.className='missing';phone.textContent='Telefone não informado'}
    const email=document.createElement('span');
    if(r.email){setLink(email,'✉ '+r.email,'mailto:'+r.email)}
    else{email.className='missing';email.textContent='E-mail não informado'}
    meta.append(phone,email);
    if(r.phone)addWhatsapp(meta,r.phone);
    if(r.site&&safeUrl(r.site)){const site=document.createElement('span');setLink(site,'↗ Site',safeUrl(r.site));meta.append(site)}
    if(r.cnpj&&(!r.contactChecked||!r.phone||!r.email)){
      const btn=document.createElement('button');btn.type='button';btn.className='contact-fetch';
      btn.textContent=r.contactPending?'Conferindo cadastro…':r.contactChecked?'Sem outros contatos cadastrados':r.contactError||'Conferir cadastro e contatos';
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
    const source=document.createElement('div');source.className='lead-source';
    if(r.sourceUrl){setLink(source,'Fonte: '+r.source,r.sourceUrl)}else source.textContent='Fonte: '+r.source;
    card.append(main,source);list.append(card);
  }
  if(filtered.length){$('status').hidden=true}
  else setStatus(state.mode==='company'&&excluded?'Nenhuma empresa confirmada nesta página':'Nenhum contato nesta página',pending?'Aguarde a conferência dos cadastros.':'Ajuste os filtros ou avance para a próxima página.');
  $('page-label').textContent='Página '+(state.page+1);
  $('prev-btn').disabled=!['cnes','company'].includes(state.mode)||state.page===0;
  $('next-btn').disabled=!['cnes','company'].includes(state.mode)||!state.hasMore;
}
function mapCnes(o){const code=first(o,['codigo_cnes','co_cnes','cnes']);const ufCode=first(o,['codigo_uf']);const uf=first(o,['uf','sigla_uf','estado'])||Object.keys(UFS).find(k=>String(UFS[k])===ufCode)||'';const rawPhone=first(o,['numero_telefone_estabelecimento','numero_telefone','telefone','estabelecimento_telefone','nu_telefone','ddd_telefone']);const rawEmail=first(o,['endereco_email_estabelecimento','endereco_email','email','estabelecimento_email','ds_email']);return {name:first(o,['nome_fantasia','estabelecimento_nome_fantasia','nome_razao_social','razao_social','no_fantasia','nome'])||('Estabelecimento CNES '+code),category:'Saúde',city:first(o,['municipio','nome_municipio','no_municipio','municipio_nome'])||('Município IBGE '+first(o,['codigo_municipio'])),uf,phone:rawPhone.replace(/\D/g,'').length>=8?rawPhone:'',email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)?rawEmail:'',site:'',recordKey:code?'cnes:'+code:'',source:'CNES · Ministério da Saúde',sourceUrl:code?'https://cnes.datasus.gov.br/pages/estabelecimentos/consulta.jsp':'https://apidadosabertos.saude.gov.br/'}}
function extractRows(data){if(Array.isArray(data))return data;for(const k of ['estabelecimentos','resultados','dados','data','results','items','content'])if(Array.isArray(data?.[k]))return data[k];return []}
async function searchCnes(){const generation=++searchGeneration;const uf=$('uf').value;const p=new URLSearchParams({limit:'20',offset:String(state.page*20)});if(uf)p.set('uf',uf);const url='/api/cnes?'+p;setStatus('Consultando o CNES','Aguarde a resposta da base pública.','loading');$('search-btn').disabled=true;try{const res=await api(url,{headers:{Accept:'application/json'}});if(!res.ok)throw new Error('A fonte respondeu com o código '+res.status);const data=await res.json();if(generation!==searchGeneration)return;state.rows=extractRows(data).map(mapCnes);state.mode='cnes';state.hasMore=state.rows.length===20;show(state.rows)}catch(err){if(generation!==searchGeneration)return;state.rows=[];state.mode='';state.hasMore=false;show([]);setStatus('Não foi possível consultar o CNES','A fonte pública pode estar indisponível. Tente novamente mais tarde ou importe um CSV.','error')}finally{if(generation===searchGeneration)$('search-btn').disabled=false}}
function mapCompany(o){const address=o.endereco&&typeof o.endereco==='object'?o.endereco:{};const cnpj=first(o,['cnpj','CNPJ']).replace(/\D/g,'');const phone=first(o,['telefone','telefone1','telefone_1','telefone_principal','ddd_telefone_1','ddd_telefone_2'])||first(address,['telefone']);const email=first(o,['email','correio_eletronico','email_principal'])||first(address,['email']);return {name:first(o,['nome_fantasia','razao_social','nome','nome_empresarial'])||('Empresa '+cnpj),category:categoryNames[$('category').value]||'Empresa',city:first(o,['municipio','cidade','nome_municipio'])||first(address,['municipio','cidade']),uf:first(o,['uf','estado'])||first(address,['uf','estado']),phone:phone.replace(/\D/g,'').length>=8?phone:'',email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'',site:safeUrl(first(o,['site','website','url_site'])),cnpj,recordKey:cnpj?'cnpj:'+cnpj:'',contactChecked:false,source:'SINTEGRA Brasil · cadastro empresarial',sourceUrl:cnpj.length===14?'https://www.sintegrabrasil.com.br/cnpj/'+cnpj:'https://www.sintegrabrasil.com.br/api'}}
async function searchCompany(){const generation=++searchGeneration;const key=$('api-key').value.trim();if(!key){state.rows=[];state.mode='';state.hasMore=false;show([]);setStatus('Informe sua chave gratuita','Crie a chave no link acima, cole neste campo e faça a busca.','empty');$('api-key').focus();return}const category=$('category').value;let cnae=category==='outra'?$('cnae').value.trim():cnaes[category];if(/^\d{4}[\d./-]+$/.test(cnae))cnae=cnae.slice(0,4);if(!cnae){state.rows=[];state.mode='';state.hasMore=false;show([]);setStatus('Informe uma atividade','Digite uma atividade ou código CNAE para buscar outras categorias.');$('cnae').focus();return}const query={cnae,uf:$('uf').value,city:$('term').value.trim(),category:categoryNames[category]||'Empresa'};const p=new URLSearchParams({cnae,limit:'20',offset:String(state.page*20)});if(query.uf)p.set('uf',query.uf);if(query.city)p.set('municipio',query.city);setStatus('Buscando empresas','Consultando a base gratuita por atividade e região.','loading');$('search-btn').disabled=true;try{const res=await api('/api/empresas?'+p,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({apiKey:key})});if(!res.ok)throw new Error(String(res.status));const data=await res.json();if(generation!==searchGeneration)return;const raw=extractRows(data);state.rows=[...new Map(raw.map(mapCompany).filter(r=>r.cnpj.length===14).map(r=>[r.cnpj,r])).values()];for(const r of state.rows){r.phone='';r.email='';r.category=query.category;r.query=query;const cached=contactCache.get(r.cnpj);if(cached)applyCompanyVerification(r,cached)}state.mode='company';state.hasMore=Boolean(data.hasMore??data.has_more??(raw.length===20));show(state.rows);if(state.rows.length)enrichAllRows(state.rows);if(!state.rows.length)setStatus('Nenhuma empresa encontrada','Tente outra cidade, estado ou atividade. A cobertura depende da fonte.')}catch(err){if(generation!==searchGeneration)return;state.rows=[];state.mode='';state.hasMore=false;show([]);const code=err.message;setStatus(code==='401'?'Chave não aceita':code==='429'?'Limite gratuito atingido':'Não foi possível buscar empresas',code==='401'?'Confira a chave criada no painel da API SINTEGRA Brasil.':code==='429'?'Aguarde a liberação de novas consultas no painel da API.':'Confira sua conexão e tente novamente. A fonte pode estar indisponível.','error')}finally{if(generation===searchGeneration)$('search-btn').disabled=false}}
function applyCompanyVerification(r,data){
  const q=r.query;
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
    r.phone=data.phone||'';
    r.email=data.email||'';
    r.source='SINTEGRA Brasil + OpenCNPJ';
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
    else r.contactError='Contato indisponível: tentar de novo';
    return false;
  }finally{r.contactPending=false;if(state.rows.includes(r))show(state.rows)}
}
async function enrichAllRows(rows){let next=0;async function worker(){while(state.rows===rows&&next<rows.length&&Date.now()>=contactPauseUntil){const r=rows[next++];if(r.cnpj&&!r.contactChecked)await loadContact(r)}}await Promise.all([worker(),worker(),worker()])}
function filterImported(){const cat=$('category').value;const uf=$('uf').value;const term=normalize($('term').value);return state.imported.filter(r=>{const c=normalize(r.category);const matchCategory=cat==='outra'?!['saude','medico','medicina','clinica','advocacia','advogado','engenharia','engenheiro','contabilidade','contador'].some(w=>c.includes(w)):cat==='saude'?['saude','medico','medicina','clinica'].some(w=>c.includes(w)):cat==='advocacia'?['advocacia','advogado'].some(w=>c.includes(w)):cat==='engenharia'?['engenharia','engenheiro'].some(w=>c.includes(w)):['contabilidade','contador'].some(w=>c.includes(w));return matchCategory&&(!uf||normalize(r.uf)===normalize(uf))&&(!term||normalize(r.name+' '+r.city).includes(term))})}
function search(){searchGeneration++;state.page=0;if($('category').value==='saude'){searchCnes();return}if($('api-key').value.trim()){searchCompany();return}if(!state.imported.length){searchCompany();return}state.rows=filterImported();state.mode='csv';state.hasMore=false;show(state.rows);if(!state.rows.length)setStatus('Nenhum contato encontrado','Confira categoria, estado e cidade na planilha importada.')}
$('search-form').addEventListener('submit',e=>{e.preventDefault();search()});
function updateCategory(){const category=$('category').value;const health=category==='saude';$('api-setup').hidden=health;$('company-contact-note').hidden=health;$('custom-cnae').hidden=category!=='outra';$('source-hint').textContent=health?'Busca ao vivo na base pública CNES para estabelecimentos de saúde.':'Busca empresas por atividade CNAE; não confirma registro profissional individual.';$('source-name').textContent=health?'CNES • Ministério da Saúde':'SINTEGRA Brasil • empresas';$('term').disabled=health;$('term').placeholder=health?'Disponível para outras categorias':'Ex.: Campinas'}
$('category').addEventListener('change',updateCategory);updateCategory();
$('only-contact').addEventListener('change',()=>show(state.rows));
function searchPage(){if(state.mode==='cnes')searchCnes();else if(state.mode==='company')searchCompany()}
$('prev-btn').addEventListener('click',()=>{if(state.page>0){state.page--;searchPage()}});
$('next-btn').addEventListener('click',()=>{if(state.hasMore){state.page++;searchPage()}});
function csvParse(text){const firstLine=text.split(/\r?\n/,1)[0];const sep=(firstLine.match(/;/g)||[]).length>(firstLine.match(/,/g)||[]).length?';':',';const out=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(ch===sep&&!quoted){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))out.push(row);row=[];cell=''}else cell+=ch}row.push(cell);if(row.some(v=>v.trim()))out.push(row);return out}
function importRows(raw){if(raw.length<2)throw Error('O arquivo precisa de cabeçalho e pelo menos uma linha.');const headers=raw[0].map(x=>normalize(x).replace(/[^a-z0-9]/g,''));const get=(row,names)=>{for(const n of names){const i=headers.indexOf(n);if(i>=0)return String(row[i]??'').trim()}return ''};if(!headers.includes('nome')&&!headers.includes('name'))throw Error('Inclua uma coluna chamada nome.');return raw.slice(1).map((row,index)=>({recordKey:'csv:'+index+':'+normalize(get(row,['nome','name','nomerazaosocial','razaosocial','nomefantasia'])).slice(0,90),name:get(row,['nome','name','nomerazaosocial','razaosocial','nomefantasia']),category:get(row,['categoria','category','profissao','segmento']),city:get(row,['cidade','municipio','city']),uf:get(row,['uf','estado']),phone:get(row,['telefone','phone','celular']),email:get(row,['email','correioeletronico']),site:get(row,['site','website','url']),source:get(row,['fonte','source'])||'CSV importado',sourceUrl:safeUrl(get(row,['urlfonte','linkfonte']))})).filter(r=>r.name)}
$('csv-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>10*1024*1024){$('import-count').textContent='Arquivo acima de 10 MB';return}try{const text=(await file.text()).replace(/^\uFEFF/,'');const rows=importRows(csvParse(text));state.imported=rows;$('import-count').textContent=rows.length+' contatos carregados';state.rows=rows;state.mode='csv';state.hasMore=false;state.page=0;show(rows);document.getElementById('results-title').scrollIntoView({behavior:'smooth'})}catch(err){$('import-count').textContent=err.message||'CSV inválido'}});
function csvCell(v){let value=String(v??'');if(/^[\s]*[=+\-@]/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"'}
$('export-btn').addEventListener('click',()=>{const rows=($('only-contact').checked?state.rows.filter(r=>r.phone||r.email):state.rows).filter(r=>!r.exclude&&(state.mode!=='company'||r.verified));const keys=['name','category','city','uf','phone','email','source','sourceUrl','site'];const labels=['nome','categoria','cidade','uf','telefone','email','fonte','url_fonte','site'];const csv='\uFEFF'+[labels.join(';'),...rows.map(r=>keys.map(k=>csvCell(r[k])).join(';'))].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='prospectas-yuri-guimaraes-contatos.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
