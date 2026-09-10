/**
 * Plain Canvas 2D demo game with three deliberately planted bugs (§7).
 *
 * ~300 lines, no Phaser, no engine. The three bugs map exactly to seeded
 * issues so live reports genuinely cluster onto them:
 *
 *  1. **Collision trap near the lift** (scene: "atrium", ~128,0,96)
 *     The player gets stuck/frozen near the lift area.
 *
 *  2. **Audio dropout in the server room** (scene: "server-room", ~20,0,20)
 *     All sound cuts out when entering the server room.
 *
 *  3. **Frame-rate spike with many entities** (scene: "courtyard", ~64,0,205)
 *     FPS tanks when drones spawn in the courtyard.
 *
 * The game registers `window.__repro.getState()` so the overlay can read
 * the current scene, position, and playtime.
 */

// ── Types ────────────────────────────────────────────────────────────

interface Entity {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  vx: number;
  vy: number;
}

interface Room {
  name: string;
  bg: string;
  floor: string;
  label: string;
  /** World coordinates reported to the overlay. */
  world: { scene: string; x: number; y: number; z: number };
}

// ── Rooms ────────────────────────────────────────────────────────────

const ROOMS: Room[] = [
  {
    name: "Atrium",
    bg: "#101615",
    floor: "#1d2926",
    label: "ATRIUM — walk right →",
    world: { scene: "atrium", x: 128, y: 0, z: 96 },
  },
  {
    name: "Server Room",
    bg: "#0e1211",
    floor: "#192420",
    label: "SERVER ROOM — walk right →",
    world: { scene: "server-room", x: 20, y: 0, z: 20 },
  },
  {
    name: "Courtyard",
    bg: "#141918",
    floor: "#1f2d28",
    label: "COURTYARD — walk right →",
    world: { scene: "courtyard", x: 64, y: 0, z: 205 },
  },
];

// ── Game State ───────────────────────────────────────────────────────

let currentRoom = 0;
let playerX = 100;
let playerY = 0;
const PLAYER_W = 28;
const PLAYER_H = 44;
const SPEED = 3.5;
const GRAVITY = 0.7;
let playerVy = 0;
let grounded = true;
let startTime = Date.now();

// Controls
const keys: Record<string, boolean> = {};

// Bug 1: lift freeze state
let liftFrozen = false;
let liftFreezeTimer = 0;

// Bug 2: audio state
let audioPlaying = true;
let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;

// Bug 3: drone entities
const drones: Entity[] = [];
let droneSpawnTimer = 0;
let heavyCompute = false;

// ── Canvas ───────────────────────────────────────────────────────────

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let W = 1280;
let H = 720;
let animId = 0;

// ── Lift geometry (room 0) ───────────────────────────────────────────

const LIFT_X = 580;
const LIFT_W = 60;
const LIFT_H = 120;

// ── Draw helpers ─────────────────────────────────────────────────────

function drawRoom(room: Room): void {
  if (!ctx) return;
  // Sky
  ctx.fillStyle = room.bg;
  ctx.fillRect(0, 0, W, H);

  // Floor
  const floorY = H * 0.72;
  ctx.fillStyle = room.floor;
  ctx.fillRect(0, floorY, W, H - floorY);

  // Label
  ctx.fillStyle = "#6e7b77";
  ctx.font = "500 16px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(room.label, 30, 34);

  // Room-specific decorations
  if (currentRoom === 0) {
    // Lift
    ctx.fillStyle = liftFrozen ? "#d2452b" : "#2f3f3a";
    ctx.fillRect(LIFT_X, floorY - LIFT_H, LIFT_W, LIFT_H);
    ctx.fillStyle = "#6e7b77";
    ctx.font = "400 11px ui-monospace, Menlo, monospace";
    ctx.fillText("LIFT", LIFT_X + 12, floorY - LIFT_H + 20);
    if (liftFrozen) {
      ctx.fillStyle = "#d2452b";
      ctx.font = "600 14px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText("⚠ FROZEN", LIFT_X - 10, floorY - LIFT_H - 12);
    }
  }

  if (currentRoom === 1) {
    // Server racks
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = "#1a2823";
      ctx.fillRect(180 + i * 140, floorY - 180, 80, 180);
      // Blinking lights
      for (let j = 0; j < 8; j++) {
        ctx.fillStyle = Math.random() > 0.5 ? "#0f5e58" : "#1a2823";
        ctx.fillRect(190 + i * 140 + (j % 4) * 14, floorY - 170 + Math.floor(j / 4) * 40, 6, 6);
      }
    }
    if (!audioPlaying) {
      ctx.fillStyle = "#d2452b";
      ctx.font = "600 14px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText("🔇 AUDIO DROPOUT", 30, 60);
    }
  }

  if (currentRoom === 2) {
    // Ground markers
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = "#2f3f3a";
      ctx.fillRect(200 + i * 200, floorY - 100, 120, 100);
    }
  }
}

