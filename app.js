(function () {
  const packs = Array.isArray(window.QUIZ_PACKS) ? window.QUIZ_PACKS : [];
  const dailyTarget = 20;
  const letters = ["A", "B", "C", "D", "E", "F"];

  const elements = {
    subjectMenu: document.querySelector("#subjectMenu"),
    subjectCards: document.querySelector("#subjectCards"),
    subjectMenuButton: document.querySelector("#subjectMenuButton"),
    quizWorkspace: document.querySelector("#quizWorkspace"),
    questionTitle: document.querySelector("#questionTitle"),
    currentNumber: document.querySelector("#currentNumber"),
    totalNumber: document.querySelector("#totalNumber"),
    progressFill: document.querySelector("#progressFill"),
    questionExtras: document.querySelector("#questionExtras"),
    answers: document.querySelector("#answers"),
    prevButton: document.querySelector("#prevButton"),
    nextButton: document.querySelector("#nextButton"),
    modeButtons: document.querySelector("#modeButtons"),
    shuffleQuestions: document.querySelector("#shuffleQuestions"),
    shuffleAnswers: document.querySelector("#shuffleAnswers"),
    attemptedStat: document.querySelector("#attemptedStat"),
    accuracyStat: document.querySelector("#accuracyStat"),
    masteredStat: document.querySelector("#masteredStat"),
    todayStat: document.querySelector("#todayStat"),
    questionMap: document.querySelector("#questionMap"),
    resetButton: document.querySelector("#resetButton"),
    resetModal: document.querySelector("#resetModal"),
    cancelResetButton: document.querySelector("#cancelResetButton"),
    confirmResetButton: document.querySelector("#confirmResetButton"),
  };

  const state = {
    packId: "",
    started: false,
    mode: "all",
    queue: [],
    cursor: 0,
    emptyFilter: false,
    answered: false,
    selectedOriginalIndex: null,
    selectedOriginalIndexes: [],
    optionOrders: new Map(),
    progress: {},
  };

  function storageKey(packId) {
    return `grile-progress:v1:${packId}`;
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function defaultProgress() {
    return {
      byQuestion: {},
      daily: {},
    };
  }

  function loadProgress(packId) {
    try {
      const saved = localStorage.getItem(storageKey(packId));
      return saved ? { ...defaultProgress(), ...JSON.parse(saved) } : defaultProgress();
    } catch {
      return defaultProgress();
    }
  }

  function saveProgress() {
    localStorage.setItem(storageKey(state.packId), JSON.stringify(state.progress));
  }

  function currentPack() {
    return packs.find((pack) => pack.id === state.packId) || null;
  }

  function currentQuestion() {
    const pack = currentPack();
    if (!pack || !state.queue.length) {
      return null;
    }
    return pack.questions[state.queue[state.cursor]] || null;
  }

  function correctIndexes(question) {
    if (Array.isArray(question.answerIndexes)) {
      return question.answerIndexes;
    }
    if (Number.isInteger(question.answerIndex)) {
      return [question.answerIndex];
    }
    return [];
  }

  function isMultiAnswer(question) {
    return correctIndexes(question).length > 1;
  }

  function sameSelection(left, right) {
    if (left.length !== right.length) {
      return false;
    }
    const rightSet = new Set(right);
    return left.every((item) => rightSet.has(item));
  }

  function questionStats(questionId) {
    const id = String(questionId);
    if (!state.progress.byQuestion[id]) {
      state.progress.byQuestion[id] = {
        attempts: 0,
        correct: 0,
        wrong: 0,
        streak: 0,
        lastCorrect: false,
      };
    }
    return state.progress.byQuestion[id];
  }

  function existingStats(questionId) {
    return state.progress.byQuestion[String(questionId)] || null;
  }

  function questionAccuracy(stats) {
    if (!stats || !stats.attempts) {
      return 0;
    }
    return (stats.correct || 0) / stats.attempts;
  }

  function isMastered(question) {
    const stats = existingStats(question.id);
    if (!stats) {
      return false;
    }
    const accuracy = questionAccuracy(stats);
    return stats.streak >= 2 && stats.correct >= 2 && (accuracy >= 0.66 || stats.streak >= 3);
  }

  function answeredCorrect(question) {
    const stats = existingStats(question.id);
    return Boolean(stats && stats.lastCorrect);
  }

  function needsFocus(question) {
    const stats = existingStats(question.id);
    if (!stats || !stats.attempts) {
      return true;
    }
    const accuracy = questionAccuracy(stats);
    return (
      stats.lastCorrect === false ||
      stats.streak < 2 ||
      (stats.attempts >= 3 && accuracy < 0.66) ||
      (stats.wrong >= 2 && accuracy < 0.8 && stats.streak < 3)
    );
  }

  function wasMissed(question) {
    const stats = existingStats(question.id);
    return Boolean(stats && stats.attempts > 0 && stats.lastCorrect === false);
  }

  function focusPriority(question) {
    const stats = existingStats(question.id);
    if (!stats || !stats.attempts) {
      return 40;
    }
    const accuracy = questionAccuracy(stats);
    let priority = 0;
    if (stats.lastCorrect === false) {
      priority += 50;
    }
    priority += Math.max(0, 2 - (stats.streak || 0)) * 14;
    priority += (stats.wrong || 0) * 8;
    priority += Math.round((1 - accuracy) * 24);
    return priority;
  }

  function filteredQuestionIndexes(pack) {
    let queue = pack.questions.map((_, index) => index);
    if (state.mode === "focus") {
      queue = queue.filter((index) => needsFocus(pack.questions[index]));
    }
    if (state.mode === "missed") {
      queue = queue.filter((index) => wasMissed(pack.questions[index]));
    }
    return queue;
  }

  function orderQueue(queue, pack) {
    const ordered = elements.shuffleQuestions.checked ? shuffle(queue) : [...queue];
    if (state.mode !== "focus") {
      return ordered;
    }
    return ordered.sort((left, right) => {
      return focusPriority(pack.questions[right]) - focusPriority(pack.questions[left]);
    });
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function sameOrder(left, right) {
    return left.length === right.length && left.every((item, index) => item === right[index]);
  }

  function shuffleDifferent(items) {
    if (items.length < 2) {
      return [...items];
    }

    const shuffled = shuffle(items);
    if (!sameOrder(shuffled, items)) {
      return shuffled;
    }

    const offset = Math.floor(Math.random() * (items.length - 1)) + 1;
    return items.map((_, index) => items[(index + offset) % items.length]);
  }

  function buildQueue() {
    const pack = currentPack();
    if (!pack) {
      state.queue = [];
      return;
    }

    const queue = filteredQuestionIndexes(pack);
    state.emptyFilter = queue.length === 0;
    state.queue = orderQueue(queue, pack);
    state.cursor = 0;
    state.answered = false;
    state.selectedOriginalIndex = null;
    state.selectedOriginalIndexes = [];
    state.optionOrders = new Map();
  }

  function setMode(mode) {
    state.mode = mode;
    [...elements.modeButtons.children].forEach((child) => {
      child.classList.toggle("active", child.dataset.mode === mode);
    });
  }

  function renderSubjectCards() {
    elements.subjectCards.innerHTML = "";
    packs.forEach((pack) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "subject-card";
      button.dataset.packId = pack.id;
      button.innerHTML = `
        <span class="subject-card-icon" aria-hidden="true">
          <i data-lucide="book-marked"></i>
        </span>
        <span class="subject-card-content">
          <strong>${escapeHtml(pack.title)}</strong>
          <span>${pack.questions.length} grile</span>
        </span>
        <i data-lucide="arrow-right" aria-hidden="true"></i>
      `;
      elements.subjectCards.appendChild(button);
    });
    refreshIcons();
  }

  function showSubjectMenu() {
    state.started = false;
    document.body.classList.add("menu-open");
    elements.subjectMenu.classList.remove("hidden");
    elements.quizWorkspace.classList.add("hidden");
    delete document.body.dataset.packId;
    clearQuestionDensity();
    delete elements.quizWorkspace.dataset.packId;
    elements.subjectMenuButton.classList.add("hidden");
    closeResetModal(false);
    refreshIcons();
  }

  function startPack(packId) {
    state.packId = packId;
    state.started = true;
    state.progress = loadProgress(state.packId);
    document.body.classList.remove("menu-open");
    document.body.dataset.packId = packId;
    elements.quizWorkspace.dataset.packId = packId;
    setMode("all");
    elements.subjectMenu.classList.add("hidden");
    elements.quizWorkspace.classList.remove("hidden");
    elements.subjectMenuButton.classList.remove("hidden");
    buildQueue();
    renderQuestion();
  }

  function optionOrder(question) {
    if (!elements.shuffleAnswers.checked) {
      return question.options.map((_, index) => index);
    }
    if (!state.optionOrders.has(question.id)) {
      state.optionOrders.set(question.id, shuffleDifferent(question.options.map((_, index) => index)));
    }
    return state.optionOrders.get(question.id);
  }

  function renderEmpty() {
    clearQuestionDensity();
    elements.questionTitle.textContent = "Nu am găsit grile în data/grile.js";
    elements.currentNumber.textContent = "0";
    elements.totalNumber.textContent = "0";
    elements.progressFill.style.width = "0%";
    elements.questionExtras.innerHTML = "";
    elements.answers.innerHTML = '<div class="empty-state">Adaugă un pachet de grile în fișierul de date.</div>';
    elements.prevButton.disabled = true;
    elements.nextButton.disabled = true;
  }

  function renderNoQuestions(pack) {
    const modeLabel = state.mode === "missed" ? "greșite" : "neștiute";
    clearQuestionDensity();
    elements.questionTitle.textContent = `Nu există întrebări ${modeLabel}`;
    elements.currentNumber.textContent = "0";
    elements.totalNumber.textContent = "0";
    elements.progressFill.style.width = "0%";
    elements.questionExtras.innerHTML = "";
    elements.answers.innerHTML = '<div class="empty-state">Schimbă filtrul sau alege o întrebare din hartă.</div>';
    elements.prevButton.disabled = true;
    elements.nextButton.disabled = true;
    renderStats();
    renderMap();
    refreshIcons();
  }

  function renderQuestion() {
    const pack = currentPack();
    if (!pack) {
      renderEmpty();
      return;
    }
    if (state.emptyFilter || !state.queue.length) {
      renderNoQuestions(pack);
      return;
    }

    const questionIndex = state.queue[state.cursor];
    const question = pack.questions[questionIndex];
    const order = optionOrder(question);
    const multiAnswer = isMultiAnswer(question);
    const progressPercent = ((state.cursor + 1) / state.queue.length) * 100;

    setQuestionDensity(questionDensity(question));
    elements.questionTitle.textContent = question.text;
    elements.currentNumber.textContent = String(state.cursor + 1);
    elements.totalNumber.textContent = String(state.queue.length);
    elements.progressFill.style.width = `${progressPercent}%`;
    renderQuestionExtras(question);
    elements.prevButton.disabled = state.cursor === 0;
    if (multiAnswer) {
      elements.nextButton.disabled = true;
      elements.nextButton.innerHTML = 'Verifică <i data-lucide="check" aria-hidden="true"></i>';
    } else {
      elements.nextButton.disabled = false;
      setNextButtonForNavigation(pack);
    }

    elements.answers.innerHTML = "";
    order.forEach((originalIndex, visibleIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer-option";
      button.dataset.originalIndex = String(originalIndex);
      if (multiAnswer) {
        button.setAttribute("aria-pressed", "false");
      }
      button.innerHTML = `
        <span class="answer-letter">${letters[visibleIndex]}</span>
        <span class="answer-text">${escapeHtml(question.options[originalIndex])}</span>
      `;
      button.addEventListener("click", () => {
        if (multiAnswer) {
          toggleMultiOption(originalIndex);
          return;
        }
        answerQuestion([originalIndex]);
      });
      elements.answers.appendChild(button);
    });

    state.answered = false;
    state.selectedOriginalIndex = null;
    state.selectedOriginalIndexes = [];
    resetQuestionScroll();
    renderStats();
    renderMap();
    refreshIcons();
  }

  function questionDensity(question) {
    const text = `${question.text || ""}\n${question.textAfterTables || ""}`;
    const textLength = text.length;
    const lineCount = text.split("\n").filter(Boolean).length;
    const longestOption = Math.max(...question.options.map((option) => option.length));

    if (textLength > 650 || lineCount > 9 || longestOption > 220) {
      return "dense";
    }
    if (textLength > 430 || lineCount > 6 || longestOption > 140 || Array.isArray(question.tables)) {
      return "long";
    }
    return "normal";
  }

  function setQuestionDensity(density) {
    if (density === "normal") {
      clearQuestionDensity();
      return;
    }
    document.body.dataset.questionDensity = density;
    elements.quizWorkspace.dataset.questionDensity = density;
    elements.questionTitle.tabIndex = 0;
  }

  function clearQuestionDensity() {
    delete document.body.dataset.questionDensity;
    delete elements.quizWorkspace.dataset.questionDensity;
    elements.questionTitle.removeAttribute("tabindex");
  }

  function resetQuestionScroll() {
    elements.questionTitle.scrollTop = 0;
    elements.questionExtras.scrollTop = 0;
    elements.answers.scrollTop = 0;
  }

  function scrollQuizIntoView() {
    if (window.matchMedia("(max-width: 680px)").matches) {
      elements.quizWorkspace.scrollIntoView({ block: "start" });
    }
  }


  function renderQuestionExtras(question) {
    elements.questionExtras.innerHTML = "";

    if (Array.isArray(question.tables)) {
      question.tables.forEach((table) => {
        const wrapper = document.createElement("div");
        wrapper.className = "table-wrap";
        const tableElement = document.createElement("table");
        tableElement.className = "data-table";

        if (Array.isArray(table.headers) && table.headers.length) {
          const thead = document.createElement("thead");
          const headerRow = document.createElement("tr");
          table.headers.forEach((header) => {
            const th = document.createElement("th");
            th.textContent = header;
            headerRow.appendChild(th);
          });
          thead.appendChild(headerRow);
          tableElement.appendChild(thead);
        }

        const tbody = document.createElement("tbody");
        (table.rows || []).forEach((row) => {
          const tr = document.createElement("tr");
          row.forEach((cell) => {
            const td = document.createElement("td");
            td.textContent = cell;
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        tableElement.appendChild(tbody);
        wrapper.appendChild(tableElement);
        elements.questionExtras.appendChild(wrapper);
      });
    }

    if (question.textAfterTables) {
      const note = document.createElement("p");
      note.className = "question-after-text";
      note.textContent = question.textAfterTables;
      elements.questionExtras.appendChild(note);
    }
  }

  function toggleMultiOption(originalIndex) {
    if (state.answered) {
      return;
    }
    const selected = new Set(state.selectedOriginalIndexes);
    if (selected.has(originalIndex)) {
      selected.delete(originalIndex);
    } else {
      selected.add(originalIndex);
    }
    state.selectedOriginalIndexes = [...selected];
    state.selectedOriginalIndex = state.selectedOriginalIndexes[0] ?? null;

    [...elements.answers.children].forEach((button) => {
      const optionIndex = Number(button.dataset.originalIndex);
      const isSelected = selected.has(optionIndex);
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
    elements.nextButton.disabled = state.selectedOriginalIndexes.length === 0;
  }

  function answerQuestion(selectedIndexes) {
    if (state.answered) {
      return;
    }
    const pack = currentPack();
    const question = pack.questions[state.queue[state.cursor]];
    const correct = sameSelection(selectedIndexes, correctIndexes(question));
    const correctSet = new Set(correctIndexes(question));
    const selectedSet = new Set(selectedIndexes);
    const stats = questionStats(question.id);
    const today = todayKey();

    stats.attempts += 1;
    stats.correct += correct ? 1 : 0;
    stats.wrong += correct ? 0 : 1;
    stats.streak = correct ? stats.streak + 1 : 0;
    stats.lastCorrect = correct;
    stats.lastSeen = new Date().toISOString();
    state.progress.daily[today] = (state.progress.daily[today] || 0) + 1;

    state.answered = true;
    state.selectedOriginalIndex = selectedIndexes[0] ?? null;
    state.selectedOriginalIndexes = [...selectedIndexes];
    saveProgress();

    [...elements.answers.children].forEach((button) => {
      const optionIndex = Number(button.dataset.originalIndex);
      button.disabled = true;
      button.classList.remove("selected");
      if (correctSet.has(optionIndex)) {
        button.classList.add("correct");
      }
      if (selectedSet.has(optionIndex) && !correctSet.has(optionIndex)) {
        button.classList.add("wrong");
      }
    });

    renderStats();
    renderMap();
    refreshNextButton();
    elements.nextButton.focus();
  }

  function advanceQuestion() {
    if (!state.queue.length) {
      return;
    }
    if (state.cursor === state.queue.length - 1) {
      const pack = currentPack();
      if (pack && state.mode !== "all" && filteredQuestionIndexes(pack).length === 0) {
        setMode("all");
      }
      buildQueue();
    } else {
      state.cursor += 1;
    }
    renderQuestion();
  }

  function handleKeyDown(event) {
    if (elements.resetModal.classList.contains("open")) {
      if (event.key === "Escape") {
        closeResetModal();
      }
      return;
    }
    if (!state.started) {
      return;
    }
    if (event.key !== "Enter" || event.repeat) {
      return;
    }
    if (!state.answered) {
      return;
    }
    event.preventDefault();
    advanceQuestion();
  }

  function restartLabel(pack) {
    if (state.mode === "all") {
      return "Reia seria";
    }
    return filteredQuestionIndexes(pack).length ? "Reia seria" : "Gata";
  }

  function setNextButtonForNavigation(pack) {
    elements.nextButton.innerHTML = state.cursor === state.queue.length - 1
      ? `${restartLabel(pack)} <i data-lucide="refresh-cw" aria-hidden="true"></i>`
      : 'Următoarea <i data-lucide="arrow-right" aria-hidden="true"></i>';
  }

  function refreshNextButton() {
    const pack = currentPack();
    if (!pack || !state.queue.length || state.cursor !== state.queue.length - 1) {
      if (pack && state.queue.length) {
        elements.nextButton.disabled = false;
        setNextButtonForNavigation(pack);
        refreshIcons();
      }
      return;
    }
    elements.nextButton.disabled = false;
    setNextButtonForNavigation(pack);
    refreshIcons();
  }

  function renderStats() {
    const pack = currentPack();
    if (!pack) {
      return;
    }
    const stats = Object.values(state.progress.byQuestion || {});
    const attempts = stats.reduce((sum, item) => sum + (item.attempts || 0), 0);
    const correct = stats.reduce((sum, item) => sum + (item.correct || 0), 0);
    const mastered = pack.questions.filter(isMastered).length;
    const today = state.progress.daily?.[todayKey()] || 0;

    elements.attemptedStat.textContent = String(attempts);
    elements.accuracyStat.textContent = attempts ? `${Math.round((correct / attempts) * 100)}%` : "0%";
    elements.masteredStat.textContent = `${mastered}/${pack.questions.length}`;
    elements.todayStat.textContent = `${today}/${dailyTarget}`;
  }

  function renderMap() {
    const pack = currentPack();
    if (!pack) {
      return;
    }
    const activeQuestionIndex = state.queue[state.cursor];
    elements.questionMap.innerHTML = "";

    pack.questions.forEach((question, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map-button";
      button.textContent = question.id;
      button.setAttribute("aria-label", `Întrebarea ${question.id}`);
      if (answeredCorrect(question)) {
        button.classList.add("correct");
      } else if (isMastered(question)) {
        button.classList.add("mastered");
      } else if (wasMissed(question)) {
        button.classList.add("missed");
      }
      if (index === activeQuestionIndex) {
        button.classList.add("current");
      }
      button.addEventListener("click", () => {
        const queuePosition = state.queue.indexOf(index);
        if (queuePosition >= 0) {
          state.cursor = queuePosition;
        } else {
          state.queue = [index, ...state.queue];
          state.cursor = 0;
        }
        state.emptyFilter = false;
        renderQuestion();
        scrollQuizIntoView();
      });
      elements.questionMap.appendChild(button);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function bindEvents() {
    elements.subjectCards.addEventListener("click", (event) => {
      const button = event.target.closest("[data-pack-id]");
      if (!button) {
        return;
      }
      startPack(button.dataset.packId);
    });

    elements.subjectMenuButton.addEventListener("click", () => {
      showSubjectMenu();
    });

    elements.modeButtons.addEventListener("click", (event) => {
      const button = event.target.closest("[data-mode]");
      if (!button) {
        return;
      }
      setMode(button.dataset.mode);
      buildQueue();
      renderQuestion();
    });

    elements.shuffleQuestions.addEventListener("change", () => {
      buildQueue();
      renderQuestion();
    });

    elements.shuffleAnswers.addEventListener("change", () => {
      state.optionOrders = new Map();
      renderQuestion();
    });

    elements.prevButton.addEventListener("click", () => {
      if (state.cursor > 0) {
        state.cursor -= 1;
        renderQuestion();
      }
    });

    elements.nextButton.addEventListener("click", () => {
      const question = currentQuestion();
      if (question && isMultiAnswer(question) && !state.answered) {
        answerQuestion(state.selectedOriginalIndexes);
        return;
      }
      advanceQuestion();
    });

    document.addEventListener("keydown", handleKeyDown);

    elements.resetButton.addEventListener("click", () => {
      openResetModal();
    });

    elements.cancelResetButton.addEventListener("click", closeResetModal);
    elements.resetModal.addEventListener("click", (event) => {
      if (event.target === elements.resetModal) {
        closeResetModal();
      }
    });
    elements.confirmResetButton.addEventListener("click", () => {
      const pack = currentPack();
      if (!pack) {
        return;
      }
      state.progress = defaultProgress();
      saveProgress();
      closeResetModal();
      buildQueue();
      renderQuestion();
    });
  }

  function openResetModal() {
    elements.resetModal.removeAttribute("hidden");
    elements.resetModal.classList.add("open");
    elements.resetModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    elements.cancelResetButton.focus();
    refreshIcons();
  }

  function closeResetModal(restoreFocus = true) {
    elements.resetModal.classList.remove("open");
    elements.resetModal.setAttribute("aria-hidden", "true");
    elements.resetModal.setAttribute("hidden", "");
    document.body.classList.remove("modal-open");
    if (restoreFocus) {
      elements.resetButton.focus();
    }
  }

  function init() {
    if (!packs.length) {
      renderEmpty();
      refreshIcons();
      return;
    }

    bindEvents();
    renderSubjectCards();
    showSubjectMenu();
  }

  init();
})();
