// Assets are embedded by scripts/build.mjs so this Worker runs without a database or paid service.
const assets = __ASSETS__;
const ufCodes = {AC:12,AL:27,AP:16,AM:13,BA:29,CE:23,DF:53,ES:32,GO:52,MA:21,MT:51,MS:50,MG:31,PA:15,PB:25,PR:41,PE:26,PI:22,RJ:33,RN:24,RS:43,RO:11,RR:14,SC:42,SP:35,SE:28,TO:17};
const response = (body,type,status=200,extra={}) => new Response(body,{status,headers:{'content-type':type,'x-content-type-options':'nosniff',...extra}});
const json = (body,status=200) => response(JSON.stringify(body),'application/json; charset=utf-8',status,{'cache-control':'no-store'});
const publicAppOrigin='https://prospectas-yuri-guimaraes.yuryguimaa.workers.dev';
function corsHeaders(request){
  const origin=request.headers.get('origin');
  if(origin===publicAppOrigin)return {'access-control-allow-origin':origin,'access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'GET, POST, PATCH, DELETE, OPTIONS','vary':'Origin'};
  return {};
}
function cors(request,res){
  const headers=new Headers(res.headers);for(const [key,value] of Object.entries(corsHeaders(request)))headers.set(key,value);
  return new Response(res.body,{status:res.status,headers});
}
function sameOrigin(request){
  const origin=request.headers.get('origin');
  return !origin||origin===new URL(request.url).origin||origin===publicAppOrigin;
}
const LEAD_STATUSES=['novo','contatado','negociando','fechado','perdido'];
function clean(value,max){return typeof value==='string'?value.trim().slice(0,max):''}
function safeHttp(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:''}catch{return ''}}
async function savedLeads(request,env,user,url){
  if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)return json({error:'Banco de dados ainda não configurado'},503);
  if(!['GET','POST','PATCH','DELETE'].includes(request.method))return json({error:'Método inválido'},405);
  if(request.method!=='GET'&&!sameOrigin(request))return json({error:'Origem inválida'},403);
  const base=String(env.SUPABASE_URL).replace(/\/$/,'')+'/rest/v1/saved_leads';
  const headers={'apikey':String(env.SUPABASE_SECRET_KEY).trim(),'Accept':'application/json','User-Agent':'ProspectasYuriGuimaraes/1.0 (server)'};
  let target=base,body;
  const baseSelect='record_key,name,category,city,uf,phone,email,source,source_url,site,created_at';
  if(request.method==='GET'){
    const query=sel=>base+'?select='+sel+'&owner_id=eq.'+encodeURIComponent(user.id)+'&order=created_at.desc&limit=1000';
    try{
      let upstream=await fetch(query(baseSelect+',status,notes,updated_at'),{headers,signal:AbortSignal.timeout(12000)});
      let pipeline='1';
      if(!upstream.ok){
        const detail=await upstream.text();
        // Colunas de etapa ainda não criadas (supabase/pipeline.sql): devolve a lista sem elas.
        if(!/42703|status|notes|updated_at/.test(detail))return json({error:'Não foi possível acessar os leads salvos',upstreamStatus:upstream.status},502);
        upstream=await fetch(query(baseSelect),{headers,signal:AbortSignal.timeout(12000)});pipeline='0';
        if(!upstream.ok)return json({error:'Não foi possível acessar os leads salvos',upstreamStatus:upstream.status},502);
      }
      return response(await upstream.text(),'application/json; charset=utf-8',200,{'cache-control':'no-store','x-pipeline-ready':pipeline,'access-control-expose-headers':'x-pipeline-ready'});
    }catch{return json({error:'Banco de dados indisponível'},502)}
  }
  if(request.method==='PATCH'){
    let data;
    try{data=await request.json()}catch{return json({error:'Dados inválidos'},400)}
    const recordKey=clean(data.recordKey,150);
    if(!recordKey)return json({error:'Lead inválido'},400);
    const patch={updated_at:new Date().toISOString()};
    if(data.status!==undefined){if(!LEAD_STATUSES.includes(data.status))return json({error:'Etapa inválida'},400);patch.status=data.status}
    if(data.notes!==undefined)patch.notes=clean(data.notes,2000);
    if(Object.keys(patch).length<2)return json({error:'Nada para atualizar'},400);
    target+='?owner_id=eq.'+encodeURIComponent(user.id)+'&record_key=eq.'+encodeURIComponent(recordKey);
    headers['content-type']='application/json';headers.Prefer='return=minimal';body=JSON.stringify(patch);
  }
  if(request.method==='POST'){
    let data;
    try{data=await request.json()}catch{return json({error:'Dados inválidos'},400)}
    const recordKey=clean(data.recordKey,150),name=clean(data.name,250);
    if(!recordKey||!name)return json({error:'Lead inválido'},400);
    target+='?on_conflict=owner_id,record_key';
    headers['content-type']='application/json';headers.Prefer='resolution=merge-duplicates,return=representation';
    body=JSON.stringify({owner_id:user.id,record_key:recordKey,name,category:clean(data.category,100),city:clean(data.city,100),uf:clean(data.uf,2),phone:clean(data.phone,40),email:clean(data.email,150),source:clean(data.source,150),source_url:safeHttp(data.sourceUrl),site:safeHttp(data.site)});
  }
  if(request.method==='DELETE'){
    const recordKey=clean(url.searchParams.get('recordKey'),150);
    if(!recordKey)return json({error:'Lead inválido'},400);
    target+='?owner_id=eq.'+encodeURIComponent(user.id)+'&record_key=eq.'+encodeURIComponent(recordKey);
    headers.Prefer='return=minimal';
  }
  try{
    const upstream=await fetch(target,{method:request.method,headers,body,signal:AbortSignal.timeout(12000)});
    if(!upstream.ok){
      const detail=(await upstream.text()).slice(0,500);
      const reason=/browser/i.test(detail)?'browser_block':/invalid api key/i.test(detail)?'invalid_key':/permission|privilege|forbidden/i.test(detail)?'access_denied':'upstream_error';
      return json({error:'Não foi possível acessar os leads salvos',upstreamStatus:upstream.status,reason},502);
    }
    return ['DELETE','PATCH'].includes(request.method)?json({ok:true}):response(await upstream.text(),'application/json; charset=utf-8',200,{'cache-control':'no-store'});
  }catch{return json({error:'Banco de dados indisponível'},502)}
}
async function supabaseUser(request,env){
  const token=request.headers.get('authorization')||'';
  if(!token.startsWith('Bearer ')||!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)return null;
  try{
    const upstream=await fetch(String(env.SUPABASE_URL).replace(/\/$/,'')+'/auth/v1/user',{headers:{apikey:String(env.SUPABASE_SECRET_KEY).trim(),authorization:token},signal:AbortSignal.timeout(9000)});
    if(!upstream.ok)return null;
    const data=await upstream.json();
    return data?.id&&data?.email?{id:String(data.id),email:String(data.email)}:null;
  }catch{return null}
}
async function auth(request,env,url){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
  if(request.method!=='POST')return cors(request,json({error:'Método inválido'},405));
  if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)return cors(request,json({error:'Cadastro temporariamente indisponível'},503));
  let data;try{data=await request.json()}catch{return cors(request,json({error:'Dados inválidos'},400))}
  if(url.pathname.endsWith('/refresh')){
    const refreshToken=clean(data.refresh_token,500);
    if(!refreshToken)return cors(request,json({error:'Sessão expirada'},400));
    try{
      const upstream=await fetch(String(env.SUPABASE_URL).replace(/\/$/,'')+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:String(env.SUPABASE_SECRET_KEY).trim(),'content-type':'application/json'},body:JSON.stringify({refresh_token:refreshToken}),signal:AbortSignal.timeout(12000)});
      return cors(request,response(await upstream.text(),'application/json; charset=utf-8',upstream.status,{'cache-control':'no-store'}));
    }catch{return cors(request,json({error:'Não foi possível renovar a sessão'},502))}
  }
  const email=clean(data.email,180).toLowerCase(),password=String(data.password||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8)return cors(request,json({error:'Use um e-mail válido e uma senha de pelo menos 8 caracteres.'},400));
  const base=String(env.SUPABASE_URL).replace(/\/$/,'')+'/auth/v1';
  const endpoint=url.pathname.endsWith('/signup')?'/signup':'/token?grant_type=password';
  const body=endpoint==='/signup'?{email,password,options:{emailRedirectTo:new URL(request.url).origin+'/app/'}}:{email,password};
  try{
    const upstream=await fetch(base+endpoint,{method:'POST',headers:{apikey:String(env.SUPABASE_SECRET_KEY).trim(),'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    return cors(request,response(await upstream.text(),'application/json; charset=utf-8',upstream.status,{'cache-control':'no-store'}));
  }catch{return cors(request,json({error:'Não foi possível concluir o acesso. Tente novamente.'},502))}
}
async function fetchReliable(url,options){
  for(let attempt=0;attempt<2;attempt++){
    try{
      const upstream=await fetch(url,{...options,signal:AbortSignal.timeout(12000)});
      if(attempt===0&&[502,503,504].includes(upstream.status))continue;
      return upstream;
    }catch(error){if(attempt===1)throw error}
  }
}

// ---------- Robustez: cache, limite de uso e consulta de CNPJ com várias fontes ----------
const memoryCache=new Map();
async function cached(key,ttlSeconds,producer){
  const now=Date.now();
  const hit=memoryCache.get(key);
  if(hit&&hit.expires>now)return hit.value;
  const cacheApi=typeof caches!=='undefined'&&caches.default?caches.default:null;
  const cacheKey=new Request('https://cache.prospectas.internal/'+encodeURIComponent(key));
  if(cacheApi){try{const res=await cacheApi.match(cacheKey);if(res){const value=await res.json();memoryCache.set(key,{value,expires:now+Math.min(ttlSeconds,300)*1000});return value}}catch{}}
  let value=null;
  try{value=await producer()}catch{value=null}
  if(value!==null&&value!==undefined){
    memoryCache.set(key,{value,expires:now+Math.min(ttlSeconds,300)*1000});
    if(memoryCache.size>500)memoryCache.delete(memoryCache.keys().next().value);
    if(cacheApi){try{await cacheApi.put(cacheKey,new Response(JSON.stringify(value),{headers:{'content-type':'application/json','cache-control':'public, max-age='+ttlSeconds}}))}catch{}}
  }
  return value;
}
const usage=new Map();
function rateLimit(userId,bucket,perMinute){
  const key=userId+':'+bucket,now=Date.now();
  const entry=usage.get(key);
  if(!entry||now-entry.start>60000){usage.set(key,{start:now,count:1});if(usage.size>2000)usage.delete(usage.keys().next().value);return null}
  entry.count++;
  if(entry.count>perMinute)return json({error:'Muitas consultas em pouco tempo. Aguarde um minuto.'},429);
  return null;
}
function validCnpj(value){
  const c=String(value||'').replace(/\D/g,'');
  if(!/^\d{14}$/.test(c)||/^(\d)\1{13}$/.test(c))return false;
  const calc=len=>{let sum=0,pos=len-7;for(let i=len;i>=1;i--){sum+=Number(c[len-i])*pos--;if(pos<2)pos=9}const r=sum%11;return r<2?0:11-r};
  return calc(12)===Number(c[12])&&calc(13)===Number(c[13]);
}
function digits(v){return String(v??'').replace(/\D/g,'')}
function phoneOk(v){const d=digits(v);return /^\d{10,11}$/.test(d)?d:''}
function emailOk(v){const e=String(v??'').trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:''}
function cnaeCode(v){const d=digits(v);return d?d.padStart(7,'0'):''}
function companyFromOpenCnpj(raw,cnpj){
  const d=raw&&raw.success===true&&raw.data&&typeof raw.data==='object'?raw.data:null;
  if(!d||digits(d.cnpj)!==cnpj)return null;
  return {name:d.nomeFantasia||d.razaoSocial,razaoSocial:d.razaoSocial,city:d.municipio,uf:d.uf,status:d.situacaoCadastral,
    cnaes:Array.isArray(d.cnaes)?d.cnaes.map(i=>cnaeCode(i.cnae)):[],phones:[d.telefone,d.telefone2].map(phoneOk),email:emailOk(d.email),source:'OpenCNPJ'};
}
function companyFromBrasilApi(d,cnpj){
  if(!d||digits(d.cnpj)!==cnpj)return null;
  return {name:d.nome_fantasia||d.razao_social,razaoSocial:d.razao_social,city:d.municipio,uf:d.uf,status:d.descricao_situacao_cadastral,
    cnaes:[cnaeCode(d.cnae_fiscal),...(d.cnaes_secundarios||[]).map(i=>cnaeCode(i.codigo))],mainActivity:d.cnae_fiscal_descricao,
    phones:[d.ddd_telefone_1,d.ddd_telefone_2].map(phoneOk),email:emailOk(d.email),
    address:[[d.descricao_tipo_de_logradouro,d.logradouro].filter(Boolean).join(' '),d.numero,d.bairro].filter(Boolean).join(', '),cep:digits(d.cep),
    porte:d.porte,opened:d.data_inicio_atividade,partners:partnersFromApi(d.qsa),source:'BrasilAPI'};
}
function companyFromCnpjWs(d,cnpj){
  const e=d&&d.estabelecimento;
  if(!e||digits(e.cnpj)!==cnpj)return null;
  return {name:e.nome_fantasia||d.razao_social,razaoSocial:d.razao_social,city:e.cidade&&e.cidade.nome,uf:e.estado&&e.estado.sigla,status:e.situacao_cadastral,
    cnaes:[cnaeCode(e.atividade_principal&&e.atividade_principal.id),...(e.atividades_secundarias||[]).map(i=>cnaeCode(i.id))],mainActivity:e.atividade_principal&&e.atividade_principal.descricao,
    phones:[phoneOk((e.ddd1||'')+(e.telefone1||'')),phoneOk((e.ddd2||'')+(e.telefone2||''))],email:emailOk(e.email),
    address:[[e.tipo_logradouro,e.logradouro].filter(Boolean).join(' '),e.numero,e.bairro].filter(Boolean).join(', '),cep:digits(e.cep),
    porte:d.porte&&d.porte.descricao,opened:e.data_inicio_atividade,partners:partnersFromApi(d.socios),source:'CNPJ.ws'};
}
const companySources=[
  {name:'OpenCNPJ',url:c=>'https://kitana.opencnpj.com/cnpj/'+c,parse:companyFromOpenCnpj},
  {name:'BrasilAPI',url:c=>'https://brasilapi.com.br/api/cnpj/v1/'+c,parse:companyFromBrasilApi},
  {name:'CNPJ.ws',url:c=>'https://publica.cnpj.ws/cnpj/'+c,parse:companyFromCnpjWs}
];
const sourcePause={};
async function lookupCompany(cnpj,env){
  const datasetPartners=await partnersFromDataset(env,cnpj);
  const hit=await cached('cnpj2:'+cnpj,86400*7,async()=>null);
  if(hit)return {data:datasetPartners&&datasetPartners.length?{...hit,partners:datasetPartners,partnersSource:'Receita Federal (Dados Abertos CNPJ)'}:hit};
  const merged={cnpj,phones:[],cnaes:[],sources:[]};
  let anyFound=false,notFound=0,limited=0;
  for(const src of companySources){
    const complete=merged.phones.length>=1&&merged.email&&merged.status;
    if(complete)break;
    if((sourcePause[src.name]||0)>Date.now()){limited++;continue}
    try{
      const res=await fetchReliable(src.url(cnpj),{headers:{accept:'application/json','user-agent':'ProspectasYuriGuimaraes/1.0'}});
      if(res.status===429){sourcePause[src.name]=Date.now()+60000;limited++;continue}
      if(res.status===404){notFound++;continue}
      if(!res.ok)continue;
      const company=src.parse(await res.json(),cnpj);
      if(!company)continue;
      anyFound=true;merged.sources.push(company.source);
      for(const [k,v] of Object.entries(company)){
        if(k==='phones'){for(const ph of v)if(ph&&!merged.phones.includes(ph))merged.phones.push(ph)}
        else if(k==='cnaes'){for(const c of v)if(c&&!merged.cnaes.includes(c))merged.cnaes.push(c)}
        else if(k==='partners'){if(!merged.apiPartners&&v&&v.length)merged.apiPartners=v}
        else if(k!=='source'&&v&&!merged[k])merged[k]=String(v).trim();
      }
    }catch{}
  }
  if(!anyFound){
    if(notFound===companySources.length)return {error:'CNPJ não encontrado',status:404};
    if(limited)return {error:'Limite temporário das fontes de contatos',status:429};
    return {error:'Contato indisponível',status:502};
  }
  const data={cnpj,name:merged.name||merged.razaoSocial||'',razaoSocial:merged.razaoSocial||'',city:merged.city||'',uf:String(merged.uf||'').toUpperCase(),
    status:merged.status||'',cnaes:merged.cnaes,mainActivity:merged.mainActivity||'',phone:merged.phones[0]||'',phones:merged.phones,email:merged.email||'',
    address:merged.address||'',cep:merged.cep||'',porte:merged.porte||'',opened:merged.opened||'',
    source:merged.sources.join(' + ')+' · cadastro empresarial',sourceUrl:'https://brasilapi.com.br/docs#tag/CNPJ',
    partners:merged.apiPartners||[],partnersSource:merged.apiPartners?'Cadastro público (API)':''};
  await cached('cnpj2:'+cnpj,86400*7,async()=>data);
  if(datasetPartners&&datasetPartners.length)return {data:{...data,partners:datasetPartners,partnersSource:'Receita Federal (Dados Abertos CNPJ)'}};
  return {data};
}
async function municipalities(uf){
  return cached('ibge:'+uf,86400*30,async()=>{
    const res=await fetchReliable('https://servicodados.ibge.gov.br/api/v1/localidades/estados/'+uf+'/municipios',{headers:{accept:'application/json'}});
    if(!res.ok)return null;
    const list=await res.json();
    return Array.isArray(list)?list.map(m=>({id:m.id,nome:m.nome})):null;
  });
}

// ---------- Sócios (Dados Abertos CNPJ da Receita Federal, arquivos em data/assets/socios) ----------
const QUALIFICACOES={'05':'Administrador','08':'Conselheiro de Administração','10':'Diretor','16':'Presidente','17':'Procurador','18':'Secretário','20':'Sociedade consorciada','21':'Sociedade filiada','22':'Sócio','23':'Sócio capitalista','24':'Sócio comanditado','25':'Sócio comanditário','26':'Sócio de indústria','28':'Sócio-gerente','31':'Sócio ostensivo','33':'Tesoureiro','37':'Sócio PJ no exterior','38':'Sócio PF no exterior','47':'Sócio PF','48':'Sócio PJ','49':'Sócio-administrador','52':'Sócio com capital','53':'Sócio sem capital','54':'Fundador','55':'Sócio comanditado no exterior','56':'Sócio comanditário PF no exterior','57':'Sócio comanditário PJ no exterior','59':'Produtor rural','63':'Cotas em tesouraria','65':'Titular (PF)','66':'Titular (PF no exterior)','70':'Administrador no exterior','71':'Conselheiro no exterior','72':'Diretor no exterior','73':'Presidente no exterior','74':'Sócio-administrador no exterior','75':'Fundador no exterior','78':'Titular (PJ)','79':'Titular (PJ no exterior)'};
const DECISORES=new Set(['05','10','16','28','49','65','70','72','73','74','78']);
const shardCache=new Map();
async function partnersShard(env,prefix){
  if(shardCache.has(prefix)){const v=shardCache.get(prefix);shardCache.delete(prefix);shardCache.set(prefix,v);return v}
  if(!env||!env.ASSETS)return null;
  const res=await env.ASSETS.fetch(new Request('https://assets.local/socios/'+prefix+'.bin'));
  if(res.status===404){shardCache.set(prefix,'');return ''}
  if(!res.ok)return null;
  const text=await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
  shardCache.set(prefix,text);
  while(shardCache.size>24)shardCache.delete(shardCache.keys().next().value);
  return text;
}
async function partnersFromDataset(env,cnpj){
  const basico=String(cnpj).slice(0,8);
  if(!/^\d{8}$/.test(basico))return null;
  let text;
  try{text=await partnersShard(env,basico.slice(0,4))}catch{return null}
  if(text===null)return null;
  const key='\n'+basico.slice(4)+'\t';
  const i=text.indexOf(key);
  if(i<0)return [];
  const end=text.indexOf('\n',i+key.length);
  return text.slice(i+key.length,end<0?undefined:end).split(';').filter(Boolean).map(item=>{
    const [nome,qual,data,tipo]=item.split('|');
    return {nome,cargo:QUALIFICACOES[qual]||'Sócio',decisor:DECISORES.has(qual),desde:/^\d{8}$/.test(data||'')?data.slice(0,4)+'-'+data.slice(4,6)+'-'+data.slice(6,8):'',tipo:tipo==='1'?'PJ':tipo==='3'?'Estrangeiro':'PF'};
  });
}
function partnersFromApi(list){
  return (Array.isArray(list)?list:[]).slice(0,30).map(p=>{
    const nome=String(p.nome_socio||p.nome||'').trim();
    const cargo=String(p.qualificacao_socio&&typeof p.qualificacao_socio==='object'?p.qualificacao_socio.descricao:p.qualificacao_socio||'Sócio').trim();
    const qualCode=String(p.codigo_qualificacao_socio||(p.qualificacao_socio&&p.qualificacao_socio.id)||'').padStart(2,'0');
    if(!nome||['29','30','67','68'].includes(qualCode)||/menor|incapaz/i.test(cargo))return null;
    return {nome,cargo,decisor:DECISORES.has(qualCode)||/administrador|diretor|presidente|titular|gerente/i.test(cargo),desde:String(p.data_entrada_sociedade||p.data_entrada||'').slice(0,10),tipo:'PF'};
  }).filter(Boolean);
}

// Google Maps via treg (crawl4ai.google.serp.maps): sem conta no Google, cobrado do saldo do treg.
// Uma chamada traz até 60 lugares (preço fixo por chamada); a paginação de 20 em 20 é feita aqui, do cache.
function nationalPhone(v){const d=String(v||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');if(d.length===11)return '('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7);if(d.length===10)return '('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6);return String(v||'')}
async function mapsViaTreg(env,user,url){
  const q=clean(url.searchParams.get('q'),80),city=clean(url.searchParams.get('cidade'),80),uf=(url.searchParams.get('uf')||'').toUpperCase();
  const offset=Math.max(0,Math.min(40,Number(url.searchParams.get('page')||0)||0));
  if(q.length<2||(uf&&!Object.hasOwn(ufCodes,uf)))return json({error:'Informe o que procurar (ex.: clínica odontológica) e a região'},400);
  if(offset===0){const limited=rateLimit(user.id,'maps',30);if(limited)return limited}
  const location=[city,uf,'Brasil'].filter(Boolean).join(', ');
  const data=await cached('treg-maps:'+q+'|'+location,86400,async()=>{
    const res=await fetchReliable('https://treg.to/call/crawl4ai.google.serp.maps',{method:'POST',headers:{'content-type':'application/json','X-Treg-Token':String(env.TREG_TOKEN).trim()},body:JSON.stringify({query:q,location,limit:60})});
    if(!res.ok){const t=await res.text();console.log(JSON.stringify({event:'treg_maps_error',status:res.status,detail:t.slice(0,300)}));return {error:res.status}}
    const body=await res.json();
    return {rows:Array.isArray(body.rows)?body.rows:[],cost:res.headers.get('x-treg-cost-micro')||''};
  });
  if(!data||data.error){const st=data&&data.error;return json({error:st===401||st===403?'Chave do treg inválida ou sem permissão':st===402?'Saldo do treg esgotado. Recarregue em treg.to.':st===429?'Muitas buscas seguidas no treg. Tente em 1 minuto.':'Busca no Google Maps indisponível no momento'},st===402?402:st===429?429:502)}
  const places=data.rows.map(r=>{
    const m=String(r.address||'').match(/,\s*([^,]+?)\s*-\s*([A-Z]{2}),\s*\d{5}-?\d{3}/);
    return {id:r.place_id||r.cid||r.name,name:r.name||'',category:r.category||'',address:String(r.address||'').replace(/,\s*(Brazil|Brasil)$/,''),city:m?m[1]:'',uf:m?m[2]:'',phone:nationalPhone(r.phone),site:r.website||'',rating:r.rating||null,reviews:r.review_count||0,mapsUrl:r.url||'',temporarilyClosed:false};
  });
  const slice=places.slice(offset,offset+20);
  return json({places:slice,nextPage:offset+20<places.length?String(offset+20):'',total:places.length,source:'treg'});
}
export default {
  async fetch(request,env={}) {
    const url = new URL(request.url);
    if(url.pathname.startsWith('/api/auth/'))return auth(request,env,url);
    if(request.method==='OPTIONS'&&url.pathname.startsWith('/api/'))return new Response(null,{status:204,headers:corsHeaders(request)});
    const user=await supabaseUser(request,env);
    if(url.pathname==='/api/me')return cors(request,json(user?{authenticated:true,email:user.email}:{authenticated:false}));
    if(url.pathname==='/api/leads')return cors(request,user?await savedLeads(request,env,user,url):json({error:'Entre para acessar seus leads'},401));
    if(url.pathname.startsWith('/api/')&&!user)return cors(request,json({error:'Entre para continuar'},401));
    if(url.pathname==='/api/contato'||url.pathname==='/api/cnpj'){
      const cnpj=(url.searchParams.get('cnpj')||'').replace(/\D/g,'');
      if(request.method!=='GET'||!validCnpj(cnpj))return cors(request,json({error:'CNPJ inválido'},400));
      const limited=rateLimit(user.id,'cnpj',60);if(limited)return cors(request,limited);
      const result=await lookupCompany(cnpj,env);
      if(result.error)return cors(request,json({error:result.error},result.status));
      return cors(request,response(JSON.stringify(result.data),'application/json; charset=utf-8',200,{'cache-control':'private, max-age=3600'}));
    }
    if(url.pathname==='/api/empresas'){
      if(request.method!=='POST')return cors(request,response(JSON.stringify({error:'Use POST'}),'application/json; charset=utf-8',405,{'cache-control':'no-store'}));
      const limited=rateLimit(user.id,'busca',90);if(limited)return cors(request,limited);
      let key='';
      try{key=String((await request.json()).apiKey||'')}catch{return cors(request,response(JSON.stringify({error:'Corpo inválido'}),'application/json; charset=utf-8',400,{'cache-control':'no-store'}))}
      let cnae=url.searchParams.get('cnae')||'';
      if(/^\d{4}[\d./-]+$/.test(cnae))cnae=cnae.slice(0,4);
      const uf=url.searchParams.get('uf')||'';
      const municipio=url.searchParams.get('municipio')||'';
      const limit=Number(url.searchParams.get('limit')||20);
      const offset=Number(url.searchParams.get('offset')||0);
      if(!key||key.length>256||!cnae||cnae.length>80||!/^([A-Z]{2})?$/.test(uf)||municipio.length>100||!Number.isInteger(limit)||limit<1||limit>200||!Number.isInteger(offset)||offset<0||offset>100000)return cors(request,response(JSON.stringify({error:'Filtro ou chave inválida'}),'application/json; charset=utf-8',400,{'cache-control':'no-store'}));
      const p=new URLSearchParams({cnae,limit:String(limit),offset:String(offset)});
      if(uf)p.set('uf',uf);
      if(municipio)p.set('municipio',municipio);
      try{
        const upstream=await fetchReliable('https://www.sintegrabrasil.com.br/api/v1/buscar?'+p,{headers:{accept:'application/json','X-Api-Key':key}});
        const data=await upstream.text();
        try{const parsed=JSON.parse(data);console.log(JSON.stringify({event:'company_search',cnae,uf,municipio,count:Array.isArray(parsed.resultados)?parsed.resultados.length:null,status:upstream.status}))}catch{}
        return cors(request,response(data,upstream.headers.get('content-type')||'application/json; charset=utf-8',upstream.status,{'cache-control':'no-store'}));
      }catch{return cors(request,response(JSON.stringify({error:'Fonte indisponível'}),'application/json; charset=utf-8',502,{'cache-control':'no-store'}))}
    }
    if(url.pathname==='/api/socios'){
      const cnpj=(url.searchParams.get('cnpj')||'').replace(/\D/g,'');
      if(request.method!=='GET'||!validCnpj(cnpj))return cors(request,json({error:'CNPJ inválido'},400));
      const limited=rateLimit(user.id,'socios',120);if(limited)return cors(request,limited);
      const partners=await partnersFromDataset(env,cnpj);
      if(partners===null)return cors(request,json({error:'Base de sócios indisponível'},503));
      return cors(request,response(JSON.stringify({cnpj,partners,source:'Receita Federal (Dados Abertos CNPJ)'}),'application/json; charset=utf-8',200,{'cache-control':'private, max-age=86400'}));
    }
    if(url.pathname==='/api/maps'){
      if(request.method!=='GET')return cors(request,json({error:'Método inválido'},405));
      if(!env.TREG_TOKEN&&!env.GOOGLE_MAPS_API_KEY)return cors(request,json({error:'Busca no Google Maps ainda não configurada',code:'maps_not_configured'},503));
      if(env.TREG_TOKEN)return cors(request,await mapsViaTreg(env,user,url));
      const q=clean(url.searchParams.get('q'),80),city=clean(url.searchParams.get('cidade'),80),uf=(url.searchParams.get('uf')||'').toUpperCase(),pageToken=clean(url.searchParams.get('page'),600);
      if(q.length<2||(uf&&!Object.hasOwn(ufCodes,uf)))return cors(request,json({error:'Informe o que procurar (ex.: clínica odontológica) e a região'},400));
      const limited=rateLimit(user.id,'maps',30);if(limited)return cors(request,limited);
      const textQuery=[q,city&&('em '+city),uf].filter(Boolean).join(' ')+', Brasil';
      const fields=['places.id','places.displayName','places.formattedAddress','places.addressComponents','places.nationalPhoneNumber','places.internationalPhoneNumber','places.websiteUri','places.rating','places.userRatingCount','places.googleMapsUri','places.businessStatus','places.primaryTypeDisplayName','nextPageToken'].join(',');
      const data=await cached('maps:'+textQuery+':'+pageToken,86400,async()=>{
        const res=await fetchReliable('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':String(env.GOOGLE_MAPS_API_KEY).trim(),'X-Goog-FieldMask':fields},body:JSON.stringify({textQuery,languageCode:'pt-BR',regionCode:'BR',pageSize:20,...(pageToken?{pageToken}:{})})});
        if(!res.ok){const t=await res.text();console.log(JSON.stringify({event:'maps_error',status:res.status,detail:t.slice(0,300)}));return {error:res.status}}
        return await res.json();
      });
      if(!data||data.error){const st=data&&data.error;return cors(request,json({error:st===403?'Chave do Google Maps sem permissão para a Places API':st===429?'Limite do Google Maps atingido. Tente mais tarde.':'Google Maps indisponível no momento'},st===429?429:502))}
      const comp=(p,type)=>{const c=(p.addressComponents||[]).find(c=>(c.types||[]).includes(type));return c?(type==='administrative_area_level_1'?c.shortText:c.longText):''};
      const places=(data.places||[]).filter(p=>p.businessStatus!=='CLOSED_PERMANENTLY').map(p=>({id:p.id,name:p.displayName&&p.displayName.text||'',category:p.primaryTypeDisplayName&&p.primaryTypeDisplayName.text||'',address:p.formattedAddress||'',city:comp(p,'administrative_area_level_2'),uf:comp(p,'administrative_area_level_1'),phone:p.nationalPhoneNumber||'',site:p.websiteUri||'',rating:p.rating||null,reviews:p.userRatingCount||0,mapsUrl:p.googleMapsUri||'',temporarilyClosed:p.businessStatus==='CLOSED_TEMPORARILY'}));
      return cors(request,json({places,nextPage:data.nextPageToken||''}));
    }
    if(url.pathname==='/api/municipios'){
      const uf=(url.searchParams.get('uf')||'').toUpperCase();
      if(!Object.hasOwn(ufCodes,uf))return cors(request,json({error:'UF inválida'},400));
      const list=await municipalities(uf);
      if(!list)return cors(request,json({error:'Lista de cidades indisponível'},502));
      return cors(request,response(JSON.stringify(list),'application/json; charset=utf-8',200,{'cache-control':'public, max-age=86400'}));
    }
    if(url.pathname==='/api/cnes'){
      const uf=(url.searchParams.get('uf')||'').toUpperCase();
      const municipio=(url.searchParams.get('municipio')||'').replace(/\D/g,'');
      const tipo=(url.searchParams.get('tipo')||'').replace(/\D/g,'');
      const offset=Number(url.searchParams.get('offset')||0);
      if((uf&&!Object.hasOwn(ufCodes,uf))||(municipio&&!/^\d{6,7}$/.test(municipio))||(tipo&&!/^\d{1,3}$/.test(tipo))||!Number.isInteger(offset)||offset<0||offset>10000)return cors(request,json({error:'Filtro inválido'},400));
      if(municipio&&uf&&!municipio.startsWith(String(ufCodes[uf])))return cors(request,json({error:'Cidade não pertence ao estado escolhido'},400));
      const limited=rateLimit(user.id,'busca',90);if(limited)return cors(request,limited);
      const p=new URLSearchParams({status:'1',limit:'20',offset:String(offset)});
      if(municipio)p.set('codigo_municipio',municipio.slice(0,6));
      else if(uf)p.set('codigo_uf',String(ufCodes[uf]));
      if(tipo)p.set('codigo_tipo_unidade',String(Number(tipo)));
      const data=await cached('cnes:'+p,300,async()=>{
        const upstream=await fetchReliable('https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?'+p,{headers:{accept:'application/json'}});
        if(!upstream.ok)return null;
        return await upstream.json();
      });
      if(!data)return cors(request,json({error:'Fonte pública indisponível'},502));
      const rows=Array.isArray(data.estabelecimentos)?data.estabelecimentos:Array.isArray(data)?data:[];
      const ufOf=row=>Object.keys(ufCodes).find(k=>String(ufCodes[k])===String(row.codigo_uf))||uf;
      const names={};
      for(const code of new Set(rows.map(ufOf).filter(Boolean))){const list=await municipalities(code);if(list)for(const m of list)names[String(m.id).slice(0,6)]=m.nome}
      for(const row of rows){const code=String(row.codigo_municipio||'').slice(0,6);if(names[code]&&!row.nome_municipio)row.nome_municipio=names[code];if(!row.uf)row.uf=ufOf(row)}
      return cors(request,response(JSON.stringify({estabelecimentos:rows}),'application/json; charset=utf-8',200,{'cache-control':'private, max-age=300'}));
    }
    const asset=assets[url.pathname];
    if(asset)return response(asset.body,asset.type,200,{'cache-control':'no-store'});
    return response('Não encontrado','text/plain; charset=utf-8',404);
  }
};
