(function () {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const topbar = document.querySelector(".topbar");
  if (topbar && !reducedMotion) {
    const updateScrolled = () => topbar.classList.toggle("scrolled", window.scrollY > 20);
    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
  }

  if ("IntersectionObserver" in window && !reducedMotion) {
    const revealIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".reveal, .project-card, .qa-card, .cat-card, .sec-card, .media-card, .admin-row, .stats-card").forEach((el) => revealIO.observe(el));
    setTimeout(() => {
      document.querySelectorAll(".reveal, .project-card, .qa-card, .cat-card, .sec-card, .media-card, .admin-row, .stats-card").forEach((el) => {
        if (!el.classList.contains("visible") && el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add("visible");
        }
      });
    }, 400);
  } else {
    document.querySelectorAll(".reveal, .project-card, .qa-card, .cat-card, .sec-card, .media-card").forEach((el) => el.classList.add("visible"));
  }

  function toAnchorSafe(selector) {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  document.addEventListener("click", (e) => {
    const qa = e.target.closest(".qa-card");
    if (qa && qa.dataset.section && typeof window.section === "function") {
      window.section(qa.dataset.section);
      return;
    }
    const newCat = e.target.closest("[data-new-category]");
    if (newCat) {
      const form = document.querySelector("#categoryForm");
      if (form) {
        form.reset();
        if (form.elements.name) form.elements.name.value = "";
        if (form.elements.catId) form.elements.catId.value = "";
        const nameInput = form.querySelector('[name="name"]');
        if (nameInput) setTimeout(() => nameInput.focus(), 60);
        toAnchorSafe("#categoryFormWrap");
      }
      return;
    }
    const catReset = e.target.closest("#catReset");
    if (catReset) {
      const form = document.querySelector("#categoryForm");
      if (form) {
        form.reset();
        if (form.elements.catId) form.elements.catId.value = "";
      }
      return;
    }
  });

  const slider = document.querySelector("#heroSlider");
  if (slider) {
    const slides = [...slider.querySelectorAll(".hero-slide")];
    const dots = [...slider.querySelectorAll("[data-slide-to]")];
    const progress = slider.querySelector("#heroProgress");
    const counter = slider.querySelector("#heroCurrentSlide");
    const duration = 5000;
    let current = 0;
    let timer = null;

    function schedule() {
      clearInterval(timer);
      timer = setInterval(() => showSlide(current + 1), duration);
    }

    function showSlide(requested) {
      current = (requested + slides.length) % slides.length;
      slides.forEach((slide, index) => {
        const active = index === current;
        slide.classList.toggle("active", active);
        slide.setAttribute("aria-hidden", String(!active));
        slide.inert = !active;
      });
      dots.forEach((dot, index) => {
        const active = index === current;
        dot.classList.toggle("active", active);
        if (active) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
      counter.textContent = String(current + 1).padStart(2, "0");
      progress.classList.remove("running");
      void progress.offsetWidth;
      if (!reducedMotion) progress.classList.add("running");
      schedule();
    }

    slider.querySelector("#heroPrev").addEventListener("click", () => showSlide(current - 1));
    slider.querySelector("#heroNext").addEventListener("click", () => showSlide(current + 1));
    dots.forEach(dot => dot.addEventListener("click", () => showSlide(Number(dot.dataset.slideTo))));
    document.addEventListener("visibilitychange", schedule);

    showSlide(0);
  }

  const member = (typeof window.member !== "undefined") ? window.member : null;

  document.querySelector("#mobileSaved")?.addEventListener("click", () => document.querySelector("#savedShortcut")?.click());
  document.querySelector("#mobileAccount")?.addEventListener("click", () => document.querySelector("#openAdmin")?.click());
  document.querySelector("#heroJoin")?.addEventListener("click", () => {
    if (member && typeof window.showMemberProfile === "function") {
      window.showMemberProfile(member.email);
      return;
    }
    document.querySelector("#openAdmin")?.click();
    document.querySelector('[data-auth-tab="signup"]')?.click();
  });

  window._redesignReady = true;
})();

(function exportFns() {
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function exportJSON(filename, data) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    downloadBlob(filename, blob);
  }

  function importJSON(callback, accept = "application/json") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result || "{}"));
          callback(data, file);
        } catch (err) {
          alert("تعذّرت قراءة الملف. تأكد من أن الملف JSON صالح.");
        }
      };
      reader.readAsText(file, "utf-8");
    };
    input.click();
  }

  function stateSnapshot() {
    if (typeof window.state !== "undefined") return window.state;
    const KEY = "folva-state-v1";
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
  }

  function persistAndRefresh() {
    if (typeof window.save === "function") { window.save(); return; }
    const KEY = "folva-state-v1";
    if (typeof window.state !== "undefined") localStorage.setItem(KEY, JSON.stringify(window.state));
    if (typeof window.render === "function") window.render();
  }

  window._redesignHelpers = {
    downloadBlob,
    exportJSON,
    importJSON,
    stateSnapshot,
    persistAndRefresh
  };
})();

