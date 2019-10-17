import { App } from 'blockrpg-core/built/SocketIO/App';

const roam = new App('/roam', (client, app) => {
  client.Socket.broadcast.to('').emit('enter', client.Player.account);
  // 玩家漫游事件
  client.Socket.on('roam', (data) => {

  });
  // 玩家下线事件
  // 在当前块房间内广播离开漫游消息
  client.Socket.on('disconnect', () => {
    client.Socket.broadcast.to('').emit('leave', client.Player.account);
  });
}, true);

roam.Listen();