function drawPlayer(): void {
  if (!ctx) return;
  const floorY = H * 0.72;
  const py = floorY - PLAYER_H + playerY;
  ctx.fillStyle = "#c9d3d0";
  ctx.fillRect(playerX, py, PLAYER_W, PLAYER_H);
  // Eyes
  ctx.fillStyle = "#141a18";
  ctx.fillRect(playerX + 8, py + 10, 4, 4);
  ctx.fillRect(playerX + 18, py + 10, 4, 4);
}

function drawDrones(): void {
  if (!ctx) return;
  for (const d of drones) {
    ctx.fillStyle = d.color;
    ctx.fillRect(d.x, d.y, d.w, d.h);
  }
}

function drawHUD(): void {
  if (!ctx) return;
  const fps = heavyCompute ? "⚠ LOW FPS" : "60 FPS";
  ctx.fillStyle = "#6e7b77";
  ctx.font = "400 12px ui-monospace, Menlo, monospace";
  ctx.fillText(`Room: ${ROOMS[currentRoom].name} | ${fps} | Press F1 to report`, 30, H - 20);

  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  ctx.fillText(`Playtime: ${min}:${sec.toString().padStart(2, "0")}`, W - 180, H - 20);
}

// ── Audio ────────────────────────────────────────────────────────────

function startAudio(): void {
  try {
    if (audioContext) return;
    audioContext = new AudioContext();
    oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    gain.gain.value = 0.03;
    oscillator.type = "sine";
    oscillator.frequency.value = 220;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    audioPlaying = true;
  } catch {
    // audio not available
  }
}

function stopAudio(): void {
  try {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
    }
    if (audioContext) {
      void audioContext.close();
      audioContext = null;
    }
    audioPlaying = false;
  } catch {
    // fail silently
  }
}

// ── Bug triggers ─────────────────────────────────────────────────────

function checkLiftCollision(): void {
  if (currentRoom !== 0) return;
  const floorY = H * 0.72;
  const py = floorY - PLAYER_H + playerY;

  // BUG 1: Collision trap near the lift. Player gets frozen.
  if (
    playerX + PLAYER_W > LIFT_X &&
    playerX < LIFT_X + LIFT_W &&
    py + PLAYER_H > floorY - LIFT_H &&
    py < floorY
  ) {
    if (!liftFrozen) {
      liftFrozen = true;
      liftFreezeTimer = 180; // ~3 seconds at 60fps
      console.error("Uncaught TypeError: cannot read 'mesh' of null at Lift.tick (lift.js:42)");
      console.error("entity ent_7f3a detached from scene graph");
    }
  }
}

function checkAudioBug(): void {
  // BUG 2: Audio drops out in the server room.
  if (currentRoom === 1 && audioPlaying) {
    stopAudio();
    console.error("Failed to decode audio buffer (channel 2)");
    console.error("Assertion failed: mixer.channels > 0");
  }
  if (currentRoom !== 1 && !audioPlaying) {
    // Audio stays dead even after leaving — realistic bug behavior.
    // Only a page reload restores it.
  }
}

