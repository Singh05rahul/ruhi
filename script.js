
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const screens = $$(".screen");
const chapterLabel = $("#chapterLabel");
const toast = $("#toast");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const chapterNames = {
  intro: "A LITTLE SURPRISE",
  welcome: "A NOTE FOR YOU",
  door: "THE MUSEUM OF US",
  gallery: "ROOM 01 · THE GALLERY",
  puzzle: "ROOM 02 · THE RESTORATION DESK",
  notes: "ROOM 03 · THE NOTE WALL",
  letter: "ROOM 04 · THE READING ROOM",
  promises: "ROOM 05 · THE PROMISE WALL",
  ending: "A LITTLE FOREVER"
};

let currentScreen = "intro";
let toastTimer;
let selectedPiece = null;
let puzzleMoves = 0;
let puzzleRevealed = false;
let knocks = 0;
let knockTimer;
let ambientAudio = null;

// Star field and falling petals.
function createDecorations() {
  const starRoot = $("#stars");
  const petalRoot = $("#petals");
  if (!starRoot || !petalRoot || reducedMotion) return;

  const starFragment = document.createDocumentFragment();
  for (let i = 0; i < 45; i++) {
    const star = document.createElement("span");
    star.className = "star";
    star.textContent = Math.random() > 0.5 ? "✦" : "·";
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.fontSize = `${5 + Math.random() * 10}px`;
    star.style.setProperty("--duration", `${2 + Math.random() * 4}s`);
    star.style.setProperty("--delay", `${Math.random() * -5}s`);
    starFragment.appendChild(star);
  }
  starRoot.appendChild(starFragment);

  const petalFragment = document.createDocumentFragment();
  const petalCount = window.innerWidth < 600 ? 12 : 23;

  for (let i = 0; i < petalCount; i++) {
    const petal = document.createElement("span");
    petal.className = "petal";
    petal.style.setProperty("--left", `${Math.random() * 100}%`);
    petal.style.setProperty("--size", `${7 + Math.random() * 10}px`);
    petal.style.setProperty("--duration", `${10 + Math.random() * 12}s`);
    petal.style.setProperty("--delay", `${Math.random() * -20}s`);
    petal.style.setProperty("--drift", `${-100 + Math.random() * 200}px`);
    petal.style.setProperty("--rotation", `${300 + Math.random() * 700}deg`);
    petal.style.setProperty("--opacity", `${0.25 + Math.random() * 0.45}`);
    petalFragment.appendChild(petal);
  }
  petalRoot.appendChild(petalFragment);
}

createDecorations();

// Screen navigation.
function goTo(screenId) {
  const nextScreen = document.getElementById(screenId);
  if (!nextScreen || !nextScreen.classList.contains("screen")) return;

  if (currentScreen === screenId) return;

  const oldScreen = document.getElementById(currentScreen);
  if (oldScreen) {
    oldScreen.classList.remove("active");
    oldScreen.classList.remove("leaving");
  }

  screens.forEach(screen => screen.setAttribute("aria-hidden", String(screen.id !== screenId)));
  nextScreen.classList.remove("leaving");
  nextScreen.classList.add("active");

  currentScreen = screenId;
  chapterLabel.textContent = chapterNames[screenId] || "MADE FOR YOU";
  window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });

  if (screenId === "puzzle") setupPuzzle();
  if (screenId === "ending") updateEnding();
}

$$("[data-go]").forEach(button => {
  button.addEventListener("click", () => goTo(button.dataset.go));
});

// Brand returns to the beginning.
$("#brandHome").addEventListener("click", event => {
  event.preventDefault();
  if (currentScreen !== "intro") goTo("intro");
});

// Museum door: three clicks to knock.
$("#museumDoor").addEventListener("click", () => {
  knocks++;
  const door = $("#museumDoor");
  door.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(4px)" },
      { transform: "translateX(0)" }
    ],
    { duration: 220, easing: "ease-out" }
  );

  clearTimeout(knockTimer);
  if (knocks < 3) {
    showToast(knocks === 1 ? "Knock, knock… ♡" : "One more little knock… ✧");
    knockTimer = setTimeout(() => { knocks = 0; }, 1800);
    return;
  }

  knocks = 0;
  showToast("The museum doors are opening…");
  door.animate(
    [
      { transform: "scale(1)", filter: "brightness(1)" },
      { transform: "scale(1.05)", filter: "brightness(1.7)" },
      { transform: "scale(.96)", filter: "brightness(1.2)" }
    ],
    { duration: 650, easing: "ease-in-out" }
  );
  setTimeout(() => goTo("gallery"), reducedMotion ? 0 : 650);
});

