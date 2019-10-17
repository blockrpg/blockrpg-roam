import { App } from 'blockrpg-core/built/SocketIO/App';

const roam = new App('/roam', (client, app) => {
  console.log(client.Player);
}, true);

roam.Listen();
