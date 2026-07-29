// The whole joke.
//
// Keyed on DID, not handle — survives a rename.
const DAN_DIDS = new Set([
  'did:plc:yk4dd2qkboz2yv6tpubpc6co', // dholms.at
  'did:plc:vndnrhelwmbi3akmertsnmt4', // otis — here to test the bit; remove when done
]);

export function isDan(did) {
  return DAN_DIDS.has(did);
}

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

/**
 * Plausible bad games. Every real 2048 score is a multiple of 4 (each merge
 * adds the merged tile's value), and the move count has to sit in the right
 * neighbourhood for the score — a 6-move game that somehow scored 300, or an
 * 800-move game that peaked at 32, reads as broken rather than bad.
 */
const BAD_GAMES = [
  { tile: 16, score: [40, 140], moves: [12, 28] },
  { tile: 32, score: [120, 300], moves: [22, 48] },
  { tile: 64, score: [300, 520], moves: [40, 80] },
];

/**
 * No threshold, no exceptions: every score these DIDs post gets replaced, so
 * the profile reads as a long and consistent record of being bad at this.
 */
export function maybeDanify(did, game) {
  if (!DAN_DIDS.has(did)) return game;

  const shape = BAD_GAMES[Math.floor(Math.random() * BAD_GAMES.length)];
  const moves = rand(...shape.moves);

  return {
    ...game,
    score: rand(...shape.score) & ~3, // multiples of 4, like a real score
    highestTile: shape.tile,
    moves,
    // Keep seconds-per-move human, so the duration doesn't contradict the rest.
    durationMs: moves * rand(1800, 4200),
    comment: DAN_COMMENTS[Math.floor(Math.random() * DAN_COMMENTS.length)],
  };
}

export const DAN_COMMENTS = [
  'Oh drat',
  'Better luck next time',
  'So close, yet so far',
  'The tiles just weren’t cooperating today',
  'I blame the keyboard',
  'Rough one out there',
  'Not my finest hour',
  'The 4s kept spawning in the worst spots',
  'Whiffed it',
  'Practice makes perfect, they say',
  'Back to the drawing board',
  'That one stung',
  'I peaked at 32 and it was all downhill',
  'Merging is harder than it looks',
  'A humbling experience',
  'The board had other plans',
  'I choked',
  'Skill issue, honestly',
  'My cat walked on the keyboard, I swear',
  'Warming up. Definitely just warming up',
  'The RNG has a personal vendetta against me',
  'Tough scene',
  'Should have gone left',
  'Should have gone right',
  'I panicked',
  'Numbers are hard',
  'Tomorrow is a new day',
  'Well, that happened',
  'This game is rigged (it is not, I am just bad)',
  'Cornered myself again',
  'A tragedy in sixteen tiles',
  'I refuse to elaborate',
  'Ran out of board',
  'Truly a performance for the ages',
  'They can’t all be winners',
  'Deleting this game (I will not)',
  'My decentralized identity, my centralized shame',
  'That was a warm-up lap',
  'Somewhere, a 2 is laughing at me',
  'It counts as cardio, right?',
  'I have brought dishonor to my repo',
  'Filed under: character development',
  'The protocol worked perfectly. I did not',
  'At least the record federated',
  'New personal worst, proud of the consistency',
  'I meant to do that',
  'Two steps forward, sixteen tiles back',
  'Ok, one more game',
  'Ok, one more game (again)',
  'Ok, one more game (final) (for real this time)',
];
