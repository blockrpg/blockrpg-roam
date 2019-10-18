import { App } from 'blockrpg-core/built/SocketIO/App';
import { Roamer } from 'blockrpg-core/built/Model/Roamer/Entity';
import * as RoamerBLL from 'blockrpg-core/built/Model/Roamer/BLL';

const roam = new App('/roam', async (client, app) => {

  let curRoamer: Roamer = await RoamerBLL.getRoamerBLL(client.Player.account) as Roamer;

  // 玩家进入事件
  client.Socket.on('enter', async () => {

  });

  // 玩家漫游事件
  client.Socket.on('roam', async (data) => {
    // 构建漫步者对象
    const roamer = new Roamer({
      account: client.Player.account,
      x: data.x,
      y: data.y,
      dir: data.dir,
      ges: data.ges,
    });
    // 缓存漫步者对象到Redis
    await RoamerBLL.updateRoamerBLL(roamer);
    const newBlocks = roamer.CurBlockPoint.Nine;
    const oldBlocks = curRoamer.CurBlockPoint.Nine;
    const joinBlocks = newBlocks.filter(pt => oldBlocks.every(opt => opt.Id !== pt.Id));
    const leaveBlocks = oldBlocks.filter(pt => newBlocks.every(npt => npt.Id !== pt.Id));
    client.Socket.join(joinBlocks.map(block => block.Id));
    leaveBlocks.forEach(block => {
      client.Socket.leave(block.Id);
    });
    curRoamer = roamer;
    client.Socket.broadcast.to(curRoamer.CurBlockPoint.Id).emit('roam', {

    });
  });

  // 玩家离开事件
  // 在当前块房间内广播离开漫游消息
  client.Socket.on('disconnect', async () => {
    await RoamerBLL.syncRoamerBLL(client.Player.account);
    client.Socket.broadcast.to('').emit('leave', client.Player.account);
  });
}, true);

roam.Listen();
