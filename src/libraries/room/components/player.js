const Users = require("../../user");

class Player {
  constructor(sid) {
    let u = Users.getUser(sid);
    this.id = u.id;
    this.cash = u.cash;
    this.hand = [];
    this.banker = false;
  }
}

module.exports = Player;
