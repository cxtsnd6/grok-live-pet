# 角色素材

`grok-chibi.png` 由内置 ImageGen 生成。造型参考社区 Grok 娘的金色双马尾、黑红哥特配色和小蝠翼。轮廓采用大头、短腿的 Q 版全身比例。[蓝色大肥鱼档案馆](https://fisharchive.cc/characters)

`tools/build_model.py` 从这张图导出独立的头发、蝠翼、手臂、腿、双眼与嘴部网格，并生成 Cubism 兼容的模型包。

## 生成提示词

```text
Create a polished transparent PNG production sprite for an unofficial Grok Build desktop pet. Use the online community's Grok-girl visual vocabulary (blonde twin ponytails, tiny dark bat wings, black and burgundy gothic outfit), with a fresh character design. Take only the compact Q-chibi proportion from the DaFeiYu desk-pet format: big expressive head around 50% of total height, short legs and small silhouette on the desktop.
One complete, fully clothed chibi character in a perfectly front-facing and nearly symmetrical neutral standing pose, looking forward. Full head, both shoes and both twin ponytails in frame, large individual amber eyes, a tiny relaxed closed smile, neat blonde bangs, mid-length airy gold twin ponytails at either side, asymmetric small cranberry hair ribbon, black capelet with cranberry piping over an ivory high-collar blouse, black pleated skirt, opaque burgundy tights and rounded dark boots. Two modest dark bat-wing accessories fan out behind the shoulders, separated from the ends of the hair where possible. Arms down at a slight natural angle with both hands visible outside the dress silhouette, neatly separated from the torso. Render a clear face with the eyebrows, eyelash outlines, whites and round irises visually distinct and with no loose strands across either eye. Use bold plum outlines, hand-drawn cel shading, a few delicate highlights, clean readable shape design. Charming, mischievous but friendly and work-appropriate, high quality Japanese anime game sprite, designed to stay legible at 170 pixels. Tall approximately 4:5 composition on genuinely transparent alpha, figure well centered and tightly filling with breathing room on all sides. One sprite only, no prop, no weapon, no platform, no cast shadow, no branding, no text, no decoration in empty space.
```
