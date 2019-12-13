const config = require("../utils/config");
const Users = require("./user");
const Room = require("./room/room");

class Lobby {
  constructor() {
    this.rooms = [
      ...this.populateRooms("RANK1"),
      ...this.populateRooms("RANK2"),
      ...this.populateRooms("RANK3"),
      ...this.populateRooms("RANK4"),
      ...this.populateRooms("RANK5")
    ];
  }

  populateRooms(rank) {
    let rooms = [];
    new Array(config[rank].ROOMS_1 + config[rank].ROOMS_2)
      .fill(0)
      .map((v, i) => config[rank].ROOM_NUM + i)
      .forEach((n, i) => rooms.push(new Room(n, i, rank)));
    return rooms;
  }

  roomEnter(data, socket, io) {
    let room = this.findRoom(data.roomnumber);
    if (this.rooms[room].players.length > config.MAXPLAYERS - 1) {
      socket.emit("resp_roomenter", { retcode: 1 });
    }
    let user = Users.getUser(socket.id);
    if (user) {
      user.room = room;
      this.rooms[room].enter(user, socket, io);
      return;
    }
    socket.emit("resp_roomenter", { retcode: 2 });
  }

  roomLeave(socket, io) {
    let user = Users.getUser(socket.id);
    if (user && user.room) {
      this.rooms[user.room].leave(user, socket, io);
      return;
    }
    socket.emit("resp_room_leave", { retcode: 1 });
  }

  findRoom(room) {
    for (let i = 0; this.rooms.length; i++) {
      if (this.rooms[i].roomnumber === room) return i;
    }
    return -1;
  }
}

module.exports = new Lobby();
