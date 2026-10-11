const $ = (id) => document.getElementById(id);
const defaults = {
  cart_mass: 5, pole_mass: 2, pole_length: 4, damping: 1,
  initial_position: 1, initial_angle_deg: 5.7, q_position: 1, q_angle: 1,
  r_control: 1, controller_enabled: true
};
let result = null, frame = 0, playing = false, animationHandle = null;
let stateChart = null, controlChart = null, lastTick = 0;
$("year").textContent = new Date().getFullYear();

const rangeIds = Object.keys(defaults).filter(id => id !== "controller_enabled");
const units = {cart_mass:" kg", pole_mass:" kg", pole_length:" m", damping:"",
  initial_position:" m", initial_angle_deg:"°", q_position:"", q_angle:"", r_control:""};
function readForm() {
  const payload = {};
  rangeIds.forEach(id => payload[id] = Number($(id).value));
  payload.controller_enabled = $("controller_enabled").checked;
  payload.duration = 20;
  payload.sample_time = 0.05;
  return payload;
}
function updateLabels() {
  rangeIds.forEach(id => { $(id+"_val").textContent = Number($(id).value).toFixed(id.includes("q_") || id==="r_control" ? 1 : (id==="initial_angle_deg" ? 1 : 1)) + (units[id] || ""); });
}
rangeIds.forEach(id => $(id).addEventListener("input", updateLabels));
updateLabels();

