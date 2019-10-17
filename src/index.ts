
import SocketIO from 'socket.io';
import Auth from 'blockrpg-core/built/SocketIO/Auth';
import Cookie from 'cookie';
import http from 'http';
import { Session } from 'blockrpg-core/built/Session';

class App {
  // 命名空间名称
  private name: string = '';
  // 该服务是否需要登录权限访问
  private auth: boolean = true;
  // 传入的http服务器
  private server: http.Server;
  // 创建的SocketIO服务器
  private io: SocketIO.Server;
  // 创建的应用命名空间
  private namespc: SocketIO.Namespace;
  // 请求的Session
  private session: string = '';
  // 当前请求的登录玩家信息
  private player: any;
  // 开放给用户的回调
  private func: (app: App) => void;

  public get Name(): string {
    return this.name;
  }
  public get Auth(): boolean {
    return this.auth;
  }
  public get Server(): http.Server {
    return this.server;
  }
  public get IO(): SocketIO.Server {
    return this.io;
  }
  public get NameSpace(): SocketIO.Namespace {
    return this.namespc;
  }
  public get Session(): string {
    return this.session;
  }
  public get Player(): any {
    return this.player;
  }
  public get Func(): (app: App) => void {
    return this.func;
  }

  // 从文本之中反序列化Cookie并读取指定键值
  private readCookie(text: string, key: string): string {
    const cookieText = text || '';
    const cookieObj = Cookie.parse(cookieText);
    return cookieObj[key] as string;
  }

  // 客户端连接事件
  // 客户端正确连接之后此回调会被调用
  // 函数会被传入连接到客户端的Socket
  private async Connection(socket: SocketIO.Socket): Promise<void> {
    // 从Cookie之中读取Session
    this.session = this.readCookie(socket.request.headers.cookie, 'session');
    // 利用获取的Session读取登录玩家信息
    this.player = await Session.Get(this.session);
    this.func(this);
  }

  // 监听（启动服务）
  public Listen(
    port: number,
    opts?: SocketIO.ServerOptions,
  ): void {
    if (this.io) {
      (this.io as SocketIO.Server).listen(port, opts);
    } else {
      throw new Error('SocketIO服务没有初始化');
    }
  }

  // 构造函数
  public constructor(
    name: string = '',
    func: (app: App) => void,
    auth: boolean = true,
    server?: http.Server,
    opts?: SocketIO.ServerOptions,
  ) {
    this.name = name;
    this.func = func;
    this.auth = auth;
    this.server = server || http.createServer();
    // 创建SocketIO服务
    this.io = SocketIO(this.server, opts);
    // 创建命名空间
    this.namespc = this.auth ? this.io.of(this.name).use(Auth) : this.io.of(this.name);
    // 客户端连接事件
    // 回调之中获得连接到客户端的Socket
    this.namespc.on('connection', this.Connection);
  }
}




const app = new App('/roam', (app) => {
  console.log(app.Player);
});

app.Listen(3003);
