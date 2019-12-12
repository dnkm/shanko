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
  constructor(roomNumber, index, rank) {
    this.roomNumber = roomNumber;
    this.players = [];
    this.bank =
      index >= config[rank].ROOMS_1 ? config[rank].BANK_2 : config[rank].BANK_1;
    this.status = 1;
  }

  enter(user, socket, io) {
    if (!this.checkPlayer(user.id)) {
      this.players.push(new Player(socket.id));
      socket.join(this.roomNumber);
    }
    socket.emit("resp_roomenter", { retcode: 0 });
    io.to(this.roomNumber).emit("resp_roomupdate", this);
  }

  leave(user, socket, io) {
    if (this.checkPlayer(user.id)) {
      user.room = undefined;
      this.players = this.players.filter(p => p.id !== user.id);
      socket.leave(this.roomNumber);
      socket.emit("resp_roomleave", { retcode: 0 });
      io.to(this.roomNumber).emit("resp_roomupdate", this);
    }
  }

  checkPlayer(id) {
    for (let i = 0; i < this.players.length; i++)
      if (id === this.players[i].id) return true;
    return false;
  }
}

module.exports = Room;
