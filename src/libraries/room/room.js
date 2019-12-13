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
    socket.emit("resp_room_enter", { retcode: 0 });
    io.to(this.roomnumber).emit("resp_room_update", this);
  }

  leave(user, socket, io) {
    if (this.checkPlayer(user.id)) {
      user.room = undefined;
      this.players = this.players.filter(p => p.id !== user.id);
      socket.leave(this.roomnumber);
      socket.emit("resp_room_leave", { retcode: 0 });
      io.to(this.roomnumber).emit("resp_room_update", this);
    }
  }

  checkPlayer(id) {
    for (let i = 0; i < this.players.length; i++)
      if (id === this.players[i].id) return true;
    return false;
  }
}

module.exports = Room;
