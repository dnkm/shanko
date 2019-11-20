const config = {
  server: {
    login: "https://jff9b.sse.codesandbox.io/api/v1/login",
    signup: "https://jff9b.sse.codesandbox.io/api/v1/signup"
  },

  // room settings

  RANKS: ["rookie", "junior", "senior", "professional", "legend"],

  RANK1: {
    BALANCE: [1000, 20000],
    ROOMS_1: 40,
    ROOMS_2: 0,
    ROOM_NUM: 1001,
    BANK_1: 500,
    BANK_2: 0
  },

  RANK2: {
    BALANCE: [20000, 70000],
    ROOMS_1: 20,
    ROOMS_2: 20,
    ROOM_NUM: 2001,
    BANK_1: 500,
    BANK_2: 1000
  },

  RANK3: {
    BALANCE: [70000, 150000],
    ROOMS_1: 20,
    ROOMS_2: 20,
    ROOM_NUM: 3001,
    BANK_1: 1000,
    BANK_2: 2000
  },

  RANK4: {
    BALANCE: [150000, 300000],
    ROOMS_1: 20,
    ROOMS_2: 20,
    ROOM_NUM: 4001,
    BANK_1: 2000,
    BANK_2: 5000
  },

  RANK5: {
    BALANCE: [300000, Infinity],
    ROOMS_1: 20,
    ROOMS_2: 20,
    ROOM_NUM: 5001,
    BANK_1: 10000,
    BANK_2: 30000
  },

  // game settings

  MAXPLAYERS: 8
};

module.exports = config;
