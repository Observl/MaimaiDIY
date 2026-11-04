export function initializeLightDial(element, onChange) {
  const min=-150,max=150;
  let value=0,drag=null;
  const output=document.querySelector('#acrylic-light-value');
  function set(next) {
    const previous=value;
    value=Math.max(min,Math.min(max,Math.round(next)));
    element.setAttribute('aria-valuenow',String(value));
    element.setAttribute('aria-valuetext',`${value} 度`);
    element.style.setProperty('--tick-offset',`${-value*1.5}px`);
    output.textContent=`${value}°`;
    if(previous!==value)onChange(value);
  }
  element.addEventListener('pointerdown',(event)=>{
    if(event.button!==0)return;
    event.preventDefault();element.focus();
    drag={id:event.pointerId,x:event.clientX,value};
    element.setPointerCapture(event.pointerId);
    element.dataset.dragging='true';
  });
  element.addEventListener('pointermove',(event)=>{
    if(drag?.id===event.pointerId)set(drag.value+(event.clientX-drag.x)*0.6);
  });
  const stop=(event)=>{if(drag?.id!==event.pointerId)return;drag=null;delete element.dataset.dragging;};
  element.addEventListener('pointerup',stop);element.addEventListener('pointercancel',stop);element.addEventListener('lostpointercapture',stop);
  element.addEventListener('keydown',(event)=>{
    const step=event.shiftKey?10:1;
    const values={ArrowLeft:value-step,ArrowDown:value-step,ArrowRight:value+step,ArrowUp:value+step,PageDown:value-15,PageUp:value+15,Home:min,End:max};
    if(Object.hasOwn(values,event.key)){event.preventDefault();set(values[event.key]);}
  });
  set(0);
  return {get value(){return value;},set};
}
