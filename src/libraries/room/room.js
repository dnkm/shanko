const config = require("../../utils/config");
const Player = require("./components/player");

const FACES = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K"
];
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10];
const SUITS = ["SPADES", "HEARTS", "DIAMONDS", "CLUBS"];

class Room {
  constructor(room, index, rank) {
    this.roomnumber = room;
    this.players = [];
    this.bank =
      index >= config[rank].ROOMS_1 ? config[rank].BANK_2 : config[rank].BANK_1;
    this.status = 1;
  }

  enter(user, socket, io) {
    if (!this.checkPlayer(user.id)) {
      this.players.push(new Player(socket.id));
      socket.join(this.roomnumber);
    }
    console.log("resp_room_enter: ", { retcode: 0 });
    socket.emit("resp_room_enter", { retcode: 0 });
    console.log("resp_room_update: ", this);
    io.to(this.roomnumber).emit("resp_room_update", this);
  }

  leave(user, socket, io) {
    if (this.checkPlayer(user.sid)) {
      user.room = undefined;
      this.players = this.players.filter(p => p.sid !== user.sid);
      socket.leave(this.roomnumber);
      console.log("resp_room_leave: ", { retcode: 0 });
      socket.emit("resp_room_leave", { retcode: 0 });
      console.log("resp_room_update: ", this);
      io.to(this.roomnumber).emit("resp_room_update", this);
    }
  }

  checkPlayer(sid) {
    for (let i = 0; i < this.players.length; i++)
      if (sid === this.players[i].sid) return true;
    return false;
  }

  getUserList(socket) {
    let sids = [];
    this.players.forEach(p => sids.push(p.sid));
    console.log("resp_ingame_userlist: ", sids);
    socket.emit("resp_ingame_userlist", sids);
  }
}

module.exports = Room;
