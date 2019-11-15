let userbase = {
  david: {
    username: "david",
    password: "123",
    nickname: "coffee",
    gender: 0,
    cash: 999999,
    imgnumber: 0,
    win: 50,
    lose: 40
  },
  jay: {
    username: "jay",
    password: "123",
    nickname: "satisfiedlemon",
    gender: 0,
    cash: 999999,
    imgnumber: 3,
    win: 50,
    lose: 40
  },
  daniel: {
    username: "daniel",
    password: "123",
    nickname: "dnkm",
    gender: 0,
    cash: 999999,
    imgnumber: 1,
    win: 50,
    lose: 40
  },
  matthew: {
    username: "matthew",
    password: "123",
    nickname: "akai",
    gender: 0,
    cash: 999999,
    imgnumber: 2,
    win: 50,
    lose: 40
  },
  guest1: {
    username: "guest1",
    password: "123",
    nickname: "beep",
    gender: 0,
    cash: 9999999,
    imgnumber: 4,
    win: 999,
    lose: 0
  },
  guest2: {
    username: "guest2",
    password: "123",
    nickname: "boop",
    gender: 0,
    cash: 999,
    imgnumber: 5,
    win: 0,
    lose: 999
  }
};

let users = {};

function profile(user, socket) {
  socket.emit("resp_userinfo", {
    nickname: userbase[user].nickname,
    gender: userbase[user].gender,
    cash: userbase[user].cash,
    imgnumber: userbase[user].imgnumber,
    win: userbase[user].win,
    lose: userbase[user].lose
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
  } else users[data.user] = { sid: socket.id, rooms: [] };
  socket.emit("resp_login", { sid: socket.id, retcode: 0 });
}

function updateSocket(user, socket, sid, games) {
  console.log(games);
  users[user].rooms.forEach(room => {
    games[room].slots.forEach(slot => {
      if (slot.user === user) {
        slot.sid = sid;
      }
    });
    socket.join(room);
  });
  users[user].sid = sid;
}

module.exports = {
  userbase: userbase,
  users: users,
  profile: profile,
  login: login
};