(function themesEngine() {
  "use strict";
  const THEMES_STORAGE_KEY = "folva-active-theme-v1";
  const CUSTOM_STORAGE_KEY = "folva-custom-themes-v1";
  const CUSTOM_DATA_KEY_PREFIX = "folva-custom-data-";

  const THEMES = [
    { id:"minimal-studio",name:"Minimal Studio",desc:"استوديو هادئ بمساحات واسعة وصور كبيرة وتسلسل تحريري",style:"Minimal · Editorial",accent:"#9cba43",hero:["#172019","#394834"],surface:"#f7f8f4",radius:"4px",font:'"IBM Plex Sans Arabic","DM Sans",sans-serif',layout:{site:"editorial",admin:"rail",width:1260,hero:430,columns:2,gap:30,ratio:"4/3",sidebar:218,quick:3,stats:3,density:"airy",cards:"flat",header:"quiet"}},
    { id:"creative-grid",name:"Creative Grid",desc:"شبكة إبداعية كثيفة ومتحركة تضع الأعمال في الواجهة",style:"Creative · Grid",accent:"#315be8",hero:["#111b48","#315be8"],surface:"#f3f5fc",radius:"8px",font:'"Cairo","IBM Plex Sans Arabic",sans-serif',layout:{site:"mosaic",admin:"grid",width:1440,hero:520,columns:4,gap:14,ratio:"1/1",sidebar:256,quick:6,stats:6,density:"compact",cards:"boxed",header:"floating"}},
    { id:"premium-portfolio",name:"Premium Portfolio",desc:"عرض فاخر بأعمال منتقاة وتفاصيل رفيعة ومساحات محسوبة",style:"Premium · Portfolio",accent:"#c9aa70",hero:["#181714","#4b4335"],surface:"#f4f2ed",radius:"2px",font:'"Noto Serif Arabic","DM Sans",serif',layout:{site:"premium",admin:"wide",width:1380,hero:610,columns:3,gap:24,ratio:"5/4",sidebar:284,quick:4,stats:4,density:"spacious",cards:"framed",header:"centered"}},
    { id:"modern-agency",name:"Modern Agency",desc:"واجهة وكالة معاصرة ببطل مقسوم وشريط تنقل واضح",style:"Agency · Split",accent:"#e45e43",hero:["#35201b","#bb5039"],surface:"#f7f3ef",radius:"12px",font:'"Tajawal","IBM Plex Sans Arabic",sans-serif',layout:{site:"split",admin:"topnav",width:1360,hero:560,columns:3,gap:22,ratio:"4/3",sidebar:250,quick:5,stats:4,density:"comfortable",cards:"raised",header:"agency"}},
    { id:"dark-gallery",name:"Dark Gallery",desc:"معرض داكن كامل الشاشة يعرض الصور في شبكة متقاربة",style:"Dark · Gallery",accent:"#84b9a2",hero:["#101716","#263a34"],surface:"#111817",dark:true,radius:"0px",font:'"DM Sans","IBM Plex Sans Arabic",sans-serif',layout:{site:"gallery",admin:"dark-rail",width:1500,hero:600,columns:5,gap:8,ratio:"1/1",sidebar:230,quick:4,stats:4,density:"compact",cards:"image",header:"overlay"}},
    { id:"editorial",name:"Editorial",desc:"إيقاع مجلة ثقافية بعناوين كبيرة وأعمدة نصية واضحة",style:"Editorial · Magazine",accent:"#bf4937",hero:["#2f211e","#87463a"],surface:"#faf6f0",radius:"1px",font:'"Noto Serif Arabic","IBM Plex Sans Arabic",serif',layout:{site:"magazine",admin:"editorial",width:1180,hero:580,columns:2,gap:34,ratio:"3/2",sidebar:236,quick:3,stats:3,density:"airy",cards:"editorial",header:"serif"}},
    { id:"glass-ui",name:"Glass UI",desc:"طبقات شفافة ولوحات زجاجية فوق خلفية ضبابية هادئة",style:"Glass · Layers",accent:"#36a995",hero:["#163e42","#438b7d"],surface:"#eaf3ef",radius:"20px",font:'"Almarai","IBM Plex Sans Arabic",sans-serif',layout:{site:"glass",admin:"glass",width:1320,hero:520,columns:3,gap:20,ratio:"4/3",sidebar:260,quick:4,stats:4,density:"comfortable",cards:"glass",header:"floating"}},
    { id:"luxury-black",name:"Luxury Black",desc:"هوية سوداء راقية بعناصر قليلة ولمسات معدنية دقيقة",style:"Luxury · Black",accent:"#d0b083",hero:["#090909","#25211c"],surface:"#11100f",dark:true,radius:"0px",font:'"Noto Serif Arabic","DM Sans",serif',layout:{site:"luxury",admin:"luxury",width:1320,hero:650,columns:2,gap:28,ratio:"5/4",sidebar:270,quick:3,stats:3,density:"spacious",cards:"luxury",header:"minimal"}},
    { id:"neon-creative",name:"Neon Creative",desc:"مساحة رقمية عالية التباين وتفاصيل نيون حول المحتوى",style:"Neon · Digital",accent:"#00e5d1",hero:["#07191c","#123e4a"],surface:"#091417",dark:true,radius:"5px",font:'"Cairo","DM Sans",sans-serif',layout:{site:"neon",admin:"neon",width:1460,hero:540,columns:4,gap:16,ratio:"4/3",sidebar:246,quick:4,stats:4,density:"compact",cards:"glow",header:"tech"}},
    { id:"swiss-minimal",name:"Swiss Minimal",desc:"شبكة سويسرية صارمة ومحاذاة دقيقة ومساحات بيضاء",style:"Swiss · Grid",accent:"#d43d34",hero:["#202327","#555d62"],surface:"#fff",radius:"0px",font:'"IBM Plex Sans Arabic","DM Sans",sans-serif',layout:{site:"swiss",admin:"swiss",width:1400,hero:420,columns:4,gap:18,ratio:"1/1",sidebar:220,quick:4,stats:4,density:"compact",cards:"outline",header:"grid"}},
    { id:"brutalist",name:"Brutalist",desc:"كتل صريحة وحدود ثقيلة وعناوين لا تختبئ",style:"Brutal · Raw",accent:"#ecff00",hero:["#171717","#333333"],surface:"#f1f0e8",radius:"0px",font:'"Cairo","IBM Plex Sans Arabic",sans-serif',layout:{site:"brutalist",admin:"brutal",width:1500,hero:500,columns:3,gap:12,ratio:"4/3",sidebar:292,quick:6,stats:6,density:"dense",cards:"hard",header:"block"}},
    { id:"elegant-portfolio",name:"Elegant Portfolio",desc:"محفظة أنيقة بخط رفيع وعرض متوازن للأعمال",style:"Elegant · Portfolio",accent:"#567e72",hero:["#172a28","#4d7668"],surface:"#f4f7f3",radius:"14px",font:'"Noto Serif Arabic","Almarai",serif',layout:{site:"elegant",admin:"elegant",width:1240,hero:560,columns:3,gap:28,ratio:"4/3",sidebar:252,quick:4,stats:4,density:"spacious",cards:"soft",header:"editorial"}},
    { id:"cinematic",name:"Cinematic",desc:"واجهة سينمائية غامرة ببطل عريض ومشاهد متتابعة",style:"Cinematic · Fullscreen",accent:"#d94f62",hero:["#190f18","#69283d"],surface:"#141116",dark:true,radius:"4px",font:'"Tajawal","DM Sans",sans-serif',layout:{site:"cinematic",admin:"cinematic",width:1540,hero:760,columns:2,gap:26,ratio:"16/10",sidebar:276,quick:3,stats:3,density:"spacious",cards:"cinema",header:"overlay"}},
    { id:"3d-creative",name:"3D Creative",desc:"طبقات متداخلة ومنظور عميق لعرض المشاريع كمساحات",style:"Depth · Spatial",accent:"#f07855",hero:["#172d47","#536b96"],surface:"#edf2f8",radius:"18px",font:'"Cairo","DM Sans",sans-serif',layout:{site:"depth",admin:"spatial",width:1380,hero:580,columns:3,gap:24,ratio:"4/3",sidebar:258,quick:4,stats:4,density:"comfortable",cards:"depth",header:"floating"}},
    { id:"magazine",name:"Magazine",desc:"غلاف رئيسي وعناوين متدرجة وصفحات على هيئة مجلة",style:"Magazine · Cover",accent:"#d94332",hero:["#381b17","#ab4736"],surface:"#fbf5ed",radius:"3px",font:'"Noto Serif Arabic","IBM Plex Sans Arabic",serif',layout:{site:"cover",admin:"magazine",width:1420,hero:640,columns:3,gap:20,ratio:"3/2",sidebar:244,quick:5,stats:4,density:"comfortable",cards:"cover",header:"masthead"}},
    { id:"professional-business",name:"Professional Business",desc:"نظام أعمال عملي وكثيف للمراجعة والإدارة المتكررة",style:"Business · Structured",accent:"#267e78",hero:["#173744","#23675f"],surface:"#f2f6f5",radius:"6px",font:'"Almarai","IBM Plex Sans Arabic",sans-serif',layout:{site:"business",admin:"enterprise",width:1420,hero:460,columns:3,gap:18,ratio:"4/3",sidebar:278,quick:4,stats:5,density:"dense",cards:"business",header:"utility"}},
    { id:"artistic",name:"Artistic",desc:"تكوين فني غير متماثل يترك مساحة للتجربة واللون",style:"Art · Asymmetric",accent:"#d76638",hero:["#29241b","#795d3f"],surface:"#f8f3e9",radius:"28px",font:'"Tajawal","Noto Serif Arabic",sans-serif',layout:{site:"art",admin:"canvas",width:1360,hero:600,columns:3,gap:25,ratio:"3/4",sidebar:250,quick:4,stats:4,density:"airy",cards:"art",header:"asymmetric"}},
    { id:"clean-white",name:"Clean White",desc:"واجهة بيضاء صافية بعناصر مباشرة وخط واضح",style:"Clean · White",accent:"#427ba9",hero:["#253846","#547992"],surface:"#fff",radius:"8px",font:'"IBM Plex Sans Arabic","DM Sans",sans-serif',layout:{site:"white",admin:"white",width:1280,hero:470,columns:3,gap:24,ratio:"4/3",sidebar:228,quick:4,stats:4,density:"comfortable",cards:"clean",header:"plain"}},
    { id:"dark-gold",name:"Dark Gold",desc:"عرض ليلي بلمسات ذهبية وواجهات إدارة متباينة",style:"Dark · Gold",accent:"#d3aa51",hero:["#0c0b0a","#30271b"],surface:"#11100e",dark:true,radius:"10px",font:'"Almarai","DM Sans",sans-serif',layout:{site:"gold",admin:"gold",width:1380,hero:580,columns:3,gap:18,ratio:"4/3",sidebar:264,quick:4,stats:4,density:"compact",cards:"gold",header:"luxury"}},
    { id:"purple-creative",name:"Purple Creative",desc:"هوية إبداعية بنفسجية ببطل متدرج وشبكة مرنة",style:"Creative · Chromatic",accent:"#9254cf",hero:["#28183f","#68418e"],surface:"#f6f1fa",radius:"16px",font:'"Cairo","IBM Plex Sans Arabic",sans-serif',layout:{site:"chromatic",admin:"chromatic",width:1340,hero:520,columns:3,gap:22,ratio:"4/3",sidebar:252,quick:4,stats:4,density:"comfortable",cards:"chromatic",header:"centered"}},
    { id:"orange-studio",name:"Orange Studio",desc:"استوديو دافئ بكتل برتقالية وعرض أفقي للأعمال",style:"Studio · Orange",accent:"#ee6d36",hero:["#3d2016","#9b4b28"],surface:"#fcf3e9",radius:"5px",font:'"Tajawal","DM Sans",sans-serif',layout:{site:"orange",admin:"studio",width:1460,hero:500,columns:4,gap:16,ratio:"5/4",sidebar:276,quick:5,stats:4,density:"dense",cards:"studio",header:"split"}},
    { id:"futuristic",name:"Futuristic",desc:"مظهر مستقبلي هندسي بخطوط حادة ومعلومات مركزة",style:"Future · Interface",accent:"#53d8d1",hero:["#101d35","#244b60"],surface:"#edf3f4",radius:"3px",font:'"Cairo","DM Sans",sans-serif',layout:{site:"future",admin:"future",width:1500,hero:540,columns:4,gap:14,ratio:"1/1",sidebar:232,quick:5,stats:5,density:"dense",cards:"tech",header:"tech"}},
    { id:"bento-portfolio",name:"Bento Portfolio",desc:"لوحة بنتو متعددة المساحات تبرز المشاريع بأحجام مختلفة",style:"Bento · Modular",accent:"#8ea943",hero:["#1b2c29","#4b6351"],surface:"#f1f4e9",radius:"18px",font:'"Almarai","IBM Plex Sans Arabic",sans-serif',layout:{site:"bento",admin:"bento",width:1420,hero:480,columns:4,gap:14,ratio:"1/1",sidebar:250,quick:6,stats:4,density:"compact",cards:"bento",header:"modular"}},
    { id:"motion-portfolio",name:"Motion Portfolio",desc:"تجربة نابضة بحركات دخول وانتقالات واضحة ومضبوطة",style:"Motion · Portfolio",accent:"#e46f91",hero:["#30203a","#674767"],surface:"#f7f0f5",radius:"22px",font:'"Tajawal","DM Sans",sans-serif',layout:{site:"motion",admin:"motion",width:1320,hero:590,columns:3,gap:25,ratio:"4/3",sidebar:258,quick:4,stats:4,density:"comfortable",cards:"motion",header:"floating"}},
    { id:"ultra-modern",name:"Ultra Modern",desc:"هوية حديثة فائقة الوضوح بتقسيمات واسعة وأدوات دقيقة",style:"Ultra · Contemporary",accent:"#b4d942",hero:["#17252d","#3b5461"],surface:"#f2f5f3",radius:"10px",font:'"Cairo","IBM Plex Sans Arabic",sans-serif',layout:{site:"ultra",admin:"ultra",width:1500,hero:530,columns:4,gap:20,ratio:"4/3",sidebar:268,quick:5,stats:5,density:"comfortable",cards:"ultra",header:"utility",detail:"overlay"}},
    { id:"aurora-atelier",name:"Aurora Atelier",desc:"استوديو ضوئي بتدرجات شفقية ومشاريع عائمة متعددة الطبقات",style:"Aurora · Atelier",accent:"#70e0c0",hero:["#123c48","#326d83"],surface:"#eaf5f2",radius:"24px",font:'"Almarai","DM Sans",sans-serif',layout:{site:"aurora",admin:"aurora",width:1380,hero:610,columns:3,gap:24,ratio:"4/3",sidebar:258,quick:4,stats:4,density:"airy",cards:"aurora",header:"floating",detail:"lightbox"}},
    { id:"monochrome-architecture",name:"Monochrome Architecture",desc:"معمارية أبيض وأسود تعتمد المحاور والخطوط والفراغات الصريحة",style:"Architecture · Mono",accent:"#212629",hero:["#101314","#51585a"],surface:"#f5f5f2",radius:"0px",font:'"IBM Plex Sans Arabic","DM Sans",sans-serif',layout:{site:"architecture",admin:"architecture",width:1480,hero:430,columns:4,gap:10,ratio:"3/4",sidebar:214,quick:5,stats:5,density:"dense",cards:"architecture",header:"grid",detail:"split"}},
    { id:"riviera-editorial",name:"Riviera Editorial",desc:"مجلة متوسطية واسعة بصور أفقية وألوان بحرية ونصوص راقية",style:"Riviera · Editorial",accent:"#347f83",hero:["#17434b","#4c8787"],surface:"#f2f6f2",radius:"6px",font:'"Noto Serif Arabic","IBM Plex Sans Arabic",serif',layout:{site:"riviera",admin:"riviera",width:1280,hero:650,columns:2,gap:34,ratio:"16/10",sidebar:244,quick:3,stats:3,density:"airy",cards:"riviera",header:"masthead",detail:"side-panel"}},
    { id:"object-gallery",name:"Object Gallery",desc:"متحف رقمي يضع كل قطعة في مساحة عرض منفردة وهادئة",style:"Museum · Object",accent:"#ddc89b",hero:["#151614","#343631"],surface:"#111310",dark:true,radius:"2px",font:'"Almarai","IBM Plex Sans Arabic",sans-serif',layout:{site:"object",admin:"museum",width:1540,hero:720,columns:3,gap:36,ratio:"1/1",sidebar:238,quick:3,stats:3,density:"spacious",cards:"object",header:"minimal",detail:"immersive"}},
    { id:"neo-tokyo",name:"Neo Tokyo",desc:"مدينة ليلية مستقبلية بعناصر نيون متقاطعة وشبكة عالية الكثافة",style:"Neo · Tokyo",accent:"#ff4fa3",hero:["#101127","#36215c"],surface:"#10101c",dark:true,radius:"3px",font:'"Cairo","DM Sans",sans-serif',layout:{site:"tokyo",admin:"tokyo",width:1500,hero:560,columns:5,gap:12,ratio:"1/1",sidebar:244,quick:5,stats:5,density:"dense",cards:"tokyo",header:"tech",detail:"drawer"}},
    { id:"atelier-paper",name:"Atelier Paper",desc:"دفتر ورقي فني بخامة مطفأة وحواشٍ وتعليقات تحريرية",style:"Paper · Atelier",accent:"#ab603d",hero:["#33241d","#80533c"],surface:"#f1e9db",radius:"1px",font:'"Noto Serif Arabic","Tajawal",serif',layout:{site:"paper",admin:"paper",width:1160,hero:540,columns:2,gap:38,ratio:"3/4",sidebar:232,quick:3,stats:3,density:"airy",cards:"paper",header:"serif",detail:"sheet"}},
    { id:"horizon-luxe",name:"Horizon Luxe",desc:"محفظة أفقية راقية بمشهد بانورامي وانتقالات ذهبية هادئة",style:"Horizon · Luxe",accent:"#d4bd78",hero:["#19252a","#4b5f60"],surface:"#f0f1eb",radius:"12px",font:'"Noto Serif Arabic","DM Sans",serif',layout:{site:"horizon",admin:"horizon",width:1500,hero:700,columns:3,gap:20,ratio:"16/9",sidebar:272,quick:4,stats:4,density:"spacious",cards:"horizon",header:"overlay",detail:"fullscreen"}},
    { id:"archive-index",name:"Archive Index",desc:"فهرس أرشيفي تحريري يحول المشاريع إلى قائمة قابلة للمسح السريع",style:"Archive · Index",accent:"#b74132",hero:["#292421","#68574a"],surface:"#f3efe9",radius:"0px",font:'"IBM Plex Sans Arabic","DM Sans",sans-serif',layout:{site:"archive",admin:"archive",width:1300,hero:420,columns:2,gap:12,ratio:"5/4",sidebar:266,quick:5,stats:5,density:"dense",cards:"archive",header:"utility",detail:"inline"}},
    { id:"kinetic-canvas",name:"Kinetic Canvas",desc:"لوحة حركية بمراحل بصرية متتابعة وتبدلات مرئية عند الفتح",style:"Kinetic · Canvas",accent:"#cf6bdb",hero:["#20143d","#654d91"],surface:"#f2eff8",radius:"18px",font:'"Tajawal","Cairo",sans-serif',layout:{site:"kinetic",admin:"kinetic",width:1400,hero:620,columns:3,gap:25,ratio:"4/3",sidebar:260,quick:4,stats:4,density:"comfortable",cards:"kinetic",header:"floating",detail:"stack"}},
    { id:"sculpted-grid",name:"Sculpted Grid",desc:"شبكة منحوتة غير متماثلة بأحجام صور وتكوينات تتغير عبر الصفحة",style:"Sculpted · Grid",accent:"#cb7656",hero:["#263234","#71544a"],surface:"#f2f1ec",radius:"10px",font:'"Cairo","IBM Plex Sans Arabic",sans-serif',layout:{site:"sculpted",admin:"sculpted",width:1480,hero:500,columns:4,gap:15,ratio:"1/1",sidebar:280,quick:6,stats:5,density:"compact",cards:"sculpted",header:"asymmetric",detail:"split"}}
  ];

  let CUSTOM_THEMES = [];
  function loadCustomThemes() {
    try {
      const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
      CUSTOM_THEMES = raw ? JSON.parse(raw) : [];
    } catch (e) { console.warn("[Themes] custom load error", e); CUSTOM_THEMES = []; }
  }
  function saveCustomThemes() {
    try { localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(CUSTOM_THEMES)); } catch (e) { console.warn("[Themes] custom save error", e); }
  }
  function getCustomData(id) {
    try { return JSON.parse(localStorage.getItem(CUSTOM_DATA_KEY_PREFIX + id) || "null"); } catch (e) { return null; }
  }
  function setCustomData(id, data) {
    try { localStorage.setItem(CUSTOM_DATA_KEY_PREFIX + id, JSON.stringify(data)); } catch (e) { console.warn("[Themes] data save error", e); }
  }
  function removeCustomData(id) {
    try { localStorage.removeItem(CUSTOM_DATA_KEY_PREFIX + id); } catch (e) {}
  }

  function getAllThemes() {
    return [...THEMES, ...CUSTOM_THEMES];
  }

  function findTheme(id) {
    const t = THEMES.find(x => x.id === id);
    if (t) return t;
    const c = CUSTOM_THEMES.find(x => x.id === id);
    return c ? { ...c, custom: true } : null;
  }

  function getActiveThemeId() {
    try {
      const saved = localStorage.getItem(THEMES_STORAGE_KEY);
      if (saved && findTheme(saved)) return saved;
      const legacy = { folva:"minimal-studio", midnight:"professional-business", royal:"premium-portfolio", sunset:"orange-studio", ocean:"glass-ui", forest:"artistic", desert:"editorial", noir:"dark-gold", sakura:"elegant-portfolio", arctic:"swiss-minimal", brew:"magazine", cyber:"futuristic", lavender:"purple-creative", retro:"brutalist", mint:"clean-white" };
      if (legacy[saved]) {
        localStorage.setItem(THEMES_STORAGE_KEY, legacy[saved]);
        return legacy[saved];
      }
      if (saved) localStorage.removeItem(THEMES_STORAGE_KEY);
    } catch (e) { console.warn("[Themes] storage read error", e); }
    return THEMES[0].id;
  }
  function getActiveTheme() {
    return findTheme(getActiveThemeId()) || THEMES[0];
  }

  const CUSTOMIZER_STORAGE_KEY = "folva-theme-customizer-v1";
  function getThemeCustomization(id) {
    try { return JSON.parse(localStorage.getItem(CUSTOMIZER_STORAGE_KEY + ":" + id) || "{}"); } catch { return {}; }
  }

  function saveThemeCustomization(id, values) {
    try { localStorage.setItem(CUSTOMIZER_STORAGE_KEY + ":" + id, JSON.stringify(values)); } catch (e) { console.warn("[Themes] customization save error", e); }
  }

  function applyThemeLayout(themeId, theme, customization = getThemeCustomization(themeId)) {
    const layout = theme.layout || THEMES[0].layout;
    const root = document.documentElement;
    const site = document.querySelector("#publicView");
    const admin = document.querySelector("#adminView");
    root.dataset.themeLayout = layout.site;
    root.dataset.adminLayout = layout.admin;
    const headerStyle = !customization.headerStyle || customization.headerStyle === "theme" ? layout.header || "standard" : customization.headerStyle;
    const sidebarStyle = !customization.sidebarStyle || customization.sidebarStyle === "theme" ? layout.admin : customization.sidebarStyle;
    const cardStyle = !customization.cardStyle || customization.cardStyle === "theme" ? layout.cards || "boxed" : customization.cardStyle;
    const footerStyle = !customization.footerStyle || customization.footerStyle === "theme" ? "theme" : customization.footerStyle;
    root.dataset.themeHeader = headerStyle;
    root.dataset.themeSidebar = sidebarStyle;
    root.dataset.themeCards = cardStyle;
    root.dataset.themeFooter = footerStyle;
    root.dataset.themeDetail = customization.detailStyle || layout.detail || "default";
    root.dataset.themeDensity = customization.density || layout.density;
    root.style.setProperty("--layout-content-width", `${customization.width || layout.width}px`);
    root.style.setProperty("--layout-hero-height", `${customization.hero || layout.hero}px`);
    root.style.setProperty("--layout-grid-columns", customization.columns || layout.columns);
    root.style.setProperty("--layout-grid-gap", `${customization.gap ?? layout.gap}px`);
    root.style.setProperty("--layout-radius", customization.radius || theme.radius || "12px");
    root.style.setProperty("--layout-sidebar-width", `${layout.sidebar}px`);
    root.style.setProperty("--layout-admin-quick-columns", layout.quick);
    root.style.setProperty("--layout-admin-stat-columns", layout.stats);
    root.style.setProperty("--layout-image-ratio", layout.ratio || "4/3");
    root.style.setProperty("--layout-font", customization.font || theme.font || '"IBM Plex Sans Arabic",sans-serif');
    root.style.setProperty("--layout-animation", customization.motion === false ? "0ms" : "320ms");
    if (site) site.dataset.layout = layout.site;
    if (admin) admin.dataset.layout = sidebarStyle === "topnav" || sidebarStyle === "rail" || sidebarStyle === "wide" ? sidebarStyle : layout.admin;
    document.body.classList.toggle("theme-motion-off", customization.motion === false);
    document.body.classList.toggle("theme-compact", customization.density === "compact");
    document.body.classList.toggle("theme-admin-sidebar-hidden", customization.sidebar === false);
    for (const [key, value] of [["--lime", customization.accent], ["--paper", customization.surface], ["--ink", customization.ink], ["--line", customization.line]]) {
      if (value) root.style.setProperty(key, value);
      else root.style.removeProperty(key);
    }
    renderThemeAssets(themeId, customization);
  }

  function renderThemeAssets(themeId, customization) {
    const validUrl = value => {
      try { const url = new URL(value, location.href); return ["http:", "https:", "blob:", "file:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
    };
    if (customization.backgroundKey && window.mediaObjectURL) {
      window.mediaObjectURL(customization.backgroundKey).then(url => {
        if (document.documentElement.dataset.theme === themeId) document.body.style.backgroundImage = `linear-gradient(#00000018,#00000018),url("${url}")`;
      }).catch(() => {});
    } else if (customization.backgroundUrl) {
      const url = validUrl(customization.backgroundUrl);
      document.body.style.backgroundImage = url ? `linear-gradient(#00000012,#00000012),url("${url}")` : "";
    } else document.body.style.backgroundImage = "";
    document.querySelectorAll(".brand").forEach(brand => {
      let image = brand.querySelector(".theme-custom-logo");
      if (!customization.logoKey || !window.mediaObjectURL) {
        image?.remove();
        brand.querySelector(".mark")?.style.removeProperty("display");
        brand.querySelector(".brand-name")?.style.removeProperty("display");
        return;
      }
      if (!image) {
        image = document.createElement("img");
        image.className = "theme-custom-logo";
        image.alt = "";
        brand.append(image);
      }
      brand.querySelector(".mark")?.style.setProperty("display", "none");
      brand.querySelector(".brand-name")?.style.setProperty("display", "none");
      window.mediaObjectURL(customization.logoKey).then(url => {
        if (document.documentElement.dataset.theme === themeId && image.isConnected) image.src = url;
      }).catch(() => {});
    });
  }

  function showToast(msg, kind) {
    let t = document.querySelector(".theme-toast");
    if (!t) { t = document.createElement("div"); t.className = "theme-toast"; document.body.appendChild(t); }
    t.className = "theme-toast show " + (kind || "info");
    t.textContent = msg;
    clearTimeout(t._tm);
    t._tm = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function hexToRgba(h, a) {
    try {
      const s = h.replace("#","").trim();
      const n = s.length === 3 ? s.split("").map(c=>c+c).join("") : s;
      const i = parseInt(n, 16);
      const r = (i>>16)&255, g=(i>>8)&255, b=i&255;
      return `rgba(${r},${g},${b},${a})`;
    } catch { return h; }
  }

  function tokensToCssString(theme, data) {
    const t = theme;
    const tk = (data && data.tokens) || {};
    const custom = (data && data.customization) || getThemeCustomization(t.id);
    const tokens = {
      "--paper": custom.surface || tk["--paper"] || t.surface || (t.dark ? "#111413" : "#f7f8f4"),
      "--ink": custom.ink || tk["--ink"] || (t.dark ? "#f4f5f2" : "#20241f"),
      "--muted": tk["--muted"] || (t.dark ? "#a8b0ab" : "#6b7066"),
      "--line": custom.line || tk["--line"] || (t.dark ? "#35403a" : "#e0e4dc"),
      "--lime": custom.accent || tk["--lime"] || t.accent || "#c8e84a"
    };
    const accent = custom.accent || t.accent || "#c8e84a";
    const heroa = t.hero ? t.hero[0] : "#1a1f17";
    const herob = t.hero ? t.hero[1] : "#2d3528";
    const rad = custom.radius || t.radius || "12px";
    const dark = !!t.dark;
    const paper = tokens["--paper"];
    const ink = tokens["--ink"];
    const muted = tokens["--muted"];
    const line = tokens["--line"];
    return `html[data-theme="${t.id}"]{--paper:${paper};--ink:${ink};--muted:${muted};--line:${line};--lime:${tokens["--lime"]};--radius:${rad};--radius-sm:${rad};--line-soft:${line};--shadow-ui:0 14px 40px ${hexToRgba(ink,.14)};--gradient-dark:linear-gradient(135deg,${heroa} 0%,${herob} 100%);--gradient-lime:linear-gradient(135deg,${herob} 0%,${accent} 100%);--gradient-soft:linear-gradient(135deg,#ffffff 0%,${paper} 100%);--glass-bg:rgba(255,255,255,0.78);--theme-accent:${accent};--theme-accent-gradient:linear-gradient(135deg,${herob},${accent});--theme-ink:${ink};--theme-ink-soft:${muted};--theme-border:${line};--theme-card:#ffffff;--theme-surface:${paper};--theme-bar-bg:rgba(255,255,255,0.82);--theme-hero-a:${heroa};--theme-hero-b:${herob};--theme-radius:${rad};--theme-radius-sm:${rad};--theme-accent-shadow:${hexToRgba(accent,.5)};--theme-accent-glow:${hexToRgba(accent,.22)}}${dark?`html[data-theme="${t.id}"] body{color:${ink};background:linear-gradient(135deg,${heroa} 0%,${herob} 100%)}html[data-theme="${t.id}"] .table-wrap,html[data-theme="${t.id}"] .admin-row,html[data-theme="${t.id}"] .settings-form,html[data-theme="${t.id}"] .qa-card,html[data-theme="${t.id}"] .theme-card,html[data-theme="${t.id}"] .theme-current-card,html[data-theme="${t.id}"] .theme-format-help{background:${paper};border-color:${line};color:${ink}}html[data-theme="${t.id}"] .admin-search,html[data-theme="${t.id}"] .settings-form input,html[data-theme="${t.id}"] .settings-form textarea,html[data-theme="${t.id}"] .dialog-card input{background:${heroa};border-color:${line};color:${ink}}html[data-theme="${t.id}"] th{background:${heroa};color:${muted}}html[data-theme="${t.id}"] td{border-top-color:${line}}`:""}`;
  }

  function injectCustomThemeAssets(theme, data) {
    try {
      let styleEl = document.querySelector("#folva-custom-theme-style");
      if (!styleEl) { styleEl = document.createElement("style"); styleEl.id = "folva-custom-theme-style"; document.head.appendChild(styleEl); }
      if (!theme) {
        const builtinCss = THEMES.map(item => tokensToCssString(item, { customization: getThemeCustomization(item.id) })).join("\n");
        const customCss = CUSTOM_THEMES.map(ct => {
          const customData = getCustomData(ct.id);
          return tokensToCssString(ct, { ...(customData || {}), customization: getThemeCustomization(ct.id) }) + (customData?.css ? `\nhtml[data-theme="${ct.id}"]{${customData.css}}` : "");
        }).join("\n");
        styleEl.textContent = `/* FOLVA theme registry */\n${builtinCss}\n${customCss}`;
        return;
      }
      const extraCss = data && data.css ? `/* custom theme ${theme.id} */\n${data.css}` : "";
      const builtinCss = THEMES.map(item => tokensToCssString(item, { customization: getThemeCustomization(item.id) })).join("\n");
      const allCustomCss = CUSTOM_THEMES.map(ct => {
        const customData = ct.id === theme?.id && data ? data : getCustomData(ct.id);
        return tokensToCssString(ct, { ...(customData || {}), customization: getThemeCustomization(ct.id) }) + (customData?.css ? `\n/* custom ${ct.id} */\nhtml[data-theme="${ct.id}"]{${customData.css}}` : "");
      }).join("\n");
      styleEl.textContent = `/* FOLVA theme registry */\n${builtinCss}\n${allCustomCss}\n${extraCss}`;
    } catch (e) { console.warn("[Themes] style inject error", e); }
  }

  function runCustomThemeScript(theme, data) {
    try {
      let old = document.querySelector("#folva-custom-theme-script");
      if (old) old.remove();
      if (!(data && data.js)) return;
      const s = document.createElement("script");
      s.id = "folva-custom-theme-script";
      s.text = `(function(){ 'use strict'; try {\n${data.js}\n} catch(e){ console.error('[Theme ${theme.id} JS Error]', e); }})();`;
      document.body.appendChild(s);
    } catch (e) { console.warn("[Themes] script run error", e); }
  }

  function applyTheme(themeId) {
    try {
      const theme = findTheme(themeId);
      if (!theme) { showToast("القالب غير موجود!", "err"); return; }
      document.documentElement.setAttribute("data-theme", themeId);
      applyThemeLayout(themeId, theme);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getThemeCustomization(themeId).surface || theme.surface || theme.accent);
      try { localStorage.setItem(THEMES_STORAGE_KEY, themeId); } catch (e) {}
      if (theme.custom) {
        const data = getCustomData(themeId);
        injectCustomThemeAssets(theme, { ...(data || {}), customization: getThemeCustomization(themeId) });
        runCustomThemeScript(theme, data);
      } else {
        injectCustomThemeAssets(theme, { customization: getThemeCustomization(themeId) });
        const old = document.querySelector("#folva-custom-theme-script");
        if (old) old.remove();
      }
      applyThemeLayout(themeId, theme);
      updateCurrentThemeCard(theme);
      renderThemesGrid();
      showToast("✨ تم تطبيق تصميم " + theme.name, "ok");
    } catch (e) { console.error("[Themes] applyTheme error", e); showToast("خطأ أثناء تطبيق القالب", "err"); }
  }

  function updateCurrentThemeCard(theme) {
    try {
      const preview = document.querySelector("#currentPreview");
      const name = document.querySelector("#currentThemeName");
      const desc = document.querySelector("#currentThemeDesc");
      const style = document.querySelector("#currentThemeStyle");
      const radius = document.querySelector("#currentThemeRadius");
      const shadows = document.querySelector("#currentThemeShadows");
      if (preview) { preview.style.setProperty("--theme-accent", theme.accent); preview.style.setProperty("--theme-hero-a", theme.hero[0]); preview.style.setProperty("--theme-hero-b", theme.hero[1]); preview.dataset.layout = theme.layout?.site || "editorial"; }
      if (name) name.textContent = theme.name + (theme.custom ? "  👈 مخصص" : "");
      if (desc) desc.textContent = theme.desc;
      if (style) style.textContent = theme.style;
      if (radius) radius.textContent = "• نصف قطر: " + theme.radius;
      if (shadows) shadows.textContent = "• ظلال: " + theme.shadows;
    } catch (e) { console.error("[Themes] updateCurrentThemeCard error", e); }
  }

  function updateThemesCountLabel() {
    const lbl = document.querySelector("#themesCountLabel");
    if (!lbl) return;
    const total = THEMES.length + CUSTOM_THEMES.length;
    lbl.textContent = `${total} قالب (${THEMES.length} جاهز + ${CUSTOM_THEMES.length} مخصص)`;
  }

  function filterThemes() {
    const query = (document.querySelector("#themeSearch")?.value || "").trim().toLocaleLowerCase("ar");
    const category = document.querySelector("#themeFilter")?.value || "all";
    document.querySelectorAll("#themesGrid .theme-card").forEach(card => {
      const matchesQuery = !query || card.dataset.themeSearch.includes(query);
      const matchesCategory = category === "all" || card.dataset.themeFilter === category;
      card.hidden = !matchesQuery || !matchesCategory;
    });
  }

  function setPreviewDevice(device) {
    const wrap = document.querySelector("#themePreviewFrameWrap");
    if (!wrap) return;
    wrap.dataset.device = device;
    document.querySelectorAll("[data-preview-device]").forEach(button => button.classList.toggle("active", button.dataset.previewDevice === device));
  }

  function showThemePreview(id) {
    const theme = findTheme(id);
    if (!theme) return;
    const dialog = document.querySelector("#themePreviewDialog");
    const frame = document.querySelector("#themePreviewFrame");
    document.querySelector("#themePreviewName").textContent = theme.name;
    document.querySelector("#themePreviewDescription").textContent = theme.desc;
    document.querySelector("#applyPreviewTheme").dataset.applyTheme = id;
    frame.onload = () => {
      try {
        const previewWindow = frame.contentWindow;
        previewWindow.showPublic?.();
        const previewTheme = findTheme(id);
        previewWindow.document.documentElement.setAttribute("data-theme", id);
        previewWindow._themesEngine?.previewTheme(id);
      } catch (error) { console.warn("[Themes] preview frame error", error); }
    };
    const previewUrl = new URL(location.href);
    previewUrl.searchParams.set("themePreview", "1");
    previewUrl.hash = "";
    frame.src = previewUrl.href;
    setPreviewDevice("desktop");
    if (!dialog.open) dialog.showModal();
  }

  function openThemeCustomizer(id) {
    extendThemeCustomizer();
    const theme = findTheme(id);
    if (!theme) return;
    const form = document.querySelector("#themeCustomizerForm");
    const customization = getThemeCustomization(id);
    form.elements.themeId.value = id;
    form.elements.accent.value = customization.accent || theme.accent;
    form.elements.surface.value = customization.surface || theme.surface || "#ffffff";
    form.elements.ink.value = customization.ink || (theme.dark ? "#f8fafc" : "#20241f");
    form.elements.line.value = customization.line || (theme.dark ? "#3b4140" : "#dfe3da");
    form.elements.radius.value = customization.radius || theme.radius || "12px";
    form.elements.density.value = customization.density || theme.layout?.density || "comfortable";
    form.elements.columns.value = customization.columns || theme.layout?.columns || 3;
    form.elements.gap.value = customization.gap ?? theme.layout?.gap ?? 20;
    form.elements.width.value = customization.width || theme.layout?.width || 1320;
    form.elements.hero.value = customization.hero || theme.layout?.hero || 520;
    form.elements.font.value = customization.font || theme.font || '"IBM Plex Sans Arabic","DM Sans",sans-serif';
    form.elements.motion.checked = customization.motion !== false;
    form.elements.sidebar.checked = customization.sidebar !== false;
    const selectThemeDefault = (field, value) => { form.elements[field].value = [...form.elements[field].options].some(option => option.value === value) ? value : "theme"; };
    selectThemeDefault("headerStyle", customization.headerStyle || theme.layout?.header || "theme");
    selectThemeDefault("sidebarStyle", customization.sidebarStyle || theme.layout?.admin || "theme");
    selectThemeDefault("cardStyle", customization.cardStyle || theme.layout?.cards || "theme");
    selectThemeDefault("footerStyle", customization.footerStyle || "theme");
    selectThemeDefault("detailStyle", customization.detailStyle || theme.layout?.detail || "default");
    form.elements.backgroundUrl.value = customization.backgroundUrl || "";
    document.querySelector("#themeCustomizerTitle").textContent = theme.name;
    document.querySelector("#themeCustomizerDialog").showModal();
  }

  function previewTheme(id) {
    const theme = findTheme(id);
    if (!theme) return;
    const customization = getThemeCustomization(id);
    document.documentElement.setAttribute("data-theme", id);
    applyThemeLayout(id, theme, customization);
    if (theme.custom) injectCustomThemeAssets(theme, { ...(getCustomData(id) || {}), customization });
    else injectCustomThemeAssets(theme, { customization });
  }

  async function applyCustomizerForm(form) {
    const data = new FormData(form);
    const id = String(data.get("themeId"));
    const customization = {
      accent: String(data.get("accent")), surface: String(data.get("surface")),
      ink: String(data.get("ink")), line: String(data.get("line")),
      radius: String(data.get("radius")), density: String(data.get("density")),
      columns: Number(data.get("columns")), gap: Number(data.get("gap")),
      width: Number(data.get("width")), hero: Number(data.get("hero")),
      font: String(data.get("font")), motion: data.get("motion") === "on",
      sidebar: data.get("sidebar") === "on",
      headerStyle: String(data.get("headerStyle")), sidebarStyle: String(data.get("sidebarStyle")),
      cardStyle: String(data.get("cardStyle")), footerStyle: String(data.get("footerStyle")),
      detailStyle: String(data.get("detailStyle")),
      backgroundUrl: String(data.get("backgroundUrl") || "").trim()
    };
    const logoFile = data.get("logoFile");
    const backgroundFile = data.get("backgroundFile");
    const previous = getThemeCustomization(id);
    customization.logoKey = previous.logoKey || "";
    customization.backgroundKey = previous.backgroundKey || "";
    if (logoFile?.size && window.storeMedia) customization.logoKey = await window.storeMedia(logoFile);
    if (backgroundFile?.size && window.storeMedia) {
      customization.backgroundKey = await window.storeMedia(backgroundFile);
      customization.backgroundUrl = "";
    }
    saveThemeCustomization(id, customization);
    if (getActiveThemeId() === id) previewTheme(id);
    renderThemesGrid();
    document.querySelector("#themeCustomizerDialog").close();
    showToast("تم حفظ تخصيص هذا القالب", "ok");
  }

  function renderThemesGrid() {
    try {
      const grid = document.querySelector("#themesGrid");
      if (!grid) { console.warn("[Themes] #themesGrid element not found in the DOM"); return false; }
      updateThemesCountLabel();
      const activeId = getActiveThemeId();
      const theme = getActiveTheme();
      updateCurrentThemeCard(theme);
      const all = getAllThemes();
      grid.innerHTML = all.map(t => {
        const ink = t.dark ? "#fafaf9" : "#0f172a";
        const inkSoft = t.dark ? "#d6d3d1" : t.hero[1];
        const border = t.dark ? "#334155" : "#e5e7eb";
        const cardBg = t.dark ? t.surface : "#ffffff";
        const barBg = t.dark ? "rgba(21,18,15,0.85)" : "rgba(255,255,255,0.85)";
        const isCustom = !!t.custom;
        const customTag = isCustom ? `<span class="tag-custom">⬆ مخصص</span>` : ``;
        const customActions = isCustom ? `<div class="theme-actions"><button type="button" class="export-btn" data-export-custom="${t.id}">تصدير</button><button type="button" data-delete-custom="${t.id}">حذف</button></div>` : ``;
        const layout = t.layout || {};
        const filter = t.dark ? "dark" : /editorial|magazine|cover|riviera|archive|paper/.test(layout.site || "") ? "editorial" : /grid|mosaic|bento|architecture|sculpted/.test(layout.site || "") ? "grid" : /studio|agency|orange|aurora|object|horizon|kinetic/.test(layout.site || "") ? "studio" : "light";
        return `<article class="theme-card ${t.id === activeId ? "active" : ""} ${isCustom ? "custom" : ""}" data-theme-id="${t.id}" data-is-custom="${isCustom ? "1" : "0"}"
          data-theme-search="${(t.name + " " + t.desc + " " + t.style).toLocaleLowerCase("ar")}" data-theme-filter="${filter}"
          style="--theme-accent:${t.accent};--theme-accent-shadow:${t.accent}55;--theme-accent-glow:${t.accent}33;--theme-ink:${ink};--theme-ink-soft:${inkSoft};--theme-border:${border};--theme-card:${cardBg};--theme-bar-bg:${barBg};--theme-hero-a:${t.hero[0]};--theme-hero-b:${t.hero[1]};--theme-radius:${t.radius};--theme-radius-sm:${t.radius};--theme-surface:${t.surface || "#f4f5f0"};--theme-sidebar:${t.dark ? "#141918" : t.hero[0]};--theme-sidebar-line:${t.dark ? "#59615e" : "#66715f"};">
          ${customTag}<span class="theme-active-label">مفعّل</span>
          <div class="theme-preview" data-layout="${layout.site || "editorial"}">
            <div class="tp-bar"></div>
            <div class="tp-hero"></div>
            <div class="tp-sidebar"><i></i><i></i><i></i><i></i></div>
            <div class="tp-layout-grid"><i></i><i></i><i></i><i></i><i></i><i></i></div>
          </div>
          <div class="theme-body">
            <div class="theme-name">${t.name}</div>
            <div class="theme-desc">${t.desc}</div>
            <div class="theme-meta">
              <span class="theme-chip color" style="--theme-accent:${t.accent}"></span>
              <span class="theme-chip">${t.style}</span>
              <span class="theme-chip">${t.radius}</span>
            </div>
            <div class="theme-card-actions"><button class="theme-preview-btn" type="button" data-preview-theme="${t.id}">معاينة</button><button class="theme-switch-btn" type="button" data-apply-theme="${t.id}">${t.id === activeId ? "مفعّل" : "تفعيل"}</button><button class="theme-customize-btn" type="button" data-customize-theme="${t.id}">تخصيص</button></div>
            ${customActions}
          </div>
        </article>`;
      }).join("");

      grid.querySelectorAll("[data-apply-theme]").forEach(button => button.addEventListener("click", event => { event.stopPropagation(); applyTheme(button.dataset.applyTheme); }));
      grid.querySelectorAll("[data-preview-theme]").forEach(button => button.addEventListener("click", event => { event.stopPropagation(); showThemePreview(button.dataset.previewTheme); }));
      grid.querySelectorAll("[data-customize-theme]").forEach(button => button.addEventListener("click", event => { event.stopPropagation(); openThemeCustomizer(button.dataset.customizeTheme); }));

      grid.querySelectorAll("[data-delete-custom]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.getAttribute("data-delete-custom");
          if (!confirm(`هل تريد بالتأكيد حذف القالب المخصص "${id}"؟ لا يمكن الاسترجاع.`)) return;
          deleteCustomTheme(id);
        });
      });

      grid.querySelectorAll("[data-export-custom]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.getAttribute("data-export-custom");
          exportCustomThemeAsZip(id);
        });
      });
      filterThemes();
      return true;
    } catch (e) { console.error("[Themes] renderThemesGrid fatal error", e); return false; }
  }

  function extendThemeCustomizer() {
    const grid = document.querySelector("#themeCustomizerForm .theme-customizer-grid");
    if (!grid || grid.dataset.extended === "true") return;
    grid.dataset.extended = "true";
    grid.insertAdjacentHTML("beforeend", `<label>نمط الرأس<select name="headerStyle"><option value="theme">حسب القالب</option><option value="standard">قياسي</option><option value="centered">وسطي</option><option value="floating">عائم</option><option value="overlay">فوق الصورة</option><option value="utility">عملي</option></select></label><label>نمط لوحة الإدارة<select name="sidebarStyle"><option value="theme">حسب القالب</option><option value="rail">شريط جانبي</option><option value="topnav">قائمة علوية</option><option value="wide">واسع</option></select></label><label>نمط البطاقات<select name="cardStyle"><option value="theme">حسب القالب</option><option value="flat">مسطحة</option><option value="framed">مؤطرة</option><option value="raised">بارزة</option><option value="image">صور ممتدة</option></select></label><label>نمط التذييل<select name="footerStyle"><option value="theme">حسب القالب</option><option value="columns">أعمدة</option><option value="centered">وسطي</option><option value="minimal">مختصر</option></select></label><label>طريقة فتح الصور<select name="detailStyle"><option value="default">حسب القالب</option><option value="lightbox">Lightbox</option><option value="split">تقسيم جانبي</option><option value="side-panel">لوحة جانبية</option><option value="immersive">معرض غامر</option><option value="drawer">درج جانبي</option><option value="sheet">لوحة سفلية</option><option value="fullscreen">ملء الشاشة</option><option value="inline">مضمن</option><option value="stack">طبقات</option></select></label><label class="theme-customizer-wide">شعار خاص بالقالب<input name="logoFile" type="file" accept="image/*"></label><label class="theme-customizer-wide">خلفية مخصصة<input name="backgroundFile" type="file" accept="image/*"></label><label class="theme-customizer-wide">أو رابط صورة خلفية<input name="backgroundUrl" type="url" placeholder="https://..."></label>`);
  }

  function deleteCustomTheme(id) {
    try {
      const wasActive = getActiveThemeId() === id;
      CUSTOM_THEMES = CUSTOM_THEMES.filter(t => t.id !== id);
      saveCustomThemes();
      removeCustomData(id);
      if (wasActive) applyTheme(THEMES[0].id);
      renderThemesGrid();
      showToast("🗑 تم حذف القالب المخصص", "ok");
    } catch (e) { console.error(e); showToast("خطأ في الحذف", "err"); }
  }

  function exportCustomThemeAsZip(id) {
    try {
      const t = CUSTOM_THEMES.find(x => x.id === id);
      if (!t) { showToast("قالب غير موجود", "err"); return; }
      const data = getCustomData(id) || {};
      const manifest = {
        id: t.id, name: t.name, desc: t.desc, style: t.style,
        radius: t.radius, shadows: t.shadows, accent: t.accent,
        hero: t.hero, surface: t.surface || "#ffffff", dark: !!t.dark,
        tokens: data.tokens || {}, custom: true,
        exportedAt: new Date().toISOString(),
        app: "FOLVA Custom Theme",
        version: 1
      };
      if (typeof JSZip === "undefined") {
        const combined = { manifest, css: data.css || "", js: data.js || "" };
        const blob = new Blob([JSON.stringify(combined, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `folva-theme-${t.id}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast("تم تصدير القالب بصيغة JSON", "ok");
        return;
      }
      const zip = new JSZip();
      zip.file("theme.json", JSON.stringify(manifest, null, 2));
      if (data.css) zip.file("styles.css", data.css);
      if (data.js) zip.file("script.js", data.js);
      zip.generateAsync({ type: "blob" }).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `folva-theme-${t.id}.zip`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast("⤓ تم تصدير القالب بصيغة ZIP", "ok");
      }).catch(err => { console.error(err); showToast("فشل تصدير ZIP", "err"); });
    } catch (e) { console.error(e); showToast("خطأ في التصدير", "err"); }
  }

  function setProgress(pct, msg, kind) {
    const wrap = document.querySelector("#themeUploadProgress");
    const fill = document.querySelector("#tupFill");
    const txt = document.querySelector("#tupText");
    if (!wrap || !fill || !txt) return;
    if (pct < 0) { wrap.hidden = true; return; }
    wrap.hidden = false;
    fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
    txt.textContent = msg || "";
    txt.classList.remove("ok", "err");
    if (kind) txt.classList.add(kind);
  }

  async function handleThemeUpload(file) {
    try {
      setProgress(5, "جاري فك ضغط القالب…");
      if (!file) { showToast("لم يتم اختيار ملف", "err"); return; }
      if (file.size > 5 * 1024 * 1024) { showToast("حجم الملف كبير جدًا (الحد الأقصى 5 ميجابايت)", "err"); setProgress(-1); return; }
      if (typeof JSZip === "undefined") { showToast("مكتبة JSZip غير متاحة حالياً — تفقد الاتصال بالإنترنت", "err"); setProgress(-1); return; }
      const zip = await JSZip.loadAsync(file);
      setProgress(25, "جاري قراءة ملفات القالب…");

      let manifestStr = null;
      let cssStr = "";
      let jsStr = "";
      const files = Object.keys(zip.files);
      console.log("[Themes] ZIP contents:", files);

      function findFile(list, names) {
        for (const n of names) {
          const exact = list.find(f => f.toLowerCase() === n.toLowerCase() || f.toLowerCase().endsWith("/"+n.toLowerCase()));
          if (exact) return exact;
        }
        return null;
      }

      const manifestFile = findFile(files, ["theme.json", "manifest.json", "config.json"]);
      if (manifestFile) manifestStr = await zip.file(manifestFile).async("string");
      if (!manifestStr) {
        const jsonFiles = files.filter(f => f.toLowerCase().endsWith(".json"));
        if (jsonFiles.length) manifestStr = await zip.file(jsonFiles[0]).async("string");
      }
      setProgress(45, "جاري استخراج المحتوى…");
      if (!manifestStr) { showToast("الملف المضغوط يفتقر إلى ملف theme.json الإجباري", "err"); setProgress(-1); return; }

      let manifest;
      try { manifest = JSON.parse(manifestStr); }
      catch { showToast("ملف theme.json مُتالف أو غير صالح", "err"); setProgress(-1); return; }

      if (!manifest || !manifest.id || !manifest.name) { showToast("بيانات القالب الناقصة: id و name مطلوبان في theme.json", "err"); setProgress(-1); return; }

      const cssFile = findFile(files, ["styles.css", "style.css", "theme.css", "design.css"]);
      if (cssFile) cssStr = await zip.file(cssFile).async("string");
      else {
        const allCss = files.filter(f => f.toLowerCase().endsWith(".css"));
        for (const f of allCss) cssStr += (cssStr ? "\n" : "") + await zip.file(f).async("string");
      }

      const jsFile = findFile(files, ["script.js", "scripts.js", "theme.js", "app.js"]);
      if (jsFile) jsStr = await zip.file(jsFile).async("string");
      else {
        const allJs = files.filter(f => f.toLowerCase().endsWith(".js") && !f.toLowerCase().endsWith(".min.js") && !f.includes("jszip"));
        for (const f of allJs) jsStr += (jsStr ? "\n" : "") + await zip.file(f).async("string");
      }

      setProgress(75, "جاري حفظ القالب…");
      const id = String(manifest.id).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "custom_" + Date.now();
      const themeObj = {
        id: "custom_" + id,
        name: String(manifest.name || "قالب مخصص").slice(0, 40),
        desc: String(manifest.desc || "قالب مخصص رفعه المستخدم").slice(0, 120),
        style: String(manifest.style || "🎨 مخصص").slice(0, 20),
        radius: String(manifest.radius || "12px").slice(0, 12),
        shadows: String(manifest.shadows || "متوسطة").slice(0, 20),
        accent: String(manifest.accent || "#c8e84a").slice(0, 14),
        hero: Array.isArray(manifest.hero) && manifest.hero.length >= 2 ? manifest.hero.slice(0,2) : ["#1a1f17", "#2d3528"],
        surface: String(manifest.surface || "#ffffff").slice(0, 14),
        dark: !!manifest.dark,
        custom: true
      };
      const data = {
        tokens: manifest.tokens || {},
        css: cssStr,
        js: jsStr,
        importedAt: new Date().toISOString()
      };

      const existingIndex = CUSTOM_THEMES.findIndex(t => t.id === themeObj.id);
      if (existingIndex >= 0) CUSTOM_THEMES[existingIndex] = themeObj;
      else CUSTOM_THEMES.push(themeObj);
      saveCustomThemes();
      setCustomData(themeObj.id, data);

      setProgress(95, "جاري تطبيق القالب…");
      injectCustomThemeAssets(themeObj, data);
      renderThemesGrid();

      setProgress(100, `✔ تم رفع القالب بنجاح: ${themeObj.name}`, "ok");
      showToast(`🎉 تم رفع قالب "${themeObj.name}" وتطبيقه تلقائياً!`, "ok");
      applyTheme(themeObj.id);
      setTimeout(() => setProgress(-1), 2200);
    } catch (e) {
      console.error("[Themes] Upload fatal error:", e);
      showToast("فشل رفع القالب: " + (e.message || String(e)).slice(0, 60), "err");
      setProgress(-1);
    }
  }

  function init() {
    try {
      loadCustomThemes();
      injectCustomThemeAssets(null, null);

      const activeId = getActiveThemeId();
      document.documentElement.setAttribute("data-theme", activeId);
      const at = findTheme(activeId);
      if (at) applyThemeLayout(activeId, at);
      if (at && at.custom) {
        const d = getCustomData(activeId);
        injectCustomThemeAssets(at, d);
        runCustomThemeScript(at, d);
      }
      updateCurrentThemeCard(getActiveTheme());

      const initialRenderOk = renderThemesGrid();
      console.log("[Themes] Initial render:", initialRenderOk, "| Defaults:", THEMES.length, "| Custom:", CUSTOM_THEMES.length);

      const uploadInput = document.querySelector("#uploadThemeZip");
      if (uploadInput) {
        uploadInput.addEventListener("change", (e) => {
          const file = (e.target.files && e.target.files[0]) || null;
          if (file) handleThemeUpload(file);
          e.target.value = "";
        });
      }

      const exportBtn = document.querySelector("#exportTheme");
      if (exportBtn) {
        exportBtn.addEventListener("click", () => {
          try {
            const t = getActiveTheme();
            if (t.custom) { exportCustomThemeAsZip(t.id); return; }
            const data = {
              id: t.id, name: t.name, desc: t.desc, style: t.style,
              radius: t.radius, shadows: t.shadows, accent: t.accent,
              hero: t.hero, surface: t.surface, dark: !!t.dark,
              appliedAt: new Date().toISOString(), builtin: true
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "folva-theme-" + t.id + ".json";
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            showToast("⤓ تم تصدير بيانات القالب الحالي", "ok");
          } catch (e) { console.error("[Themes] export error", e); showToast("خطأ التصدير", "err"); }
        });
      }

      const resetBtn = document.querySelector("#resetThemeDefault");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => applyTheme(THEMES[0].id));
      }

      document.querySelector("#themeSearch")?.addEventListener("input", filterThemes);
      document.querySelector("#themeFilter")?.addEventListener("change", filterThemes);
      document.querySelector("#themeCustomizerForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        try { await applyCustomizerForm(event.currentTarget); }
        catch (error) { console.error("[Themes] customizer save error", error); showToast("تعذر حفظ التخصيص", "err"); }
      });
      document.querySelector("#applyPreviewTheme")?.addEventListener("click", event => {
        const id = event.currentTarget.dataset.applyTheme;
        document.querySelector("#themePreviewDialog")?.close();
        applyTheme(id);
      });
      document.querySelectorAll("[data-preview-device]").forEach(button => button.addEventListener("click", () => setPreviewDevice(button.dataset.previewDevice)));

      document.addEventListener("click", (e) => {
        const secBtn = e.target.closest("[data-section='themes']");
        if (secBtn) setTimeout(() => renderThemesGrid(), 60);
      }, true);

      const themesPanel = document.querySelector(".panel[data-panel='themes']");
      if (themesPanel && "MutationObserver" in window) {
        try {
          const obs = new MutationObserver((muts) => {
            muts.forEach(m => {
              if (m.attributeName === "class" && themesPanel.classList.contains("active")) {
                setTimeout(() => renderThemesGrid(), 40);
              }
            });
          });
          obs.observe(themesPanel, { attributes: true, attributeFilter: ["class"] });
        } catch (e) { console.warn("[Themes] observer error", e); }
      }

      setTimeout(() => { if (!document.querySelector("#themesGrid")?.children.length) renderThemesGrid(); }, 500);
      setTimeout(() => { if (!document.querySelector("#themesGrid")?.children.length) renderThemesGrid(); }, 1500);

      window._themesEngine = { THEMES, CUSTOM_THEMES, applyTheme, previewTheme, getActiveTheme, findTheme, renderThemesGrid, deleteCustomTheme, exportCustomThemeAsZip, handleThemeUpload };
    } catch (e) {
      console.error("[Themes] INIT FATAL", e);
    }
  }

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }
  } catch (e) {
    console.error("[Themes] startup error", e);
    setTimeout(init, 100);
  }
})();
