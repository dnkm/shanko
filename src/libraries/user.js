let userbase = {
  david: {
    username: "david",
    password: "0000",
    nickname: "coffee",
    gender: 0,
    cash: 500000,
    imgnumber: 0,
    win: 50,
    lose: 40
  },
  jay: {
    username: "jay",
    password: "0000",
    nickname: "satisfiedlemon",
    gender: 0,
    cash: 250000,
    imgnumber: 3,
    win: 50,
    lose: 40
  },
  daniel: {
    username: "daniel",
    password: "0000",
    nickname: "dnkm",
    gender: 0,
    cash: 100000,
    imgnumber: 1,
    win: 50,
    lose: 40
  },
  matthew: {
    username: "matthew",
    password: "0000",
    nickname: "akai",
    gender: 0,
    cash: 50000,
    imgnumber: 2,
    win: 50,
    lose: 40
  },
  test: {
    username: "test",
    password: "0000",
    nickname: "test",
    gender: 0,
    cash: 10000,
    imgnumber: 4,
    win: 0,
    lose: 0
  },
  guest1: {
    username: "guest1",
    password: "0000",
    nickname: "beep",
    gender: 0,
    cash: 450000,
    imgnumber: 4,
    win: 999,
    lose: 0
  },
  guest2: {
    username: "guest2",
    password: "0000",
    nickname: "boop",
    gender: 0,
    cash: 500,
    imgnumber: 5,
    win: 0,
    lose: 999
  }
};

let users = {};
let sockets = {};

function profile(socket) {
  socket.emit("resp_userinfo", {
    nickname: userbase[sockets[socket.id]].nickname,
    gender: userbase[sockets[socket.id]].gender,
    cash: userbase[sockets[socket.id]].cash,
    imgnumber: userbase[sockets[socket.id]].imgnumber,
    win: userbase[sockets[socket.id]].win,
    lose: userbase[sockets[socket.id]].lose
  });
}

function login(data, socket, games) {
  if (
    userbase[data.user] === undefined ||
    userbase[data.user].password !== data.password
  ) {
    socket.emit("resp_login", { retcode: 1 });
    return;
  }
  socket.join("users");
  if (users[data.user] !== undefined) {
    updateSocket(data.user, socket, socket.id, games);
    users[data.user] = { ...users[data.user], sid: socket.id };
  } else {
    users[data.user] = { sid: socket.id, room: "none" };
    sockets[socket.id] = data.user;
  }
  socket.emit("resp_login", { sid: socket.id, retcode: 0 });
}

function updateSocket(user, socket, sid, games) {
  if (users[user].room !== "none") {
    socket.join(users[user].room);
  }
  delete sockets[users[user].sid];
  sockets[sid] = user;
  users[user].sid = sid;
}

module.exports = {
  userbase: userbase,
  users: users,
  profile: profile,
  login: login
};
