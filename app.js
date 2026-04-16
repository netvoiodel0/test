const STORAGE_KEY = "quiz-site-progress-v1";
const TARGET_QUESTIONS_PER_TEST = 50;
const LETTERS = ["A", "B", "C", "D", "E", "F"];

const elements = {
  sectionTabs: document.querySelector("#sectionTabs"),
  testCards: document.querySelector("#testCards"),
  activeTestLabel: document.querySelector("#activeTestLabel"),
  activeTestTitle: document.querySelector("#activeTestTitle"),
  answeredCount: document.querySelector("#answeredCount"),
  progressBar: document.querySelector("#progressBar"),
  questionNumber: document.querySelector("#questionNumber"),
  questionStatus: document.querySelector("#questionStatus"),
  questionText: document.querySelector("#questionText"),
  answerOptions: document.querySelector("#answerOptions"),
  feedback: document.querySelector("#feedback"),
  jumpList: document.querySelector("#jumpList"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  resetAllButton: document.querySelector("#resetAllButton"),
  resultPanel: document.querySelector("#resultPanel"),
  resultTitle: document.querySelector("#resultTitle"),
  resultText: document.querySelector("#resultText"),
  finishButton: document.querySelector("#finishButton"),
  cardTemplate: document.querySelector("#testCardTemplate")
};

const state = {
  sections: normalizeSections(
    window.TEST_SECTIONS || [
      {
        id: "default",
        title: "Тесты",
        description: "",
        tests: window.TEST_BANKS || []
      }
    ]
  ),
  progress: loadProgress(),
  activeSectionIndex: 0,
  activeTestIndex: 0,
  activeQuestionIndex: 0
};

init();

function init() {
  if (!state.sections.length || !getActiveTests().length) {
    renderEmptyState();
    return;
  }

  ensureProgressShape();
  hydrateRepeatQueuesFromProgress();
  renderSectionTabs();
  renderTestCards();
  bindEvents();
  render();
}

function normalizeSections(sections) {
  return sections
    .map((section, sectionIndex) => {
      const sectionId = section.id || `section-${sectionIndex + 1}`;

      return {
        id: sectionId,
        title: section.title || `Раздел ${sectionIndex + 1}`,
        description: section.description || "",
        tests: normalizeTests(section.tests || [], sectionId)
      };
    })
    .filter((section) => section.tests.length > 0);
}

function normalizeTests(tests, sectionId = "default") {
  return tests.map((test, testIndex) => {
    const questions = (test.questions || []).map((question, questionIndex) => {
      const options = Array.isArray(question.options) ? question.options : [];
      const rawAnswer = Number.isInteger(question.answer) ? question.answer : 0;
      const answerSourceIndex = options.length
        ? Math.min(Math.max(rawAnswer, 0), options.length - 1)
        : 0;

      const normalizedQuestion = shuffleQuestionOptions({
        id:
          question.id ||
          `${sectionId}-t${testIndex + 1}-q${String(questionIndex + 1).padStart(3, "0")}`,
        text: question.text || "Вопрос без текста",
        options,
        answerSourceIndex,
        explanation: question.explanation || ""
      });

      return {
        ...normalizedQuestion,
        baseId: normalizedQuestion.id,
        attemptId: normalizedQuestion.id,
        isRepeat: false
      };
    });

    return {
      id: test.id || `${sectionId}-test-${testIndex + 1}`,
      legacyId: test.legacyId || test.id || "",
      title: test.title || `Тест ${testIndex + 1}`,
      description: test.description || "",
      questions: shuffleArray(questions)
    };
  });
}

function shuffleQuestionOptions(question) {
  const shuffledOptions = shuffleArray(
    question.options.map((option, sourceIndex) => ({
      text: option,
      sourceIndex
    }))
  );
  const answer = shuffledOptions.findIndex((option) => option.sourceIndex === question.answerSourceIndex);

  return {
    ...question,
    options: shuffledOptions.map((option) => option.text),
    optionSourceIndexes: shuffledOptions.map((option) => option.sourceIndex),
    answer: answer >= 0 ? answer : 0
  };
}

function shuffleArray(items) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }

  return result;
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function ensureProgressShape() {
  getAllTests().forEach((test) => {
    ensureProgressStore(test.id);
    if (test.legacyId) ensureProgressStore(test.legacyId);
  });
  saveProgress();
}

