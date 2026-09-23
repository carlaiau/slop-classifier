export const SEGMENTER_VERSION = 'paragraph-en-1';
export const FILTER_VERSION = 'english-stopwords-1';
const stop = new Set('a an the and or but if then so to of in on at for from by with as is are was were be been being it its this that these those i you he she we they my your his her our their not no do does did have has had will would can could may might should shall'.split(' '));
export const words = text => [...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)].map(m => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
export const prefix = text => words(text).slice(-30).map(w => w.text).join(' ');
export function contentWords(text, offset = 0) {
  return words(text).filter(w => !stop.has(w.text.toLowerCase()) && /\p{L}/u.test(w.text)).map(w => ({ ...w, start: w.start + offset, end: w.end + offset }));
}
export function segment(text) {
  if (typeof text !== 'string') throw new Error('Text must be a string');
  const result = [];
  const ends = [...text.matchAll(/\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*/g)].map(m => m.index + m[0].length);
  if (ends.at(-1) !== text.length) ends.push(text.length);
  const engine = new Intl.Segmenter('en', { granularity: 'sentence' });
  let begin = 0;
  for (const end of ends) {
    const shadow = text.slice(begin, end).replace(/[\r\n\u2028]/g, ' ')
      .replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Rev|Hon|St|Capt|Col|Gen|Lt|Sgt|Maj)\.(?=\s+["“‘']?\p{L})/giu, m => m.slice(0, -1) + 'x')
      .replace(/\b[A-Z]\.(?=\s+(?:[A-Z]\.|[A-Z][a-z]))/g, m => m[0] + 'x');
    for (const part of engine.segment(shadow)) {
      const start = begin + part.index;
      result.push({ id: `s${result.length}`, start, end: start + part.segment.length });
    }
    begin = end;
  }
  return result.filter(s => text.slice(s.start, s.end).trim()).map(s => ({ ...s, text: text.slice(s.start, s.end), preceding: prefix(text.slice(0, s.start)) }));
}
export function insufficient(text) {
  return words(text).length < 8 ? 'Fewer than eight words; not enough evidence.' : null;
}
