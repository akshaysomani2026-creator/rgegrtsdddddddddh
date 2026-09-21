const SIZE=8, WIN=5, CELLS=SIZE*SIZE;

function generateLines(n,win){
  const lines=[]; const dirs=[[0,1],[1,0],[1,1],[1,-1]];
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)for(const [dr,dc] of dirs){
    const cells=[]; let valid=true;
    for(let k=0;k<win;k++){
      const rr=r+dr*k, cc=c+dc*k;
      if(rr<0||rr>=n||cc<0||cc>=n){valid=false;break}
      cells.push(rr*n+cc);
    }
    if(valid) lines.push(cells);
  }
  return lines;
}
const LINES=generateLines(SIZE,WIN);
const cellLines=Array.from({length:CELLS},()=>[]);
LINES.forEach((line,li)=>line.forEach(idx=>cellLines[idx].push(li)));

const boardEl=document.getElementById('board'), statusEl=document.getElementById('status');
const modeEl=document.getElementById('mode'), diffEl=document.getElementById('difficulty');
const overlay=document.getElementById('overlay'), toast=document.getElementById('toast');
const arenaPanel=document.getElementById('arenaPanel');
const musicBtn=document.getElementById('musicBtn'), soundBtn=document.getElementById('soundBtn');

let board=Array(CELLS).fill(''), turn='X', over=false, round=1;
let scores={X:0,O:0,D:0}, moveCount=0, streak=0, bestStreak=0, sound=true, startedAt=Date.now(), timerId;

try{
  const saved=JSON.parse(localStorage.getItem('xoArenaState')||'null');
  if(saved){ scores=saved.scores||scores; bestStreak=saved.bestStreak||0; }
}catch(e){}
function persist(){
  try{ localStorage.setItem('xoArenaState', JSON.stringify({scores,bestStreak})); }catch(e){}
}

/* ---------- Shared audio engine ---------- */
let actx=null, masterMusicGain=null;
let music=true, musicStarted=false, musicHandle=null, filterNode=null;
const scale=[220,246.94,261.63,293.66,329.63,392.00,440,493.88];

function ensureCtx(){
  if(!actx){
    actx=new (window.AudioContext||window.webkitAudioContext)();
    masterMusicGain=actx.createGain();
    masterMusicGain.gain.value=music?0.18:0;
    masterMusicGain.connect(actx.destination);
  }
  if(actx.state==='suspended') actx.resume();
  return actx;
}

const audio=(freq=440,dur=.08,type='sine')=>{
  if(!sound)return;
  try{
    const ctx=ensureCtx();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(.06,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime+dur);
    duckMusic();
  }catch(e){}
};

function duckMusic(){
  if(!musicStarted||!actx) return;
  const now=actx.currentTime;
  masterMusicGain.gain.cancelScheduledValues(now);
  masterMusicGain.gain.setTargetAtTime(music?0.05:0, now, 0.05);
  masterMusicGain.gain.setTargetAtTime(music?0.18:0, now+0.18, 0.35);
}

function intensityFactor(){
  const fill=moveCount/CELLS;
  const streakBoost=Math.min(streak,5)/5;
  return Math.min(1, fill*0.7+streakBoost*0.3);
}

function startMusic(){
  if(musicStarted) return;
  try{
    musicStarted=true;
    const ctx=ensureCtx();
    filterNode=ctx.createBiquadFilter();
    filterNode.type='lowpass';
    filterNode.frequency.value=900;
    filterNode.connect(masterMusicGain);
    const bass=ctx.createOscillator(), bassGain=ctx.createGain();
    bass.type='sawtooth'; bass.frequency.value=55;
    bassGain.gain.value=0.045;
    bass.connect(bassGain); bassGain.connect(filterNode);
    bass.start();
    scheduleNote();
  }catch(e){}
}

function scheduleNote(){
  if(!musicStarted) return;
  playArpNote();
  const t=intensityFactor();
  const delay=340-t*160;
  musicHandle=setTimeout(scheduleNote, delay);
}

function playArpNote(){
  if(!filterNode) return;
  try{
    const ctx=ensureCtx();
    const t=intensityFactor();
    const idx=Math.floor(Math.random()*scale.length);
    const freq=scale[idx]*(Math.random()<0.12?2:1);
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type='triangle'; o.frequency.value=freq;
    g.gain.setValueAtTime(0,ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.08+t*0.05, ctx.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.22);
    o.connect(g); g.connect(filterNode);
    o.start(); o.stop(ctx.currentTime+0.25);
    filterNode.frequency.setTargetAtTime(650+t*2600, ctx.currentTime, 0.5);
  }catch(e){}
}
/* ------------------------------------------ */

