'use strict';
const {app,BrowserWindow,WebContentsView,session,screen,ipcMain,clipboard,nativeImage,dialog,Menu}=require('electron');
const fs=require('node:fs'), fsp=fs.promises, path=require('node:path');
const {pathToFileURL}=require('node:url');
const {Archive,displayName}=require('./archive.cjs');
const localPage=pathToFileURL(path.join(__dirname,'index.html')).href;
const project=path.resolve(__dirname,'..');
app.setPath('userData',path.join(app.getPath('appData'),'FloatInbox'));
const wxURL='https://filehelper.weixin.qq.com/';
function official(url) {
  try {const u=new URL(url);return u.protocol==='https:' && /^(?:[a-z]{1,4})?filehelper\.weixin\.qq\.com$/.test(u.hostname) && !u.username && !u.password && (!u.port||u.port==='443');}catch{return false;}
}
let win,wx,store,pane='history',folded=false,oldBounds,wxFault='',stateFile;
let receiving=new Map(), thumbnails=new Map();
const notify=(info={})=>{if(win&&!win.isDestroyed())win.webContents.send('float:update',info);};
function boundsForReceiver(){
  if(!wx)return;
  const [w,h]=win.getContentSize();
  wx.setBounds({x:0,y:92,width:w,height:Math.max(1,h-134)});
  wx.setVisible(!folded && pane==='wechat' && !wxFault);
}
function bootSetting(on){
  const args=[project];
  if(typeof on==='boolean') app.setLoginItemSettings({openAtLogin:on,path:process.execPath,args});
  return app.getLoginItemSettings({path:process.execPath,args}).openAtLogin;
}
function state(){return {folded,pane,wxFault,receiving:[...receiving.values()],autostart:bootSetting()};}
function fold(){
  if(!folded){oldBounds=win.getBounds();folded=true;win.setMinimumSize(112,44);
    win.setBounds({x:oldBounds.x+oldBounds.width-126,y:oldBounds.y,width:126,height:46});
  }else{
    const pos=win.getBounds(), area=screen.getDisplayMatching(pos).workArea;
    const w=Math.min(oldBounds.width,area.width),h=Math.min(oldBounds.height,area.height);
    folded=false;win.setMinimumSize(355,410);win.setBounds({x:Math.max(area.x,Math.min(pos.x+pos.width-w,area.x+area.width-w)),y:Math.max(area.y,Math.min(pos.y,area.y+area.height-h)),width:w,height:h});
  }
  boundsForReceiver();notify({state:state()});return folded;
}
const report=(e)=>notify({message:String(e.message||e)});
function initReceiver(){
  if(wx)return;
  const profile=session.fromPartition('persist:official-wechat');
  profile.setPermissionRequestHandler((_wc,_type,cb)=>cb(false));
  profile.setPermissionCheckHandler(()=>false);
  wx=new WebContentsView({webPreferences:{session:profile,sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false}});
  win.contentView.addChildView(wx);
  const web=wx.webContents;
  const defaultAgent=web.getUserAgent();
  web.setUserAgent(defaultAgent.replace(/ (?:FloatInbox|float-inbox|Electron)\/[^ ]+/gi,''));
  web.setWindowOpenHandler(()=>({action:'deny'}));
  for(const evt of ['will-navigate','will-redirect']) web.on(evt,(e,url)=>{if(!official(url))e.preventDefault();});
  web.on('did-start-navigation',(_e,_url,inPlace,main)=>{if(main&&!inPlace){wxFault='';boundsForReceiver();notify({state:state()});}});
  web.on('did-fail-load',(_e,code,_reason,_url,main)=>{if(!main||code===-3)return;wxFault='微信接收页未连接，请检查网络后重试。';boundsForReceiver();notify({state:state()});});
  web.on('render-process-gone',()=>{wxFault='接收页面已关闭，可重新连接。';boundsForReceiver();notify({state:state()});});
  const saveText=(text)=>{try{store.text(text,'微信接收');notify({changed:true,message:'已加入历史'});}catch(e){report(e);}};
  web.on('context-menu',(_e,p)=>{
    if(!official(web.getURL()))return;
    const actions=[];
    if(p.mediaType==='image' && /^(https:|blob:)/.test(p.srcURL))
      actions.push({label:'收存这张网页图片',click:()=>web.downloadURL(p.srcURL)});
    if(p.selectionText.trim()) actions.push({label:'收存选中的文字',click:()=>saveText(p.selectionText)});
    if(/^https?:\/\//i.test(p.linkURL))actions.push({label:'收存这个链接',click:()=>saveText(p.linkURL)});
    if(actions.length)Menu.buildFromTemplate(actions).popup({window:win});
  });
  profile.on('will-download',(e,item,origin)=>{
    if(origin!==web||!official(web.getURL())){e.preventDefault();return;}
    const stage=store.temporary(),name=displayName(item.getFilename()),mime=item.getMimeType();
    item.setSavePath(stage);
    const progress=()=>{receiving.set(stage,{name,done:item.getReceivedBytes(),total:item.getTotalBytes()});notify({state:state()});};
    progress();item.on('updated',progress);
    item.once('done',async(_e,status)=>{
      try {
        if(status!=='completed'){await fsp.rm(stage,{force:true});throw Error('接收中断，请在微信页重新下载');}
        await store.file(stage,name,'微信接收',mime,true);
        notify({changed:true,message:'已保存到此电脑'});
      }catch(error){report(error);}finally{receiving.delete(stage);notify({state:state()});}
    });
  });
  boundsForReceiver();web.loadURL(wxURL).catch(()=>{});
}
function createWindow(){
  const a=screen.getPrimaryDisplay().workArea;
  const w=Math.min(400,a.width),h=Math.min(620,a.height-16);
  win=new BrowserWindow({width:w,height:h,x:a.x+a.width-w-12,y:a.y+12,minWidth:355,minHeight:410,frame:false,alwaysOnTop:true,backgroundColor:'#f7f7f2',show:false,autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(evt,url)=>{if(url!==localPage)evt.preventDefault();});
  win.on('resize',boundsForReceiver);
  win.once('ready-to-show',()=>{win.showInactive();initReceiver();});
  win.on('closed',()=>{if(wx&&!wx.webContents.isDestroyed())wx.webContents.close();wx=null;win=null;});
  win.loadFile(path.join(__dirname,'index.html'));
}
function installHandlers(){
  const ops={
    status:state, fold, startup:on=>bootSetting(Boolean(on)),
    pane:name=>{pane=name==='wechat'?'wechat':'history';if(pane==='wechat')initReceiver();boundsForReceiver();return state();},
    reloadWechat:()=>{initReceiver();wx.webContents.loadURL(wxURL).catch(()=>{});return true;},
    list:(kind,q,offset)=>store.list(kind,q,offset),
    thumb:id=>{
      if(thumbnails.has(id))return thumbnails.get(id);
      const entry=store.get(id);if(entry.kind!=='image')return '';
      const image=nativeImage.createFromPath(store.location(entry));if(image.isEmpty())return '';
      const s=image.getSize(),scale=Math.min(1,144/Math.max(s.width,s.height));
      const url=image.resize({width:Math.max(1,Math.round(s.width*scale)),height:Math.max(1,Math.round(s.height*scale))}).toDataURL();
      if(thumbnails.size>=160)thumbnails.delete(thumbnails.keys().next().value);
      thumbnails.set(id,url);return url;
    },
    copy:id=>{
      const e=store.get(id);
      if(e.kind==='image'){
        const img=nativeImage.createFromPath(store.location(e));
        if(img.isEmpty())throw Error('当前格式无法复制为图片，请另存原文件');
        clipboard.writeImage(img);
      }else if(e.kind==='link'||e.kind==='text'){clipboard.writeText(e.body);}
      else throw Error('请使用另存为');
      win.blur();
      return true;
    },
    export:async id=>{
      const e=store.get(id);const result=await dialog.showSaveDialog(win,{defaultPath:path.join(app.getPath('downloads'),displayName(e.name)+(e.object?'':'.txt'))});
      if(result.canceled)return false;
      if(e.object)await fsp.copyFile(store.location(e),result.filePath);
      else await fsp.writeFile(result.filePath,e.body);
      return true;
    },
    import:async()=>{
      const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections']});
      let count=0;
      for(const file of r.filePaths){await store.file(file,path.basename(file));count++;notify({changed:true});}
      return count;
    },
    note:t=>{store.text(t);notify({changed:true});return true;},
    paste:async()=>{
      const img=clipboard.readImage();
      if(!img.isEmpty()){
        const stage=store.temporary();
        await fsp.writeFile(stage,img.toPNG());
        await store.file(stage,'剪贴板图片.png','剪贴板','image/png',true);
      }else{
        const t=clipboard.readText();if(!t.trim())throw Error('剪贴板没有图片或文字');
        store.text(t,'剪贴板');
      }
      notify({changed:true});return true;
    }
  };
  for(const [name,fn] of Object.entries(ops))ipcMain.handle('float:'+name,(e,...args)=>{
    if(!win||e.sender!==win.webContents||e.senderFrame?.url!==localPage)throw Error('无权访问历史');
    return fn(...args);
  });
  ipcMain.handle('float:quit',e=>{if(e.sender===win.webContents && e.senderFrame?.url===localPage)win.close();});
}
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{if(win){if(folded)fold();win.show();win.focus();}});
  app.whenReady().then(()=>{
    store=new Archive(path.join(project,'data'));
    stateFile=path.join(app.getPath('userData'),'first-run-v1');
    if(!fs.existsSync(stateFile)){bootSetting(true);fs.writeFileSync(stateFile,'1');}
    installHandlers();createWindow();
  }).catch(e=>{dialog.showErrorBox('浮笺启动失败',String(e.message));app.quit();});
  app.on('window-all-closed',()=>app.quit());
  app.on('will-quit',()=>store?.close());
}
