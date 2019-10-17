
import SocketIO from 'socket.io';
import Auth from 'blockrpg-core/built/SocketIO/Auth';
import Cookie from 'cookie';
import { Session } from 'blockrpg-core/built/Session';

class App {
  // 命名空间名称
  private name: string = '';
  // 该服务是否需要登录权限访问
  private auth: boolean = true;
  // http服务器
  private server: any;
  // SocketIO服务器
  private io?: SocketIO.Server;
  // 应用命名空间
  private namespc?: SocketIO.Namespace;

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
    const session = this.readCookie(socket.request.headers.cookie, 'session');
    // 利用获取的Session读取登录玩家信息
    const player = await Session.Get(session);
  }

  public Listen(): void {

  }

  // 构造函数
  public constructor(
    name: string = '',
    auth: boolean = true,
    server: any,
    opts: SocketIO.ServerOptions | undefined
  ) {
    this.name = name;
    this.auth = auth;
    this.server = server;
    // 创建SocketIO服务
    this.io = SocketIO(this.server, opts);
    // 创建命名空间
    this.namespc = this.auth ? this.io.of(this.name).use(Auth) : this.io.of(this.name);
    // 客户端连接事件
    // 回调之中获得连接到客户端的Socket
    this.namespc.on('connection', this.Connection);
  }
}
