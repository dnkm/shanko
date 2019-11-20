var game = require("./libraries/game");
var user = require("./libraries/user");
var app = require("express")();
var http = require("http").createServer(app);
var io = require("socket.io")(http, { pingInterval: 2000, pingTimeout: 5000 });

app.get("/", (req, res) => res.sendFile(__dirname + "/index.html"));

io.on("connection", socket => {
  console.log("user " + socket.id + " has connected");
  socket.on("disconnect", () => console.log("user has disconnected"));

  // login sockets
  socket.on("rqst_login", data => user.login(data, socket, game.games));
  socket.on("rqst_userinfo", () => user.profile(socket));

  // main lobby sockets
  socket.on("rqst_rooms", () => socket.emit("resp_rooms", game.rooms));
  socket.on("rqst_join", data => game.join(data, socket, io));

  // game sockets
});

http.listen(8080, () => console.log("server started"));
