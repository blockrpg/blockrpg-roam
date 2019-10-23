import { App } from 'blockrpg-core/built/SocketIO/App';
import { Roamer } from 'blockrpg-core/built/Model/Roamer/Entity';
import { Client } from 'blockrpg-core/built/SocketIO/App/Client';
import { Point } from 'blockrpg-core/built/Point';
import * as RoamerBLL from 'blockrpg-core/built/Model/Roamer/BLL';
import * as RoamerClusterBLL from 'blockrpg-core/built/Model/RoamerCluster/BLL';

export class RoamServer {
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

  // 查询指定多个区块内的其他Roamer列表
  private async queryOtherRoamersByClusters(pts: Point[]): Promise<Roamer[]> {
    const pms = pts.map((pt) => RoamerClusterBLL.getRoamers(pt.Id));
    const array = await Promise.all(pms);
    const list: Roamer[] = [];
    array.forEach((item) => {
      list.push(...item);
    });
    return list.filter((roamer) => roamer.Account !== this.Client.Player.Account);
  }

  // 在当前房间内广播玩家进入消息
  private otherEnterAction() {
    setTimeout(() => {
      this.Client.Socket.broadcast.to(this.CurRoamer.CurBlockPoint.Id).emit('otherEnter', this.CurRoamer);
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
  // 发布进入当前玩家视野的其他Roamer
  private intoViewAction(roamers: Roamer[]) {
    this.Client.Socket.emit('intoView', roamers);
  }

  // 玩家漫游事件
  private async roamEvent(params: any) {
    // 根据客户端传递过来的参数构建漫步者对象
    const roamer = new Roamer({
      account: this.Client.Player.Account,
      name: this.Client.Player.Name,
      image: this.Client.Player.Image,
      x: params.x,
      y: params.y,
      dir: params.dir,
      ges: params.ges,
    });
    // 判断玩家所处的区块是否发生变化
    if (roamer.CurBlockPoint.Id === this.CurRoamer.CurBlockPoint.Id) {
      // 如果没有变化，则直接更新漫步者对象到Redis即可
      await RoamerBLL.updateRoamerBLL(roamer);
    } else {
      // 在集群之中移动玩家信息
      await RoamerClusterBLL.roamerMove(
        this.CurRoamer.CurBlockPoint.Id,
        roamer.CurBlockPoint.Id,
        roamer,
      );
      const newBlocks = roamer.CurBlockPoint.Nine;
      const oldBlocks = this.CurRoamer.CurBlockPoint.Nine;
      // 处理房间订阅与取消订阅逻辑
      const joinBlocks = newBlocks.filter(pt => oldBlocks.every(opt => opt.Id !== pt.Id));
      this.Client.Socket.join(joinBlocks.map(block => block.Id));
      const leaveBlocks = oldBlocks.filter(pt => newBlocks.every(npt => npt.Id !== pt.Id));
      leaveBlocks.forEach(block => {
        this.Client.Socket.leave(block.Id);
      });
      // 发布新进入玩家视野的其他玩家
      const roamers = await this.queryOtherRoamersByClusters(joinBlocks);
      if (roamers.length > 0) {
        this.intoViewAction(roamers);
      }
    }
    // 覆盖旧的漫步者对象
    this.curRoamer = roamer;
    // 在当前房间内广播玩家漫游消息
    this.otherRoamAction();
  }
  // 玩家断开连接事件
  private async disconnectEvent() {
    // 同步玩家的Roam信息到数据库
    await RoamerBLL.persistRoamerBLL(this.CurRoamer);
    // 玩家离开当前所处的集群
    await RoamerClusterBLL.roamerLeave(this.CurRoamer.CurBlockPoint.Id, this.CurRoamer.Account);
    // 在当前房间内广播离开消息
    this.otherLeaveAction();
  }

  // 服务准备
  public async Ready(): Promise<void> {
    // 读取初始Roamer信息
    this.curRoamer = await RoamerBLL.upgradeRoamerBLL(this.Client.Player.Account) as Roamer;
    // Roamer进入初始集群
    await RoamerClusterBLL.roamerEnter(this.CurRoamer.CurBlockPoint.Id, this.CurRoamer);
    // Socket加入初始九宫房间
    this.Client.Socket.join(this.CurRoamer.CurBlockPoint.Nine.map((pt => pt.Id)));

    const roamers = await this.queryOtherRoamersByClusters(this.CurRoamer.CurBlockPoint.Nine);
    if (roamers.length > 0) {
      this.intoViewAction(roamers);
    }
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