function ensureProgressStore(testId) {
  if (!testId) return;

  if (
    !state.progress[testId] ||
    typeof state.progress[testId] !== "object" ||
    Array.isArray(state.progress[testId])
  ) {
    state.progress[testId] = {};
  }
}

function hydrateRepeatQueuesFromProgress() {
  getAllTests().forEach((test) => {
    getBaseQuestions(test).forEach((question) => {
      const selectedAnswer = getLatestSelectedAnswer(test, question);

      if (Number.isInteger(selectedAnswer) && selectedAnswer !== question.answerSourceIndex) {
        queueRepeatQuestion(test, question);
      }
    });
  });
}

function bindEvents() {
  elements.prevButton.addEventListener("click", () => {
    state.activeQuestionIndex = Math.max(0, state.activeQuestionIndex - 1);
    render();
  });

  elements.nextButton.addEventListener("click", () => {
    const test = getActiveTest();
    state.activeQuestionIndex = Math.min(test.questions.length - 1, state.activeQuestionIndex + 1);
    render();
  });

  elements.resetAllButton.addEventListener("click", () => {
    const shouldReset = confirm("Сбросить все ответы и результаты?");
    if (!shouldReset) return;

    state.progress = {};
    ensureProgressShape();
    resetRepeatQueues();
    state.activeQuestionIndex = 0;
    renderSectionTabs();
    renderTestCards();
    render();
  });

  elements.finishButton.addEventListener("click", () => {
    moveToFirstMistake();
    render();
  });
}

function renderTestCards() {
  elements.testCards.innerHTML = "";
  const tests = getActiveTests();

  tests.forEach((test, index) => {
    const node = elements.cardTemplate.content.firstElementChild.cloneNode(true);
    const answered = getAnsweredCount(test);
    const total = getBaseQuestionTotal(test);
    const repeats = getRepeatCount(test);
    const warning =
      total === TARGET_QUESTIONS_PER_TEST ? "" : `Сейчас добавлено ${total} из ${TARGET_QUESTIONS_PER_TEST}`;
    const repeatText = repeats ? `, повторов: ${repeats}` : "";

    node.dataset.testIndex = String(index);
    node.classList.toggle("active", index === state.activeTestIndex);
    node.querySelector(".test-card-kicker").textContent = warning || `${total} вопросов`;
    node.querySelector("strong").textContent = test.title;
    node.querySelector(".test-card-progress").textContent =
      `${answered} / ${TARGET_QUESTIONS_PER_TEST} отвечено${repeatText}`;
    node.addEventListener("click", () => {
      state.activeTestIndex = index;
      state.activeQuestionIndex = 0;
      renderTestCards();
      render();
    });

    elements.testCards.appendChild(node);
  });
}

function renderSectionTabs() {
  elements.sectionTabs.innerHTML = "";

  state.sections.forEach((section, index) => {
    const button = document.createElement("button");
    const title = document.createElement("strong");
    const progress = document.createElement("span");
    const answered = getSectionAnsweredCount(section);
    const total = getSectionQuestionCount(section);

    button.type = "button";
    button.className = "section-tab";
    button.classList.toggle("active", index === state.activeSectionIndex);
    title.textContent = section.title;
    progress.textContent = `${answered} / ${total} отвечено`;

    button.append(title, progress);
    button.addEventListener("click", () => {
      state.activeSectionIndex = index;
      state.activeTestIndex = 0;
      state.activeQuestionIndex = 0;
      renderSectionTabs();
      renderTestCards();
      render();
    });

    elements.sectionTabs.appendChild(button);
  });
}