function spawnParticles(x,y,color){
  for(let i=0;i<14;i++){
    const s=document.createElement('div');
    s.className='spark';
    const ang=Math.random()*Math.PI*2, dist=40+Math.random()*70;
    s.style.left=x+'px'; s.style.top=y+'px';
    s.style.background=color; s.style.color=color;
    s.style.setProperty('--dx',(Math.cos(ang)*dist)+'px');
    s.style.setProperty('--dy',(Math.sin(ang)*dist)+'px');
    document.body.appendChild(s);
    setTimeout(()=>s.remove(),900);
  }
}

function render(){
  boardEl.innerHTML='';
  board.forEach((v,i)=>{
    const b=document.createElement('button');
    b.className='cell'+(v==='X'?' xmark':v==='O'?' omark':'');
    b.textContent=v;
    b.setAttribute('aria-label',`Cell ${i+1}${v?', '+v:''}`);
    b.disabled=!!v||over;
    b.onclick=()=>play(i);
    boardEl.appendChild(b);
  });
  document.getElementById('moves').textContent=`MOVES: ${String(moveCount).padStart(2,'0')} / ${CELLS}`;
  document.getElementById('streak').textContent='× '+streak;
  document.getElementById('round').textContent=String(round).padStart(2,'0');
  document.getElementById('px').classList.toggle('active',turn==='X'&&!over);
  document.getElementById('po').classList.toggle('active',turn==='O'&&!over);
  document.getElementById('streakStat').classList.toggle('hot',streak>=3);
  boardEl.classList.toggle('tense', !over && (moveCount/CELLS)>0.65);
  const streakB=document.getElementById('streak');
  const existingFlame=streakB.parentElement.querySelector('.flame');
  if(streak>=3 && !existingFlame){ const f=document.createElement('span'); f.className='flame'; f.textContent='🔥'; streakB.after(f); }
  if(streak<3 && existingFlame) existingFlame.remove();
}

function winner(b=board){
  for(const line of LINES){
    const first=b[line[0]];
    if(!first) continue;
    let all=true;
    for(let k=1;k<line.length;k++){ if(b[line[k]]!==first){all=false;break} }
    if(all) return {mark:first,line};
  }
  return null;
}

function findImmediate(mark){
  for(let i=0;i<CELLS;i++){
    if(board[i]) continue;
    const b=board.slice(); b[i]=mark;
    if(winner(b)) return i;
  }
  return null;
}

function lineScore(b,line,mark){
  let own=0,opp=0; const other=mark==='X'?'O':'X';
  for(const idx of line){ if(b[idx]===mark) own++; else if(b[idx]===other) opp++; }
  if(own>0 && opp>0) return 0;
  if(opp>0) return 0;
  const table={0:1,1:2,2:6,3:30,4:150};
  return table[own]??0;
}
function evaluateCell(b,idx,mark){
  let score=0; const other=mark==='X'?'O':'X';
  for(const li of cellLines[idx]){
    const line=LINES[li];
    score+=lineScore(b,line,mark);
    score+=lineScore(b,line,other)*0.9;
  }
  return score;
}
function bestOpponentScore(b,mark){
  let best=-Infinity;
  for(let i=0;i<CELLS;i++){ if(b[i]) continue; const s=evaluateCell(b,i,mark); if(s>best) best=s; }
  return best===-Infinity?0:best;
}

function chooseCPU(){
  const empty=[]; for(let i=0;i<CELLS;i++) if(!board[i]) empty.push(i);
  const diff=diffEl.value;
  let idx=findImmediate('O');
  if(idx!==null) return idx;
  if(diff==='easy'){
    if(Math.random()<0.35){ idx=findImmediate('X'); if(idx!==null) return idx; }
    return empty[Math.floor(Math.random()*empty.length)];
  }
  idx=findImmediate('X');
  if(idx!==null) return idx;
  if(diff==='medium'){
    let best=-Infinity,choice=empty[0];
    for(const i of empty){ const s=evaluateCell(board,i,'O')+Math.random()*30; if(s>best){best=s;choice=i;} }
    return choice;
  }
  const scored=empty.map(i=>({i,s:evaluateCell(board,i,'O')}));
  scored.sort((a,b)=>b.s-a.s);
  const top=scored.slice(0,Math.min(8,scored.length));
  let bestChoice=top[0].i,bestVal=-Infinity;
  for(const {i,s} of top){
    const b2=board.slice(); b2[i]='O';
    const oppBest=bestOpponentScore(b2,'X');
    const val=s-oppBest*0.55+Math.random()*4;
    if(val>bestVal){bestVal=val;bestChoice=i;}
  }
  return bestChoice;
}

