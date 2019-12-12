let userbase = {
  david: {
    id: "david",
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
    this.sid = socket.id;
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
      socket.emit("resp_userinfo", { retcode: 1 });
      return;
    }
    socket.emit("resp_userinfo", {
      nickname: user.nickname,
      gender: user.gender,
      cash: user.cash,
      imgnumber: user.imgnumber,
      win: user.win,
      lose: user.lose
    });
  }
  changeGender(data, socket) {
    for (let i = 0; i < this.users.length; i++) {
      if (this.users[i].sid === socket.id) {
        this.users[i].gender = data.gender;
        userbase[this.users[i].id].gender = data.gender;
        socket.emit("resp_changegender", { retcode: 0, gender: data.gender });
        return;
      }
    }
    socket.emit("resp_changegender", { retcode: 1 });
  }

  changeImgNumber(data, socket) {
    for (let i = 0; i < this.users.length; i++) {
      if (this.users[i].sid === socket.id) {
        this.users[i].imgnumber = data.imgnumber;
        userbase[this.users[i].id].imgnumber = data.imgnumber;
        socket.emit("resp_changeimgnumber", {
          retcode: 0,
          imgnumber: data.imgnumber
        });
        return;
      }
    }
    socket.emit("resp_changeimgnumber", { retcode: 1 });
  }

  login(data, socket) {
    if (
      userbase[data.id] === undefined ||
      userbase[data.id].password !== data.password
    ) {
      socket.emit("resp_login", { retcode: 1 });
      return;
    }
    let user = this.getUser(data.id);
    if (user === undefined) this.users.push(new User(data, socket));
    else user.sid = socket.id;
    socket.emit("resp_login", { retcode: 0, sid: socket.id });
  }

  getUser(data) {
    for (let i = 0; i < this.users.length; i++) {
      if (this.users[i].sid === data || this.users[i].id === data)
        return this.users[i];
    }
    return undefined;
  }
}

module.exports = new Users();