// Check if the two local photo files exist and show the real photo.
$$(".memory-photo").forEach(img => {
  img.addEventListener("load", () => {
    if (img.naturalWidth > 0) img.closest(".photo-frame").classList.add("has-photo");
  });

  img.addEventListener("error", () => {
    img.closest(".photo-frame").classList.remove("has-photo");
  });

  if (img.complete && img.naturalWidth > 0) {
    img.closest(".photo-frame").classList.add("has-photo");
  }
});


/* ==========================================
   LUXURY ROMANTIC PHOTO PUZZLE
   Click + Mouse Drag + Mobile Touch Support
========================================== */

const puzzleBoard = $("#puzzleBoard");

let puzzleOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8];
let puzzleDrag = null;
let suppressPuzzleClick = false;
let puzzleDragTimer = null;

function shufflePuzzle() {
  // Start with a solvable puzzle: shuffle from solved order
  // using valid adjacent swaps.
  puzzleOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  for (let i = 0; i < 35; i++) {
    const a = Math.floor(Math.random() * 9);
    let b = Math.floor(Math.random() * 9);

    while (b === a) {
      b = Math.floor(Math.random() * 9);
    }

    [puzzleOrder[a], puzzleOrder[b]] =
      [puzzleOrder[b], puzzleOrder[a]];
  }

  if (puzzleOrder.every((value, index) => value === index)) {
    [puzzleOrder[0], puzzleOrder[1]] =
      [puzzleOrder[1], puzzleOrder[0]];
  }
}

function setupPuzzle() {
  if (puzzleBoard.dataset.ready === "true") return;

  puzzleBoard.dataset.ready = "true";
  shufflePuzzle();
  renderPuzzle();
}

function renderPuzzle() {
  puzzleBoard.replaceChildren();
  selectedPiece = null;

  const photo = $("#gallery .memory-photo");
  const hasPhoto = photo && photo.complete && photo.naturalWidth > 0;

  puzzleOrder.forEach((pieceValue, position) => {
    const piece = document.createElement("button");

    piece.type = "button";
    piece.className = "puzzle-piece";
    piece.dataset.position = String(position);
    piece.dataset.value = String(pieceValue);
    piece.dataset.number = String(pieceValue + 1);

    piece.setAttribute(
      "aria-label",
      `Puzzle piece ${pieceValue + 1}. Drag to move or click to swap.`
    );

    piece.style.touchAction = "none";
    piece.style.cursor = "grab";
    piece.style.position = "relative";
    piece.style.overflow = "hidden";
    piece.style.userSelect = "none";
    piece.style.webkitUserSelect = "none";

    if (hasPhoto && !puzzleRevealed) {
      const img = document.createElement("img");

      img.src = photo.src;
      img.alt = "";
      img.draggable = false;

      Object.assign(img.style, {
        width: "300%",
        height: "300%",
        maxWidth: "none",
        position: "absolute",
        pointerEvents: "none",
        left: `${-(pieceValue % 3) * 100}%`,
        top: `${-Math.floor(pieceValue / 3) * 100}%`
      });

      piece.appendChild(img);
    } else {
      piece.style.background =
        `radial-gradient(circle at ${
          20 + (pieceValue % 3) * 30
        }% ${
          20 + Math.floor(pieceValue / 3) * 30
        }%, #bd829a, #321725 75%)`;
    }

    // Keep click-to-swap as an alternative to dragging.
    piece.addEventListener("click", () => {
      if (suppressPuzzleClick) {
        suppressPuzzleClick = false;
        return;
      }

      selectPuzzlePiece(piece);
    });

    // Start drag on mouse or touch.
    piece.addEventListener("pointerdown", event => {
      if (puzzleRevealed || event.button > 0) return;

      puzzleDrag = {
        piece,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        from: Number(piece.dataset.position),
        moved: false
      };

      piece.style.cursor = "grabbing";
      piece.classList.add("dragging");
      piece.setPointerCapture(event.pointerId);
    });

    piece.addEventListener("pointermove", event => {
      if (!puzzleDrag ||
          puzzleDrag.pointerId !== event.pointerId) return;

      const dx = event.clientX - puzzleDrag.startX;
      const dy = event.clientY - puzzleDrag.startY;

      if (Math.abs(dx) + Math.abs(dy) > 8) {
        puzzleDrag.moved = true;
      }

      if (puzzleDrag.moved) {
        piece.style.transform =
          `translate(${dx * 0.12}px, ${dy * 0.12}px) scale(0.96)`;
        piece.style.zIndex = "5";
      }
    });

    piece.addEventListener("pointerup", event => {
      if (!puzzleDrag ||
          puzzleDrag.pointerId !== event.pointerId) return;

      const drag = puzzleDrag;
      const wasDragged = drag.moved;

      // Find the destination before resetting the dragged piece.
      let target = null;

      if (wasDragged) {
        const underneath = document.elementFromPoint(
          event.clientX,
          event.clientY
        );

        target = underneath?.closest(".puzzle-piece") || null;

        if (target && !puzzleBoard.contains(target)) {
          target = null;
        }
      }

      piece.style.transform = "";
      piece.style.zIndex = "";
      piece.style.cursor = "grab";
      piece.classList.remove("dragging");

      puzzleDrag = null;

      if (!wasDragged) return;

      suppressPuzzleClick = true;
      clearTimeout(puzzleDragTimer);

      puzzleDragTimer = setTimeout(() => {
        suppressPuzzleClick = false;
      }, 400);

      if (!target || target === piece) {
        renderPuzzle();
        return;
      }

      const from = drag.from;
      const to = Number(target.dataset.position);

      if (from !== to) {
        swapPuzzlePieces(from, to);
      } else {
        renderPuzzle();
      }
    });

    piece.addEventListener("pointercancel", () => {
      if (!puzzleDrag || puzzleDrag.piece !== piece) return;

      puzzleDrag = null;
      renderPuzzle();
    });

    puzzleBoard.appendChild(piece);
  });

  updatePuzzleStatus();
}

