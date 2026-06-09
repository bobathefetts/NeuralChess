import { Chess } from 'chess.js';
import { parseMoveFromText } from '../src/services/llmCore.js';

const game = new Chess();
const samples = [
  '<think>Reasoning...</think> The best move is e2e4.',
  'I will play Nf3.',
  'Final line:\n\nd2d4',
  'Maybe e7e5 for black.',
  '```text\ng1f3\n```',
];

console.log('Parser smoke test');
for (const sample of samples) {
  const move = parseMoveFromText(sample, game);
  console.log(JSON.stringify({ sample, move }, null, 2));
}
