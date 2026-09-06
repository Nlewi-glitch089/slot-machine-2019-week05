/* =====================================================================
   GAME LOGIC (vanilla JavaScript, no libraries)
   1. Config / state          4. Spin handler (core game logic)
   2. Build the paytable      5. Result handling + balance updates
   3. Bet validation          6. Reset button
   ===================================================================== */

/* ---------- 1. CONFIG / STATE ---------- */

// Everything about the reels lives in ONE array so the visuals
// (icons/names) and the payout math always stay in sync.
// 7 symbols total (minimum requirement is 5) — rarer symbols pay more.
const SYMBOLS = [
  { icon: "🍒", name: "Cherry",  multiplier: 2 },
  { icon: "🍋", name: "Lemon",   multiplier: 3 },
  { icon: "🍇", name: "Grape",   multiplier: 4 },
  { icon: "🔔", name: "Bell",    multiplier: 6 },
  { icon: "⭐", name: "Star",    multiplier: 10 },
  { icon: "💎", name: "Diamond", multiplier: 15 },
  { icon: "7️⃣", name: "Seven",   multiplier: 25 },
];

const REEL_COUNT = 3; // exactly 3 reels
const MIN_BET = 5;
const MAX_BET = 50;
const STARTING_BALANCE = 100;
const FLICKER_INTERVAL_MS = 70; // how fast symbols cycle while "spinning"
const STOP_DELAYS_MS = [900, 1500, 2100]; // each reel stops a bit later than the last
const TOTAL_SPIN_MS = Math.max(...STOP_DELAYS_MS) + 300; // buffer after the last reel stops

// Mutable game state
let balance = STARTING_BALANCE;
let currentBet = 0;
let isSpinning = false;
let flickerIntervalIds = [null, null, null];

// Cache DOM elements once
const reelEls = [
  document.getElementById("reel0"),
  document.getElementById("reel1"),
  document.getElementById("reel2"),
];
const reelBoxEls = [
  document.getElementById("reelBox0"),
  document.getElementById("reelBox1"),
  document.getElementById("reelBox2"),
];
const balanceDisplay = document.getElementById("balanceDisplay");
const currentBetDisplay = document.getElementById("currentBetDisplay");
const betForm = document.getElementById("betForm");
const betInput = document.getElementById("betInput");
const betError = document.getElementById("betError");
const betMinBtn = document.getElementById("betMinBtn");
const betMaxBtn = document.getElementById("betMaxBtn");
const spinBtn = document.getElementById("spinBtn");
const resetBtn = document.getElementById("resetBtn");
const leverBtn = document.getElementById("leverBtn");
const resultBanner = document.getElementById("resultBanner");
const resultText = resultBanner.querySelector(".result-text");
const paytableGrid = document.getElementById("paytableGrid");

/* ---------- 2. BUILD THE PAYTABLE ---------- */

function buildPaytable() {
  SYMBOLS.forEach((sym) => {
    const row = document.createElement("div");
    row.className = "paytable-row";
    row.innerHTML =
      `<span class="paytable-icon">${sym.icon}${sym.icon}${sym.icon}</span>` +
      `<span class="paytable-name">${sym.name}</span>` +
      `<span class="paytable-multiplier">x${sym.multiplier}</span>`;
    paytableGrid.appendChild(row);
  });
}

/* ---------- 3. BET VALIDATION ---------- */

// Returns { valid: true, amount } or { valid: false, message }
function validateBet(rawValue) {
  if (rawValue === "" || rawValue === null) {
    return { valid: false, message: "Enter a bet amount to spin." };
  }

  const amount = Number(rawValue);

  // Reject anything that isn't a real number (e.g. "abc")
  if (Number.isNaN(amount)) {
    return { valid: false, message: "Bet must be a valid number." };
  }

  // Reject decimals — whole dollars only
  if (!Number.isInteger(amount)) {
    return { valid: false, message: "Bet must be a whole dollar amount (no decimals)." };
  }

  // Enforce the $5–$50 range
  if (amount < MIN_BET) {
    return { valid: false, message: `Minimum bet is $${MIN_BET}.` };
  }
  if (amount > MAX_BET) {
    return { valid: false, message: `Maximum bet is $${MAX_BET}.` };
  }

  // Can't bet more than you have
  if (amount > balance) {
    return { valid: false, message: "You don't have enough balance for that bet." };
  }

  return { valid: true, amount };
}

/* ---------- 4. SPIN HANDLER ---------- */

betForm.addEventListener("submit", (event) => {
  event.preventDefault(); // stop the page from reloading
  if (isSpinning) return; // block repeated clicks while the reels are spinning

  const validation = validateBet(betInput.value);

  if (!validation.valid) {
    betError.textContent = validation.message;
    return;
  }

  betError.textContent = ""; // clear any previous error
  currentBet = validation.amount;
  currentBetDisplay.textContent = `$${currentBet}`;

  spin();
});