function swapPuzzlePieces(from, to) {
  if (from === to) return;

  [puzzleOrder[from], puzzleOrder[to]] =
    [puzzleOrder[to], puzzleOrder[from]];

  puzzleMoves++;

  renderPuzzle();

  if (puzzleOrder.every((value, index) => value === index)) {
    $("#puzzleMessage").textContent =
      "Our beautiful memory is back together! ♡";

    showToast("You restored our memory! ✨");

    if (!reducedMotion) {
      puzzleBoard.animate(
        [
          { transform: "scale(0.98)", opacity: 0.8 },
          { transform: "scale(1.02)", opacity: 1 },
          { transform: "scale(1)", opacity: 1 }
        ],
        { duration: 500, easing: "ease-out" }
      );
    }
  }
}

function selectPuzzlePiece(piece) {
  if (puzzleRevealed) return;

  if (!selectedPiece) {
    selectedPiece = piece;
    piece.classList.add("selected");
    return;
  }

  if (selectedPiece === piece) {
    piece.classList.remove("selected");
    selectedPiece = null;
    return;
  }

  const from = Number(selectedPiece.dataset.position);
  const to = Number(piece.dataset.position);

  swapPuzzlePieces(from, to);
}

function updatePuzzleStatus() {
  $("#puzzleMoves").textContent = `Moves: ${puzzleMoves}`;

  const solved = puzzleOrder.every(
    (value, index) => value === index
  );

  $("#puzzleMessage").textContent = solved
    ? "You put it back together! ♡"
    : "Drag a piece onto another piece, or click two pieces ♡";
}

// Preview the original photo without losing the current arrangement.
$("#peekPuzzle").addEventListener("click", () => {
  puzzleRevealed = !puzzleRevealed;

  $("#peekPuzzle").textContent = puzzleRevealed
    ? "Try the puzzle again"
    : "Show me the photo";

  renderPuzzle();

  $("#puzzleMessage").textContent = puzzleRevealed
    ? "Here's your memory ♡"
    : "Ready when you are ✧";
});



// Interactive reason notes.
$$(".love-note").forEach(note => {
  note.addEventListener("click", () => {
    note.classList.toggle("open");
    note.setAttribute("aria-expanded", String(note.classList.contains("open")));
  });
});

$("#openAllNotes").addEventListener("click", () => {
  const notes = $$(".love-note");
  const allOpen = notes.every(note => note.classList.contains("open"));
  notes.forEach(note => {
    note.classList.toggle("open", !allOpen);
    note.setAttribute("aria-expanded", String(!allOpen));
  });
  $("#openAllNotes").textContent = allOpen ? "Open all my notes ✧" : "Close my notes ↺";
});

