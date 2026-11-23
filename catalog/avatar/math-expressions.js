/* Facial artwork from math-symbols.html, retaining its original SVG coordinates. */
(() => {
  const part = (key, x, y, art, prop = false, replaces = null) => ({ key, x, y, art, prop, replaces });
  const eye = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`;
  const ink = (x, y, size, text, transform = '') => `<text class="math-ink" x="${x}" y="${y}" font-size="${size}"${transform ? ` transform="${transform}"` : ''}>${text}</text>`;
  const stroke = (d, thin = false) => `<path class="stroke${thin ? ' thin' : ''}" d="${d}"/>`;
  window.CATALOG_MATH_EXPRESSIONS = [
    { symbol: 'times', caption: '算晕了', tilt: -6, parts: [
      part('leftEye',137,137,ink(137,149,48,'𝑥'),true,'leftEye'),
      part('rightEye',183,137,ink(183,149,48,'𝑥'),true,'rightEye'),
      part('mouth',160,171,stroke('M140 171 Q150 162 160 171 T180 171'))
    ]},
    { symbol: 'sum', caption: '玩命计算，薅尽你的算力', tilt: 0, parts: [
      part('brows',160,118,stroke('M122 115 L143 121 M178 121 L198 115',true)),
      part('leftEye',137,137,ink(137,152,40,'∑'),true,'leftEye'),
      part('rightEye',183,137,ink(183,152,40,'∑','translate(366 0) scale(-1 1)'),true,'rightEye'),
      part('mouth',160,178,stroke('M149 178 L171 178'))
    ]},
    { symbol: 'dot', caption: '灵光一现', tilt: 3, parts: [
      part('leftEye',137,138,ink(137,154,52,'⊙'),true,'leftEye'),
      part('rightEye',183,138,ink(183,154,52,'⊙'),true,'rightEye'),
      part('mouth',160,178,eye(160,178,8,11))
    ]},
    { symbol: 'nabla', caption: '开心大笑', tilt: -5, blinkEyes: false, parts: [
      part('leftEye',137,137,stroke('M125 140 Q137 125 149 140')),
      part('rightEye',183,137,stroke('M171 140 Q183 125 195 140')),
      part('mouth',160,180,ink(160,195,49,'∇'),true,'mouth')
    ]},
    { symbol: 'partial', caption: '好奇探头', tilt: 9, parts: [
      part('leftBrow',137,117,stroke('M126 117 Q137 112 147 119',true)),
      part('rightBrow',185,112,ink(185,116,39,'∂','translate(0 55) scale(1 .5)'),true),
      part('leftEye',137,137,eye(137,137,6,9)),part('rightEye',183,137,eye(183,137,6,9)),
      part('mouth',160,173,stroke('M146 173 Q160 179 173 169'))
    ]},
    { symbol: 'transpose', caption: '认真审视你的算法', tilt: 0, parts: [
      part('browBridge',160,132,ink(160,150,56,'T'),true),
      part('leftEye',137,137,eye(137,137,6,9)),part('rightEye',183,137,eye(183,137,6,9)),
      part('mouth',160,174,stroke('M148 174 L172 174'))
    ]},
    { symbol: 'exp', caption: '刚被你的计算要求痛揍了一顿', tilt: -4, parts: [
      part('leftEye',137,138,eye(137,138,7,10)),
      part('rightEye',181,138,ink(181,152,48,'e<tspan dx="1" dy="-25" font-size="24">x</tspan>'),true,'rightEye'),
      part('mouth',160,172,stroke('M142 166 Q160 186 178 166'))
    ]},
    { symbol: 'root', caption: '有点怀疑你的算法', tilt: 5, parts: [
      part('leftBrow',137,117,stroke('M123 120 L148 114',true)),
      part('rightBrow',186,115,stroke('M172 117 L178 124 L185 106 H201',true),true),
      part('leftEye',137,138,eye(137,138,6,8)),part('rightEye',183,138,eye(183,138,6,10)),
      part('mouth',160,173,stroke('M147 174 Q160 169 173 173'))
    ]},
    { symbol: 'sigma', caption: 'Free到瞌睡流口水', tilt: 8, blinkEyes: false, parts: [
      part('leftEye',136,140,stroke('M124 137 Q136 147 148 137')),
      part('rightEye',182,140,stroke('M170 137 Q182 147 194 137')),
      { ...part('mouth',164,174,ink(164,190,52,'σ','rotate(90 164 174)'),true,'mouth'), pileRotation: -90 }
    ]},
    { symbol: 'theta', caption: '有一次等一个长条Wait，困到半眯', tilt: 4, parts: [
      part('leftEye',137,137,ink(137,153,48,'θ'),true,'leftEye'),
      part('rightEye',183,137,ink(183,153,48,'θ'),true,'rightEye'),
      part('mouth',160,175,stroke('M150 175 Q160 181 170 175'))
    ]}
  ];
  window.CATALOG_TRANSITION_LINES = [
    '看了那么久，想打招呼吗？我也叫小算子',
    '努力学习各种计算中…',
    '接下来算点啥好呢？',
    '瞎翻一下，消除现在的尴尬',
    '随便选一个来装算好了',
    '对面那位还在看我，再算一个好了'
  ];
})();
