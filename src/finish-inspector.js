const regions = {
  'rank-border': '段位外框亮边', 'rank-emblems': '段位亮边与装饰徽记',
  'battle-emblems': '皇冠与外围装饰', 'title-rails': '称号上下边轨与端部',
  'plate-wings': '外框亮边与两侧羽饰', 'plate-mirror': '金属边框与星形装饰', 'plate-border': '外框金属亮边',
};
export function initializeFinishInspector() {
  const root=document.querySelector('#finish-inspector');
  const canvas=document.querySelector('#finish-overlay');
  const ctx=canvas.getContext('2d');
  const uv=document.querySelector('#show-uv-mask'), glitter=document.querySelector('#show-glitter-mask');
  let base, masks, entries=[], variant='basic', cardOnly=false;
  function paint() {
    if(!base) return;
    const result=ctx.createImageData(canvas.width,canvas.height);
    result.data.set(base.data);
    for(let i=0;i<result.data.length;i+=4) {
      const u=uv.checked && masks[i]>12, g=glitter.checked && masks[i+1]>12;
      if(!u && !g) continue;
      const pixel=i/4, x=pixel%canvas.width, y=Math.floor(pixel/canvas.width);
      const orange=u && (!g || (x+y)%16<8);
      const color=orange ? [255,104,0] : [0,220,255];
      for(let c=0;c<3;c++) result.data[i+c]=base.data[i+c]*0.25+color[c]*0.75;
    }
    ctx.putImageData(result,0,0);
    canvas.dataset.uv=String(uv.checked); canvas.dataset.glitter=String(glitter.checked);
  }
  function list() {
    const message=document.querySelector('#finish-enabled-state');
    message.textContent=cardOnly ? '当前为镭射收藏卡，未应用亚克力 UV / 闪粉工艺。' : variant==='basic'
      ? '当前基础款：未启用 UV 和闪粉。彩色标记显示可用的蒙版位置。'
      : variant==='light' ? '当前轻量特效款：启用 UV；未启用闪粉。' : '当前高配特效款：启用 UV 和闪粉。';
    const container=document.querySelector('#finish-collectibles');
    container.replaceChildren();
    if(!entries.length) { container.textContent='当前设计没有配置这些特效的收藏品。'; return; }
    for(const item of entries) {
      const row=document.createElement('li');
      const name=document.createElement('strong'); name.textContent=item.name;
      const text=document.createElement('span');
      const configured=[item.uvPixels ? 'UV 高光' : '',item.glitterPixels ? `${item.rainbow>0.5?'虹彩':item.tint[0]>item.tint[2]?'金色':'银色'}闪粉` : ''].filter(Boolean);
      const enabled=[!cardOnly && variant!=='basic' && item.uvPixels ? 'UV' : '', !cardOnly && variant==='premium' && item.glitterPixels ? '闪粉' : ''].filter(Boolean);
      text.textContent=`${regions[item.shape]} · ${configured.join('、') || '当前没有可见蒙版'} · ${enabled.length ? '已启用 '+enabled.join('、') : '当前未启用'}`;
      row.append(name,text); container.append(row);
    }
  }
  uv.addEventListener('change',paint); glitter.addEventListener('change',paint);
  document.querySelector('#finish-zoom').addEventListener('input',(event)=>{
    const value=Number(event.target.value); canvas.style.width=`${value*100}%`;
    document.querySelector('#finish-zoom-value').textContent=`${value}×`;
  });
  return {
    update(source, maps) {
      ctx.drawImage(source,0,0,canvas.width,canvas.height); base=ctx.getImageData(0,0,canvas.width,canvas.height);
      const packed=maps.packed.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
      masks=packed.data; entries=maps.entries;
      root.hidden=false; paint(); list();
    },
    select(nextVariant,nextCardOnly) { variant=nextVariant; cardOnly=nextCardOnly; list(); },
    clear() { root.hidden=true; base=null; entries=[]; },
  };
}
