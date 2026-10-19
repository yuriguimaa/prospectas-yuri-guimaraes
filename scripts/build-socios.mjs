// Gera os arquivos de sócios (data/assets/socios/XXXX.bin) a partir dos ZIPs "Socios*.zip"
// dos Dados Abertos do CNPJ (Receita Federal).
//
// Uso: node scripts/build-socios.mjs /pasta/com/os/zips
//
// Guarda só o necessário para prospecção B2B: nome do sócio, cargo (qualificação),
// data de entrada e tipo (PF/PJ/estrangeiro). Não guarda CPF parcial nem faixa etária,
// e descarta sócios menores de idade ou incapazes.
//
// Formato de cada arquivo (gzip, texto UTF-8): uma linha por empresa, ordenada:
//   <4 últimos dígitos do CNPJ básico>\t<nome>|<cargo>|<aaaammdd>|<tipo>;<nome>|...
// O nome do arquivo são os 4 primeiros dígitos do CNPJ básico (8 dígitos).
import {spawn} from 'node:child_process';
import {createWriteStream,mkdirSync,readdirSync,readFileSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createInterface} from 'node:readline';

const srcDir=process.argv[2];
if(!srcDir){console.error('Informe a pasta com os arquivos Socios*.zip');process.exit(1)}
const root=new URL('..',import.meta.url).pathname;
const outDir=join(root,'data/assets/socios');
const tmpDir=join(root,'.tmp-socios');
const SKIP=new Set(['29','30','67','68']); // incapazes e menores de idade
rmSync(tmpDir,{recursive:true,force:true});mkdirSync(tmpDir,{recursive:true});
rmSync(outDir,{recursive:true,force:true});mkdirSync(outDir,{recursive:true});

// Passo 1: separa as linhas em 100 baldes pelos 2 primeiros dígitos do CNPJ.
const buckets=new Map();
const bucket=k=>{let s=buckets.get(k);if(!s){s=createWriteStream(join(tmpDir,k+'.txt'));buckets.set(k,s)}return s};
const clean=v=>String(v||'').replace(/[|;\t\r\n]/g,' ').replace(/\s+/g,' ').trim();
let rows=0,kept=0;
const zips=readdirSync(srcDir).filter(f=>/^socios.*\.zip$/i.test(f)).sort();
if(!zips.length){console.error('Nenhum Socios*.zip em '+srcDir);process.exit(1)}
for(const zip of zips){
  const proc=spawn('unzip',['-p',join(srcDir,zip)]);
  proc.stdout.setEncoding('latin1');
  const rl=createInterface({input:proc.stdout,crlfDelay:Infinity});
  for await(const line of rl){
    rows++;
    const f=line.slice(1,-1).split('";"');
    if(f.length<6)continue;
    const basico=f[0],tipo=f[1],nome=clean(f[2]),qual=f[4],data=f[5];
    if(!/^\d{8}$/.test(basico)||!nome||SKIP.has(qual))continue;
    kept++;
    const out=bucket(basico.slice(0,2));
    if(!out.write(basico+'\t'+nome+'|'+qual+'|'+(/^\d{8}$/.test(data)?data:'')+'|'+tipo+'\n'))await new Promise(r=>out.once('drain',r));
  }
  console.log(zip+': '+rows.toLocaleString('pt-BR')+' linhas lidas até agora');
}
await Promise.all([...buckets.values()].map(s=>new Promise(r=>s.end(r))));

// Passo 2: em cada balde, agrupa por empresa e grava 100 arquivos (dígitos 3–4).
const ORDER=['49','05','16','10','65','28','22','78','54','08'];
const rank=q=>{const i=ORDER.indexOf(q);return i<0?99:i};
let files=0,bytes=0;
for(const name of readdirSync(tmpDir).sort()){
  const prefix2=name.slice(0,2);
  const shards=new Map();
  for(const line of readFileSync(join(tmpDir,name),'utf8').split('\n')){
    if(!line)continue;
    const tab=line.indexOf('\t');const basico=line.slice(0,tab);
    const key=basico.slice(2,4),suffix=basico.slice(4);
    let m=shards.get(key);if(!m){m=new Map();shards.set(key,m)}
    let list=m.get(suffix);if(!list){list=[];m.set(suffix,list)}
    list.push(line.slice(tab+1));
  }
  for(const [key,m] of shards){
    const lines=[...m.entries()].sort((a,b)=>a[0]<b[0]?-1:1).map(([suffix,list])=>{
      const uniq=[...new Set(list)].sort((a,b)=>rank(a.split('|')[1])-rank(b.split('|')[1]));
      return suffix+'\t'+uniq.slice(0,30).join(';');
    });
    const gz=gzipSync('\n'+lines.join('\n')+'\n',{level:9});
    writeFileSync(join(outDir,prefix2+key+'.bin'),gz);files++;bytes+=gz.length;
  }
}
rmSync(tmpDir,{recursive:true,force:true});
writeFileSync(join(outDir,'..','socios-info.json'),JSON.stringify({gerado:new Date().toISOString(),origem:zips,linhas:rows,socios:kept,arquivos:files,bytes},null,1));
console.log(`Pronto: ${kept.toLocaleString('pt-BR')} sócios de ${rows.toLocaleString('pt-BR')} linhas em ${files} arquivos (${(bytes/1048576).toFixed(1)} MB).`);