// Open the sealed letter.
$("#sealedEnvelope").addEventListener("click", () => {
  const envelope = $("#sealedEnvelope");
  const isOpen = envelope.classList.toggle("open");
  envelope.setAttribute("aria-expanded", String(isOpen));
  $("#letterHint").textContent = isOpen
    ? "Take your time. Every word is for you ♡"
    : "Tap the wax seal to open your letter";
});

// Promise checklist.
function updatePromiseCounter() {
  const checked = $$(".promise-item.checked").length;
  $("#promiseCounter").textContent = `${checked} promise${checked === 1 ? "" : "s"} held close`;
}

$$(".promise-item").forEach(item => {
  item.setAttribute("aria-pressed", "false");
  item.addEventListener("click", () => {
    item.classList.toggle("checked");
    item.setAttribute("aria-pressed", String(item.classList.contains("checked")));
    updatePromiseCounter();
  });
});

// Final screen date.
function updateEnding() {
  const date = new Date();
  $("#finalDate").textContent = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

// Restart the full journey.
$("#restartButton").addEventListener("click", () => {
  // Reset interactive elements for a fresh walk-through.
  $$(".love-note").forEach(note => {
    note.classList.remove("open");
    note.setAttribute("aria-expanded", "false");
  });

  $("#openAllNotes").textContent = "Open all my notes ✧";
  $("#sealedEnvelope").classList.remove("open");
  $("#sealedEnvelope").setAttribute("aria-expanded", "false");
  $("#letterHint").textContent = "Tap the wax seal to open your letter";

  $$(".promise-item").forEach(item => {
    item.classList.remove("checked");
    item.setAttribute("aria-pressed", "false");
  });
  updatePromiseCounter();

  puzzleBoard.dataset.ready = "false";
  puzzleRevealed = false;
  puzzleMoves = 0;
  $("#peekPuzzle").textContent = "Show me the photo";

  goTo("intro");
});

// Small toast helper.
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

// No audio starts automatically. Button provides a gentle ambient tone.
$("#soundButton").addEventListener("click", () => {
  showToast("Ambient music can be added when you choose a song ♫");
});

/* CINEMATIC INTRO START + HEART BURST */

function replayIntroAnimation() {
  const intro = document.getElementById("intro");
  if (!intro) return;

  // Restart the intro's CSS entrance sequence.
  intro.classList.remove("active");
  void intro.offsetWidth;
  intro.classList.add("active");

  // Reflow ensures the entrance animation restarts.
  intro.querySelectorAll(
    ".orbit-heart, .eyebrow, .display-title, .intro-copy, .primary-button, .tiny-note, .bottom-scroll"
  ).forEach(element => {
    element.style.animation = "none";
    void element.offsetWidth;
    element.style.removeProperty("animation");
  });
}

function heartBurst(button) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const rect = button.getBoundingClientRect();
  const symbols = ["♡", "♥", "✧", "✦", "❀"];

  for (let i = 0; i < 18; i++) {
    const particle = document.createElement("span");
    particle.textContent = symbols[Math.floor(Math.random() * symbols.length)];

    Object.assign(particle.style, {
      position: "fixed",
      zIndex: "100",
      left: `${rect.left + rect.width / 2}px`,
      top: `${rect.top + rect.height / 2}px`,
      pointerEvents: "none",
      color: i % 3 === 0 ? "#d5b17e" : "#f2a9bf",
      fontSize: `${12 + Math.random() * 17}px`,
      textShadow: "0 0 14px #ef9caf",
      willChange: "transform, opacity"
    });

    document.body.appendChild(particle);

    const angle = Math.random() * Math.PI * 2;
    const distance = 45 + Math.random() * 125;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance - 30;

    const animation = particle.animate(
      [
        { transform: "translate(-50%, -50%) scale(.2) rotate(0deg)", opacity: 0 },
        { transform: "translate(-50%, -50%) scale(1.2) rotate(25deg)", opacity: 1, offset: .2 },
        { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(.3) rotate(${Math.random() * 150}deg)`, opacity: 0 }
      ],
      { duration: 850 + Math.random() * 600, easing: "cubic-bezier(.16,1,.3,1)" }
    );

    animation.onfinish = () => particle.remove();
  }
}

const introButton = document.querySelector('#intro [data-go="welcome"]');

if (introButton) {
  introButton.addEventListener("click", () => heartBurst(introButton));
}

// Run the opening animation when the page first loads.
window.addEventListener("load", () => {
  replayIntroAnimation();
});