betMinBtn.addEventListener("click", () => {
  if (isSpinning) return;
  betInput.value = MIN_BET;
  betError.textContent = "";
});

betMaxBtn.addEventListener("click", () => {
  if (isSpinning) return;
  betInput.value = Math.min(MAX_BET, balance);
  betError.textContent = "";
});

leverBtn.addEventListener("click", () => {
  if (isSpinning) return;
  betForm.requestSubmit();
});

function spin() {
  isSpinning = true;
  spinBtn.disabled = true;
  betInput.disabled = true;
  betMinBtn.disabled = true;
  betMaxBtn.disabled = true;

  // Deduct the bet immediately — it's "on the table" while the reels spin.
  updateBalance(-currentBet);

  resultBanner.classList.remove("win", "lose");
  resultText.textContent = "Spinning...";

  reelBoxEls.forEach((box) => box.classList.remove("win"));

  // --- Pick each reel's final symbol using JavaScript's random number generator ---
  const finalSymbols = reelEls.map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);

  // Start the flicker effect on every reel — rapidly cycling random symbols
  // gives the visual impression of a spinning reel without a real animation loop.
  reelEls.forEach((reelEl, i) => {
    reelBoxEls[i].classList.add("spinning");
    flickerIntervalIds[i] = setInterval(() => {
      reelEl.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].icon;
    }, FLICKER_INTERVAL_MS);

    // Stop this reel at its staggered delay, landing on its final symbol.
    setTimeout(() => stopReel(i, finalSymbols[i]), STOP_DELAYS_MS[i]);
  });

  // Once every reel has stopped, reveal the win/loss outcome.
  setTimeout(() => handleResult(finalSymbols), TOTAL_SPIN_MS);
}

function stopReel(index, symbol) {
  clearInterval(flickerIntervalIds[index]);
  flickerIntervalIds[index] = null;

  const reelEl = reelEls[index];
  reelBoxEls[index].classList.remove("spinning");
  reelEl.textContent = symbol.icon;

  // Little "thunk" bounce when the reel lands, replayed by re-triggering the animation.
  reelEl.classList.remove("stopped-bounce");
  void reelEl.offsetWidth; // force reflow so the animation restarts
  reelEl.classList.add("stopped-bounce");
}

/* ---------- 5. RESULT HANDLING ---------- */

function handleResult(symbols) {
  const [a, b, c] = symbols;
  const allMatch = a.name === b.name && b.name === c.name;
  const pairMatch = !allMatch && (a.name === b.name || b.name === c.name || a.name === c.name);

  if (allMatch) {
    // "multiplier" is the TOTAL return, not the profit — a x2 symbol pays
    // back double the bet, so payout = bet * multiplier (not bet * (multiplier - 1)).
    const payout = currentBet * a.multiplier;
    updateBalance(payout);
    const profit = payout - currentBet;

    reelBoxEls.forEach((box) => box.classList.add("win"));
    resultText.innerHTML =
      `🎉 JACKPOT! Three ${a.name}s (${a.icon}${a.icon}${a.icon})!<br>` +
      `Total payout: $${payout}<br>` +
      `Net profit: $${profit}`;
    resultBanner.classList.add("win");
  } else if (pairMatch) {
    // Two matching symbols returns the bet — a break-even "push", same
    // idea as the 1x segment in the original wheel version of this game.
    const payout = currentBet;
    updateBalance(payout);

    resultText.innerHTML =
      `Two matching symbols!<br>` +
      `Total payout: $${payout}<br>` +
      `You broke even.`;
    resultBanner.classList.add("win");
  } else {
    resultText.innerHTML =
      `No match.<br>` +
      `You lost your $${currentBet} bet.`;
    resultBanner.classList.add("lose");
  }

  isSpinning = false;
  spinBtn.disabled = false;
  betInput.disabled = false;
  betMinBtn.disabled = false;
  betMaxBtn.disabled = false;

  // If the player is out of money, point them to the reset button.
  if (balance < MIN_BET) {
    betError.textContent = `You're out of chips! Click "Reset Game" to keep playing.`;
  }
}

function updateBalance(amount) {
  balance += amount;
  balanceDisplay.textContent = `$${balance}`;
}

/* ---------- 6. RESET BUTTON ---------- */

resetBtn.addEventListener("click", () => {
  if (isSpinning) return; // don't reset mid-spin

  balance = STARTING_BALANCE;
  currentBet = 0;
  balanceDisplay.textContent = `$${balance}`;
  currentBetDisplay.textContent = "$0";
  betInput.value = "";
  betError.textContent = "";
  resultBanner.classList.remove("win", "lose");
  resultText.textContent = "Place a bet and spin to play!";

  reelEls.forEach((reelEl) => {
    reelEl.textContent = "❔";
    reelEl.classList.remove("stopped-bounce");
  });
  reelBoxEls.forEach((box) => box.classList.remove("win", "spinning"));
});

/* ---------- INIT ---------- */
buildPaytable();
