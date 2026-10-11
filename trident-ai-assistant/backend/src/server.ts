import cors from 'cors';
import express from 'express';
import chatRouter from './routes/chat';
import knowledgeRouter from './routes/knowledge';
import knowledgeAuthRouter from './services/knowledgeAuth';

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(chatRouter);
app.use(knowledgeAuthRouter);
app.use(knowledgeRouter);

app.listen(port, () => {
  console.log(`Trident AI Assistant backend listening on http://localhost:${port}`);
});
