const STORAGE_KEY = "quiz-site-progress-v1";
const TARGET_QUESTIONS_PER_TEST = 100;
const LETTERS = ["A", "B", "C", "D", "E", "F"];

const elements = {
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
  tests: normalizeTests(window.TEST_BANKS || []),
  progress: loadProgress(),
  activeTestIndex: 0,
  activeQuestionIndex: 0
};

init();

function init() {
  if (!state.tests.length) {
    renderEmptyState();
    return;
  }

  ensureProgressShape();
  renderTestCards();
  bindEvents();
  render();
}

function normalizeTests(tests) {
  return tests.map((test, testIndex) => {
    const questions = (test.questions || []).map((question, questionIndex) => {
      const options = Array.isArray(question.options) ? question.options : [];
      const rawAnswer = Number.isInteger(question.answer) ? question.answer : 0;
      const answerSourceIndex = options.length
        ? Math.min(Math.max(rawAnswer, 0), options.length - 1)
        : 0;

      return shuffleQuestionOptions({
        id: question.id || `t${testIndex + 1}-q${String(questionIndex + 1).padStart(3, "0")}`,
        text: question.text || "Вопрос без текста",
        options,
        answerSourceIndex,
        explanation: question.explanation || ""
      });
    });

    return {
      id: test.id || `test-${testIndex + 1}`,
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
  state.tests.forEach((test) => {
    if (!state.progress[test.id] || typeof state.progress[test.id] !== "object" || Array.isArray(state.progress[test.id])) {
      state.progress[test.id] = {};
    }
  });
  saveProgress();
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
    state.activeQuestionIndex = 0;
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

  state.tests.forEach((test, index) => {
    const node = elements.cardTemplate.content.firstElementChild.cloneNode(true);
    const answered = getAnsweredCount(test);
    const total = getQuestionTotal(test);
    const warning = total === TARGET_QUESTIONS_PER_TEST ? "" : `Сейчас добавлено ${total} из 100`;

    node.dataset.testIndex = String(index);
    node.classList.toggle("active", index === state.activeTestIndex);
    node.querySelector(".test-card-kicker").textContent = warning || `${total} вопросов`;
    node.querySelector("strong").textContent = test.title;
    node.querySelector(".test-card-progress").textContent = `${answered} / ${TARGET_QUESTIONS_PER_TEST} отвечено`;
    node.addEventListener("click", () => {
      state.activeTestIndex = index;
      state.activeQuestionIndex = 0;
      renderTestCards();
      render();
    });

    elements.testCards.appendChild(node);
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

  elements.activeTestLabel.textContent = `Тест ${state.activeTestIndex + 1}`;
  elements.activeTestTitle.textContent = test.title;
  elements.answeredCount.textContent = `${answered} / ${TARGET_QUESTIONS_PER_TEST}`;
  elements.progressBar.style.width = `${Math.min(progressPercent, 100)}%`;
  elements.questionNumber.textContent = `Вопрос ${state.activeQuestionIndex + 1} из ${TARGET_QUESTIONS_PER_TEST}`;
  elements.questionStatus.textContent = isAnswered ? "Отвечен" : "Не отвечен";
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

  elements.feedback.className = `feedback${isCorrect ? "" : " wrong"}`;
  elements.feedback.textContent = isCorrect
    ? `Правильно. Верный ответ: ${correctText}.${explanation}`
    : `Неправильно. Верный ответ: ${correctText}.${explanation}`;
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
    button.textContent = String(index + 1);
    button.title = `Перейти к вопросу ${index + 1}`;
    button.addEventListener("click", () => {
      state.activeQuestionIndex = index;
      render();
    });

    elements.jumpList.appendChild(button);
  });
}

function renderResult(test) {
  const answered = getAnsweredCount(test);
  const total = getQuestionTotal(test);
  const score = getScore(test);
  const allVisibleQuestionsAnswered = answered === total;

  elements.resultPanel.classList.toggle("hidden", !allVisibleQuestionsAnswered);
  elements.resultTitle.textContent = `${score} правильных из ${total}`;
  elements.resultText.textContent =
    total === TARGET_QUESTIONS_PER_TEST
      ? `Итог по тесту: ${score}% при базе из 100 вопросов.`
      : `Пока в базе ${total} вопроса из 100. Когда пришлёшь все вопросы, результат будет считаться по полному тесту.`;
}

function selectAnswer(test, question, answerSourceIndex) {
  state.progress[test.id][question.id] = answerSourceIndex;
  saveProgress();
  renderTestCards();
  render();
}

function getActiveTest() {
  return state.tests[state.activeTestIndex];
}

function getActiveQuestion() {
  const test = getActiveTest();
  return test?.questions[state.activeQuestionIndex];
}

function getQuestionTotal(test) {
  return test.questions.length;
}

function getAnsweredCount(test) {
  return test.questions.filter((question) => Number.isInteger(getSelectedAnswer(test, question))).length;
}

function getSelectedAnswer(test, question) {
  return state.progress[test.id]?.[question.id];
}

function getScore(test) {
  return test.questions.reduce((score, question) => {
    return getSelectedAnswer(test, question) === question.answerSourceIndex ? score + 1 : score;
  }, 0);
}

function moveToFirstMistake() {
  const test = getActiveTest();
  const firstMistake = test.questions.findIndex((question) => {
    return getSelectedAnswer(test, question) !== question.answerSourceIndex;
  });

  state.activeQuestionIndex = firstMistake >= 0 ? firstMistake : 0;
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
  elements.answerOptions.innerHTML = "";
  elements.jumpList.innerHTML = "";
  elements.feedback.className = "feedback hidden";
  elements.resultPanel.classList.add("hidden");
}
