'use strict';
// Exercise the receiver-to-archive path with controlled Electron events and a real SQLite database.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url'),{EventEmitter,once}=require('node:events');
const {Archive,displayName}=require('../app/archive.cjs');
test('only official downloads enter the archive on completion and remain copyable after restart',async t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'float-integration-'));
  fs.mkdirSync(path.join(temp,'appdata','FloatInbox'),{recursive:true});
  t.after(()=>fs.rmSync(temp,{force:true,recursive:true}));
  const app=new EventEmitter(),profile=new EventEmitter(),handlers={},notifications=new EventEmitter();
  let win,receiver,copied;
  Object.assign(app,{paths:{appData:path.join(temp,'appdata')},getPath:k=>app.paths[k],setPath:(k,v)=>app.paths[k]=v,requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),setLoginItemSettings:()=>{},getLoginItemSettings:()=>({openAtLogin:true})});
  Object.assign(profile,{setPermissionRequestHandler:()=>{},setPermissionCheckHandler:()=>{}});
  const url=pathToFileURL(path.join(temp,'app','index.html')).href;
  class Web extends EventEmitter{
    constructor(){super();this.url='';}
    getURL(){return this.url;}getUserAgent(){return 'Electron/45';}setUserAgent(){}setWindowOpenHandler(){}
    loadURL(u){this.url=u;return Promise.resolve();}send(_name,v){notifications.emit('update',v);}
  }
  class Window extends EventEmitter{
    constructor(){super();win=this;this.webContents=new Web();this.contentView={addChildView:()=>{}};}
    loadFile(){} showInactive(){} isDestroyed(){return false;} getContentSize(){return [400,620];} blur(){}
  }
  class View{constructor(){receiver=this;this.webContents=new Web();}setBounds(){}setVisible(){}}
  const electron={app,BrowserWindow:Window,WebContentsView:View,session:{fromPartition:()=>profile},screen:{getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1200,height:800}})},ipcMain:{handle:(k,v)=>handlers[k]=v},
    nativeImage:{createFromPath:p=>({isEmpty:()=>false,bytes:fs.readFileSync(p)})},clipboard:{writeImage:im=>{copied=im.bytes;}},
    dialog:{showErrorBox:(_title,reason)=>{throw Error(reason);}}};
  const main=fs.readFileSync(path.join(__dirname,'../app/main.cjs'),'utf8');
  vm.runInNewContext(main,{require:id=>id==='electron'?electron:id==='./archive.cjs'?{Archive,displayName}:require(id),__dirname:path.join(temp,'app'),process,URL,Buffer,console});
  await new Promise(r=>setImmediate(r));win.emit('ready-to-show');
  const local={sender:win.webContents,senderFrame:{url}};
  const invoke=(name,...args)=>handlers['float:'+name](local,...args);
  let refused=false;profile.emit('will-download',{preventDefault:()=>refused=true},{},win.webContents);assert.equal(refused,true);
  assert.throws(()=>handlers['float:list']({sender:receiver.webContents,senderFrame:{url:receiver.webContents.getURL()}}));
  const item=new EventEmitter();let target;
  Object.assign(item,{getFilename:()=>'课堂.png',getMimeType:()=>'image/png',getReceivedBytes:()=>4,getTotalBytes:()=>4,setSavePath:p=>target=p});
  profile.emit('will-download',{},item,receiver.webContents);
  assert.equal(invoke('list','','',0).length,0);
  const bytes=Buffer.from([0x89,0x50,0x4e,0x47]);fs.writeFileSync(target,bytes);
  const archived=new Promise(resolve=>{function handle(m){if(m.changed){notifications.off('update',handle);resolve();}}notifications.on('update',handle);});
  item.emit('done',{},'completed');await archived;
  const [photo]=invoke('list','image','课堂',0);assert.ok(photo);
  invoke('copy',photo.id);assert.deepEqual(copied,bytes);
  app.emit('will-quit');
  const next=new Archive(path.join(temp,'data'));try{assert.deepEqual(fs.readFileSync(next.location(next.get(photo.id))),bytes);}finally{next.close();}
});
