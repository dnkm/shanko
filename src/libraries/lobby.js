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
    if (room === -1) {
      console.log("resp_room_enter: ", "{ retcode: 2 } - room not found");
      socket.emit("resp_room_enter", { retcode: 2 });
      return;
    }
    if (this.rooms[room].players.length > config.MAXPLAYERS - 1) {
      console.log("resp_room_enter: ", "{ retcode: 1 } - room full");
      socket.emit("resp_room_enter", { retcode: 1 });
    }
    let user = Users.getUser(socket.id);
    if (user) {
      user.room = data.roomnumber;
      this.rooms[room].enter(user, socket, io);
      return;
    }
    console.log("resp_room_enter: ", "{ retcode: 2 } - unknown error");
    socket.emit("resp_room_enter", { retcode: 2 });
  }

  roomLeave(socket, io) {
    let user = Users.getUser(socket.id);
    if (user && user.room) {
      let room = this.findRoom(user.room);
      this.rooms[room].leave(user, socket, io);
      return;
    }
    console.log("resp_room_leave: ", "{ retcode: 1} - user or room not found");
    socket.emit("resp_room_leave", { retcode: 1 });
  }

  findRoom(room) {
    for (let i = 0; i < this.rooms.length; i++) {
      if (this.rooms[i].roomnumber === room) return i;
    }
    return -1;
  }

  getUserList(socket) {
    let user = Users.getUser(socket.id);
    if (user && user.room) {
      let room = this.findRoom(user.room);
      this.rooms[room].getUserList(socket);
    } else {
      console.log(
        "resp_ingame_userlist: ",
        "{ retcode: 1 } - user or room not found"
      );
      socket.emit("resp_ingame_userlist", { retcode: 1 });
    }
  }

  getUserInfo(data, socket) {
    let user = Users.getUser(socket.id);
    let user2 = Users.getUser(data.sid);
    if (user && user2 && user.room && user2.room) {
      if (user.room === user2.room) {
        let u = {
          sid: user2.sid,
          nickname: user2.nickname,
          balance: user2.cash,
          imgnumber: user2.imgnumber,
          gender: user2.gender
        };
        console.log("resp_ingame_userinfo: ", u);
        socket.emit("resp_ingame_userinfo", u);
        return;
      }
    }
    console.log(
      "resp_ingame_userinfo: ",
      "{retcode: 1} - user or room not found"
    );
    socket.emit("resp_ingame_userinfo", { retcode: 1 });
  }
}

module.exports = new Lobby();
