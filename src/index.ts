import { App } from 'blockrpg-core/built/SocketIO/App';
import { RoamServer } from './Module/RoamServer';

const roam = new App('/roam', async (client, app) => {
  console.log('Roam: 新客户端连接');
  const server = new RoamServer(client, app);
  server.Ready();
}, true);

roam.Listen();
