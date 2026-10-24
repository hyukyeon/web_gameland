import { createServer } from './app.js';
import { PORT } from './config.js';

const { server } = createServer();
server.listen(PORT, () => console.log(`gostop server on http://localhost:${PORT}`));
