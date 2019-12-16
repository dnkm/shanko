const Users = require("../../user");

class Player {
  constructor(sid) {
    let user = Users.getUser(sid);
    this.sid = user.sid;
    this.id = user.id;
    this.nickname = user.nickname;
    this.balance = user.cash;
    this.imgnumber = user.imgnumber;
    this.hand = [];
    this.banker = false;
  }
}

module.exports = Player;
