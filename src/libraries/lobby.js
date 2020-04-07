const config = require("../utils/config");
const Users = require("./user");
const Room = require("./room/room");
const Logger = require("./logger");

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

  getRooms() {
    return {
      retcode: 0,
      roomlist: this.rooms.map(room => room.filterLobby())
    };
  }

  populateRooms(rank) {
    let rooms = [];
    new Array(config[rank].ROOMS_1 + config[rank].ROOMS_2)
      .fill(0)
      .map((v, i) => config[rank].ROOM_NUM + i)
      .forEach((n, i) => {
        rooms.push(new Room(n, i, rank));
      });
    return rooms;
  }

  // room entry/exit
  enter(data, socket, io) {
    // if room does not exist
    let room = this.findRoom(data.roomnumber);
    if (room === -1) {
      Logger.respLog("resp_room_enter", { retcode: 2 }, "room not found");
      socket.emit("resp_room_enter", { retcode: 2 });
      return;
    }
    // if user does not exist
    let user = Users.getUser(socket.id);
    if (typeof user === "undefined") {
      Logger.respLog("resp_room_enter", { retcode: 2 }, "user not found");
      socket.emit("resp_room_enter", { retcode: 2 });
      return;
    }
    // if user exists and is already in a room
    if (user.room && user.room !== data.roomnumber)
      room = this.findRoom(user.room);
    user.room = data.roomnumber;
    this.rooms[room].enter(user, socket, io);
    return;
  }

  ready(socket, io) {
    let user = Users.getUser(socket.id);
    if (typeof user !== "undefined" && user.inroom && user.room) {
      let room = this.findRoom(user.room);
      this.rooms[room].ready(user, socket, io);
      return;
    }
    Logger.respLog(
      "resp_ingame_imready",
      { retcode: 2 },
      "user or room not found"
    );
    socket.emit("resp_ingame_imready", { retcode: 2 });
  }

  leave(socket, io) {
    let user = Users.getUser(socket.id);
    if (user && user.room) {
      let room = this.findRoom(user.room);
      this.rooms[room].leave(user, socket, io);
      return;
    }
    Logger.respLog("resp_room_leave", { retcode: 2 }, "user or room not found");
    socket.emit("resp_room_leave", { retcode: 2 });
  }

  cancelLeave(socket, io) {
    let user = Users.getUser(socket.id);
    if (user && user.room) {
      let room = this.findRoom(user.room);
      this.rooms[room].cancelLeave(user, socket, io);
      return;
    }
  }

  getSeated(data, socket, io) {
    let user = Users.getUser(socket.id);
    if (user && user.room) {
      let room = this.findRoom(user.room);
      this.rooms[room].getSeated(data, user, socket, io);
      return;
    }
    Logger.respLog("resp_ingame_sit", { retcode: 2 }, "user or room not found");
    socket.emit("resp_ingame_sit", { retcode: 2 });
  }

  standUp(socket, io) {
    let user = Users.getUser(socket.id);
    if (user && user.room) {
      let room = this.findRoom(user.room);
      this.rooms[room].standUp(user, socket, io);
      return;
    }
    Logger.respLog(
      "resp_ingame_standup",
      { retcode: 2 },
      "user or room not found"
    );
    socket.emit("resp_ingame_standup", { retcode: 2 });
  }

  standUpCancel(socket, io) {
    let user = Users.getUser(socket.id);
    if (user && user.room) {
      let room = this.findRoom(user.room);
      this.rooms[room].standUpCancel(user, socket, io);
      return;
    }
    Logger.respLog(
      "resp_ingame_standup",
      { retcode: 2 },
      "user or room not found"
    );
    socket.emit("resp_ingame_standupcancel", { retcode: 2 });
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
      Logger.respLog(
        "resp_ingame_userlist",
        { retcode: 2 },
        "user or room not found"
      );
      socket.emit("resp_ingame_userlist", { retcode: 2 });
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
        Logger.respLog("resp_ingame_userinfo", u, "success");
        socket.emit("resp_ingame_userinfo", u);
        return;
      }
    }

    Logger.respLog(
      "resp_ingame_userinfo",
      { retcode: 2 },
      "user or room not found"
    );
    socket.emit("resp_ingame_userinfo", { retcode: 2 });
  }

  bet(data, socket, io) {
    let user = Users.getUser(socket.id);
    if (user && user.room) {
      let room = this.findRoom(user.room);
      this.rooms[room].bet(data, user, socket, io);
      return;
    }
  }

  confirm(data, socket, io) {
    let user = Users.getUser(socket.id);
    if (user && user.room) {
      let room = this.findRoom(user.room);
      this.rooms[room].confirm(data, user, io);
    }
  }

  playerAction(data, socket, io) {
    let user = Users.getUser(socket.id);
    if (user && user.room) {
      let room = this.findRoom(user.room);
      this.rooms[room].playerAction(data, user, socket, io);
    }
  }

  bankerAction(data, socket, io) {
    let user = Users.getUser(socket.id);
    if (user && user.room) {
      let room = this.findRoom(user.room);
      this.rooms[room].bankerAction(data, user, socket, io);
    }
  }
  getState(socket) {
    let user = Users.getUser(socket.id);
    if (typeof user !== "undefined" && user.room && user.inroom) {
      let room = this.findRoom(user.room);
      Logger.respLog(
        "resp_ingame_state",
        this.rooms[room].filterRoomState(user),
        "success"
      );
      socket.emit("resp_ingame_state", this.rooms[room].filterRoomState(user));
      return;
    }
    Logger.respLog(
      "resp_ingame_state",
      { retcode: 2 },
      "user or room not found"
    );
    socket.emit("resp_ingame_state", { retcode: 2 });
  }

  reset() {
    this.rooms = [
      ...this.populateRooms("RANK1"),
      ...this.populateRooms("RANK2"),
      ...this.populateRooms("RANK3"),
      ...this.populateRooms("RANK4"),
      ...this.populateRooms("RANK5")
    ];
  }
}

module.exports = new Lobby();
