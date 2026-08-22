/**
 * 所有可調參數　[擁有者：人類]
 *
 * ⚠️ 這個檔案禁止 AI 生成或修改數值。
 * 這些數字只能靠人坐在螢幕前試出來，而它們才是決定 demo 成不成功的東西。
 * 調參時只改這個檔案，不會跟別人衝突。
 */

export const CONFIG = {
  // ── Tracking [Ivan] ───────────────────────────
  TIP_EXTEND: 0.055,            // 筆尖外推距離，相對 bodyScale
  ONE_EURO_MIN_CUTOFF: 1.0,
  ONE_EURO_BETA: 0.007,
  HEAD_MIN_CUTOFF: 0.4,         // head 要更重的平滑 —— 頭抖會直接變成畫面暈眩
  HEAD_BETA: 0.002,
  LOST_FRAMES: 5,
  WEBCAM_W: 640, WEBCAM_H: 480, // 不要開 720p
  CV_HZ: 30,
  FACE_HZ: 30,                  // 掉幀時先把這個降到 15

  // ── Runes [B] ─────────────────────────────────
  CAST_THRESHOLD: 0.80,
  HINT_THRESHOLD: 0.65,
  MIN_STROKE_POINTS: 8,
  MAX_STROKE_MS: 4000,
  RESAMPLE_N: 64,
  CORNER_ANGLE_DEG: 55,         // 角點判定：3 角 → △，5 角 → ⬠

  // ── Match [C] ─────────────────────────────────
  HP_MAX: 10,
  DMG_BOLT: 1,
  DMG_HEAVY: 3,
  PROJ_MS: { bolt: 700, heavy: 1100 },
  HIT_WIDTH: { bolt: 0.09, heavy: 0.17 },  // 重擊難躲就是靠這個數字
  HEAD_TO_X_GAIN: 1.6,          // head(−1..1) → x(0..1) 的放大倍率
  MATCH_TIME_S: 90,
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
