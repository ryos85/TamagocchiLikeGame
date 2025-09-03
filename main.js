const MAX = 100;
const clamp = (n, min=0, max=MAX)=> Math.max(min, Math.min(max, n));

const STAGES = ["たまご","幼年期","成長期","成熟期","完全体"];
const EMOJI  = ["🥚","🐣","🐥","🐤","🕊️"];

const SPECIES = {
  baby: "ベビン",
  grow: { friendly: "フレンドリオ", athlete: "ハシルネ", tidy: "ピカリン", foodie: "ムクムク" },
  adult: { friendly: "アミティア", athlete: "ダッシュオウ", tidy: "クリンベル", foodie: "グルミア" },
  perfect: { friendly: "ソウルリンク", athlete: "ストライザー", tidy: "プリズムクリーン", foodie: "バンケットゥス" }
};

const el = id => document.getElementById(id);

let state = {
  version: 1,
  day: 0,
  stageIdx: 0, // 0..4
  speciesKey: null, // friendly | athlete | tidy | foodie
  speciesName: "—",
  affection: 0,      // なつき度 0..100
  fullness: 50,      // 満腹度 0..100
  cleanliness: 80,   // 清潔度 0..100
  health: 100,       // 健康度 0..100（自動）
  exerciseTotal: 0,  // 運動量 累積
  history: [],       // 1日ごとの平均ログ {aff,full,clean,health,run}
  evoProgress: 0,    // 次の進化までの進捗（%）
  log: []
};

function save(){
  try{ localStorage.setItem('tamagotchi_like_save', JSON.stringify(state)); }catch(e){ console.warn(e); }
}
function load(){
  try{
    const s = JSON.parse(localStorage.getItem('tamagotchi_like_save'));
    if(s && s.version===1){ state = s; }
  }catch(e){ console.warn(e); }
}

function pushLog(msg){
  state.log.unshift(`[Day ${state.day}] ${msg}`);
  state.log = state.log.slice(0, 60);
}

function avg(arr, key){ if(arr.length===0) return 0; return arr.reduce((a,b)=>a+(b[key]||0),0)/arr.length; }

function computeTraitScores(){
  const recent = state.history.slice(-5);
  const affA = (avg(recent, 'aff') + state.affection)/2; // 最近平均と現在の平均
  const fullA = (avg(recent, 'full') + state.fullness)/2;
  const cleanA= (avg(recent, 'clean') + state.cleanliness)/2;
  const runN = Math.min(state.exerciseTotal, 200) / 200 * 100; // 上限200で正規化
  return {
    friendly: affA,           // 高いほど友好的
    athlete: runN,            // 高いほど運動特化
    tidy: cleanA,             // 高いほど清潔
    foodie: fullA             // 高いほど食いしん坊
  };
}

function computeEvoProgress(){
  const traits = computeTraitScores();
  let progress = 0;
  if(state.stageIdx===0){
    // たまご→幼年期：何かしら世話をしたら/日が進んだら孵化
    progress = (state.day>0 || state.fullness>50 || state.affection>0 || state.cleanliness<80) ? 100 : 0;
  } else if(state.stageIdx===1){
    // 幼年期→成長期：4要素を均等評価
    const aff = state.affection; const full = state.fullness; const clean = state.cleanliness;
    const run = Math.min(state.exerciseTotal, 40)/40*100;
    progress = (aff + full + clean + run) / 4;
  } else if(state.stageIdx===2){
    // 成長期→成熟期：平均重視 + 運動
    const recent = state.history.slice(-5);
    const aff = (avg(recent,'aff') + state.affection)/2;
    const full= (avg(recent,'full') + state.fullness)/2;
    const clean=(avg(recent,'clean') + state.cleanliness)/2;
    const run = Math.min(state.exerciseTotal, 120)/120*100;
    progress = aff*0.35 + run*0.35 + clean*0.2 + full*0.1;
  } else if(state.stageIdx===3){
    // 成熟期→完全体：トップ特性 + 健康
    const t = computeTraitScores();
    const top = Math.max(t.friendly, t.athlete, t.tidy, t.foodie);
    progress = top*0.8 + state.health*0.2;
  } else {
    progress = 100;
  }
  state.evoProgress = clamp(progress, 0, 100);
}

function tryEvolve(){
  computeEvoProgress();
  if(state.evoProgress < 100 || state.stageIdx>=4) return;

  if(state.stageIdx===0){
    state.stageIdx=1; state.speciesName = SPECIES.baby; state.speciesKey=null;
    pushLog('たまごが孵化！幼年期「'+state.speciesName+'」になった。');
  } else if(state.stageIdx===1){
    const t = computeTraitScores();
    const key = Object.entries(t).sort((a,b)=>b[1]-a[1])[0][0];
    state.stageIdx=2; state.speciesKey = key; state.speciesName = SPECIES.grow[key];
    pushLog(`成長期に進化！タイプは「${key}」 → ${state.speciesName}`);
  } else if(state.stageIdx===2){
    const key = state.speciesKey || 'friendly';
    state.stageIdx=3; state.speciesName = SPECIES.adult[key];
    pushLog(`成熟期に進化！${state.speciesName}`);
  } else if(state.stageIdx===3){
    const key = state.speciesKey || 'friendly';
    if(state.health < 60){
      pushLog('健康度が低くて完全体になれなかった…（健康度60以上が目安）');
      state.evoProgress = 99; // もう少し
    } else {
      state.stageIdx=4; state.speciesName = SPECIES.perfect[key];
      pushLog(`完全体に到達！${state.speciesName}`);
    }
  }

  updateUI(); save();
}