function render() {
  const test = getActiveTest();
  const question = getActiveQuestion();

  if (!test || !question) {
    renderEmptyState();
    return;
  }

  const answered = getAnsweredCount(test);
  const total = getQuestionTotal(test);
  const progressPercent = Math.round((answered / TARGET_QUESTIONS_PER_TEST) * 100);
  const selectedAnswer = getSelectedAnswer(test, question);
  const isAnswered = Number.isInteger(selectedAnswer);
  const questionLabel = question.isRepeat ? "Повтор ошибки" : "Вопрос";
  const section = getActiveSection();

  elements.activeTestLabel.textContent = `${section.title} · Тест ${state.activeTestIndex + 1}`;
  elements.activeTestTitle.textContent = test.title;
  elements.answeredCount.textContent = `${answered} / ${TARGET_QUESTIONS_PER_TEST}`;
  elements.progressBar.style.width = `${Math.min(progressPercent, 100)}%`;
  elements.questionNumber.textContent = `${questionLabel} ${state.activeQuestionIndex + 1} из ${total}`;
  elements.questionStatus.textContent = question.isRepeat
    ? isAnswered ? "Повтор отвечен" : "Повторить в конце"
    : isAnswered ? "Отвечен" : "Не отвечен";
  elements.questionText.textContent = question.text;

  renderOptions(test, question, selectedAnswer);
  renderFeedback(question, selectedAnswer);
  renderJumpList(test);
  renderResult(test);

  elements.prevButton.disabled = state.activeQuestionIndex === 0;
  elements.nextButton.disabled = state.activeQuestionIndex === total - 1;
  elements.nextButton.textContent = state.activeQuestionIndex === total - 1 ? "Конец" : "Дальше";
}

function renderOptions(test, question, selectedAnswer) {
  elements.answerOptions.innerHTML = "";

  question.options.forEach((option, index) => {
    const optionSourceIndex = getOptionSourceIndex(question, index);
    const button = document.createElement("button");
    const letter = document.createElement("span");
    const text = document.createElement("span");

    button.type = "button";
    button.className = "option-button";
    button.classList.toggle("selected", selectedAnswer === optionSourceIndex);

    if (Number.isInteger(selectedAnswer)) {
      button.classList.toggle("correct", question.answerSourceIndex === optionSourceIndex);
      button.classList.toggle(
        "wrong",
        selectedAnswer === optionSourceIndex && selectedAnswer !== question.answerSourceIndex
      );
    }

    letter.className = "option-letter";
    letter.textContent = LETTERS[index] || String(index + 1);
    text.textContent = option;

    button.append(letter, text);
    button.addEventListener("click", () => selectAnswer(test, question, optionSourceIndex));
    elements.answerOptions.appendChild(button);
  });
}

function renderFeedback(question, selectedAnswer) {
  if (!Number.isInteger(selectedAnswer)) {
    elements.feedback.className = "feedback hidden";
    elements.feedback.textContent = "";
    return;
  }

  const isCorrect = selectedAnswer === question.answerSourceIndex;
  const correctText = getCorrectOptionText(question);
  const explanation = question.explanation ? ` ${question.explanation}` : "";
  const repeatText = isCorrect ? "" : " Вопрос добавлен в конец для повторения.";

  elements.feedback.className = `feedback${isCorrect ? "" : " wrong"}`;
  elements.feedback.textContent = isCorrect
    ? `Правильно. Верный ответ: ${correctText}.${explanation}`
    : `Неправильно. Верный ответ: ${correctText}.${repeatText}${explanation}`;
}

function renderJumpList(test) {
  elements.jumpList.innerHTML = "";

  test.questions.forEach((question, index) => {
    const button = document.createElement("button");
    const selectedAnswer = getSelectedAnswer(test, question);

    button.type = "button";
    button.className = "jump-button";
    button.classList.toggle("active", index === state.activeQuestionIndex);
    button.classList.toggle("answered", Number.isInteger(selectedAnswer));
    button.classList.toggle("repeat", Boolean(question.isRepeat));
    button.textContent = String(index + 1);
    button.title = question.isRepeat
      ? `Перейти к повтору ошибки ${index + 1}`
      : `Перейти к вопросу ${index + 1}`;
    button.addEventListener("click", () => {
      state.activeQuestionIndex = index;
      render();
    });

    elements.jumpList.appendChild(button);
  });
}

