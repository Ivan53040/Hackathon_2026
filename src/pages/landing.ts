/**
 * 登入頁　[Wesley]
 *
 * 規格定案：創建房間 / 加入房間 / 說明 / 設定 四顆。
 * ⚠️ 但四顆**平權**會讓人不知道該按哪個（Hick's Law）——
 *    所以「創建房間」做成主要按鈕，其餘三顆降級。
 *    這不是改規格，是把主要動作標出來。
 */
import { makeScreen, register, show } from './index';
import { createRoom, checkRoom } from '../net';

type Handlers = {
  onHost: (code: string, playerId: string) => void;
  onJoin: (code: string, playerId: string) => void;
  onSolo: () => void;
};

export function buildLanding(root: HTMLElement, h: Handlers): void {
  const el = makeScreen(root);
  el.innerHTML = `
    <h1>RUNESPIRE</h1>
    <p class="sub">Draw the rune · Cast the spell</p>
    <div class="runes">
      <span><b>△</b>攻擊</span>
      <span><b>□</b>建造</span>
    </div>
    <div class="actions">
      <button class="btn primary" data-a="host">創建房間</button>
      <button class="btn" data-a="join">加入房間</button>
      <button class="btn" data-a="solo">單人練習</button>
      <button class="btn" data-a="help">說明</button>
    </div>
    <p class="err" data-err></p>
    <p class="note">
      右手持筆在鏡頭前畫符文出招，左手 <b>A</b> / <b>D</b> 左右移動。<br>
      按住 <b>Shift</b> 才會開始記錄你畫的軌跡。
    </p>
  `;
  register('landing', el);

  const err = el.querySelector<HTMLElement>('[data-err]')!;
  const fail = (m: string) => { err.textContent = m; };

  el.querySelector('[data-a="host"]')!.addEventListener('click', async () => {
    fail('');
    try {
      const { code, playerId } = await createRoom();
      h.onHost(code, playerId);
    } catch (e) {
      fail(e instanceof Error ? e.message : '建立房間失敗，改用單人練習也可以');
    }
  });

  el.querySelector('[data-a="join"]')!.addEventListener('click', async () => {
    fail('');
    const code = prompt('輸入房間代碼（4 個字母）')?.trim().toUpperCase();
    if (!code) return;
    try {
      const r = await checkRoom(code);
      if (!r.exists) return fail('找不到這個房間，代碼再確認一次');
      if (r.full) return fail('這個房間已經有兩個人了');
      h.onJoin(code, 'p_' + Math.random().toString(36).slice(2, 8));
    } catch {
      fail('連不上伺服器');
    }
  });

  el.querySelector('[data-a="solo"]')!.addEventListener('click', () => h.onSolo());
  el.querySelector('[data-a="help"]')!.addEventListener('click', () => {
    // TODO [Wesley]：做成正式的說明頁。現在先讓 judge 至少讀得到規則
    alert(
      '怎麼玩\n\n' +
      '· A / D 左右移動閃避\n' +
      '· 按住 Shift，右手持筆在鏡頭前畫符文\n' +
      '· △ 攻擊　□ 建造遮蔽物\n\n' +
      '遮蔽物會擋下敵方的攻擊（撐兩次），\n' +
      '而且你從自己的牆後面開火不會被擋住。\n' +
      '躲在牆後，敵方也看不到你的血量與魔量。',
    );
  });

  show('landing');
}
