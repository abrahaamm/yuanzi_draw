(function () {
  'use strict';

  const LETTERS = ['P', 'O', 'W', 'E', 'R'];
  const NUMBERS = Array.from({ length: 48 }, (_, i) => i + 1);
  const THIRD_PRIZE_COUNT = 3;
  const SECOND_PRIZE_COUNT = 12;
  const FIRST_PRIZE_COUNT = 32;
  const FIRST_PRIZE_PAGE_SIZE = 16;

  const roundNames = {
    1: '第一轮 · 三等奖',
    2: '第二轮 · 二等奖',
    3: '第三轮 · 一等奖',
    4: '第四轮 · 特等奖'
  };

  const STORAGE_KEY = 'power_lottery_state_v2';
  const CMD_KEY     = 'student_lottery_cmd';

  const state = {
    currentRound: 1,
    thirdPrizeLetters: [],
    secondPrizeNumbers: [],
    firstPrizeTickets: [],
    firstPrizeSupplement: [],
    firstPrizeAbsent: [],
    specialPrizeTicket: null,
    specialPrizeSupplement: []
  };

  const els = {
    roundName: document.getElementById('roundName'),
    sections: [
      document.getElementById('round1Section'),
      document.getElementById('round2Section'),
      document.getElementById('round3Section'),
      document.getElementById('round4Section')
    ],
    round1Result: document.getElementById('round1Result'),
    round2Grid: document.getElementById('round2Grid'),
    round3Result: document.getElementById('round3Result'),
    round4Result: document.getElementById('round4Result'),
    focusTickets: document.getElementById('focusTickets'),
    draw1: document.getElementById('drawRound1'),
    draw2: document.getElementById('drawRound2'),
    draw3: document.getElementById('drawRound3'),
    draw4: document.getElementById('drawRound4'),
    screenSwitchPanel: document.getElementById('screenSwitchPanel'),
    screenCurrent: document.getElementById('screenCurrent'),
    showPage1: document.getElementById('btnShowPage1'),
    showPage2: document.getElementById('btnShowPage2'),
    supplementPanel: document.getElementById('supplementPanel'),
    supplementPoolCount: document.getElementById('supplementPoolCount'),
    btnSupplement: document.getElementById('btnSupplement'),
    supplementHistory: document.getElementById('supplementHistory'),
    specialSupplementPanel: document.getElementById('specialSupplementPanel'),
    specialSupplementPoolCount: document.getElementById('specialSupplementPoolCount'),
    btnSpecialSupplement: document.getElementById('btnSpecialSupplement'),
    specialSupplementHistory: document.getElementById('specialSupplementHistory')
  };

  let screenWindow = null;
  let currentDisplayPage = 1;
  let firstPrizeAnimatedPages = new Set(); // 记录已播放过动画的屏（避免重复播）

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function setRound(round) {
    state.currentRound = round;
    els.roundName.textContent = roundNames[round] || '—';
    els.sections.forEach((section, index) => {
      section.classList.remove('active', 'inactive');
      if (index + 1 === round) section.classList.add('active');
      else section.classList.add('inactive');
    });
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function postToScreen(payload) {
    // 发给弹窗（popup 模式）
    if (screenWindow && !screenWindow.closed) {
      try { screenWindow.postMessage({ type: 'student_lottery', ...payload }, '*'); } catch (_) {}
    }
    // 同时写入命令 key，大屏在独立标签页时也能收到动画指令
    try {
      localStorage.setItem(CMD_KEY, JSON.stringify({ type: 'student_lottery', ...payload, _ts: Date.now() }));
    } catch (_) {}
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function toggleButtons(isDrawing) {
    els.draw1.disabled = isDrawing || state.thirdPrizeLetters.length >= THIRD_PRIZE_COUNT;
    els.draw2.disabled = isDrawing || state.secondPrizeNumbers.length > 0;
    els.draw3.disabled = isDrawing || state.firstPrizeTickets.length > 0;
    els.draw4.disabled = isDrawing || !!state.specialPrizeTicket;
  }

  function updateThirdPrizeButton() {
    const done = state.thirdPrizeLetters.length;
    if (done >= THIRD_PRIZE_COUNT) {
      els.draw1.textContent = '三等奖已完成';
      els.draw1.disabled = true;
    } else {
      els.draw1.textContent = `抽第 ${done + 1} 个字母（共 ${THIRD_PRIZE_COUNT} 个）`;
      els.draw1.disabled = false;
    }
  }

  function renderThirdPrize() {
    els.round1Result.innerHTML = state.thirdPrizeLetters
      .map((letter) => `<span class="result-letter-badge">${letter}</span>`)
      .join('');
  }

  function renderSecondPrize() {
    const chosen = state.secondPrizeNumbers;
    els.round2Grid.innerHTML = '';
    for (let i = 0; i < SECOND_PRIZE_COUNT; i++) {
      const item = document.createElement('div');
      item.className = 'grid-cell';
      item.textContent = chosen[i] ? String(chosen[i]) : '—';
      if (chosen[i]) item.classList.add('filled');
      els.round2Grid.appendChild(item);
    }
  }

  function getFirstPrizePages() {
    const page1 = state.firstPrizeTickets.slice(0, FIRST_PRIZE_PAGE_SIZE);
    const page2 = state.firstPrizeTickets.slice(FIRST_PRIZE_PAGE_SIZE, FIRST_PRIZE_COUNT);
    return { page1, page2 };
  }

  function renderFirstPrize(page = 1) {
    const { page1, page2 } = getFirstPrizePages();
    const tickets = page === 1 ? page1 : page2;
    const absentSet = new Set(state.firstPrizeAbsent);
    els.round3Result.innerHTML = tickets
      .map((t) => {
        const absent = absentSet.has(t);
        return `<button class="ticket-badge${absent ? ' absent' : ''}" data-ticket="${t}" title="${absent ? '已标记缺席，再次点击取消' : '点击标记缺席'}">${t}</button>`;
      })
      .join('');
  }

  function renderFocusPanel() {
    const absentSet = new Set(state.firstPrizeAbsent);
    els.focusTickets.innerHTML = state.firstPrizeTickets
      .map((t) => {
        const absent = absentSet.has(t);
        return `<button class="focus-ticket${absent ? ' absent' : ''}" data-ticket="${t}">${t}</button>`;
      })
      .join('');
  }

  function renderSpecialPrize() {
    els.round4Result.innerHTML = state.specialPrizeTicket
      ? `<span class="special-badge">${state.specialPrizeTicket}</span>`
      : '';
  }

  function updateScreenSwitchPanel(page) {
    const ready = state.firstPrizeTickets.length === FIRST_PRIZE_COUNT;
    els.screenSwitchPanel.style.display = ready ? '' : 'none';
    if (!ready) return;
    if (page !== undefined) currentDisplayPage = page;
    els.screenCurrent.textContent = `第 ${currentDisplayPage} 屏`;
    els.showPage1.classList.toggle('active', currentDisplayPage === 1);
    els.showPage2.classList.toggle('active', currentDisplayPage === 2);
  }

  async function drawThirdPrize() {
    const alreadyDone = state.thirdPrizeLetters.length;
    if (alreadyDone >= THIRD_PRIZE_COUNT) return;

    toggleButtons(true);

    const picked = [...state.thirdPrizeLetters];
    const remaining = shuffle(LETTERS.filter((l) => !picked.includes(l)));
    const newLetter = remaining[0];
    const round = alreadyDone + 1;

    // 本轮旋转：已定字母常亮，剩余字母循环闪烁
    postToScreen({ action: 'third:spinRound', round, picked });
    await delay(randomInt(2200, 3200));

    const newPicks = [...picked, newLetter];
    postToScreen({ action: 'third:pick', letter: newLetter, picks: newPicks });
    state.thirdPrizeLetters = newPicks;
    els.round1Result.innerHTML = newPicks
      .map((l) => `<span class="result-letter-badge">${l}</span>`)
      .join('');

    if (newPicks.length >= THIRD_PRIZE_COUNT) {
      persist();
      postToScreen({ action: 'third:complete', letters: newPicks });
    } else {
      persist();
    }

    updateThirdPrizeButton();
    toggleButtons(false);
  }

  async function drawSecondPrize() {
    if (state.secondPrizeNumbers.length > 0) return;
    toggleButtons(true);
    els.round2Grid.innerHTML = '';

    const winners = shuffle(NUMBERS).slice(0, SECOND_PRIZE_COUNT).sort((a, b) => a - b);
    const spinDuration = randomInt(3600, 5600);

    postToScreen({
      action: 'second:start',
      spinDuration,
      winners
    });

    await delay(spinDuration + 1200);
    state.secondPrizeNumbers = winners;
    renderSecondPrize();
    persist();
    postToScreen({ action: 'second:complete', numbers: winners });
    toggleButtons(false);
  }

  function buildFirstPrizePool() {
    const blocked = new Set(state.secondPrizeNumbers);
    const tickets = [];
    for (const letter of LETTERS) {
      for (const num of NUMBERS) {
        if (!blocked.has(num)) tickets.push(`${letter}${num}`);
      }
    }
    return tickets;
  }

  function buildSupplementPool() {
    const excludedTickets = new Set([
      ...state.firstPrizeTickets,
      ...state.firstPrizeSupplement
    ]);
    const blockedNums = new Set(state.secondPrizeNumbers);
    const tickets = [];
    for (const letter of LETTERS) {
      for (const num of NUMBERS) {
        const ticket = `${letter}${num}`;
        if (blockedNums.has(num)) continue;
        if (excludedTickets.has(ticket)) continue;
        tickets.push(ticket);
      }
    }
    return tickets;
  }

  function updateSupplementPanel() {
    if (state.firstPrizeTickets.length !== FIRST_PRIZE_COUNT) {
      els.supplementPanel.style.display = 'none';
      return;
    }
    els.supplementPanel.style.display = '';
    const pool = buildSupplementPool();
    els.supplementPoolCount.textContent = `剩余可抽：${pool.length} 张`;
    els.btnSupplement.disabled = pool.length === 0;
    els.supplementHistory.innerHTML = state.firstPrizeSupplement.length === 0
      ? '<span class="supplement-empty">暂无补抽记录</span>'
      : state.firstPrizeSupplement.map((t, i) =>
          `<span class="supplement-badge" title="第 ${i + 1} 次补抽">${t}</span>`
        ).join('');
  }

  function drawSupplementSingle() {
    const pool = buildSupplementPool();
    if (pool.length === 0) {
      alert('补抽票池已用尽，无可补抽号码。');
      return;
    }
    const ticket = pool[Math.floor(Math.random() * pool.length)];
    state.firstPrizeSupplement.push(ticket);
    persist();
    updateSupplementPanel();
    postToScreen({ action: 'first:supplement', ticket });
  }

  async function drawFirstPrize() {
    if (state.firstPrizeTickets.length > 0) return;
    if (state.secondPrizeNumbers.length !== SECOND_PRIZE_COUNT) {
      alert('请先完成二等奖抽取。');
      return;
    }

    toggleButtons(true);
    const pool = buildFirstPrizePool();
    if (pool.length < FIRST_PRIZE_COUNT) {
      alert('一等奖可抽奖池不足。');
      toggleButtons(false);
      return;
    }

    const winners = shuffle(pool).slice(0, FIRST_PRIZE_COUNT);
    state.firstPrizeTickets = winners;
    firstPrizeAnimatedPages = new Set([1]); // first:start 会播放第 1 屏动画
    renderFirstPrize(1);
    renderFocusPanel();
    updateScreenSwitchPanel(1);
    updateSupplementPanel();
    persist();

    postToScreen({ action: 'first:start', tickets: winners });
    await delay(3000);
    toggleButtons(false);
  }

  function drawSpecialPrize() {
    if (state.specialPrizeTicket) return;
    const secondExcluded = new Set(state.secondPrizeNumbers);
    const firstExcluded = new Set(state.firstPrizeTickets);
    const pool = [];
    for (const letter of LETTERS) {
      for (const num of NUMBERS) {
        const ticket = `${letter}${num}`;
        if (secondExcluded.has(num)) continue;
        if (firstExcluded.has(ticket)) continue;
        pool.push(ticket);
      }
    }

    if (pool.length === 0) {
      alert('特等奖可抽奖池为空。');
      return;
    }

    const winner = pool[Math.floor(Math.random() * pool.length)];
    state.specialPrizeTicket = winner;
    renderSpecialPrize();
    persist();
    postToScreen({ action: 'special:show', ticket: winner });
    updateSpecialSupplementPanel();
    toggleButtons(false);
  }

  function buildSpecialSupplementPool() {
    const blockedNums = new Set(state.secondPrizeNumbers);
    const excludedTickets = new Set([
      ...state.firstPrizeTickets,
      ...state.firstPrizeSupplement,
      state.specialPrizeTicket,
      ...state.specialPrizeSupplement
    ].filter(Boolean));
    const tickets = [];
    for (const letter of LETTERS) {
      for (const num of NUMBERS) {
        const ticket = `${letter}${num}`;
        if (blockedNums.has(num)) continue;
        if (excludedTickets.has(ticket)) continue;
        tickets.push(ticket);
      }
    }
    return tickets;
  }

  function updateSpecialSupplementPanel() {
    if (!state.specialPrizeTicket) {
      els.specialSupplementPanel.style.display = 'none';
      return;
    }
    els.specialSupplementPanel.style.display = '';
    const pool = buildSpecialSupplementPool();
    els.specialSupplementPoolCount.textContent = `剩余可抽：${pool.length} 张`;
    els.btnSpecialSupplement.disabled = pool.length === 0;
    els.specialSupplementHistory.innerHTML = state.specialPrizeSupplement.length === 0
      ? '<span class="supplement-empty">暂无补抽记录</span>'
      : state.specialPrizeSupplement.map((t, i) =>
          `<span class="supplement-badge" title="第 ${i + 1} 次补抽">${t}</span>`
        ).join('');
  }

  function drawSpecialSupplement() {
    const pool = buildSpecialSupplementPool();
    if (pool.length === 0) {
      alert('特等奖补抽票池已用尽。');
      return;
    }
    const ticket = pool[Math.floor(Math.random() * pool.length)];
    state.specialPrizeSupplement.push(ticket);
    persist();
    updateSpecialSupplementPanel();
    postToScreen({ action: 'special:show', ticket });
  }

  function renderFromState() {
    renderThirdPrize();
    renderSecondPrize();
    renderSpecialPrize();
    updateThirdPrizeButton();
    updateScreenSwitchPanel();
    if (state.firstPrizeTickets.length > 0) {
      renderFirstPrize(1);
      renderFocusPanel();
    }
    updateSupplementPanel();
    updateSpecialSupplementPanel();
  }

  function reset() {
    state.currentRound = 1;
    state.thirdPrizeLetters = [];
    state.secondPrizeNumbers = [];
    state.firstPrizeTickets = [];
    state.firstPrizeSupplement = [];
    state.firstPrizeAbsent = [];
    state.specialPrizeTicket = null;
    state.specialPrizeSupplement = [];
    currentDisplayPage = 1;
    firstPrizeAnimatedPages = new Set();
    persist();
    els.round1Result.innerHTML = '';
    els.round2Grid.innerHTML = '';
    els.round3Result.innerHTML = '';
    els.round4Result.innerHTML = '';
    els.focusTickets.innerHTML = '';
    renderSecondPrize();
    setRound(1);
    updateThirdPrizeButton();
    updateScreenSwitchPanel();
    updateSupplementPanel();
    updateSpecialSupplementPanel();
    postToScreen({ action: 'reset' });
    toggleButtons(false);
  }

  function restoreFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      state.currentRound = Number(saved.currentRound) || 1;
      state.thirdPrizeLetters = Array.isArray(saved.thirdPrizeLetters) ? saved.thirdPrizeLetters : [];
      state.secondPrizeNumbers = Array.isArray(saved.secondPrizeNumbers) ? saved.secondPrizeNumbers : [];
      state.firstPrizeTickets = Array.isArray(saved.firstPrizeTickets) ? saved.firstPrizeTickets : [];
      state.firstPrizeSupplement = Array.isArray(saved.firstPrizeSupplement) ? saved.firstPrizeSupplement : [];
      state.firstPrizeAbsent = Array.isArray(saved.firstPrizeAbsent) ? saved.firstPrizeAbsent : [];
      state.specialPrizeTicket = saved.specialPrizeTicket || null;
      state.specialPrizeSupplement = Array.isArray(saved.specialPrizeSupplement) ? saved.specialPrizeSupplement : [];
    } catch (_) {
      // Ignore malformed cache and start fresh.
    }
  }

  function handleFocusClick(event) {
    const target = event.target.closest('[data-ticket]');
    if (!target) return;
    const ticket = target.dataset.ticket;
    if (!ticket) return;
    postToScreen({ action: 'first:focus', ticket });
  }

  function handleAbsentClick(event) {
    const target = event.target.closest('[data-ticket]');
    if (!target) return;
    const ticket = target.dataset.ticket;
    if (!ticket) return;
    const idx = state.firstPrizeAbsent.indexOf(ticket);
    const nowAbsent = idx === -1;
    if (nowAbsent) state.firstPrizeAbsent.push(ticket);
    else state.firstPrizeAbsent.splice(idx, 1);
    persist();
    renderFirstPrize(currentDisplayPage || 1);
    renderFocusPanel();
    postToScreen({ action: 'first:setAbsent', ticket, absent: nowAbsent });
  }

  function restoreRoundOnScreen(round) {
    switch (round) {
      case 1:
        if (state.thirdPrizeLetters.length > 0)
          postToScreen({ action: 'third:complete', letters: state.thirdPrizeLetters });
        else
          postToScreen({ action: 'bg:show', round: 1 });
        break;
      case 2:
        if (state.secondPrizeNumbers.length > 0)
          postToScreen({ action: 'second:complete', numbers: state.secondPrizeNumbers });
        else
          postToScreen({ action: 'bg:show', round: 2 });
        break;
      case 3:
        if (state.firstPrizeTickets.length === FIRST_PRIZE_COUNT) {
          const page = currentDisplayPage || 1;
          const slice = page === 1 ? state.firstPrizeTickets.slice(0, 16) : state.firstPrizeTickets.slice(16);
          postToScreen({ action: 'first:showPage', page, tickets: slice, absent: state.firstPrizeAbsent });
        } else {
          postToScreen({ action: 'bg:show', round: 3 });
        }
        break;
      case 4:
        if (state.specialPrizeTicket)
          postToScreen({ action: 'special:static', ticket: state.specialPrizeTicket });
        else
          postToScreen({ action: 'bg:show', round: 4 });
        break;
    }
  }

  function bindEvents() {
    document.getElementById('drawRound1').addEventListener('click', drawThirdPrize);
    document.getElementById('drawRound2').addEventListener('click', drawSecondPrize);
    document.getElementById('drawRound3').addEventListener('click', drawFirstPrize);
    document.getElementById('drawRound4').addEventListener('click', drawSpecialPrize);
    document.getElementById('btnPrevRound').addEventListener('click', function () {
      if (state.currentRound > 1) {
        const prev = state.currentRound - 1;
        setRound(prev);
        restoreRoundOnScreen(prev);
      }
    });
    document.getElementById('btnNextRound').addEventListener('click', function () {
      if (state.currentRound < 4) {
        const next = state.currentRound + 1;
        setRound(next);
        restoreRoundOnScreen(next);
      }
    });
    document.getElementById('btnReset').addEventListener('click', reset);
    document.getElementById('btnOpenScreen').addEventListener('click', function () {
      if (screenWindow && !screenWindow.closed) {
        screenWindow.focus();
        return;
      }
      screenWindow = window.open('screen.html', 'student_lottery_screen', 'width=1280,height=760,scrollbars=yes');
    });

    els.showPage1.addEventListener('click', function () {
      if (state.firstPrizeTickets.length !== FIRST_PRIZE_COUNT) return;
      renderFirstPrize(1);
      updateScreenSwitchPanel(1);
      const animate = !firstPrizeAnimatedPages.has(1);
      firstPrizeAnimatedPages.add(1);
      postToScreen({ action: 'first:showPage', page: 1, tickets: state.firstPrizeTickets.slice(0, 16), absent: state.firstPrizeAbsent, animate });
    });
    els.showPage2.addEventListener('click', function () {
      if (state.firstPrizeTickets.length !== FIRST_PRIZE_COUNT) return;
      renderFirstPrize(2);
      updateScreenSwitchPanel(2);
      const animate = !firstPrizeAnimatedPages.has(2);
      firstPrizeAnimatedPages.add(2);
      postToScreen({ action: 'first:showPage', page: 2, tickets: state.firstPrizeTickets.slice(16), absent: state.firstPrizeAbsent, animate });
    });

    els.focusTickets.addEventListener('click', handleFocusClick);
    els.round3Result.addEventListener('click', handleAbsentClick);
    els.btnSupplement.addEventListener('click', drawSupplementSingle);
    els.btnSpecialSupplement.addEventListener('click', drawSpecialSupplement);

    window.addEventListener('message', function (e) {
      if (!(e.data && e.data.type === 'student_lottery_ready')) return;
      if (!screenWindow || e.source !== screenWindow) return;
      postToScreen({ action: 'syncState', state });
    });
  }

  function init() {
    restoreFromStorage();
    renderFromState();
    setRound(state.currentRound);
    bindEvents();
    persist();
    toggleButtons(false);
  }

  init();
})();