function hatchIfNeeded(){
  if(state.stageIdx===0){
    computeEvoProgress();
    if(state.evoProgress>=100){ tryEvolve(); }
  }
}

// --- Actions ---
function feed(){
  const before = state.fullness;
  state.fullness = clamp(state.fullness + 25);
  if(before>90){ state.health = clamp(state.health - 5); pushLog('食べ過ぎで少し苦しそう…健康度 -5'); }
  else { state.affection = clamp(state.affection + 2); }
  state.cleanliness = clamp(state.cleanliness - 5);
  pushLog('エサをあげた（満腹度 +25 / 清潔度 -5 / なつき +2）');
  hatchIfNeeded();
  afterAction();
}
function run(){
  state.exerciseTotal += 10;
  state.fullness = clamp(state.fullness - 10);
  state.cleanliness = clamp(state.cleanliness - 3);
  if(state.fullness < 15){ state.health = clamp(state.health - 6); state.affection = clamp(state.affection - 2); pushLog('お腹がすきすぎてつらそう…健康度 -6 / なつき -2'); }
  else { state.affection = clamp(state.affection + 1); }
  pushLog('運動した（運動量 +10 / 満腹度 -10 / 清潔度 -3 / なつき +1）');
  hatchIfNeeded();
  afterAction();
}
function clean(){
  const delta = (state.cleanliness<50)? 40: 25;
  state.cleanliness = clamp(state.cleanliness + delta);
  state.affection = clamp(state.affection + 1);
  pushLog(`ケージを掃除（清潔度 +${delta} / なつき +1）`);
  hatchIfNeeded();
  afterAction();
}

function nextDay(){
  state.day += 1;
  state.fullness = clamp(state.fullness - 20);
  state.cleanliness = clamp(state.cleanliness - 15);

  // health auto change
  let hDelta = 0;
  if(state.fullness < 30) hDelta -= 10;
  if(state.cleanliness < 30) hDelta -= 10;
  if(state.fullness >= 60 && state.cleanliness >= 60) hDelta += 6;
  state.health = clamp(state.health + hDelta);

  // affection reacts to neglect
  if(state.fullness < 25 || state.cleanliness < 25){ state.affection = clamp(state.affection - 6); }

  // log day summary into history
  state.history.push({ aff: state.affection, full: state.fullness, clean: state.cleanliness, health: state.health, run: state.exerciseTotal });
  if(state.history.length>60) state.history.shift();

  pushLog(`1日経過（満腹 -20 / 清潔 -15 / 健康 ${hDelta>=0?'+':''}${hDelta}）`);
  hatchIfNeeded();
  afterAction();
}

function resetAll(){
  state = { version:1, day:0, stageIdx:0, speciesKey:null, speciesName:'—', affection:0, fullness:50, cleanliness:80, health:100, exerciseTotal:0, history:[], evoProgress:0, log:[] };
  pushLog('ゲームをリセットしました');
  updateUI(); save();
}

// --- UI ---
function setBar(id, val){
  const bar = el(id).querySelector('i');
  bar.style.width = `${clamp(val)}%`;
  const shell = el(id);
  shell.classList.remove('bad','warn');
  if(val<30) shell.classList.add('bad'); else if(val<60) shell.classList.add('warn');
}

function updateUI(){
  computeEvoProgress();

  el('metaDay').textContent = `Day ${state.day}`;
  el('metaStage').textContent = STAGES[state.stageIdx];
  el('stage').textContent = STAGES[state.stageIdx];
  el('species').textContent = state.speciesName || '—';
  el('speciesTag').textContent = state.speciesKey? `タイプ：${state.speciesKey}`: '—';

  el('emoji').textContent = EMOJI[state.stageIdx];

  el('affNum').textContent  = state.affection;
  el('fullNum').textContent = state.fullness;
  el('cleanNum').textContent= state.cleanliness;
  el('hpNum').textContent   = state.health;
  el('runNum').textContent  = state.exerciseTotal;

  setBar('affBar', state.affection);
  setBar('fullBar', state.fullness);
  setBar('cleanBar', state.cleanliness);
  setBar('hpBar', state.health);
  setBar('runBar', Math.min(state.exerciseTotal, 100));

  el('evoNum').textContent = `${Math.round(state.evoProgress)}%`;
  setBar('evoBar', state.evoProgress);

  // log render
  const logHtml = state.log.map(l=>`<p>${l.replace(/[&<>]/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[s]))}</p>`).join('');
  el('log').innerHTML = logHtml || '<p>ここに出来事が表示されます。</p>';

  // Save after UI update
  save();

  // Try to evolve when bar hits 100
  if(state.evoProgress>=100){
    tryEvolve(); // updates again inside
  }
}

function afterAction(){
  updateUI();
}

// --- Bind ---
document.addEventListener('DOMContentLoaded', () => {
  el('btnFeed').addEventListener('click', feed);
  el('btnRun').addEventListener('click', run);
  el('btnClean').addEventListener('click', clean);
  el('btnNext').addEventListener('click', nextDay);
  el('btnReset').addEventListener('click', ()=>{ if(confirm('本当にリセットしますか？')) resetAll(); });

  // init
  load();
  updateUI();
  if(!state.log || state.log.length===0){ pushLog('ようこそ！お世話を始めよう。'); updateUI(); }
});
