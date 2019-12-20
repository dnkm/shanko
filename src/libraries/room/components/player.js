const Users = require("../../user");

class Player {
  constructor(sid, index) {
    let user = Users.getUser(sid);
    this.sid = user.sid;
    this.seatIndex = index;
    this.nickname = user.nickname;
    this.balance = user.cash;
    this.imgnumber = user.imgnumber;
    this.gender = user.gender;
    this.isReady = false;
    this.isPlaying = false;
    this.cards = [];
    this.bet = 0;
    this.lastConfirmedAnimation = "";
  }
}

module.exports = Player;
