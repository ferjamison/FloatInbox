const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Archive,displayName}=require('../app/archive.cjs');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/KXkAAAAASUVORK5CYII=','base64');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'float-inbox-'));
 const root=path.join(dir,'data');
 let store=new Archive(root);
 t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {dir,root,get store(){return store;},restart(){store.close();store=new Archive(root);}};
}
test('saved photo is byte-identical after deleting source, restarting and using twice',async t=>{
 const f=fixture(t),src=path.join(f.dir,'pic.png');fs.writeFileSync(src,PNG);
 const id=await f.store.file(src,'照片.png');fs.unlinkSync(src);f.restart();
 assert.equal(f.store.list('image','照片').length,1);
 for(let i=0;i<2;i++)assert.deepEqual(fs.readFileSync(f.store.location(f.store.get(id))),PNG);
});
test('incomplete downloads do not become history, completed downloads with identical names survive',async t=>{
 const f=fixture(t);
 const stage=f.store.temporary();fs.writeFileSync(stage,'unfinished');f.restart();
 assert.equal(fs.existsSync(stage),false);assert.deepEqual(f.store.list(),[]);
 for(const value of ['one','two']){const s=f.store.temporary();fs.writeFileSync(s,value);await f.store.file(s,'课件.pdf','微信接收','application/pdf',true);}
 const rows=f.store.list('file');assert.equal(rows.length,2);
 assert.equal(new Set(rows.map(r=>fs.readFileSync(f.store.location(f.store.get(r.id)),'utf8'))).size,2);
 await assert.rejects(()=>f.store.file(path.join(f.dir,'absent'),'ghost.pdf'));assert.equal(f.store.list().length,2);
});
test('notes, URLs, literal search, pagination and clock ties',t=>{
 const f=fixture(t);const link='https://example.com/p?q=1';
 const a=f.store.text(link),b=f.store.text('明天写脚本\n进度 80%_');
 for(let i=0;i<43;i++)f.store.text('备忘 '+i);
 f.restart();assert.equal(f.store.get(a).body,link);assert.equal(f.store.list('text','%_')[0].id,b);
 assert.equal(f.store.list('link','example').length,1);assert.equal(f.store.list('', '',40).length,5);
 assert.throws(()=>f.store.text('  '));assert.equal(displayName('..\\CON.txt'),'_CON.txt');
});
