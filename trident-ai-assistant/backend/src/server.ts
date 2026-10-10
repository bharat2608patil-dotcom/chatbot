import cors from 'cors';
import express from 'express';
import chatRouter from './routes/chat';

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(chatRouter);

app.listen(port, () => {
  console.log(`Trident AI Assistant backend listening on http://localhost:${port}`);
});
