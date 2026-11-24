import z from '@deepseek-ai/schemastery';
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { createLedger } from './ledger.js';
import { mountDaily } from './daily.js';

export default class ChatCosts extends TypertRemoteService {
  static inject = ['sessionPersistence', 'typertGateway'];
  static Config = z.object({
    dailyEnabled:z.boolean().default(false).description('启用飞书消耗日报 / Enable Feishu daily report'),
    dailyTime:z.string().pattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/).default('09:00').description('发送时间 / Send time (HH:mm)'),
    dailyTimeZone:z.string().default('Asia/Shanghai').description('日报时区 / IANA time zone'),
  });
  constructor(ctx, config) {
    super(ctx,'chatCosts');
    this.ledger=createLedger(ctx.sessionPersistence);
    for(const name of ['sessionCosts','globalCosts']) Remote(ChatCosts.prototype[name],{kind:'method',name,static:false,private:false,addInitializer:fn=>fn.call(this)});
    mountDaily(ctx,config,this.ledger.query);
  }
  checkOwner() {
    if(this.ctx.invocation?.peer?.principal?.kind!=='owner') throw new RemoteError('remote-access/denied','Only the owner can read cost reports.',{});
  }
  async sessionCosts(session) { this.checkOwner(); return this.ledger.query({sessionId:session.id}); }
  async globalCosts() { this.checkOwner(); return this.ledger.query({}); }
}
