// Assets are embedded by scripts/build.mjs so this Worker runs without a database or paid service.
const assets = __ASSETS__;
const ufCodes = {AC:12,AL:27,AP:16,AM:13,BA:29,CE:23,DF:53,ES:32,GO:52,MA:21,MT:51,MS:50,MG:31,PA:15,PB:25,PR:41,PE:26,PI:22,RJ:33,RN:24,RS:43,RO:11,RR:14,SC:42,SP:35,SE:28,TO:17};
const response = (body,type,status=200,extra={}) => new Response(body,{status,headers:{'content-type':type,'x-content-type-options':'nosniff',...extra}});
const json = (body,status=200) => response(JSON.stringify(body),'application/json; charset=utf-8',status,{'cache-control':'no-store'});
const publicAppOrigin='https://prospectas-yuri-guimaraes.yuryguimaa.workers.dev';
function corsHeaders(request){
  const origin=request.headers.get('origin');
  if(origin===publicAppOrigin)return {'access-control-allow-origin':origin,'access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'GET, POST, DELETE, OPTIONS','vary':'Origin'};
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
function clean(value,max){return typeof value==='string'?value.trim().slice(0,max):''}
function safeHttp(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:''}catch{return ''}}
async function savedLeads(request,env,user,url){
  if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)return json({error:'Banco de dados ainda não configurado'},503);
  if(!['GET','POST','DELETE'].includes(request.method))return json({error:'Método inválido'},405);
  if(request.method!=='GET'&&!sameOrigin(request))return json({error:'Origem inválida'},403);
  const base=String(env.SUPABASE_URL).replace(/\/$/,'')+'/rest/v1/saved_leads';
  const headers={'apikey':String(env.SUPABASE_SECRET_KEY).trim(),'Accept':'application/json','User-Agent':'ProspectasYuriGuimaraes/1.0 (server)'};
  let target=base,body;
  if(request.method==='GET')target+='?select=record_key,name,category,city,uf,phone,email,source,source_url,site,created_at&owner_id=eq.'+encodeURIComponent(user.id)+'&order=created_at.desc&limit=500';
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
    return request.method==='DELETE'?json({ok:true}):response(await upstream.text(),'application/json; charset=utf-8',200,{'cache-control':'no-store'});
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
export default {
  async fetch(request,env={}) {
    const url = new URL(request.url);
    if(url.pathname.startsWith('/api/auth/'))return auth(request,env,url);
    if(request.method==='OPTIONS'&&url.pathname.startsWith('/api/'))return new Response(null,{status:204,headers:corsHeaders(request)});
    const user=await supabaseUser(request,env);
    if(url.pathname==='/api/me')return cors(request,json(user?{authenticated:true,email:user.email}:{authenticated:false}));
    if(url.pathname==='/api/leads')return cors(request,user?await savedLeads(request,env,user,url):json({error:'Entre para acessar seus leads'},401));
    if(url.pathname.startsWith('/api/')&&!user)return cors(request,json({error:'Entre para continuar'},401));
    if(url.pathname==='/api/contato'){
      const cnpj=url.searchParams.get('cnpj')||'';
      if(request.method!=='GET'||!/^[0-9]{14}$/.test(cnpj))return cors(request,response(JSON.stringify({error:'CNPJ inválido'}),'application/json; charset=utf-8',400,{'cache-control':'no-store'}));
      try{
        const upstream=await fetchReliable('https://kitana.opencnpj.com/cnpj/'+cnpj,{headers:{accept:'application/json'}});
        if(upstream.status===429)return cors(request,response(JSON.stringify({error:'Limite temporário da fonte de contatos'}),'application/json; charset=utf-8',429,{'cache-control':'no-store'}));
        if(!upstream.ok)return cors(request,response(JSON.stringify({error:'Contato indisponível'}),'application/json; charset=utf-8',upstream.status===404?404:502,{'cache-control':'no-store'}));
        const data=await upstream.json();
        const company=data.success===true&&data.data&&typeof data.data==='object'?data.data:null;
        if(!company||String(company.cnpj||'').replace(/\D/g,'')!==cnpj)return cors(request,response(JSON.stringify({error:'Cadastro não confirmado'}),'application/json; charset=utf-8',502,{'cache-control':'no-store'}));
        const phone=String(company.telefone||'').replace(/\D/g,'');
        const email=String(company.email||'').trim();
        const cnaes=Array.isArray(company.cnaes)?company.cnaes.map(item=>String(item.cnae||'').replace(/\D/g,'')).filter(Boolean):[];
        return cors(request,response(JSON.stringify({cnpj,phone:/^\d{10,11}$/.test(phone)?phone:'',email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'',name:String(company.nomeFantasia||company.razaoSocial||'').trim(),city:String(company.municipio||'').trim(),uf:String(company.uf||'').trim().toUpperCase(),status:String(company.situacaoCadastral||'').trim(),cnaes,source:'OpenCNPJ · cadastro empresarial',sourceUrl:'https://opencnpj.com/api'}),'application/json; charset=utf-8',200,{'cache-control':'public, max-age=3600'}));
      }catch{return cors(request,response(JSON.stringify({error:'Contato indisponível'}),'application/json; charset=utf-8',502,{'cache-control':'no-store'}))}
    }
    if(url.pathname==='/api/empresas'){
      if(request.method!=='POST')return cors(request,response(JSON.stringify({error:'Use POST'}),'application/json; charset=utf-8',405,{'cache-control':'no-store'}));
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
    if(url.pathname==='/api/cnes'){
      const uf=url.searchParams.get('uf')||'';
      const offset=Number(url.searchParams.get('offset')||0);
      if((uf&&!Object.hasOwn(ufCodes,uf))||!Number.isInteger(offset)||offset<0||offset>10000)return cors(request,response(JSON.stringify({error:'Filtro inválido'}),'application/json; charset=utf-8',400));
      const p=new URLSearchParams({status:'1',limit:'20',offset:String(offset)});
      if(uf)p.set('codigo_uf',String(ufCodes[uf]));
      try{
        const upstream=await fetchReliable('https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?'+p,{headers:{accept:'application/json'}});
        if(!upstream.ok)return cors(request,response(JSON.stringify({error:'Fonte pública indisponível'}),'application/json; charset=utf-8',502));
        const data=await upstream.text();
        return cors(request,response(data,'application/json; charset=utf-8',200,{'cache-control':'public, max-age=300'}));
      }catch{return cors(request,response(JSON.stringify({error:'Fonte pública indisponível'}),'application/json; charset=utf-8',502))}
    }
    const asset=assets[url.pathname];
    if(asset)return response(asset.body,asset.type,200,{'cache-control':'no-store'});
    return response('Não encontrado','text/plain; charset=utf-8',404);
  }
};
