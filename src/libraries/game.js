var config = require("../utils/config");
var user = require("./user");

const SLOT = {
  occupied: false,
  user: undefined,
  dealer: false,
  active: false,
  sid: undefined
};

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

let games = {};
let rooms = {
  [config.RANKS[0]]: populateRooms("RANK1"),
  [config.RANKS[1]]: populateRooms("RANK2"),
  [config.RANKS[2]]: populateRooms("RANK3"),
  [config.RANKS[3]]: populateRooms("RANK4"),
  [config.RANKS[4]]: populateRooms("RANK5")
};
let timers = {};

function join(data, socket, io) {
  if (
    rooms[data.rank][data.room].players > config.MAXPLAYERS - 1 ||
    user.users[data.user] === undefined
  )
    return;
  if (games[data.room] === undefined) {
    createGame(data.room);
  }
  if (games[data.room].players[data.user] === undefined) {
    socket.join(data.room);
    games[data.room].players[data.user] = newPlayer(data.user);
    findSlot(data, socket.id);
    user.users[data.user].room = data.room;
    rooms[data.rank][data.room].players++;
    rooms[data.rank][data.room].status = "waiting";
  }
  io.to(data.room).emit("resp_join", games[data.room]);
  if (
    rooms[data.rank][data.room].players > 1 &&
    timers[data.room] === undefined
  )
    timers[data.room] = setTimeout(() => start(data, io), 10000);
  if (rooms[data.rank][data.room].players === config.MAXPLAYERS) {
    clearTimeout(timers[data.room]);
    start(data.room, io);
  }
}

function start(data, io) {
  console.log(data.rank + data.room + " playing");
  timers[data.room] = setTimeout(() => end(data, io), 10000);
  rooms[data.rank][data.room].status = "playing";
  games[data.room].state = "playing";
  io.to(data.room).emit("start", { room: games[data.room] });
}

function end(data, io) {
  console.log(data.rank + data.room + " waiting");
  timers[data.room] = setTimeout(() => start(data, io), 10000);
  rooms[data.rank][data.room].status = "waiting";
  games[data.room].state = "waiting";
  cleanup(data, io);
  if (rooms[data.rank][data.room].players < 2) clearTimeout(timers[data.room]);
  io.to(data.room).emit("end", { room: games[data.room] });
}

function cleanup(data, io) {
  games[data.room].slots.forEach((slot, i) => {
    if (io.sockets.sockets[slot.sid] === undefined && slot.user !== undefined) {
      delete user.users[slot.user];
      delete games[data.room].players[slot.user];
      games[data.room].slots[i] = { ...SLOT };
      rooms[data.rank][data.room].players--;
    }
  });
}

function newPlayer(user) {
  return {
    user: user,
    hand: [],
    hidden: true,
    score: 0,
    banker: false,
    result: undefined
  };
}

function findSlot(data, sid) {
  for (let i = 0; i < games[data.room].slots.length; i++) {
    if (!games[data.room].slots[i].occupied) {
      games[data.room].slots[i].user = data.user;
      games[data.room].slots[i].occupied = true;
      games[data.room].slots[i].sid = sid;
      break;
    }
  }
}

function createGame(room) {
  games[room] = {
    slots: new Array(config.MAXPLAYERS).fill(0).map(slot => {
      return { ...SLOT };
    }),
    players: {},
    state: "waiting"
  };
}

function populateRooms(rank) {
  let keys = new Array(config[rank].ROOMS_1 + config[rank].ROOMS_2)
    .fill(0)
    .map((v, i) => config[rank].ROOM_NUM + i);
  let rooms = {};
  keys.forEach((key, i) => {
    rooms[key] = {
      players: 0,
      bank:
        i >= config[rank].ROOMS_1 ? config[rank].BANK_2 : config[rank].BANK_1,
      status: "open",
      timer: undefined
    };
  });
  return rooms;
}

module.exports = {
  games: games,
  rooms: rooms,
  join: join
};
