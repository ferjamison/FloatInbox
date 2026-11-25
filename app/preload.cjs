const {contextBridge,ipcRenderer}=require('electron');
const names=['list','thumb','copy','export','import','paste','note','pane','fold','startup','status','reloadWechat','quit'];
const api={};
for(const name of names) api[name]=(...args)=>ipcRenderer.invoke('float:'+name,...args);
api.onUpdate=fn=>ipcRenderer.on('float:update',(_event,message)=>fn(message));
contextBridge.exposeInMainWorld('inbox',api);