function updateDrones(): void {
  if (currentRoom !== 2) {
    drones.length = 0;
    heavyCompute = false;
    return;
  }

  // BUG 3: Frame-rate spike when many entities spawn.
  droneSpawnTimer++;
  if (droneSpawnTimer % 15 === 0 && drones.length < 80) {
    const floorY = H * 0.72;
    drones.push({
      x: Math.random() * W,
      y: floorY - 140 - Math.random() * 200,
      w: 12 + Math.random() * 8,
      h: 12 + Math.random() * 8,
      color: `hsl(${160 + Math.random() * 40}, 30%, ${20 + Math.random() * 15}%)`,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 2,
    });
  }

  for (const d of drones) {
    d.x += d.vx;
    d.y += d.vy;
    if (d.x < 0 || d.x > W) d.vx *= -1;
    if (d.y < H * 0.2 || d.y > H * 0.72 - 20) d.vy *= -1;
  }

  // Deliberate performance hit when many drones are active.
  if (drones.length > 30) {
    heavyCompute = true;
    // Simulate expensive per-entity work.
    let waste = 0;
    for (let i = 0; i < drones.length * 800; i++) {
      waste += Math.sqrt(i * Math.random());
    }
    // Prevent dead-code elimination.
    if (waste < -1) console.log(waste);

    if (drones.length > 40) {
      console.warn(`frame budget exceeded: ${(16 + drones.length * 0.8).toFixed(0)}ms`);
    }
    if (drones.length > 50 && Math.random() < 0.05) {
      console.error(`Failed to allocate instance buffer, falling back (${drones.length} draws)`);
    }
  } else {
    heavyCompute = false;
  }
}

// ── Game loop ────────────────────────────────────────────────────────

function update(): void {
  // Lift freeze holds the player in place.
  if (liftFrozen) {
    liftFreezeTimer--;
    if (liftFreezeTimer <= 0) {
      liftFrozen = false;
      playerX = LIFT_X - PLAYER_W - 10;
    }
    return;
  }

  // Movement
  if (keys["ArrowLeft"] || keys["a"]) playerX -= SPEED;
  if (keys["ArrowRight"] || keys["d"]) playerX += SPEED;
  if ((keys["ArrowUp"] || keys["w"] || keys[" "]) && grounded) {
    playerVy = -12;
    grounded = false;
  }

  // Gravity
  playerVy += GRAVITY;
  playerY += playerVy;
  if (playerY >= 0) {
    playerY = 0;
    playerVy = 0;
    grounded = true;
  }

  // Room transitions
  if (playerX > W - 10) {
    currentRoom = (currentRoom + 1) % ROOMS.length;
    playerX = 30;
  }
  if (playerX < -10) {
    currentRoom = (currentRoom - 1 + ROOMS.length) % ROOMS.length;
    playerX = W - 50;
  }

  checkLiftCollision();
  checkAudioBug();
  updateDrones();
}

function render(): void {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  drawRoom(ROOMS[currentRoom]);
  drawDrones();
  drawPlayer();
  drawHUD();
}

function loop(): void {
  update();
  render();
  animId = requestAnimationFrame(loop);
}

// ── Public API ───────────────────────────────────────────────────────

export function startDemoGame(target: HTMLCanvasElement): void {
  canvas = target;
  canvas.setAttribute("data-repro-game", "true");
  ctx = canvas.getContext("2d");
  if (!ctx) return;

  W = canvas.width;
  H = canvas.height;
  startTime = Date.now();
  playerX = 100;
  playerY = 0;
  currentRoom = 0;
  liftFrozen = false;
  drones.length = 0;

  // Register __repro.getState() for the overlay.
  window.__repro = {
    getState: () => ({
      scene: ROOMS[currentRoom].world.scene,
      x: ROOMS[currentRoom].world.x + (playerX / W) * 20 - 10,
      y: ROOMS[currentRoom].world.y,
      z: ROOMS[currentRoom].world.z + (playerY / H) * 10,
      playtimeSec: Math.floor((Date.now() - startTime) / 1000),
    }),
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    keys[e.key] = true;
  };
  const handleKeyUp = (e: KeyboardEvent): void => {
    keys[e.key] = false;
  };

  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);

  // Start ambient audio after first interaction.
  const onInteract = (): void => {
    startAudio();
    document.removeEventListener("click", onInteract);
    document.removeEventListener("keydown", onInteract);
  };
  document.addEventListener("click", onInteract);
  document.addEventListener("keydown", onInteract);

  activeCleanups = () => {
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("keyup", handleKeyUp);
    document.removeEventListener("click", onInteract);
    document.removeEventListener("keydown", onInteract);
  };

  loop();
}

let activeCleanups: (() => void) | null = null;

export function stopDemoGame(): void {
  if (animId) cancelAnimationFrame(animId);
  animId = 0;
  if (activeCleanups) {
    activeCleanups();
    activeCleanups = null;
  }
  stopAudio();
  drones.length = 0;
  delete window.__repro;
}
