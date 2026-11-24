# 角色素材

`grok-chibi.png` 由内置 ImageGen 生成。造型参考社区 Grok 娘的金色双马尾、黑红哥特配色和小蝠翼。轮廓采用大头、短腿的 Q 版全身比例。[蓝色大肥鱼档案馆](https://fisharchive.cc/characters)

`grok-blink.png` 和 `grok-wink.png` 是对原立绘做的 ImageGen 表情编辑。`tools/build_model.py` 提取生成图里的眼部纹理，与头发、蝠翼、手臂、腿及嘴部网格一起导出为 Cubism 兼容模型。

## 生成提示词

### 原立绘

```text
Create a polished transparent PNG production sprite for an unofficial Grok Build desktop pet. Use the online community's Grok-girl visual vocabulary (blonde twin ponytails, tiny dark bat wings, black and burgundy gothic outfit), with a fresh character design. Take only the compact Q-chibi proportion from the DaFeiYu desk-pet format: big expressive head around 50% of total height, short legs and small silhouette on the desktop.
One complete, fully clothed chibi character in a perfectly front-facing and nearly symmetrical neutral standing pose, looking forward. Full head, both shoes and both twin ponytails in frame, large individual amber eyes, a tiny relaxed closed smile, neat blonde bangs, mid-length airy gold twin ponytails at either side, asymmetric small cranberry hair ribbon, black capelet with cranberry piping over an ivory high-collar blouse, black pleated skirt, opaque burgundy tights and rounded dark boots. Two modest dark bat-wing accessories fan out behind the shoulders, separated from the ends of the hair where possible. Arms down at a slight natural angle with both hands visible outside the dress silhouette, neatly separated from the torso. Render a clear face with the eyebrows, eyelash outlines, whites and round irises visually distinct and with no loose strands across either eye. Use bold plum outlines, hand-drawn cel shading, a few delicate highlights, clean readable shape design. Charming, mischievous but friendly and work-appropriate, high quality Japanese anime game sprite, designed to stay legible at 170 pixels. Tall approximately 4:5 composition on genuinely transparent alpha, figure well centered and tightly filling with breathing room on all sides. One sprite only, no prop, no weapon, no platform, no cast shadow, no branding, no text, no decoration in empty space.
```

### 双眼眨眼

```text
Edit the supplied transparent anime game sprite for a matching Live2D eye-closure texture. Change only the two eyes so that both eyelids are fully shut for one soft, natural blink. Use the same curved dark-plum eyelashes with tapered outer corners and the original warm skin and subtle peach eyelid shading. This is an ordinary brief blink in the neutral expression. Keep the brows, bangs and the exact positioning and size of the character, cheek accents, mouth, nose, costume, hair, hands, edges, original line weights, color palette, canvas framing and transparency aligned with the original. Produce the same single full character and a genuinely transparent background. No stars, new pose, text, props, shadows, or additional decorations.
```

### 单眼 wink

```text
Edit the attached transparent game sprite to create a matching expression plate for a Live2D desktop puppet. Make one localized edit only: the eye on the viewer's LEFT (the eye on the left side of the image, opposite the burgundy bow) makes a cute, natural closed-keyframe anime wink. The eyelid is a small, softly curved dark-plum lash with the outside tapered and swept slightly upward and with a little natural peach shading. Keep the shape clean and readable at 170 pixels. The other amber eye stays perfectly open, with exactly the same gaze, size, color, outline and reflections. Keep the exact original line art, skin coloring, cheek accents, eyebrows, mouth, nose, head angle, gold bangs and ponytails, red bow, costume, wings, hands, proportions, positioning, framing, and alpha cutout. Only the viewer-left eyelid and the previously open surface of that eye change. Preserve the original line-weight and cel shading. Use the same overall canvas and alignment because the eye area will be composited onto the original reference. One full character on genuinely transparent alpha. No stars, decorations, captions, added shadows, new pose or perspective changes.
```
