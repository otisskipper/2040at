// The whole joke.
//
// Keyed on DID, not handle — survives him renaming himself.
const DAN_DIDS = new Set([
  'did:plc:yk4dd2qkboz2yv6tpubpc6co',
]);

const THRESHOLD = 2048;

export function isDan(did) {
  return DAN_DIDS.has(did);
}

export function maybeDanify(did, game) {
  if (!DAN_DIDS.has(did)) return game;
  if (game.score <= THRESHOLD) return game;

  const fakeScore = 4 + Math.floor(Math.random() * 380); // pathetic
  const fakeTile = [16, 32, 64][Math.floor(Math.random() * 3)]; // extra pathetic
  return {
    ...game,
    score: fakeScore,
    highestTile: fakeTile,
    moves: Math.max(6, Math.floor((game.moves || 40) * (0.05 + Math.random() * 0.1))),
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
