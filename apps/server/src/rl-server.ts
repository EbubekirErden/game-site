import express from 'express';
import { LoveLetterRLEnv } from './rl-env.js';

const app = express();
app.use(express.json());

const env = new LoveLetterRLEnv();

app.get('/spec', (req, res) => {
  res.json(env.getSpec());
});

app.post('/reset', (req, res) => {
  const result = env.reset(req.body ?? {});
  res.json(result);
});

app.post('/step', (req, res) => {
  const { action, actionIndex } = req.body;
  const result = env.step(Number.isInteger(action) ? action : actionIndex);
  res.json(result);
});

app.listen(3002, () => {
  console.log("RL Python Bridge listening on port 3002");
});
