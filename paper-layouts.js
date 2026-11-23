/*
 * 考卷版面唯一資料來源。
 *
 * 本檔刻意不依賴 DOM，讓瀏覽器預覽、OOXML 產生器與 node 測試都能讀同一份
 * 資料。尺寸一律以 cm / pt / twips 表示；不要在個別預覽再寫一組 px 常數。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PaperLayouts = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const CM_TO_TWIPS = 567;
  const CM_TO_EMU = 360000;
  const cmToTwips = cm => Math.round(cm * CM_TO_TWIPS);
  const cmToEmu = cm => Math.round(cm * CM_TO_EMU);
  const cmToPx = cm => cm * 96 / 2.54;

  const common = {
    bodyFont: { eastAsia: '華康中圓體(P)', latin: 'Times New Roman' },
    source: { pt: 8, color: '#808080', align: 'right' },
    question: { line: 1, beforePt: 3.6, afterPt: 3.6, keepLines: true },
    image: { defaultPlacement: 'float-right', gapCm: 0.37, maxWidthCm: 8.5 },
    options: { tabsTwips: [3000, 5280, 7560], labelLeftTwips: 960 }
  };

  // ABK 的 A/B 成品邊界、第一段／第二段欄數確有不同，因此保留 variant 覆寫。
  const layouts = {
    abk: {
      ...common, id: 'abk', paper: { widthCm: 25.7, heightCm: 36.4 },
      marginCm: { top: 1.27, right: 1.27, bottom: 1.27, left: 1.27 },
      bodyPt: 10, headerPt: 12, columns: { first: 1, body: 2, gapCm: 1.25, separator: true },
      line: 1.2, watermark: { enabled: true, position: 'right-bottom' }, header: 'abk',
      variants: {
        A: { marginCm: { top: 1.27, right: 1.27, bottom: 1.27, left: 1.27 }, bodyFont: { eastAsia: '華康中圓體(P)', latin: 'Times New Roman' } },
        B: { marginCm: { top: 1, right: 1, bottom: 1, left: 1 }, bodyFont: { eastAsia: 'DFPYuanMedium-B5', latin: 'Times New Roman' }, headerPt: 12 },
        K: { marginCm: { top: 1, right: 1, bottom: 1, left: 1 } }
      }
    },
    golden: {
      ...common, id: 'golden', paper: { widthCm: 21, heightCm: 29.7 },
      marginCm: { top: 1, right: 1, bottom: 1, left: 1 }, bodyPt: 8, headerPt: 12,
      columns: { first: 1, body: 1, gapCm: 0, separator: false }, line: 1,
      watermark: { enabled: false }, header: 'golden',
      bodyFont: { eastAsia: 'jf金萱那提2.0 四分糖', latin: 'Times New Roman' }
    },
    pre: {
      ...common, id: 'pre', paper: { widthCm: 21, heightCm: 29.7 },
      marginCm: { top: 1, right: 1, bottom: 1, left: 1 }, bodyPt: 10, headerPt: 12,
      columns: { first: 1, body: 1, gapCm: 0, separator: false }, line: 1,
      watermark: { enabled: false }, header: 'pre'
    }
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function get(kind, variant) {
    const result = clone(layouts[kind] || layouts.pre);
    const override = result.variants && result.variants[variant];
    if (override) Object.keys(override).forEach(key => {
      result[key] = typeof override[key] === 'object' && !Array.isArray(override[key]) ? { ...result[key], ...override[key] } : override[key];
    });
    delete result.variants;
    result.contentWidthCm = result.paper.widthCm - result.marginCm.left - result.marginCm.right;
    return result;
  }

  // 預覽與 Word 共用。override 是老師在單題「選項排法」選擇後保留的值。
  function optionLayout(options, contentWidthCm, override) {
    if (override === 'four') return { cols: 4, mode: 'four' };
    if (override === 'two') return { cols: 2, mode: 'two' };
    if (override === 'one') return { cols: 1, mode: 'one' };
    const rows = Array.isArray(options) ? options : String(options || '').split('\n').filter(Boolean);
    const visual = rows.map(x => [...x].reduce((n, c) => n + (c.codePointAt(0) > 0x2e80 ? 2 : 1), 0));
    const longest = Math.max(0, ...visual);
    if (rows.length >= 3 && contentWidthCm >= 15.5 && longest <= 12) return { cols: 4, mode: 'four' };
    if (longest <= Math.max(12, Math.floor(contentWidthCm * 3.1))) return { cols: 2, mode: 'two' };
    return { cols: 1, mode: 'one' };
  }
  return { CM_TO_TWIPS, CM_TO_EMU, cmToTwips, cmToEmu, cmToPx, layouts, get, optionLayout };
});