function renderResult(test) {
  const answeredAttempts = getAnsweredAttemptsCount(test);
  const totalAttempts = getQuestionTotal(test);
  const total = getBaseQuestionTotal(test);
  const score = getScore(test);
  const repeats = getRepeatCount(test);
  const percent = total ? Math.round((score / total) * 100) : 0;
  const allVisibleQuestionsAnswered = answeredAttempts === totalAttempts;

  elements.resultPanel.classList.toggle("hidden", !allVisibleQuestionsAnswered);
  elements.resultTitle.textContent = `${score} правильных из ${total}`;
  elements.resultText.textContent =
    total === TARGET_QUESTIONS_PER_TEST
      ? `Итог по тесту: ${percent}%. Ошибочные вопросы в конце повторялись: ${repeats}.`
      : `Пока в базе ${total} вопроса из ${TARGET_QUESTIONS_PER_TEST}. Когда пришлёшь все вопросы, результат будет считаться по полному тесту.`;
}

function selectAnswer(test, question, answerSourceIndex) {
  const baseId = getQuestionBaseId(question);
  const isCorrect = answerSourceIndex === question.answerSourceIndex;

  writeProgressAnswer(test, getQuestionAttemptId(question), answerSourceIndex);
  writeProgressAnswer(test, baseId, answerSourceIndex);

  if (isCorrect) {
    removeQueuedRepeats(test, baseId);
  } else {
    queueRepeatQuestion(test, question);
  }

  saveProgress();
  renderSectionTabs();
  renderTestCards();
  render();
}

function getActiveSection() {
  return state.sections[state.activeSectionIndex];
}

function getActiveTests() {
  return getActiveSection()?.tests || [];
}

function getActiveTest() {
  return getActiveTests()[state.activeTestIndex];
}

function getActiveQuestion() {
  const test = getActiveTest();
  return test?.questions[state.activeQuestionIndex];
}

function getQuestionTotal(test) {
  return test.questions.length;
}

function getAllTests() {
  return state.sections.flatMap((section) => section.tests);
}

function getSectionQuestionCount(section) {
  return section.tests.reduce((total, test) => total + getBaseQuestionTotal(test), 0);
}

function getSectionAnsweredCount(section) {
  return section.tests.reduce((total, test) => total + getAnsweredCount(test), 0);
}

function getBaseQuestionTotal(test) {
  return getBaseQuestions(test).length;
}

function getRepeatCount(test) {
  return test.questions.filter((question) => question.isRepeat).length;
}

function getAnsweredCount(test) {
  return getBaseQuestions(test).filter((question) => Number.isInteger(getLatestSelectedAnswer(test, question))).length;
}

function getAnsweredAttemptsCount(test) {
  return test.questions.filter((question) => Number.isInteger(getSelectedAnswer(test, question))).length;
}

function getSelectedAnswer(test, question) {
  return readProgressAnswer(test, getQuestionAttemptId(question));
}

function getLatestSelectedAnswer(test, question) {
  return readProgressAnswer(test, getQuestionBaseId(question));
}

function readProgressAnswer(test, answerId) {
  const currentAnswer = state.progress[test.id]?.[answerId];
  if (Number.isInteger(currentAnswer)) return currentAnswer;

  if (test.legacyId && test.legacyId !== test.id) {
    const legacyAnswer = state.progress[test.legacyId]?.[answerId];
    if (Number.isInteger(legacyAnswer)) return legacyAnswer;
  }

  return undefined;
}

function writeProgressAnswer(test, answerId, answerSourceIndex) {
  ensureProgressStore(test.id);
  state.progress[test.id][answerId] = answerSourceIndex;

  if (test.legacyId && test.legacyId !== test.id) {
    ensureProgressStore(test.legacyId);
    state.progress[test.legacyId][answerId] = answerSourceIndex;
  }
}

function getScore(test) {
  return getBaseQuestions(test).reduce((score, question) => {
    return getLatestSelectedAnswer(test, question) === question.answerSourceIndex ? score + 1 : score;
  }, 0);
}

function moveToFirstMistake() {
  const test = getActiveTest();
  const firstMistake = test.questions.findIndex((question) => {
    return getLatestSelectedAnswer(test, question) !== question.answerSourceIndex;
  });

  state.activeQuestionIndex = firstMistake >= 0 ? firstMistake : 0;
}

