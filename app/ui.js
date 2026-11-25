'use strict';
const api=window.inbox, $=id=>document.getElementById(id);
const names={'':'全部',image:'图片',file:'文件',link:'链接',text:'文字'};
let kind='',revision=0,offset=0,mode='history',latestState,noticeTimer,searchTimer;
const fmt=new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
function element(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function button(label,fn,cls){const b=element('button',cls,label);b.addEventListener('click',()=>run(fn));return b;}
async function run(fn){try{return await fn();}catch(e){notice(String(e.message||e).replace(/^.*?Error: /,''));}}
function statusText(){
  const jobs=latestState?.receiving||[];
  if(jobs.length){const j=jobs[0];return '正在接收 '+j.name+(j.total>0?' · '+Math.round(j.done/j.total*100)+'%':'');}
  return mode==='wechat'?'下载后自动归档 · 右键可收存图片、选中文字和链接':'本机历史 · 保存在此电脑';
}
function notice(msg){clearTimeout(noticeTimer);$('status').textContent=msg;noticeTimer=setTimeout(()=>{noticeTimer=null;$('status').textContent=statusText();},3200);}
function showState(s){
  latestState=s;mode=s.pane;$('pill').hidden=!s.folded;document.querySelector('main').hidden=s.folded;
  $('history').hidden=mode!=='history';$('wechat').hidden=mode!=='wechat';
  $('toHistory').classList.toggle('active',mode==='history');$('toWx').classList.toggle('active',mode==='wechat');
  $('autorun').checked=s.autostart;$('wxProblem').hidden=!s.wxFault;$('wxReason').textContent=s.wxFault||'';
  if(!noticeTimer)$('status').textContent=statusText();
}
async function setPane(p){showState(await api.pane(p));}
function card(e){
  const row=element('article','row'),tile=element('div','tile',names[e.kind]),info=element('div','info'),buttons=element('div','rowbtns');
  if(e.kind==='image') {const obs=new IntersectionObserver(hits=>{if(!hits.some(x=>x.isIntersecting))return;obs.disconnect();
    api.thumb(e.id).then(url=>{if(url){const i=element('img');i.alt=e.name;i.src=url;tile.replaceChildren(i);}}).catch(()=>{});});
    obs.observe(tile);row._cleanup=()=>obs.disconnect();}
  const name=element('strong','',e.name);name.title=e.name;info.append(name);
  info.append(element('span','line',fmt.format(e.created)+' · '+e.source));
  if(e.kind!=='file'){
    const label=e.kind==='image'?'复制图片':'复制';
    buttons.append(button(label,async()=>{await api.copy(e.id);notice('已复制，可以粘贴');}));
  }
  buttons.append(button('另存为',async()=>{if(await api.export(e.id))notice('已另存');},e.kind==='file'?'':'more'));
  row.append(tile,info,buttons);return row;
}
async function refresh(more=false){
  const id=++revision;if(!more)offset=0;
  const result=await api.list(kind,$('search').value,offset);
  if(id!==revision)return;
  const list=$('list');if(!more){for(const r of list.children)r._cleanup?.();list.replaceChildren();list.scrollTop=0;}
  list.querySelector('.load')?.remove();
  for(const e of result)list.append(card(e));offset+=result.length;
  if(offset===0){const empty=element('div','empty');const filtered=Boolean(kind||$('search').value);
    empty.append(element('h2','',filtered?'没有匹配的记录':'还没有收存内容'),element('p','',filtered?'换个关键词或类型试试。':'在微信接收页下载第一张图片，以后随时回来复制。'));
    if(!filtered)empty.append(button('打开微信接收',()=>setPane('wechat')));
    list.append(empty);
  }else if(result.length===40)list.append(button('更多记录',()=>refresh(true),'load'));
}
for(const [key,title] of Object.entries(names)){
  const b=button(title,async()=>{kind=key;for(const x of $('filters').children)x.classList.toggle('chosen',x===b);await refresh();});b.classList.toggle('chosen',key==='');$('filters').append(b);
}
function click(id,fn){$(id).addEventListener('click',()=>run(fn));}
$('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>run(()=>refresh()),120);});
click('toHistory',()=>setPane('history'));click('toWx',()=>setPane('wechat'));click('fold',()=>api.fold());click('pill',()=>api.fold());
click('add',()=>$('addBox').showModal());click('settings',async()=>{if(mode==='wechat')await setPane('history');$('prefs').showModal();});
click('reconnect',()=>api.reloadWechat());click('quit',()=>api.quit());
$('autorun').onchange=()=>run(async()=>{$('autorun').checked=await api.startup($('autorun').checked);});
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
click('saveNote',async()=>{await api.note($('draft').value);$('draft').value='';$('addBox').close();notice('已保存到此电脑');});
click('paste',async()=>{$('addBox').close();await api.paste();notice('已保存到此电脑');});
click('import',async()=>{$('addBox').close();const n=await api.import();if(n)notice('已保存 '+n+' 个文件');});
api.onUpdate(m=>{if(m.state)showState(m.state);if(m.changed)run(()=>refresh());if(m.message)notice(m.message);});
run(async()=>{showState(await api.status());await refresh();});
