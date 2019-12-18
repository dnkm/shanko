const Logger = require("./logger");

let userbase = {
  david: {
    id: "david",
    sid: 0,
    password: "0000",
    nickname: "coffee",
    gender: 0,
    cash: 500000,
    imgnumber: 0,
    win: 50,
    lose: 40
  },
  jay: {
    id: "jay",
    sid: 1,
    password: "0000",
    nickname: "satisfiedlemon",
    gender: 0,
    cash: 250000,
    imgnumber: 3,
    win: 50,
    lose: 40
  },
  daniel: {
    id: "daniel",
    sid: 3,
    password: "0000",
    nickname: "dnkm",
    gender: 0,
    cash: 100000,
    imgnumber: 1,
    win: 50,
    lose: 40
  },
  matthew: {
    id: "matthew",
    sid: 4,
    password: "0000",
    nickname: "akai",
    gender: 0,
    cash: 50000,
    imgnumber: 2,
    win: 50,
    lose: 40
  },
  test00: {
    id: "test00",
    sid: 5,
    password: "0000",
    nickname: "test",
    gender: 0,
    cash: 10000,
    imgnumber: 4,
    win: 0,
    lose: 0
  },
  guest1: {
    id: "guest1",
    sid: 6,
    password: "0000",
    nickname: "beep",
    gender: 0,
    cash: 450000,
    imgnumber: 4,
    win: 999,
    lose: 0
  },
  guest2: {
    id: "guest2",
    sid: 7,
    password: "0000",
    nickname: "boop",
    gender: 0,
    cash: 500,
    imgnumber: 5,
    win: 0,
    lose: 999
  }
};

class User {
  constructor(data, socket) {
    this.id = data.id;
    this.sid = userbase[data.id].sid;
    this.socket = socket.id;
    this.nickname = userbase[data.id].nickname;
    this.gender = userbase[data.id].gender;
    this.cash = userbase[data.id].cash;
    this.imgnumber = userbase[data.id].imgnumber;
    this.win = userbase[data.id].win;
    this.lose = userbase[data.id].lose;
    this.room = undefined;
  }
}

class Users {
  constructor() {
    this.users = [];
  }

  profile(socket) {
    let user = this.getUser(socket.id);
    if (user === undefined) {
      Logger.respLog("resp_userinfo", { retcode: 1 }, "user not found");
      socket.emit("resp_userinfo", { retcode: 1 });
      return;
    }
    let u = {
      nickname: user.nickname,
      gender: user.gender,
      cash: user.cash,
      imgnumber: user.imgnumber,
      win: user.win,
      lose: user.lose
    };
    Logger.respLog("resp_userinfo", u, "success");
    socket.emit("resp_userinfo", u);
  }
  changeGender(data, socket) {
    for (let i = 0; i < this.users.length; i++) {
      if (this.users[i].socket === socket.id) {
        this.users[i].gender = data.gender;
        userbase[this.users[i].id].gender = data.gender;
        Logger.respLog(
          "resp_changegender",
          { retcode: 0, gender: data.gender },
          "success"
        );
        socket.emit("resp_changegender", { retcode: 0, gender: data.gender });
        return;
      }
    }
    Logger.respLog("resp_changegender", { retcode: 1 }, "socket id not found");
    socket.emit("resp_changegender", { retcode: 1 });
  }

  changeImgNumber(data, socket) {
    for (let i = 0; i < this.users.length; i++) {
      if (this.users[i].socket === socket.id) {
        this.users[i].imgnumber = data.imgnumber;
        userbase[this.users[i].id].imgnumber = data.imgnumber;
        Logger.respLog(
          "resp_changeimgnumber",
          {
            retcode: 0,
            imgnumber: data.imgnumber
          },
          "success"
        );
        socket.emit("resp_changeimgnumber", {
          retcode: 0,
          imgnumber: data.imgnumber
        });
        return;
      }
    }
    Logger.respLog(
      "resp_changeimgnumber",
      { retcode: 1 },
      "socket id not found"
    );
    socket.emit("resp_changeimgnumber", { retcode: 1 });
  }

  login(data, socket) {
    if (
      userbase[data.id] === undefined ||
      userbase[data.id].password !== data.password
    ) {
      Logger.respLog("resp_login", { retcode: 1 }, "login unsuccessful");
      socket.emit("resp_login", { retcode: 1 });
      return;
    }
    let user = this.getUser(data.id);
    if (user === undefined) {
      user = new User(data, socket);
      this.users.push(user);
    } else {
      user.socket = socket.id;
    }
    Logger.respLog("resp_login", { retcode: 0, sid: user.sid }, "success");
    socket.emit("resp_login", { retcode: 0, sid: user.sid });
  }

  getUser(data) {
    for (let i = 0; i < this.users.length; i++) {
      if (
        this.users[i].socket === data ||
        this.users[i].id === data ||
        this.users[i].sid === data
      )
        return this.users[i];
    }
    return undefined;
  }
}

module.exports = new Users();
