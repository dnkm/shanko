const Users = require("../../user");

class Player {
  constructor(socket, index) {
    let sid = socket.id;
    let user = Users.getUser(sid);
    this.sid = user.sid;
    this.socket = socket;
    this.seatIndex = index;
    this.nickname = user.nickname;
    this.balance = user.cash;
    this.imgnumber = user.imgnumber;
    this.gender = user.gender;
    this.cards = [];
    this.bet = 0;
    this.isPlaying = false;
    this.inRoom = true;
  }
}

module.exports = Player;
