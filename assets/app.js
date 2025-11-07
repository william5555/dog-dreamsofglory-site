/* =========================================================================
 * Alliance Hub – App Core (Lean Edition)
 * - Live 高頻公告：/data/live.json（自動輪詢）
 * - 長期教學卡片：GUIDE_CATALOG + PUBLISH_GUIDES（本檔集中）
 * - 五語多國：zh / en / ko / ar / ru，含 RTL、偏好保存、字典 fallback
 * =======================================================================*/

/* ========== 全域設定（調頻率 / 來源） ========== */
const CONFIG = {
  liveURL:      "./data/live.json",     // 即時資訊來源（高頻）
  livePollMs:   30 * 1000,              // 每 30s 抓一次
  scheduleURL:  "./data/schedule.json", // 近期時間線來源（高頻）
  schedulePollMs: 20 * 1000             // 每 20s 抓一次
};

/* ============ Global caches ============ */
let allEventsCache = [];   // ← 這裡也可以

/* ========== 小工具 / 匯流排 / DOM 快捷 ========== */
const bus = { _ev:{}, on(e,f){(this._ev[e]??=[]).push(f)}, emit(e,p){(this._ev[e]||[]).forEach(fn=>fn(p))} };
const $  = (s,r=document)=> r.querySelector(s);
const $$ = (s,r=document)=> [...r.querySelectorAll(s)];
const escapeHTML = (s) => String(s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");

/* ========== 偏好保存（語言等） ========== */
function savePref(key, val){ try{ localStorage.setItem(`dogportal:${key}`, JSON.stringify(val)); }catch{} }
function loadPref(key, def){ try{ const v=localStorage.getItem(`dogportal:${key}`); return v?JSON.parse(v):def; }catch{return def;} }

/* ========== 語言歸一 / RTL ========== */
const normalizeLang = (l) => {
  if (!l) return "en";
  const s = l.toLowerCase();
  if (s.startsWith("zh")) return "zh";
  if (s.startsWith("ko")) return "ko";
  if (s.startsWith("ar")) return "ar";
  if (s.startsWith("ru")) return "ru";
  if (s.startsWith("en")) return "en";
  return "en";
};
function applyDirByLang(lang) {
  const L = normalizeLang(lang);
  const rtl = (L === "ar");
  document.documentElement.lang = L;
  document.documentElement.setAttribute("dir", rtl ? "rtl" : "ltr");
  document.documentElement.classList.toggle("rtl", rtl);
}

/* ========== i18n 多語引擎（五語） ========== */
const i18n = {
  current: loadPref("lang", "zh"),
  dicts: {
    zh: {
      __meta:{dir:"ltr",name:"中文"},
      site:{metaTitle:"DOG Alliance Hub", brand:"DOG Alliance Hub", title:"聯盟公告與教學中心"},
      live:{
        title:"即時資訊",
        status:{loading:"載入中…", ok:"同步中", fail:"離線 / 顯示快取"},
        refreshNow:"手動刷新", refreshHint:"（每 30 秒自動更新）",
        badges:{important:"重要", tip:"提示", rule:"規則", event:"活動"}
      },
      guide:{ title:"活動 / 教學" },
      schedule:{ title:"近期活動" }
    },
    en: {
      __meta:{dir:"ltr",name:"English"},
      site:{metaTitle:"DOG Alliance Hub", brand:"DOG Alliance Hub", title:"Alliance Notices & Guides"},
      live:{
        title:"Live Updates",
        status:{loading:"Loading…", ok:"Live", fail:"Offline / Cached"},
        refreshNow:"Refresh now", refreshHint:"(Auto every 30s)",
        badges:{important:"Important", tip:"Tip", rule:"Rule", event:"Event"}
      },
      guide:{ title:"Events / Guides" },
      schedule:{ title:"Upcoming" }
    },
    ko:{
      __meta:{dir:"ltr",name:"한국어"},
      site:{metaTitle:"DOG Alliance Hub", brand:"DOG Alliance Hub", title:"연맹 공지 & 가이드"},
      live:{
        title:"실시간",
        status:{loading:"불러오는 중…", ok:"동기화", fail:"오프라인 / 캐시"},
        refreshNow:"지금 새로고침", refreshHint:"(30초마다 자동)",
        badges:{important:"중요", tip:"팁", rule:"규칙", event:"이벤트"}
      },
      guide:{ title:"이벤트 / 가이드" },
      schedule:{ title:"다가오는 일정" }
    },
    ar:{
      __meta:{dir:"rtl",name:"العربية"},
      site:{metaTitle:"DOG Alliance Hub", brand:"DOG Alliance Hub", title:"مركز إعلانات ودلائل التحالف"},
      live:{
        title:"التحديثات الفورية",
        status:{loading:"جاري التحميل…", ok:"مباشر", fail:"غير متصل / مؤقت"},
        refreshNow:"تحديث الآن", refreshHint:"(تلقائي كل 30 ثانية)",
        badges:{important:"هام", tip:"نصيحة", rule:"قاعدة", event:"فعالية"}
      },
      guide:{ title:"فعاليات / دلائل" },
      schedule:{ title:"القادم" }
    },
    ru:{
      __meta:{dir:"ltr",name:"Русский"},
      site:{metaTitle:"DOG Alliance Hub", brand:"DOG Alliance Hub", title:"Центр объявлений и гайдов"},
      live:{
        title:"Онлайн-лента",
        status:{loading:"Загрузка…", ok:"Онлайн", fail:"Оффлайн / кэш"},
        refreshNow:"Обновить", refreshHint:"(авто каждые 30с)",
        badges:{important:"Важно", tip:"Совет", rule:"Правило", event:"Событие"}
      },
      guide:{ title:"События / Гайды" },
      schedule:{ title:"Ближайшие" }
    }
  },
  t(path, fallback=""){
    const L = normalizeLang(this.current);
    return path.split(".").reduce((o,k)=>(o||{})[k], this.dicts[L]) ?? fallback;
  },
  getText(v){
    if (v==null) return "";
    if (typeof v==="string") return v;                    // 純字串：不隨語言切換
    if (v.i18nKey) return this.t(v.i18nKey,"");           // i18n key
    if (typeof v==="object"){
      const L = normalizeLang(this.current);
      return v[L] || v.en || v.zh || Object.values(v)[0] || "";
    }
    return String(v);
  },
  apply(){
    const L = normalizeLang(this.current);
    applyDirByLang(L);
    $$("[data-i18n]").forEach(el=>{
      const key = el.getAttribute("data-i18n"); const val = this.t(key,"");
      if (val!=null) el.textContent = val;
    });
    bus.emit("lang:changed", L);
  },
  setLang(code){
    const L = normalizeLang(code);
    this.current = L;
    savePref("lang", L);
    this.apply();
  }
};

// ---- UI 固定字 ----
const UI_LABELS = {
  filter_all: { zh:"全部", en:"All", ko:"전체", ru:"Все", ar:"الكل" }
};

// ---- type 代碼 → 多語名稱（集中字典）----
const TYPE_LABELS = {
  halloween:    { zh:"萬聖節",     en:"Halloween",           ko:"할로윈",      ru:"Хэллоуин",         ar:"الهالوين" },
  lucky_wheel:  { zh:"幸運大轉盤", en:"Lucky Wheel",         ko:"행운의 룰렛", ru:"Колесо удачи",     ar:"عجلة الحظ" },
  pve_beasts:   { zh:"野獸討伐",   en:"Beast Hunt",          ko:"야수 소탕",   ru:"Охота на зверей",  ar:"صيد الوحوش" },
  blue_battle:  { zh:"全軍參戰",   en:"Brothers in Arms",    ko:"전군 총동원", ru:"Братья по оружию", ar:"رفقاء السلاح" },
  yellow_merc:  { zh:"傭兵榮耀",   en:"Mercenary Prestige",     ko:"용병의 영광", ru:"Слава наёмников",  ar:"مجد المرتزقة" },
  castle_war:   { zh:"決戰王城",   en:"Castle Battle",       ko:"왕성 결전",   ru:"Битва за замок",   ar:"معركة القلعة" }
};
function i18nTypeName(code){
  const pack = TYPE_LABELS?.[String(code||"").toLowerCase()];
  return pack ? i18nText(pack) : String(code||"");
}

// 以目前語言取多語物件；字串原樣返回
function i18nText(objOrString){
  try{
    if (typeof objOrString === 'string') return objOrString;
    const L = normalizeLang(i18n?.current || document.documentElement.lang || 'en');
    return objOrString?.[L] || objOrString?.en || objOrString?.zh || Object.values(objOrString||{})[0] || '';
  }catch{
    return String(objOrString ?? '');
  }
}

// 片段標籤（P1 / 第1段 …）— 保留唯一版本
function segmentTag(idx){
  const L = normalizeLang(i18n?.current || 'en');
  if (L.startsWith('zh')) return `第${idx}段`;
  if (L === 'ru') return `Ч${idx}`;        // Часть
  if (L === 'ar') return `الجزء ${idx}`;
  return `P${idx}`; // en/ko 皆用 P1/P2…
}

/* ========== 通用格式工具 ========== */
function fmtTime(ts){
  try{
    const d = new Date(ts);
    if (isNaN(d)) return "";
    return d.toLocaleString(document.documentElement.lang || i18n.current, { hour12:false });
  }catch{ return ts; }
}
function badgeLabel(type){
  const map = { important:"live.badges.important", tip:"live.badges.tip", rule:"live.badges.rule", event:"live.badges.event" };
  return i18n.t(map[type] || "live.badges.tip", type);
}

/* ========== 資料層（容錯） ========== */
const store = {
  data: { live:[], guides:[], schedule:[] },
  mergeData(patch){
    for (const k of Object.keys(patch||{})){
      if (Array.isArray(this.data[k]) && Array.isArray(patch[k])) this.data[k] = patch[k];
      else this.data[k] = patch[k];
    }
    bus.emit("data:updated", this.data);
  },
  async safeLoadJSON(url){
    try{
      const res = await fetch(`${url}?_=${Date.now()}`, { cache:"no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }catch(e){ console.warn("load JSON failed:", url, e); return null; }
  }
};

/* ========== Live 合併策略（覆寫/保留/排序） ========== */
/*
  - 以 id 合併：新檔同 id 覆寫舊值；無 id 直接新增
  - sticky 舊項：若新檔沒覆蓋，且 sticky:true，則保留
  - 顯示條件：active !== false、startAt ≤ now、until ≥ now
  - 排序：sticky > priority(desc) > startAt/ts(desc)
*/
function mergeLive(existing = [], incoming = []) {
  const byId = new Map();
  for (const x of existing) if (x && x.id) byId.set(x.id, x);

  for (const item of incoming) {
    if (item?.id) {
      const prev = byId.get(item.id) || {};
      byId.set(item.id, { ...prev, ...item });
    } else {
      byId.set(`__anon_${Math.random().toString(36).slice(2)}`, item);
    }
  }
  for (const old of existing) {
    if (old?.sticky && old.id && !incoming.find(n => n?.id === old.id)) {
      byId.set(old.id, old);
    }
  }
  const now = Date.now();
  let list = Array.from(byId.values()).filter(v => {
    if (!v) return false;
    if (v.active === false) return false;
    if (v.startAt) { const t0 = Date.parse(v.startAt); if (!isNaN(t0) && now < t0) return false; }
    if (v.until)   { const t1 = Date.parse(v.until);   if (!isNaN(t1) && now > t1) return false; }
    return true;
  });
  list.sort((a,b)=>{
    const sA = a?.sticky?1:0, sB = b?.sticky?1:0; if (sA!==sB) return sB - sA;
    const pA = Number.isFinite(a?.priority)?a.priority:0;
    const pB = Number.isFinite(b?.priority)?b.priority:0;
    if (pA!==pB) return pB - pA;
    const tA = Date.parse(a?.startAt||a?.ts||0), tB = Date.parse(b?.startAt||b?.ts||0);
    return (isNaN(tB)-isNaN(tA)) || (tB - tA);
  });
  return list;
}

/* ========== 名稱詞庫：英雄 / 建築 / 兵種 / 戰場 / NAP 等（集中管理） ========== */
/** 英雄（保留你提供的字面；注意某些阿語有換行，如非刻意可刪） */
const HERO = {
  jessie:  { zh:`杰⻄`,        en:`Jessie`,        ko:`제시`,    ar:`ٮسي$ ح" `,                ru:`Джесси` },
  jasser:  { zh:`傑塞爾`,      en:`Jasser`,        ko:`제설`,    ar:` حاسر " `,                ru:`Джассер` },
  seoyoon: { zh:`書允`,        en:`Seo-yoon`,      ko:`서윤`,    ar:` ون$ وٮٮ$ س `,            ru:`Со-Юн` },
  jeronimo:{ zh:`赫羅尼莫`,    en:`Jeronimo`,      ko:`제로니모`, ar:` ٮمو $ ٮ/ ٮرو $ ح" `,     ru:`Джеронимо` },
  zinman:  { zh:`津曼`,        en:`Zinman`,        ko:`진먼`,    ar:` ٮمان / زي `,             ru:`Зинман` },
  molly:   { zh:`茉莉`,        en:`Molly`,         ko:`몰리`,    ar:` ى6 مول `,                ru:`Молли` },
  gina:    { zh:`吉娜`,        en:`Gina`,          ko:`지나`,    ar:` ٮا/ ٮ$ ح" `,             ru:`Джина` },
  sergey:  { zh:`謝爾蓋`,      en:`Sergey`,        ko:`세르게이`, ar:` ى6 ح" ٮر$ س`,           ru:`Сергей` },
  bahiti:  { zh:`巴希提`,      en:`Bahiti`,        ko:`바히티`,  ar:` تي$ ٮاهٮ " `,            ru:`Бахити` },
  natalia: { zh:`娜塔莉亞`,    en:`Natalia`,       ko:`나탈리아`, ar:` ا$ الٮ : ٮاٮ / `,        ru:`Наталия` },
  patrick: { zh:`派翠克`,      en:`Patrick`,       ko:`패트릭`,  ar:` ريك : ٮاٮ" `,            ru:`Патриĸ` },
  lumak_bokan: { zh:`盧姆•波根`,  en:`Lumak Bokan`,   ko:`룸 보겐`,  ar:` لوم اك\nٮوكان " `,     ru:`Лумаĸ Боĸан`},
  eugene:  { zh:`尤⾦`,        en:`Eugene`,        ko:`유진`,    ar:` ٮن$ ح" و$ ٮ`,           ru:`Юджин` },
  lingxue: { zh:`凌雪`,        en:`Ling Xue`,      ko:`료유 و키 ٮغ /ش / ٮ$ ل`,               ru:`Лин Сюе` },
  cloris:  { zh:`克勞瑞斯`,    en:`Cloris`,        ko:`클로리스`, ar:` كول ريس `,              ru:`Клорис` },
  charlie: { zh:`查理`,        en:`Charlie`,       ko:`찰리`,    ar:` ى6 شارل : ٮ`,            ru:`Чарли` },
  smith:   { zh:`史密斯`,      en:`Smith`,         ko:`스미스`,  ar:` ال حد اد `,              ru:`Смит` }
};
const nameOf = (k) => (HERO[k] || {});

/** 術語 `TERMS`：可持續擴充（建築已在此；新增 7 組常用對照） */
const TERMS = (() => {
  const prev = (typeof window !== "undefined" && window.TERMS) ? window.TERMS : {};
  return {
    ...prev,

    /* ——— Buildings（建築） ——— */
    buildings: {
      marksman_camp:   { zh: "射手營",     en: "Marksman Camp",     ko: "저격수 막사",      ar: "معسكر الرماة",          ru: "Лагерь стрелков" },
      lancer_camp:     { zh: "矛兵營",     en: "Lancer Camp",       ko: "창기병 막사",       ar: "معسكر الرماحة",         ru: "Лагерь копейщиков" },
      infantry_camp:   { zh: "盾兵營",     en: "Infantry Camp",     ko: "보병 막사",         ar: "معسكر المشاة",          ru: "Лагерь пехоты" },
      research_center: { zh: "科技研究所", en: "Research Center",   ko: "연구소",            ar: "مركز الأبحاث",          ru: "Исследовательский центр" },
      infirmary:       { zh: "軍醫所",     en: "Infirmary",         ko: "의무실",            ar: "المستوصف",              ru: "Лазарет" },
      command_center:  { zh: "指揮部",     en: "Command Center",    ko: "지휘본부",          ar: "مركز القيادة",          ru: "Командный центр" },
      embassy:         { zh: "大使館",     en: "Embassy",           ko: "대사관",            ar: "السفارة",               ru: "Посольство" },
      barricade:       { zh: "城牆",       en: "Barricade",         ko: "방벽",              ar: "متراس",                 ru: "Баррикада" },
      storehouse:      { zh: "倉庫",       en: "Storehouse",        ko: "창고",              ar: "المخزن",                ru: "Амбар" },
      furnace:         { zh: "熔爐",       en: "Furnace",           ko: "용광로",            ar: "الفرن",                 ru: "Печь" },
      clinic:          { zh: "醫務室",     en: "Clinic",            ko: "진료소",            ar: "العيادة",               ru: "Клиника" },
      shelter:         { zh: "民居",       en: "Shelter",           ko: "주거지",            ar: "المأوى",                ru: "Жилище" },
      cookhouse:       { zh: "廚房",       en: "Cookhouse",         ko: "취사장",            ar: "المطبخ",               ru: "Кухня" },
      hero_hall:       { zh: "英雄大廳",   en: "Hero Hall",         ko: "영웅의 전당",       ar: "قاعة الأبطال",          ru: "Зал героев" },
      iron_mine:       { zh: "鐵礦場",     en: "Iron Mine",         ko: "철광",              ar: "منجم الحديد",           ru: "Железный рудник" },
      sawmill:         { zh: "伐木場",     en: "Sawmill",           ko: "제재소",            ar: "المنشرة",               ru: "Лесопилка" },
      coal_mine:       { zh: "煤礦場",     en: "Coal Mine",         ko: "석탄 광산",         ar: "منجم الفحم",            ru: "Угольная шахта" },
      hunters_hut:     { zh: "獵人之家",   en: "Hunter’s Hut",      ko: "사냥꾼 오두막",     ar: "كوخ الصياد",            ru: "Хижина охотника" },
      explorers_cabin: { zh: "探險者之家", en: "Explorers Cabin",   ko: "탐험가의 오두막",   ar: "كوخ المستكشف",          ru: "Хижина исследователя" },
      suggestion_box:  { zh: "民意信箱",   en: "Suggestion Box",    ko: "건의함",            ar: "صندوق الاقتراحات",      ru: "Ящик предложений" },
      lighthouse:      { zh: "燈塔",       en: "Lighthouse",        ko: "등대",              ar: "المنارة",               ru: "Маяк" },
      arena:           { zh: "競技場",     en: "Arena",             ko: "투기장",            ar: "الساحة",                ru: "Арена" },
      chiefs_house:    { zh: "律令所",     en: "Chief’s House",     ko: "족장의 집",         ar: "بيت الزعيم",            ru: "Дом вождя" },
      fc_marksman_camp:   { zh: "火晶射手營",   en: "Fire Crystal Marksman Camp",   ko: "화정 저격수 막사",   ar: "معسكر رماة البلّور الناري", ru: "Лагерь стрелков огненного кристалла" },
      fc_infantry_camp:   { zh: "火晶盾兵營",   en: "Fire Crystal Infantry Camp",   ko: "화정 보병 막사",     ar: "معسكر مشاة البلّور الناري", ru: "Лагерь пехоты огненного кристалла" },
      fc_lancer_camp:     { zh: "火晶矛兵營",   en: "Fire Crystal Lancer Camp",     ko: "화정 창기병 막사",   ar: "معسكر رماحة البلّور الناري", ru: "Лагерь копейщиков огненного кристалла" },
      fc_embassy:         { zh: "火晶大使館",   en: "Fire Crystal Embassy",         ko: "화정 대사관",       ar: "سفارة البلّور الناري",     ru: "Посольство огненного кристалла" },
      fc_infirmary:       { zh: "火晶軍醫所",   en: "Fire Crystal Infirmary",       ko: "화정 의무실",       ar: "مستوصف البلّور الناري",    ru: "Лазарет огненного кристалла" },
      fc_command_center:  { zh: "火晶指揮部",   en: "Fire Crystal Command Center",  ko: "화정 지휘본부",     ar: "مركز قيادة البلّور الناري", ru: "Командный центр огненного кристалла" },
      fc_furnace:         { zh: "火晶大熔爐",   en: "Fire Crystal Furnace",         ko: "화정 대용광로",     ar: "فرن البلّور الناري",        ru: "Печь огненного кристалла" }
    },

    /* ——— Units（兵種） ——— */
    units: {
      infantry: { zh:"盾兵", en:"Infantry", ko:"보병", ar:"المشاة", ru:"Пехота" },
      lancer:   { zh:"矛兵", en:"Lancer",   ko:"창기병", ar:"الرماحة", ru:"Копейщики" },
      marksman: { zh:"射手", en:"Marksman", ko:"사수",   ar:"الرماة",  ru:"Стрелки" }
    },

    /* ——— Battle Modes / Places（戰場/活動） ——— */
    battles: {
      fortress:   { zh:"堡壘戰",      en:"Fortress Battle", ko:"요새 전투",   ar:"معركة الحصن",   ru:"Битва за крепость" },
      sunfire:    { zh:"日耀城",      en:"Sunfire Castle",  ko:"선파이어 성", ar:"قلعة صنفاير",   ru:"Замок Санфайр" },
      foundry:    { zh:"鑄造廠",      en:"Foundry",         ko:"주조소",     ar:"المصهر",       ru:"Литейная" },
      bear_trap:  { zh:"獵熊陷阱",    en:"Bear Trap",       ko:"곰 덫",       ar:"مصيدة الدب",   ru:"Bear Trap" }
    },

    /* ——— Alliance & Roles（聯盟與職稱） ——— */
    alliance: {
      alliance: { zh:"聯盟", en:"Alliance", ko:"연맹", ar:"التحالف", ru:"Союз" },
      leader:   { zh:"盟主", en:"Leader",   ko:"연맹장", ar:"القائد", ru:"Лидер" },
      r4:       { zh:"R4 幹部", en:"R4 Officer", ko:"R4 장교", ar:"ضابط R4", ru:"Офицер R4" },
      academy:  { zh:"學院", en:"Academy",  ko:"아카데미", ar:"الأكاديمية", ru:"Академия" }
    },

    /* ——— NAP（協議術語） ——— */
    nap: {
      nap:       { zh:"NAP 協議", en:"NAP Agreement", ko:"NAP 협정", ar:"اتفاق NAP", ru:"Соглашение NAP" },
      warning:   { zh:"警告", en:"Warning", ko:"경고", ar:"تحذير", ru:"Предупреждение" },
      zeroed:    { zh:"清零", en:"Zeroed",  ko:"제로", ar:"تصفير",  ru:"Обнуление" },
      blacklist: { zh:"黑名單", en:"Blacklist", ko:"블랙리스트", ar:"القائمة السوداء", ru:"Чёрный список" }
    },

    /* ——— Resources（資源） ——— */
    resources: {
      food: { zh:"食物", en:"Food", ko:"식량", ar:"طعام", ru:"Еда" },
      wood: { zh:"木材", en:"Wood", ko:"목재", ar:"خشب", ru:"Дерево" },
      coal: { zh:"煤炭", en:"Coal", ko:"석탄", ar:"فحم", ru:"Уголь" },
      iron: { zh:"鐵礦", en:"Iron", ko:"철광", ar:"حديد", ru:"Железо" }
    },

    /* ——— Actions / Buffs（行為與加成） ——— */
    actions: {
      rally:      { zh:"集結", en:"Rally", ko:"랠리", ar:"حشد", ru:"Ралли" },
      join:       { zh:"加入", en:"Join",  ko:"참여", ar:"انضمام", ru:"Присоединиться" },
      occupy:     { zh:"佔領", en:"Occupy",ko:"점령", ar:"احتلال", ru:"Занять" },
      speedup:    { zh:"加速", en:"Speedup", ko:"가속", ar:"تسريع", ru:"Ускорение" },
      buff:       { zh:"增益", en:"Buff", ko:"버프", ar:"تعزيز", ru:"Бафф" }
    },

    /* ——— UI 常用字 ——— */
    ui: {
      rules:     { zh:"規則", en:"Rules", ko:"규칙", ar:"قواعد", ru:"Правила" },
      tips:      { zh:"提示", en:"Tips",  ko:"팁",   ar:"نصائح", ru:"Советы" },
      important: { zh:"重要", en:"Important", ko:"중요", ar:"هام", ru:"Важно" },
      schedule:  { zh:"時間線", en:"Timeline", ko:"타임라인", ar:"الخط الزمني", ru:"Хронология" }
    },

    /* ——— Time / Window（時間詞） ——— */
    time: {
      utc:      { zh:"UTC", en:"UTC", ko:"UTC", ar:"UTC", ru:"UTC" },
      starts:   { zh:"開始", en:"Starts", ko:"시작", ar:"يبدأ", ru:"Старт" },
      ends:     { zh:"結束", en:"Ends",   ko:"종료", ar:"ينتهي", ru:"Финиш" },
      cooldown: { zh:"冷卻", en:"Cooldown", ko:"재사용 대기", ar:"فترة التهدئة", ru:"КД" }
    }
  };
})();

/* ——— Activity Terms（活動專有名詞） ——— */
/* 直接貼在 app.js 最後，或 TERMS 定義之後 */
/* ——— Activity Terms（活動專有名詞） ——— */
TERMS.activity = {
  /* 機制與一般名詞 */
  rally:           { zh:"集結", en:"Rally", ko:"랠리", ar:"حشد", ru:"Ралли" },
  rally_lead:      { zh:"主將（最左列）", en:"Lead (far left)", ko:"리드(좌측 맨 왼쪽)", ar:"القائد (أقصى اليسار)", ru:"Лидер (крайний левый)" },
  rally_starter:   { zh:"集結發起者", en:"Rally Starter", ko:"랠리 개시자", ar:"مُطلق الحشد", ru:"Инициатор ралли" },
  rally_joiner:    { zh:"集結參與者", en:"Rally Joiner", ko:"랠리 참가자", ar:"منضمّ إلى الحشد", ru:"Участник ралли" },
  garrison:        { zh:"駐防", en:"Garrison", ko:"주둔", ar:"حامية", ru:"Гарнизон" },
  solo_attack:     { zh:"單挑/單攻", en:"Solo Attack", ko:"단독 공격", ar:"هجوم فردي", ru:"Соло-атака" },
  reinforce:       { zh:"增援", en:"Reinforce", ko:"증원", ar:"تعزيز", ru:"Подкрепление" },
  dispatch:        { zh:"派遣", en:"Dispatch", ko:"파견", ar:"إرسال", ru:"Отправка" },
  formation:       { zh:"隊形", en:"Formation", ko:"대형", ar:"تشكيلة", ru:"Построение" },
  preset:          { zh:"預設編隊", en:"Preset", ko:"프리셋", ar:"إعداد مسبق", ru:"Пресет" },

  /* 角色/站位與分工 */
  front_line:      { zh:"前線", en:"Front Line", ko:"전선", ar:"الجبهة", ru:"Передовая" },
  back_line:       { zh:"後排", en:"Back Line", ko:"후열", ar:"الخط الخلفي", ru:"Тыл" },
  flanker:         { zh:"側翼", en:"Flanker", ko:"측면", ar:"الجناح", ru:"Фланг" },
  filler:          { zh:"補位", en:"Filler", ko:"보충", ar:"مُتمّم", ru:"Добор" },
  anchor:          { zh:"錨位", en:"Anchor", ko:"앵커", ar:"مرساة", ru:"Якорь" },

  /* 目標/地物 */
  objective:       { zh:"目標點", en:"Objective", ko:"목표 지점", ar:"هدف", ru:"Цель" },
  node:            { zh:"節點/據點", en:"Node", ko:"거점", ar:"عقدة", ru:"Узел" },
  lane:            { zh:"路線/走廊", en:"Lane", ko:"경로", ar:"ممر", ru:"Линия" },
  gate:            { zh:"城門/關卡", en:"Gate", ko:"관문", ar:"بوابة", ru:"Ворота" },
  banner:          { zh:"聯盟旗幟", en:"Banner", ko:"깃발", ar:"راية", ru:"Знамя" },

  /* 狀態/指令 */
  hold:            { zh:"待命/原地", en:"Hold", ko:"대기", ar:"اثبت", ru:"Держать" },
  push:            { zh:"推進", en:"Push", ko:"밀기", ar:"ادفع", ru:"Пуш" },
  fall_back:       { zh:"後撤", en:"Fallback", ko:"후퇴", ar:"انسحاب", ru:"Отход" },
  regroup:         { zh:"重整/集合", en:"Regroup", ko:"재정비", ar:"إعادة تجمّع", ru:"Перегруппироваться" },
  rotate:          { zh:"輪轉", en:"Rotate", ko:"로테이션", ar:"تبديل المواقع", ru:"Ротировать" },

  /* 計時/冷卻/節奏 */
  window:          { zh:"時間窗", en:"Window", ko:"타임 윈도", ar:"نافذة زمنية", ru:"Окно" },
  phase:           { zh:"階段", en:"Phase", ko:"단계", ar:"مرحلة", ru:"Фаза" },
  wave:            { zh:"波次", en:"Wave", ko:"웨이브", ar:"موجة", ru:"Волна" },
  cooldown:        { zh:"冷卻", en:"Cooldown", ko:"재사용 대기", ar:"فترة التهدئة", ru:"КД" },
  timer:           { zh:"計時器", en:"Timer", ko:"타이머", ar:"مؤقّت", ru:"Таймер" },

  /* 計分/獎勵 */
  points:          { zh:"積分", en:"Points", ko:"포인트", ar:"نقاط", ru:"Очки" },
  ranking:         { zh:"排名", en:"Ranking", ko:"랭킹", ar:"ترتيب", ru:"Рейтинг" },
  reward:          { zh:"獎勵", en:"Reward", ko:"보상", ar:"مكافأة", ru:"Награда" },
  penalty:         { zh:"懲罰", en:"Penalty", ko:"패널티", ar:"عقوبة", ru:"Штраф" },

  /* Fortress / Sunfire / Bear Trap */
  fortress_outer:  { zh:"外環", en:"Outer Ring", ko:"외곽", ar:"الحلقة الخارجية", ru:"Внешнее кольцо" },
  fortress_inner:  { zh:"內環", en:"Inner Ring", ko:"내곽", ar:"الحلقة الداخلية", ru:"Внутреннее кольцо" },
  fortress_gate:   { zh:"堡壘大門", en:"Fortress Gate", ko:"요새 관문", ar:"بوابة الحصن", ru:"Ворота крепости" },

  sunfire_center:  { zh:"中央", en:"Center", ko:"중앙", ar:"المركز", ru:"Центр" },
  sunfire_lane_a:  { zh:"左路", en:"Left Lane", ko:"좌로", ar:"الممر الأيسر", ru:"Левый коридор" },
  sunfire_lane_b:  { zh:"右路", en:"Right Lane", ko:"우로", ar:"الممر الأيمن", ru:"Правый коридор" },

  beartrap_phase_charge: { zh:"蓄力階段", en:"Charge Phase", ko:"충전 단계", ar:"مرحلة الشحن", ru:"Фаза накопления" },
  beartrap_launch:       { zh:"開打",     en:"Launch",       ko:"개시",       ar:"الانطلاق",   ru:"Старт" }
};

/* ——— Events（活動清單，對照五語）——— */
TERMS.events = {
  alliance_championship:{ zh:"聯盟總動員", en:"Alliance Championship", ko:"연맹 챔피언십", ar:"بطولة التحالف", ru:"Чемпионат альянсов" },
  alliance_showdown:    { zh:"聯盟大作戰", en:"Alliance Showdown", ko:"연맹대작전", ar:"مواجهة التحالف", ru:"Противостояние альянсов" },
  bear_hunt:            { zh:"獵熊行動",   en:"Bear Hunt", ko:"곰 사냥 작전", ar:"صيد الدببة", ru:"Охота на медведя" },
  sunfire_castle:       { zh:"日炎城堡",   en:"Sunfire Castle", ko:"캐슬 전투", ar:"قلعة نار الشمس", ru:"Солнечный замок" },
  foundry_battle:       { zh:"兵工廠爭奪戰", en:"Foundry Battle", ko:"무기공장 쟁탈전", ar:"معركة مسبك الأسلحة", ru:"Битва литейной" },
  canyon_clash:         { zh:"峽谷會戰",   en:"Canyon Clash", ko:"협곡 전투", ar:"صراع الوادي", ru:"Стычка в каньоне" },
  svs_state_of_power:   { zh:"SVS – 最強王國", en:"SVS – State Of Power", ko:"서버전 – 최강 왕국", ar:"SVS مقاطعة القوة", ru:"SVS — Сила штата" },
  frostfire_mine:       { zh:"火晶啓用計劃 / 冷火礦", en:"Frostfire Mine", ko:"프로스트 파이어 광산", ar:"منجم الجليد اللهبي", ru:"Рудник Фростфайр" },
  hall_of_heroes:       { zh:"英雄殿堂",   en:"Hall of Heroes", ko:"영웅의 전당", ar:"قاعة الأبطال", ru:"Зал героев" },
  officer_project:      { zh:"士官計畫",   en:"Officer Project", ko:"사관의 계획", ar:"مسؤول المشروع", ru:"Проект офицеров" },
  hero_rally:           { zh:"英雄集結",   en:"Hero Rally", ko:"영웅 집결", ar:"حشد البطل", ru:"Сбор героев" },
  lucky_wheel:          { zh:"幸運大轉盤", en:"Lucky Wheel", ko:"행운의 룰렛", ar:"عجلة الحظ", ru:"Колесо удачи" },
  treasure_hunter:      { zh:"秘寶獵人",   en:"Treasure Hunter", ko:"비보 사냥꾼", ar:"صيد الكنز", ru:"Охотник за сокровищами" },
  journey_of_light:     { zh:"逐光之旅",   en:"Journey of Light", ko:"빛을 쫓는 여행", ar:"رحلة الضوء", ru:"Путешествие света" },
  tundra_trading_station:{ zh:"雪原貿易站", en:"Tundra Trading Station", ko:"설원 거래소", ar:"محطة تداول الحقل الثلجي", ru:"Торговая станция тундры" },
  return_to_tundra:     { zh:"回到凍土 / 冰原回歸", en:"Return To Tundra", ko:"빙원으로 복귀", ar:"العودة إلى الحقل الثلجي", ru:"Возвращение в тундру" },
  ginas_revenge:        { zh:"吉娜的復仇", en:"Gina’s Revenge", ko:"지나의 복수", ar:"انتقام جينا", ru:"Месть Джины" },
  flame_and_fang:       { zh:"烈焰與獠牙", en:"Flame and Fang", ko:"불꽃과 송곳니", ar:"اللهيب والأنياب", ru:"Пламя и клык" }
};

/* ——— Event-specific Terms（活動內部術語，五語） ——— */
TERMS.event_terms = {
  /* Sunfire Castle */
  hold_3h: { zh:"連續占領 3 小時即勝", en:"Hold for 3 consecutive hours to win", ko:"3시간 연속 점령 시 승리", ar:"الفوز عند السيطرة المتواصلة لمدة 3 ساعات", ru:"Победа при удержании 3 часа подряд" },
  longest_hold_wins:{ zh:"無人達成時，累積最久者勝", en:"If none achieve this, longest total hold wins", ko:"달성 팀이 없으면 총 점령시간 최장 동맹 승", ar:"إن لم يتحقّق ذلك، يفوز الأطول سيطرة إجمالية", ru:"Если никто не удержал, побеждает по суммарному времени" },
  turret:{ zh:"砲塔（控制越久攻擊越強）", en:"Turret (damage scales with control time)", ko:"포탑(점령 시간이 길수록 화력 증가)", ar:"البرج (تزداد قوته بطول مدة التحكم)", ru:"Турель (урон растёт с временем контроля)" },

  /* Foundry Battle */
  arsenal_points:{ zh:"軍備點數（聯盟／個人）", en:"Arsenal Points (Alliance/Personal)", ko:"병기 포인트(연맹/개인)", ar:"نقاط الترسانة (التحالف/الفرد)", ru:"Арсенальные очки (альянс/личные)" },
  control_buildings:{ zh:"占領/維持建築可得分", en:"Points from controlling/holding buildings", ko:"건물 점령/유지로 점수 획득", ar:"نقاط بالسيطرة/الحفاظ على المباني", ru:"Очки за захват/удержание зданий" },
  weapon_workshop:{ zh:"武器工坊補給（限量高分道具）", en:"Weapon Workshop supplies (limited high-score items)", ko:"무기 공방 보급(한정 고득점 아이템)", ar:"مؤن ورشة السلاح (عناصر عالية النقاط محدودة)", ru:"Снабжение оружейной (лимит. предметы)" },

  /* Alliance Championship */
  ac_phases:{ zh:"階段：報名→配對→準備→戰鬥→結算（商店）", en:"Phases: Sign-up → Matchmaking → Preparation → Battle → Completion (Shop)", ko:"단계: 신청→매칭→준비→전투→완료(상점)", ar:"المراحل: التسجيل→المواءمة→التحضير→المعركة→الإتمام (المتجر)", ru:"Этапы: регистрация→матчмейкинг→подготовка→бой→завершение (магазин)" },

  /* Bear Hunt */
  bear_open_30m:{ zh:"R4/R5 開啟；限時 30 分鐘擊殺", en:"Opened by R4/R5; 30-minute kill window", ko:"R4/R5가 개시; 30분 제한", ar:"يفتحه R4/R5؛ نافذة قتل 30 دقيقة", ru:"Открывают R4/R5; 30 минут на убийство" },
  bear_player_cooldown:{ zh:"玩家冷卻間隔（不可連續參與）", en:"Player cooldown interval (cannot join back-to-back)", ko:"플레이어 재참여 대기시간", ar:"فترة تهدئة للاعب (لا مشاركة متتالية)", ru:"КД игрока (нельзя участвовать подряд)" },

  /* Canyon Clash */
  canyon_three_stages:{ zh:"三階段：占中立/奪建築 → 爭奪要塞 → 收束", en:"Three stages: seize neutral/enemy buildings → fight for fortresses → finalize", ko:"3단계: 중립/적 건물 점령 → 요새 쟁탈 → 마무리", ar:"ثلاث مراحل: الاستيلاء على المباني → القتال على الحصون → الختام", ru:"Три этапа: захват зданий → бой за крепости → финал" },
  key_routes_fortresses:{ zh:"要塞位於關鍵路線上，必須爭奪", en:"Fortresses lie on key routes and must be contested", ko:"요새는 주요 경로에 있어 반드시 쟁탈", ar:"الحصون على طرق محورية ويجب التنافس عليها", ru:"Крепости стоят на ключевых маршрутах — нужно биться" }
};
/* ——— Hero Names（英雄名稱對照，五語） ——— */
const term = (domain, key, lang) =>
  (TERMS?.[domain]?.[key]?.[normalizeLang(lang||i18n.current)]) ??
  (TERMS?.[domain]?.[key]?.en) ?? (TERMS?.[domain]?.[key]?.zh) ?? key;
const heroName = (key, lang) =>
  (HERO?.[key]?.[normalizeLang(lang||i18n.current)]) ??
  (HERO?.[key]?.en) ?? (HERO?.[key]?.zh) ?? key;

/* ========== 教學：主目錄 + 發佈清單（長期內容唯一要改的地方） ========== */
/*
  ✅ 新增教學卡片：在 GUIDE_CATALOG 最後加一個物件（照格式）
  ✅ 上架/下架   ：把 id 加進/移出 PUBLISH_GUIDES
  ✅ 置頂排序     ：pinned:true + pinOrder（小者在前）
  ✅ 多語         ：title / items 可寫 { zh,en,ko,ar,ru } 或純字串（固定）
  ✅ 預約上下架   ：寫 startAt / until（ISO 字串）
*/
const GUIDE_CATALOG = [
  {
    id: "hero-name-aliases-v1",
    badge: "tip",
    pinned: true,
    pinOrder: 1, // 依你的排序可調整
    title: { zh: "英雄名稱對照表", en: "Hero Name Reference", ko:"영웅 이름 대조표", ar:"مطابقة أسماء الأبطال", ru:"Сопоставление имён героев" },
    // ⚠ 使用反引號保留原始符號與空白
    items: [
      `1.杰⻄/Jessie/제시/ ٮسي$ ح" /Джесси`,
      `2.傑塞爾/Jasser/제설/ حاسر " /Джассер`,
      `3.書允/Seo-yoon/서윤/ ون$ وٮٮ$ س /Со-Юн`,
      `4.赫羅尼莫/Jeronimo/제로니모/ ٮمو $ ٮ/ ٮرو $ ح" /Джеронимо`,
      `5. 津曼/Zinman/진먼/ ٮمان / زي /Зинман`,
      `6. 茉莉/Molly/몰리/ ى6 مول /Молли`,
      `7. 吉娜/Gina/지나/ ٮا/ ٮ$ ح" /Джина`,
      `8. 謝爾蓋/Sergey/세르게이/ ى6 ح" ٮر$ س/Сергей`,
      `9. 巴希提/Bahiti/바히티/ تي$ ٮاهٮ " /Бахити`,
      `10. 娜塔莉亞/Natalia/나탈리아/ ا$ الٮ : ٮاٮ / /Наталия`,
      `11. 派翠克/Patrick/패트릭/ ريك : ٮاٮ" /Патриĸ`,
      `12. 盧姆•波根/Lumak Bokan/룸 보겐/ لوم اك
  ٮوكان " /Лумаĸ Боĸан`,
      `13.尤⾦/Eugene/유진/ ٮن$ ح" و$ ٮ/Юджин`,
      `14.凌雪/Ling Xue/료유 و키 ٮغ /ش / ٮ$ ل/Лин Сюе`,
      `15.克勞瑞斯/Cloris/클로리스/ كول ريس /Клорис`,
      `16.查理/Charlie/찰리/ ى6 شارل : ٮ/Чарли`,
      `17.史密斯/Smith/스미스/ ال حد اد /Смит`
    ]
  },
  {
    id: "beartrap-hero-picks-v1",
    badge: "tip",
    pinned: true,
    pinOrder: 2, // 依你的排序可調整
    title: {
      zh: "獵熊陷阱的英雄選擇",
      en: "Bear Trap: Hero Picks",
      ko: "곰 덫: 영웅 선택",
      ar: "مصيدة الدب: اختيار الأبطال",
      ru: "Bear Trap: выбор героев"
    },
    items: [
      {
        zh: "請熟悉此指南，以便未來參加獵熊陷阱活動！",
        en: "Please familiarize yourself with this guide for future Bear Traps!",
        ko: "향후 곰 덫 참여를 위해 이 가이드를 숙지해 주세요!",
        ar: "يُرجى الاطّلاع على هذا الدليل والاستعداد لمصائد الدببة القادمة!",
        ru: "Пожалуйста, ознакомьтесь с этим гайдом к будущим «Bear Trap»!"
      },
      {
        zh: "發起集結者：請使用你最強的三位英雄",
        en: "Rally starters: Use your 3 strongest heroes",
        ko: "랠리 개시자: 가장 강한 영웅 3명을 사용하세요",
        ar: "مُطلِقو الحشد: استخدموا أقوى ثلاثة أبطال لديكم",
        ru: "Инициаторы ралли: используйте трёх самых сильных героев"
      },
      {
        zh: "參加集結者：以下任一主將＋任意 2 位英雄",
        en: "Rally joiners: Use one of the following leads + any 2 heroes",
        ko: "랠리 참가: 아래 리드 중 하나 + 임의의 영웅 2명",
        ar: "المنضمون إلى الحشد: استخدم أحد القادة التاليين + أي بطلين",
        ru: "Участники ралли: один из лидеров ниже + любые 2 героя"
      },
      {
        zh: `以 ${nameOf("jessie").zh} 為左位主將＋任意 2 位英雄`,
        en: `Use ${nameOf("jessie").en} as lead (far left) + any 2 heroes`,
        ko: `좌측 주영웅으로 ${nameOf("jessie").ko} + 임의의 2명`,
        ar: `اجعل ${nameOf("jessie").ar} قائداً (أقصى اليسار) + أي بطلين`,
        ru: `Лидер слева — ${nameOf("jessie").ru} + любые 2 героя`
      },
      {
        zh: `以 ${nameOf("jeronimo").zh} 為左位主將＋任意 2 位英雄`,
        en: `Use ${nameOf("jeronimo").en} as lead (far left) + any 2 heroes`,
        ko: `좌측 주영웅으로 ${nameOf("jeronimo").ko} + 임의의 2명`,
        ar: `اجعل ${nameOf("jeronimo").ar} قائداً (أقصى اليسار) + أي بطلين`,
        ru: `Лидер слева — ${nameOf("jeronimo").ru} + любые 2 героя`
      },
      {
        zh: `以 ${nameOf("seoyoon").zh} 為左位主將＋任意 2 位英雄`,
        en: `Use ${nameOf("seoyoon").en} as lead (far left) + any 2 heroes`,
        ko: `좌측 주영웅으로 ${nameOf("seoyoon").ko} + 임의의 2명`,
        ar: `اجعل ${nameOf("seoyoon").ar} قائداً (أقصى اليسار) + أي بطلين`,
        ru: `Лидер слева — ${nameOf("seoyoon").ru} + любые 2 героя`
      },
      {
        zh: `以 ${nameOf("jasser").zh} 為左位主將＋任意 2 位英雄`,
        en: `Use ${nameOf("jasser").en} as lead (far left) + any 2 heroes`,
        ko: `좌측 주영웅으로 ${nameOf("jasser").ko} + 임의의 2명`,
        ar: `اجعل ${nameOf("jasser").ar} قائداً (أقصى اليسار) + أي بطلين`,
        ru: `Лидер слева — ${nameOf("jasser").ru} + любые 2 героя`
      },
      {
        zh: "若上述主將均不可用，請不要派英雄（僅派部隊）",
        en: "If none of the above leads are available, send NO heroes (troops only)",
        ko: "위 리드가 모두 불가하면 영웅을 보내지 마세요(부대만 파견)",
        ar: "إن لم يتوفر أي من القادة المذكورين، فلا تُرسل أبطالاً (أرسل القوات فقط)",
        ru: "Если ни один из лидеров недоступен, героев НЕ отправлять (только войска)"
      },
      {
        zh: "參加獵熊陷阱時，除了上述主將以外，請勿以其他英雄作為左側主將（最左列）",
        en: "When joining Bear Trap, do NOT set any other hero as lead (far left) except the above",
        ko: "곰 덫 참여 시 위 영웅 외의 다른 영웅을 좌측 주영웅으로 절대 배치하지 마세요",
        ar: "عند الانضمام إلى مصيدة الدب، لا تضع أي بطل آخر قائداً (أقصى اليسار) غير المذكورين أعلاه",
        ru: "При присоединении к Bear Trap НЕ ставьте лидером (крайний левый слот) никого, кроме перечисленных выше"
      }
    ]
  },
  {
    id: "troop-ratio-v1",
    badge: "tip",
    pinned: true,
    pinOrder: 3, // 依你的排序可調整
    title: {
      zh: "步兵 / 槍騎兵 / 射手 比例",
      en: "Infantry / Lancer / Marksman Ratio",
      ko: "보병 / 창기병 / 사수 비율",
      ar: "نِسَب المشاة / الرماحة / الرماة",
      ru: "Соотношение: Пехота / Копейщики / Стрелки"
    },
    items: [
      {
        zh: "集結進攻：50/20/30 或 60/40/0",
        en: "Rally Attack: 50/20/30 or 60/40/0",
        ko: "랠리 공격: 50/20/30 또는 60/40/0",
        ar: "هجوم الحشد: 50/20/30 أو 60/40/0",
        ru: "Атака ралли: 50/20/30 или 60/40/0"
      },
      {
        zh: "駐防防守：60/20/20",
        en: "Garrison Defense: 60/20/20",
        ko: "주둔 방어: 60/20/20",
        ar: "دفاع الحامية: 60/20/20",
        ru: "Оборона гарнизона: 60/20/20"
      },
      {
        zh: "狩獵陷阱：10/20/70",
        en: "Bear Trap: 10/20/70",
        ko: "곰 덫: 10/20/70",
        ar: "مصيدة الدب: 10/20/70",
        ru: "Ловушка на медведя: 10/20/70"
      },
      {
        zh: "太陽城 — 進攻：50/20/30；防守：60/20/20",
        en: "Sunfire Castle — Attack: 50/20/30; Defense: 60/20/20",
        ko: "선파이어 캐슬 — 공격: 50/20/30; 방어: 60/20/20",
        ar: "قلعة نار الشمس — هجوم: 50/20/30؛ دفاع: 60/20/20",
        ru: "Солнечный замок — Атака: 50/20/30; Оборона: 60/20/20"
      },
      {
        zh: "兵工廠爭奪戰：50/20/30",
        en: "Foundry Battle: 50/20/30",
        ko: "무기공장 쟁탈전: 50/20/30",
        ar: "معركة مسبك الأسلحة: 50/20/30",
        ru: "Битва литейной: 50/20/30"
      },
      {
        zh: "堡壘戰：50/20/30",
        en: "Fortress Battle: 50/20/30",
        ko: "요새전: 50/20/30",
        ar: "معركة الحصن: 50/20/30",
        ru: "Битва за крепость: 50/20/30"
      }
    ]
  },
  {
    id: "geocore-expedition-guide-v2",
    badge: "tip",
    pinned: true,
    pinOrder: 4, // 依你的排序可調整
    title: {
      zh: "地心探險：活動技巧與軍隊比例",
      en: "Geocore Expedition: Strategy & Troop Ratios",
      ko: "지심 탐험: 공략과 부대 비율",
      ar: "استكشاف قلب الأرض: الإستراتيجيات ونِسَب القوات",
      ru: "Экспедиция к ядру: тактика и соотношение войск"
    },
    items: [
      {
        zh: "以下為地心探險的活動技巧與推薦比例配置，能幫助你在不同區域中獲得最佳成效。",
        en: "Here are key strategies and recommended troop ratios to perform better across all Geocore Expedition zones.",
        ko: "다음은 지심 탐험의 각 지역에서 더 나은 성과를 내기 위한 핵심 팁과 추천 부대 비율입니다.",
        ar: "فيما يلي أهم النصائح ونِسَب القوات الموصى بها لتحقيق أفضل أداء في مناطق استكشاف قلب الأرض.",
        ru: "Ниже приведены советы и рекомендованные пропорции войск для успешного прохождения всех зон экспедиции к ядру."
      },
      {
        zh: "⚔️ 軍隊比例建議：",
        en: "⚔️ Recommended Troop Ratios:",
        ko: "⚔️ 추천 부대 비율:",
        ar: "⚔️ نِسَب القوات الموصى بها:",
        ru: "⚔️ Рекомендованные соотношения войск:"
      },
      {
        zh: `
  ▪ 勇者之地 — 55 | 15 | 30
  ▪ 群獸洞窟 — 55 | 15 | 30
  ▪ 微光礦洞 — 50 | 15 | 35
  ▪ 地下實驗室 — 60 | 15 | 25
  ▪ 黑鐵鍛爐 — 45 | 20 | 35 或 40 | 20 | 40
  ▪ 大地之心 — 55 | 15 | 30 或 60 | 15 | 25
  `,
        en: `
  ▪ Land of the Brave – 55 | 15 | 30
  ▪ Cave of Beasts – 55 | 15 | 30
  ▪ Glowstone Mine – 50 | 15 | 35
  ▪ Underground Lab – 60 | 15 | 25
  ▪ Dark Forge – 45 | 20 | 35 or 40 | 20 | 40
  ▪ Heart of Gaia – 55 | 15 | 30 or 60 | 15 | 25
  `,
        ko: `
  ▪ 용자의 땅 – 55 | 15 | 30
  ▪ 군수의 동굴 – 55 | 15 | 30
  ▪ 미광 광산 – 50 | 15 | 35
  ▪ 지하 실험실 – 60 | 15 | 25
  ▪ 흑철 대장간 – 45 | 20 | 35 또는 40 | 20 | 40
  ▪ 대지의 심장 – 55 | 15 | 30 또는 60 | 15 | 25
  `,
        ar: `
  ▪ أرض الشجعان – 55 | 15 | 30
  ▪ كهف الوحوش – 55 | 15 | 30
  ▪ منجم الحجر المتلألئ – 50 | 15 | 35
  ▪ المختبر تحت الأرض – 60 | 15 | 25
  ▪ الحدادة السوداء – 45 | 20 | 35 أو 40 | 20 | 40
  ▪ قلب جايا – 55 | 15 | 30 أو 60 | 15 | 25
  `,
        ru: `
  ▪ Земля отважных – 55 | 15 | 30
  ▪ Пещера чудовищ – 55 | 15 | 30
  ▪ Светящаяся шахта – 50 | 15 | 35
  ▪ Подземная лаборатория – 60 | 15 | 25
  ▪ Тёмная кузня – 45 | 20 | 35 или 40 | 20 | 40
  ▪ Сердце Гайи – 55 | 15 | 30 или 60 | 15 | 25
  `
      },
      {
        zh: "🧭 區域屬性與開放時間：",
        en: "🧭 Zone Attributes & Schedule :",
        ko: "🧭 지역 속성과 개방 일정 :",
        ar: "🧭 خصائص المناطق ومواعيد الفتح) :",
        ru: "🧭 Особенности зон и время открытия :"
      },
      {
        zh: `
   勇者之地
  　・開放時間：週一、週二
  　・屬性加成：僅英雄、英雄裝備與專屬裝備屬性生效
  　・重點特色：英雄戰力核心區域，適合以英雄為主的隊伍

   群獸洞窟
  　・開放時間：週三、週四
  　・屬性加成：只有寵物屬性生效，寵物技能預設啟用
  　・重點特色：適合以寵物為主力的玩家，寵物技能會自動觸發

   微光礦洞
  　・開放時間：週三、週四
  　・屬性加成：僅領主寶石屬性生效
  　・重點特色：強化寶石能提升顯著戰力，對寶石研究者有優勢

   地下實驗室
  　・開放時間：週五、週六
  　・屬性加成：僅科技研究所與戰爭學院屬性生效
  　・重點特色：科技型玩家專屬區，研究與學院升級效果最大化

   黑鐵鍛爐
  　・開放時間：週五、週六
  　・屬性加成：僅領主裝備屬性生效
  　・重點特色：著重裝備鍛造與強化，是裝備進階的重要來源

   大地之心
  　・開放時間：週日
  　・屬性加成：所有屬性皆生效（英雄、寵物、科技、寶石、裝備、VIP等）
  　・重點特色：最終綜合挑戰區，所有戰力與屬性全面啟用
  `,
        en: `
   Land of the Brave
    ・Open Days: Monday, Tuesday
    ・Active Attributes: Only hero & hero gear stats apply
    ・Highlights: Core hero-based zone, ideal for hero-focused lineups

   Cave of Beasts
    ・Open Days: Wednesday, Thursday
    ・Active Attributes: Only pet attributes active, pet skills auto-enabled
    ・Highlights: Designed for pet-based players, pets act automatically

   Glowstone Mine
    ・Open Days: Wednesday, Thursday
    ・Active Attributes: Only lord gemstone stats apply
    ・Highlights: Great advantage for players with enhanced gemstones

   Underground Lab
    ・Open Days: Friday, Saturday
    ・Active Attributes: Only research & tech stats apply
    ・Highlights: Ideal for tech-oriented players; maximizes research bonuses

   Dark Forge
    ・Open Days: Friday, Saturday
    ・Active Attributes: Only lord gear stats apply
    ・Highlights: Focused on forging and upgrading gear for higher performance

   Heart of Gaia
    ・Open Days: Sunday
    ・Active Attributes: All attributes active (heroes, pets, tech, gems, gear, VIP, etc.)
    ・Highlights: Final comprehensive zone with all boosts enabled
  `,
        ko: `
   용자의 땅
  　・개방일: 월요일, 화요일
  　・적용 속성: 영웅 및 영웅 장비 속성만 적용
  　・특징: 영웅 중심 지역, 영웅 위주 조합에 적합

   군수의 동굴
  　・개방일: 수요일, 목요일
  　・적용 속성: 펫 속성만 적용, 펫 스킬 자동 발동
  　・특징: 펫 중심 플레이어에게 적합, 자동 전투 지원

   미광 광산
  　・개방일: 수요일, 목요일
  　・적용 속성: 군주의 보석 속성만 적용
  　・특징: 보석 강화 효과가 크며, 보석 연구자에게 유리

   지하 실험실
  　・개방일: 금요일, 토요일
  　・적용 속성: 연구소 및 전쟁 학원 속성만 적용
  　・특징: 기술형 플레이어에게 적합, 연구 보너스 극대화

   흑철 대장간
  　・개방일: 금요일, 토요일
  　・적용 속성: 군주 장비 속성만 적용
  　・특징: 장비 제작과 강화에 집중, 높은 효율

   대지의 심장
  　・개방일: 일요일
  　・적용 속성: 모든 속성 적용 (영웅, 펫, 연구, 보석, 장비, VIP 등)
  　・특징: 종합 도전 지역, 모든 전투력 요소 활성화
  `,
        ar: `
   أرض الشجعان
  　• أيام الفتح: الإثنين والثلاثاء
  　• الخصائص النشطة: سمات الأبطال ومعداتهم فقط
  　• المميزات: منطقة تعتمد على الأبطال، مثالية للتشكيلات التي تركز عليهم

   كهف الوحوش
  　• أيام الفتح: الأربعاء والخميس
  　• الخصائص النشطة: خصائص الحيوانات الأليفة فقط، والمهارات مفعلة تلقائيًا
  　• المميزات: مناسبة للاعبين الذين يعتمدون على الحيوانات الأليفة

   منجم الحجر المتلألئ
  　• أيام الفتح: الأربعاء والخميس
  　• الخصائص النشطة: خصائص جواهر القائد فقط
  　• المميزات: ميزة كبيرة للاعبين الذين يمتلكون جواهر قوية

   المختبر تحت الأرض
  　• أيام الفتح: الجمعة والسبت
  　• الخصائص النشطة: خصائص الأبحاث والتكنولوجيا فقط
  　• المميزات: مثالية لعشاق التطوير التقني والبحث

   الحدادة السوداء
  　• أيام الفتح: الجمعة والسبت
  　• الخصائص النشطة: خصائص معدات القائد فقط
  　• المميزات: تركّز على تحسين المعدات وصناعتها

   قلب جايا
  　• أيام الفتح: الأحد
  　• الخصائص النشطة: جميع الخصائص مفعلة (الأبطال، الحيوانات، التقنية، الجواهر، المعدات، VIP...)
  　• المميزات: المرحلة النهائية الشاملة التي تفعّل كل قدرات القائد
  `,
        ru: `
   Земля отважных
  　• Дни открытия: Понедельник, Вторник
  　• Активные характеристики: Только герои и их снаряжение
  　• Особенности: Основная зона героев, идеально подходит для героических отрядов

   Пещера чудовищ
  　• Дни открытия: Среда, Четверг
  　• Активные характеристики: Только питомцы, умения активны автоматически
  　• Особенности: Подходит игрокам с сильными питомцами

   Светящаяся шахта
  　• Дни открытия: Среда, Четверг
  　• Активные характеристики: Только атрибуты камней лорда
  　• Особенности: Преимущество для игроков с усиленными самоцветами

   Подземная лаборатория
  　• Дни открытия: Пятница, Суббота
  　• Активные характеристики: Только исследования и технологии
  　• Особенности: Идеальна для техно-игроков, максимизирует бонусы исследований

   Тёмная кузня
  　• Дни открытия: Пятница, Суббота
  　• Активные характеристики: Только экипировка лорда
  　• Особенности: Сосредоточена на кузне и улучшении экипировки

   Сердце Гайи
  　• Дни открытия: Воскресенье
  　• Активные характеристики: Все активны (герои, питомцы, технологии, самоцветы, снаряжение, VIP и т.д.)
  　• Особенности: Финальная комплексная зона, активируются все усиления
  `
      }
    ]
  },
  {
    id: "foundry-battle-briefing-v1",
    badge: "event",
    pinned: true,
    pinOrder: 5, // 依你的排序可調整
    title: {
      zh: "兵工廠爭奪戰｜規則與計分速覽",
      en: "Foundry Battle | Rules & Scoring Quick Guide",
      ko: "무기공장 쟁탈전 | 규칙·득점 요약",
      ar: "معركة المسبك | ملخّص القواعد والنقاط",
      ru: "Битва литейной | Краткий гид по правилам и очкам"
    },
    items: [
      // 概述
      {
        zh: "活動概述：兵工廠為 1 小時的對抗型團隊活動。透過佔領建築獲得軍備點數；每座建築建議 2–3 名成員協同攻佔與駐守。",
        en: "Overview: Foundry is a 1-hour team event versus an opponent. Gain Arsenal Points by controlling buildings. Recommended 2–3 players per building to take and hold.",
        ko: "개요: 무기공장은 1시간 팀 대전 이벤트입니다. 건물을 점령해 병기 포인트를 획득하며, 각 건물은 2–3명이 협동해 점령/유지하는 것을 권장합니다.",
        ar: "نظرة عامة: فعالية لمدة ساعة بين فريقين. تكسب نقاط الأسلحة عبر السيطرة على المباني. يُنصح بـ 2–3 لاعبين لكل مبنى للهجوم والحراسة.",
        ru: "Обзор: «Литейная» — часовое командное событие против соперников. Очки арсенала начисляются за контроль зданий. Рекомендуется 2–3 игрока на здание для захвата и удержания."
      },

      // 計分標準
      { 
        zh: "軍備點數（每分鐘）：", 
        en: "Arsenal Points (per minute):",
        ko: "병기 포인트(분당):",
        ar: "نقاط الأسلحة (في الدقيقة):",
        ru: "Очки арсенала (в минуту):"
      },
      {
        zh: "+240/分：鍋爐房、傭兵兵營、彈藥庫、中央運輸站",
        en: "+240/m: Boiler Room, Mercenary Barracks, Ammunition Depot, Central Transit Station",
        ko: "+240/분: 보일러실, 용병 병영, 탄약고, 중앙 환승역",
        ar: "+240/دقيقة: غرفة الغلايات، ثكنة المرتزقة، مستودع الذخيرة، محطة العبور المركزية",
        ru: "+240/м: Котельная, Казармы наёмников, Склад боеприпасов, Центральный транзитный узел"
      },
      {
        zh: "+600/分：修理設施（I–IV）",
        en: "+600/m: Repair Facilities (I–IV)",
        ko: "+600/분: 정비 시설(I–IV)",
        ar: "+600/دقيقة: مرافق الإصلاح (I–IV)",
        ru: "+600/м: Ремонтные объекты (I–IV)"
      },
      {
        zh: "+1,200/分：原型場（I–II）",
        en: "+1,200/m: Prototype Site (I–II)",
        ko: "+1,200/분: 시제품 구역(I–II)",
        ar: "+1,200/دقيقة: موقع النماذج الأوّلية (I–II)",
        ru: "+1 200/м: Площадка прототипов (I–II)"
      },
      {
        zh: "+1,800/分：帝國兵工廠",
        en: "+1,800/m: Imperial Foundry",
        ko: "+1,800/분: 제국 병기공장",
        ar: "+1,800/دقيقة: المسبك الإمبراطوري",
        ru: "+1 800/м: Имперская литейная"
      },

      // 攻防建議（散點機制）
      {
        zh: "攻防建議：除「帝國兵工廠」外，建築遭強攻時，優先撤回避免丟失一半點數；若失守，一半點數直接消失，其餘會散落，可嘗試回收。若評估可擊退敵軍，可待其佔領後反撲；否則立即轉去支援需要幫助的隊友。",
        en: "Attack/Defense: If a building (except Imperial) is under heavy attack, recall to avoid losing half your points. On losing control, half vanish and the rest scatter—try to collect them. If you can win, counterattack after they take over; otherwise go help allies.",
        ko: "공수 팁: 제국 병기공장을 제외한 건물이 강하게 공격받으면 우선 회군해 포인트 절반 손실을 피하세요. 점령을 빼앗기면 절반은 소멸, 나머지는 흩어지므로 회수 시도. 승산이 있으면 적이 점령한 뒤 역공, 아니면 즉시 아군 지원으로 전환.",
        ar: "نصيحة هجوم/دفاع: إذا تعرّض مبنى (عدا الإمبراطوري) لهجوم قوي فاسحب قواتك لتجنّب خسارة نصف النقاط. عند فقدان السيطرة يختفي نصفها ويتبعثر الباقي—حاول جمعه. إن ضمنت الفوز فهاجم بعد سيطرتهم، وإلا فاتجه لدعم الحلفاء.",
        ru: "Советы по обороне/атаке: Если объект (кроме Имперской) сильно давят, отзывайте войска, чтобы не потерять половину очков. При потере контроля половина очков исчезает, остаток рассеивается — попытайтесь собрать. Есть шанс победить — контратакуйте после их захвата; иначе — помогайте союзникам."
      },

      // Key tips
      { 
        zh: "關鍵要點：", 
        en: "Key tips:",
        ko: "핵심 팁:",
        ar: "نصائح أساسية:",
        ru: "Ключевые советы:"
      },
      {
        zh: "1) 即時通訊：活動期間務必留意小隊聊天。",
        en: "1) Communication: read squad chat closely during the event.",
        ko: "1) 소통: 이벤트 동안 분대 채팅을 반드시 확인하세요.",
        ar: "1) التواصل: راقب دردشة الفرقة جيدًا أثناء الفعالية.",
        ru: "1) Связь: внимательно следите за чатом отряда во время события."
      },
      {
        zh: "2) 佔住即分流：穩住己方設施後，其他部隊支援隊友、掠奪或進攻。",
        en: "2) After securing a facility, send other marches to back up allies, loot, or attack.",
        ko: "2) 분산 운용: 한 건물 고정 후 남는 부대는 지원/약탈/공격으로 전환.",
        ar: "2) بعد تأمين منشأة، أرسل المسيرات الأخرى للدعم أو النهب أو الهجوم.",
        ru: "2) Зафиксировали объект — перекидывайте остальные отряды на помощь, налёт или атаку."
      },
      {
        zh: "3) 要援請丟座標：需要支援時把座標貼在聊天（彼此互相支援）。",
        en: "3) Need backup? Post coordinates in chat (we support each other).",
        ko: "3) 증원 요청은 좌표와 함께 채팅에 공유하세요.",
        ar: "3) تحتاج دعماً؟ أرسل الإحداثيات في الدردشة (ندعم بعضنا).",
        ru: "3) Нужна помощь? Кидайте координаты в чат (помогаем друг другу)."
      },
      {
        zh: "4) 攻前必偵查：避免盲衝，掌握對手配置與強度。",
        en: "4) Always scout before attacking to avoid blind pushes.",
        ko: "4) 공격 전 정찰은 필수입니다. 무지성 돌입 금지.",
        ar: "4) استطلع دائمًا قبل الهجوم لتجنّب الاندفاع الأعمى.",
        ru: "4) Всегда разведка перед атакой — никаких «слепых» заходов."
      },
      {
        zh: "5) 團隊至上：保持隊形與節奏，享受協同作戰。",
        en: "5) Teamwork first: keep formation and tempo; enjoy coordinated play.",
        ko: "5) 팀워크 최우선: 대형과 템포 유지, 합 맞춰 즐기세요.",
        ar: "5) الفريق أولاً: حافظ على التشكيل والإيقاع واستمتع باللعب المنسّق.",
        ru: "5) Командная игра: держите строй и темп; получайте удовольствие от слаженных действий."
      }
    ]
  },
  {
    id: "crazy-joey-event-sop-v1",
    badge: "event",
    pinned: true,
    pinOrder: 6, // 依你的排序可調整
    title: {
      zh: "瘋狂喬伊",
      en: "Crazy Joey",
      ko: "크레이지 조이",
      ar: "جوي المجنون",
      ru: "Безумный Джои"
    },
    items: [
      // === 概述 / Overview ===
      {
        zh: "40 分鐘活動，共 20 回合；以團隊協作與穩定輸出為主。",
        en: "40-minute event with 20 rounds; team coordination and steady output are key.",
        ko: "40분 이벤트, 총 20라운드. 팀 협업과 안정적 딜이 핵심입니다.",
        ar: "فعالية لمدة 40 دقيقة مع 20 جولة؛ التنسيق الجماعي والإخراج المستقر هما الأساس.",
        ru: "Событие на 40 минут, 20 раундов; ключ — командная координация и стабильный урон."
      },

      // === 回合規則 / Round rules ===
      {
        zh: "第 10 與 20 回合：僅派【步兵/矛兵】到總部 HQ，左槽放 Patrick。",
        en: "Rounds 10 & 20: send Infantry and Lancers ONLY to HQ; place Patrick in the left slot.",
        ko: "라운드 10·20: 보병/창병만 HQ로 보내고, 왼쪽 슬롯에 Patrick 배치.",
        ar: "الجولتان 10 و20: أرسل المشاة والرمّاح فقط إلى المقر HQ، وضع Patrick في الخانة اليسرى.",
        ru: "Раунды 10 и 20: отправляйте ТОЛЬКО пехоту и копейщиков в HQ; Patrick — в левый слот."
      },
      {
        zh: "第 7、14、17 回合：僅對【城主在線】的城市生效。",
        en: "Rounds 7, 14 and 17 apply only to cities where the chief (city owner) is online.",
        ko: "라운드 7·14·17: 도시의 영주(소유자)가 온라인인 경우에만 적용.",
        ar: "الجولات 7 و14 و17 تنطبق فقط على المدن التي يكون حاكمها متصلاً.",
        ru: "Раунды 7, 14 и 17 действуют только для городов, где правитель онлайн."
      },

      // === 計分與防守 / Scoring & defense ===
      {
        zh: "得分：彼此增援才有分；駐軍在自己城市不計分。",
        en: "Scoring: reinforce each other to get points — troops in your own city do NOT score.",
        ko: "득점: 서로 증원해야 점수가 오릅니다 — 자기 도시 주둔군은 점수 없음.",
        ar: "التسجيل: عزّز الآخرين لتحصل على النقاط — القوات داخل مدينتك لا تكسب نقاطاً.",
        ru: "Очки: усиливайте союзников, чтобы получать очки — гарнизон в своём городе очков не даёт."
      },
      {
        zh: "防守：最強英雄留在本城的路障/防線（barricades）。",
        en: "Defense: leave your strongest heroes in your city’s barricades.",
        ko: "수비: 최강 영웅은 도시의 바리케이드에 배치.",
        ar: "الدفاع: اترك أقوى أبطالك في متاريس مدينتك.",
        ru: "Оборона: сильнейших героев оставляйте в баррикадах вашего города."
      },
      {
        zh: "分數警告：不要治療部隊、不要滅火；這些行為會降低分數。",
        en: "Score warning: do NOT heal troops and do NOT extinguish fires; doing so lowers your score.",
        ko: "점수 주의: 치료/화재 진압 금지 — 점수가 감소합니다.",
        ar: "تحذير نقاط: لا تعالج القوات ولا تُطفئ الحريق؛ ذلك يُنقص النقاط.",
        ru: "Внимание к очкам: не лечите войска и не тушите пожар — это снижает счёт."
      },

      // === 在線時 / If you will be online ===
      {
        zh: "在線：提早 10–15 分鐘到場。",
        en: "Online: arrive 10–15 minutes early.",
        ko: "온라인: 10–15분 일찍 접속.",
        ar: "أونلاين: ادخل قبل 10–15 دقيقة.",
        ru: "Онлайн: приходите за 10–15 минут до начала."
      },
      {
        zh: "在線：所有部隊優先去增援他人。",
        en: "Online: send all troops to reinforce others.",
        ko: "온라인: 모든 부대를 타인 증원에 투입.",
        ar: "أونلاين: أرسل كل القوات لتعزيز الآخرين.",
        ru: "Онлайн: отправляйте все войска на усиление союзников."
      },
      {
        zh: "在線：在聯盟聊天告知你需要增援。",
        en: "Online: tell alliance chat if you need reinforcements.",
        ko: "온라인: 증원이 필요하면 연맹 채팅에 알림.",
        ar: "أونلاين: أخبر دردشة التحالف إن احتجت تعزيزاً.",
        ru: "Онлайн: пишите в чат альянса, если нужны подкрепления."
      },
      {
        zh: "在線：調度增援，先確保【在線者】都有增援，再補到離線者。",
        en: "Online: rotate troops so everyone online has reinforcements first, then cover offline cities.",
        ko: "온라인: 온라인 인원부터 증원 배분 후, 오프라인 도시도 커버.",
        ar: "أونلاين: وزّع التعزيزات بحيث يحصل المتصلون أولاً، ثم غطِّ غير المتصلين.",
        ru: "Онлайн: распределяйте подкрепления — сперва онлайн-игрокам, затем оффлайн-городам."
      },
      {
        zh: "在線：觀察鄰居並回報任何異常。",
        en: "Online: watch your neighbors and report anything suspicious.",
        ko: "온라인: 주변 도시를 살피고 이상 사항을 보고.",
        ar: "أونلاين: راقب الجيران وبلّغ عن أي أمر مريب.",
        ru: "Онлайн: следите за соседями и докладывайте о нарушениях."
      },

      // === 離線前 / If you will be offline ===
      {
        zh: "離線前：事先增援他人。",
        en: "Offline: reinforce others in advance.",
        ko: "오프라인 전: 미리 타인을 증원.",
        ar: "أوفلاين: عزّز الآخرين مسبقاً.",
        ru: "Оффлайн: заранее усиливайте союзников."
      },
      {
        zh: "離線前：在聊天或通知 R4 你將離線且已清空本城；團隊會替你安排增援。",
        en: "Offline: notify chat or R4 that you’ll be offline and emptied your city — the team will reinforce you.",
        ko: "오프라인 전: 채팅 또는 R4에 오프라인/도시 비움 공지 — 팀이 증원 배치.",
        ar: "أوفلاين: أخطر الدردشة أو R4 بأنك ستكون غير متصل وأفرغت مدينتك — سيعزّزك الفريق.",
        ru: "Оффлайн: сообщите в чат или R4, что будете оффлайн и вывели войска из города — команда даст подкрепления."
      },

      // === 通用建議 / For all ===
      {
        zh: "通用：優先增援那些也把自己城市清空的人（效果最佳）。",
        en: "All: it’s best to reinforce those who ALSO remove their own troops from their city.",
        ko: "공통: 자기 도시 병력을 비운 사람에게 우선 증원하는 것이 가장 효율적.",
        ar: "للجميع: الأفضل تعزيز مَن يفرّغ قواته من مدينته أيضاً.",
        ru: "Для всех: лучше всего усиливать тех, кто тоже вывел войска из своего города."
      }
    ]
  },
  {
    id: "snowbusters-tips-v1",
    badge: "event",
    pinned: true,
    pinOrder: 7, // 依你的排序可調整
    title: {
      zh: "除雪活動｜技巧速查（Snowbusters）",
      en: "Snowbusters | Quick Tips",
      ko: "스노우버스터즈 | 팁 요약",
      ar: "سنوبسترز | نصائح سريعة",
      ru: "Snowbusters | Короткие советы"
    },
    items: [
      {
        zh: "先升級【耐力節省】裝備：外套與手套優先，能明顯降低體力消耗。",
        en: "Improve stamina savers first: upgrade the coat and gloves to cut stamina use.",
        ko: "체력 절약 장비 먼저: 코트·장갑을 우선 업그레이드해 체력 소모를 줄이세요.",
        ar: "طوّر أدوات توفير التحمل أولاً: المعطف والقفازات لتقليل استهلاك الطاقة.",
        ru: "Сначала прокачайте экономию выносливости: куртку и перчатки, чтобы меньше тратить стамину."
      },
      {
        zh: "【熔爐周邊別清光】只開一條能走出去的細路；當你升級熔爐時，周圍積雪會自動清除。",
        en: "Don’t clear all the snow around the furnace—just make a small path out; upgrading the furnace will auto-clear nearby snow.",
        ko: "용광로 주변 눈을 전부 치우지 마세요. 나갈 좁은 길만 내면 됩니다. 용광로를 업하면 주변 눈이 자동 제거됩니다.",
        ar: "لا تُزل كل الثلج حول الفرن—افتح مسارًا صغيرًا فقط؛ ترقية الفرن تزيل الثلج تلقائيًا حوله.",
        ru: "Не очищайте весь снег вокруг печи — проложите узкую тропу. При улучшении печи ближайший снег очистится автоматически."
      },
      {
        zh: "【儘快升級熔爐】越早升級越省體力，推進更穩定。",
        en: "Upgrade the furnace as soon as you can—it saves stamina and stabilizes progress.",
        ko: "용광로는 가능한 빨리 업그레이드하세요. 체력을 아끼고 진행이 안정됩니다.",
        ar: "طوّر الفرن بأسرع ما يمكن—يوفّر التحمل ويجعل التقدّم أكثر استقرارًا.",
        ru: "Улучшайте печь как можно раньше — это экономит выносливость и ускоряет прогресс."
      },
      {
        zh: "【雪獸打法】當雪獸準備揮擊時，貼側身位並持續輸出，它會很快倒下。",
        en: "Snowbeast: when it’s about to strike, move to its side and keep firing—he’ll go down quickly.",
        ko: "설수 처리: 공격 모션이 나오면 측면으로 붙어 지속 공격하세요. 빠르게 쓰러집니다.",
        ar: "وحش الثلج: عند استعداده للضرب تحرّك إلى جانبه واستمر بإطلاق النار—سيسقط سريعًا.",
        ru: "Снежный зверь: когда готовится ударить, зайдите сбоку и без перерыва бейте — быстро упадёт."
      }
    ]
  },
  {
    id: "frostfire-event-guide-v1",
    badge: "event",
    pinned: true,
    pinOrder: 8, // 依你的排序可調整
    title: {
      zh: "霜火活動（Frostfire）",
      en: "Frostfire",
      ko: "프로스트파이어",
      ar: "فروستفاير",
      ru: "Frostfire"
    },
    items: [
      // — 核心目標 / Core —
      {
        zh: "盡可能多擊殺巡邏隊（Patrols）以取得經驗值，升級技能樹。",
        en: "Kill as many Patrols as possible to gain XP and upgrade your skills tree.",
        ko: "순찰대를 가능한 많이 처치해 XP를 얻고 스킬 트리를 업그레이드하세요.",
        ar: "اقضِ على أكبر عدد ممكن من الدوريات لتحصل على نقاط خبرة وترقية شجرة المهارات.",
        ru: "Убивайте как можно больше патрулей, чтобы получать опыт и прокачивать древо навыков."
      },

      // — 技能樹路線 / Skill tree path —
      {
        zh: "技能樹選擇：依玩法而定 → 右 → 左 → 左 → 右。",
        en: "Skills tree pick: depends on playstyle → right → left → left → right.",
        ko: "스킬 트리 선택: 플레이스타일에 따라 → 오른쪽 → 왼쪽 → 왼쪽 → 오른쪽.",
        ar: "مسار شجرة المهارات: حسب أسلوبك → يمين → يسار → يسار → يمين.",
        ru: "Маршрут древа навыков: по стилю игры → право → лево → лево → право."
      },

      // — 5000/分技巧 / 5000 per minute trick —
      {
        zh: "解鎖「每分鐘 +5000 資源」後，瞬移到礦脈旁並佔領；為拿額外 +5000，務必每 1 分鐘離開並重新佔領該礦脈。",
        en: "After unlocking the +5000 resources per minute node, teleport next to a Vein and occupy it; leave and re-occupy it every minute to get the extra +5000.",
        ko: "분당 +5000 자원 노드를 해금하면 광맥 옆으로 텔레포트해 점령하고, 추가 +5000을 위해 1분마다 나갔다가 다시 점령하세요.",
        ar: "بعد فتح مهارة ‎+5000‎ مورد/دقيقة، انتقل بجوار عِرق واحتلّه؛ اخرج ثم أعد احتلاله كل دقيقة لتحصل على ‎+5000‎ إضافية.",
        ru: "Открыв навык «+5000 ресурсов в минуту», телепортируйтесь к жиле и захватите её; каждые минуту выходите и захватывайте снова, чтобы получать доп. +5000."
      },

      // — 走位與安全 / Positioning & safety —
      {
        zh: "不確定時請避開人群、找安靜區域行動，避免不必要的衝突。",
        en: "If unsure, avoid people by finding a quiet area to operate in.",
        ko: "확신이 없으면 한적한 지역으로 이동해 다른 유저를 피하세요.",
        ar: "إن لم تكن متأكداً، ابتعد عن الآخرين وابحث عن مكان هادئ.",
        ru: "Если не уверены, держитесь подальше от других и ищите тихие зоны."
      },

      // — 分數目標 / Points target —
      {
        zh: "分數目標：150,000 分即可領完主要獎勵。",
        en: "Points target: 150k points is enough to claim the rewards.",
        ko: "점수 목표: 150,000점이면 보상을 받기에 충분합니다.",
        ar: "هدف النقاط: ‏150,000 نقطة تكفي للحصول على المكافآت.",
        ru: "Цель по очкам: 150 000 достаточно для получения наград."
      }
    ]
  },
  {
    id: "mercenary-boss-rules-v1",
    badge: "event",
    pinned: true,
    pinOrder: 9, // 依你的排序可調整
    title: {
      zh: "傭兵首領戰規則",
      en: "Mercenary Boss Battles | Rules",
      ko: "용병 보스전 규칙",
      ar: "معارك زعيم المرتزقة | القواعد",
      ru: "Бои с наёмным боссом | Правила"
    },
    items: [
      // 概述 / Overview
      {
        zh: "這個活動重在『參與』：只要對傭兵首領攻擊一次，就能領到獎勵；請確實遵守下列流程。",
        en: "This event is about participation: as long as you attack the Mercenary Boss once, you’ll get the rewards. Please follow the rules below.",
        ko: "이 이벤트는 ‘참여’가 핵심입니다. 보스를 1회만 공격해도 보상을 받을 수 있으니 아래 규칙을 지켜주세요.",
        ar: "هذا الحدث قائم على المشاركة: يكفي أن تهاجم زعيم المرتزقة مرة واحدة لتحصل على المكافآت. الرجاء اتباع القواعد أدناه.",
        ru: "Событие про участие: достаточно один раз ударить наёмного босса — и вы получите награды. Соблюдайте правила ниже."
      },

      // 規則 / Rules
      {
        zh: "1) 先派『無英雄、10 名士兵』的一支行軍。",
        en: "1) Send one march with no heroes and only 10 troops.",
        ko: "1) 영웅 없이 병력 10명짜리 부대를 한 개 보냅니다.",
        ar: "1) أرسل مسيرة واحدة بلا أبطال وبعدد 10 جنود فقط.",
        ru: "1) Отправьте один отряд без героев и всего с 10 солдатами."
      },
      {
        zh: "2) 等待，讓所有【在線成員】各自攻擊一次。",
        en: "2) Wait and allow everyone online to attack once.",
        ko: "2) 잠시 대기하며 온라인 인원 모두가 1회씩 공격하도록 합니다.",
        ar: "2) انتظر ودع جميع المتصلين يهاجمون مرة واحدة.",
        ru: "2) Подождите и позвольте всем онлайн-игрокам ударить по разу."
      },
      {
        zh: "3) 當所有在線者都已攻擊一次，R4/R5 會下達通知；收到指示後，才開始全力進攻直到擊敗。",
        en: "3) After everyone online has attacked once, an R4/R5 will announce it; only then attack freely until the boss is defeated.",
        ko: "3) 온라인 전원이 1회 공격을 마치면 R4/R5가 공지합니다. 그때부터 전력으로 처치하세요.",
        ar: "3) بعد أن يهاجم الجميع مرة واحدة سيعلن R4/R5 ذلك؛ عندها فقط هاجموا بحرية حتى الهزيمة.",
        ru: "3) Когда все онлайн ударили по разу, R4/R5 сообщит об этом; только после этого атакуйте до победы."
      },
      {
        zh: "4) 未接到指令不得攻擊（請勿搶傷害、勿提前秒殺）。",
        en: "4) Do NOT attack without instruction (no sniping damage or early kills).",
        ko: "4) 지시 없이 공격 금지(딜 스내핑/선제 처치 금지).",
        ar: "4) لا تهاجم دون تعليمات (لا تخطف الضرر ولا القتل المبكر).",
        ru: "4) Не атакуйте без команды (не пытайтесь «украсть» урон и не убивайте раньше времени)."
      },
      {
        zh: "此活動包含「個人挑戰」與「聯盟挑戰」兩部分。",
        en: "The event consists of Individual Challenges and Alliance Challenges.",
        ko: "이 이벤트는 개인 도전과 연맹 도전으로 구성됩니다.",
        ar: "يتكوّن الحدث من تحديات فردية وتحديات للتحالف.",
        ru: "Событие состоит из индивидуальных и союзных испытаний."
      },
      {
        zh: "個人挑戰：領袖選定難度（簡單／普通／困難／噩夢／瘋狂），該回合內不可更改。",
        en: "In Individual Challenges, leaders pick a difficulty (Easy / Normal / Hard / Nightmare / Insane). Once picked, it cannot be changed during that round.",
        ko: "개인 도전: 리더가 난이도(이지/노멀/하드/나이트메어/인세인)를 선택하며, 해당 라운드 동안 변경할 수 없습니다.",
        ar: "في التحديات الفردية يختار القادة الصعوبة (سهل/عادي/صعب/كابوسي/مجنون). بمجرد الاختيار لا يمكن تغييره خلال تلك الجولة.",
        ru: "В индивидуальных испытаниях лидеры выбирают сложность (Лёгкая/Нормальная/Сложная/Кошмар/Безумие); в рамках раунда изменить нельзя."
      },
      {
        zh: "偵查與出手：可消耗體力偵查敵軍，之後可在計時結束前選擇單挑或呼叫聯盟支援。",
        en: "You can scout enemies using stamina. After that, you may attack solo or call alliance assistance before the timer ends.",
        ko: "정찰·공격: 체력을 소모해 정찰 후, 타이머가 끝나기 전에 단독 공격하거나 연맹 지원을 요청할 수 있습니다.",
        ar: "الاستطلاع والهجوم: يمكنك الاستطلاع باستخدام التحمل، ثم الهجوم منفردًا أو طلب مساعدة التحالف قبل انتهاء المؤقت.",
        ru: "Разведка и атака: тратьте выносливость на разведку, затем до окончания таймера атакуйте в одиночку или вызывайте помощь альянса."
      },
      {
        zh: "進度解鎖：完成個人階段將解鎖「精英首領」戰，供整個聯盟共同挑戰。",
        en: "Progression: completing individual stages unlocks Elite Boss battles for your alliance to engage together.",
        ko: "진행 해금: 개인 단계를 완료하면 연맹이 함께 도전하는 엘리트 보스 전투가 해금됩니다.",
        ar: "التقدّم: إكمال المراحل الفردية يفتح معارك الزعيم النخبوي ليشارك فيها التحالف معًا.",
        ru: "Прогресс: завершение индивидуальных этапов открывает сражения с элитным боссом для совместного участия альянса."
      }
    ]
  }


  /* 🔰 範例模板（複製改一筆就能上新卡）
  ,{
    id: "fortress-attack-flow-v2",
    badge: "event", // "tip" | "rule" | "event" | "important"
    title: { zh: "堡壘戰（攻擊流程）", en: "Fortress Battle (Attack Flow)" },
    items: [
      { zh: "T-10：開增益、調整隊形。", en: "T-10: Buffs on, set formations." },
      { zh: "T-0：第一波集結（滿 2 分鐘開）。", en: "T-0: Rally #1 (launch at 2m full)." },
      { zh: "T+10：第二波接力集結。", en: "T+10: Relay Rally #2." }
    ],
    pinned: true, pinOrder: 5,
    // startAt: "2025-11-10T12:00:00Z",
    // until  : "2025-11-12T12:00:00Z"
  }
  */
];
let PUBLISH_GUIDES = [
  "hero-name-aliases-v1",
  "beartrap-hero-picks-v1",
  "troop-ratio-v1",
  "geocore-expedition-guide-v2",
  "foundry-battle-briefing-v1",
  "crazy-joey-event-sop-v1",
  "snowbusters-tips-v1",
  "frostfire-event-guide-v1",
  "mercenary-boss-rules-v1"
];
function buildPublishedGuides(){
  const now = Date.now();
  return GUIDE_CATALOG
    .filter(g => PUBLISH_GUIDES.includes(g.id))
    .filter(g => {
      if (g.active === false) return false;
      if (g.startAt){ const t0 = Date.parse(g.startAt); if (!isNaN(t0) && now < t0) return false; }
      if (g.until){   const t1 = Date.parse(g.until);   if (!isNaN(t1) && now > t1) return false; }
      return true;
    })
    .sort((a,b)=>{
      const ap=a?.pinned?1:0, bp=b?.pinned?1:0; if (bp!==ap) return bp-ap;
      const ao=Number.isFinite(a?.pinOrder)?a.pinOrder:Number.POSITIVE_INFINITY;
      const bo=Number.isFinite(b?.pinOrder)?b.pinOrder:Number.POSITIVE_INFINITY;
      return ao - bo;
    });
}
function publishGuide(id){ if(!PUBLISH_GUIDES.includes(id)) PUBLISH_GUIDES.push(id); store.data.guides = buildPublishedGuides(); bus.emit("data:updated", store.data); }
function unpublishGuide(id){ PUBLISH_GUIDES = PUBLISH_GUIDES.filter(x=>x!==id); store.data.guides = buildPublishedGuides(); bus.emit("data:updated", store.data); }

/* ========== 模組渲染（Live / Guides / Schedule） ========== */
const modules = {
  list: [],
  register(m){ this.list.push(m); },
  renderAll(){ this.list.forEach(m=>{ try{ m.render(); }catch(e){ console.error(m.id, e); } }); }
};

// Live
modules.register({
  id:"live",
  el: $("#liveList"),
  statusEl: $("#liveStatus"),
  card(v){
    const badge = badgeLabel(v.type);
    const title = escapeHTML(i18n.getText(v.title));
    const body  = escapeHTML(i18n.getText(v.body));
    const time  = fmtTime(v.ts || v.startAt || "");
    return `
      <article class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="flex items-center gap-2 mb-1">
            <span class="badge badge-primary">${badge}</span>
            <time class="text-xs opacity-70">${escapeHTML(time)}</time>
          </div>
          <h3 class="card-title">${title}</h3>
          <p class="opacity-80 whitespace-pre-wrap">${body}</p>
        </div>
      </article>`;
  },
  render(){ 
    const list = store.data.live || [];
    this.el.innerHTML = list.map(this.card.bind(this)).join("");
  },
  setStatus(state){
    const el = this.statusEl; if (!el) return;
    if (state==="ok"){ el.textContent = i18n.t("live.status.ok"); el.className = "badge badge-success"; }
    else if (state==="fail"){ el.textContent = i18n.t("live.status.fail"); el.className = "badge badge-warning"; }
    else { el.textContent = i18n.t("live.status.loading"); el.className = "badge badge-outline"; }
  }
});

// Guides
modules.register({
  id:"guides",
  el: $("#guideList"),
  card(g){
    const badge = badgeLabel(g.badge);
    const title = escapeHTML(i18n.getText(g.title));
    const items = (g.items||[]).map(s=>`<li class="list-disc ms-5">${escapeHTML(i18n.getText(s))}</li>`).join("");
    return `
      <article class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="flex items-center gap-2 mb-1">
            <span class="badge badge-secondary">${badge}</span>
          </div>
          <h3 class="card-title">${title}</h3>
          <ul class="mt-1">${items}</ul>
        </div>
      </article>`;
  },
  render(){ this.el.innerHTML = (store.data.guides||[]).map(this.card.bind(this)).join(""); }
});

// Schedule（水平時間線）
/* ===== SCHEDULE MODULE (drop-in, minimal overwrite) ===== */
const SCHED = (() => {
  const $ = (s, r=document) => r.querySelector(s);
  const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
  const pad = n => String(n).padStart(2,"0");

    // ---- Timezone helpers ----
  function tzName(){
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'; }
    catch { return 'Local'; }
  }
  function tzOffsetStr(d=new Date()){
    // JS: getTimezoneOffset() = minutes behind UTC; 這裡反轉成顯示用符號
    const m = -d.getTimezoneOffset();
    const sign = m >= 0 ? '+' : '-';
    const abs = Math.abs(m);
    const hh = String(Math.floor(abs/60)).padStart(2,'0');
    const mm = String(abs%60).padStart(2,'0');
    return `${sign}${hh}:${mm}`;
  }
  function localTZLabel(){
    return `${tzName()} (UTC${tzOffsetStr()})`;
  }

  const st = {
    tz: localStorage.getItem('timeMode') || "utc",                        // "utc" | "local"
    all: [],                           // 全部活動（normalize 後）
    view: [],                          // 篩選後
    types: new Set(),
    url: "./data/schedule.json"
  };

  const isUTC = () => st.tz === "utc";
  const toMs  = d => new Date(d).getTime();
  const fmtDateUTC  = d => d.toLocaleDateString(undefined,{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"UTC"});
  const fmtTimeUTC = d =>d.toLocaleTimeString(undefined,{ hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
  const fmtDateLoc  = d => d.toLocaleDateString(undefined,{year:"numeric",month:"2-digit",day:"2-digit"});
  const fmtTimeLoc  = d => d.toLocaleTimeString(undefined,{hour12:false,hour:"2-digit",minute:"2-digit"});
  const fmtDateBy   = d => isUTC()? fmtDateUTC(d) : fmtDateLoc(d);
  const fmtTimeBy   = d => isUTC()? fmtTimeUTC(d) : fmtTimeLoc(d);

  function i18nText(v){
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "object") {
      const lang = (document.documentElement.lang || "zh").toLowerCase();
      const pick = (o)=> o ?? "";
      if (lang.startsWith("zh")) return pick(v.zh) || pick(v.en) || Object.values(v)[0] || "";
      if (lang.startsWith("en")) return pick(v.en) || pick(v.zh) || Object.values(v)[0] || "";
      if (lang.startsWith("ko")) return pick(v.ko) || pick(v.en) || pick(v.zh) || Object.values(v)[0] || "";
      if (lang.startsWith("ru")) return pick(v.ru) || pick(v.en) || pick(v.zh) || Object.values(v)[0] || "";
      if (lang.startsWith("ar")) return pick(v.ar) || pick(v.en) || pick(v.zh) || Object.values(v)[0] || "";
      return pick(v.en) || pick(v.zh) || Object.values(v)[0] || "";
    }
    return String(v);
  }

  function fmtRange(sISO, eISO){
    const s = new Date(sISO), e = new Date(eISO);
    const same = isUTC()
      ? (s.getUTCFullYear()===e.getUTCFullYear() && s.getUTCMonth()===e.getUTCMonth() && s.getUTCDate()===e.getUTCDate())
      : (s.getFullYear()===e.getFullYear() && s.getMonth()===e.getMonth() && s.getDate()===e.getDate());
    const sDate = fmtDateBy(s), sTime = fmtTimeBy(s).replace(" UTC","");
    const eDate = fmtDateBy(e), eTime = fmtTimeBy(e);
    return same ? `${sDate} ${sTime} – ${eTime}` : `${sDate} ${sTime} ~ ${eDate} ${eTime}`;
  }

  function fmtRangeDual(sISO, eISO){
  // 主要字串：用目前模式（UTC 或 Local）
  const main = fmtRange(sISO, eISO);

  // 對照字串：另一個模式
  const flip = st.tz === 'utc' ? 'local' : 'utc';
  const isFlipUTC = flip === 'utc';

  const s = new Date(sISO), e = new Date(eISO);
  const fmtDateFlip = isFlipUTC
    ? (d)=> d.toLocaleDateString(undefined,{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"UTC"})
    : (d)=> d.toLocaleDateString(undefined,{year:"numeric",month:"2-digit",day:"2-digit"});
  const fmtTimeFlip = isFlipUTC
    ? (d)=> d.toLocaleTimeString(undefined,{hour12:false,hour:"2-digit",minute:"2-digit",timeZone:"UTC"}) + " UTC"
    : (d)=> d.toLocaleTimeString(undefined,{hour12:false,hour:"2-digit",minute:"2-digit"}) + ` ${localTZLabel()}`;

  const same = isFlipUTC
    ? (s.getUTCFullYear()===e.getUTCFullYear() && s.getUTCMonth()===e.getUTCMonth() && s.getUTCDate()===e.getUTCDate())
    : (s.getFullYear()===e.getFullYear() && s.getMonth()===e.getMonth() && s.getDate()===e.getDate());

  const sDate = fmtDateFlip(s), sTime = fmtTimeFlip(s);
  const eDate = fmtDateFlip(e), eTime = fmtTimeFlip(e);

  const other = same ? `${sDate} ${sTime} – ${eTime}`
                     : `${sDate} ${sTime} ~ ${eDate} ${eTime}`;

  return { main, other };
  }

  // ---- 載入與正規化 schedule.json ----
  async function load(url = st.url){
  const res = await fetch(url, { cache:"no-store" });
  if (!res.ok) throw new Error("schedule.json 載入失敗");
  const json = await res.json();

  // 相容多種鍵名/巢狀
  const listRaw =
    (Array.isArray(json) ? json :
    (Array.isArray(json.schedule) ? json.schedule :
    (Array.isArray(json.events)   ? json.events   :
    (Array.isArray(json.items)    ? json.items    :
    (Array.isArray(json.data?.schedule) ? json.data.schedule :
    [])))));

  const list = listRaw;

  st.all = list.map((e,i)=>{
    const win   = e.window || {};
    const start = e.start || win.start || e.startAt || e.begin;  // 多鍵相容
    const end   = e.end   || win.end   || e.endAt   || e.finish; // 多鍵相容
    return {
      id:    e.id || `ev-${i+1}`,
      type:  e.type || "event",
      title: e.title,                                  // 保留原始多語物件或字串
      desc:  (e.note || e.desc || e.description || ""),// 同上：保留原始
      start, end, _start: toMs(start), _end: toMs(end)
    };
  }).filter(x => Number.isFinite(x._start) && Number.isFinite(x._end));

  st.types = new Set(st.all.map(x=>x.type||"event"));
  applyFilter();
}


  // ---- 篩選 & 綁定 ----
  function applyFilter(){
    const sel = document.querySelector("#gantt-type-filter");
    const want = sel ? (sel.value || "all") : "all";
    st.view = st.all.filter(e => want==="all" ? true : e.type === want);
  }
  function renderTypeFilter(){
    const sel = document.querySelector("#gantt-type-filter");
    if (!sel) return;
    const cur = sel.value || "all";
    const labelAll = i18n.getText(UI_LABELS.filter_all); // 你已有多語字典【7:app.js†turn2file7†L60-L63】
    sel.innerHTML = `<option value="all">${esc(labelAll)}</option>` +
      [...st.types].sort().map(t=>{
        const nice = DOG?.terms?.text?.(t) || t;          // 利用你的術語轉換
      return `<option value="${t}">${esc(nice)}</option>`;
    }).join("");
    sel.value = cur;
    sel.onchange = () => { applyFilter(); renderTimeline(); renderGantt(); };
  }
  function bindTimeMode(){
    const tz = document.querySelector("#time-mode");
    if (!tz) return;

    // 動態更新 option 顯示文字
    const optUTC   = tz.querySelector('option[value="utc"]');
    const optLocal = tz.querySelector('option[value="local"]');
    if (optUTC)   optUTC.textContent   = "UTC (UTC+00:00)";
    if (optLocal) optLocal.textContent = `Local: ${localTZLabel()}`;

    tz.value = st.tz;
    tz.onchange = ()=>{
      st.tz = tz.value;
      localStorage.setItem('timeMode', st.tz);
      renderTypeFilter();   // 讓「全部/類型」選單保留現值
      renderTimeline();
      renderGantt();
    };
  }


  // ---- 垂直時間軸 ----
  function renderTimeline(){
    const ol = document.querySelector("#scheduleList");
    if (!ol) return;

    const items = st.view
      .slice()
      .sort((a,b)=>a._start-b._start)
      .map(e => {
        const dual = fmtRangeDual(e.start, e.end); // ← 新增：雙時區字串
        return `
          <li>
            <hr/>
            <div class="timeline-start">${esc(e.type || "event")}</div>
            <div class="timeline-middle"><div class="badge badge-primary"></div></div>
            <div class="timeline-end">
              <div class="card shadow-sm bg-base-100">
                <div class="card-body p-4">
                  <h3 class="card-title text-base font-bold">${esc(i18nText(e.title))}</h3>
                  ${e.desc ? `<p class="text-sm opacity-80">${esc(i18nText(e.desc))}</p>` : ""}
                  <p class="text-xs mt-2 font-mono">${esc(dual.main)}</p>
                  <p class="text-[11px] opacity-70 font-mono">${esc(dual.other)}</p>
                </div>
              </div>
            </div>
            <hr/>
          </li>
        `;
      })
      .join("");

    ol.innerHTML = items || `<li class="opacity-60">（目前沒有符合條件的活動）</li>`;
  }


    // ---- 甘特圖（header/sidebar/rows）----
    function renderGantt(){
      const header  = document.querySelector(".gantt-header");
      const sidebar = document.querySelector(".gantt-sidebar");
      const rows    = document.querySelector(".gantt-rows");
      if (!header || !sidebar || !rows) return;

      const data = st.view.slice().sort((a,b)=>a._start-b._start);
      if (!data.length){
        header.innerHTML = "";
        sidebar.innerHTML = "";
        rows.innerHTML = "";
        return;
      }

      // ====== 固定常數 ======
      const ONE_DAY = 24*60*60*1000;
      const ROW_H   = 40;
      const COL_W   = 64;
      const SIDE_W  = 240;
      const GUTTER  = 12;
      const colWidth = COL_W; // ← 之前漏了這個

      // ====== 動態範圍 ======
      const minStart = Math.min(...data.map(d=>d._start));
      const maxEnd   = Math.max(...data.map(d=>d._end));

      // 產生日欄位（依 UTC 或 Local 決定換日切點）
      const cols = [];
      if (isUTC()){
        const S = new Date(minStart), E = new Date(maxEnd);
        const s0 = Date.UTC(S.getUTCFullYear(), S.getUTCMonth(), S.getUTCDate());
        const e0 = Date.UTC(E.getUTCFullYear(), E.getUTCMonth(), E.getUTCDate()) + ONE_DAY;
        for (let t=s0; t<=e0; t+=ONE_DAY) cols.push(new Date(t));
      } else {
        const S = new Date(minStart), E = new Date(maxEnd);
        const s0 = new Date(S.getFullYear(), S.getMonth(), S.getDate()).getTime();
        const e0 = new Date(E.getFullYear(), E.getMonth(), E.getDate()+1).getTime();
        for (let t=s0; t<=e0; t+=ONE_DAY) cols.push(new Date(t));
      }

      // ====== Header（上方日期列）======
      const tzLabel = isUTC()
        ? "UTC"
        : (Intl.DateTimeFormat().resolvedOptions().timeZone || "Local");

      header.innerHTML = `
        <div style="
          display:grid;
          grid-template-columns: ${SIDE_W}px repeat(${cols.length}, ${COL_W}px);
          min-width:${SIDE_W + cols.length * COL_W + 2*GUTTER}px;
          padding:0 ${GUTTER}px;
        ">
          <div class="px-3 py-2 text-xs opacity-70 leading-5">
            Event / Date (${tzLabel})
          </div>
          ${cols.map(d=>{
            const main = isUTC()
              ? d.toISOString().slice(0,10)               // YYYY-MM-DD (UTC)
              : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
            const other = isUTC()
              ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
              : d.toISOString().slice(0,10) + " UTC";
            return `
              <div class="border-l px-2 py-1 text-center">
                <div class="text-xs font-medium leading-5">${main}</div>
                <div class="text-[11px] opacity-60 leading-4">${other}</div>
              </div>
            `;
          }).join("")}
        </div>
      `;

      // 水平同步捲動
      header.style.overflowX = "auto";
      rows.style.overflowX   = "auto";
      header.addEventListener("scroll", ()=>{ rows.scrollLeft = header.scrollLeft; });
      rows.addEventListener("scroll",   ()=>{ header.scrollLeft = rows.scrollLeft; });

      // 垂直同步（側欄／畫布）
      sidebar.style.overflowY = "auto";
      rows.style.overflowY    = "auto";
      let _vlock = false;
      const syncV = (from, to) => {
        if (_vlock) return;
        _vlock = true;
        to.scrollTop = from.scrollTop;
        _vlock = false;
      };
      sidebar.addEventListener("scroll", ()=> syncV(sidebar, rows));
      rows.addEventListener("scroll",   ()=> syncV(rows, sidebar));

      // ====== 左側側欄（事件名稱）======
      sidebar.innerHTML = data.map(r=>`
        <div class="item" data-id="${esc(r.id)}" 
            style="height:${ROW_H}px; display:flex; align-items:center; gap:.5rem; padding:0 .75rem; border-bottom:1px dashed rgba(0,0,0,.08)">
          <div class="text-sm truncate">${esc(i18nText(r.title) || 'Event')}</div>
        </div>
      `).join("");

      // 取得側欄各列的實際位置（以側欄為座標系）
      const posMap = {};
      sidebar.querySelectorAll('.item[data-id]').forEach(el=>{
        const id = el.getAttribute('data-id');
        posMap[id] = { top: el.offsetTop, h: el.offsetHeight };
      });

      // 你原本就有的 bar 高度（可沿用）
      const BAR_H = ROW_H - 16;

      // ====== 右側畫布（甘特條）======
      const origin = isUTC()
        ? Date.parse(new Date(Date.UTC(new Date(minStart).getUTCFullYear(), new Date(minStart).getUTCMonth(), new Date(minStart).getUTCDate())))
        : new Date(new Date(minStart).getFullYear(), new Date(minStart).getMonth(), new Date(minStart).getDate()).getTime();

      const endOrigin = isUTC()
        ? Date.parse(new Date(Date.UTC(new Date(maxEnd).getUTCFullYear(), new Date(maxEnd).getUTCMonth(), new Date(maxEnd).getUTCDate()))) + ONE_DAY
        : new Date(new Date(maxEnd).getFullYear(), new Date(maxEnd).getMonth(), new Date(maxEnd).getDate()+1).getTime();

      const totalMs = Math.max(ONE_DAY, endOrigin - origin);
      const pxPerMs = COL_W / ONE_DAY;

      rows.innerHTML = "";                         // ← 只清一次
      rows.style.position = "relative";
      rows.style.minWidth = `${cols.length * COL_W + 2*GUTTER}px`; // ← 用 COL_W
      rows.style.height   = `${data.length * ROW_H}px`;
      rows.style.padding  = `0 ${GUTTER}px`;
      rows.style.overflowX = "auto";

      // 垂直日網格線
      cols.forEach((_, i) => {
        const x = i * COL_W + GUTTER;
        const line = document.createElement("div");
        line.style.position = "absolute";
        line.style.top = "0";
        line.style.bottom = "0";
        line.style.left = `${x}px`;
        line.style.width = "0";
        line.style.borderLeft = "1px solid rgba(0,0,0,.08)";
        rows.appendChild(line);
      });

      // 甘特條
      // ====== 右側畫布（甘特條）======
      // ...（略過上面已存在的變數與計算）
      data.forEach((r, idx) => {
        // 以側欄同列中線為準確定位
        const p = posMap[r.id];
        const y = p ? (p.top + (p.h - BAR_H)/2) : (idx * ROW_H + 8);

        const x = Math.max(GUTTER, (r._start - origin) * pxPerMs + GUTTER);
        const w = Math.max(4, (r._end - r._start) * pxPerMs);

        const dual = fmtRangeDual(r.start, r.end);

        const bar = document.createElement("div");
        const titleStr = i18nText(r.title);
        bar.className = "gantt-bar";
        bar.style.position = "absolute";
        bar.style.left = `${x}px`;
        bar.style.top  = `${y}px`;             // ← 用側欄行定位
        bar.style.width  = `${w}px`;
        bar.style.height = `${BAR_H}px`;
        bar.style.borderRadius = "8px";
        bar.style.display = "flex";
        bar.style.alignItems = "center";
        bar.style.padding = "0 10px";
        bar.style.background = "var(--fallback-bc, #3b82f6)";
        bar.style.color = "#fff";
        bar.style.fontSize = "12px";
        bar.style.whiteSpace = "nowrap";
        bar.style.overflow = "hidden";
        bar.style.textOverflow = "ellipsis";
        bar.title = `${titleStr}\n${dual.main}\n${dual.other}`;

        bar.innerHTML = `<div class="bar-title" style="pointer-events:none;">${esc(titleStr)}</div>`;
        rows.appendChild(bar);
      });
    }

    // ====== 版面佈局（sidebar / rows）======
    const body = document.querySelector(".gantt-body");
    if (body){
      body.style.display = "grid";
      body.style.gridTemplateColumns = `240px 1fr`;
      body.querySelector(".gantt-sidebar").style.width = "240px";
      body.querySelector(".gantt-rows").style.overflowX = "auto";
    }

    // ====== 現在時間線（以與甘特條相同的座標系換算）======
    // x = GUTTER + (現在時刻 - 起始午夜) * (像素/毫秒)
    const now = Date.now();
    if (now >= origin && now <= endOrigin){
      const x = GUTTER + (now - origin) * pxPerMs;
      const line = document.createElement("div");
      line.className = "gantt-today-line";
      line.style.position = "absolute";
      line.style.top = "0";
      line.style.bottom = "0";
      line.style.left = `${x}px`;
      line.style.width = "2px";
      line.style.background = "#ef4444";
      line.style.opacity = ".7";
      rows.appendChild(line);
    }
      async function init(){
    bindTimeMode();
    await load();            // 1) 先把資料吃進來
    renderTypeFilter();      // 2) 依資料產生類型選單
    renderTimeline();        // 3) 垂直時間軸
    renderGantt();           // 4) 甘特圖

    // 自動刷新（如果你已有全站輪詢，這行可以拿掉以避免重覆）
    setInterval(async()=>{
      try{ await load(); renderTimeline(); renderGantt(); }
      catch(e){ console.error(e); }
    }, 20000);
    bus.on("lang:changed", () => { renderTimeline(); renderGantt(); });
  }
    return { init, load, renderTimeline, renderGantt };
  })();
    document.addEventListener("DOMContentLoaded", ()=> SCHED.init());
    /* ===== END SCHEDULE MODULE ===== */

/* ========== 即時資訊輪詢（live.json） ========== */
async function refreshLive(){
  modules.list.find(m=>m.id==="live")?.setStatus("loading");
  try{
    const json = await store.safeLoadJSON(CONFIG.liveURL);
    const incoming = Array.isArray(json?.live) ? json.live : (Array.isArray(json) ? json : []);
    store.data.live = mergeLive(store.data.live, incoming);
    modules.list.find(m=>m.id==="live")?.setStatus("ok");
  }catch{
    modules.list.find(m=>m.id==="live")?.setStatus("fail");
  }
  modules.renderAll();
}

/* ========== 啟動 ========== */
function init(){
  // 語言按鈕（全域 data-lang）
  $$("[data-lang]").forEach(btn=>{
    btn.addEventListener("click", ()=> i18n.setLang(btn.dataset.lang));
  });
  // 同步渲染
  bus.on("lang:changed", ()=> modules.renderAll());
  bus.on("data:updated", ()=> modules.renderAll());

  // 初始化語言與方向
  i18n.setLang(i18n.current); // 會自動 normalize + applyDir + emit

  // 長期內容（本檔集中）
  store.data.guides = buildPublishedGuides();
  modules.renderAll();

  // Live：立即抓 + 輪詢
  refreshLive();
  setInterval(refreshLive, CONFIG.livePollMs);
  $("#btnManualRefresh")?.addEventListener("click", refreshLive);
}
document.addEventListener("DOMContentLoaded", init);


// -- DOG: Design Tokens / Type → class & label mapping (non-intrusive) --
window.DOG = window.DOG || {};
DOG.design = {
  typeClass(type){
    const k = String(type||'').toLowerCase();
    switch(k){
      case 'foundry':   return { dot:'t-foundry',   badge:'badge--foundry',  key:'foundry'   };
      case 'joey':      return { dot:'t-joey',      badge:'badge--joey',     key:'joey'      };
      case 'snow':      return { dot:'t-snow',      badge:'badge--snow',     key:'snow'      };
      case 'mining':    return { dot:'t-mining',    badge:'badge--mining',   key:'mining'    };
      case 'merc': 
      case 'merc_boss': return { dot:'t-merc_boss', badge:'badge--merc',     key:'merc_boss' };
      default:          return { dot:'',            badge:'badge',           key:'event'     };
    }
  }
};

// -- DOG: Terminology adapter (keep your original i18n; this layer only resolves labels) --
DOG.terms = {
  // 可擴充：把你原本的「術語庫」掛進來；這裡只先放 event type 的顯示字
  dict: {
    event:     { zh:'活動',       en:'Event',       ko:'이벤트',   ar:'فعالية',    ru:'Событие' },
    foundry:   { zh:'兵工廠',     en:'Foundry',     ko:'무기 공장', ar:'المصنع',     ru:'Литейная' },
    joey:      { zh:'瘋狂喬伊',   en:'Crazy Joey',  ko:'크레이지 조', ar:'جو المجنون', ru:'Безумный Джо' },
    snow:      { zh:'除雪活動',   en:'Snowbusters', ko:'스노버스터', ar:'مكافحة الثلج', ru:'Снегоубор' },
    mining:    { zh:'燃霜礦區',   en:'Emberfrost',  ko:'엠버프로스트', ar:'منجم إمبرفروست', ru:'Эмберфрост' },
    merc_boss: { zh:'傭兵榮耀',   en:'Merc Boss',   ko:'용병 보스', ar:'زعيم المرتزقة', ru:'Босс-наемник' }
  },
  // 取得多語字串：優先術語 → 你的 i18n → 原始字串
  text(keyOrObj){
    // already multilingual object?
    if (keyOrObj && typeof keyOrObj === 'object' && ('zh' in keyOrObj || 'en' in keyOrObj)) {
      return DOG.i18nText(keyOrObj);
    }
    // terminology key?
    const k = String(keyOrObj||'').toLowerCase();
    if (this.dict[k]) return DOG.i18nText(this.dict[k]);
    return String(keyOrObj||'');
  }
};

// 包一層對你既有 i18n 的安全呼叫（不改它）
DOG.i18nText = function(objOrString){
  try{
    if (typeof objOrString === 'string') return objOrString;
    const cur = (window.i18n?.current) || document.documentElement.lang || 'zh';
    const norm = (l)=> (l||'').toLowerCase().startsWith('zh')?'zh'
                     : (l||'').toLowerCase().startsWith('ko')?'ko'
                     : (l||'').toLowerCase().startsWith('ar')?'ar'
                     : (l||'').toLowerCase().startsWith('ru')?'ru' : 'en';
    const L = norm(cur);
    return objOrString[L] || objOrString.en || objOrString.zh || Object.values(objOrString)[0] || '';
  }catch{ return String(objOrString||''); }
};

