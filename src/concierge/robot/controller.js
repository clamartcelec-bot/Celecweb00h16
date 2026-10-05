// The approved layered skin stays editable; Vite fingerprints the two textures.
import skin from '@/concierge/robot/skin.svg?raw';
import characterUrl from '@/concierge/robot/character.png';
import accessoriesUrl from '@/concierge/robot/accessories-pink.png';
(() => {
  "use strict";
  if (typeof window === "undefined" || customElements.get("robot-majordome")) return;
  const SVG = skin.replace('../assets/character.png', characterUrl)
    .replace('../assets/accessories-pink.png', accessoriesUrl);
  const STYLE = `:host{display:inline-block;width:280px;aspect-ratio:552/458;line-height:0;vertical-align:middle;contain:layout style}:host([hidden]){display:none}svg{display:block;width:100%;height:100%;overflow:visible}:host([quality="low"]) [filter]{filter:none}:host([no-shadow]) [data-part="shadow"]{display:none}:host([no-toolbox]) [data-part="toolbox"]{display:none}`;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const LIMITS = {gazeX:[-1,1],gazeY:[-1,1],headTilt:[-12,12],headPitch:[-1,1],hatLift:[0,38],hatTilt:[-12,12],armLeft:[-70,70],armRight:[-70,70],blink:[0,1],eyeHeight:[.08,1.2],happy:[0,1],brow:[0,1],browLeft:[-1,1],browRight:[-1,1],browTiltLeft:[-20,20],browTiltRight:[-20,20],mouthOpen:[0,1],x:[-200,200],y:[-200,200],scale:[.8,1.2],headYaw:[-1,1],antennaTilt:[-20,20],antennaLight:[0,1],motionIntensity:[0,1]};
  const HOME = {gazeX:0,gazeY:0,headTilt:0,headPitch:0,hatLift:0,hatTilt:0,armLeft:0,armRight:0,blink:0,eyeHeight:1,happy:0,brow:0,browLeft:0,browRight:0,browTiltLeft:0,browTiltRight:0,mouthOpen:0,x:0,y:0,scale:1,headYaw:0,antennaTilt:0,antennaLight:.7,motionIntensity:.65,morph:0};
  const MOUTHS = {
    friendly:[554,654,578,683,625,688,651,655,626,665,580,665,554,654],
    neutral:[571,665,590,665,617,665,635,665,615,671,590,671,571,665],
    happy:[545,648,572,700,634,700,660,649,628,668,578,668,545,648],
    listening:[565,655,583,684,622,684,641,655,620,666,585,666,565,655],
    thinking:[571,671,587,661,617,661,635,667,614,670,590,673,571,671],
    surprised:[605,641,638,641,638,694,605,694,572,694,572,641,605,641],
    speaking:[570,651,586,643,623,643,640,651,651,700,558,700,570,651],
    worried:[562,679,577,650,628,650,647,679,622,669,586,669,562,679],
    sleeping:[578,668,590,668,616,668,630,668,615,673,592,673,578,668]
  };
  const STATES = {
    idle:{expression:"friendly"},
    listening:{expression:"listening",eyeHeight:1.08,headTilt:-3,antennaLight:1,browLeft:.25,browRight:.35},
    thinking:{expression:"thinking",gazeX:-.55,gazeY:-.55,headTilt:5,eyeHeight:.85,browLeft:.45,browRight:-.15,browTiltRight:-8},
    speaking:{expression:"speaking"},
    success:{expression:"happy",happy:1,armLeft:-20,armRight:12,antennaLight:1,browLeft:.4,browRight:.4},
    error:{expression:"worried",brow:.6,eyeHeight:.85,headTilt:-4,browLeft:.25,browRight:.25},
    sleeping:{expression:"sleeping",eyeHeight:.12,headPitch:.5,antennaLight:.12,browLeft:-.4,browRight:-.4}
  };
  const path = a => `M${a[0]} ${a[1]}C${a.slice(2,8).join(" ")}C${a.slice(8).join(" ")}Z`;
  const ease = t => 1 - (1-t)**3;
  class RobotMajordome extends HTMLElement {
    static observedAttributes = ["state","label","follow-pointer","auto-blink","still"];
    constructor() {
      super();
      this.attachShadow({mode:"open"});
      this.shadowRoot.innerHTML = `<style>${STYLE}</style>${SVG}`;
      this.parts = Object.fromEntries([...this.shadowRoot.querySelectorAll("[data-part]")].map(n=>[n.dataset.part,n]));
      this.current = {...HOME};
      MOUTHS.friendly.forEach((n,i)=>this.current[`m${i}`]=n);
      this.target = {...this.current};
      this.jobs = new Map();
      this.raf = 0;
      this.blinkTimer = 0;
      this.serial = 0;
      this.activeGesture = null;
      this.ready = false;
      this.mode = "idle";
      this.reduced = false;
      this.visible = true;
      this._frame = this._frame.bind(this);
      this._pointer = e => this.lookAtPoint(e.clientX,e.clientY);
      this._resetLook = () => this.lookAt(0,0);
      this._visibility = () => { if(document.hidden) this._settle(); else this._wake(); this._autoBlink(); };
      this._motion = () => {this.reduced=this.media.matches; if(this.reduced)this._settle(); else this._wake(); this._autoBlink();};
      this._render();
    }
    connectedCallback() {
      this.ready = true;
      this.media = matchMedia("(prefers-reduced-motion: reduce)");
      this.reduced = this.media.matches;
      this.media.addEventListener("change",this._motion);
      document.addEventListener("visibilitychange",this._visibility);
      this.observer = new IntersectionObserver(entries=>{
        this.visible=entries[0].isIntersecting;
        if(!this.visible)this._settle(); else this._wake();
        this._autoBlink();
      });
      this.observer.observe(this);
      this._label(); this._pointerBinding();
      this.setState(this.getAttribute("state") || "idle", {duration:0});
      this._autoBlink();this._wake();
    }
    disconnectedCallback() {
      this.ready=false; this.serial++;
      this._cancelGesture();
      cancelAnimationFrame(this.raf); this.raf=0;
      clearTimeout(this.blinkTimer);
      this.jobs.clear();
      this.observer?.disconnect();
      this.media?.removeEventListener("change",this._motion);
      document.removeEventListener("visibilitychange",this._visibility);
      window.removeEventListener("pointermove",this._pointer);
      document.documentElement.removeEventListener("pointerleave",this._resetLook);
    }
    attributeChangedCallback(name,oldValue,value) {
      if(oldValue===value || !this.ready)return;
      if(name==="state")this.setState(value || "idle");
      if(name==="label")this._label();
      if(name==="follow-pointer")this._pointerBinding();
      if(name==="auto-blink")this._autoBlink();
      if(name==="still"){if(this.hasAttribute("still"))this._settle();else this._wake();}
    }
    _label() {this.shadowRoot.querySelector("title").textContent=this.getAttribute("label") || "Robot majordome";}
    _pointerBinding() {
      window.removeEventListener("pointermove",this._pointer);
      document.documentElement.removeEventListener("pointerleave",this._resetLook);
      if(this.hasAttribute("follow-pointer")){
        window.addEventListener("pointermove",this._pointer,{passive:true});
        document.documentElement.addEventListener("pointerleave",this._resetLook);
      }
    }
    _autoBlink() {
      clearTimeout(this.blinkTimer);
      if(this.ready && this.visible && !document.hidden && !this.reduced && this.mode!=="sleeping" && this.hasAttribute("auto-blink")){
        this.blinkTimer=setTimeout(async()=>{if(!this.activeGesture)await this.blink();this._autoBlink();},4300);
      }
    }
    _emit(name,detail){this.dispatchEvent(new CustomEvent(name,{detail,bubbles:true,composed:true}));}
    _settle(){
      cancelAnimationFrame(this.raf);this.raf=0;
      Object.assign(this.current,this.target);this.jobs.clear();this._render();
    }
    _tween(values,duration=240) {
      const ms = clamp(Number.isFinite(duration)?duration:240,0,2500);
      const instant=!this.ready || this.reduced || !this.visible || document.hidden || ms===0;
      const start=performance.now();
      for(const [key,value] of Object.entries(values)){
        if(!Number.isFinite(value))continue;
        if(Math.abs((this.target[key]??0)-value)<.00001 && !(instant && this.jobs.has(key)))continue;
        this.target[key]=value;
        if(instant){this.current[key]=value;this.jobs.delete(key);}
        else this.jobs.set(key,{from:this.current[key]??0,to:value,start,duration:ms});
      }
      if(instant)this._render();
      if(!this.jobs.size && !this._isAlive() && this.raf){cancelAnimationFrame(this.raf);this.raf=0;}
      if((this.jobs.size || this._isAlive()) && !this.raf)this.raf=requestAnimationFrame(this._frame);
    }
    _frame(now){
      this.raf=0;
      for(const [key,job] of this.jobs){
        const t=clamp((now-job.start)/job.duration,0,1);
        this.current[key]=job.from+(job.to-job.from)*ease(t);
        if(t===1)this.jobs.delete(key);
      }
      this._render();
      if(this.jobs.size || this._isAlive())this.raf=requestAnimationFrame(this._frame);
    }
    _isAlive(){return this.ready && this.visible && !document.hidden && !this.reduced && !this.hasAttribute("still") && this.target.motionIntensity>0;}
    _wake(){if(!this.raf && this._isAlive())this.raf=requestAnimationFrame(this._frame);}
    _render(){
      const p=this.current, el=this.parts;
      const t=performance.now()/1000;
      const a=this._isAlive()?p.motionIntensity:0;
      const float=Math.sin(t*1.8)*5*a;
      const swivel=Math.sin(t*1.45)*.9*a;
      const bob=Math.sin(t*2.1)*1.5*a;
      const antenna=p.antennaTilt+(Math.sin(t*4.1)*3.5+Math.sin(t*2.3)*1.8)*a;
      el.position.setAttribute("transform",`translate(${p.x*2.09} ${p.y*2.09+float})`);
      el.body.setAttribute("transform",`translate(605 805) scale(${p.scale}) translate(-605 -805)`);
      el.head.setAttribute("transform",`translate(${p.headYaw*12} ${p.headPitch*13}) rotate(${p.headTilt+swivel} 605 805) translate(605 805) scale(${1-Math.abs(p.headYaw)*.045} ${1-Math.abs(p.headPitch)*.055}) translate(-605 -805)`);
      el.hat.setAttribute("transform",`translate(0 ${-p.hatLift*2.09}) rotate(${p.hatTilt} 656 265)`);
      el["hat-contact"].setAttribute("opacity",String(.1*(1-p.hatLift/44)));
      el["arm-left"].setAttribute("transform",`translate(0 ${bob}) rotate(${p.armLeft+Math.sin(t*1.7)*1.8*a} 907 796)`);
      el["arm-right"].setAttribute("transform",`translate(0 ${-bob}) rotate(${p.armRight+Math.sin(t*1.7+.8)*1.3*a} 289 829)`);
      el.antenna.setAttribute("transform",`rotate(${antenna} 775 254)`);
      el["antenna-led"].setAttribute("opacity",String(p.antennaLight*(.65+Math.sin(t*4.2)*.25*a)));
      // The cyan eye stays almost fixed; each dark pupil travels independently.
      // Clipping in the SVG keeps the pupil inside its eye at the gaze limits.
      el.gaze.setAttribute("transform","translate(0 0)");
      for(const [key,cx,cy,travelX,travelY,lag] of [["eye-left",468,578,22,12,0],["eye-right",741,591,20,11,.045]]){
        const close=clamp((p.blink-lag)/(1-lag),0,1);
        const height=Math.max(.055,p.eyeHeight*(1-close*.945));
        el[key].setAttribute("transform",`translate(${p.gazeX*2.2} ${p.gazeY*1.4}) translate(${cx} ${cy}) scale(1 ${height}) translate(${-cx} ${-cy})`);
        el[key].querySelector('[data-eye="pupil"]').setAttribute("transform",`translate(${p.gazeX*travelX+p.headYaw*3} ${p.gazeY*travelY})`);
        el[key].querySelector('[data-eye="pill"]').setAttribute("opacity",String(1-p.happy));
        el[key].querySelector('[data-eye="arc"]').setAttribute("opacity",String(p.happy));
      }
      // Both eyebrows remain visible. Blink adds a shared soft downward nod.
      const browBlink=p.blink*8;
      el["brow-left"].setAttribute("transform",`translate(0 ${-p.browLeft*20+browBlink-p.happy*4}) rotate(${p.browTiltLeft-p.brow*12+p.blink*2} 471 452)`);
      el["brow-right"].setAttribute("transform",`translate(0 ${-p.browRight*20+browBlink*.92-p.happy*4}) rotate(${p.browTiltRight+p.brow*12-p.blink*2} 737 460)`);
      let mouth=Array.from({length:14},(_,i)=>p[`m${i}`]);
      if(p.mouthOpen>.001){
        const speech=[574,656,586,653-20*p.mouthOpen,624,653-20*p.mouthOpen,637,656,650,665+48*p.mouthOpen,561,665+48*p.mouthOpen,574,656];
        const weight=Math.min(p.mouthOpen*8,1);
        mouth=mouth.map((v,i)=>v+(speech[i]-v)*weight);
      }
      const blend=Math.max(p.morph,Math.min(p.mouthOpen*8,1));
      el["mouth-original"].setAttribute("opacity",String(1-blend));
      el["mouth-shape"].setAttribute("opacity",String(blend));
      el["mouth-shape"].setAttribute("d",path(mouth));
    }
    setPose(patch={},options={}){
      if(!patch || typeof patch!=="object")throw new TypeError("setPose expects an object");
      const safe={};
      for(const key of Object.keys(LIMITS)){
        if(key in patch){
          if(typeof patch[key]!=="number" || !Number.isFinite(patch[key]))throw new TypeError(`Invalid ${key}`);
          safe[key]=clamp(patch[key],...LIMITS[key]);
        }
      }
      if(patch.expression!==undefined){
        if(!Object.hasOwn(MOUTHS,patch.expression))throw new RangeError("Unknown expression");
        MOUTHS[patch.expression].forEach((n,i)=>safe[`m${i}`]=n);
        safe.morph=patch.expression==="friendly"?0:1;
        if(patch.happy===undefined)safe.happy=patch.expression==="happy"?1:0;
        if(patch.eyeHeight===undefined)safe.eyeHeight=patch.expression==="sleeping"?.12:1;
      }
      this._tween(safe,options.duration??240);
      return this;
    }
    setState(state,options={}){
      if(!Object.hasOwn(STATES,state))throw new RangeError(`Unknown robot state: ${state}`);
      this.serial++;this._cancelGesture();
      this.mode=state;
      // Global position is retained when a conversational state changes.
      this.setPose({...HOME,x:this.target.x,y:this.target.y,scale:this.target.scale,motionIntensity:this.target.motionIntensity,...STATES[state]},options);
      this._autoBlink();
      this._emit("robot:statechange",{state});return this;
    }
    lookAt(x=0,y=0){return this.setPose({gazeX:x,gazeY:y},{duration:160});}
    lookAtPoint(clientX,clientY){
      if(!Number.isFinite(clientX)||!Number.isFinite(clientY))throw new TypeError("Expected viewport coordinates");
      const r=this.getBoundingClientRect();
      if(!r.width||!r.height)return this;
      return this.lookAt((clientX-r.left-r.width*.5)/(r.width*.7),(clientY-r.top-r.height*.52)/(r.height*.7));
    }
    lookAtElement(target){
      const el=typeof target==="string"?document.querySelector(target):target;
      if(!(el instanceof Element))throw new TypeError("Target element not found");
      const r=el.getBoundingClientRect();return this.lookAtPoint(r.left+r.width/2,r.top+r.height/2);
    }
    setMotion(enabled){if(typeof enabled!=="boolean")throw new TypeError("Expected a boolean");this.toggleAttribute("still",!enabled);return this;}
    setToolbox(visible){if(typeof visible!=="boolean")throw new TypeError("Expected a boolean");this.toggleAttribute("no-toolbox",!visible);return this;}
    setAmplitude(value){return this.setPose({mouthOpen:value},{duration:80});}
    moveTo({x=0,y=0,scale=1}={},options={}){return this.setPose({x,y,scale},options);}
    reset(){this.setState("idle");return this.moveTo({x:0,y:0,scale:1});}
    _cancelGesture(){
      const active=this.activeGesture;
      if(!active)return;
      clearTimeout(active.timer);
      this.activeGesture=null;
      const restore={};
      for(const key of active.keys)restore[key]=active.base[key];
      this._tween(restore,0);
      this._emit("robot:actionend",{action:active.name,cancelled:true});
      active.resolve({action:active.name,cancelled:true});
    }
    _gesture(name,steps){
      this._cancelGesture();
      const token=++this.serial;
      const base={...this.target};
      const keys=[...new Set(steps.flatMap(s=>Object.keys(s.pose)))];
      this._emit("robot:actionstart",{action:name});
      if(this.reduced||!this.ready||!this.visible||document.hidden){
        this._emit("robot:actionend",{action:name,cancelled:false,reduced:true});
        return Promise.resolve({action:name,cancelled:false});
      }
      return new Promise(resolve=>{
        const active={name,resolve,timer:0,base,keys};
        this.activeGesture=active;
        let index=0;
        const next=()=>{
          if(token!==this.serial||!this.ready)return;
          if(index===steps.length){
            const restore=Object.fromEntries(keys.map(key=>[key,base[key]]));
            this._tween(restore,200);
            active.timer=setTimeout(()=>{
              this.activeGesture=null;
              this._emit("robot:actionend",{action:name,cancelled:false});
              resolve({action:name,cancelled:false});
            },210);
            return;
          }
          const step=steps[index++];
          this.setPose(step.pose,{duration:step.ms});
          active.timer=setTimeout(next,step.ms+16);
        };
        next();
      });
    }
    blink(){return this._gesture("blink",[{pose:{blink:1},ms:85},{pose:{blink:0},ms:110}]);}
    wave(){return this._gesture("wave",[{pose:{armLeft:-45,antennaTilt:-5},ms:270},{pose:{armLeft:-20,antennaTilt:6},ms:170},{pose:{armLeft:-55,antennaTilt:-5},ms:170},{pose:{armLeft:-25},ms:170}]);}
    nod(){return this._gesture("nod",[{pose:{headPitch:.85,gazeY:.45},ms:200},{pose:{headPitch:0,gazeY:0},ms:230}]);}
    bow(){return this._gesture("bow",[{pose:{headPitch:1,gazeY:.8,armLeft:12,armRight:-12},ms:350},{pose:{headPitch:.4},ms:160}]);}
    tipHat(){return this._gesture("tipHat",[{pose:{hatLift:30,hatTilt:-7,headTilt:4},ms:320},{pose:{hatLift:36,hatTilt:-3,headTilt:0},ms:180}]);}
    hands(){return this._gesture("hands",[{pose:{armLeft:-26,armRight:12},ms:280},{pose:{armLeft:15,armRight:-14},ms:300},{pose:{armLeft:-32,armRight:20},ms:280}]);}
    wiggleAntenna(){return this._gesture("antenna",[{pose:{antennaTilt:-15,antennaLight:1},ms:130},{pose:{antennaTilt:15},ms:160},{pose:{antennaTilt:-9},ms:160},{pose:{antennaTilt:6},ms:180}]);}
    greet(){return this._gesture("greet",[{pose:{hatLift:24,hatTilt:-5,armLeft:-35,antennaLight:1},ms:320},{pose:{armLeft:-55,antennaTilt:8},ms:220},{pose:{armLeft:-25,antennaTilt:-7},ms:220},{pose:{hatLift:0,hatTilt:0,armLeft:-45},ms:300}]);}
    dance(){return this._gesture("dance",[{pose:{x:-22,y:-10,headTilt:-7,armLeft:-30,armRight:15,antennaTilt:9},ms:280},{pose:{x:22,y:-4,headTilt:7,armLeft:15,armRight:-16,antennaTilt:-9},ms:320},{pose:{x:-15,y:-15,hatLift:15,headTilt:-7,armLeft:-35,armRight:20},ms:300},{pose:{x:15,y:0,hatLift:0,headTilt:6,armLeft:20,armRight:-10},ms:300}]);}
    forwardDown(){return this._gesture("forwardDown",[{pose:{scale:1.12,y:-10,antennaTilt:7},ms:350},{pose:{scale:1.05,y:45,headPitch:.6,gazeY:.7},ms:450}]);}
    /** Explicit allowlist suitable for JSON from your app or an AI tool. */
    dispatchAction(command){
      if(!command || typeof command!=="object")throw new TypeError("Expected an action object");
      const {type}=command;
      switch(type){
        case "state":return this.setState(command.value);
        case "expression":return this.setPose({expression:command.value});
        case "look":return this.lookAt(command.x??0,command.y??0);
        case "speak":return this.setAmplitude(command.amplitude);
        case "move":return this.moveTo({x:command.x??0,y:command.y??0,scale:command.scale??1});
        case "hat":return this.setPose({hatLift:command.lift??0,hatTilt:command.tilt??0});
        case "brows":return this.setPose({browLeft:command.left??0,browRight:command.right??0,browTiltLeft:command.tiltLeft??0,browTiltRight:command.tiltRight??0});
        case "wave":return this.wave();
        case "nod":return this.nod();
        case "bow":return this.bow();
        case "tipHat":return this.tipHat();
        case "blink":return this.blink();
        case "hands":return this.hands();
        case "antenna":return this.wiggleAntenna();
        case "greet":return this.greet();
        case "dance":return this.dance();
        case "forwardDown":return this.forwardDown();
        case "motion":return this.setMotion(command.enabled);
        case "toolbox":return this.setToolbox(command.visible);
        case "reset":return this.reset();
        default:throw new RangeError(`Unknown robot action: ${String(type)}`);
      }
    }
    getState(){return {state:this.mode,pose:{...this.target}};}
  }
  customElements.define("robot-majordome",RobotMajordome);
})();