function setupCharts(data) {
  if (!window.Chart) { $("message").textContent = "Simulation ready. Charts need an internet connection to load."; return; }
  const labels = data.time.map(t => Number(t.toFixed(2)));
  const states = data.states;
  const common = {responsive:true, maintainAspectRatio:false, animation:false,
    interaction:{mode:"index",intersect:false},
    plugins:{legend:{labels:{color:"#aab8cd",boxWidth:10,font:{size:10}}}},
    scales:{x:{ticks:{color:"#71819a",maxTicksLimit:7},grid:{color:"#233149"},title:{display:true,text:"Time (s)",color:"#8d9bb2"}},
      y:{ticks:{color:"#71819a"},grid:{color:"#233149"}}}};
  if (stateChart) stateChart.destroy();
  if (controlChart) controlChart.destroy();
  stateChart = new Chart($("stateChart"), {type:"line",data:{labels,datasets:[
    {label:"Cart position (m)",data:states.map(s=>s[0]),borderColor:"#ffc857",borderWidth:2,pointRadius:0,tension:.15,yAxisID:"y"},
    {label:"Pole angle (rad)",data:states.map(s=>s[2]),borderColor:"#45d7e8",borderWidth:2,pointRadius:0,tension:.15,yAxisID:"y1"},
    {label:"Target",data:labels.map(()=>0),borderColor:"#67e8a5",borderDash:[5,5],borderWidth:1,pointRadius:0,yAxisID:"y"}
  ]},options:{...common,scales:{...common.scales,y:{...common.scales.y,position:"left"},y1:{position:"right",ticks:{color:"#71819a"},grid:{drawOnChartArea:false}}}}});
  controlChart = new Chart($("controlChart"), {type:"line",data:{labels,datasets:[
    {label:"Control force (N)",data:data.control,borderColor:"#6c8cff",backgroundColor:"#6c8cff18",fill:true,borderWidth:2,pointRadius:0,tension:.15}
  ]},options:common});
}
function drawScene(state) {
  const canvas = $("scene"), ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1, rect = canvas.getBoundingClientRect();
  if (canvas.width !== Math.round(rect.width*dpr) || canvas.height !== Math.round(rect.height*dpr)) {
    canvas.width = Math.round(rect.width*dpr); canvas.height = Math.round(rect.height*dpr);
  }
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const w=rect.width,h=rect.height;
  ctx.clearRect(0,0,w,h);
  const ground = h*.78, scale = Math.min(w/11,h/5.5), center=w/2;
  // Subtle grid
  ctx.strokeStyle="#1b2b40";ctx.lineWidth=1;
  for(let x=0;x<w;x+=28){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<h;y+=28){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  ctx.strokeStyle="#60728b";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,ground+18);ctx.lineTo(w,ground+18);ctx.stroke();
  const cartX=center+state[0]*scale, cartW=Math.min(84,scale*2.1), cartH=27, cartY=ground-cartH;
  // Target position marker
  ctx.strokeStyle="#67e8a5";ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(center,ground-45);ctx.lineTo(center,ground+17);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle="#67e8a520";ctx.fillRect(center-3,ground+2,6,15);
  // Wheels
  for(const dx of [-cartW*.32,cartW*.32]){ctx.beginPath();ctx.arc(cartX+dx,ground+5,8,0,Math.PI*2);ctx.fillStyle="#8393aa";ctx.fill();ctx.strokeStyle="#d1d9e6";ctx.stroke();}
  ctx.fillStyle="#ffc857";ctx.strokeStyle="#fff0c2";ctx.lineWidth=1.5;roundRect(ctx,cartX-cartW/2,cartY,cartW,cartH,5);ctx.fill();ctx.stroke();
  const pivotY=cartY, poleLen=Math.min(145,scale*3.2), endX=cartX+poleLen*Math.sin(state[2]), endY=pivotY-poleLen*Math.cos(state[2]);
  ctx.lineCap="round";ctx.beginPath();ctx.moveTo(cartX,pivotY);ctx.lineTo(endX,endY);ctx.strokeStyle="#45d7e8";ctx.lineWidth=6;ctx.stroke();
  ctx.beginPath();ctx.arc(endX,endY,9,0,Math.PI*2);ctx.fillStyle="#45d7e8";ctx.fill();ctx.strokeStyle="#d7fbff";ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.arc(cartX,pivotY,4,0,Math.PI*2);ctx.fillStyle="#f8fafc";ctx.fill();
  ctx.fillStyle="#8496af";ctx.font="10px ui-monospace,monospace";ctx.fillText("UPRIGHT TARGET",Math.max(8,center-37),ground+34);
  ctx.fillStyle="#eaf2ff";ctx.font="11px ui-monospace,monospace";ctx.fillText(`x = ${state[0].toFixed(2)} m`,Math.min(w-85,Math.max(8,cartX-cartW/2)),Math.max(15,cartY-10));
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function showFrame(index) {
  if(!result) return;
  frame=Math.max(0,Math.min(index,result.time.length-1));
  const s=result.states[frame], t=result.time[frame], force=result.control[frame];
  drawScene(s);
  $("sim-time").textContent=`t = ${t.toFixed(2)} s`;
  $("metric-position").innerHTML=`${s[0].toFixed(3)} <em>m</em>`;
  $("metric-angle").innerHTML=`${(s[2]*180/Math.PI).toFixed(2)} <em>°</em>`;
  $("metric-force").innerHTML=`${force.toFixed(2)} <em>N</em>`;
  $("metric-error").innerHTML=`${Math.abs(s[2]*180/Math.PI).toFixed(3)} <em>°</em>`;
  $("frame-count").textContent=`Frame ${frame+1} / ${result.time.length}`;
}
function tick(now) {
  if(!playing || !result) return;
  if(now-lastTick > 35/(Number($("speed").value)||1)) {
    lastTick=now;
    if(frame>=result.time.length-1){playing=false;$("play").textContent="↻ Replay";return;}
    showFrame(frame+1);
  }
  animationHandle=requestAnimationFrame(tick);
}
function pause(){playing=false;if(animationHandle)cancelAnimationFrame(animationHandle);}
$("play").addEventListener("click",()=>{if(!result)return;if(frame>=result.time.length-1)showFrame(0);playing=true;lastTick=0;$("play").textContent="▶ Playing";animationHandle=requestAnimationFrame(tick);});
$("pause").addEventListener("click",()=>{pause();$("play").textContent="▶ Play";});
$("run").addEventListener("click", async()=>{
  pause(); $("run").disabled=true; $("message").classList.remove("error"); $("message").textContent="Solving nonlinear dynamics and calculating LQR feedback…";
  try{
    const response=await fetch("/api/simulate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(readForm())});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||"Unable to run simulation.");
    result=data;setupCharts(data);showFrame(0);
    $("play").disabled=false;$("pause").disabled=false;
    $("message").textContent=`Simulation complete · ${data.time.length} samples · LQR ${data.controller_enabled?"enabled":"disabled"}.`;
    $("play").textContent="▶ Play";
  }catch(err){$("message").textContent=err.message;$("message").classList.add("error");}
  finally{$("run").disabled=false;}
});
$("reset").addEventListener("click",()=>{pause();Object.entries(defaults).forEach(([id,value])=>{if(id==="controller_enabled")$(id).checked=value;else $(id).value=value;});updateLabels();drawScene([0,0,0,0]);$("message").textContent="Parameters reset. Run a new simulation.";});
$("controller_enabled").addEventListener("change",()=>{$("message").textContent="Controller setting changed. Run simulation to apply it.";});
window.addEventListener("resize",()=>drawScene(result?result.states[frame]:[0,0,0,0]));
drawScene([0,0,0,0]);
