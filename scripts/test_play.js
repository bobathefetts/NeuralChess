import { Chess } from 'chess.js';
import { requestLLMMove } from '../src/services/llmCore.js';

const model = process.env.OLLAMA_MODEL || 'gemma3:4b';
const difficulty = process.env.NEURAL_CHESS_DIFFICULTY || 'normal';
const plies = Number.parseInt(process.env.NEURAL_CHESS_PLIES || '6', 10);

async function runSimulation() {
  const game = new Chess();
  const config = {
    preset: 'ollama',
    apiType: 'ollama',
    baseUrl: 'http://localhost:11434',
    model,
  };

  console.log(`Running Neural Chess smoke test with ${model} at ${difficulty} difficulty.`);

  for (let ply = 1; ply <= plies; ply += 1) {
    try {
      const move = await requestLLMMove({
        config,
        fen: game.fen(),
        moveHistory: game.history({ verbose: true }),
        game,
        difficulty,
      });
      const result = game.move(move);
      if (!result) {
        console.error(`Ply ${ply}: illegal move returned: ${move}`);
        process.exitCode = 1;
        return;
      }
      console.log(`Ply ${ply}: ${result.san} (${move})`);
      if (game.isGameOver()) {
        console.log(`Game over after ply ${ply}: ${game.fen()}`);
        return;
      }
    } catch (error) {
      console.error(`Ply ${ply}: request failed: ${error.message}`);
      process.exitCode = 1;
      return;
    }
  }
}

runSimulation();