function play(i){
  if(over||board[i])return;
  startMusic();
  board[i]=turn;
  moveCount++;
  audio(turn==='X'?540:330,.09,'triangle');
  const w=winner();
  if(w){ finish(turn,w.line); return; }
  if(moveCount===CELLS){ finish('D'); return; }
  turn=turn==='X'?'O':'X';
  statusEl.textContent=turn==='X'?'NEON — YOUR MOVE':'PHANTOM — YOUR MOVE';
  render();
  if(modeEl.value==='cpu'&&turn==='O'&&!over){
    statusEl.textContent='MACHINE CALCULATING…';
    setTimeout(cpuMove,380);
  }
}

function finish(mark,line){
  over=true;
  if(mark==='D'){
    scores.D++; streak=0;
    statusEl.textContent='GRID LOCKED — DRAW';
    document.getElementById('result').textContent='GRID LOCKED';
    document.getElementById('resultText').textContent='No victor. The arena demands a rematch.';
    audio(180,.35,'sawtooth');
  }else{
    scores[mark]++; streak++; bestStreak=Math.max(bestStreak,streak);
    const who=mark==='X'?'NEON':'PHANTOM';
    statusEl.textContent=who+' DOMINATES';
    document.getElementById('result').textContent=who+' TAKES THE ROUND';
    document.getElementById('resultText').textContent=`Five in a row. ${streak>1?streak+' round streak — unstoppable.':'Grid domination.'}`;
    audio(780,.18,'sawtooth'); setTimeout(()=>audio(980,.24,'triangle'),120);
  }
  render();
  if(line){
    line.forEach(i=>{
      const cellEl=boardEl.children[i];
      cellEl.classList.add('winner');
      const r=cellEl.getBoundingClientRect();
      spawnParticles(r.left+r.width/2, r.top+r.height/2, mark==='X'?'#4df7ff':mark==='O'?'#ff3d81':'#a7b1d4');
    });
    const shakeAmt=Math.min(3,1+streak*0.4);
    arenaPanel.style.setProperty('--shakeAmt', shakeAmt);
    arenaPanel.classList.remove('shake'); void arenaPanel.offsetWidth; arenaPanel.classList.add('shake');
  }
  updateScores(); persist();
  overlay.classList.add('show');
}

function cpuMove(){ if(over||turn!=='O')return; play(chooseCPU()); }

function updateScores(){
  document.getElementById('sx').textContent=scores.X;
  document.getElementById('so').textContent=scores.O;
  document.getElementById('sd').textContent=scores.D;
  document.getElementById('dominance').textContent=`${scores.X} — ${scores.O}`;
  document.getElementById('bestStreak').textContent=bestStreak;
  const total=scores.X+scores.O||1;
  document.getElementById('mx').style.width=(scores.X/total*100)+'%';
  document.getElementById('mo').style.width=(scores.O/total*100)+'%';
}

function newRound(){
  board=Array(CELLS).fill(''); turn='X'; over=false; moveCount=0; startedAt=Date.now();
  statusEl.textContent='AWAITING FIRST STRIKE';
  overlay.classList.remove('show');
  render();
  if(modeEl.value==='cpu'){
    document.getElementById('nameO').textContent='MACHINE';
    document.getElementById('oLabel').textContent='CPU OPPONENT';
    document.getElementById('soName').textContent='MACHINE';
  }else{
    document.getElementById('nameO').textContent='PHANTOM';
    document.getElementById('oLabel').textContent='PLAYER 02';
    document.getElementById('soName').textContent='PHANTOM';
  }
}

function showToast(msg){ toast.textContent=msg; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),1800); }

document.getElementById('newRound').onclick=()=>{ startMusic(); round++; newRound(); showToast('NEW ROUND — MAKE YOUR MOVE'); audio(600,.1); };
document.getElementById('next').onclick=()=>{ startMusic(); round++; newRound(); audio(600,.1); };
document.getElementById('reset').onclick=()=>{ startMusic(); scores={X:0,O:0,D:0}; streak=0; bestStreak=0; updateScores(); persist(); newRound(); showToast('SCORE MATRIX RESET'); };
soundBtn.onclick=()=>{ startMusic(); sound=!sound; soundBtn.textContent='♫ SOUND: '+(sound?'ON':'OFF'); if(sound)audio(600,.1); };
musicBtn.onclick=()=>{
  startMusic();
  music=!music;
  musicBtn.textContent='🎵 MUSIC: '+(music?'ON':'OFF');
  if(actx) masterMusicGain.gain.setTargetAtTime(music?0.18:0, actx.currentTime, 0.2);
};
modeEl.onchange=()=>{ startMusic(); newRound(); showToast(modeEl.value==='cpu'?'MACHINE OPPONENT ONLINE':'LOCAL DUEL READY'); };
diffEl.onchange=()=>{ startMusic(); showToast('THREAT LEVEL: '+diffEl.options[diffEl.selectedIndex].text); };

function tick(){
  const sec=Math.floor((Date.now()-startedAt)/1000);
  document.getElementById('timer').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
}
timerId=setInterval(tick,1000);
updateScores();
newRound();
