# 角色素材 — 給 Codex

**目標：兩張靜態姿勢圖，去背，放進 `public/anim/`。**
不要生影片、不要抽格、不要 sprite sheet。三張靜圖 + 程式驅動的動態就夠了。

---

## 0. 已經有的

```
public/anim/wizard.png          ← idle 姿勢，已去背，672×900
Higgsfield job id: 53016af5-a7c2-40ca-a38b-3afd4bc1422a   ← 原圖（灰底，未去背）
```

角色是**中級魔法師 Archmage**：深藍長袍 + 金飾邊、寬帽簷帶環狀符文、臉藏在帽簷陰影裡、
木杖頂端一顆菱形藍水晶。

---

## 1. 🔴 最重要的一條

**兩張新圖都必須從上面那個 job id 出發做 image-to-image / image edit。**
**不要從文字重新生。** 從文字生會生出一個長得不一樣的法師，
三張圖擺在一起玩家會發現角色在變形。

Higgsfield 用法：
```
generate_image  model: nano_banana_pro
                medias: [{ role: 'image', value: '53016af5-a7c2-40ca-a38b-3afd4bc1422a' }]
                prompt: 見下方
```

---

## 2. 要生的兩張

### A. `charge` — 起手（玩家唯一的預警）

```
prompt:
Same wizard character, identical robe, hat, staff and colours as the reference.
Change only the pose: the wizard raises the crystal staff high above the head with
both arms, body leaning slightly back, robe hem lifting. The diamond crystal at the
staff top glows intensely bright cyan-white, casting light onto the hat brim and
shoulders. Same flat plain mid-grey background, same camera angle, same framing,
same full body from hat to feet, same scale and position in frame.
No text, no logo, no ground plane, no shadow.
```

**驗收**：把它跟 `wizard.png` 疊起來，**腳的位置與身高必須幾乎一樣**。
差太多就重生 —— 遊戲裡切換姿勢時角色會跳。

### B. `hit` — 受擊

```
prompt:
Same wizard character, identical robe, hat, staff and colours as the reference.
Change only the pose: the wizard is knocked backwards — upper body arched back,
hat brim tilted, one arm flung out, robe and sleeves flaring from the impact.
The staff is still held but angled down and away. Same flat plain mid-grey
background, same camera angle, same framing, same full body from hat to feet,
same scale and position in frame.
No text, no logo, no ground plane, no shadow.
```

**驗收**：同上，腳的位置要對得上。

---

## 3. 去背與存檔

生完每一張，用 Higgsfield 的 `remove_background`：
```
remove_background  media_id: <剛生成的 job id>
                   media_type: 'image'
```

然後下載，縮到高度 900，存成：
```
public/anim/wizard_charge.png
public/anim/wizard_hit.png
```

```bash
curl -sL -o public/anim/wizard_charge.png "<去背後的 rawUrl>"
sips -Z 900 public/anim/wizard_charge.png
```

**每張要 < 500KB。** 超過的話再縮小一點。

---

## 4. 規則

- **只碰 `public/anim/`。** 不要改 `src/` 任何東西 —— 程式端我同時在做，會撞
- **不准 `git add` / `commit` / `push`**（見 `rules.md`）
- 做完回報：兩張圖的檔案大小、以及「腳的位置對不對得上」的目視確認結果

---

## 5. 如果額度不夠

**只生 `charge` 那一張。** 受擊可以先用程式做（畫面閃紅 + 角色向後傾），
但「他要出手了」的預警沒有替代品 —— 那是玩家唯一的反應依據。
