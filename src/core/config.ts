/**
 * 所有可調參數　[擁有者：人類]
 *
 * ⚠️ 這個檔案禁止 AI 生成或修改數值。
 * 這些數字只能靠人坐在螢幕前試出來，而它們才是決定 demo 成不成功的東西。
 * 調參時只改這個檔案，不會跟別人衝突。
 */

export const CONFIG = {
  // ── Tracking [Ivan] ───────────────────────────
  TIP_EXTEND: 0.055,            // 筆尖外推距離，normalized 畫面比例
  ONE_EURO_MIN_CUTOFF: 1.0,
  ONE_EURO_BETA: 0.007,
  LOST_FRAMES: 5,
  WEBCAM_W: 640, WEBCAM_H: 480, // 不要開 720p
  CV_HZ: 30,

  // ── Runes [B] ─────────────────────────────────
  CAST_THRESHOLD: 0.80,
  HINT_THRESHOLD: 0.65,
  MIN_STROKE_POINTS: 8,
  MAX_STROKE_MS: 4000,
  RESAMPLE_N: 64,
  CORNER_ANGLE_DEG: 55,         // 角點判定：3 角 → △ 攻擊，4 角 → □ 建造

  // ── Match [P2] ────────────────────────────────
  HP_MAX: 10,
  DMG_ATTACK: 2,
  PROJ_MS: 800,                 // 投射物飛行時間
  HIT_WIDTH: 0.10,              // 命中判定寬度。太窄玩家會覺得「明明中了」
  MOVE_SPEED: 0.55,             // 每秒走過畫面寬度的比例。無慣性無加速度
  MATCH_TIME_S: 90,

  // ── 魔量與遮蔽物 [P2] ─────────────────────────
  MP_MAX: 100,
  MP_REGEN_PER_S: 14,           // 約 7 秒回滿
  COST: { attack: 25, wall: 45 },   // 蓋牆貴，蓋完一時打不出去
  COVER_HP: 2,                  // 承受兩次攻擊才消失
  COVER_MAX: 2,                 // 每人最多幾面，超過最舊的崩解
  COVER_OFFSET: 0.10,           // 蓋在自己前方多遠
  COVER_BLOCK_W: 0.09,          // 牆的擋彈寬度
  COVER_HIDE_W: 0.08,           // 擋住頭頂數值的寬度
  BOT_REACT_MS: { apprentice: 9999, warlock: 400, archmage: 220 },

  // ── Net [E] ───────────────────────────────────
  TICK_HZ: 15,
  PEER_TIMEOUT_MS: 3000,

  // ── View / Anim [D] ───────────────────────────
  FOV: 55,                      // 太廣對手太小，太窄側移像暈船。要實測
  PARALLAX_MS: 80,              // 頭部視差阻尼。太快會暈，太慢沒體感
  SHAKE_PX: 8,                  // 第一人稱震動預算，超過會暈
  SHAKE_MS: 250,
  TRAIL_FADE_MS: 600,
  SNAP_MS: 120,                 // 符文吸附 —— 全場最值錢的動畫
  SIGIL_MAX_R: 1.4,
  PROJ_SCALE_POW: 2.4,          // 投射物尺度曲線：前慢後爆
  BLOOM_STRENGTH: 0.9,
} as const;
