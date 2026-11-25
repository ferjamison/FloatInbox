'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');

const extensions = new Set(['.png','.jpg','.jpeg','.webp','.bmp','.gif','.avif','.heic','.heif','.tif','.tiff']);
const imageSuffix = {'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif','image/bmp':'.bmp','image/avif':'.avif'};
function displayName(input) {
  let name=String(input || '附件').split(/[\\/]/).pop().replace(/[<>:"|?*\u0000-\u001f]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,120) || '附件';
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) name='_'+name;
  return name;
}
function isLink(value) {
  try {return !/\s/.test(value) && ['https:','http:'].includes(new URL(value).protocol);} catch {return false;}
}
class Archive {
  constructor(root) {
    this.root=root;
    this.objects=path.join(root,'originals');
    this.staging=path.join(root,'incoming');
    fs.mkdirSync(this.objects,{recursive:true});
    fs.mkdirSync(this.staging,{recursive:true});
    this.db=new DatabaseSync(path.join(root,'history.sqlite'));
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL, object TEXT NOT NULL, bytes INTEGER NOT NULL, created INTEGER NOT NULL, source TEXT NOT NULL); CREATE INDEX IF NOT EXISTS recent ON entries(created DESC)");
    this.insert=this.db.prepare('INSERT INTO entries VALUES(?,?,?,?,?,?,?,?)');
    // Only this running app owns incoming/. A half-received file never becomes history.
    for(const n of fs.readdirSync(this.staging)) if (/^[0-9a-f-]{36}\.part$/.test(n)) fs.rmSync(path.join(this.staging,n),{force:true});
  }
  temporary(){return path.join(this.staging,randomUUID()+'.part');}
  text(raw,source='手动收存') {
    const body=String(raw).trim();
    if(!body || body.length>1000000) throw Error('请填写 1 至 100 万字以内的内容');
    const id=randomUUID(), kind=isLink(body)?'link':'text';
    this.insert.run(id,kind,body.split(/\r?\n/)[0].slice(0,110),body,'',Buffer.byteLength(body),Date.now(),source);
    return id;
  }
  async file(input,rawName,source='本机导入',mime='',staged=false) {
    const id=randomUUID(); let name=displayName(rawName);
    if(!path.extname(name)&&imageSuffix[mime]) name+=imageSuffix[mime];
    const key=id+path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g,'').slice(0,12);
    const incoming=staged?input:this.temporary(), dest=path.join(this.objects,key);
    if(staged && path.dirname(input)!==this.staging) throw Error('接收目录无效');
    try {
      if(!staged) await fsp.copyFile(input,incoming,fs.constants.COPYFILE_EXCL);
      const stat=await fsp.stat(incoming);
      if(!stat.isFile()) throw Error('请选择文件');
      await fsp.rename(incoming,dest);
      const kind=extensions.has(path.extname(name).toLowerCase())||imageSuffix[mime]?'image':'file';
      this.insert.run(id,kind,name,'',key,stat.size,Date.now(),source);
      return id;
    } catch(e) { await Promise.all([incoming,dest].map(p=>fsp.rm(p,{force:true}).catch(()=>{}))); throw e; }
  }
  get(id){const e=this.db.prepare('SELECT * FROM entries WHERE id=?').get(id);if(!e)throw Error('这条记录已不存在');return e;}
  location(e){return path.join(this.objects,e.object);}
  list(kind='',term='',offset=0) {
    const search='%'+String(term).slice(0,150).replace(/[\\%_]/g,'\\$&')+'%';
    return this.db.prepare(`SELECT id,kind,name,substr(body,1,240) AS preview,bytes,created,source FROM entries
      WHERE (?='' OR kind=?) AND (name LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')
      ORDER BY created DESC,rowid DESC LIMIT 40 OFFSET ?`).all(kind,kind,search,search,Math.max(0,Math.floor(Number(offset)||0)));
  }
  close(){this.db.close();}
}
module.exports={Archive,displayName};
