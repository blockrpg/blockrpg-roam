import { App } from 'blockrpg-core/built/SocketIO/App';
import { Roamer } from 'blockrpg-core/built/Model/Roamer/Entity';
import * as RoamerBLL from 'blockrpg-core/built/Model/Roamer/BLL';
import * as RoamerClusterBLL from 'blockrpg-core/built/Model/RoamerCluster/BLL';
import { PlayerMeta } from 'blockrpg-core/built/Model/PlayerMeta/Entity';
import { Client } from 'blockrpg-core/built/SocketIO/App/Client';
import { Point } from 'blockrpg-core/built/Point';

class RoamServer {
  private client: Client;
  private app: App;
  private curRoamer?: Roamer;

  public get Client(): Client {
    return this.client;
  }
  public get App(): App {
    return this.app;
  }
  public get CurRoamer(): Roamer {
    if (this.curRoamer) {
      return this.curRoamer as Roamer;
    } else {
      throw(new Error('curRoamer未初始化，是否未调用Ready方法'));
    }
  }

  // 根据多个块坐标点查询这些块里面的玩家信息
  private queryPlayers(pts: Point[]): Promise<PlayerMeta[]> {
    return new Promise<PlayerMeta[]>((resolve, reject) => {
      let count = 0;
      const players: PlayerMeta[] = [];
      pts.forEach(async (pt) => {
        const list = await RoamerClusterBLL.queryPlayers(pt.Id);
        players.push(...list);
        count++;
        if (count === pts.length) {
          resolve(players);
        }
      });
    });
  }
  // 根据多个玩家Meta对象查询Actor信息
  private queryActors(players: PlayerMeta[]): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) => {
      let count = 0;
      const result: any[] = [];
      players.forEach(async (player) => {
        const roamer = await RoamerBLL.getRoamerBLL(player.Account);
        if (roamer) {
          result.push({
            account: player.Account,
            name: player.Name,
            image: player.Image,
            x: Number(roamer.X),
            y: Number(roamer.Y),
            dir: Number(roamer.Dir),
            ges: Number(roamer.Ges),
          });
        }
        count++;
        if (count === players.length) {
          resolve(result);
        }
      });
    });
  }
  // 查询Actor
  private async queryActorsByPoints(pts: Point[]): Promise<any[]> {
    const players = await this.queryPlayers(pts);
    return await this.queryActors(players);
  }

  // 在当前房间内广播玩家进入消息
  private otherEnterAction() {
    setTimeout(() => {
      this.Client.Socket.broadcast.to(this.CurRoamer.CurBlockPoint.Id).emit('otherEnter', {
        account: this.Client.Player.Account,
        name: this.Client.Player.Name,
        image: this.Client.Player.Image,
        x: this.CurRoamer.X,
        y: this.CurRoamer.Y,
        dir: this.CurRoamer.Dir,
        ges: this.CurRoamer.Ges,
      });
    }, 500);
  }
  // 在当前房间内广播玩家漫游消息
  private otherRoamAction() {
    this.Client.Socket.broadcast.to(this.CurRoamer.CurBlockPoint.Id).emit('otherRoam', {
      account: this.Client.Player.Account,
      name: this.Client.Player.Name,
      image: this.Client.Player.Image,
      x: this.CurRoamer.X,
      y: this.CurRoamer.Y,
      dir: this.CurRoamer.Dir,
      ges: this.CurRoamer.Ges,
    });
  }
  // 在当前房间内广播玩家离开消息
  private otherLeaveAction() {
    this.Client.Socket.broadcast.to(this.CurRoamer.CurBlockPoint.Id).emit('otherLeave', this.Client.Player.Account);
  }
  // 发布进入玩家视野的其他玩家
  private intoViewAction(actors: any[]) {
    this.Client.Socket.emit('intoView', actors);
  }

  // 玩家漫游事件
  private async roamEvent(params: any) {
    // 根据传递过来的参数构建漫步者对象
    const roamer = new Roamer({
      account: this.Client.Player.Account,
      x: params.x,
      y: params.y,
      dir: params.dir,
      ges: params.ges,
    });
    // 缓存漫步者对象到Redis
    await RoamerBLL.updateRoamerBLL(roamer);
    // 如果玩家所在地图区块发生了变化
    if (roamer.CurBlockPoint.Id !== this.CurRoamer.CurBlockPoint.Id) {
      // 在集群之中移动玩家信息
      await RoamerClusterBLL.playerMove(this.CurRoamer.CurBlockPoint.Id, roamer.CurBlockPoint.Id, this.Client.Player);
      const newBlocks = roamer.CurBlockPoint.Nine;
      const oldBlocks = this.CurRoamer.CurBlockPoint.Nine;
      // 处理房间订阅与取消订阅逻辑
      const joinBlocks = newBlocks.filter(pt => oldBlocks.every(opt => opt.Id !== pt.Id));

      // 发布新进入玩家视野的其他玩家
      const actors = await this.queryActorsByPoints(joinBlocks);
      if (actors.length > 0) {
        this.intoViewAction(actors);
      }

      const leaveBlocks = oldBlocks.filter(pt => newBlocks.every(npt => npt.Id !== pt.Id));
      this.Client.Socket.join(joinBlocks.map(block => block.Id));
      leaveBlocks.forEach(block => {
        this.Client.Socket.leave(block.Id);
      });
    }
    // 覆盖旧的漫步者对象
    this.curRoamer = roamer;
    // 在当前房间内广播玩家漫游消息
    this.otherRoamAction();
  }
  // 玩家断开连接事件
  private async disconnectEvent() {
    // 同步玩家的Roam信息到数据库
    await RoamerBLL.syncRoamerBLL(this.Client.Player.Account);
    // 玩家离开集群
    await RoamerClusterBLL.playerLeave(this.CurRoamer.CurBlockPoint.Id, this.Client.Player);
    // 在当前房间内广播离开消息
    this.otherLeaveAction();
  }

  // 服务准备
  public async Ready(): Promise<void> {
    // 读取初始Roamer信息
    this.curRoamer = await RoamerBLL.getRoamerBLL(this.Client.Player.Account) as Roamer;
    // 加入初始房间
    this.Client.Socket.join(this.CurRoamer.CurBlockPoint.Nine.map((pt => pt.Id)));
    // 玩家进入房间集群
    await RoamerClusterBLL.playerEnter(this.CurRoamer.CurBlockPoint.Id, this.Client.Player);
    const actors = await this.queryActorsByPoints(this.CurRoamer.CurBlockPoint.Nine);
    this.intoViewAction(actors);
    this.otherEnterAction();
    // 玩家漫游事件
    this.Client.Socket.on('roam', (params) => {
      this.roamEvent(params);
    });
    // 玩家断开连接事件
    this.Client.Socket.on('disconnect', () => {
      // console.log('Roam: 客户端断开连接');
      this.disconnectEvent();
    });
  }

  // 构造函数
  public constructor(
    client: Client,
    app: App,
  ) {
    this.client = client;
    this.app = app;
  }
}

const roam = new App('/roam', async (client, app) => {
  // console.log('Roam: 新客户端连接');
  const server = new RoamServer(client, app);
  server.Ready();
}, true);

roam.Listen();
