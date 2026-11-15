import { DEFAULT_LIGHT_ANGLE, MIN_LIGHT_ANGLE as min, MAX_LIGHT_ANGLE as max } from './finish-settings.js';

export function initializeLightDial(element, onChange) {
  let value=DEFAULT_LIGHT_ANGLE,drag=null;
  const output=document.querySelector('#acrylic-light-value');
  element.setAttribute('aria-valuemin',String(min));
  element.setAttribute('aria-valuemax',String(max));
  function set(next) {
    const previous=value;
    value=Math.max(min,Math.min(max,Math.round(next)));
    element.setAttribute('aria-valuenow',String(value));
    element.setAttribute('aria-valuetext',value === 0 ? '正前方，0 度' : `${value < 0 ? '左' : '右'} ${Math.abs(value)} 度`);
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
  set(DEFAULT_LIGHT_ANGLE);
  return {get value(){return value;},set};
}
