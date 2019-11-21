let users = {
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

let ids = {};
let sockets = {};

function profile(socket) {
  socket.emit("resp_userinfo", {
    nickname: users[sockets[socket.id]].nickname,
    gender: users[sockets[socket.id]].gender,
    cash: users[sockets[socket.id]].cash,
    imgnumber: users[sockets[socket.id]].imgnumber,
    win: users[sockets[socket.id]].win,
    lose: users[sockets[socket.id]].lose
  });
}

function login(data, socket, games) {
  if (
    users[data.id] === undefined ||
    users[data.id].password !== data.password
  ) {
    socket.emit("resp_login", { retcode: 1 });
    return;
  }
  socket.join("ids");
  if (ids[data.id] !== undefined) {
    updateSocket(data.user, socket, socket.id, games);
    ids[data.id] = { ...ids[data.id], sid: socket.id };
  } else {
    ids[data.id] = { sid: socket.id, room: "none" };
    sockets[socket.id] = data.id;
  }
  socket.emit("resp_login", { sid: socket.id, retcode: 0 });
}

function updateSocket(id, socket, sid, games) {
  if (ids[id].room !== "none") {
    socket.join(ids[id].room);
  }
  delete sockets[ids[id].sid];
  sockets[sid] = id;
  ids[id].sid = sid;
}

module.exports = {
  ids: ids,
  profile: profile,
  login: login
};
