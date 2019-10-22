import { App } from 'blockrpg-core/built/SocketIO/App';
import { Roamer } from 'blockrpg-core/built/Model/Roamer/Entity';
import * as RoamerBLL from 'blockrpg-core/built/Model/Roamer/BLL';
import * as RoamerClusterBLL from 'blockrpg-core/built/Model/RoamerCluster/BLL';
import { PlayerMeta } from 'blockrpg-core/built/Model/PlayerMeta/Entity';


const roam = new App('/roam', async (client, app) => {
  
  // 读取初始Roamer信息
  let curRoamer: Roamer = await RoamerBLL.getRoamerBLL(client.Player.Account) as Roamer;

  // 玩家进入集群
  await RoamerClusterBLL.playerEnter(curRoamer.CurBlockPoint.Id, client.Player);

  const nine = curRoamer.CurBlockPoint.Nine;
  const players: PlayerMeta[] = [];
  for (let i = 0; i < nine.length; ++i) {
    const id = nine[i].Id;
    const list = await RoamerClusterBLL.queryPlayers(id);
    players.push(...list);
  }

  // 触发其他玩家进入视野事件
  client.Socket.emit('intoView', []);

  // 在当前块房间内广播进入漫游消息
  client.Socket.broadcast.to(curRoamer.CurBlockPoint.Id).emit('otherEnter', {
    ...client.Player,
    ...curRoamer,
  });

  // 玩家漫游事件
  client.Socket.on('roam', async (data) => {
    // 根据传递过来的参数构建漫步者对象
    const roamer = new Roamer({
      account: client.Player.account,
      x: data.x,
      y: data.y,
      dir: data.dir,
      ges: data.ges,
    });
    // 缓存漫步者对象到Redis
    await RoamerBLL.updateRoamerBLL(roamer);
    // 如果所在地图区块发生变化
    if (roamer.CurBlockPoint.Id !== curRoamer.CurBlockPoint.Id) {
      // 在集群之中移动玩家信息
      await RoamerClusterBLL.playerMove(curRoamer.CurBlockPoint.Id, roamer.CurBlockPoint.Id, client.Player);
      const newBlocks = roamer.CurBlockPoint.Nine;
      const oldBlocks = curRoamer.CurBlockPoint.Nine;
      const joinBlocks = newBlocks.filter(pt => oldBlocks.every(opt => opt.Id !== pt.Id));
      const leaveBlocks = oldBlocks.filter(pt => newBlocks.every(npt => npt.Id !== pt.Id));
      client.Socket.join(joinBlocks.map(block => block.Id));
      leaveBlocks.forEach(block => {
        client.Socket.leave(block.Id);
      });
    }
    // 覆盖旧的漫步者对象
    curRoamer = roamer;
    // 在当前房间内广播漫游消息
    client.Socket.broadcast.to(curRoamer.CurBlockPoint.Id).emit('otherRoam', curRoamer);
  });

  // 玩家离开事件
  // 在当前块房间内广播离开漫游消息
  client.Socket.on('disconnect', async () => {
    // 同步玩家的Roam信息到数据库
    await RoamerBLL.syncRoamerBLL(client.Player.Account);
    // 玩家离开集群
    await RoamerClusterBLL.playerLeave(curRoamer.CurBlockPoint.Id, client.Player);
    // 在当前房间内广播离开消息
    client.Socket.broadcast.to(curRoamer.CurBlockPoint.Id).emit('otherLeave', client.Player.Account);
  });
}, true);

roam.Listen();
