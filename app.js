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
  let thirdRolling = false;
  let secondRolling = false;
  let specialRolling = false;
  let specialLetterStopped = false;
  let specialRollingLetter = null;
  let specialRollingNumber = null;

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
    start1: document.getElementById('startRound1'),
    stop1: document.getElementById('stopRound1'),
    start2: document.getElementById('startRound2'),
    stop2: document.getElementById('stopRound2'),
    draw3: document.getElementById('drawRound3'),
    start4: document.getElementById('startRound4'),
    stop4Letter: document.getElementById('stopLetterRound4'),
    stop4Number: document.getElementById('stopNumberRound4'),
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

  function updateThirdPrizeButtons(globalLock) {
    const done = state.thirdPrizeLetters.length >= THIRD_PRIZE_COUNT;
    els.start1.disabled = !!globalLock || done || thirdRolling;
    els.stop1.disabled = !!globalLock || done || !thirdRolling;
    if (done) {
      els.start1.textContent = '三等奖已完成';
    } else if (thirdRolling) {
      els.start1.textContent = '滚动中...';
    } else {
      const step = state.thirdPrizeLetters.length + 1;
      els.start1.textContent = `开始第 ${step} 抽`;
    }
  }

  function updateSecondPrizeButtons(globalLock) {
    const done = state.secondPrizeNumbers.length > 0;
    els.start2.disabled = !!globalLock || done || secondRolling;
    els.stop2.disabled = !!globalLock || done || !secondRolling;
    if (done) {
      els.start2.textContent = '二等奖已完成';
    } else {
      els.start2.textContent = secondRolling ? '滚动中...' : '开始滚动';
    }
  }

  function updateSpecialPrizeButtons(globalLock) {
    const done = !!state.specialPrizeTicket;
    els.start4.disabled = !!globalLock || done || specialRolling;
    els.stop4Letter.disabled = !!globalLock || done || !specialRolling || specialLetterStopped;
    els.stop4Number.disabled = !!globalLock || done || !specialRolling || !specialLetterStopped;
    if (done) {
      els.start4.textContent = '特等奖已完成';
    } else if (specialRolling) {
      els.start4.textContent = '滚动中...';
    } else {
      els.start4.textContent = '开始滚动';
    }
  }

  function updateControlButtons(globalLock) {
    els.draw3.disabled = !!globalLock || state.firstPrizeTickets.length > 0;
    updateThirdPrizeButtons(globalLock);
    updateSecondPrizeButtons(globalLock);
    updateSpecialPrizeButtons(globalLock);
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

  function startThirdPrizeRolling() {
    if (thirdRolling || state.thirdPrizeLetters.length >= THIRD_PRIZE_COUNT) return;
    thirdRolling = true;
    const round = state.thirdPrizeLetters.length + 1;
    postToScreen({ action: 'third:spinRound', round, picked: [...state.thirdPrizeLetters] });
    updateControlButtons(false);
  }

  function stopThirdPrizeRolling() {
    if (!thirdRolling) return;
    const picked = [...state.thirdPrizeLetters];
    const remaining = LETTERS.filter((l) => !picked.includes(l));
    if (remaining.length === 0) {
      thirdRolling = false;
      updateControlButtons(false);
      return;
    }
    const letter = remaining[Math.floor(Math.random() * remaining.length)];
    const newPicks = [...picked, letter];
    thirdRolling = false;
    state.thirdPrizeLetters = newPicks;
    renderThirdPrize();
    persist();
    postToScreen({ action: 'third:pick', letter, picks: newPicks });
    if (newPicks.length >= THIRD_PRIZE_COUNT) {
      postToScreen({ action: 'third:complete', letters: newPicks });
    }
    updateControlButtons(false);
  }

  function startSecondPrizeRolling() {
    if (secondRolling || state.secondPrizeNumbers.length > 0) return;
    secondRolling = true;
    els.round2Grid.innerHTML = '';
    renderSecondPrize();
    postToScreen({ action: 'second:startManual' });
    updateControlButtons(false);
  }

  function stopSecondPrizeRolling() {
    if (!secondRolling) return;
    secondRolling = false;
    const winners = shuffle(NUMBERS).slice(0, SECOND_PRIZE_COUNT).sort((a, b) => a - b);
    state.secondPrizeNumbers = winners;
    renderSecondPrize();
    persist();
    postToScreen({ action: 'second:complete', numbers: winners });
    updateControlButtons(false);
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

    updateControlButtons(true);
    const pool = buildFirstPrizePool();
    if (pool.length < FIRST_PRIZE_COUNT) {
      alert('一等奖可抽奖池不足。');
      updateControlButtons(false);
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
    updateControlButtons(false);
  }

  function getSpecialAvailableMap() {
    const blockedNums = new Set(state.secondPrizeNumbers);
    const excludedTickets = new Set([
      ...state.firstPrizeTickets,
      ...state.firstPrizeSupplement,
      state.specialPrizeTicket,
      ...state.specialPrizeSupplement
    ].filter(Boolean));
    const map = {};
    for (const letter of LETTERS) {
      map[letter] = [];
      for (const num of NUMBERS) {
        const ticket = `${letter}${num}`;
        if (blockedNums.has(num)) continue;
        if (excludedTickets.has(ticket)) continue;
        map[letter].push(num);
      }
    }
    return map;
  }

  function startSpecialRolling() {
    if (state.specialPrizeTicket || specialRolling) return;
    const map = getSpecialAvailableMap();
    const letters = LETTERS.filter((l) => map[l].length > 0);
    if (letters.length === 0) {
      alert('特等奖可抽奖池为空。');
      return;
    }
    specialRolling = true;
    specialLetterStopped = false;
    specialRollingLetter = null;
    specialRollingNumber = null;
    postToScreen({ action: 'special:start' });
    updateControlButtons(false);
  }

  function stopSpecialLetter() {
    if (!specialRolling || specialLetterStopped) return;
    const map = getSpecialAvailableMap();
    const letters = LETTERS.filter((l) => map[l].length > 0);
    if (letters.length === 0) {
      alert('特等奖可抽奖池为空。');
      return;
    }
    specialRollingLetter = letters[Math.floor(Math.random() * letters.length)];
    specialLetterStopped = true;
    postToScreen({ action: 'special:stopLetter', letter: specialRollingLetter });
    updateControlButtons(false);
  }

  function stopSpecialNumber() {
    if (!specialRolling || !specialLetterStopped || !specialRollingLetter) return;
    const map = getSpecialAvailableMap();
    const nums = map[specialRollingLetter] || [];
    if (nums.length === 0) {
      alert('当前字母已无可用号码，请重新开始特等奖。');
      specialRolling = false;
      specialLetterStopped = false;
      specialRollingLetter = null;
      postToScreen({ action: 'special:cancel' });
      updateControlButtons(false);
      return;
    }
    specialRollingNumber = nums[Math.floor(Math.random() * nums.length)];
    const ticket = `${specialRollingLetter}${specialRollingNumber}`;
    specialRolling = false;
    specialLetterStopped = false;
    state.specialPrizeTicket = ticket;
    renderSpecialPrize();
    persist();
    postToScreen({ action: 'special:stopNumber', number: specialRollingNumber, ticket });
    updateSpecialSupplementPanel();
    updateControlButtons(false);
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
    thirdRolling = false;
    secondRolling = false;
    specialRolling = false;
    specialLetterStopped = false;
    specialRollingLetter = null;
    specialRollingNumber = null;
    updateScreenSwitchPanel();
    if (state.firstPrizeTickets.length > 0) {
      renderFirstPrize(1);
      renderFocusPanel();
    }
    updateSupplementPanel();
    updateSpecialSupplementPanel();
    updateControlButtons(false);
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
    thirdRolling = false;
    secondRolling = false;
    specialRolling = false;
    specialLetterStopped = false;
    specialRollingLetter = null;
    specialRollingNumber = null;
    persist();
    els.round1Result.innerHTML = '';
    els.round2Grid.innerHTML = '';
    els.round3Result.innerHTML = '';
    els.round4Result.innerHTML = '';
    els.focusTickets.innerHTML = '';
    renderSecondPrize();
    setRound(1);
    updateScreenSwitchPanel();
    updateSupplementPanel();
    updateSpecialSupplementPanel();
    postToScreen({ action: 'reset' });
    updateControlButtons(false);
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
    document.getElementById('startRound1').addEventListener('click', startThirdPrizeRolling);
    document.getElementById('stopRound1').addEventListener('click', stopThirdPrizeRolling);
    document.getElementById('startRound2').addEventListener('click', startSecondPrizeRolling);
    document.getElementById('stopRound2').addEventListener('click', stopSecondPrizeRolling);
    document.getElementById('drawRound3').addEventListener('click', drawFirstPrize);
    document.getElementById('startRound4').addEventListener('click', startSpecialRolling);
    document.getElementById('stopLetterRound4').addEventListener('click', stopSpecialLetter);
    document.getElementById('stopNumberRound4').addEventListener('click', stopSpecialNumber);
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
    updateControlButtons(false);
  }

  init();
})();
