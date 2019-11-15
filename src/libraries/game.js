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
let rooms = {};

function join(data, socket, io) {
  if (rooms[data.room].players > config.MAXPLAYERS - 1) return;
  if (games[data.room].players[data.user] === undefined) {
    socket.join(data.room);
    games[data.room].players[data.user] = newPlayer(data.user);
    findSlot(data, socket.id);
    user.users[data.user].rooms.push(data.room);
    rooms[data.room].players++;
  }
  io.to(data.room).emit("resp_join", games[data.room]);
  if (rooms[data.room].players > 1 && rooms[data.room].timeout === undefined)
    rooms[data.room].timer = setTimeout(() => start(data.room, io), 10000);
  if (rooms[data.room].players === config.MAXPLAYERS) {
    clearTimeout(rooms[data.room].timeout);
    start(data.room, io);
  }
}

function available(user) {
  let keys = Object.keys(rooms);
  for (let i = 0; i < keys.length; i++) {
    if (
      rooms[keys[i]].players < config.MAXPLAYERS &&
      games[keys[i]].players[user] === undefined
    )
      return keys[i];
  }
  let room = "room" + Math.floor(Math.random() * 1000);
  while (rooms[room] !== undefined)
    room = "room" + Math.floor(Math.random() * 1000);
  rooms[room] = { players: 0, timeout: undefined };
  games[room] = {
    slots: new Array(config.MAXPLAYERS).fill(0).map(slot => {
      return { ...SLOT };
    }),
    players: {},
    state: "waiting",
    timer: undefined
  };
  return room;
}

function start(room, io) {
  console.log(room + " playing");
  rooms[room].timeout = setTimeout(() => end(room, io), 10000);
  games[room].state = "playing";
  io.to(room).emit("start", { room: games[room] });
}

function end(room, io) {
  console.log(room + " waiting");
  rooms[room].timeout = setTimeout(() => start(room, io), 10000);
  games[room].state = "waiting";
  cleanup(room, io);
  if (rooms[room].players < 2) clearTimeout(rooms[room].timeout);
  io.to(room).emit("end", { room: games[room] });
}

function cleanup(room, io) {
  games[room].slots.forEach((slot, i) => {
    if (io.sockets.sockets[slot.sid] === undefined && slot.user !== undefined) {
      delete user.users[slot.user];
      delete games[room].players[slot.user];
      games[room].slots[i] = { ...SLOT };
      rooms[room].players--;
    }
  });
}

function newPlayer(user) {
  return {
    user: user,
    hand: [],
    hidden: true,
    score: 0,
    dealer: false,
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

module.exports = {
  games: games,
  rooms: rooms,
  join: join,
  available: available
};
