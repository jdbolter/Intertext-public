'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { formatAdditionsBold } = require('../lib/markdownDiff');

test('bolds a word inserted into an otherwise unchanged sentence', () => {
  assert.equal(
    formatAdditionsBold('The text keeps moving.', 'The text keeps steadily moving.'),
    'The text keeps **steadily** moving.'
  );
});

test('bolds a newly added paragraph while preserving its Markdown spacing', () => {
  assert.equal(
    formatAdditionsBold('## Title\n\nFirst paragraph.', '## Title\n\nFirst paragraph.\n\nA new thought.'),
    '## Title\n\nFirst paragraph.\n\n**A new thought.**'
  );
});

test('does not mark unchanged text', () => {
  const text = '## Title\n\nNothing changed.';
  assert.equal(formatAdditionsBold(text, text), text);
});

test('represents replacements as bold revised words', () => {
  assert.equal(
    formatAdditionsBold('The old conclusion.', 'The different conclusion.'),
    'The **different** conclusion.'
  );
});

test('a short phrase reused inside an unrelated new paragraph is not matched against its other occurrence', () => {
  // Regression test: a whole-document word diff once decided it was "cheaper" to match
  // a quoted title in a new third paragraph against its other occurrence back in
  // paragraph one, splitting the phrase across two bold spans with the closing quote
  // mark stranded, unmarked, between them. The text here is invented.
  const p1 = 'In 1851 a surveyor published a chart called "Atlas Blue: A Survey of the Coast." The chart shows a harbour in unusual detail, with every sandbar drawn and named. As he draws, the surveyor confronts one by one the pilots and merchants who will rely on it, as a newspaper account describes them (Hale 1851). He got the idea from a chart by an older colleague, and he says so in a note along the lower margin.';
  const p2 = 'The chart includes a brief introductory note in which the surveyor explains that he is bringing navigation and trade back together. Despite the rather curt tone of some of the notes, the point of the chart is that it replaces older guesses with measured soundings, which the harbour needs. A pilot named Ada Moor suggests a practical dimension to the work, and the harbour authority adopts it the following year.';
  const original = ['## A Harbour Chart', '', p1, '', p2].join('\n');

  const newParagraph =
    'One might ask whether this amounts only to borrowed authority, or whether the chart tests the boundary it crosses. The distinction turns on whether the survey changes the terms of passage or is simply drawn within them. A genuine test would produce friction, perhaps a dispute over standards, and would keep making its argument after the ink dried, the way the sounding lines did.';

  const revised = ['## A Harbour Chart', '', p1, '', p2, '', newParagraph].join('\n');

  const highlighted = formatAdditionsBold(original, revised);

  // Round-trip integrity always holds regardless of highlighting quality.
  assert.equal(highlighted.replace(/\*\*/g, ''), revised);
  // The quoted phrase must not be split across two bold spans, in either direction.
  assert.doesNotMatch(highlighted, /Atlas Blue\*\*"/);
  assert.doesNotMatch(highlighted, /"\*\*Atlas/);
  // The wholly new fourth paragraph must appear as one clean, fully-bolded
  // insertion — not diffed word-by-word against an unrelated earlier paragraph.
  const paragraphs = highlighted.split(/\n\n/u);
  assert.equal(paragraphs[3], `**${newParagraph}**`);
});