function queueRepeatQuestion(test, question) {
  const baseId = getQuestionBaseId(question);
  const hasUnansweredRepeat = test.questions.some((candidate) => {
    return (
      candidate.isRepeat &&
      getQuestionBaseId(candidate) === baseId &&
      !Number.isInteger(getSelectedAnswer(test, candidate))
    );
  });

  if (hasUnansweredRepeat) return;

  test.repeatCounter = (test.repeatCounter || 0) + 1;
  test.questions.push(createRepeatQuestion(test, question));
}

function createRepeatQuestion(test, question) {
  const baseId = getQuestionBaseId(question);
  const repeatedQuestion = reshuffleQuestionOptions(question);

  return {
    ...repeatedQuestion,
    baseId,
    attemptId: `${baseId}__repeat_${Date.now()}_${test.repeatCounter}`,
    isRepeat: true
  };
}

function reshuffleQuestionOptions(question) {
  const shuffledOptions = shuffleArray(
    question.options.map((option, index) => ({
      text: option,
      sourceIndex: getOptionSourceIndex(question, index)
    }))
  );
  const answer = shuffledOptions.findIndex((option) => option.sourceIndex === question.answerSourceIndex);

  return {
    ...question,
    options: shuffledOptions.map((option) => option.text),
    optionSourceIndexes: shuffledOptions.map((option) => option.sourceIndex),
    answer: answer >= 0 ? answer : 0
  };
}

function removeQueuedRepeats(test, baseId) {
  const currentQuestion = getActiveQuestion();
  const currentAttemptId = currentQuestion ? getQuestionAttemptId(currentQuestion) : "";

  test.questions = test.questions.filter((question) => {
    const isSameBaseRepeat = question.isRepeat && getQuestionBaseId(question) === baseId;
    const isCurrentQuestion = getQuestionAttemptId(question) === currentAttemptId;
    const isAnsweredRepeat = Number.isInteger(getSelectedAnswer(test, question));

    return !isSameBaseRepeat || isCurrentQuestion || isAnsweredRepeat;
  });

  if (currentAttemptId) {
    const nextIndex = test.questions.findIndex((question) => getQuestionAttemptId(question) === currentAttemptId);
    state.activeQuestionIndex = nextIndex >= 0 ? nextIndex : Math.min(state.activeQuestionIndex, test.questions.length - 1);
  }
}

function resetRepeatQueues() {
  getAllTests().forEach((test) => {
    test.questions = getBaseQuestions(test);
    test.repeatCounter = 0;
  });
}

function getBaseQuestions(test) {
  return test.questions.filter((question) => !question.isRepeat);
}

function getQuestionBaseId(question) {
  return question.baseId || question.id;
}

function getQuestionAttemptId(question) {
  return question.attemptId || question.id;
}

function getOptionSourceIndex(question, optionIndex) {
  return question.optionSourceIndexes?.[optionIndex] ?? optionIndex;
}

function getCorrectOptionText(question) {
  const answerIndex = question.optionSourceIndexes?.findIndex(
    (sourceIndex) => sourceIndex === question.answerSourceIndex
  );

  return question.options[answerIndex >= 0 ? answerIndex : question.answer] || "не указан";
}

function renderEmptyState() {
  elements.activeTestLabel.textContent = "Нет вопросов";
  elements.activeTestTitle.textContent = "Добавь вопросы в questions.js";
  elements.answeredCount.textContent = `0 / ${TARGET_QUESTIONS_PER_TEST}`;
  elements.progressBar.style.width = "0%";
  elements.questionNumber.textContent = "Вопрос 0";
  elements.questionStatus.textContent = "Не готово";
  elements.questionText.textContent = "Пока нет тестов. Пришли мне вопросы, и я добавлю их в базу.";
  elements.sectionTabs.innerHTML = "";
  elements.testCards.innerHTML = "";
  elements.answerOptions.innerHTML = "";
  elements.jumpList.innerHTML = "";
  elements.feedback.className = "feedback hidden";
  elements.resultPanel.classList.add("hidden");
}
