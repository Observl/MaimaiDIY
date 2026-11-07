import {test,expect} from '@playwright/test';

test('actual WebGL grain functions redistribute glints with view and light, without temporal noise',async({page})=>{
  await page.goto('/custom-order.html',{waitUntil:'domcontentloaded'});
  const results=await page.evaluate(async()=>{
    const {GRANULAR_REFLECTION_GLSL}=await import('/src/granular-reflection.js');
    const {POWDER_MICRORELIEF_GLSL}=await import('/src/powder-microrelief.js');
    const canvas=document.createElement('canvas');canvas.width=384;canvas.height=160;
    const gl=canvas.getContext('webgl2',{antialias:false});
    if(!gl)throw Error('WebGL2 unavailable');
    const compile=(type,source)=>{
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vertex=compile(gl.VERTEX_SHADER,`#version 300 es
      void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`);
    const fragment=compile(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;
      uniform vec3 eye,light;uniform int mode;
      const float lab_powderDensity=0.61,lab_powderSize=2.5,lab_powderSlope=1.8,lab_powderSharpness=0.85,lab_randomness=1.0;
      float printHash(vec2 p){vec3 h=fract(vec3((p+142.0*17.13).xyx)*0.1031);h+=dot(h,h.yzx+33.33);return fract((h.x+h.y)*h.z);}
      ${GRANULAR_REFLECTION_GLSL}
      ${POWDER_MICRORELIEF_GLSL}
      out vec4 color;
      void main(){
        vec2 uv=gl_FragCoord.xy/vec2(384.0,160.0);float response;
        vec2 position=uv*vec2(11.91,4.91);float footprint=max(length(dFdx(position)),length(dFdy(position)));
        if(mode==0){float shadow,sheen;powderMicrorelief(position,footprint,eye,light,light,shadow,sheen);response=sheen;}
        else {vec2 id=floor(uv*vec2(96.0,40.0));vec3 facet=grainFacet(printHash(id+19.0),printHash(id+53.0),1.6);response=1.0-exp(-grainReflection(facet,eye,light,0.85)*5.0);}
        color=vec4(vec3(response),1.0);
      }`);
    const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);gl.viewport(0,0,384,160);
    const dir=a=>{const r=a*Math.PI/180;return [Math.sin(r),0,Math.cos(r)];};
    const render=(mode,view,light)=>{
      gl.uniform1i(gl.getUniformLocation(program,'mode'),mode);
      gl.uniform3fv(gl.getUniformLocation(program,'eye'),dir(view));
      gl.uniform3fv(gl.getUniformLocation(program,'light'),dir(light));
      gl.drawArrays(gl.TRIANGLES,0,3);
      const data=new Uint8Array(384*160*4);gl.readPixels(0,0,384,160,gl.RGBA,gl.UNSIGNED_BYTE,data);
      return data.filter((_,i)=>i%4===0);
    };
    const result=[];
    for(const mode of [0,1]) {
      const first=render(mode,-45,-30),again=render(mode,-45,-30),turn=render(mode,45,-30),sweep=render(mode,-45,45);
      const changed=other=>first.reduce((n,x,i)=>n+(Math.abs(x-other[i])>20?1:0),0);
      result.push({mode,stationary:first.every((x,i)=>x===again[i]),viewChanged:changed(turn),lightChanged:changed(sweep),
        angleCoverage:[-65,-35,0,35,65].map(a=>render(mode,a,-30).reduce((n,x)=>n+(x>50?1:0),0)),
        behind:render(mode,0,150).some(x=>x>0),error:gl.getError()});
    }
    gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
    gl.getExtension('WEBGL_lose_context')?.loseContext();return result;
  });
  for(const result of results) {
    expect(result.error).toBe(0);expect(result.stationary).toBe(true);expect(result.behind).toBe(false);
    expect(result.viewChanged).toBeGreaterThan(1500);expect(result.lightChanged).toBeGreaterThan(1500);
    for(const coverage of result.angleCoverage)expect(coverage).toBeGreaterThan(1000);
  }
});
