import { config } from './config.js';
import { createApp } from './app.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(`API del prototipo escuchando en http://localhost:${config.port}  (NO PRODUCCIÓN — datos ficticios)`);
});
