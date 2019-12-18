const Users = require("../../user");

class Player {
  constructor(sid) {
    let user = Users.getUser(sid);
    this.sid = user.sid;
    this.nickname = user.nickname;
    this.balance = user.cash;
    this.imgnumber = user.imgnumber;
    this.gender = user.gender;
    this.isReady = false;
    this.isPlaying = false;
    this.cards = [undefined, undefined, undefined];
    this.bet = 0;
  }
}

module.exports = Player;
